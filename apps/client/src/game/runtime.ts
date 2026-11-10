import type { WorldSnapshot } from '@nishi/shared';
import type { GameSession } from './session';

/** Per-frame shared state for the 3D scene (kept outside React to avoid re-renders). */
export const runtime = {
  session: null as GameSession | null,
  snap: null as WorldSnapshot | null,
  /** local camera / listener position */
  eye: { x: 0, y: 1.6, z: 0 },
  power: false,
  menu: false,
  /** dev-only: force the local view direction once (automated screenshots) */
  debugLook: null as { yaw: number; pitch: number } | null,
  /** dev-only: pin the Caller in view (automated screenshots) */
  debugCaller: null as WorldSnapshot['ghost'] | null,
  /** the testing Studio (dev builds only, see studio/): panel, paused world, free camera, ghost pose */
  studio: {
    on: false,
    open: false,
    paused: false,
    fly: false,
    ghost: null as null | { scare: number; speed: number; stunned: boolean; spin: number },
  },
};
