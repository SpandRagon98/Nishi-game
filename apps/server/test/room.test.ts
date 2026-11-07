import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, isRoomCode } from '@nishi/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from '../src/server';

/**
 * Real end-to-end room test: boots the Colyseus server and connects two (and three) actual
 * SDK clients over WebSockets, exactly like two browser windows would.
 */
const PORT = 25673;
const URL = `http://127.0.0.1:${PORT}`;
const server = createServer();

beforeAll(async () => {
  await server.listen(PORT, '127.0.0.1');
});
afterAll(async () => {
  await server.gracefullyShutdown(false);
});

async function until(cond: () => boolean, ms = 4000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting for condition');
    await new Promise((r) => setTimeout(r, 20));
  }
}

type AnyState = {
  phase: string;
  hostId: string;
  code: string;
  mode: string;
  worldJson: string;
  players: Map<string, { id: string; name: string; role: string; characterId: string; ready: boolean; x: number; z: number }>;
  ghost: { controllerId: string };
};
const st = (r: Room) => r.state as unknown as AnyState;

function collect(room: Room) {
  const events: { type: string; [k: string]: unknown }[] = [];
  room.onMessage('event', (e: { type: string }) => events.push(e));
  room.onMessage('correct', () => undefined);
  return events;
}

describe('NishiRoom (two live clients)', () => {
  let a: Room;
  let b: Room;
  let evA: ReturnType<typeof collect>;
  let evB: ReturnType<typeof collect>;

  it('creates a private room with a short code and lets a second client join by code', async () => {
    a = await new Client(URL).create(ROOM_NAME, { name: 'Aditi', private: true });
    evA = collect(a);
    expect(isRoomCode(a.roomId)).toBe(true);
    b = await new Client(URL).joinById(a.roomId, { name: 'Caller<script>' });
    evB = collect(b);
    await until(() => st(a).players.size === 2 && st(b).players.size === 2);
    expect(st(a).hostId).toBe(a.sessionId);
    expect(st(b).players.get(b.sessionId)!.name).toBe('Callerscript');
  });

  it('a private room is not offered to public matchmaking', async () => {
    const c = await new Client(URL).joinOrCreate(ROOM_NAME, { name: 'Stranger' });
    expect(c.roomId).not.toBe(a.roomId);
    await c.leave();
  });

  it('lets players pick roles, refuses a second ghost, and only the host can start', async () => {
    b.send('lobby_role', { role: 'ghost' });
    await until(() => st(a).players.get(b.sessionId)!.role === 'ghost');
    a.send('lobby_role', { role: 'ghost' });
    await until(() => evA.some((e) => e.type === 'message' && String(e.text).includes('already playing')));
    expect(st(a).players.get(a.sessionId)!.role).toBe('survivor');

    a.send('lobby_character', { characterId: 'kabir' });
    await until(() => st(b).players.get(a.sessionId)!.characterId === 'kabir');
    a.send('lobby_character', { characterId: 'meera' }); // registered but not playable yet
    await until(() => evA.some((e) => e.type === 'message' && String(e.text).includes('not available')));

    b.send('lobby_start', {}); // not host
    a.send('lobby_start', {}); // host, but B not ready
    await until(() => evA.some((e) => e.type === 'message' && e.text === 'Everyone must be ready.'));
    expect(st(a).phase).toBe('lobby');

    b.send('lobby_ready', { ready: true });
    await until(() => st(a).players.get(b.sessionId)!.ready);
    a.send('lobby_start', {});
    await until(() => st(a).phase === 'playing' && st(b).phase === 'playing');
    expect(st(a).mode).toBe('versus');
    expect(st(a).ghost.controllerId).toBe(b.sessionId);
    expect(JSON.parse(st(a).worldJson).power).toBe(false);
  });

  it('locks the room once the match starts', async () => {
    await expect(new Client(URL).joinById(a.roomId, { name: 'Late' })).rejects.toBeTruthy();
  });

  it('synchronises validated movement and rejects teleports', async () => {
    const me = st(a).players.get(a.sessionId)!;
    const x0 = me.x;
    const z0 = me.z;
    a.send('move', { x: x0 + 0.2, y: 0, z: z0, yaw: 0, pitch: 0, flags: 8 });
    await until(() => Math.abs(st(b).players.get(a.sessionId)!.x - (x0 + 0.2)) < 0.01);
    let corrected = false;
    a.onMessage('correct', () => (corrected = true));
    a.send('move', { x: x0 + 30, y: 0, z: z0, yaw: 0, pitch: 0, flags: 8 });
    await until(() => corrected);
    expect(Math.abs(st(b).players.get(a.sessionId)!.x - (x0 + 0.2))).toBeLessThan(0.01);
  });

  it('validates interactions and ghost abilities on the server', async () => {
    a.send('interact', { target: 'logbook' }); // far away
    await until(() => evA.some((e) => e.type === 'message' && e.text === 'Too far away'));
    b.send('ghost_ability', { ability: 'hunt' }); // grace period
    await until(() => evB.some((e) => e.type === 'ability' && e.ok === false));
    b.send('ghost_ability', { ability: 'not_real' });
    a.send('ghost_ability', { ability: 'blackout' }); // survivors can't use ghost powers
    await new Promise((r) => setTimeout(r, 150));
    expect(evA.some((e) => e.type === 'ability')).toBe(false);
  });

  it('survivor radio chat reaches survivors only', async () => {
    a.send('chat', { text: 'Found a reel.' });
    await until(() => evA.some((e) => e.type === 'chat'));
    await new Promise((r) => setTimeout(r, 150));
    expect(evB.some((e) => e.type === 'chat')).toBe(false);
  });

  it('when the ghost player leaves, the AI Caller takes over', async () => {
    await b.leave();
    await until(() => st(a).ghost.controllerId === '' && st(a).players.size === 1);
    expect(st(a).phase).toBe('playing');
    await a.leave();
  });
});
