import { describe, expect, it } from 'vitest';
import { HORROR_EVENTS, Rng, createDirectorState, directorGap, selectHorrorEvent, type DirectorContext } from '../src';

const ctx = (over: Partial<DirectorContext> = {}): DirectorContext => ({
  time: 100,
  threat: 40,
  intensity: 1,
  progress: 3,
  power: false,
  ghostHunting: false,
  survivors: [{ id: 'a', pos: { x: 0, y: 0, z: 0 }, zone: 'platform', distToGhost: 30, hiding: false, isolation: Infinity }],
  separation: 0,
  openDoorNearby: () => true,
  ...over,
});

describe('horror director', () => {
  it('never fires during a hunt', () => {
    const st = createDirectorState();
    expect(selectHorrorEvent(ctx({ ghostHunting: true }), st, new Rng(1))).toBeNull();
  });

  it('respects the global pacing gap', () => {
    const st = createDirectorState();
    const rng = new Rng(7);
    const first = selectHorrorEvent(ctx({ time: 100 }), st, rng);
    expect(first).not.toBeNull();
    expect(selectHorrorEvent(ctx({ time: 101 }), st, rng)).toBeNull();
    expect(selectHorrorEvent(ctx({ time: 100 + directorGap(ctx()) + 0.1 }), st, rng)).not.toBeNull();
  });

  it('gap shrinks with threat and grows with low intensity', () => {
    expect(directorGap({ threat: 90, intensity: 1 })).toBeLessThan(directorGap({ threat: 10, intensity: 1 }));
    expect(directorGap({ threat: 50, intensity: 0.5 })).toBeGreaterThan(directorGap({ threat: 50, intensity: 1.5 }));
  });

  it('applies per-event cooldowns and avoids spamming one event', () => {
    const st = createDirectorState();
    const rng = new Rng(3);
    const seen: string[] = [];
    for (let t = 100; t < 1300; t += 1) {
      const p = selectHorrorEvent(ctx({ time: t }), st, rng);
      if (p) seen.push(`${p.event.id}@${t}`);
    }
    // each event id must respect its own cooldown
    const last: Record<string, number> = {};
    for (const s of seen) {
      const [id, t] = s.split('@');
      const def = HORROR_EVENTS.find((d) => d.id === id)!;
      if (last[id] !== undefined) expect(Number(t) - last[id]).toBeGreaterThanOrEqual(def.cooldown - 1e-6);
      last[id] = Number(t);
    }
    expect(new Set(seen.map((s) => s.split('@')[0])).size).toBeGreaterThan(4);
  });

  it('is deterministic for a given seed', () => {
    const run = () => {
      const st = createDirectorState();
      const rng = new Rng(99);
      const out: string[] = [];
      for (let t = 50; t < 600; t++) {
        const p = selectHorrorEvent(ctx({ time: t }), st, rng);
        if (p) out.push(p.event.id);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('gates events by threat and progress', () => {
    const st = createDirectorState();
    const rng = new Rng(5);
    for (let t = 0; t < 2000; t++) {
      const p = selectHorrorEvent(ctx({ time: t, threat: 0, progress: 0 }), st, rng);
      if (p) {
        expect(p.event.minThreat).toBe(0);
        expect(p.event.minProgress).toBe(0);
      }
    }
  });
});
