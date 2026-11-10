import type { Vec3 } from '@nishi/shared';

/** Transient, render-only effects. Mutated by the event router, read every frame by the scene. */
export const fx = {
  flicker: new Map<string, number>(),
  apparitions: [] as { id: number; pos: Vec3; yaw: number; until: number; kind: 'apparition' | 'shadow'; scare?: boolean }[],
  echoSense: { points: [] as { pos: Vec3; kind: 'ghost' | 'echo' | 'apparition' }[], until: 0 },
  huntPhase: 'none' as 'none' | 'warning' | 'hunt',
  shake: 0,
  powerOnAt: 0,
  pointerLocked: false,
};

export const now = () => performance.now() / 1000;

let fxId = 1;
export function addApparition(pos: Vec3, yaw: number, duration: number, kind: 'apparition' | 'shadow', scare = false) {
  fx.apparitions.push({ id: fxId++, pos, yaw, until: now() + duration, kind, scare });
}

export function resetFx() {
  fx.flicker.clear();
  fx.apparitions = [];
  fx.echoSense = { points: [], until: 0 };
  fx.huntPhase = 'none';
  fx.shake = 0;
  fx.powerOnAt = 0;
}
