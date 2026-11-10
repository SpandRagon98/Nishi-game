import type { Room } from '@colyseus/sdk';
import { inCutscene } from './cutscene';
import { runtime } from './runtime';
import {
  MatchSimulation, type GhostAbilityId, type GhostView, type MoveInput, type SimEvent, type SurvivorView, type Vec3,
  type WorldSnapshot, type WorldView,
} from '@nishi/shared';

type Listener<T> = (v: T) => void;

/** What the game scene needs from "the authority" — a local simulation or the multiplayer server. */
export interface GameSession {
  readonly kind: 'solo' | 'multi';
  readonly localId: string;
  readonly role: 'survivor' | 'ghost';
  snapshot(): WorldSnapshot | null;
  update(dt: number): void;
  sendMove(m: MoveInput): void;
  interact(target: string): void;
  fuseSet(slot: number, value: number): void;
  fuseSubmit(): void;
  keypad(code: string): void;
  ability(): void;
  ghostAbility(ability: GhostAbilityId, target?: Vec3, targetPlayer?: string): void;
  ghostCapture(): void;
  revive(target: string | null): void;
  chat(text: string): void;
  canRetry(): boolean;
  retry(): boolean;
  isHost(): boolean;
  returnToLobby(): void;
  onEvent(cb: Listener<SimEvent>): () => void;
  onTeleport(cb: Listener<Vec3>): () => void;
  dispose(): void;
}

class Emitter<T> {
  private ls = new Set<Listener<T>>();
  on(cb: Listener<T>) {
    this.ls.add(cb);
    return () => this.ls.delete(cb);
  }
  emit(v: T) {
    for (const l of this.ls) l(v);
  }
  clear() {
    this.ls.clear();
  }
}

// ───────────────────────────── solo ─────────────────────────────

export class LocalSession implements GameSession {
  readonly kind = 'solo' as const;
  readonly role = 'survivor' as const;
  readonly localId = 'local';
  readonly sim: MatchSimulation;
  private events = new Emitter<SimEvent>();
  private teleports = new Emitter<Vec3>();
  private snap: WorldSnapshot | null = null;

  constructor(opts: { name: string; characterId: string; intensity: number; seed?: number }) {
    this.sim = new MatchSimulation({ seed: opts.seed ?? (Math.random() * 2 ** 32) >>> 0, mode: 'solo', intensity: opts.intensity });
    this.sim.addSurvivor(this.localId, opts.name, opts.characterId);
    this.snap = this.sim.snapshot();
  }

  private flush() {
    // refresh the snapshot first so event handlers see the state the events describe
    this.snap = this.sim.snapshot();
    for (const e of this.sim.drainEvents()) if (!e.to || e.to.includes(this.localId)) this.events.emit(e);
    const t = this.sim.drainTeleports().get(this.localId);
    if (t) this.teleports.emit(t);
  }

  snapshot() {
    return this.snap;
  }
  update(dt: number) {
    // solo play holds still while a cutscene runs (and while the testing Studio freezes the world)
    if (!inCutscene() && !runtime.studio.paused) this.sim.tick(dt);
    this.flush();
  }
  sendMove(m: MoveInput) {
    this.sim.applyMove(this.localId, m);
    const t = this.sim.drainTeleports().get(this.localId);
    if (t) this.teleports.emit(t);
  }
  private act(fn: () => unknown) {
    fn();
    this.flush();
  }
  interact(target: string) {
    this.act(() => this.sim.interact(this.localId, target));
  }
  fuseSet(slot: number, value: number) {
    this.act(() => this.sim.fuseSet(this.localId, slot, value));
  }
  fuseSubmit() {
    this.act(() => this.sim.fuseSubmit(this.localId));
  }
  keypad(code: string) {
    this.act(() => this.sim.keypadSubmit(this.localId, code));
  }
  ability() {
    this.act(() => this.sim.useSurvivorAbility(this.localId));
  }
  ghostAbility() {}
  ghostCapture() {}
  revive() {}
  chat() {}
  canRetry() {
    return this.sim.canRetry();
  }
  retry() {
    const ok = this.sim.retryFromCheckpoint();
    this.flush();
    return ok;
  }
  isHost() {
    return true;
  }
  returnToLobby() {}
  onEvent(cb: Listener<SimEvent>) {
    return this.events.on(cb);
  }
  onTeleport(cb: Listener<Vec3>) {
    return this.teleports.on(cb);
  }
  dispose() {
    this.events.clear();
    this.teleports.clear();
  }
}

// ───────────────────────────── multiplayer ─────────────────────────────

/** Shape of the decoded Colyseus room state (see apps/server/src/schema.ts). */
export interface NetPlayer {
  id: string;
  name: string;
  role: string;
  characterId: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flags: number;
  stamina: number;
  exhausted: boolean;
  status: string;
  hiding: string;
  bleedout: number;
  reviveProgress: number;
  hasFlashlight: boolean;
  abilityReadyAt: number;
  abilityActiveUntil: number;
  noise: number;
}
export interface NetState {
  phase: 'lobby' | 'playing' | 'ended';
  code: string;
  isPrivate: boolean;
  hostId: string;
  mode: 'coop' | 'versus';
  seed: number;
  time: number;
  threat: number;
  worldJson: string;
  resultJson: string;
  players: { forEach(cb: (p: NetPlayer, key: string) => void): void; get(k: string): NetPlayer | undefined; size: number };
  ghost: {
    controllerId: string; name: string; ghostId: string; x: number; y: number; z: number; yaw: number; mode: string;
    visible: boolean; energy: number; huntUntil: number; warnUntil: number; stunUntil: number; readyAtJson: string; apparitionJson: string;
  };
}

export const netState = (room: Room) => room.state as unknown as NetState;

export class NetworkSession implements GameSession {
  readonly kind = 'multi' as const;
  readonly localId: string;
  readonly role: 'survivor' | 'ghost';
  private events = new Emitter<SimEvent>();
  private teleports = new Emitter<Vec3>();
  private lastMoveSent = 0;
  private worldStr = '';
  private world: WorldView | null = null;
  private jsonCache = new Map<string, unknown>();
  private unsubs: (() => void)[] = [];

  constructor(readonly room: Room) {
    this.localId = room.sessionId;
    this.role = netState(room).players.get(room.sessionId)?.role === 'ghost' ? 'ghost' : 'survivor';
    this.unsubs.push(room.onMessage('event', (e: SimEvent) => this.events.emit(e)));
    this.unsubs.push(room.onMessage('correct', (p: Vec3) => this.teleports.emit(p)));
  }

  private parse<T>(s: string, fallback: T): T {
    if (!s) return fallback;
    if (this.jsonCache.has(s)) return this.jsonCache.get(s) as T;
    try {
      const v = JSON.parse(s) as T;
      if (this.jsonCache.size > 32) this.jsonCache.clear();
      this.jsonCache.set(s, v);
      return v;
    } catch {
      return fallback;
    }
  }

  snapshot(): WorldSnapshot | null {
    const st = netState(this.room);
    if (st.worldJson !== this.worldStr) {
      this.worldStr = st.worldJson;
      this.world = this.parse<WorldView | null>(st.worldJson, null);
    }
    if (!this.world) return null;
    const survivors: SurvivorView[] = [];
    st.players.forEach((p) => {
      if (p.role !== 'survivor') return;
      survivors.push({
        id: p.id, name: p.name, characterId: p.characterId, pos: { x: p.x, y: p.y, z: p.z }, yaw: p.yaw, pitch: p.pitch,
        flags: p.flags, stamina: p.stamina, exhausted: p.exhausted, status: p.status as SurvivorView['status'],
        hiding: p.hiding || null, bleedout: p.bleedout, reviveProgress: p.reviveProgress, hasFlashlight: p.hasFlashlight,
        abilityReadyAt: p.abilityReadyAt, abilityActiveUntil: p.abilityActiveUntil, noise: p.noise, connected: p.connected,
      });
    });
    const g = st.ghost;
    const ghost: GhostView = {
      controllerId: g.controllerId || null, name: g.name, ghostId: g.ghostId, pos: { x: g.x, y: g.y, z: g.z }, yaw: g.yaw,
      mode: g.mode as GhostView['mode'], visible: g.visible, energy: g.energy,
      readyAt: this.parse(g.readyAtJson, { voice: 0, apparition: 0, blackout: 0, echo: 0, hunt: 0 }),
      huntUntil: g.huntUntil, warnUntil: g.warnUntil, stunUntil: g.stunUntil, apparition: this.parse(g.apparitionJson, null),
    };
    return {
      time: st.time, threat: st.threat, mode: st.mode, ended: st.phase === 'ended', survivors, ghost, world: this.world,
      result: this.parse(st.resultJson, null),
    };
  }

  update() {}

  sendMove(m: MoveInput) {
    const now = performance.now();
    if (now - this.lastMoveSent < 1000 / 15) return;
    this.lastMoveSent = now;
    this.room.send('move', m);
  }
  interact(target: string) {
    this.room.send('interact', { target });
  }
  fuseSet(slot: number, value: number) {
    this.room.send('fuse_set', { slot, value });
  }
  fuseSubmit() {
    this.room.send('fuse_submit', {});
  }
  keypad(code: string) {
    this.room.send('keypad', { code });
  }
  ability() {
    this.room.send('ability', {});
  }
  ghostAbility(ability: GhostAbilityId, target?: Vec3, targetPlayer?: string) {
    this.room.send('ghost_ability', { ability, target, targetPlayer });
  }
  ghostCapture() {
    this.room.send('ghost_capture', {});
  }
  revive(target: string | null) {
    this.room.send('revive', { target });
  }
  chat(text: string) {
    this.room.send('chat', { text });
  }
  canRetry() {
    return false;
  }
  retry() {
    return false;
  }
  isHost() {
    return netState(this.room).hostId === this.localId;
  }
  returnToLobby() {
    this.room.send('return_lobby', {});
  }
  onEvent(cb: Listener<SimEvent>) {
    return this.events.on(cb);
  }
  onTeleport(cb: Listener<Vec3>) {
    return this.teleports.on(cb);
  }
  dispose() {
    for (const u of this.unsubs) u();
    this.events.clear();
    this.teleports.clear();
  }
}
