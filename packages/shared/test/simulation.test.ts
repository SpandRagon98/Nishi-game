import { describe, expect, it } from 'vitest';
import { FLAG_FLASHLIGHT, FLAG_MOVING, MatchSimulation, PLATFORM_ZERO, type Vec3 } from '../src';

const at = (p: Vec3): Vec3 => ({ x: p.x, y: p.y - 1, z: p.z });
const posOf = (sim: MatchSimulation, id: string) =>
  sim.snapshot().world.itemPos[id] ?? PLATFORM_ZERO.interactables.find((i) => i.id === id)!.pos!;
const run = (sim: MatchSimulation, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.05) sim.tick(0.05);
};

describe('MatchSimulation — solo playthrough', () => {
  it('can be completed end-to-end: flashlight → office → reels → power → decode → exit → escape', () => {
    const sim = new MatchSimulation({ seed: 1234, mode: 'solo', passiveGhost: true });
    sim.addSurvivor('p', 'Aditi', 'aditi');
    sim.tick(0.05);
    const use = (id: string) => {
      sim.debugPlace('p', at(posOf(sim, id)));
      return sim.interact('p', id);
    };

    expect(use('flashlight_kit').ok).toBe(true);
    expect(sim.snapshot().world.objectives.flashlight).toBe(true);

    expect(use('logbook').ok).toBe(true);
    expect(use('drawer').ok).toBe(true);
    const w1 = sim.snapshot().world;
    expect(w1.objectives.office).toBe(true);
    expect(w1.inventory).toContain('maintenance_key');
    expect(w1.fuse.clue).toHaveLength(4);

    for (const r of ['reel_a', 'reel_b', 'reel_c']) expect(use(r).ok).toBe(true);
    expect(sim.snapshot().world.objectives.reels).toBe(true);

    // maintenance door is locked until the key is used
    sim.debugPlace('p', { x: 24.6, y: 0, z: 0.8 });
    expect(sim.interact('p', 'd_maint').ok).toBe(true);
    expect(sim.snapshot().world.doors.d_maint).toEqual({ open: true, locked: false });

    // keypad refuses before power
    sim.debugPlace('p', at(posOf(sim, 'pa_console')));
    expect(sim.interact('p', 'pa_console').ok).toBe(false);

    sim.debugPlace('p', at(posOf(sim, 'fuse_box')));
    expect(sim.interact('p', 'fuse_box').ok).toBe(true);
    const clue = sim.snapshot().world.fuse.clue!;
    clue.forEach((v, i) => expect(sim.fuseSet('p', i, v).ok).toBe(true));
    expect(sim.fuseSubmit('p').ok).toBe(true);
    expect(sim.snapshot().world.power).toBe(true);

    run(sim, 5);
    const w2 = sim.snapshot().world;
    expect(w2.decodeOrder).toHaveLength(3);
    const code = w2.decodeOrder!.map((l) => w2.reelDigits[`reel_${l.toLowerCase()}`]).join('');

    sim.debugPlace('p', at(posOf(sim, 'pa_console')));
    expect(sim.keypadSubmit('p', code).ok).toBe(true);
    expect(sim.snapshot().world.decoded).toBe(true);

    expect(use('exit_gate').ok).toBe(true);
    expect(sim.snapshot().world.exitOpen).toBe(false);
    run(sim, 6.5);
    expect(sim.snapshot().world.exitOpen).toBe(true);

    sim.debugPlace('p', { x: -10, y: 0, z: -20 });
    sim.tick(0.05);
    const snap = sim.snapshot();
    expect(snap.survivors[0].status).toBe('escaped');
    expect(snap.ended).toBe(true);
    expect(snap.result?.winner).toBe('survivors');
    expect(snap.world.objectives.escape).toBe(true);
  });

  it('the console replays the reel-order announcement for anyone who missed it', () => {
    const sim = new MatchSimulation({ seed: 99, mode: 'solo', passiveGhost: true });
    sim.addSurvivor('p', 'Aditi', 'aditi');
    sim.tick(0.05);
    const use = (id: string) => {
      sim.debugPlace('p', at(posOf(sim, id)));
      return sim.interact('p', id);
    };
    use('flashlight_kit');
    use('logbook');
    use('drawer');
    sim.debugPlace('p', { x: 24.6, y: 0, z: 0.8 });
    sim.interact('p', 'd_maint');
    use('fuse_box');
    sim.snapshot().world.fuse.clue!.forEach((v, i) => sim.fuseSet('p', i, v));
    sim.fuseSubmit('p');
    run(sim, 5);
    const order = sim.snapshot().world.decodeOrder!;
    sim.drainEvents();
    // power came on before the reels were found: the console still refuses, but repeats the order
    expect(use('pa_console').ok).toBe(false);
    const replay = sim.drainEvents().find((e) => e.type === 'announcement');
    expect(replay && 'text' in replay && replay.text).toContain(`reel ${order[0]}, then reel ${order[1]}, then reel ${order[2]}`);
  });

  it('never leaks puzzle solutions before they are discovered', () => {
    const sim = new MatchSimulation({ seed: 9, mode: 'solo', passiveGhost: true });
    sim.addSurvivor('p', 'A', 'aditi');
    const w = sim.snapshot().world;
    expect(w.fuse.clue).toBeNull();
    expect(w.decodeOrder).toBeNull();
    expect(w.reelDigits).toEqual({});
  });

  it('places evidence deterministically per seed and differently across seeds', () => {
    const a = new MatchSimulation({ seed: 1, mode: 'solo' }).snapshot().world.itemPos;
    const b = new MatchSimulation({ seed: 1, mode: 'solo' }).snapshot().world.itemPos;
    expect(a).toEqual(b);
    const differs = [2, 3, 4, 5, 6].some((s) => JSON.stringify(new MatchSimulation({ seed: s, mode: 'solo' }).snapshot().world.itemPos) !== JSON.stringify(a));
    expect(differs).toBe(true);
  });
});

describe('MatchSimulation — validation', () => {
  const fresh = () => {
    const sim = new MatchSimulation({ seed: 5, mode: 'solo', passiveGhost: true });
    sim.addSurvivor('p', 'A', 'aditi');
    sim.tick(0.05);
    sim.drainTeleports();
    return sim;
  };

  it('rejects teleports and wall-clipping, accepts legal movement', () => {
    const sim = fresh();
    const s0 = sim.snapshot().survivors[0].pos;
    expect(sim.applyMove('p', { ...s0, x: s0.x + 0.1, yaw: 0, pitch: 0, flags: FLAG_MOVING })).toBe(true);
    sim.tick(0.05);
    expect(sim.applyMove('p', { x: s0.x + 15, y: 0, z: s0.z, yaw: 0, pitch: 0, flags: FLAG_MOVING })).toBe(false);
    expect(sim.drainTeleports().get('p')).toBeDefined();
    // walk into the building wall at z=0 next to the platform
    sim.debugPlace('p', { x: -17, y: 0, z: 0.35 });
    sim.tick(0.1);
    expect(sim.applyMove('p', { x: -17, y: 0, z: -0.1, yaw: 0, pitch: 0, flags: FLAG_MOVING })).toBe(false);
    expect(sim.applyMove('p', { x: NaN, y: 0, z: 0, yaw: 0, pitch: 0, flags: 0 })).toBe(false);
  });

  it('rejects interactions from too far away', () => {
    const sim = fresh();
    expect(sim.interact('p', 'logbook').ok).toBe(false);
    expect(sim.interact('p', 'does_not_exist').ok).toBe(false);
  });

  it('a wrong fuse combination trips the breaker and locks it out', () => {
    const sim = fresh();
    sim.debugPlace('p', at(posOf(sim, 'fuse_box')));
    const { fuse } = sim.debugSecrets();
    sim.fuseSet('p', 0, fuse[0] === 30 ? 5 : 30);
    expect(sim.fuseSubmit('p').ok).toBe(false);
    expect(sim.fuseSubmit('p').reason).toMatch(/tripped/);
    expect(sim.fuseSet('p', 7, 10).ok).toBe(false);
    expect(sim.fuseSet('p', 0, 11).ok).toBe(false);
  });

  it('locked doors stay shut without the key', () => {
    const sim = fresh();
    sim.debugPlace('p', { x: 24.6, y: 0, z: 0.8 });
    expect(sim.interact('p', 'd_maint').ok).toBe(false);
  });

  it('sanitises radio chat', () => {
    const sim = fresh();
    sim.drainEvents();
    sim.chat('p', '<script>hi</script>\u0007 there');
    const chat = sim.drainEvents().find((e) => e.type === 'chat');
    expect(chat && chat.type === 'chat' && chat.text).toBe('scripthi/script there');
  });
});

describe('MatchSimulation — the Caller', () => {
  it('AI hunts eventually, and a held flashlight beam stuns it', () => {
    const sim = new MatchSimulation({ seed: 77, mode: 'solo' });
    sim.addSurvivor('p', 'A', 'aditi');
    sim.tick(0.05);
    const me = at(posOf(sim, 'flashlight_kit'));
    sim.debugPlace('p', me);
    sim.interact('p', 'flashlight_kit');
    sim.debugPlace('p', { x: 0, y: 0, z: 3.5 });
    sim.threat = 70;
    let hunted = false;
    for (let t = 0; t < 400 && !hunted; t += 0.05) {
      sim.debugPlace('p', { x: 0, y: 0, z: 3.5 });
      sim.tick(0.05);
      hunted = sim.snapshot().ghost.mode === 'hunt';
    }
    expect(hunted).toBe(true);

    sim.debugPlaceGhost({ x: 8.5, y: 0, z: 3.5 });
    let stunned = false;
    for (let t = 0; t < 3 && !stunned; t += 0.05) {
      sim.applyMove('p', { x: 0, y: 0, z: 3.5, yaw: -Math.PI / 2, pitch: 0, flags: FLAG_FLASHLIGHT });
      sim.tick(0.05);
      stunned = sim.snapshot().ghost.mode === 'stunned';
    }
    expect(stunned).toBe(true);
    expect(sim.snapshot().survivors[0].status).toBe('alive');
  });

  it('cannot find a survivor who hid unseen', () => {
    const sim = new MatchSimulation({ seed: 3, mode: 'versus' });
    sim.addSurvivor('a', 'A', 'aditi');
    sim.addSurvivor('b', 'B', 'kabir');
    sim.setGhostController('g', 'Ghost');
    run(sim, 61);
    const spot = PLATFORM_ZERO.hidingSpots[0];
    sim.debugPlace('a', spot.entry);
    expect(sim.interact('a', spot.id).ok).toBe(true);
    expect(sim.ghostAbility('g', 'hunt').ok).toBe(true);
    run(sim, 3);
    sim.debugPlaceGhost(spot.entry);
    expect(sim.ghostCapture('g').ok).toBe(false);
    expect(sim.snapshot().survivors.find((s) => s.id === 'a')!.status).toBe('alive');
  });

  it('versus: capture downs a survivor, Kabir revives fast, abilities obey cooldowns', () => {
    const sim = new MatchSimulation({ seed: 4, mode: 'versus' });
    sim.addSurvivor('a', 'Aditi', 'aditi');
    sim.addSurvivor('k', 'Kabir', 'kabir');
    sim.setGhostController('g', 'Ghost');
    sim.tick(0.05);
    expect(sim.ghostAbility('g', 'hunt').ok).toBe(false); // grace period
    run(sim, 61);
    expect(sim.ghostAbility('g', 'echo', { x: -15, y: 0, z: 4 }).ok).toBe(false); // out of range (ghost is in the tunnel)
    sim.debugPlaceGhost({ x: -18, y: 0, z: 4 });
    expect(sim.ghostAbility('g', 'echo', { x: -15, y: 0, z: 4 }).ok).toBe(true);
    expect(sim.ghostAbility('g', 'echo', { x: -15, y: 0, z: 4 }).ok).toBe(false); // cooldown
    run(sim, 20); // regain energy
    expect(sim.ghostAbility('g', 'hunt').ok).toBe(true);
    run(sim, 3);
    expect(sim.snapshot().ghost.mode).toBe('hunt');
    const a = sim.snapshot().survivors.find((s) => s.id === 'a')!;
    sim.debugPlaceGhost({ x: a.pos.x - 1, y: a.pos.y, z: a.pos.z });
    expect(sim.ghostCapture('g').ok).toBe(true);
    expect(sim.snapshot().survivors.find((s) => s.id === 'a')!.status).toBe('downed');

    const down = sim.snapshot().survivors.find((s) => s.id === 'a')!.pos;
    sim.debugPlace('k', { x: down.x + 1, y: down.y, z: down.z });
    expect(sim.reviveStart('k', 'a').ok).toBe(true);
    run(sim, 2.2);
    expect(sim.snapshot().survivors.find((s) => s.id === 'a')!.status).toBe('alive');
  });

  it('solo capture ends the run; retry restores the last checkpoint', () => {
    const sim = new MatchSimulation({ seed: 11, mode: 'solo' });
    sim.addSurvivor('p', 'A', 'aditi');
    sim.setGhostController('g'); // drive the Caller directly for a deterministic capture
    sim.tick(0.05);
    sim.debugPlace('p', at(posOf(sim, 'flashlight_kit')));
    sim.interact('p', 'flashlight_kit');
    run(sim, 85);
    expect(sim.ghostAbility('g', 'hunt').ok).toBe(true);
    run(sim, 3);
    const p = sim.snapshot().survivors[0].pos;
    sim.debugPlaceGhost({ x: p.x + 0.8, y: p.y, z: p.z });
    expect(sim.ghostCapture('g').ok).toBe(true);
    expect(sim.snapshot().ended).toBe(true);
    expect(sim.snapshot().result?.winner).toBe('ghost');
    expect(sim.retryFromCheckpoint()).toBe(true);
    const s = sim.snapshot();
    expect(s.ended).toBe(false);
    expect(s.survivors[0].status).toBe('alive');
    expect(s.survivors[0].hasFlashlight).toBe(true);
    expect(s.world.objectives.flashlight).toBe(true);
    expect(sim.checkpointsUsed).toBe(1);
  });
});
