/**
 * Her grips: per finger and thumb, how far each joint curls, blended between named grips. The
 * scanned hand (scanhand.ts) takes these on its bones.
 */
export type Grip = 'relax' | 'flat' | 'phone' | 'ear' | 'point' | 'reel' | 'pinch' | 'fist' | 'type' | 'tap';

/** per finger [knuckle, middle, tip] curl in radians (towards the palm), then the side spread */
type FingerPose = [number, number, number, number];
interface Pose {
  fingers: [FingerPose, FingerPose, FingerPose, FingerPose]; // index, middle, ring, little
  /** thumb: swing across the palm, lift off it, bend of its two joints */
  thumb: [number, number, number, number];
}

const POSES: Record<Grip, Pose> = {
  relax: { fingers: [[0.25, 0.35, 0.2, 0.05], [0.3, 0.4, 0.22, 0], [0.34, 0.45, 0.24, -0.04], [0.4, 0.5, 0.26, -0.1]], thumb: [0.35, 0.3, 0.15, 0.2] },
  flat: { fingers: [[0.06, 0.08, 0.04, 0.07], [0.05, 0.08, 0.04, 0], [0.06, 0.09, 0.05, -0.06], [0.08, 0.1, 0.05, -0.13]], thumb: [0.15, 0.55, 0.05, 0.05] },
  // the phone lies along her fingers and palm, its back on them; the thumb steadies its near edge
  phone: { fingers: [[0.14, 0.12, 0.08, 0.05], [0.12, 0.12, 0.08, 0], [0.14, 0.14, 0.09, -0.05], [0.18, 0.16, 0.1, -0.1]], thumb: [0.3, 0.55, 0.25, 0.2] },
  // the phone at her ear: the fingers wrapped round its back
  ear: { fingers: [[0.35, 0.45, 0.3, 0.02], [0.35, 0.45, 0.3, 0], [0.4, 0.5, 0.3, -0.02], [0.45, 0.55, 0.3, -0.05]], thumb: [0.3, 0.55, 0.25, 0.2] },
  point: { fingers: [[0.05, 0.08, 0.06, 0.02], [1.15, 1.35, 0.7, 0], [1.2, 1.4, 0.7, -0.05], [1.25, 1.4, 0.7, -0.1]], thumb: [0.9, 0.2, 0.5, 0.4] },
  // the reel stood against her palm: fingers spread flat up its back, their tips curling over the top of the
  // rim; the rim in the web of her thumb, the thumb across its face
  reel: { fingers: [[0.12, 0.18, 0.55, 0.16], [0.1, 0.16, 0.6, 0.02], [0.12, 0.18, 0.6, -0.1], [0.16, 0.2, 0.55, -0.22]], thumb: [0.55, 0.95, 0.25, 0.35] },
  // the phone in her palm, the thumb hovering over its screen to type; pressing a key
  type: { fingers: [[0.14, 0.12, 0.08, 0.05], [0.12, 0.12, 0.08, 0], [0.14, 0.14, 0.09, -0.05], [0.18, 0.16, 0.1, -0.1]], thumb: [1.65, 1.0, 0.6, 0.45] },
  tap: { fingers: [[0.14, 0.12, 0.08, 0.05], [0.12, 0.12, 0.08, 0], [0.14, 0.14, 0.09, -0.05], [0.18, 0.16, 0.1, -0.1]], thumb: [1.65, 0.85, 0.75, 0.55] },
  pinch: { fingers: [[0.65, 0.75, 0.35, 0.02], [0.8, 0.95, 0.55, 0], [0.95, 1.1, 0.6, -0.05], [1.05, 1.2, 0.6, -0.1]], thumb: [0.85, 0.55, 0.3, 0.3] },
  fist: { fingers: [[1.3, 1.5, 0.9, 0.02], [1.35, 1.55, 0.95, 0], [1.4, 1.6, 0.95, -0.04], [1.45, 1.6, 0.95, -0.08]], thumb: [0.9, 0.3, 0.7, 0.5] },
};

if (import.meta.env.DEV) (window as unknown as { __poses: typeof POSES }).__poses = POSES;

export interface HandPose {
  grip: Grip;
  /** blend towards a second grip */
  to?: Grip;
  k?: number;
  /** extra curl on every joint (tremble, a nervous grip), radians */
  tense?: number;
}

export function blendPose(p: HandPose): Pose {
  const a = POSES[p.grip];
  if (!p.to || !p.k) return a;
  const b = POSES[p.to];
  const k = p.k;
  const m = (x: number, y: number) => x + (y - x) * k;
  return {
    fingers: a.fingers.map((f, i) => f.map((x, j) => m(x, b.fingers[i][j])) as FingerPose) as Pose['fingers'],
    thumb: a.thumb.map((x, j) => m(x, b.thumb[j])) as Pose['thumb'],
  };
}
