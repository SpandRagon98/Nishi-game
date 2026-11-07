import { describe, expect, it } from 'vitest';
import {
  PLATFORM_ZERO as L, REEL_CANDIDATES, findPath, hasLineOfSight, navGraph, nearestNode, penetratesWalls, zoneAt, type Vec3,
} from '../src';

const open = { closedDoors: [], exitOpen: false };
const gateOpen = { closedDoors: [], exitOpen: true };

describe('Platform Zero level data', () => {
  const g = navGraph(L);

  it('nav graph is fully connected', () => {
    const start = g.ids[0];
    for (const id of g.ids) expect(findPath(g, start, id).length, `unreachable ${id}`).toBeGreaterThan(0);
  });

  it('no nav edge passes through a wall', () => {
    for (const [a, b] of L.edges) {
      const pa = g.pos.get(a)!;
      const pb = g.pos.get(b)!;
      expect(hasLineOfSight(L, pa, pb, gateOpen), `${a} -> ${b}`).toBe(true);
    }
  });

  it('no nav edge passes through solid furniture', () => {
    for (const [a, b] of L.edges) {
      const pa = g.pos.get(a)!;
      const pb = g.pos.get(b)!;
      for (let t = 0; t <= 1; t += 0.05) {
        const p: Vec3 = { x: pa.x + (pb.x - pa.x) * t, y: pa.y + (pb.y - pa.y) * t, z: pa.z + (pb.z - pa.z) * t };
        expect(penetratesWalls(L, p, 0.1, gateOpen), `${a} -> ${b} @${t.toFixed(2)}`).toBe(false);
      }
    }
  });

  it('spawns, hiding entries and checkpoints are standable', () => {
    const pts: [string, Vec3][] = [
      ...L.survivorSpawns.map((p, i) => [`spawn${i}`, p] as [string, Vec3]),
      ...L.hidingSpots.map((h) => [h.id, h.entry] as [string, Vec3]),
      ...Object.entries(L.checkpoints),
      ['ghost', L.ghostSpawn],
    ];
    for (const [name, p] of pts) expect(penetratesWalls(L, p, 0.3, open), name).toBe(false);
  });

  it('every reel candidate lies inside a named zone', () => {
    for (const p of REEL_CANDIDATES) expect(zoneAt(L, p), JSON.stringify(p)).toBeDefined();
  });

  it('the platform and the underground passage cannot see each other', () => {
    expect(hasLineOfSight(L, { x: 0, y: 0, z: 3.5 }, { x: 0, y: -3.5, z: 3.5 }, open)).toBe(false);
  });

  it('closed doors block sight; the sealed exit gate blocks until opened', () => {
    const inOffice = { x: 5, y: 0, z: -3 };
    const onPlatform = { x: 4.6, y: 0, z: 3 };
    expect(hasLineOfSight(L, inOffice, onPlatform, open)).toBe(true);
    expect(hasLineOfSight(L, inOffice, onPlatform, { closedDoors: ['d_office'], exitOpen: false })).toBe(false);
    const gateIn = { x: -10, y: 0, z: -13.5 };
    expect(penetratesWalls(L, { x: -10, y: 0, z: -14.1 }, 0.3, open)).toBe(true);
    expect(penetratesWalls(L, { x: -10, y: 0, z: -14.1 }, 0.3, { closedDoors: [], exitOpen: true })).toBe(false);
    expect(gateIn).toBeTruthy();
  });

  it('nearest node respects floors', () => {
    expect(nearestNode(g, { x: 0, y: -3.5, z: 3.5 }).startsWith('u')).toBe(true);
    expect(nearestNode(g, { x: 0, y: 0, z: 3.8 }).startsWith('u')).toBe(false);
  });
});
