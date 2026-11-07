import { findPath, hasLineOfSight, nearestNode, navGraph, OBJECTIVES, type LevelDef, type SurvivorView, type Vec3, type WorldSnapshot } from '@nishi/shared';

export interface Guidance {
  /** where the current step of the objective is */
  target: Vec3;
  /** what to do there, e.g. "Read the logbook" */
  step: string;
  /** point the player should walk towards next (first corner of the route) */
  heading: Vec3;
  /** route length in metres */
  distance: number;
  /** the target is on another level (the underground passage) */
  vertical: 'up' | 'down' | null;
}

const itemPos = (level: LevelDef, snap: WorldSnapshot, id: string): Vec3 | undefined =>
  snap.world.itemPos[id] ?? level.interactables.find((i) => i.id === id)?.pos;

/** The concrete next step for the current objective, so the HUD can say exactly where to go. */
export function objectiveStep(level: LevelDef, snap: WorldSnapshot, me: SurvivorView): { target: Vec3; step: string } | null {
  const w = snap.world;
  const obj = OBJECTIVES.find((o) => !w.objectives[o.id])?.id;
  if (!obj) return null;
  switch (obj) {
    case 'flashlight': {
      const p = itemPos(level, snap, 'flashlight_kit');
      return p && !me.hasFlashlight ? { target: p, step: 'Take the flashlight from the red emergency kit' } : null;
    }
    case 'office':
      if (!w.office.logbook) return { target: itemPos(level, snap, 'logbook')!, step: "Read the station master's logbook" };
      return { target: itemPos(level, snap, 'drawer')!, step: 'Open the desk drawer' };
    case 'reels': {
      let best: Vec3 | null = null;
      let bd = Infinity;
      for (const r of ['reel_a', 'reel_b', 'reel_c']) {
        if (w.collected.includes(r)) continue;
        const p = itemPos(level, snap, r);
        if (!p) continue;
        const d = Math.hypot(p.x - me.pos.x, (p.y - me.pos.y) * 3, p.z - me.pos.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      const left = 3 - ['reel_a', 'reel_b', 'reel_c'].filter((r) => w.collected.includes(r)).length;
      return best ? { target: best, step: `Find the nearest audio reel (${left} left)` } : null;
    }
    case 'power': {
      const door = level.doors.find((d) => d.id === 'd_maint');
      if (door && w.doors[door.id]?.locked) {
        return {
          target: { x: (door.gap.minX + door.gap.maxX) / 2, y: 0, z: (door.gap.minZ + door.gap.maxZ) / 2 },
          step: 'Unlock the Maintenance Room door with the key',
        };
      }
      return { target: itemPos(level, snap, 'fuse_box')!, step: 'Set the fuses at the fuse box' };
    }
    case 'decode':
      return { target: itemPos(level, snap, 'pa_console')!, step: 'Enter the reel numbers at the announcement console' };
    case 'exit':
      return { target: itemPos(level, snap, 'exit_gate')!, step: 'Start the gate motor' };
    case 'escape': {
      const z = level.escapeZone;
      return { target: { x: (z.minX + z.maxX) / 2, y: 0, z: (z.minZ + z.maxZ) / 2 }, step: 'Run out to the street' };
    }
  }
  return null;
}

/** Route the step through the station's walkable graph so the marker never points through a wall. */
export function guide(level: LevelDef, snap: WorldSnapshot, me: SurvivorView): Guidance | null {
  const s = objectiveStep(level, snap, me);
  if (!s) return null;
  const from = me.pos;
  const dyn = {
    closedDoors: Object.entries(snap.world.doors).filter(([, d]) => !d.open).map(([id]) => id),
    exitOpen: snap.world.exitOpen,
  };
  const sees = (p: Vec3) => hasLineOfSight(level, { ...from, y: from.y }, p, dyn);
  const dy = s.target.y - from.y;
  const vertical = dy < -1.6 ? 'down' : dy > 1.6 ? 'up' : null;
  if (!vertical && sees(s.target)) {
    return { ...s, heading: s.target, distance: Math.hypot(s.target.x - from.x, s.target.z - from.z), vertical };
  }
  const g = navGraph(level);
  const route = findPath(g, nearestNode(g, from), nearestNode(g, s.target)).map((id) => g.pos.get(id)!);
  route.push(s.target);
  // string-pull: aim at the furthest route point we can already see (same floor), not the node behind us
  let i = 0;
  for (let k = route.length - 1; k > 0; k--) {
    if (Math.abs(route[k].y - from.y) < 1.2 && sees(route[k])) {
      i = k;
      break;
    }
  }
  const pts = route.slice(i);
  const heading = pts.find((p) => Math.hypot(p.x - from.x, p.z - from.z) > 1.2 || Math.abs(p.y - from.y) > 1.2) ?? s.target;
  let distance = 0;
  let prev = from;
  for (const p of pts) {
    distance += Math.hypot(p.x - prev.x, p.y - prev.y, p.z - prev.z);
    prev = p;
  }
  return { ...s, heading, distance, vertical };
}
