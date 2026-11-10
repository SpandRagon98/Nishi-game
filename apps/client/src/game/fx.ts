import type { Vec3 } from '@nishi/shared';

/** Transient, render-only effects. Mutated by the event router, read every frame by the scene. */
export const fx = {
  flicker: new Map<string, number>(),
  apparitions: [] as { id: number; pos: Vec3; yaw: number; until: number; kind: 'apparition' | 'shadow'; scare?: boolean; still?: boolean; vel?: Vec3 }[],
  echoSense: { points: [] as { pos: Vec3; kind: 'ghost' | 'echo' | 'apparition' }[], until: 0 },
  huntPhase: 'none' as 'none' | 'warning' | 'hunt',
  shake: 0,
  powerOnAt: 0,
  /** the reel a scene is looking at, still shown although she has picked it up */
  sceneReel: '',
  pointerLocked: false,
};

export const now = () => performance.now() / 1000;

let fxId = 1;
/** `still`: she stands dead still (no breathing, no twitch); `vel`: she walks or runs that way (m/s) */
export function addApparition(pos: Vec3, yaw: number, duration: number, kind: 'apparition' | 'shadow', scare = false, o: { still?: boolean; vel?: Vec3 } = {}) {
  const a = { id: fxId++, pos: { ...pos }, yaw, until: now() + duration, kind, scare, ...o };
  fx.apparitions.push(a);
  return a;
}

export function resetFx() {
  fx.flicker.clear();
  fx.apparitions = [];
  fx.echoSense = { points: [], until: 0 };
  fx.huntPhase = 'none';
  fx.shake = 0;
  fx.powerOnAt = 0;
}
