import { circleIntersectsRect, dist, segmentIntersectsRect, type Rect2, type Vec3 } from '../math';
import type { BoxDef, DoorDef, LevelDef, ZoneDef } from './types';

export interface DynamicBlockers {
  closedDoors: string[];
  exitOpen: boolean;
}

interface WallRect extends Rect2 {
  minY: number;
  maxY: number;
  los: boolean;
}

const rectOf = (b: BoxDef): WallRect => ({
  minX: b.c[0] - b.s[0] / 2,
  maxX: b.c[0] + b.s[0] / 2,
  minZ: b.c[2] - b.s[2] / 2,
  maxZ: b.c[2] + b.s[2] / 2,
  minY: b.c[1] - b.s[1] / 2,
  maxY: b.c[1] + b.s[1] / 2,
  los: b.los ?? b.kind === 'wall',
});

const cache = new WeakMap<LevelDef, WallRect[]>();
function staticWalls(level: LevelDef): WallRect[] {
  let w = cache.get(level);
  if (!w) {
    w = level.boxes.filter((b) => (b.kind === 'wall' || b.kind === 'prop') && b.collide !== false && !b.rotZ).map(rectOf);
    cache.set(level, w);
  }
  return w;
}

function doorRect(d: DoorDef): WallRect {
  return { ...d.gap, minY: 0, maxY: d.height, los: true };
}

function dynamicWalls(level: LevelDef, dyn: DynamicBlockers): WallRect[] {
  const out: WallRect[] = [];
  for (const d of level.doors) if (dyn.closedDoors.includes(d.id)) out.push(doorRect(d));
  if (!dyn.exitOpen) out.push(rectOf(level.exitGate));
  return out;
}

export function zoneAt(level: LevelDef, p: Vec3): ZoneDef | undefined {
  return level.zones.find(
    (z) => p.x >= z.rect.minX && p.x <= z.rect.maxX && p.z >= z.rect.minZ && p.z <= z.rect.maxZ && p.y >= z.minY && p.y <= z.maxY,
  );
}

export function inRect(p: Vec3, r: Rect2) {
  return p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
}

/**
 * Server-side movement validation: does a body of `radius` at feet position p overlap a wall?
 * Only walls overlapping the body's vertical span (knee to head) are considered, so floors,
 * ramps and low kerbs never count.
 */
export function penetratesWalls(level: LevelDef, p: Vec3, radius: number, dyn: DynamicBlockers, ignoreDoors = false): boolean {
  const y0 = p.y + 0.5;
  const y1 = p.y + 1.6;
  const test = (w: WallRect) => w.maxY > y0 && w.minY < y1 && circleIntersectsRect(p.x, p.z, radius, w);
  if (staticWalls(level).some(test)) return true;
  const dynWalls = dynamicWalls(level, ignoreDoors ? { closedDoors: [], exitOpen: dyn.exitOpen } : dyn);
  return dynWalls.some(test);
}

export function withinBounds(level: LevelDef, p: Vec3) {
  const { min, max } = level.bounds;
  return p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y && p.z >= min.z && p.z <= max.z;
}

/** Eye-to-eye line of sight; different floors (platform vs passage) never see each other. */
export function hasLineOfSight(level: LevelDef, a: Vec3, b: Vec3, dyn: DynamicBlockers): boolean {
  if (Math.abs(a.y - b.y) > 2.4) return false;
  const eyeY = Math.min(a.y, b.y) + 1.4;
  const blocks = (w: WallRect) => w.los && w.minY < eyeY && w.maxY > eyeY && segmentIntersectsRect(a.x, a.z, b.x, b.z, w);
  return !staticWalls(level).some(blocks) && !dynamicWalls(level, dyn).some(blocks);
}

// ───────────── navigation graph ─────────────
export interface NavGraph {
  ids: string[];
  pos: Map<string, Vec3>;
  adj: Map<string, string[]>;
}

const navCache = new WeakMap<LevelDef, NavGraph>();
export function navGraph(level: LevelDef): NavGraph {
  let g = navCache.get(level);
  if (g) return g;
  const pos = new Map(level.waypoints.map((w) => [w.id, w.pos] as const));
  const adj = new Map<string, string[]>(level.waypoints.map((w) => [w.id, []]));
  for (const [a, b] of level.edges) {
    if (!pos.has(a) || !pos.has(b)) throw new Error(`Bad nav edge ${a}-${b}`);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  g = { ids: level.waypoints.map((w) => w.id), pos, adj };
  navCache.set(level, g);
  return g;
}

export function nearestNode(g: NavGraph, p: Vec3): string {
  let best = g.ids[0];
  let bd = Infinity;
  for (const id of g.ids) {
    const q = g.pos.get(id)!;
    // weight vertical distance heavily so the passage and platform are not confused
    const d = Math.hypot(q.x - p.x, (q.y - p.y) * 3, q.z - p.z);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best;
}

/** A* over the waypoint graph. Returns node ids from start to goal inclusive, or [] if unreachable. */
export function findPath(g: NavGraph, start: string, goal: string): string[] {
  if (start === goal) return [start];
  const open = new Set([start]);
  const came = new Map<string, string>();
  const gScore = new Map([[start, 0]]);
  const h = (id: string) => dist(g.pos.get(id)!, g.pos.get(goal)!);
  const fScore = new Map([[start, h(start)]]);
  while (open.size) {
    let cur = '';
    let best = Infinity;
    for (const id of open) {
      const f = fScore.get(id) ?? Infinity;
      if (f < best) {
        best = f;
        cur = id;
      }
    }
    if (cur === goal) {
      const path = [cur];
      while (came.has(cur)) {
        cur = came.get(cur)!;
        path.unshift(cur);
      }
      return path;
    }
    open.delete(cur);
    for (const n of g.adj.get(cur)!) {
      const t = gScore.get(cur)! + dist(g.pos.get(cur)!, g.pos.get(n)!);
      if (t < (gScore.get(n) ?? Infinity)) {
        came.set(n, cur);
        gScore.set(n, t);
        fScore.set(n, t + h(n));
        open.add(n);
      }
    }
  }
  return [];
}
