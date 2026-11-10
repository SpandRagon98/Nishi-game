import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { BoxDef, LevelDef, MaterialId } from '@nishi/shared';
import { useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TEXTURE_SCALE, type TextureLibrary } from './textures';

const METALNESS: Partial<Record<MaterialId, number>> = { rust: 0.35, metal: 0.6, corrugated: 0.45, carriage: 0.15 };
const NORMAL_SCALE: Partial<Record<MaterialId, number>> = { ballast: 1.4, brick: 1, stone: 1.1, corrugated: 1.2, platform: 0.6 };

/** how strongly each surface shows vertical drip streaks (walls) and damp patches (floors) */
const WEATHERING: Partial<Record<MaterialId, [streak: number, wet: number]>> = {
  tile: [1, 1], plaster: [1, 0], brick: [0.8, 0], concrete: [0.7, 0.55], mosaic: [0.5, 0.6], stone: [0.8, 0.3],
  platform: [0.4, 0.45], ceiling: [0.9, 0], corrugated: [0.6, 0], rust: [0.4, 0], wood: [0.2, 0],
};

/**
 * World-space weathering layered over the tiling textures, so no two metres of wall look alike:
 * large grime blotches, finer mottling, rust-brown drip streaks running down walls from the ceiling,
 * and damp floor patches that turn dark and glossy. A few cheap value-noise lookups per pixel.
 */
function weather(m: THREE.MeshStandardMaterial, streak: number, wet: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uStreak = { value: streak };
    shader.uniforms.uWet = { value: wet };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
uniform float uStreak;
uniform float uWet;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float wDamp = 0.0;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 wp = vWPos;
  float wall = 1.0 - abs(vWNrm.y);
  // along-wall coordinate, whichever way the wall faces
  float u = abs(vWNrm.x) > abs(vWNrm.z) ? wp.z : wp.x;
  vec2 q = mix(wp.xz, vec2(u, wp.y), wall);
  float big = wNoise(q * 0.23 + 7.3);
  float fine = wNoise(q * 1.1 + 2.1);
  float grime = mix(0.6, 1.06, smoothstep(0.18, 0.82, big)) * mix(0.84, 1.0, fine);
  // drips: thin columns that are long in y and fade in and out along their length
  float col = wNoise(vec2(u * 3.1, wp.y * 0.22 + 4.0));
  float drip = smoothstep(0.62, 0.86, col) * wNoise(vec2(u * 0.6, 1.7)) * wall * uStreak;
  diffuseColor.rgb = mix(diffuseColor.rgb * grime, diffuseColor.rgb * vec3(0.5, 0.42, 0.34), drip * 0.75);
  // damp patches on floors
  float floorK = smoothstep(0.7, 0.95, vWNrm.y);
  wDamp = smoothstep(0.52, 0.66, wNoise(wp.xz * 0.3 + 11.0) * 0.75 + fine * 0.25) * floorK * uWet;
  diffuseColor.rgb *= 1.0 - wDamp * 0.35;
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.1, wDamp);');
  };
}

export function makeMaterials(lib: TextureLibrary, detail = true): Record<MaterialId, THREE.Material> {
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
    if (detail) {
      const [streak, wet] = WEATHERING[id] ?? [0.3, 0];
      weather(out[id] as THREE.MeshStandardMaterial, streak, wet);
    }
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
/**
 * the platform's public-address horns, bolted to the canopy posts and angled down at the platform.
 * Ma's voice comes out of these in the decode scene, which looks up at the one on the x = 12 post.
 */
export const PA_HORNS = [-28, -12, 4, 12, 28].map((x) => new THREE.Vector3(x, 4.1, 6.05));
/** the same surface seen from the other side (for the inside of an open shape on a one-sided material) */
function inside(g: THREE.BufferGeometry) {
  const f = g.toNonIndexed();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = f.getAttribute(name);
    for (let i = 0; i < a.count; i += 3) for (let k = 0; k < a.itemSize; k++) {
      const t = a.getComponent(i + 1, k);
      a.setComponent(i + 1, k, a.getComponent(i + 2, k));
      a.setComponent(i + 2, k, t);
    }
  }
  const n = f.getAttribute('normal');
  for (let i = 0; i < n.array.length; i++) (n.array as Float32Array)[i] *= -1;
  return f;
}

function hornGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  for (const h of PA_HORNS) {
    const tilt = new THREE.Matrix4().makeRotationX(-0.45);
    const at = new THREE.Matrix4().makeTranslation(h.x, h.y, h.z);
    // flared bell (mouth towards -z), the driver behind it, and the bracket into the post
    const bell = new THREE.CylinderGeometry(0.05, 0.19, 0.46, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.23);
    const driver = new THREE.CylinderGeometry(0.075, 0.075, 0.14, 14).rotateX(Math.PI / 2).translate(0, 0, 0.05);
    const arm = new THREE.BoxGeometry(0.05, 0.05, 0.3).translate(0, 0.02, 0.2);
    for (const g of [bell, inside(bell.clone().scale(0.96, 0.96, 1)), driver]) parts.push(g.applyMatrix4(tilt).applyMatrix4(at));
    parts.push(arm.applyMatrix4(at));
  }
  return mergeGeometries(parts.map((g) => g.index ? g.toNonIndexed() : g))!;
}

export function LevelMeshes({ level, materials, shadows }: { level: LevelDef; materials: Record<MaterialId, THREE.Material>; shadows: boolean }) {
  const parts = useMemo(() => buildLevelGeometry(level), [level]);
  const horns = useMemo(hornGeometry, []);
  return (
    <group name="level">
      <mesh geometry={horns} material={materials.rust} castShadow={shadows} />
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
