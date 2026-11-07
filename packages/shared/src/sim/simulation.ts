import {
  GHOST_ABILITIES, GHOST_CAPTURE_RANGE, GHOST_ENERGY_MAX, GHOST_ENERGY_REGEN, GHOST_ENERGY_START,
  GHOST_HUNT_WARNING, GHOST_SPEED, canUseGhostAbility, freshReadyAt, spendGhostAbility, type GhostAbilityId,
} from '../data/abilities';
import { survivorById } from '../data/characters';
import {
  ANNOUNCEMENTS, DOCUMENTS, FUSE_VALUES, OBJECTIVES, PHONE_LINES, RADIO, REEL_TEXT, VOICE_DECEPTION_LINES, WHISPERS,
  logbookText, type ObjectiveId,
} from '../data/story';
import { PLATFORM_ZERO, REEL_CANDIDATES } from '../level/platformZero';
import {
  findPath, hasLineOfSight, inRect, navGraph, nearestNode, penetratesWalls, withinBounds, zoneAt,
  type DynamicBlockers, type NavGraph,
} from '../level/query';
import type { LevelDef } from '../level/types';
import { clamp, copyV, dist, dist2D, forwardFromYawPitch, v3, yawTowards, type Vec3 } from '../math';
import { Rng } from '../rng';
import { createDirectorState, selectHorrorEvent, type DirectorState } from './director';
import {
  FLAG_CROUCH, FLAG_FLASHLIGHT, FLAG_MOVING, FLAG_SPRINT,
  type GhostView, type MatchSummary, type Mode, type MoveInput, type SimEvent, type SurvivorView, type WorldSnapshot, type WorldView,
} from './types';

export interface SimOptions {
  seed: number;
  mode: Mode;
  /** horror intensity 0.5 (low) – 1.5 (high) */
  intensity?: number;
  level?: LevelDef;
  /** tests / tutorial: the AI Caller never moves or hunts */
  passiveGhost?: boolean;
}

interface Survivor extends SurvivorView {
  lastMoveAt: number;
  lastValid: Vec3;
  stunCharge: number;
  stunReadyAt: number;
  staminaFreeUntil: number;
  invulnUntil: number;
  exhaustedAt: number;
  sprintingSince: number;
  revivedBy: string | null;
  closeCallHunt: number;
  stats: { stuns: number; revives: number; hiddenCloseCalls: number };
}

interface Ghost extends GhostView {
  path: string[];
  targetId: string | null;
  lastKnown: Vec3 | null;
  lastSeenAt: number;
  pathAt: number;
  captureReadyAt: number;
  huntCooldownUntil: number;
  knownHiding: Record<string, number>;
  huntId: number;
  lastMoveAt: number;
}

interface Checkpoint {
  key: string;
  world: WorldView;
  threat: number;
  flashlights: Record<string, boolean>;
}

export interface InteractResult {
  ok: boolean;
  reason?: string;
}

const NOISE_RADIUS = { sprint: 16, walk: 6, crouch: 2 };
const HIDE_RANGE = 1.7;
const REVIVE_RANGE = 2.2;
const BLEEDOUT = 45;
const SOLO_GRACE = 100;
const MP_GRACE = 60;

export class MatchSimulation {
  readonly level: LevelDef;
  readonly mode: Mode;
  readonly intensity: number;
  readonly seed: number;
  readonly passiveGhost: boolean;
  time = 0;
  threat = 0;
  ended = false;
  result: MatchSummary | null = null;
  checkpointsUsed = 0;

  private rng: Rng;
  private nav: NavGraph;
  private survivors = new Map<string, Survivor>();
  private ghost: Ghost;
  private world: WorldView;
  private fuseSolution: number[];
  private digits: Record<string, number>;
  private order: string[];
  private director: DirectorState = createDirectorState();
  private directorAt = 0;
  private timers: { at: number; fn: () => void }[] = [];
  private events: SimEvent[] = [];
  private teleports = new Map<string, Vec3>();
  private checkpoint: Checkpoint | null = null;
  private started = false;
  private thirdCall = false;
  private allRoster: Map<string, { name: string; role: 'survivor' | 'ghost'; characterId: string }> = new Map();

  constructor(opts: SimOptions) {
    this.seed = opts.seed >>> 0;
    this.mode = opts.mode;
    this.intensity = clamp(opts.intensity ?? 1, 0.5, 1.5);
    this.level = opts.level ?? PLATFORM_ZERO;
    this.passiveGhost = !!opts.passiveGhost;
    this.rng = new Rng(this.seed);
    this.nav = navGraph(this.level);

    const kit = this.level.interactables.find((i) => i.id === 'flashlight_kit')!;
    const reelSpots = this.rng.shuffle(REEL_CANDIDATES).slice(0, 3);
    this.fuseSolution = [0, 1, 2, 3].map(() => this.rng.pick(FUSE_VALUES));
    this.digits = { reel_a: this.rng.int(1, 9), reel_b: this.rng.int(1, 9), reel_c: this.rng.int(1, 9) };
    this.order = this.rng.shuffle(['A', 'B', 'C']);

    this.world = {
      doors: Object.fromEntries(this.level.doors.map((d) => [d.id, { open: d.open, locked: !!d.lockedBy }])),
      lightsOff: {},
      power: false,
      inventory: [],
      collected: [],
      itemPos: {
        flashlight_kit: copyV(this.rng.pick(kit.candidates!)),
        reel_a: copyV(reelSpots[0]),
        reel_b: copyV(reelSpots[1]),
        reel_c: copyV(reelSpots[2]),
      },
      objectives: Object.fromEntries(OBJECTIVES.map((o) => [o.id, false])) as Record<ObjectiveId, boolean>,
      office: { logbook: false, drawer: false },
      fuse: { slots: [5, 5, 5, 5], solved: false, lockoutUntil: 0, clue: null },
      reelDigits: {},
      decodeOrder: null,
      keypadLockoutUntil: 0,
      decoded: false,
      exitOpenAt: 0,
      exitOpen: false,
      phoneRingingUntil: 0,
      notes: [],
      echoes: [],
    };

    this.ghost = {
      controllerId: null,
      name: 'The Caller',
      ghostId: 'caller',
      pos: copyV(this.level.ghostSpawn),
      yaw: Math.PI / 2,
      mode: 'roam',
      visible: false,
      energy: GHOST_ENERGY_START,
      readyAt: freshReadyAt(),
      huntUntil: 0,
      warnUntil: 0,
      stunUntil: 0,
      apparition: null,
      path: [],
      targetId: null,
      lastKnown: null,
      lastSeenAt: -99,
      pathAt: 0,
      captureReadyAt: 0,
      huntCooldownUntil: this.mode === 'solo' ? SOLO_GRACE : MP_GRACE,
      knownHiding: {},
      huntId: 0,
      lastMoveAt: 0,
    };
  }

  // ───────────────────────────── roster ─────────────────────────────

  addSurvivor(id: string, name: string, characterId: string) {
    const spawn = this.level.survivorSpawns[this.survivors.size % this.level.survivorSpawns.length];
    const s: Survivor = {
      id, name, characterId, pos: copyV(spawn), yaw: -Math.PI / 2, pitch: 0, flags: 0, stamina: 1, exhausted: false,
      status: 'alive', hiding: null, bleedout: 0, reviveProgress: 0, hasFlashlight: false, abilityReadyAt: 0,
      abilityActiveUntil: 0, noise: 0, connected: true, lastMoveAt: 0, lastValid: copyV(spawn), stunCharge: 0,
      stunReadyAt: 0, staminaFreeUntil: 0, invulnUntil: 0, exhaustedAt: -99, sprintingSince: 0, revivedBy: null,
      closeCallHunt: -1, stats: { stuns: 0, revives: 0, hiddenCloseCalls: 0 },
    };
    this.survivors.set(id, s);
    this.allRoster.set(id, { name, role: 'survivor', characterId });
    this.teleports.set(id, copyV(spawn));
  }

  setGhostController(id: string | null, name = 'The Caller') {
    this.ghost.controllerId = id;
    this.ghost.name = name;
    if (id) {
      this.allRoster.set(id, { name, role: 'ghost', characterId: this.ghost.ghostId });
      this.ghost.mode = 'roam';
      this.ghost.visible = false;
      this.teleports.set(id, copyV(this.ghost.pos));
    }
  }

  removePlayer(id: string) {
    if (this.ghost.controllerId === id) {
      this.ghost.controllerId = null; // AI takes over the Caller
      this.ghost.path = [];
      return;
    }
    this.survivors.delete(id);
    this.checkEnd();
  }

  setConnected(id: string, connected: boolean) {
    const s = this.survivors.get(id);
    if (s) s.connected = connected;
  }

  hasSurvivor(id: string) {
    return this.survivors.has(id);
  }

  isGhost(id: string) {
    return this.ghost.controllerId === id;
  }

  // ───────────────────────────── event plumbing ─────────────────────────────

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  drainTeleports(): Map<string, Vec3> {
    const t = this.teleports;
    this.teleports = new Map();
    return t;
  }

  private emit(e: SimEvent) {
    this.events.push(e);
  }

  private survivorIds() {
    return [...this.survivors.keys()];
  }

  private after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  private blockers(): DynamicBlockers {
    return {
      closedDoors: Object.entries(this.world.doors).filter(([, d]) => !d.open).map(([id]) => id),
      exitOpen: this.world.exitOpen,
    };
  }

  // ───────────────────────────── movement ─────────────────────────────

  applyMove(id: string, m: MoveInput): boolean {
    if (this.ended) return false;
    if (![m.x, m.y, m.z, m.yaw, m.pitch, m.flags].every(Number.isFinite)) return false;
    if (this.ghost.controllerId === id) return this.applyGhostMove(m);
    const s = this.survivors.get(id);
    if (!s) return false;
    s.yaw = m.yaw;
    s.pitch = clamp(m.pitch, -1.5, 1.5);
    s.flags = m.flags & 0xff;
    if (!s.hasFlashlight) s.flags &= ~FLAG_FLASHLIGHT;
    if (s.status !== 'alive' || s.hiding) {
      s.flags &= ~(FLAG_MOVING | FLAG_SPRINT);
      return false;
    }
    const p = { x: m.x, y: m.y, z: m.z };
    const elapsed = Math.max(this.time - s.lastMoveAt, 0.05);
    const stats = survivorById(s.characterId).stats;
    const sprintOk = !s.exhausted || this.time - s.exhaustedAt < 0.6;
    const speed = (s.flags & FLAG_SPRINT) && sprintOk ? stats.sprint : stats.walk;
    const horiz = dist2D(p, s.lastValid);
    const rise = p.y - s.lastValid.y;
    const blockers = this.blockers();
    const ok =
      withinBounds(this.level, p) &&
      horiz <= speed * 1.3 * elapsed + 0.4 &&
      rise <= 3 * elapsed + 0.5 &&
      (!penetratesWalls(this.level, p, 0.12, blockers) || penetratesWalls(this.level, s.lastValid, 0.12, blockers));
    if (!ok) {
      this.teleports.set(id, copyV(s.lastValid));
      return false;
    }
    if (!(s.flags & FLAG_SPRINT) || !sprintOk) s.flags &= ~FLAG_SPRINT;
    s.pos = p;
    s.lastValid = copyV(p);
    s.lastMoveAt = this.time;
    return true;
  }

  private applyGhostMove(m: MoveInput): boolean {
    const g = this.ghost;
    const p = { x: m.x, y: m.y, z: m.z };
    g.yaw = m.yaw;
    if (g.mode === 'stunned') {
      this.teleports.set(g.controllerId!, copyV(g.pos));
      return false;
    }
    const elapsed = Math.max(this.time - g.lastMoveAt, 0.05);
    const speed = g.mode === 'hunt' ? GHOST_SPEED.hunt : GHOST_SPEED.roam;
    const ok =
      withinBounds(this.level, p) &&
      dist2D(p, g.pos) <= speed * 1.3 * elapsed + 0.4 &&
      p.y - g.pos.y <= 3 * elapsed + 0.5 &&
      // the Caller passes through doors, never through walls or the sealed gate
      (!penetratesWalls(this.level, p, 0.12, this.blockers(), true) || penetratesWalls(this.level, g.pos, 0.12, this.blockers(), true));
    if (!ok) {
      this.teleports.set(g.controllerId!, copyV(g.pos));
      return false;
    }
    g.pos = p;
    g.lastMoveAt = this.time;
    return true;
  }

  // ───────────────────────────── interactions ─────────────────────────────

  private near(s: Survivor, pos: Vec3, radius: number) {
    return dist({ x: s.pos.x, y: s.pos.y + 1.0, z: s.pos.z }, pos) <= radius + 0.6;
  }

  private itemPos(id: string): Vec3 | undefined {
    if (this.world.itemPos[id]) return this.world.itemPos[id];
    return this.level.interactables.find((i) => i.id === id)?.pos;
  }

  interact(id: string, targetId: string): InteractResult {
    const s = this.survivors.get(id);
    if (!s || this.ended) return { ok: false, reason: 'Not a survivor' };
    if (s.status !== 'alive') return { ok: false, reason: 'Incapacitated' };
    const msg = (text: string, tone: 'info' | 'warn' | 'good' = 'info') => this.emit({ type: 'message', text, tone, to: [id] });
    const fail = (reason: string) => {
      msg(reason, 'warn');
      return { ok: false, reason };
    };

    // hiding toggles
    if (s.hiding) {
      if (targetId !== s.hiding && targetId !== 'unhide') return { ok: false, reason: 'Hidden' };
      return this.unhide(s);
    }
    const spot = this.level.hidingSpots.find((h) => h.id === targetId);
    if (spot) {
      if (dist2D(s.pos, spot.entry) > HIDE_RANGE || Math.abs(s.pos.y - spot.entry.y) > 1.2) return fail('Too far away');
      if ([...this.survivors.values()].some((o) => o.hiding === spot.id)) return fail('Someone is already hiding there');
      s.hiding = spot.id;
      s.flags = 0;
      const g = this.ghost;
      if ((g.visible || g.mode === 'warn') && dist(g.pos, s.pos) < 11 && hasLineOfSight(this.level, g.pos, s.pos, this.blockers())) {
        g.knownHiding[spot.id] = this.time + 20;
      }
      this.emit({ type: 'sfx', sound: 'hide', pos: copyV(spot.entry) });
      return { ok: true };
    }

    const door = this.level.doors.find((d) => d.id === targetId);
    if (door) {
      const c = v3((door.gap.minX + door.gap.maxX) / 2, 1, (door.gap.minZ + door.gap.maxZ) / 2);
      if (!this.near(s, c, 1.9)) return fail('Too far away');
      const st = this.world.doors[door.id];
      if (st.locked) {
        if (door.lockedBy && this.world.inventory.includes(door.lockedBy)) {
          st.locked = false;
          st.open = true;
          this.emit({ type: 'sfx', sound: 'unlock', pos: c });
          msg('Unlocked with the maintenance key.', 'good');
          return { ok: true };
        }
        this.emit({ type: 'sfx', sound: 'locked', pos: c, to: [id] });
        return fail('Locked. A key is needed.');
      }
      if (st.open && this.someoneInGap(door.gap)) return fail('Something is in the way');
      st.open = !st.open;
      this.emit({ type: 'sfx', sound: st.open ? 'door_open' : 'door_close', pos: c });
      return { ok: true };
    }

    const def = this.level.interactables.find((i) => i.id === targetId);
    if (!def) return { ok: false, reason: 'Unknown target' };
    const pos = this.itemPos(def.id);
    if (!pos || !this.near(s, pos, def.radius)) return fail('Too far away');
    const w = this.world;

    switch (def.kind) {
      case 'flashlight_kit': {
        if (s.hasFlashlight) return fail('You already have a flashlight.');
        s.hasFlashlight = true;
        s.flags |= FLAG_FLASHLIGHT;
        this.emit({ type: 'pickup', item: 'flashlight', label: 'Flashlight', detail: 'Press F to toggle. Hold the beam on the Caller during a hunt to stun it.', to: [id] });
        this.emit({ type: 'sfx', sound: 'pickup', pos });
        this.complete('flashlight');
        return { ok: true };
      }
      case 'logbook': {
        w.office.logbook = true;
        w.fuse.clue = [...this.fuseSolution];
        this.emit({ type: 'doc', docId: 'logbook', title: "Station master's logbook", body: logbookText(this.fuseSolution), to: [id] });
        this.emit({ type: 'sfx', sound: 'paper', pos });
        if (w.office.drawer) this.complete('office');
        return { ok: true };
      }
      case 'drawer': {
        if (w.office.drawer) return fail('The drawer is empty.');
        w.office.drawer = true;
        w.inventory.push('maintenance_key');
        this.emit({ type: 'pickup', item: 'maintenance_key', label: 'Maintenance key', detail: 'A brass key on a tag: MAINT. RM.', to: [id] });
        this.emit({ type: 'sfx', sound: 'pickup', pos });
        if (w.office.logbook) this.complete('office');
        else msg('There might be more in this office. The logbook on the desk?');
        return { ok: true };
      }
      case 'phone': {
        if (w.phoneRingingUntil > this.time) {
          w.phoneRingingUntil = 0;
          this.threat = clamp(this.threat + 3, 0, 100);
          this.emit({ type: 'phone', text: this.rng.pick(PHONE_LINES), to: [id] });
          return { ok: true };
        }
        return fail('The line is dead. You can hear breathing anyway.');
      }
      case 'reel': {
        if (w.collected.includes(def.id)) return fail('Already taken.');
        w.collected.push(def.id);
        w.inventory.push(def.id);
        w.reelDigits[def.id] = this.digits[def.id];
        this.emit({ type: 'pickup', item: def.id, label: def.label, detail: REEL_TEXT[def.id](this.digits[def.id]) });
        this.emit({ type: 'sfx', sound: 'tape', pos });
        this.threat = clamp(this.threat + 4, 0, 100);
        if (['reel_a', 'reel_b', 'reel_c'].every((r) => w.collected.includes(r))) this.complete('reels');
        return { ok: true };
      }
      case 'fuse_box': {
        if (w.power) return fail('The mains are already live.');
        this.emit({ type: 'puzzle', puzzle: 'fuse', to: [id] });
        return { ok: true };
      }
      case 'pa_console': {
        if (!w.power) return fail('The console is dead. No power.');
        if (w.decoded) return fail('The announcement has already been decoded.');
        if (!w.objectives.reels) return fail('You need all three reels to decode the announcement.');
        this.emit({ type: 'puzzle', puzzle: 'keypad', to: [id] });
        return { ok: true };
      }
      case 'exit_gate': {
        if (w.exitOpen) return fail('The gate is open. Run.');
        if (w.exitOpenAt) return fail('The motor is dragging the gate open...');
        if (!w.decoded) return fail(w.power ? 'The gate motor is locked by the announcement system.' : 'The gate motor has no power.');
        w.exitOpenAt = this.time + 6;
        this.emit({ type: 'sfx', sound: 'gate_motor', pos });
        this.emit({ type: 'message', text: 'The gate motor groans. Something heard it.', tone: 'warn' });
        this.forceHunt(26);
        return { ok: true };
      }
      case 'note': {
        if (!w.notes.includes(def.id)) w.notes.push(def.id);
        const doc = DOCUMENTS[def.id];
        this.emit({ type: 'doc', docId: def.id, title: doc.title, body: doc.body, to: [id] });
        this.emit({ type: 'sfx', sound: 'paper', pos });
        return { ok: true };
      }
    }
    return { ok: false };
  }

  private unhide(s: Survivor): InteractResult {
    const spot = this.level.hidingSpots.find((h) => h.id === s.hiding);
    s.hiding = null;
    if (spot) {
      s.pos = copyV(spot.entry);
      s.lastValid = copyV(spot.entry);
      this.teleports.set(s.id, copyV(spot.entry));
      this.emit({ type: 'sfx', sound: 'unhide', pos: copyV(spot.entry) });
    }
    return { ok: true };
  }

  private someoneInGap(gap: { minX: number; minZ: number; maxX: number; maxZ: number }) {
    const pad = { minX: gap.minX - 0.6, minZ: gap.minZ - 0.6, maxX: gap.maxX + 0.6, maxZ: gap.maxZ + 0.6 };
    return [...this.survivors.values()].some((o) => o.status === 'alive' && inRect(o.pos, pad) && o.pos.y > -1);
  }

  // ───────────────────────────── puzzles ─────────────────────────────

  private nearPuzzle(s: Survivor, id: 'fuse_box' | 'pa_console') {
    const def = this.level.interactables.find((i) => i.id === id)!;
    return this.near(s, def.pos!, def.radius + 0.5);
  }

  fuseSet(id: string, slot: number, value: number): InteractResult {
    const s = this.survivors.get(id);
    const f = this.world.fuse;
    if (!s || s.status !== 'alive' || !this.nearPuzzle(s, 'fuse_box')) return { ok: false, reason: 'Not at the fuse box' };
    if (f.solved || !Number.isInteger(slot) || slot < 0 || slot > 3) return { ok: false, reason: 'Invalid slot' };
    if (!(FUSE_VALUES as readonly number[]).includes(value)) return { ok: false, reason: 'Invalid fuse' };
    f.slots[slot] = value;
    return { ok: true };
  }

  fuseSubmit(id: string): InteractResult {
    const s = this.survivors.get(id);
    const f = this.world.fuse;
    if (!s || s.status !== 'alive' || !this.nearPuzzle(s, 'fuse_box')) return { ok: false, reason: 'Not at the fuse box' };
    if (f.solved) return { ok: false, reason: 'Already solved' };
    if (f.lockoutUntil > this.time) return { ok: false, reason: 'The breaker is still tripped' };
    const pos = this.level.interactables.find((i) => i.id === 'fuse_box')!.pos!;
    if (f.slots.every((v, i) => v === this.fuseSolution[i])) {
      f.solved = true;
      this.world.power = true;
      this.emit({ type: 'sfx', sound: 'power_up', pos });
      this.emit({ type: 'power_on' });
      this.complete('power');
      this.world.decodeOrder = null;
      this.after(4, () => {
        this.world.decodeOrder = [...this.order];
        this.emit({ type: 'announcement', text: ANNOUNCEMENTS.decodeOrder(this.order) });
      });
      return { ok: true };
    }
    f.lockoutUntil = this.time + 6;
    this.threat = clamp(this.threat + 6, 0, 100);
    this.alertGhost(pos);
    this.emit({ type: 'sfx', sound: 'spark', pos });
    this.emit({ type: 'message', text: 'Sparks. The breaker trips. That was loud.', tone: 'warn', to: [id] });
    return { ok: false, reason: 'Wrong combination' };
  }

  keypadSubmit(id: string, code: string): InteractResult {
    const s = this.survivors.get(id);
    const w = this.world;
    if (!s || s.status !== 'alive' || !this.nearPuzzle(s, 'pa_console')) return { ok: false, reason: 'Not at the console' };
    if (!w.power || !w.objectives.reels || w.decoded) return { ok: false, reason: 'Console unavailable' };
    if (w.keypadLockoutUntil > this.time) return { ok: false, reason: 'Console locked' };
    if (typeof code !== 'string' || !/^\d{3}$/.test(code)) return { ok: false, reason: 'Enter three digits' };
    const pos = this.level.interactables.find((i) => i.id === 'pa_console')!.pos!;
    const expected = this.order.map((l) => this.digits[`reel_${l.toLowerCase()}`]).join('');
    if (code === expected) {
      w.decoded = true;
      this.emit({ type: 'sfx', sound: 'keypad_ok', pos });
      this.emit({ type: 'announcement', text: 'Platform Zero is now closed. Thank you for travelling with us.' });
      this.complete('decode');
      return { ok: true };
    }
    w.keypadLockoutUntil = this.time + 5;
    this.threat = clamp(this.threat + 5, 0, 100);
    this.alertGhost(pos);
    this.emit({ type: 'sfx', sound: 'keypad_fail', pos });
    this.emit({ type: 'announcement', text: 'Incorrect. Incorrect. Please wait where you are.', garbled: true });
    return { ok: false, reason: 'Wrong code' };
  }

  private complete(id: ObjectiveId) {
    if (this.world.objectives[id]) return;
    this.world.objectives[id] = true;
    this.emit({ type: 'objective', id });
    this.threat = clamp(this.threat + 5, 0, 100);
    const line = {
      flashlight: RADIO.afterFlashlight, office: RADIO.afterOffice, power: RADIO.afterPower, decode: RADIO.afterDecode,
    }[id as 'flashlight' | 'office' | 'power' | 'decode'];
    if (line) this.after(2.5, () => this.emit({ type: 'radio', ...line, to: this.survivorIds() }));
    if (this.mode === 'solo' && id !== 'escape') {
      this.checkpoint = {
        key: id === 'exit' ? 'exit' : id,
        world: structuredClone(this.world),
        threat: this.threat,
        flashlights: Object.fromEntries([...this.survivors.values()].map((s) => [s.id, s.hasFlashlight])),
      };
      this.emit({ type: 'checkpoint', key: id });
    }
  }

  // ───────────────────────────── abilities ─────────────────────────────

  useSurvivorAbility(id: string): InteractResult {
    const s = this.survivors.get(id);
    if (!s || s.status !== 'alive') return { ok: false, reason: 'Unavailable' };
    const def = survivorById(s.characterId).ability;
    if (def.id === 'none') return { ok: false, reason: 'No ability' };
    if (s.abilityReadyAt > this.time) {
      this.emit({ type: 'ability', ability: def.id, ok: false, reason: 'Cooling down', to: [id] });
      return { ok: false, reason: 'Cooling down' };
    }
    s.abilityReadyAt = this.time + def.cooldown;
    s.abilityActiveUntil = this.time + def.duration;
    if (def.id === 'echo_sense') {
      const points: { pos: Vec3; kind: 'ghost' | 'echo' | 'apparition' }[] = [];
      if (dist(this.ghost.pos, s.pos) < 45) points.push({ pos: copyV(this.ghost.pos), kind: 'ghost' });
      for (const e of this.world.echoes) if (e.until > this.time) points.push({ pos: copyV(e.pos), kind: 'echo' });
      if (this.ghost.apparition && this.ghost.apparition.until > this.time) points.push({ pos: copyV(this.ghost.apparition.pos), kind: 'apparition' });
      this.emit({ type: 'echo_sense', points, duration: def.duration, to: [id] });
    } else if (def.id === 'adrenaline') {
      s.stamina = 1;
      s.exhausted = false;
      s.staminaFreeUntil = this.time + def.duration;
    }
    this.emit({ type: 'ability', ability: def.id, ok: true, to: [id] });
    return { ok: true };
  }

  ghostAbility(id: string, ability: GhostAbilityId, target?: Vec3, targetPlayer?: string): InteractResult {
    const g = this.ghost;
    if (g.controllerId !== id || this.ended) return { ok: false, reason: 'Not the ghost' };
    const reply = (ok: boolean, reason?: string) => {
      this.emit({ type: 'ability', ability, ok, reason, to: [id] });
      return { ok, reason };
    };
    const check = canUseGhostAbility(g, ability, this.time);
    if (!check.ok) return reply(false, check.reason);
    const def = GHOST_ABILITIES[ability];
    const validPoint = (p: Vec3 | undefined): p is Vec3 =>
      !!p && [p.x, p.y, p.z].every(Number.isFinite) && dist(p, g.pos) <= def.range + 0.5 && Math.abs(p.y - g.pos.y) < 2.5 &&
      withinBounds(this.level, p) && !penetratesWalls(this.level, p, 0.2, this.blockers(), true);

    switch (ability) {
      case 'voice': {
        const victim = (targetPlayer && this.survivors.get(targetPlayer)) || this.nearestSurvivor(g.pos, def.range);
        if (!victim || victim.status !== 'alive' || dist(victim.pos, g.pos) > def.range) return reply(false, 'No survivor in range');
        const others = [...this.survivors.values()].filter((o) => o.id !== victim.id);
        const speaker = others.length ? this.rng.pick(others).name : 'DEV (archive liaison)';
        const line = this.rng.pick(VOICE_DECEPTION_LINES).replace('{name}', speaker);
        const [who, ...rest] = line.split(': ');
        this.emit({ type: 'radio', speaker: who, text: rest.join(': '), fake: true, to: [victim.id] });
        break;
      }
      case 'apparition': {
        if (!validPoint(target)) return reply(false, 'Invalid location');
        const near = this.nearestSurvivor(target, 30);
        const yaw = near ? yawTowards(target, near.pos) : g.yaw;
        g.apparition = { pos: copyV(target), yaw, until: this.time + def.duration };
        this.emit({ type: 'apparition', pos: copyV(target), yaw, duration: def.duration, to: this.survivorIds() });
        for (const s of this.survivors.values()) {
          if (s.status === 'alive' && !s.hiding && dist(s.pos, target) < 15 && hasLineOfSight(this.level, s.pos, target, this.blockers())) {
            s.stamina = Math.max(0, s.stamina - 0.3);
          }
        }
        break;
      }
      case 'blackout': {
        const lights = this.level.lights.filter((l) => dist(l.pos, g.pos) <= def.range + 3).map((l) => l.id);
        if (!lights.length) return reply(false, 'No lights nearby');
        for (const l of lights) this.world.lightsOff[l] = this.time + def.duration;
        this.emit({ type: 'flicker', lights, duration: 0.8 });
        break;
      }
      case 'echo': {
        if (!validPoint(target)) return reply(false, 'Invalid location');
        const sound = this.rng.chance(0.6) ? 'footsteps' : 'phone';
        this.world.echoes.push({ pos: copyV(target), until: this.time + def.duration, sound });
        break;
      }
      case 'hunt': {
        g.mode = 'warn';
        g.warnUntil = this.time + GHOST_HUNT_WARNING;
        this.emit({ type: 'hunt', phase: 'warning' });
        this.flickerNear(g.pos, 18, GHOST_HUNT_WARNING);
        break;
      }
    }
    spendGhostAbility(g, ability, this.time);
    return reply(true);
  }

  ghostCapture(id: string): InteractResult {
    const g = this.ghost;
    if (g.controllerId !== id || g.mode !== 'hunt') return { ok: false, reason: 'Not hunting' };
    if (g.captureReadyAt > this.time) return { ok: false, reason: 'Recovering' };
    const victim = this.capturable(GHOST_CAPTURE_RANGE);
    if (!victim) {
      g.captureReadyAt = this.time + 1.2;
      return { ok: false, reason: 'Missed' };
    }
    this.captureSurvivor(victim);
    return { ok: true };
  }

  /** survivor that the ghost could take right now */
  private capturable(range: number): Survivor | null {
    const g = this.ghost;
    let best: Survivor | null = null;
    let bd = Infinity;
    for (const s of this.survivors.values()) {
      if (s.status !== 'alive' || s.invulnUntil > this.time) continue;
      if (s.hiding) {
        const spot = this.level.hidingSpots.find((h) => h.id === s.hiding)!;
        const known = (g.knownHiding[spot.id] ?? 0) > this.time;
        const d = dist2D(g.pos, spot.entry);
        if (known && d < range + 0.2 && d < bd) {
          best = s;
          bd = d;
        }
        continue;
      }
      const d = dist2D(g.pos, s.pos);
      if (d < range && Math.abs(g.pos.y - s.pos.y) < 1.3 && d < bd && hasLineOfSight(this.level, g.pos, s.pos, this.blockers())) {
        best = s;
        bd = d;
      }
    }
    return best;
  }

  private captureSurvivor(s: Survivor) {
    const g = this.ghost;
    if (s.hiding) this.unhide(s);
    const othersStanding = [...this.survivors.values()].some((o) => o.id !== s.id && o.status === 'alive');
    if (this.mode === 'solo' || !othersStanding) {
      s.status = 'captured';
      this.emit({ type: 'player', what: 'captured', playerId: s.id, name: s.name });
    } else {
      s.status = 'downed';
      s.bleedout = BLEEDOUT;
      s.reviveProgress = 0;
      this.emit({ type: 'player', what: 'downed', playerId: s.id, name: s.name });
    }
    this.emit({ type: 'sfx', sound: 'capture', pos: copyV(s.pos) });
    s.flags = 0;
    // after taking someone the Caller withdraws: no camping
    g.huntUntil = Math.min(g.huntUntil, this.time + 1.5);
    g.captureReadyAt = this.time + 3;
    g.targetId = null;
    this.checkEnd();
  }

  // ───────────────────────────── revive / chat ─────────────────────────────

  reviveStart(id: string, targetId: string): InteractResult {
    const r = this.survivors.get(id);
    const t = this.survivors.get(targetId);
    if (!r || !t || r.status !== 'alive' || r.hiding || t.status !== 'downed') return { ok: false, reason: 'Cannot revive' };
    if (dist(r.pos, t.pos) > REVIVE_RANGE) return { ok: false, reason: 'Too far away' };
    t.revivedBy = id;
    return { ok: true };
  }

  reviveStop(id: string) {
    for (const s of this.survivors.values()) if (s.revivedBy === id) s.revivedBy = null;
  }

  chat(id: string, raw: string): InteractResult {
    const s = this.survivors.get(id);
    if (!s || typeof raw !== 'string') return { ok: false };
    // eslint-disable-next-line no-control-regex
    const text = raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 120);
    if (!text) return { ok: false };
    this.emit({ type: 'chat', from: s.name, fromId: id, text, to: this.survivorIds() });
    return { ok: true };
  }

  // ───────────────────────────── checkpoints (solo) ─────────────────────────────

  canRetry() {
    return this.mode === 'solo' && this.ended;
  }

  retryFromCheckpoint(): boolean {
    if (!this.canRetry()) return false;
    const cp = this.checkpoint;
    const key = cp?.key ?? 'start';
    if (cp) {
      this.world = structuredClone(cp.world);
      this.threat = Math.max(0, cp.threat - 10);
    } else {
      // no checkpoint yet: restart progress, keep layout
      const fresh = new MatchSimulation({ seed: this.seed, mode: this.mode, intensity: this.intensity, level: this.level });
      this.world = fresh.world;
      this.threat = 0;
    }
    this.world.echoes = [];
    this.world.lightsOff = {};
    this.world.exitOpenAt = this.world.exitOpen ? this.world.exitOpenAt : 0;
    const spawn = this.level.checkpoints[key] ?? this.level.checkpoints.start;
    for (const s of this.survivors.values()) {
      Object.assign(s, {
        status: 'alive', hiding: null, stamina: 1, exhausted: false, bleedout: 0, reviveProgress: 0,
        hasFlashlight: cp ? (cp.flashlights[s.id] ?? s.hasFlashlight) : false, invulnUntil: this.time + 4,
      });
      s.pos = copyV(spawn);
      s.lastValid = copyV(spawn);
      s.lastMoveAt = this.time;
      this.teleports.set(s.id, copyV(spawn));
    }
    const g = this.ghost;
    Object.assign(g, {
      pos: copyV(this.level.ghostSpawn), mode: 'roam', visible: false, huntUntil: 0, warnUntil: 0, stunUntil: 0,
      apparition: null, path: [], targetId: null, lastKnown: null, knownHiding: {}, huntCooldownUntil: this.time + 45,
    });
    this.thirdCall = false;
    this.ended = false;
    this.result = null;
    this.timers = [];
    this.director.lastEventAt = this.time;
    this.checkpointsUsed++;
    this.emit({ type: 'message', text: 'Checkpoint restored.', tone: 'info' });
    return true;
  }

  // ───────────────────────────── main tick ─────────────────────────────

  tick(dt: number) {
    if (this.ended) return;
    dt = clamp(dt, 0, 0.25);
    if (!this.started) {
      this.started = true;
      const name = [...this.survivors.values()][0]?.name ?? 'passenger';
      this.emit({ type: 'announcement', text: ANNOUNCEMENTS.arrival(name) });
      RADIO.intro.forEach((l, i) => this.after(9 + i * 7, () => this.emit({ type: 'radio', ...l, to: this.survivorIds() })));
    }
    this.time += dt;

    for (const t of this.timers.filter((t) => t.at <= this.time)) t.fn();
    this.timers = this.timers.filter((t) => t.at > this.time);

    const progress = Object.values(this.world.objectives).filter(Boolean).length;
    this.threat = clamp(this.threat + dt * (0.05 + 0.015 * progress) * this.intensity, 0, 100);
    if (this.threat >= 100 && !this.thirdCall) {
      this.thirdCall = true;
      this.emit({ type: 'announcement', text: 'This is the third call. This is the third call.', garbled: true });
      this.forceHunt(9999);
    }

    this.updateSurvivors(dt);
    this.updateGhost(dt);
    this.updateFlashlightStuns(dt);

    const w = this.world;
    if (w.exitOpenAt && !w.exitOpen && this.time >= w.exitOpenAt) {
      w.exitOpen = true;
      this.complete('exit');
      this.emit({ type: 'message', text: 'The gate is open!', tone: 'good' });
    }
    w.echoes = w.echoes.filter((e) => e.until > this.time);
    for (const [k, until] of Object.entries(w.lightsOff)) if (until <= this.time) delete w.lightsOff[k];
    if (this.ghost.apparition && this.ghost.apparition.until <= this.time) this.ghost.apparition = null;

    if (this.time >= this.directorAt) {
      this.directorAt = this.time + 1;
      this.runDirector(progress);
    }
    this.checkEnd();
  }

  private updateSurvivors(dt: number) {
    for (const s of this.survivors.values()) {
      const stats = survivorById(s.characterId).stats;
      if (s.status === 'alive' && !s.hiding) {
        const moving = !!(s.flags & FLAG_MOVING);
        const sprinting = moving && !!(s.flags & FLAG_SPRINT) && !s.exhausted;
        if (sprinting && this.time >= s.staminaFreeUntil) s.stamina -= dt / stats.sprintSeconds;
        else if (!sprinting) s.stamina += dt * (moving ? 0.1 : 0.16);
        if (s.stamina <= 0) {
          s.stamina = 0;
          if (!s.exhausted) s.exhaustedAt = this.time;
          s.exhausted = true;
        }
        if (s.exhausted && s.stamina > 0.35) s.exhausted = false;
        s.stamina = clamp(s.stamina, 0, 1);
        s.noise = !moving ? 0 : sprinting ? 1 : s.flags & FLAG_CROUCH ? 0.12 : 0.35;
        if (this.world.exitOpen && inRect(s.pos, this.level.escapeZone) && s.pos.y > -0.5) {
          s.status = 'escaped';
          s.flags = 0;
          this.emit({ type: 'player', what: 'escaped', playerId: s.id, name: s.name });
          if (Object.values(this.world.objectives).filter(Boolean).length >= 6) this.complete('escape');
        }
      } else {
        s.noise = 0;
        if (s.hiding) s.stamina = clamp(s.stamina + dt * 0.12, 0, 1);
      }

      if (s.status === 'downed') {
        const r = s.revivedBy ? this.survivors.get(s.revivedBy) : null;
        if (r && r.status === 'alive' && !r.hiding && dist(r.pos, s.pos) <= REVIVE_RANGE + 0.3) {
          s.reviveProgress += dt / survivorById(r.characterId).stats.reviveSeconds;
          if (s.reviveProgress >= 1) {
            s.status = 'alive';
            s.reviveProgress = 0;
            s.revivedBy = null;
            s.stamina = 1;
            s.invulnUntil = this.time + 3;
            r.stats.revives++;
            this.emit({ type: 'player', what: 'revived', playerId: s.id, name: s.name });
            this.emit({ type: 'sfx', sound: 'revive', pos: copyV(s.pos) });
          }
        } else {
          s.revivedBy = null;
          s.reviveProgress = Math.max(0, s.reviveProgress - dt * 0.25);
          s.bleedout -= dt;
          if (s.bleedout <= 0) {
            s.status = 'captured';
            this.emit({ type: 'player', what: 'captured', playerId: s.id, name: s.name });
          }
        }
      }

      // a hunt passing right by a hidden survivor
      const g = this.ghost;
      if (s.hiding && g.mode === 'hunt' && s.closeCallHunt !== g.huntId && dist(g.pos, s.pos) < 4) {
        s.closeCallHunt = g.huntId;
        s.stats.hiddenCloseCalls++;
      }
    }
  }

  private nearestSurvivor(p: Vec3, range: number): Survivor | null {
    let best: Survivor | null = null;
    let bd = range;
    for (const s of this.survivors.values()) {
      if (s.status !== 'alive') continue;
      const d = dist(p, s.pos);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  private alertGhost(pos: Vec3) {
    if (this.ghost.controllerId) return;
    this.ghost.lastKnown = copyV(pos);
    this.ghost.lastSeenAt = this.time;
    this.ghost.path = [];
  }

  private forceHunt(duration: number) {
    const g = this.ghost;
    if (g.controllerId) {
      // a player-controlled Caller is told, not driven
      this.emit({ type: 'message', text: 'The station wakes. Hunt now — your hunt is ready.', tone: 'warn', to: [g.controllerId] });
      g.readyAt.hunt = 0;
      g.energy = Math.max(g.energy, GHOST_ABILITIES.hunt.cost);
      return;
    }
    if (g.mode === 'hunt') {
      g.huntUntil = Math.max(g.huntUntil, this.time + duration);
      return;
    }
    g.mode = 'warn';
    g.warnUntil = this.time + GHOST_HUNT_WARNING;
    g.huntUntil = this.time + GHOST_HUNT_WARNING + duration;
    this.emit({ type: 'hunt', phase: 'warning' });
    this.flickerNear(g.pos, 20, GHOST_HUNT_WARNING);
  }

  private flickerNear(p: Vec3, radius: number, duration: number) {
    const lights = this.level.lights.filter((l) => dist(l.pos, p) < radius).map((l) => l.id);
    if (lights.length) this.emit({ type: 'flicker', lights, duration });
  }

  // ───────────────────────────── the Caller ─────────────────────────────

  private updateGhost(dt: number) {
    const g = this.ghost;
    const ai = !g.controllerId;

    if (g.mode === 'stunned' && this.time >= g.stunUntil) g.mode = g.huntUntil > this.time ? 'hunt' : 'roam';
    if (g.mode === 'warn' && this.time >= g.warnUntil) {
      g.mode = 'hunt';
      g.visible = true;
      g.huntId++;
      if (!ai || g.huntUntil <= this.time) g.huntUntil = this.time + (ai ? this.aiHuntDuration() : GHOST_ABILITIES.hunt.duration);
      this.emit({ type: 'hunt', phase: 'start' });
    }
    if (g.mode === 'hunt' && this.time >= g.huntUntil) {
      g.mode = 'roam';
      g.visible = false;
      g.targetId = null;
      g.path = [];
      g.huntCooldownUntil = this.time + (50 - this.threat * 0.25) / this.intensity;
      this.threat = clamp(this.threat - 5, 0, 100);
      this.emit({ type: 'hunt', phase: 'end' });
    }
    g.visible = g.mode === 'hunt' || g.mode === 'stunned';
    if (g.mode !== 'hunt' && g.mode !== 'warn') g.energy = clamp(g.energy + GHOST_ENERGY_REGEN * dt, 0, GHOST_ENERGY_MAX);

    if (!ai || this.passiveGhost) return;

    // AI decides to hunt
    if (g.mode === 'roam' && this.time >= g.huntCooldownUntil && this.threat >= 15) {
      const p = dt * (0.015 + (this.threat / 100) * 0.05) * this.intensity;
      if (this.rng.chance(p)) {
        g.huntUntil = 0;
        g.mode = 'warn';
        g.warnUntil = this.time + GHOST_HUNT_WARNING;
        this.emit({ type: 'hunt', phase: 'warning' });
        this.emit({ type: 'radio', ...RADIO.huntWarning, to: this.survivorIds() });
        this.flickerNear(g.pos, 18, GHOST_HUNT_WARNING);
      }
    }

    if (g.mode === 'stunned') return;
    if (g.mode === 'hunt') this.aiHunt(dt);
    else this.aiRoam(dt, g.mode === 'warn' ? 0.6 : 1.6);
  }

  private aiHuntDuration() {
    return 14 + this.threat / 10;
  }

  private aiHunt(dt: number) {
    const g = this.ghost;
    const speed = (3.9 + (this.threat / 100) * 0.9) * (0.85 + 0.15 * this.intensity);
    const blockers = this.blockers();

    // known hiding spot with someone inside: go and drag them out
    for (const [spotId, until] of Object.entries(g.knownHiding)) {
      if (until <= this.time) continue;
      const occupant = [...this.survivors.values()].find((s) => s.hiding === spotId && s.status === 'alive');
      if (!occupant) continue;
      const spot = this.level.hidingSpots.find((h) => h.id === spotId)!;
      this.goTo(spot.entry, speed, dt);
      const victim = this.capturable(1.4);
      if (victim) this.captureSurvivor(victim);
      return;
    }

    // perception
    let best: Survivor | null = null;
    let bd = Infinity;
    for (const s of this.survivors.values()) {
      if (s.status !== 'alive' || s.hiding || Math.abs(s.pos.y - g.pos.y) > 2.4) continue;
      const d = dist(s.pos, g.pos);
      const sightRange = s.flags & FLAG_FLASHLIGHT ? 24 : s.flags & FLAG_CROUCH ? 9 : 15;
      const hearRange = s.noise >= 1 ? NOISE_RADIUS.sprint : s.noise > 0.2 ? NOISE_RADIUS.walk : s.noise > 0 ? NOISE_RADIUS.crouch : 0;
      const seen = d < sightRange && hasLineOfSight(this.level, g.pos, s.pos, blockers);
      if ((seen || d < hearRange) && d < bd) {
        best = s;
        bd = d;
      }
    }
    if (best) {
      g.targetId = best.id;
      g.lastKnown = copyV(best.pos);
      g.lastSeenAt = this.time;
    }

    const target = g.targetId ? this.survivors.get(g.targetId) : null;
    if (target && best === target && hasLineOfSight(this.level, g.pos, target.pos, blockers)) {
      this.moveStraight(target.pos, speed, dt);
    } else if (g.lastKnown && this.time - g.lastSeenAt < 7) {
      this.goTo(g.lastKnown, speed * 0.9, dt);
      if (dist2D(g.pos, g.lastKnown) < 0.6) g.lastKnown = null;
    } else {
      g.targetId = null;
      // search: drift towards the area survivors are in, never their exact position
      if (!g.path.length) {
        const alive = [...this.survivors.values()].filter((s) => s.status === 'alive');
        const focus = alive.length ? this.rng.pick(alive).pos : g.pos;
        const nodes = this.nav.ids.filter((id) => dist(this.nav.pos.get(id)!, focus) < 14);
        const goal = nodes.length ? this.rng.pick(nodes) : this.rng.pick(this.nav.ids);
        g.path = findPath(this.nav, nearestNode(this.nav, g.pos), goal);
      }
      this.followPath(speed * 0.75, dt);
    }

    const victim = this.capturable(1.25);
    if (victim) this.captureSurvivor(victim);
  }

  private aiRoam(dt: number, speed: number) {
    const g = this.ghost;
    if (g.lastKnown && this.time - g.lastSeenAt < 10) {
      this.goTo(g.lastKnown, speed * 1.4, dt);
      if (dist2D(g.pos, g.lastKnown) < 0.8) g.lastKnown = null;
      return;
    }
    if (!g.path.length) {
      const alive = [...this.survivors.values()].filter((s) => s.status === 'alive');
      let goal: string;
      if (alive.length && this.rng.chance(0.55)) {
        // stalk: wander to somewhere near a survivor
        const focus = this.rng.pick(alive).pos;
        const nodes = this.nav.ids.filter((id) => {
          const d = dist(this.nav.pos.get(id)!, focus);
          return d > 6 && d < 18;
        });
        goal = nodes.length ? this.rng.pick(nodes) : this.rng.pick(this.roamableNodes());
      } else {
        goal = this.rng.pick(this.roamableNodes());
      }
      g.path = findPath(this.nav, nearestNode(this.nav, g.pos), goal);
    }
    this.followPath(speed, dt);
  }

  /** the exit corridor stays off-limits while the gate is sealed */
  private roamableNodes() {
    return this.world.exitOpen ? this.nav.ids : this.nav.ids.filter((id) => !id.startsWith('ex'));
  }

  private goTo(p: Vec3, speed: number, dt: number) {
    const g = this.ghost;
    if (hasLineOfSight(this.level, g.pos, p, { closedDoors: [], exitOpen: this.world.exitOpen }) && Math.abs(p.y - g.pos.y) < 1) {
      g.path = [];
      this.moveStraight(p, speed, dt);
      return;
    }
    if (!g.path.length || this.time - g.pathAt > 1) {
      g.path = findPath(this.nav, nearestNode(this.nav, g.pos), nearestNode(this.nav, p));
      g.pathAt = this.time;
    }
    this.followPath(speed, dt);
  }

  private followPath(speed: number, dt: number) {
    const g = this.ghost;
    while (g.path.length) {
      const node = this.nav.pos.get(g.path[0])!;
      if (dist(g.pos, node) < 0.35) {
        g.path.shift();
        continue;
      }
      this.moveStraight(node, speed, dt);
      return;
    }
  }

  private moveStraight(p: Vec3, speed: number, dt: number) {
    const g = this.ghost;
    const dx = p.x - g.pos.x;
    const dy = p.y - g.pos.y;
    const dz = p.z - g.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return;
    const step = Math.min(d, speed * dt);
    g.pos = { x: g.pos.x + (dx / d) * step, y: g.pos.y + (dy / d) * step, z: g.pos.z + (dz / d) * step };
    if (Math.hypot(dx, dz) > 0.05) g.yaw = yawTowards(g.pos, p);
  }

  private updateFlashlightStuns(dt: number) {
    const g = this.ghost;
    if (g.mode !== 'hunt') {
      for (const s of this.survivors.values()) s.stunCharge = 0;
      return;
    }
    const chest = { x: g.pos.x, y: g.pos.y + 1.5, z: g.pos.z };
    for (const s of this.survivors.values()) {
      let lit = false;
      if (s.status === 'alive' && !s.hiding && s.hasFlashlight && s.flags & FLAG_FLASHLIGHT) {
        const eye = { x: s.pos.x, y: s.pos.y + 1.6, z: s.pos.z };
        const d = dist(eye, chest);
        if (d < 9 && d > 0.3) {
          const f = forwardFromYawPitch(s.yaw, s.pitch);
          const dot = (f.x * (chest.x - eye.x) + f.y * (chest.y - eye.y) + f.z * (chest.z - eye.z)) / d;
          lit = dot > Math.cos(0.24) && hasLineOfSight(this.level, s.pos, g.pos, this.blockers());
        }
      }
      s.stunCharge = lit ? s.stunCharge + dt : Math.max(0, s.stunCharge - dt * 2);
      if (s.stunCharge >= 1.1 && s.stunReadyAt <= this.time) {
        s.stunCharge = 0;
        s.stunReadyAt = this.time + 25;
        s.stats.stuns++;
        g.mode = 'stunned';
        g.stunUntil = this.time + 3;
        this.emit({ type: 'player', what: 'stunned_ghost', playerId: s.id, name: s.name });
        this.emit({ type: 'sfx', sound: 'stun', pos: copyV(g.pos) });
        return;
      }
    }
  }

  // ───────────────────────────── director realisation ─────────────────────────────

  private runDirector(progress: number) {
    const g = this.ghost;
    const blockers = this.blockers();
    const alive = [...this.survivors.values()].filter((s) => s.status === 'alive');
    if (!alive.length) return;
    let separation = 0;
    const survivors = alive.map((s) => {
      let iso = Infinity;
      for (const o of alive) {
        if (o === s) continue;
        const d = dist(o.pos, s.pos);
        iso = Math.min(iso, d);
        separation = Math.max(separation, d);
      }
      return { id: s.id, pos: s.pos, zone: zoneAt(this.level, s.pos)?.id ?? 'unknown', distToGhost: dist(g.pos, s.pos), hiding: !!s.hiding, isolation: iso };
    });
    const pick = selectHorrorEvent(
      {
        time: this.time, threat: this.threat, intensity: this.mode === 'versus' ? this.intensity * 0.6 : this.intensity,
        progress, power: this.world.power, ghostHunting: g.mode === 'hunt' || g.mode === 'warn', survivors, separation,
        openDoorNearby: (p) => this.level.doors.some((d) => this.world.doors[d.id].open && !d.lockedBy && dist2D(p, this.doorCenter(d.id)) < 15),
      },
      this.director,
      this.rng,
    );
    if (!pick) return;
    const t = this.survivors.get(pick.target.id)!;
    switch (pick.event.id) {
      case 'lights_flicker':
        this.flickerNear(t.pos, 16, 2.5);
        break;
      case 'footsteps': {
        const back = forwardFromYawPitch(t.yaw, 0);
        const r = this.rng.range(7, 11);
        this.emit({ type: 'sfx', sound: 'footsteps', pos: { x: t.pos.x - back.x * r, y: t.pos.y, z: t.pos.z - back.z * r } });
        break;
      }
      case 'door_slam': {
        const door = this.level.doors
          .filter((d) => this.world.doors[d.id].open && !d.lockedBy && !this.someoneInGap(d.gap))
          .sort((a, b) => dist2D(t.pos, this.doorCenter(a.id)) - dist2D(t.pos, this.doorCenter(b.id)))[0];
        if (door && dist2D(t.pos, this.doorCenter(door.id)) < 15) {
          this.world.doors[door.id].open = false;
          this.emit({ type: 'sfx', sound: 'door_slam', pos: this.doorCenter(door.id) });
        }
        break;
      }
      case 'phone_ring': {
        this.world.phoneRingingUntil = this.time + 12;
        this.emit({ type: 'sfx', sound: 'phone_ring', pos: copyV(this.level.interactables.find((i) => i.id === 'phone')!.pos!) });
        break;
      }
      case 'shadow':
      case 'private_apparition': {
        const priv = pick.event.id === 'private_apparition';
        const [lo, hi] = priv ? [6, 12] : [10, 24];
        const f = forwardFromYawPitch(t.yaw, 0);
        const nodes = this.nav.ids
          .map((id) => this.nav.pos.get(id)!)
          .filter((p) => {
            const d = dist(p, t.pos);
            if (d < lo || d > hi || Math.abs(p.y - t.pos.y) > 1) return false;
            const dot = (f.x * (p.x - t.pos.x) + f.z * (p.z - t.pos.z)) / d;
            return dot > (priv ? 0.6 : 0.2) && hasLineOfSight(this.level, t.pos, p, blockers);
          });
        if (!nodes.length) break;
        const pos = copyV(this.rng.pick(nodes));
        const yaw = yawTowards(pos, t.pos);
        this.emit({ type: priv ? 'apparition' : 'shadow', pos, yaw, duration: priv ? 1.4 : 1.8, to: priv ? [t.id] : undefined });
        break;
      }
      case 'announcement_change':
        this.emit({ type: 'announcement', text: this.rng.pick(ANNOUNCEMENTS.garbled), garbled: true });
        break;
      case 'radio_whisper':
        this.emit({ type: 'whisper', text: this.rng.pick(WHISPERS), to: [t.id] });
        break;
      case 'distant_scream': {
        const far = this.nav.ids.map((id) => this.nav.pos.get(id)!).filter((p) => dist(p, t.pos) > 25 && dist(p, t.pos) < 45);
        if (far.length) this.emit({ type: 'sfx', sound: 'scream_distant', pos: copyV(this.rng.pick(far)) });
        break;
      }
      case 'train_creak':
        this.emit({ type: 'sfx', sound: 'train_creak', pos: v3(this.rng.range(-10, 10), 1, 10) });
        break;
    }
  }

  private doorCenter(id: string): Vec3 {
    const d = this.level.doors.find((x) => x.id === id)!;
    return v3((d.gap.minX + d.gap.maxX) / 2, 1, (d.gap.minZ + d.gap.maxZ) / 2);
  }

  // ───────────────────────────── end of match ─────────────────────────────

  private checkEnd() {
    if (this.ended || !this.started) return;
    const all = [...this.survivors.values()];
    if (!all.length) {
      this.finish('ghost', 'Every survivor left the station.');
      return;
    }
    if (all.some((s) => s.status === 'alive' || s.status === 'downed')) return;
    const escaped = all.filter((s) => s.status === 'escaped').length;
    const win = this.mode === 'versus' ? escaped * 2 >= all.length : escaped > 0;
    this.finish(
      win ? 'survivors' : 'ghost',
      win
        ? escaped === all.length ? 'Everyone escaped Nishipur Junction.' : `${escaped} of ${all.length} escaped. The others are still on the platform.`
        : 'The Caller answered for you.',
    );
  }

  private finish(winner: 'survivors' | 'ghost', reason: string) {
    this.ended = true;
    const players = [...this.allRoster.entries()].map(([id, r]) => {
      const s = this.survivors.get(id);
      return {
        id, name: r.name, role: r.role, characterId: r.characterId,
        status: r.role === 'ghost' ? ('ghost' as const) : (s?.status ?? 'captured'),
        stuns: s?.stats.stuns ?? 0, revives: s?.stats.revives ?? 0, hiddenCloseCalls: s?.stats.hiddenCloseCalls ?? 0,
      };
    });
    this.result = { winner, reason, duration: this.time, fragments: [...this.world.notes], checkpointsUsed: this.checkpointsUsed, players };
    this.emit({ type: 'match_end', result: this.result });
  }

  // ───────────────────────────── snapshot ─────────────────────────────

  snapshot(): WorldSnapshot {
    const survivors: SurvivorView[] = [...this.survivors.values()].map((s) => ({
      id: s.id, name: s.name, characterId: s.characterId, pos: copyV(s.pos), yaw: s.yaw, pitch: s.pitch, flags: s.flags,
      stamina: s.stamina, exhausted: s.exhausted, status: s.status, hiding: s.hiding, bleedout: s.bleedout,
      reviveProgress: s.reviveProgress, hasFlashlight: s.hasFlashlight, abilityReadyAt: s.abilityReadyAt,
      abilityActiveUntil: s.abilityActiveUntil, noise: s.noise, connected: s.connected,
    }));
    const g = this.ghost;
    const ghost: GhostView = {
      controllerId: g.controllerId, name: g.name, ghostId: g.ghostId, pos: copyV(g.pos), yaw: g.yaw, mode: g.mode,
      visible: g.visible, energy: g.energy, readyAt: { ...g.readyAt }, huntUntil: g.huntUntil, warnUntil: g.warnUntil,
      stunUntil: g.stunUntil, apparition: g.apparition ? { ...g.apparition, pos: copyV(g.apparition.pos) } : null,
    };
    return {
      time: this.time, threat: this.threat, mode: this.mode, ended: this.ended, survivors, ghost,
      world: structuredClone(this.world), result: this.result,
    };
  }

  /** Test/debug only: place a survivor (bypasses movement validation). */
  debugPlace(id: string, p: Vec3) {
    const s = this.survivors.get(id);
    if (s) {
      s.pos = copyV(p);
      s.lastValid = copyV(p);
      s.lastMoveAt = this.time;
    }
  }

  /** Test/debug only: place the Caller. */
  debugPlaceGhost(p: Vec3) {
    this.ghost.pos = copyV(p);
  }

  /** Test/debug only: the generated solutions. Never send to clients. */
  debugSecrets() {
    return { fuse: [...this.fuseSolution], digits: { ...this.digits }, order: [...this.order] };
  }
}
