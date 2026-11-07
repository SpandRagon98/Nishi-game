import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { BoxDef, LevelDef, MaterialId } from '@nishi/shared';
import { useMemo } from 'react';
import * as THREE from 'three';
import { TEXTURE_SCALE, type TextureLibrary } from './textures';

const METALNESS: Partial<Record<MaterialId, number>> = { rust: 0.35, metal: 0.6, corrugated: 0.45, carriage: 0.15 };
const NORMAL_SCALE: Partial<Record<MaterialId, number>> = { ballast: 1.4, brick: 1, stone: 1.1, corrugated: 1.2, platform: 0.6 };

export function makeMaterials(lib: TextureLibrary): Record<MaterialId, THREE.Material> {
  const out = {} as Record<MaterialId, THREE.Material>;
  for (const id of Object.keys(TEXTURE_SCALE) as MaterialId[]) {
    if (id === 'darkness') {
      out[id] = new THREE.MeshBasicMaterial({ color: '#000000' });
      continue;
    }
    const set = lib[id];
    const ns = NORMAL_SCALE[id] ?? 0.8;
    out[id] = new THREE.MeshStandardMaterial({
      map: set?.map,
      roughnessMap: set?.roughnessMap,
      normalMap: set?.normalMap,
      normalScale: new THREE.Vector2(ns, ns),
      roughness: 1,
      metalness: METALNESS[id] ?? 0,
      envMapIntensity: id === 'platform' || id === 'mosaic' || id === 'tile' ? 1.2 : 0.5,
    });
  }
  return out;
}

interface Bucket {
  pos: number[];
  nrm: number[];
  uv: number[];
  idx: number[];
}

const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

function addBox(b: Bucket, c: [number, number, number], s: [number, number, number], rotZ: number, scale: [number, number]) {
  const cos = Math.cos(rotZ);
  const sin = Math.sin(rotZ);
  const rot = (x: number, y: number): [number, number] => [x * cos - y * sin, x * sin + y * cos];
  for (const f of FACES) {
    const [nx, ny] = rot(f.n[0], f.n[1]);
    const nz = f.n[2];
    const base = b.pos.length / 3;
    const ax = Math.abs(nx);
    const ay = Math.abs(ny);
    const az = Math.abs(nz);
    for (const k of f.c) {
      const [lx, ly] = rot((k[0] * s[0]) / 2, (k[1] * s[1]) / 2);
      const x = c[0] + lx;
      const y = c[1] + ly;
      const z = c[2] + (k[2] * s[2]) / 2;
      b.pos.push(x, y, z);
      b.nrm.push(nx, ny, nz);
      // world-space planar UVs: seamless tiling across merged boxes
      if (ay >= ax && ay >= az) b.uv.push(x / scale[0], -z / scale[1]);
      else if (ax >= az) b.uv.push((nx > 0 ? -z : z) / scale[0], y / scale[1]);
      else b.uv.push((nz > 0 ? x : -x) / scale[0], y / scale[1]);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function stairsAsSteps(box: BoxDef): { c: [number, number, number]; s: [number, number, number] }[] {
  const len = box.s[0];
  const ang = box.rotZ ?? 0;
  const dx = Math.cos(ang) * len;
  const dy = Math.sin(ang) * len;
  // top-surface endpoints
  const ny = { x: -Math.sin(ang), y: Math.cos(ang) };
  const tx = box.c[0] + (ny.x * box.s[1]) / 2;
  const ty = box.c[1] + (ny.y * box.s[1]) / 2;
  const x0 = tx - dx / 2;
  const y0 = ty - dy / 2;
  const n = Math.max(4, Math.round(Math.abs(dy) / 0.18));
  const bottom = Math.min(y0, y0 + dy) - 0.05;
  const out: { c: [number, number, number]; s: [number, number, number] }[] = [];
  for (let i = 0; i < n; i++) {
    const xa = x0 + (dx * i) / n;
    const xb = x0 + (dx * (i + 1)) / n;
    // tread height = height at the step's upper edge
    const top = dy < 0 ? y0 + (dy * i) / n : y0 + (dy * (i + 1)) / n;
    out.push({ c: [(xa + xb) / 2, (top + bottom) / 2, box.c[2]], s: [Math.abs(xb - xa), top - bottom, box.s[2]] });
  }
  return out;
}

export function buildLevelGeometry(level: LevelDef) {
  const buckets = new Map<MaterialId, Bucket>();
  const get = (m: MaterialId) => {
    let b = buckets.get(m);
    if (!b) buckets.set(m, (b = { pos: [], nrm: [], uv: [], idx: [] }));
    return b;
  };
  for (const box of level.boxes) {
    if (box.hidden) continue;
    const scale = TEXTURE_SCALE[box.mat];
    if (box.kind === 'stairs') {
      for (const st of stairsAsSteps(box)) addBox(get(box.mat), st.c, st.s, 0, scale);
    } else addBox(get(box.mat), box.c, box.s, box.rotZ ?? 0, scale);
  }
  const out: { mat: MaterialId; geo: THREE.BufferGeometry }[] = [];
  for (const [mat, b] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.idx);
    g.computeBoundingSphere();
    out.push({ mat, geo: g });
  }
  return out;
}

/** Visual level geometry (merged: one draw call per material). */
export function LevelMeshes({ level, materials, shadows }: { level: LevelDef; materials: Record<MaterialId, THREE.Material>; shadows: boolean }) {
  const parts = useMemo(() => buildLevelGeometry(level), [level]);
  return (
    <group name="level">
      {parts.map((p) => (
        <mesh key={p.mat} geometry={p.geo} material={materials[p.mat]} receiveShadow={shadows} castShadow={shadows && p.mat !== 'ballast'} />
      ))}
    </group>
  );
}

/** Static physics colliders for every solid box. */
export function LevelColliders({ level }: { level: LevelDef }) {
  const boxes = useMemo(() => level.boxes.filter((b) => b.collide !== false), [level]);
  return (
    <RigidBody type="fixed" colliders={false}>
      {boxes.map((b, i) => (
        <CuboidCollider
          key={i}
          args={[b.s[0] / 2, b.s[1] / 2, b.s[2] / 2]}
          position={b.c}
          rotation={[0, 0, b.rotZ ?? 0]}
          friction={0}
        />
      ))}
    </RigidBody>
  );
}
