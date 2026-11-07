import type { BoxDef, BoxKind, MaterialId } from './types';

type Extra = Partial<Pick<BoxDef, 'id' | 'los' | 'collide' | 'hidden'>>;

export function box(
  minX: number, minY: number, minZ: number,
  maxX: number, maxY: number, maxZ: number,
  mat: MaterialId, kind: BoxKind, extra: Extra = {},
): BoxDef {
  return {
    c: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    s: [maxX - minX, maxY - minY, maxZ - minZ],
    mat,
    kind,
    ...extra,
  };
}

interface Opening {
  a: number;
  b: number;
  /** opening top; anything above becomes a lintel */
  top: number;
}

/** Wall running along X between x0..x1, occupying z0..z1, with openings (doorways). */
export function wallX(
  z0: number, z1: number, x0: number, x1: number, y0: number, y1: number,
  mat: MaterialId, openings: Opening[] = [], extra: Extra = {},
): BoxDef[] {
  const out: BoxDef[] = [];
  const sorted = [...openings].sort((p, q) => p.a - q.a);
  let cursor = x0;
  for (const o of sorted) {
    if (o.a > cursor) out.push(box(cursor, y0, z0, o.a, y1, z1, mat, 'wall', extra));
    if (o.top < y1) out.push(box(o.a, y0 + o.top, z0, o.b, y1, z1, mat, 'wall', { ...extra, los: false }));
    cursor = o.b;
  }
  if (cursor < x1) out.push(box(cursor, y0, z0, x1, y1, z1, mat, 'wall', extra));
  return out;
}

/** Wall running along Z between z0..z1, occupying x0..x1. */
export function wallZ(
  x0: number, x1: number, z0: number, z1: number, y0: number, y1: number,
  mat: MaterialId, openings: Opening[] = [], extra: Extra = {},
): BoxDef[] {
  const out: BoxDef[] = [];
  const sorted = [...openings].sort((p, q) => p.a - q.a);
  let cursor = z0;
  for (const o of sorted) {
    if (o.a > cursor) out.push(box(x0, y0, cursor, x1, y1, o.a, mat, 'wall', extra));
    if (o.top < y1) out.push(box(x0, y0 + o.top, o.a, x1, y1, o.b, mat, 'wall', { ...extra, los: false }));
    cursor = o.b;
  }
  if (cursor < z1) out.push(box(x0, y0, cursor, x1, y1, z1, mat, 'wall', extra));
  return out;
}

/**
 * Sloped slab along X from (xa, ya) to (xb, yb) spanning z0..z1. The top surface passes exactly
 * through both end points. Kind 'stairs' is drawn as steps by the renderer, but collides as a ramp.
 */
export function slope(
  xa: number, ya: number, xb: number, yb: number, z0: number, z1: number,
  thickness: number, mat: MaterialId, kind: 'ramp' | 'stairs',
): BoxDef {
  const dx = xb - xa;
  const dy = yb - ya;
  const len = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  // local +Y after rotation about Z
  const ny = { x: -Math.sin(angle), y: Math.cos(angle) };
  const mx = (xa + xb) / 2 - ny.x * thickness / 2;
  const my = (ya + yb) / 2 - ny.y * thickness / 2;
  return { c: [mx, my, (z0 + z1) / 2], s: [len, thickness, z1 - z0], mat, kind, rotZ: angle, los: false };
}

export const door = (a: number, b: number, top = 2.2): Opening => ({ a, b, top });
