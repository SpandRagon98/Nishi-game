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
};
