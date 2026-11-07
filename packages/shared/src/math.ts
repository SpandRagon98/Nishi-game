export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dist2D = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
export const copyV = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

/** Normalised angle difference in (-PI, PI]. */
export function angleDiff(a: number, b: number) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Forward vector for a yaw (radians) / pitch, using the convention yaw=0 faces -Z. */
export function forwardFromYawPitch(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** Yaw that faces from a towards b (same convention). */
export function yawTowards(a: Vec3, b: Vec3) {
  return Math.atan2(-(b.x - a.x), -(b.z - a.z));
}

export interface Rect2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/** Liang–Barsky segment vs axis-aligned rectangle (XZ plane). */
export function segmentIntersectsRect(ax: number, az: number, bx: number, bz: number, r: Rect2): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - r.minX, r.maxX - ax, az - r.minZ, r.maxZ - az];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

export function circleIntersectsRect(x: number, z: number, radius: number, r: Rect2) {
  const cx = clamp(x, r.minX, r.maxX);
  const cz = clamp(z, r.minZ, r.maxZ);
  return (x - cx) ** 2 + (z - cz) ** 2 < radius * radius;
}
