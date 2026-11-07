import { MatchSimulation, PLATFORM_ZERO } from '@nishi/shared';
import { describe, expect, it } from 'vitest';
import { findTarget } from '../src/game/targeting';

const setup = () => {
  const sim = new MatchSimulation({ seed: 42, mode: 'solo', passiveGhost: true });
  sim.addSurvivor('p', 'Tester', 'aditi');
  return sim;
};

describe('interaction targeting', () => {
  it('targets the item in front of the camera and ignores items behind it', () => {
    const sim = setup();
    const kit = sim.snapshot().world.itemPos.flashlight_kit;
    sim.debugPlace('p', { x: kit.x, y: kit.y - 1, z: kit.z + 1 });
    const snap = sim.snapshot();
    const me = snap.survivors[0];
    const eye = { x: me.pos.x, y: me.pos.y + 1.6, z: me.pos.z };
    const toward = { x: kit.x - eye.x, y: kit.y - eye.y, z: kit.z - eye.z };
    const len = Math.hypot(toward.x, toward.y, toward.z);
    const fwd = { x: toward.x / len, y: toward.y / len, z: toward.z / len };
    expect(findTarget(PLATFORM_ZERO, snap, me, eye, fwd)?.id).toBe('flashlight_kit');
    expect(findTarget(PLATFORM_ZERO, snap, me, eye, { x: -fwd.x, y: -fwd.y, z: -fwd.z })?.id).not.toBe('flashlight_kit');
  });

  it('labels the locked maintenance door as locked until the key is found', () => {
    const sim = setup();
    sim.debugPlace('p', { x: 24.6, y: 0, z: 1.2 });
    const snap = sim.snapshot();
    const me = snap.survivors[0];
    const eye = { x: 24.6, y: 1.6, z: 1.2 };
    const t = findTarget(PLATFORM_ZERO, snap, me, eye, { x: 0, y: -0.25, z: -0.97 });
    expect(t?.id).toBe('d_maint');
    expect(t?.label).toMatch(/locked/i);
  });
});
