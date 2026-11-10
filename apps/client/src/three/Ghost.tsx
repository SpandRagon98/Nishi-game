import { useFrame } from '@react-three/fiber';
import { Rng } from '@nishi/shared';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { now } from '../game/fx';

/**
 * The Caller: a tall, starved woman in a torn, grimy white saree (blouse, skirt and a pallu over one
 * shoulder), long wet black hair hanging in clumps over a grey face, thin bare arms with old bangles,
 * long fingers and bare feet. She is built on a real skeleton (hips, spine, neck, a jaw that drops open,
 * shoulders, elbows, wrists, fingers, knees, ankles), so she walks, limps, runs hunched, lunges with
 * her arms out and screams. Procedural, no assets: five draw calls per figure.
 */
export interface GhostControl {
  opacity: number;
  /** 0..1: ground speed / 5 m/s. Drives the gait: a limping walk, then a hunched run */
  speed: number;
  stunned: boolean;
  /** 0..1: how hard she goes for you. Up close she lunges, arms reaching, jaw open, head snapping */
  scare?: number;
  /** stand dead still: no breathing, no twitching (a figure at the end of the platform) */
  still?: boolean;
}

const NOISE = /* glsl */ `
float gHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gHash(i), gHash(i + vec2(1.0, 0.0)), f.x), mix(gHash(i + vec2(0.0, 1.0)), gHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`;

type U = { uTime: { value: number }; uSpeed: { value: number }; uRim: { value: number } };

/** Cold rim light on any material, so she reads as a pale silhouette in the dark. */
function rim(shader: THREE.WebGLProgramParametersWithUniforms, u: U, color: string, strength: number) {
  Object.assign(shader.uniforms, u, { uRimColor: { value: new THREE.Color(color).multiplyScalar(strength) } });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRimColor * uRim * pow(max(1.0 - abs(dot(normal, normalize(vViewPosition))), 1e-4), 2.6);',
    );
}

/** Wet grey skin: blotchy, dark veins showing through, glossy where it is wettest. */
function skinShader(m: THREE.MeshStandardMaterial, u: U) {
  m.onBeforeCompile = (shader) => {
    rim(shader, u, '#b8cad6', 0.42);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBody;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBody = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBody;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float mott = gNoise(vBody.xy * 46.0 + vBody.z * 23.0) * 0.6 + gNoise(vBody.zy * 11.0) * 0.4;
float vn = gNoise(vBody.xy * 17.0 + vec2(vBody.z * 13.0, 0.0));
float vein = 1.0 - smoothstep(0.0, 0.045, abs(vn - 0.5));
diffuseColor.rgb *= mix(0.78, 1.08, mott);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.13, 0.17), vein * 0.38);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(0.55, 1.25, mott);');
  };
}

/** Cloth: folds, a hem that sways and trails, torn into strips at the bottom, grime collecting low down. */
function clothShader(m: THREE.MeshStandardMaterial, u: U) {
  m.onBeforeCompile = (shader) => {
    rim(shader, u, '#a9c4d6', 0.55);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSpeed;\nattribute float aHem;\nvarying float vH;\nvarying float vAng;\nvarying float vHem;')
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
float fAng = atan(position.z, position.x);
float fArg = 12.0 * fAng + 1.8 * sin(4.0 * fAng);
float fAmp = 0.0065 * (0.35 + clamp((aHem + 1.1 - position.y) / 1.1, 0.0, 1.0));
objectNormal = normalize(objectNormal - vec3(-sin(fAng), 0.0, cos(fAng)) * fAmp * (12.0 + 7.2 * cos(4.0 * fAng)) * cos(fArg) / max(length(position.xz), 0.05));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.xz += position.xz / max(length(position.xz), 0.05) * fAmp * sin(fArg);
float hh = position.y;
float low = clamp((aHem + 0.6 - hh) / 0.6, 0.0, 1.0);
low *= low;
float ang = atan(position.z, position.x);
transformed.x += sin(uTime * 1.3 + ang * 3.0 + hh * 5.0) * low * 0.03;
transformed.z += cos(uTime * 1.05 + ang * 2.0 + hh * 4.0) * low * 0.03 - low * uSpeed * 0.14;
vH = hh;
vAng = ang;
vHem = aHem;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vH;\nvarying float vAng;\nvarying float vHem;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float rag = 0.11 * gNoise(vec2(vAng * 6.0, 1.3)) + 0.06 * gNoise(vec2(vAng * 23.0, 4.1));
if (vH < vHem + rag) discard;
float hole = gNoise(vec2(vAng * 9.0, vH * 7.0));
if (hole > 0.88 && vH < vHem + 0.45) discard;
diffuseColor.rgb *= mix(0.6, 1.0, gNoise(vec2(vAng * 4.0, vH * 5.0)));
// mud and old blood soaked up from the floor; damp, darker patches higher up
diffuseColor.rgb *= mix(vec3(0.3, 0.27, 0.23), vec3(1.0), smoothstep(vHem, vHem + 0.5, vH));
diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.35, 0.62, gNoise(vec2(vAng * 2.5, vH * 3.0))));`,
      );
  };
}

/** Wet hair: clumped strands that hang with gravity whatever the head does, and stream when she runs. */
function hairShader(m: THREE.MeshStandardMaterial, u: U, grav: { value: THREE.Vector3 }) {
  m.onBeforeCompile = (shader) => {
    rim(shader, u, '#7d93a3', 0.3);
    shader.uniforms.uGrav = grav;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSpeed;\nuniform vec3 uGrav;\nattribute float aT;\nattribute float aPhase;\nattribute vec3 aRoot;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float k = aT * aT;
vec3 rel = transformed - aRoot;
// swing the hanging part of each strand from the head's "down" towards the world's down
vec3 ax = cross(vec3(0.0, -1.0, 0.0), uGrav);
float sa = length(ax);
if (sa > 1e-4) {
  ax /= sa;
  float an = atan(sa, dot(vec3(0.0, -1.0, 0.0), uGrav)) * smoothstep(0.05, 0.6, aT);
  rel = rel * cos(an) + cross(ax, rel) * sin(an) + ax * dot(ax, rel) * (1.0 - cos(an));
}
transformed = aRoot + rel;
transformed.x += sin(uTime * 0.85 + aPhase) * k * 0.03;
transformed.z += (cos(uTime * 0.7 + aPhase * 1.3) * 0.025 - uSpeed * 0.3) * k;`,
      );
  };
}

// ───────────────────────────── the skeleton ─────────────────────────────

const BONES = [
  'root', 'hips', 'spine', 'chest', 'neck', 'head', 'jaw',
  'clavL', 'armL', 'foreL', 'handL', 'fingL', 'clavR', 'armR', 'foreR', 'handR', 'fingR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR',
] as const;
type BoneId = (typeof BONES)[number];
const bi = (n: BoneId) => BONES.indexOf(n);

/** rest-pose joint positions in metres (she faces +z; L is her +x side) and each joint's parent */
const JOINT = {} as Record<BoneId, [BoneId | null, number, number, number]>;
const joint = (n: BoneId, parent: BoneId | null, x: number, y: number, z: number) => (JOINT[n] = [parent, x, y, z]);
joint('root', null, 0, 0, 0);
joint('hips', 'root', 0, 0.98, 0);
joint('spine', 'hips', 0, 1.1, -0.01);
joint('chest', 'spine', 0, 1.3, -0.012);
joint('neck', 'chest', 0, 1.47, -0.004);
joint('head', 'neck', 0, 1.6, 0.012);
joint('jaw', 'head', 0, 1.652, 0.004);
for (const [s, side] of [['L', 1], ['R', -1]] as const) {
  joint(`clav${s}`, 'chest', side * 0.03, 1.44, 0);
  joint(`arm${s}`, `clav${s}`, side * 0.178, 1.43, -0.005);
  joint(`fore${s}`, `arm${s}`, side * 0.2, 1.142, -0.012);
  joint(`hand${s}`, `fore${s}`, side * 0.211, 0.9, 0.012);
  joint(`fing${s}`, `hand${s}`, side * 0.214, 0.832, 0.02);
  joint(`thigh${s}`, 'hips', side * 0.088, 0.93, 0);
  joint(`shin${s}`, `thigh${s}`, side * 0.092, 0.5, 0.012);
  joint(`foot${s}`, `shin${s}`, side * 0.094, 0.078, -0.012);
}
const J = (n: BoneId) => new THREE.Vector3(JOINT[n][1], JOINT[n][2], JOINT[n][3]);

function makeSkeleton() {
  const bones = BONES.map((n) => Object.assign(new THREE.Bone(), { name: n }));
  BONES.forEach((n, i) => {
    const [parent, x, y, z] = JOINT[n];
    if (!parent) return;
    const p = JOINT[parent];
    bones[i].position.set(x - p[1], y - p[2], z - p[3]);
    bones[bi(parent)].add(bones[i]);
  });
  bones[0].updateMatrixWorld(true);
  const rest = bones.map((b) => b.position.clone());
  return { skeleton: new THREE.Skeleton(bones), bones, rest };
}

// ───────────────────────────── geometry helpers ─────────────────────────────

type W = [BoneId, number][];
const sstep = (e0: number, e1: number, x: number) => {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const UP = new THREE.Vector3(0, 1, 0);

/** tags every vertex with bone weights (rigid when `w` is a bone) and a vertex colour (shade or rgb) */
function skin(g: THREE.BufferGeometry, w: BoneId | ((p: THREE.Vector3) => W), color: (p: THREE.Vector3) => number | [number, number, number] = () => 1, hem?: number) {
  const geo = g;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  const p = geo.attributes.position as THREE.BufferAttribute;
  const n = p.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i);
    const ws: W = typeof w === 'string' ? [[w, 1]] : w(v).filter(([, x]) => x > 1e-4).slice(0, 4);
    const tot = ws.reduce((s, [, x]) => s + x, 0) || 1;
    ws.forEach(([b, x], k) => {
      si[i * 4 + k] = bi(b);
      sw[i * 4 + k] = x / tot;
    });
    const c = color(v);
    const [r, gg, b] = typeof c === 'number' ? [c, c, c] : c;
    col.set([r, gg, b], i * 3);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (hem !== undefined) geo.setAttribute('aHem', new THREE.Float32BufferAttribute(new Float32Array(n).fill(hem), 1));
  return geo;
}

/** a lathed limb from a to b; the profile is [radius, 0..1 along the limb] */
function limb(a: THREE.Vector3, b: THREE.Vector3, prof: [number, number][], segs = 12, flat = 1) {
  const len = a.distanceTo(b);
  const g = new THREE.LatheGeometry(prof.map(([r, t]) => new THREE.Vector2(r, t * len)), segs);
  if (flat !== 1) g.scale(1, 1, flat);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

/** weights along a→b: `mid` throughout, blending into `start` near a and `end` near b */
const along = (a: THREE.Vector3, b: THREE.Vector3, mid: BoneId, start?: BoneId, end?: BoneId, k = 0.18) => (p: THREE.Vector3): W => {
  const ab = b.clone().sub(a);
  const t = THREE.MathUtils.clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
  const s = start ? 0.5 * (1 - sstep(0, k, t)) : 0;
  const e = end ? 0.5 * sstep(1 - k, 1, t) : 0;
  const w: W = [[mid, 1 - s - e]];
  if (start) w.push([start, s]);
  if (end) w.push([end, e]);
  return w;
};

/** torso weights by height: hips → spine → chest, and the shoulders follow the arms a little */
const torsoW = (p: THREE.Vector3): W => {
  const a = sstep(1.0, 1.14, p.y);
  const b = sstep(1.18, 1.32, p.y);
  const w: W = [['hips', 1 - a], ['spine', a * (1 - b)], ['chest', a * b]];
  const sh = sstep(0.12, 0.17, Math.abs(p.x)) * sstep(1.33, 1.42, p.y) * 0.45;
  if (sh > 0) {
    w.forEach((x) => (x[1] *= 1 - sh));
    w.push([p.x > 0 ? 'armL' : 'armR', sh]);
  }
  return w;
};

const HEAD_C = new THREE.Vector3(0, 1.685, 0.014);
const HEAD_S = new THREE.Vector3(0.079, 0.114, 0.097);
/** a point on the unit head, in body space */
const headAt = (x: number, y: number, z: number) => new THREE.Vector3(x * HEAD_S.x + HEAD_C.x, y * HEAD_S.y + HEAD_C.y, z * HEAD_S.z + HEAD_C.z);

/**
 * The face, from a sphere: a long skull, deep eye sockets under a brow, a thin nose, high cheekbones
 * over hollow cheeks, thin lips and a narrow chin. The mouth is a real slit: everything below it is
 * carried by the jaw, so when the jaw drops the mouth tears open into the dark behind it.
 */
function headGeometry() {
  const WS = 48;
  const HS = 36;
  const g = new THREE.SphereGeometry(1, WS, HS);
  const p = g.attributes.position as THREE.BufferAttribute;
  const orig = p.clone();
  const MOUTH = 24; // first row of the jaw: the slit opens between rows 23 and 24 (y ≈ -0.5)
  const shade: number[] = [];
  const jawW: number[] = [];
  const blob = (x: number, y: number, cx: number, cy: number, r: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const row = Math.floor(i / (WS + 1));
    const { x, y, z } = v;
    const ax = Math.abs(x);
    const front = sstep(0.25, 0.8, z);
    const socket = blob(ax, y, 0.35, 0.08, 0.19) * front;
    const brow = Math.exp(-(((y - 0.27) / 0.075) ** 2)) * (1 - sstep(0.32, 0.62, ax)) * front;
    const nose = Math.exp(-((x / 0.075) ** 2)) * sstep(0.2, -0.18, y) * sstep(-0.34, -0.22, y) * front;
    const nostril = blob(ax, y, 0.075, -0.27, 0.06) * front;
    const cheekbone = blob(ax, y, 0.56, -0.02, 0.17) * sstep(0.0, 0.5, z);
    const hollow = blob(ax, y, 0.52, -0.4, 0.2) * sstep(-0.1, 0.6, z);
    const upperLip = Math.exp(-(((y + 0.45) / 0.05) ** 2)) * Math.exp(-((x / 0.3) ** 2)) * front;
    const lowerLip = Math.exp(-(((y + 0.6) / 0.05) ** 2)) * Math.exp(-((x / 0.27) ** 2)) * front;
    const chin = blob(x, y, 0, -0.84, 0.2) * front;
    // skull: fuller at the top and back, narrowing hard to a small jaw
    v.x *= 1 + 0.05 * sstep(0.1, 0.8, y) - 0.3 * sstep(-0.05, -0.95, y);
    v.z *= 1 + 0.07 * sstep(0, -1, z) * sstep(-0.3, 0.6, y);
    v.multiplyScalar(1 + 0.04 * cheekbone - 0.1 * hollow);
    v.z += 0.05 * brow - 0.17 * socket + 0.17 * nose + 0.03 * nostril + 0.03 * upperLip + 0.02 * lowerLip + 0.04 * chin;
    p.setXYZ(i, v.x, v.y, v.z);
    const slit = row >= MOUTH - 1 && row <= MOUTH && orig.getZ(i) > 0.6 && Math.abs(orig.getX(i)) < 0.33 ? 1 : 0;
    shade.push(1 - 0.8 * socket - 0.3 * hollow - 0.25 * nostril - 0.5 * slit + 0.08 * cheekbone);
    jawW.push(row >= MOUTH ? sstep(-0.4, 0.25, orig.getZ(i)) : 0);
  }
  // the slit: no faces between the lips across the front of the mouth
  const idx: number[] = [];
  const grid = (ix: number, iy: number) => iy * (WS + 1) + ix;
  const inMouth = (k: number) => orig.getZ(k) > 0.6 && Math.abs(orig.getX(k)) < 0.33;
  for (let iy = 0; iy < HS; iy++) {
    for (let ix = 0; ix < WS; ix++) {
      const a = grid(ix + 1, iy);
      const b = grid(ix, iy);
      const c = grid(ix, iy + 1);
      const d = grid(ix + 1, iy + 1);
      if (iy === MOUTH - 1 && [a, b, c, d].every(inMouth)) continue;
      if (iy !== 0) idx.push(a, b, d);
      if (iy !== HS - 1) idx.push(b, c, d);
    }
  }
  g.setIndex(idx);
  g.scale(HEAD_S.x, HEAD_S.y, HEAD_S.z);
  g.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
  g.computeVertexNormals();
  let i = 0;
  const w = jawW;
  const s = shade;
  return skin(g, () => {
    const j = w[i];
    return [['head', 1 - j], ['jaw', j]];
  }, () => {
    const c = s[i++];
    return [c, c, c * 1.04];
  });
}

/** everything she is made of, built once and shared by every figure */
let built: { skin: THREE.BufferGeometry; cloth: THREE.BufferGeometry; detail: THREE.BufferGeometry; eyes: THREE.BufferGeometry; hair: THREE.BufferGeometry } | null = null;
function callerGeometry() {
  if (built) return built;
  const skinParts: THREE.BufferGeometry[] = [headGeometry()];
  const cloth: THREE.BufferGeometry[] = [];
  const detail: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];

  // neck: long and thin, tendons standing out
  const n0 = new THREE.Vector3(0, 1.425, -0.006);
  const n1 = new THREE.Vector3(0, 1.64, 0.01);
  skinParts.push(skin(limb(n0, n1, [[0.001, 0], [0.046, 0.02], [0.04, 0.18], [0.034, 0.5], [0.033, 0.8], [0.037, 0.96], [0.001, 1]], 16, 0.9), (p) => {
    const t = (p.y - n0.y) / (n1.y - n0.y);
    const a = sstep(0.05, 0.3, t);
    const b = sstep(0.72, 0.95, t);
    return [['chest', 1 - a], ['neck', a * (1 - b)], ['head', a * b]];
  }, (p) => 0.85 + 0.15 * sstep(-0.02, 0.03, p.z)));
  // bare skin above the blouse, and the collarbones under it
  const deco = new THREE.LatheGeometry([[0.001, 1.47], [0.06, 1.468], [0.12, 1.455], [0.15, 1.435], [0.155, 1.4]].map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 32);
  deco.scale(1, 1, 0.6);
  deco.translate(0, 0, -0.008);
  skinParts.push(skin(deco, torsoW));
  for (const side of [1, -1]) {
    skinParts.push(skin(limb(new THREE.Vector3(side * 0.02, 1.447, 0.082), new THREE.Vector3(side * 0.15, 1.458, 0.035), [[0.001, 0], [0.008, 0.08], [0.007, 0.5], [0.009, 0.92], [0.001, 1]], 6), 'chest'));
  }

  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? 1 : -1;
    const sh = J(`arm${s}`);
    const el = J(`fore${s}`);
    const wr = J(`hand${s}`);
    const kn = J(`fing${s}`);
    // arms: thin, bony at the elbow and wrist
    skinParts.push(skin(limb(sh.clone().add(new THREE.Vector3(0, 0.035, 0)), el, [[0.001, 0], [0.035, 0.05], [0.036, 0.22], [0.031, 0.6], [0.026, 0.93], [0.001, 1]], 14), along(sh, el, `arm${s}`, `clav${s}`, undefined, 0.12)));
    skinParts.push(skin(new THREE.SphereGeometry(0.026, 10, 8).translate(el.x, el.y, el.z), (p) => (p.y > el.y ? [[`arm${s}`, 0.6], [`fore${s}`, 0.4]] : [[`fore${s}`, 1]])));
    skinParts.push(skin(limb(el.clone().add(new THREE.Vector3(0, 0.015, 0)), wr, [[0.001, 0], [0.025, 0.04], [0.026, 0.14], [0.023, 0.42], [0.017, 0.86], [0.016, 0.97], [0.001, 1]], 12), along(el, wr, `fore${s}`, undefined, `hand${s}`, 0.1)));
    // hand: a narrow palm facing her thigh, a thumb, and four long fingers in two bent segments
    const palm = new THREE.SphereGeometry(1, 12, 10);
    palm.scale(0.015, 0.05, 0.04);
    const pc = wr.clone().lerp(kn, 0.55);
    palm.translate(pc.x, pc.y, pc.z);
    skinParts.push(skin(palm, `hand${s}`));
    skinParts.push(skin(limb(wr.clone().add(new THREE.Vector3(-side * 0.008, -0.02, 0.03)), wr.clone().add(new THREE.Vector3(-side * 0.02, -0.075, 0.062)), [[0.001, 0], [0.011, 0.1], [0.009, 0.6], [0.006, 0.95], [0.001, 1]], 7), `hand${s}`));
    [[0.024, 0.08], [0.008, 0.092], [-0.008, 0.088], [-0.023, 0.07]].forEach(([dz, len]) => {
      const base = kn.clone().add(new THREE.Vector3(0, 0.008, dz));
      const mid = base.clone().add(new THREE.Vector3(-side * 0.006, -len * 0.52, dz * 0.12));
      const tip = mid.clone().add(new THREE.Vector3(-side * 0.016, -len * 0.46, dz * 0.1));
      skinParts.push(skin(limb(base, mid, [[0.001, 0], [0.0072, 0.08], [0.0062, 0.5], [0.0068, 0.95], [0.001, 1]], 7), along(base, mid, `fing${s}`, `hand${s}`, undefined, 0.25)));
      skinParts.push(skin(limb(mid, tip, [[0.001, 0], [0.006, 0.08], [0.005, 0.6], [0.0035, 0.95], [0.001, 1]], 7), `fing${s}`));
    });
    // legs: only the shins and bare feet show under the torn hem
    const knee = J(`shin${s}`);
    const ank = J(`foot${s}`);
    skinParts.push(skin(limb(knee, ank, [[0.001, 0], [0.042, 0.03], [0.04, 0.25], [0.031, 0.7], [0.024, 0.95], [0.001, 1]], 12), along(knee, ank, `shin${s}`, `thigh${s}`, `foot${s}`, 0.12), (p) => 0.55 + 0.45 * sstep(0.08, 0.4, p.y)));
    const foot = new THREE.SphereGeometry(1, 14, 10);
    const fp = foot.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) {
      const y = fp.getY(i);
      // a flat sole, a high arch at the heel and a wider front where the toes splay
      fp.setY(i, Math.max(y, -0.55));
      fp.setX(i, fp.getX(i) * (1 + 0.25 * sstep(0, 1, fp.getZ(i))));
    }
    foot.scale(0.04, 0.034, 0.115);
    foot.translate(ank.x + side * 0.004, 0.034, ank.z + 0.055);
    foot.computeVertexNormals();
    skinParts.push(skin(foot, `foot${s}`, () => 0.5));

    // the blouse sleeve, capped over the round of the shoulder
    cloth.push(skin(new THREE.SphereGeometry(0.052, 14, 10).scale(1, 0.9, 0.85).translate(sh.x - side * 0.004, sh.y + 0.012, sh.z), (): W => [[`arm${s}`, 0.65], [`clav${s}`, 0.35]], () => 1, -1));
    cloth.push(skin(limb(sh.clone().add(new THREE.Vector3(0, 0.04, 0)), sh.clone().lerp(el, 0.36), [[0.044, 0], [0.045, 0.3], [0.043, 0.85], [0.042, 1]], 14), along(sh, el, `arm${s}`, `clav${s}`, undefined, 0.25), () => 1, -1));
    // bangles near the wrist
    const fdir = wr.clone().sub(el).normalize();
    for (const t of [0.8, 0.86]) {
      const ring = new THREE.TorusGeometry(0.022, 0.0045, 5, 16);
      ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fdir));
      const at = el.clone().lerp(wr, t);
      ring.translate(at.x, at.y, at.z);
      detail.push(skin(ring, `fore${s}`, () => [0.42, 0.37, 0.25]));
    }
  }

  // saree: blouse and wrap over the torso
  const torso = new THREE.LatheGeometry(
    [[0.001, 0.955], [0.134, 0.96], [0.136, 1.02], [0.14, 1.1], [0.15, 1.2], [0.162, 1.28], [0.169, 1.33], [0.174, 1.37], [0.17, 1.4], [0.148, 1.428], [0.112, 1.446], [0.084, 1.454]].map(([r, y]) => new THREE.Vector2(r, y)),
    64,
  );
  torso.scale(1, 1, 0.64);
  torso.translate(0, 0, -0.008);
  cloth.push(skin(torso, torsoW, () => 1, -1));
  // skirt: pleated to the floor; each side swings with that leg
  const key: [number, number][] = [[0.045, 0.25], [0.1, 0.245], [0.3, 0.215], [0.55, 0.196], [0.8, 0.19], [0.9, 0.177], [0.97, 0.152], [1.0, 0.142]];
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 28; i++) {
    const y = THREE.MathUtils.lerp(0.045, 1.0, i / 28);
    let k = 0;
    while (k < key.length - 2 && y > key[k + 1][0]) k++;
    const f = (y - key[k][0]) / (key[k + 1][0] - key[k][0]);
    prof.push(new THREE.Vector2(THREE.MathUtils.lerp(key[k][1], key[k + 1][1], THREE.MathUtils.clamp(f, 0, 1)), y));
  }
  const skirt = new THREE.LatheGeometry(prof, 96);
  skirt.scale(1, 1, 0.8);
  cloth.push(skin(skirt, (p) => {
    const leg = 0.7 * sstep(0.9, 0.35, p.y);
    const sideL = sstep(0.02, 0.16, p.x);
    const sideR = sstep(-0.02, -0.16, p.x);
    const k = sstep(0.62, 0.36, p.y);
    return [
      ['hips', 1 - leg * (sideL + sideR)],
      ['thighL', leg * sideL * (1 - k)], ['shinL', leg * sideL * k],
      ['thighR', leg * sideR * (1 - k)], ['shinR', leg * sideR * k],
    ];
  }, () => 1, 0.045));
  // the pallu: from the right hip, across the chest, over the left shoulder and down her back
  const path = new THREE.CatmullRomCurve3([
    [-0.15, 0.97, 0.118], [-0.06, 1.14, 0.13], [0.06, 1.3, 0.122], [0.13, 1.42, 0.07], [0.15, 1.475, -0.01],
    [0.13, 1.4, -0.1], [0.11, 1.2, -0.122], [0.1, 0.95, -0.138], [0.085, 0.62, -0.15],
  ].map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const widths = [0.2, 0.2, 0.17, 0.12, 0.1, 0.16, 0.24, 0.3, 0.34];
  const ROWS = 40;
  const COLS = 7;
  const pos: number[] = [];
  const pidx: number[] = [];
  for (let r = 0; r <= ROWS; r++) {
    const u = r / ROWS;
    const c = path.getPointAt(u);
    const tan = path.getTangentAt(u);
    const out = new THREE.Vector3(c.x, 0, c.z).normalize();
    const across = new THREE.Vector3().crossVectors(tan, out).normalize();
    const wi = widths[Math.min(widths.length - 2, Math.floor(u * (widths.length - 1)))];
    const wj = widths[Math.min(widths.length - 1, Math.floor(u * (widths.length - 1)) + 1)];
    const w = THREE.MathUtils.lerp(wi, wj, (u * (widths.length - 1)) % 1);
    for (let k = 0; k <= COLS; k++) {
      const q = (k / COLS - 0.5) * w;
      // pleats: the cloth bunches into ridges as it gathers over the shoulder
      const ridge = Math.sin((k / COLS) * Math.PI * 4) * 0.006;
      const pt = c.clone().addScaledVector(across, q).addScaledVector(out, ridge + 0.006);
      pos.push(pt.x, pt.y, pt.z);
      if (r < ROWS && k < COLS) {
        const a = r * (COLS + 1) + k;
        pidx.push(a, a + 1, a + COLS + 1, a + 1, a + COLS + 2, a + COLS + 1);
      }
    }
  }
  const pallu = new THREE.BufferGeometry();
  pallu.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pallu.setIndex(pidx);
  pallu.computeVertexNormals();
  cloth.push(skin(pallu, torsoW, () => 0.95, 0.58));

  // inside the mouth: a dark cavity, rotten teeth top and bottom; milky eyes deep in the sockets
  const cav = new THREE.SphereGeometry(1, 14, 10);
  cav.scale(0.03, 0.026, 0.03);
  const cc = headAt(0, -0.53, 0.55);
  cav.translate(cc.x, cc.y, cc.z);
  detail.push(skin(cav, (p) => (p.y > cc.y ? [['head', 1]] : [['jaw', 1]]), () => 0.015));
  const tr = new Rng(77);
  for (const [row, bone, yy] of [[0, 'head', -0.49], [1, 'jaw', -0.565]] as const) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 7 - 0.5) * 1.05;
      const h = tr.range(0.7, 1.15) * (row ? 0.009 : 0.011);
      const tooth = new THREE.BoxGeometry(0.0062, h, 0.004);
      tooth.rotateY(a);
      const tp = headAt(Math.sin(a) * 0.25, yy + (row ? 1 : -1) * tr.range(0, 0.01), 0.58 + Math.cos(a) * 0.2);
      tooth.translate(tp.x, tp.y, tp.z);
      const dirt = tr.range(0.45, 1);
      detail.push(skin(tooth, bone, () => [0.62 * dirt, 0.58 * dirt, 0.46 * dirt]));
    }
  }
  for (const side of [1, -1]) {
    const e = headAt(side * 0.35, 0.08, 0.68);
    detail.push(skin(new THREE.SphereGeometry(0.0125, 12, 10).translate(e.x, e.y, e.z), 'head', () => [0.36, 0.38, 0.37]));
    // a pale, pinprick iris that catches the light
    const iris = new THREE.SphereGeometry(1, 8, 6);
    iris.scale(0.0042, 0.0042, 0.0018);
    iris.translate(e.x + side * 0.0008, e.y + 0.0005, e.z + 0.0118);
    eyes.push(skin(iris, 'head'));
  }

  built = {
    skin: mergeGeometries(skinParts),
    cloth: mergeGeometries(cloth),
    detail: mergeGeometries(detail),
    eyes: mergeGeometries(eyes),
    hair: hairGeometry(),
  };
  for (const g of Object.values(built)) g.computeBoundingSphere();
  return built;
}

/**
 * Long, wet hair as strips hanging from the scalp in clumps, parted over the face with a few loose
 * locks across it. Built in the head bone's space; `aRoot` lets the shader hang it with gravity.
 */
function hairGeometry() {
  const r = new Rng(31313);
  const pos: number[] = [];
  const at: number[] = [];
  const ph: number[] = [];
  const nr: number[] = [];
  const roots: number[] = [];
  const idx: number[] = [];
  const SEG = 12;
  const R = 0.094;
  const C = new THREE.Vector3(0, HEAD_C.y - JOINT.head[2], HEAD_C.z - JOINT.head[3]);
  const CLUMPS = 120;
  for (let c = 0; c < CLUMPS; c++) {
    const theta0 = (c / CLUMPS) * Math.PI * 2 + r.range(-0.02, 0.02); // 0 = facing forward (+z)
    const front = Math.cos(theta0) > 0.35;
    const parting = front && Math.abs(Math.sin(theta0)) < 0.72;
    if (parting && !r.chance(0.12)) continue;
    const L0 = front ? r.range(0.5, 0.82) : r.range(0.9, 1.35);
    const phase = r.range(0, Math.PI * 2);
    const n = parting ? 1 : 2 + Math.floor(r.range(0, 3));
    for (let sI = 0; sI < n; sI++) {
      const theta = theta0 + r.range(-0.03, 0.03);
      const L = L0 * r.range(0.9, 1.05);
      const radial = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
      const tangent = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
      const rootY = C.y + r.range(0.09, 0.112);
      const width = parting ? r.range(0.004, 0.007) : r.range(0.012, 0.026);
      const nrm = radial.clone().addScaledVector(tangent, r.range(-0.3, 0.3)).normalize();
      const base = pos.length / 3;
      // wet hair: the strands of a clump pull together towards the ends
      const gather = r.range(-0.012, 0.012);
      let root: THREE.Vector3 | null = null;
      for (let s = 0; s <= SEG; s++) {
        const t = s / SEG;
        const d = L * t;
        const out = THREE.MathUtils.lerp(0.07, R * 0.92 + 0.012, THREE.MathUtils.smoothstep(d, 0, 0.09)) + 0.1 * THREE.MathUtils.smoothstep(d, 0.1, 0.3) * (parting ? 0.4 : 1);
        const cpt = new THREE.Vector3().addScaledVector(radial, out).addScaledVector(tangent, gather * (1 - t)).setY(rootY - d + 0.015 * Math.sin(t * 9 + phase)).add(new THREE.Vector3(C.x, 0, C.z));
        root ??= cpt.clone();
        const w = width * (1 - 0.7 * t) * 0.5;
        for (const sgn of [-1, 1]) {
          const p = cpt.clone().addScaledVector(tangent, sgn * w);
          pos.push(p.x, p.y, p.z);
          at.push(t);
          ph.push(phase);
          nr.push(nrm.x, nrm.y, nrm.z);
          roots.push(root.x, root.y, root.z);
        }
        if (s < SEG) {
          const a = base + s * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
  }
  // the scalp under it, so no skin shows through the parting
  const cap = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  cap.scale(HEAD_S.x * 1.07, HEAD_S.y * 1.08, HEAD_S.z * 1.1);
  cap.translate(C.x, C.y, C.z - 0.004);
  const cp = cap.attributes.position as THREE.BufferAttribute;
  const cn = cap.attributes.normal as THREE.BufferAttribute;
  const base = pos.length / 3;
  for (let i = 0; i < cp.count; i++) {
    pos.push(cp.getX(i), cp.getY(i), cp.getZ(i));
    nr.push(cn.getX(i), cn.getY(i), cn.getZ(i));
    at.push(0);
    ph.push(0);
    roots.push(cp.getX(i), cp.getY(i), cp.getZ(i));
  }
  for (let i = 0; i < cap.index!.count; i++) idx.push(base + cap.index!.getX(i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  g.setAttribute('aRoot', new THREE.Float32BufferAttribute(roots, 3));
  g.setIndex(idx);
  return g;
}

// ───────────────────────────── the figure ─────────────────────────────

const damp = THREE.MathUtils.damp;
const q = new THREE.Quaternion();

export function CallerFigure({ control }: { control: React.MutableRefObject<GhostControl> }) {
  const u = useMemo<U>(() => ({ uTime: { value: 0 }, uSpeed: { value: 0 }, uRim: { value: 1 } }), []);
  const grav = useMemo(() => ({ value: new THREE.Vector3(0, -1, 0) }), []);
  const rig = useMemo(() => {
    const geo = callerGeometry();
    const { skeleton, bones, rest } = makeSkeleton();
    // a faint cold pallor of her own, so the face reads even at the edge of the beam
    const skinMat = new THREE.MeshStandardMaterial({ color: '#97a0a3', emissive: '#0e1417', roughness: 0.34, vertexColors: true, transparent: true });
    skinShader(skinMat, u);
    const clothMat = new THREE.MeshStandardMaterial({ color: '#b3b2ab', emissive: '#08090a', roughness: 0.95, vertexColors: true, side: THREE.DoubleSide, transparent: true });
    clothShader(clothMat, u);
    const detailMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3, metalness: 0.15, vertexColors: true, transparent: true });
    // a faint glint, just over the bloom threshold
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 2.0, 2.25), toneMapped: false, transparent: true });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#040405', roughness: 0.22, metalness: 0.12, side: THREE.DoubleSide, transparent: true });
    hairShader(hairMat, u, grav);
    const mk = (g: THREE.BufferGeometry, m: THREE.Material) => {
      const s = new THREE.SkinnedMesh(g, m);
      s.bind(skeleton, new THREE.Matrix4());
      s.frustumCulled = false;
      return s;
    };
    const head = bones[bi('head')];
    const hair = new THREE.Mesh(geo.hair, hairMat);
    hair.frustumCulled = false;
    head.add(hair);
    return {
      bones, rest, head,
      meshes: [mk(geo.skin, skinMat), mk(geo.cloth, clothMat), mk(geo.detail, detailMat), mk(geo.eyes, eyeMat)],
      mats: [skinMat, clothMat, detailMat, eyeMat, hairMat],
    };
  }, [u, grav]);

  // gait phase, smoothed drives, head twitches and shoulder spasms
  const st = useRef({ phase: 0, gs: 0, scare: 0, stun: 0, next: 0, until: 0, tz: 0, ty: 0, spasm: 0, nextSpasm: 3 });
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = now();
    const c = control.current;
    const s = st.current;
    const b = (n: BoneId) => rig.bones[bi(n)];
    const target = c.scare ?? 0;
    s.scare = damp(s.scare, target, target > s.scare ? 9 : 2.5, dt);
    s.stun = damp(s.stun, c.stunned ? 1 : 0, 8, dt);
    s.gs = damp(s.gs, c.speed * 5, 5, dt);
    const still = c.still ? 1 : 0;
    const walk = sstep(0.12, 0.9, s.gs);
    const run = sstep(1.8, 3.8, s.gs);
    s.phase += dt * (s.gs / (1.2 + run * 0.7)) * Math.PI * 2;
    const P = s.phase;
    const sn = Math.sin(P);
    const cs = Math.cos(P);
    const sc = s.scare;
    const stun = s.stun;
    const live = 1 - still;
    const breathe = Math.sin(t * 1.15) * live;
    u.uTime.value = t;
    u.uSpeed.value += (c.speed - u.uSpeed.value) * 0.1;
    u.uRim.value = c.stunned ? 2.4 : 1;
    for (const m of rig.mats) m.opacity = c.opacity;

    // twitches: every so often the head snaps to a wrong angle and holds; calm, every few seconds,
    // going for you, constantly. Now and then a shoulder jerks as if something pulled it.
    if (t > s.next) {
      s.until = t + 0.14 + Math.random() * 0.25;
      s.tz = (Math.random() < 0.5 ? -1 : 1) * (0.3 + Math.random() * 0.45);
      s.ty = (Math.random() - 0.5) * 0.9;
      s.next = t + (sc > 0.2 ? 0.45 + Math.random() * 0.6 : 2.5 + Math.random() * 4);
    }
    if (t > s.nextSpasm) {
      s.spasm = 1;
      s.nextSpasm = t + 3 + Math.random() * 5;
    }
    s.spasm = damp(s.spasm, 0, 9, dt);
    const snapping = t < s.until && live > 0;

    const set = (n: BoneId, x: number, y: number, z: number) => b(n).rotation.set(x, y, z);
    // root: the lunge carries her at you; stunned, she shudders
    const root = b('root');
    root.position.set(stun ? (Math.random() - 0.5) * 0.04 : 0, 0, sc * 0.32 - stun * 0.12);
    // hips: a limp (the right leg drags), sinking low when she runs
    b('hips').position.y = rig.rest[bi('hips')].y - 0.02 * walk - Math.abs(sn) * 0.03 * walk - 0.07 * run - 0.05 * sc;
    set('hips', 0.06 * run, sn * 0.12 * walk, 0.05 * (1 - walk) + sn * 0.06 * walk);
    // legs: left takes the long step, right swings short and stiff
    const A = 0.42 * walk * (1 + 0.45 * run);
    const thL = -sn * A - 0.06 * run;
    const thR = sn * A * 0.7 - 0.06 * run;
    const kL = 0.9 * Math.max(0, cs) * walk * (1 + 0.6 * run) + 0.05;
    const kR = 0.45 * Math.max(0, -cs) * walk * (1 + 0.6 * run) + 0.14 * (1 - walk);
    set('thighL', thL, 0, 0.02);
    set('shinL', kL, 0, 0);
    set('footL', -(thL + kL) * 0.85, 0, 0);
    set('thighR', thR, -0.12 * (1 - walk), -0.02);
    set('shinR', kR, 0, 0);
    set('footR', -(thR + kR) * 0.85, 0.15 * (1 - walk), 0);
    // body: hunched, leaning into the run and the lunge, recoiling from the beam
    set('spine', 0.06 + 0.3 * run + 0.12 * sc - 0.22 * stun, -sn * 0.09 * walk, sn * 0.04 * walk);
    set('chest', 0.13 + 0.12 * run + 0.14 * sc + breathe * 0.014 - 0.1 * stun, 0, -0.04 + s.spasm * 0.22 * live);
    const lift = 0.06 + 0.12 * sc + s.spasm * 0.12 * live;
    set('clavL', 0, 0, lift);
    set('clavR', 0, 0, -lift * 0.7);
    // neck pokes forward and the head tilts, chin up, staring
    set('neck', 0.12 + 0.16 * run + 0.26 * sc - 0.15 * stun, 0, 0);
    const h = b('head');
    const tilt = 0.24 + Math.sin(t * 0.55) * 0.04 * live;
    if (snapping) {
      // no easing on the way out: the snap is the scare
      h.rotation.set(-0.05 - 0.28 * sc, s.ty, tilt + s.tz);
    } else {
      h.rotation.x = damp(h.rotation.x, -0.05 - 0.28 * sc + 0.55 * stun, 6, dt);
      h.rotation.y = damp(h.rotation.y, 0.6 * stun, 3, dt);
      h.rotation.z = damp(h.rotation.z, tilt, 3, dt);
    }
    // the jaw hangs a little open; in the lunge it drops into a scream
    set('jaw', 0.035 + breathe * 0.012 + sc * (0.6 + 0.05 * Math.sin(t * 31)) + stun * 0.22, 0, 0);
    // arms: hanging limp and swinging a little; reaching for you; up over her face in the beam
    const swing = 0.13 * walk * (1 - run);
    const runArm = run * (0.62 + 0.28 * sn);
    for (const [sd, sign] of [['L', 1], ['R', -1]] as const) {
      const ph = sign > 0 ? -sn : sn;
      const reach = THREE.MathUtils.lerp(-0.1 + ph * swing - runArm, -1.45 + 0.05 * Math.sin(t * 7.3 + sign) - 0.12 * sign, sc);
      const ax = THREE.MathUtils.lerp(reach, -2.0, stun);
      const az = sign * THREE.MathUtils.lerp(THREE.MathUtils.lerp(0.07, 0.22, sc), -0.55, stun);
      set(`arm${sd}`, ax, 0, az);
      set(`fore${sd}`, THREE.MathUtils.lerp(-0.3 - 0.3 * run - 0.2 * sc, -1.65, stun), sign * 0.2, 0);
      set(`hand${sd}`, 0.12 + 0.25 * sc, 0, 0);
      // fingers curl towards the palm and twitch; in the lunge they splay and claw
      const curl = THREE.MathUtils.lerp(0.38 + 0.08 * Math.sin(t * 13 + sign * 2) * live, -0.15, sc);
      set(`fing${sd}`, 0.25 * sc, 0, -sign * curl);
    }
    // hair hangs with gravity whatever the head does
    rig.head.getWorldQuaternion(q).invert();
    grav.value.set(0, -1, 0).applyQuaternion(q);
  });

  return (
    <group>
      <primitive object={rig.bones[0]} dispose={null} />
      {rig.meshes.map((m, i) => (
        <primitive key={i} object={m} dispose={null} />
      ))}
    </group>
  );
}
