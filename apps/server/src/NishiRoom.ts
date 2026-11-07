import { Room, type Client } from '@colyseus/core';
import {
  GHOST_ABILITIES, MAX_PLAYERS, MAX_SURVIVORS, MatchSimulation, SURVIVORS, TICK_RATE, makeRoomCode,
  type GhostAbilityId, type LobbyRole, type SimEvent,
} from '@nishi/shared';
import { GhostState, NishiState, PlayerState } from './schema';

const RECONNECT_SECONDS = 30;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const str = (v: unknown, max = 64): v is string => typeof v === 'string' && v.length <= max;
const vec = (v: unknown) => (isObj(v) && num(v.x) && num(v.y) && num(v.z) ? { x: v.x, y: v.y, z: v.z } : undefined);
const cleanName = (raw: unknown) =>
  // eslint-disable-next-line no-control-regex
  (typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 20) : '') || 'Guest';

export class NishiRoom extends Room<{ state: NishiState }> {
  maxClients = MAX_PLAYERS;
  maxMessagesPerSecond = 80;
  private sim: MatchSimulation | null = null;
  private intensity = 1;
  private lastWorldJson = '';

  onCreate(options: unknown) {
    const o = isObj(options) ? options : {};
    this.roomId = makeRoomCode();
    this.state = new NishiState();
    this.state.code = this.roomId;
    this.state.ghost = new GhostState();
    this.intensity = num(o.intensity) ? Math.min(1.5, Math.max(0.5, o.intensity)) : 1;
    if (o.private === true) {
      this.state.isPrivate = true;
      void this.setPrivate(true);
    }

    this.onMessage('lobby_role', (c, m) => this.onRole(c, m));
    this.onMessage('lobby_character', (c, m) => this.onCharacter(c, m));
    this.onMessage('lobby_ready', (c, m) => {
      const p = this.state.players.get(c.sessionId);
      if (p && this.state.phase === 'lobby' && isObj(m)) p.ready = !!m.ready;
    });
    this.onMessage('lobby_start', (c) => this.onStart(c));
    this.onMessage('return_lobby', (c) => this.onReturnToLobby(c));

    // gameplay — every one of these is validated inside the shared simulation
    this.onMessage('move', (c, m) => {
      if (!this.sim || !isObj(m)) return;
      if (![m.x, m.y, m.z, m.yaw, m.pitch, m.flags].every(num)) return;
      this.sim.applyMove(c.sessionId, m as never);
    });
    this.onMessage('interact', (c, m) => {
      if (this.sim && isObj(m) && str(m.target)) this.sim.interact(c.sessionId, m.target);
    });
    this.onMessage('fuse_set', (c, m) => {
      if (this.sim && isObj(m) && num(m.slot) && num(m.value)) this.sim.fuseSet(c.sessionId, m.slot, m.value);
    });
    this.onMessage('fuse_submit', (c) => this.sim?.fuseSubmit(c.sessionId));
    this.onMessage('keypad', (c, m) => {
      if (this.sim && isObj(m) && str(m.code, 8)) this.sim.keypadSubmit(c.sessionId, m.code);
    });
    this.onMessage('ability', (c) => this.sim?.useSurvivorAbility(c.sessionId));
    this.onMessage('ghost_ability', (c, m) => {
      if (!this.sim || !isObj(m) || !str(m.ability) || !(m.ability in GHOST_ABILITIES)) return;
      this.sim.ghostAbility(c.sessionId, m.ability as GhostAbilityId, vec(m.target), str(m.targetPlayer) ? m.targetPlayer : undefined);
    });
    this.onMessage('ghost_capture', (c) => this.sim?.ghostCapture(c.sessionId));
    this.onMessage('revive', (c, m) => {
      if (!this.sim || !isObj(m)) return;
      if (str(m.target)) this.sim.reviveStart(c.sessionId, m.target);
      else this.sim.reviveStop(c.sessionId);
    });
    this.onMessage('chat', (c, m) => {
      if (this.sim && isObj(m) && str(m.text, 200)) this.sim.chat(c.sessionId, m.text);
    });

    this.setSimulationInterval((ms) => this.update(ms / 1000), 1000 / TICK_RATE);
  }

  onJoin(client: Client, options: unknown) {
    if (this.state.phase !== 'lobby') throw new Error('Match already in progress');
    const o = isObj(options) ? options : {};
    const p = new PlayerState();
    p.id = client.sessionId;
    p.name = cleanName(o.name);
    p.role = 'survivor';
    const taken = this.survivorCharacters();
    p.characterId = SURVIVORS.find((s) => s.playable && !taken.includes(s.id))?.id ?? 'aditi';
    if (this.survivorCount() >= MAX_SURVIVORS) {
      p.role = 'ghost';
      p.characterId = 'caller';
    }
    if (!this.state.hostId) {
      this.state.hostId = client.sessionId;
      p.isHost = true;
    }
    this.state.players.set(client.sessionId, p);
  }

  async onDrop(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;
    this.sim?.setConnected(client.sessionId, false);
    await this.allowReconnection(client, RECONNECT_SECONDS);
  }

  onReconnect(client: Client) {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = true;
    this.sim?.setConnected(client.sessionId, true);
  }

  onLeave(client: Client) {
    this.state.players.delete(client.sessionId);
    this.sim?.removePlayer(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      const next = [...this.state.players.values()][0];
      this.state.hostId = next?.id ?? '';
      if (next) next.isHost = true;
    }
  }

  // ───────────────────────────── lobby ─────────────────────────────

  private survivorCount() {
    return [...this.state.players.values()].filter((p) => p.role === 'survivor').length;
  }

  private survivorCharacters(except?: string) {
    return [...this.state.players.values()].filter((p) => p.role === 'survivor' && p.id !== except).map((p) => p.characterId);
  }

  private reject(c: Client, text: string) {
    c.send('event', { type: 'message', text, tone: 'warn' });
  }

  private onRole(c: Client, m: unknown) {
    const p = this.state.players.get(c.sessionId);
    if (!p || this.state.phase !== 'lobby' || !isObj(m)) return;
    const role = m.role as LobbyRole;
    if (role !== 'survivor' && role !== 'ghost') return;
    if (role === p.role) return;
    if (role === 'ghost') {
      if ([...this.state.players.values()].some((o) => o.role === 'ghost')) return this.reject(c, 'Someone is already playing the Caller.');
      p.role = 'ghost';
      p.characterId = 'caller';
    } else {
      if (this.survivorCount() >= MAX_SURVIVORS) return this.reject(c, 'All four survivor slots are taken.');
      const taken = this.survivorCharacters();
      const free = SURVIVORS.find((s) => s.playable && !taken.includes(s.id));
      if (!free) return this.reject(c, 'No survivor characters are free.');
      p.role = 'survivor';
      p.characterId = free.id;
    }
    p.ready = false;
  }

  private onCharacter(c: Client, m: unknown) {
    const p = this.state.players.get(c.sessionId);
    if (!p || this.state.phase !== 'lobby' || !isObj(m) || !str(m.characterId) || p.role !== 'survivor') return;
    const def = SURVIVORS.find((s) => s.id === m.characterId);
    if (!def || !def.playable) return this.reject(c, 'That survivor is not available yet.');
    // Two survivors may share a character only when there are more players than characters.
    const taken = this.survivorCharacters(c.sessionId);
    const playable = SURVIVORS.filter((s) => s.playable).length;
    if (taken.includes(def.id) && taken.length < playable) return this.reject(c, `${def.name} is already taken.`);
    p.characterId = def.id;
    p.ready = false;
  }

  private onStart(c: Client) {
    if (c.sessionId !== this.state.hostId || this.state.phase !== 'lobby') return;
    const players = [...this.state.players.values()];
    const survivors = players.filter((p) => p.role === 'survivor');
    if (!survivors.length) return this.reject(c, 'At least one survivor is needed.');
    if (players.some((p) => !p.ready && p.id !== c.sessionId)) return this.reject(c, 'Everyone must be ready.');
    const ghost = players.find((p) => p.role === 'ghost');
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const sim = new MatchSimulation({ seed, mode: ghost ? 'versus' : 'coop', intensity: this.intensity });
    for (const s of survivors) sim.addSurvivor(s.id, s.name, s.characterId);
    if (ghost) sim.setGhostController(ghost.id, ghost.name);
    this.sim = sim;
    this.lastWorldJson = '';
    this.state.seed = seed;
    this.state.mode = sim.mode;
    this.state.resultJson = '';
    this.state.phase = 'playing';
    for (const p of players) p.ready = false;
    void this.lock();
    this.update(0);
  }

  private onReturnToLobby(c: Client) {
    if (c.sessionId !== this.state.hostId || this.state.phase !== 'ended') return;
    this.sim = null;
    this.state.phase = 'lobby';
    this.state.worldJson = '';
    this.state.resultJson = '';
    for (const p of this.state.players.values()) {
      p.ready = false;
      p.status = 'alive';
      p.hiding = '';
    }
    void this.unlock();
    this.broadcast('event', { type: 'message', text: 'Back in the lobby.', tone: 'info' });
  }

  // ───────────────────────────── simulation loop ─────────────────────────────

  private update(dt: number) {
    const sim = this.sim;
    if (!sim || this.state.phase !== 'playing') return;
    sim.tick(dt);
    for (const e of sim.drainEvents()) this.dispatch(e);
    for (const [id, pos] of sim.drainTeleports()) this.clientById(id)?.send('correct', pos);
    this.sync();
    if (sim.ended) {
      this.state.phase = 'ended';
      this.state.resultJson = JSON.stringify(sim.result);
    }
  }

  private clientById(id: string) {
    return this.clients.find((c) => c.sessionId === id);
  }

  private dispatch(e: SimEvent) {
    const { to, ...payload } = e;
    if (to) for (const id of to) this.clientById(id)?.send('event', payload);
    else this.broadcast('event', payload);
  }

  private sync() {
    const snap = this.sim!.snapshot();
    this.state.time = snap.time;
    this.state.threat = snap.threat;
    for (const s of snap.survivors) {
      const p = this.state.players.get(s.id);
      if (!p) continue;
      p.x = s.pos.x;
      p.y = s.pos.y;
      p.z = s.pos.z;
      p.yaw = s.yaw;
      p.pitch = s.pitch;
      p.flags = s.flags;
      p.stamina = s.stamina;
      p.exhausted = s.exhausted;
      p.status = s.status;
      p.hiding = s.hiding ?? '';
      p.bleedout = s.bleedout;
      p.reviveProgress = s.reviveProgress;
      p.hasFlashlight = s.hasFlashlight;
      p.abilityReadyAt = s.abilityReadyAt;
      p.abilityActiveUntil = s.abilityActiveUntil;
      p.noise = s.noise;
    }
    const g = this.state.ghost;
    const sg = snap.ghost;
    g.controllerId = sg.controllerId ?? '';
    g.name = sg.name;
    g.ghostId = sg.ghostId;
    g.x = sg.pos.x;
    g.y = sg.pos.y;
    g.z = sg.pos.z;
    g.yaw = sg.yaw;
    g.mode = sg.mode;
    g.visible = sg.visible;
    g.energy = sg.energy;
    g.huntUntil = Math.min(sg.huntUntil, 1e6);
    g.warnUntil = sg.warnUntil;
    g.stunUntil = sg.stunUntil;
    const ready = JSON.stringify(sg.readyAt);
    if (ready !== g.readyAtJson) g.readyAtJson = ready;
    const app = JSON.stringify(sg.apparition);
    if (app !== g.apparitionJson) g.apparitionJson = app;
    const world = JSON.stringify(snap.world);
    if (world !== this.lastWorldJson) {
      this.lastWorldJson = world;
      this.state.worldJson = world;
    }
  }
}
