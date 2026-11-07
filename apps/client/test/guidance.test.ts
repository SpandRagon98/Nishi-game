import { MatchSimulation, PLATFORM_ZERO, type Vec3 } from '@nishi/shared';
import { describe, expect, it } from 'vitest';
import { guide } from '../src/game/guidance';

const at = (p: Vec3): Vec3 => ({ x: p.x, y: p.y - 1, z: p.z });
const posOf = (sim: MatchSimulation, id: string) =>
  sim.snapshot().world.itemPos[id] ?? PLATFORM_ZERO.interactables.find((i) => i.id === id)!.pos!;

function setup() {
  const sim = new MatchSimulation({ seed: 77, mode: 'solo', passiveGhost: true });
  sim.addSurvivor('p', 'Aditi', 'aditi');
  sim.tick(0.05);
  const me = () => sim.snapshot().survivors[0];
  const use = (id: string) => {
    sim.debugPlace('p', at(posOf(sim, id)));
    return sim.interact('p', id);
  };
  return { sim, me, use };
}

describe('objective guidance', () => {
  it('points a new player straight at the emergency kit a few metres away', () => {
    const { sim, me } = setup();
    const g = guide(PLATFORM_ZERO, sim.snapshot(), me())!;
    expect(g.step).toMatch(/emergency kit/);
    expect(g.distance).toBeLessThan(10);
    expect(g.vertical).toBeNull();
  });

  it('walks the player through the office one step at a time', () => {
    const { sim, me, use } = setup();
    use('flashlight_kit');
    expect(guide(PLATFORM_ZERO, sim.snapshot(), me())!.step).toMatch(/logbook/);
    use('logbook');
    expect(guide(PLATFORM_ZERO, sim.snapshot(), me())!.step).toMatch(/drawer/);
    use('drawer');
    expect(guide(PLATFORM_ZERO, sim.snapshot(), me())!.step).toMatch(/reel/);
  });

  it('sends a player in the underground passage back up the stairs for a platform objective', () => {
    const { sim, me } = setup();
    sim.debugPlace('p', { x: 0, y: -3.5, z: 3.5 });
    const g = guide(PLATFORM_ZERO, sim.snapshot(), me())!;
    expect(g.vertical).toBe('up');
    expect(g.distance).toBeGreaterThan(20);
  });
});
