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
 * her arms out and screams. Procedural, no assets: four draw calls per figure.
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
float vn = gNoise(vBody.xy * 23.0 + vec2(vBody.z * 19.0, 0.0)) + 0.35 * gNoise(vBody.zy * 61.0);
float vein = (1.0 - smoothstep(0.0, 0.02, abs(vn - 0.68))) * smoothstep(0.35, 0.7, gNoise(vBody.xz * 9.0 + 3.1));
diffuseColor.rgb *= mix(0.8, 1.06, mott);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.24, 0.3), vein * 0.22);`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= mix(0.7, 1.2, mott);');
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
diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.35, 0.62, gNoise(vec2(vAng * 2.5, vH * 3.0))));
// the skirt: a fan of pleats down the front, and the tuck where it is gathered in at the waist
float sk = step(0.0, vHem) * step(vHem, 0.1);
float pf = sk * (1.0 - smoothstep(0.14, 0.32, abs(vAng - 1.5708))) * (1.0 - smoothstep(0.86, 0.98, vH));
diffuseColor.rgb *= 1.0 - pf * 0.4 * pow(0.5 + 0.5 * cos(vAng * 70.0), 4.0);
diffuseColor.rgb *= 1.0 - sk * 0.3 * smoothstep(0.95, 1.0, vH);
// the blouse's hem under the wrap
diffuseColor.rgb *= 1.0 - step(vHem, -0.5) * 0.28 * exp(-pow((vH - 1.19) / 0.008, 2.0));`,
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
    // the under layers and the roots sit in their own shadow, highlights included; and black hair
    // stays black under a torch: a thin wet sheen, not a mirror
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular = min(reflectedLight.directSpecular * 0.5, vec3(0.02));\nreflectedLight.indirectSpecular *= 0.2;')
      .replace('#include <opaque_fragment>', 'outgoingLight *= vColor.rgb;\n#include <opaque_fragment>');
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
/** half-extents of the shell the hair lies on: it has to clear the sculpted cranium (headSdf) everywhere */
const HEAD_S = new THREE.Vector3(0.079, 0.12, 0.105);
/** a point on the face, in metres from the middle of the head */
const F = (x: number, y: number, z: number) => new THREE.Vector3(x + HEAD_C.x, y + HEAD_C.y, z + HEAD_C.z);

// landmarks of the face, metres from the middle of the head (+z forward, she looks down +z)
const EYE = { x: 0.031, y: 0.005, z: 0.056, r: 0.011 };
const MOUTH_Y = -0.0625;
const MOUTH_W = 0.0235;

// ── signed distances (metres): the head is sculpted as one smooth surface ──
const sdEll = (x: number, y: number, z: number, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number) => {
  const px = (x - cx) / rx;
  const py = (y - cy) / ry;
  const pz = (z - cz) / rz;
  const k0 = Math.hypot(px, py, pz);
  const k1 = Math.hypot(px / rx, py / ry, pz / rz);
  return (k0 * (k0 - 1)) / Math.max(k1, 1e-6);
};
const sdCap = (x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) => {
  const pax = x - ax, pay = y - ay, paz = z - az;
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const h = THREE.MathUtils.clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
};
const smin = (a: number, b: number, k: number) => {
  const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
};
const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

/**
 * A gaunt woman's head: a long skull, a narrow jaw and small chin, high cheekbones over hollow
 * cheeks, a brow over deep sockets, a thin straight nose with nostril wings, and thin lips.
 */
function headSdf(x: number, y: number, z: number) {
  const ax = Math.abs(x);
  let d = sdEll(x, y, z, 0, 0.028, -0.016, 0.07, 0.088, 0.092); // cranium
  d = smin(d, sdEll(x, y, z, 0, -0.03, 0.022, 0.06, 0.068, 0.064), 0.03); // the face
  d = smin(d, sdEll(x, y, z, 0, -0.068, 0.012, 0.05, 0.042, 0.07), 0.025); // jaw
  d = smin(d, sdEll(x, y, z, 0, -0.094, 0.058, 0.021, 0.018, 0.02), 0.015); // chin
  d = smin(d, sdEll(ax, y, z, 0.043, -0.004, 0.052, 0.019, 0.012, 0.02), 0.012); // cheekbones
  d = smin(d, sdCap(ax, y, z, 0.006, 0.022, 0.079, 0.026, 0.027, 0.077, 0.0055), 0.01); // brows, arching
  d = smin(d, sdCap(ax, y, z, 0.026, 0.027, 0.077, 0.047, 0.022, 0.066, 0.005), 0.01);
  d = smin(d, sdCap(x, y, z, 0, 0.01, 0.077, 0, -0.025, 0.097, 0.0058), 0.008); // bridge of the nose
  d = smin(d, Math.hypot(x, y + 0.029, z - 0.097) - 0.0095, 0.006); // its tip
  d = smin(d, Math.hypot(ax - 0.011, y + 0.033, z - 0.088) - 0.0068, 0.005); // nostril wings
  d = smin(d, sdCap(x, y, z, -0.019, -0.0575, 0.0835, 0.019, -0.0575, 0.0835, 0.0055), 0.006); // upper lip
  d = smin(d, sdCap(x, y, z, -0.017, -0.067, 0.0815, 0.017, -0.067, 0.0815, 0.006), 0.006); // lower lip
  d = smax(d, -sdEll(ax, y, z, EYE.x, EYE.y, 0.073, 0.019, 0.0135, 0.016), 0.008); // eye sockets
  d = smin(d, Math.hypot(ax - EYE.x, y - EYE.y, z - EYE.z) - (EYE.r + 0.0012), 0.004); // lids over the eyeballs
  // the opening between the lids: a narrow almond, tilted up at the outer corner
  const ex = ax - EYE.x;
  d = smax(d, -sdEll(ax, y - ex * 0.12, z, EYE.x + 0.001, EYE.y - 0.0008, EYE.z + EYE.r, 0.0115, 0.0042, 0.0062), 0.0015);
  d = smax(d, -sdEll(ax, y, z, 0.05, -0.045, 0.066, 0.016, 0.02, 0.013), 0.012); // hollow cheeks
  return d;
}

/**
 * The head: a sphere grid, densest across the face, each vertex pushed out along its ray onto the
 * sculpted surface. The mouth is a real slit: everything below it is carried by the jaw, so when the
 * jaw drops the mouth tears open into the dark behind it. Creases and hollows are shaded darker.
 */
function headGeometry() {
  const WS = 96;
  const HS = 72;
  const pos: number[] = [];
  const shade: [number, number, number][] = [];
  const jawW: number[] = [];
  const slit: boolean[] = [];
  const grad = (x: number, y: number, z: number) => {
    const e = 0.0005;
    return new THREE.Vector3(
      headSdf(x + e, y, z) - headSdf(x - e, y, z),
      headSdf(x, y + e, z) - headSdf(x, y - e, z),
      headSdf(x, y, z + e) - headSdf(x, y, z - e),
    ).normalize();
  };
  for (let j = 0; j <= HS; j++) {
    const el = Math.PI / 2 - (j / HS) * Math.PI;
    for (let i = 0; i <= WS; i++) {
      // more columns across the face than round the back
      const s = (i / WS) * 2 - 1;
      const az = Math.PI * (0.55 * s + 0.45 * s * s * s);
      const dx = Math.cos(el) * Math.sin(az);
      const dy = Math.sin(el);
      const dz = Math.cos(el) * Math.cos(az);
      // march out to the surface, then halve the step down to it
      let lo = 0.04;
      let hi = lo;
      while (hi < 0.2 && headSdf(dx * hi, dy * hi, dz * hi) < 0) {
        lo = hi;
        hi += 0.005;
      }
      for (let k = 0; k < 14; k++) {
        const m = (lo + hi) / 2;
        if (headSdf(dx * m, dy * m, dz * m) < 0) lo = m;
        else hi = m;
      }
      const t = (lo + hi) / 2;
      const x = dx * t;
      const y = dy * t;
      const z = dz * t;
      pos.push(x, y, z);
      // how enclosed the point is: sockets, creases and hollows sit in their own shadow
      const n = grad(x, y, z);
      const ao = THREE.MathUtils.clamp(headSdf(x + n.x * 0.008, y + n.y * 0.008, z + n.z * 0.008) / 0.008, 0, 1);
      const lip = Math.max(0, 1 - Math.min(
        sdCap(x, y, z, -0.019, -0.0575, 0.0835, 0.019, -0.0575, 0.0835, 0.0055),
        sdCap(x, y, z, -0.017, -0.067, 0.0815, 0.017, -0.067, 0.0815, 0.006),
      ) / 0.004) * sstep(0.07, 0.08, z);
      // dark, bruised skin round the eyes
      const ring = Math.exp(-((Math.hypot(Math.abs(x) - EYE.x, (y - EYE.y) * 1.3) / 0.022) ** 2)) * sstep(0.03, 0.06, z);
      const c = (0.42 + 0.58 * ao) * (1 - 0.2 * ring);
      shade.push([c * (1 - 0.12 * lip), c * (1 - 0.32 * lip), c * (1 - 0.14 * lip) * 1.03]);
      const inMouth = Math.abs(x) < MOUTH_W && z > 0.06;
      slit.push(inMouth);
      jawW.push(inMouth ? (y < MOUTH_Y ? 1 : 0) : sstep(MOUTH_Y + 0.004, MOUTH_Y - 0.008, y) * sstep(-0.045, 0.0, z));
    }
  }
  const at = (i: number, j: number) => j * (WS + 1) + i;
  // closed lips: the rows either side of the line of the mouth meet on it, so at rest the mouth is
  // a thin dark line (and still tears open when the jaw drops)
  for (let i = 0; i <= WS; i++) {
    for (let j = 0; j < HS; j++) {
      const u = at(i, j);
      const l = at(i, j + 1);
      if (!slit[u] || !slit[l] || pos[u * 3 + 1] < MOUTH_Y || pos[l * 3 + 1] >= MOUTH_Y) continue;
      const zc = Math.min(pos[u * 3 + 2], pos[l * 3 + 2]) - 0.001;
      pos[u * 3 + 1] = MOUTH_Y + 1e-5;
      pos[l * 3 + 1] = MOUTH_Y - 1e-5;
      pos[u * 3 + 2] = pos[l * 3 + 2] = zc;
    }
  }
  const idx: number[] = [];
  // the slit: no faces across the line of the mouth between the lips
  const cut = (a: number, b: number, c: number) => {
    const v = [a, b, c];
    if (!v.every((k) => slit[k])) return false;
    const below = v.filter((k) => pos[k * 3 + 1] < MOUTH_Y).length;
    return below > 0 && below < 3;
  };
  for (let j = 0; j < HS; j++) {
    for (let i = 0; i < WS; i++) {
      const a = at(i, j);
      const b = at(i, j + 1);
      const c = at(i + 1, j + 1);
      const d = at(i + 1, j);
      if (j !== 0 && !cut(a, b, d)) idx.push(a, b, d);
      if (j !== HS - 1 && !cut(b, c, d)) idx.push(b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
  g.computeVertexNormals();
  let i = 0;
  let k = 0;
  return skin(g, () => {
    const j = jawW[i++];
    return [['head', 1 - j], ['jaw', j]];
  }, () => shade[k++]);
}

/** everything she is made of, built once and shared by every figure */
let built: { skin: THREE.BufferGeometry; cloth: THREE.BufferGeometry; eyes: THREE.BufferGeometry; hair: THREE.BufferGeometry } | null = null;
const SKIN = '#97a0a3';
function callerGeometry() {
  if (built) return built;
  const skinParts: THREE.BufferGeometry[] = [headGeometry()];
  const cloth: THREE.BufferGeometry[] = [];
  const detail: THREE.BufferGeometry[] = [];
  const eyes: THREE.BufferGeometry[] = [];

  // neck: slender, leaning a little forward, the two long neck muscles standing out in a V
  const n0 = new THREE.Vector3(0, 1.425, -0.012);
  const n1 = new THREE.Vector3(0, 1.64, 0.0);
  const neckW = (p: THREE.Vector3): W => {
    const t = (p.y - n0.y) / (n1.y - n0.y);
    const a = sstep(0.05, 0.3, t);
    const b = sstep(0.72, 0.95, t);
    return [['chest', 1 - a], ['neck', a * (1 - b)], ['head', a * b]];
  };
  skinParts.push(skin(limb(n0, n1, [[0.001, 0], [0.056, 0.02], [0.049, 0.18], [0.044, 0.5], [0.043, 0.8], [0.046, 0.96], [0.001, 1]], 20, 0.92), neckW, (p) => 0.82 + 0.18 * sstep(-0.02, 0.03, p.z)));
  for (const side of [1, -1]) {
    skinParts.push(skin(limb(new THREE.Vector3(side * 0.043, 1.645, -0.018), new THREE.Vector3(side * 0.012, 1.478, 0.026), [[0.001, 0], [0.007, 0.08], [0.0095, 0.35], [0.0085, 0.7], [0.006, 0.92], [0.001, 1]], 10), neckW, () => 0.9));
  }
  // the yoke: the skin inside the blouse's neckline, sloping from the neck (higher at the back) out
  // under the neckline, with the hollow of the throat and the inner ends of the collarbones
  {
    const SEG = 56;
    const ROWS = 12;
    const pos: number[] = [];
    const idx: number[] = [];
    const tone: number[] = [];
    for (let r = 0; r <= ROWS; r++) {
      const t = r / ROWS;
      for (let i = 0; i <= SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const fr = Math.sin(a);
        const yNeck = THREE.MathUtils.lerp(1.5, 1.462, (fr + 1) / 2);
        const y = yNeck - (yNeck - 1.451) * t ** 1.5;
        let rad = THREE.MathUtils.lerp(0.036, 0.096, t);
        let dark = 0;
        if (fr > 0) {
          const ax = Math.abs(Math.cos(a) * rad);
          const cy = 1.454;
          const along = sstep(0.01, 0.03, ax) * fr;
          const ridge = Math.exp(-(((y - cy) / 0.004) ** 2));
          const hollow = Math.exp(-(((y - cy - 0.01) / 0.005) ** 2));
          rad += along * (0.0035 * ridge - 0.003 * hollow);
          dark = along * (0.35 * hollow - 0.1 * ridge);
        }
        pos.push(Math.cos(a) * rad, y, Math.sin(a) * rad * 0.68 - 0.008);
        tone.push(0.95 - dark);
        if (r < ROWS && i < SEG) {
          const p = r * (SEG + 1) + i;
          idx.push(p, p + 1, p + SEG + 1, p + 1, p + SEG + 2, p + SEG + 1);
        }
      }
    }
    const yoke = new THREE.BufferGeometry();
    yoke.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    yoke.setIndex(idx);
    yoke.computeVertexNormals();
    let k = 0;
    skinParts.push(skin(yoke, (p) => {
      // its inner edge goes with the neck
      const n = sstep(0.07, 0.045, Math.hypot(p.x, (p.z + 0.008) / 0.68)) * 0.6;
      const w = torsoW(p).map(([b, x]): [BoneId, number] => [b, x * (1 - n)]);
      if (n > 0) w.push(['neck', n]);
      return w;
    }, () => tone[k++]));
  }

  for (const s of ['L', 'R'] as const) {
    const side = s === 'L' ? 1 : -1;
    const sh = J(`arm${s}`);
    const el = J(`fore${s}`);
    const wr = J(`hand${s}`);
    const kn = J(`fing${s}`);
    // arms: one skin from the shoulder to the wrist, so the elbow bends without a seam: a thin deltoid,
    // a wasted upper arm, a bony elbow, the forearm swelling just below it and a narrow wrist
    const top = sh.clone().add(new THREE.Vector3(0, 0.01, 0));
    const aw = wr.clone().sub(top);
    const tE = el.clone().sub(top).dot(aw) / aw.lengthSq();
    skinParts.push(skin(
      limb(top, wr, [[0.001, 0], [0.026, 0.02], [0.038, 0.05], [0.044, 0.1], [0.041, 0.2], [0.036, 0.32], [0.032, 0.42], [0.03, tE - 0.04], [0.032, tE], [0.031, tE + 0.04], [0.033, tE + 0.1], [0.032, tE + 0.18], [0.027, tE + 0.3], [0.022, 0.94], [0.021, 0.985], [0.001, 1]], 16),
      (p): W => {
        const t = THREE.MathUtils.clamp(p.clone().sub(top).dot(aw) / aw.lengthSq(), 0, 1);
        const f = sstep(tE - 0.05, tE + 0.05, t);
        const c = 0.5 * (1 - sstep(0, 0.1, t));
        const h = 0.5 * sstep(0.94, 1, t);
        return [[`arm${s}`, (1 - f) * (1 - c)], [`clav${s}`, (1 - f) * c], [`fore${s}`, f * (1 - h)], [`hand${s}`, f * h]];
      },
      (p) => 0.9 + 0.1 * sstep(-0.03, 0.02, p.z - top.z),
    ));
    // hand: a narrow palm facing her thigh, a thumb, and four long fingers in two bent segments
    const palm = new THREE.SphereGeometry(1, 12, 10);
    palm.scale(0.018, 0.052, 0.042);
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
    skinParts.push(skin(limb(knee, ank, [[0.001, 0], [0.046, 0.03], [0.05, 0.22], [0.04, 0.5], [0.029, 0.85], [0.027, 0.96], [0.001, 1]], 14), along(knee, ank, `shin${s}`, `thigh${s}`, `foot${s}`, 0.12), (p) => 0.55 + 0.45 * sstep(0.08, 0.4, p.y)));
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

    // the blouse sleeve: fitted, rounding over the shoulder, ending a third of the way to the elbow
    cloth.push(skin(limb(sh.clone().add(new THREE.Vector3(0, 0.026, 0)), sh.clone().lerp(el, 0.4), [[0.001, 0], [0.026, 0.05], [0.038, 0.12], [0.045, 0.2], [0.049, 0.32], [0.048, 0.7], [0.046, 0.88], [0.047, 0.97], [0.045, 1]], 16), along(sh, el, `arm${s}`, `clav${s}`, undefined, 0.25), () => 1, -1));
    // bangles near the wrist
    const fdir = wr.clone().sub(el).normalize();
    for (const t of [0.8, 0.86]) {
      const ring = new THREE.TorusGeometry(0.028, 0.0045, 5, 16);
      ring.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), fdir));
      const at = el.clone().lerp(wr, t);
      ring.translate(at.x, at.y, at.z);
      detail.push(skin(ring, `fore${s}`, () => [0.42, 0.37, 0.25]));
    }
  }

  // saree: blouse and wrap over the torso
  const torso = new THREE.LatheGeometry(
    [[0.001, 0.955], [0.138, 0.96], [0.13, 1.0], [0.122, 1.06], [0.125, 1.12], [0.14, 1.2], [0.15, 1.27], [0.158, 1.33], [0.163, 1.37], [0.16, 1.4], [0.145, 1.425], [0.115, 1.444], [0.084, 1.456]].map(([r, y]) => new THREE.Vector2(r, y)),
    64,
  );
  torso.scale(1, 1, 0.72);
  torso.translate(0, 0, -0.008);
  cloth.push(skin(torso, torsoW, () => 1, -1));
  for (const side of [1, -1]) {
    const bust = new THREE.SphereGeometry(0.05, 14, 10);
    bust.scale(1, 0.9, 0.75);
    bust.translate(side * 0.058, 1.29, 0.075);
    cloth.push(skin(bust, 'chest', () => 1, -1));
  }
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

  // inside the mouth: a dark cavity, rotten teeth top and bottom
  const cav = new THREE.SphereGeometry(1, 14, 10);
  cav.scale(0.017, 0.011, 0.016);
  const cc = F(0, MOUTH_Y - 0.001, 0.05);
  cav.translate(cc.x, cc.y, cc.z);
  detail.push(skin(cav, (p) => (p.y > cc.y ? [['head', 1]] : [['jaw', 1]]), () => 0.015));
  const tr = new Rng(77);
  for (const [row, bone] of [[0, 'head'], [1, 'jaw']] as const) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 7 - 0.5) * 1.5;
      const h = tr.range(0.75, 1.1) * (row ? 0.0075 : 0.009);
      const tooth = new THREE.BoxGeometry(0.0048, h, 0.0035);
      tooth.rotateY(a);
      // upper teeth hang to the line of the mouth, lower ones stand just under it
      const y = row ? MOUTH_Y - 0.002 - h / 2 : MOUTH_Y - 0.001 + h / 2;
      const tp = F(Math.sin(a) * 0.019, y + tr.range(-0.001, 0.001), 0.054 + Math.cos(a) * 0.019);
      tooth.translate(tp.x, tp.y, tp.z);
      const dirt = tr.range(0.3, 0.7);
      detail.push(skin(tooth, bone, () => [0.62 * dirt, 0.56 * dirt, 0.42 * dirt]));
    }
  }
  // milky eyes deep in the sockets, behind the lids
  for (const side of [1, -1]) {
    const e = F(side * EYE.x, EYE.y, EYE.z);
    detail.push(skin(new THREE.SphereGeometry(EYE.r, 16, 12).translate(e.x, e.y, e.z), 'head', () => [0.36, 0.38, 0.37]));
    // a pale, pinprick iris that catches the light
    const iris = new THREE.SphereGeometry(1, 8, 6);
    iris.scale(0.0042, 0.0042, 0.0018);
    iris.translate(e.x + side * 0.0008, e.y + 0.0005, e.z + EYE.r - 0.0004);
    eyes.push(skin(iris, 'head'));
  }

  // teeth, mouth, eyeballs and bangles draw in the skin's own draw call, after it, so the lips always
  // cover the teeth (separate transparent meshes sort by their centres and can draw in either order).
  // Their colours were given as-is: undo the skin's tint.
  const tint = new THREE.Color(SKIN);
  for (const g of detail) {
    const c = g.attributes.color as THREE.BufferAttribute;
    for (let i = 0; i < c.count; i++) c.setXYZ(i, c.getX(i) / tint.r, c.getY(i) / tint.g, c.getZ(i) / tint.b);
  }
  skinParts.push(...detail);
  built = {
    skin: mergeGeometries(skinParts),
    cloth: mergeGeometries(cloth),
    eyes: mergeGeometries(eyes),
    hair: hairGeometry(),
  };
  for (const g of Object.values(built)) g.computeBoundingSphere();
  return built;
}

/**
 * Long, wet hair: strands rooted all over the scalp, lying flat along the skull (the top layers over
 * the lower ones, so no scalp shows), then hanging free in clumps. The front falls over the forehead
 * and hangs in a curtain either side of the face, the eyes and mouth showing through a narrow gap,
 * with a few loose locks across it. Built in the head bone's space; `aRoot` is where each strand
 * leaves the skull, so the shader hangs only the free part with gravity.
 */
function hairGeometry() {
  const r = new Rng(31313);
  const pos: number[] = [];
  const at: number[] = [];
  const ph: number[] = [];
  const nr: number[] = [];
  const roots: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const lerp = THREE.MathUtils.lerp;
  const HJ = J('head');
  // a little back from the middle of the head: the cranium sits behind the face
  const C = HEAD_C.clone().sub(HJ).add(new THREE.Vector3(0, 0, -0.006));
  // the scalp: a little outside the skull everywhere
  const B = HEAD_S.clone().multiply(new THREE.Vector3(1.07, 1.08, 1.1));
  /** a point on the scalp: `th` round from the face, `u` the height on the unit head, `lift` off it */
  const scalp = (th: number, u: number, lift: number) => {
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    return new THREE.Vector3(Math.sin(th) * s * B.x * lift, u * B.y * lift, Math.cos(th) * s * B.z * lift).add(C);
  };
  /** piecewise linear through [x, ...values] rows (x sorted either way), column `k` */
  const table = (rows: number[][], x: number, k: number) => {
    for (let i = 0; i < rows.length - 1; i++) {
      const x0 = rows[i][0];
      const x1 = rows[i + 1][0];
      if ((x - x0) * (x - x1) <= 0) return lerp(rows[i][k], rows[i + 1][k], (x - x0) / (x1 - x0));
    }
    const last = rows[rows.length - 1];
    return Math.abs(x - rows[0][0]) < Math.abs(x - last[0]) ? rows[0][k] : last[k];
  };
  // by |θ|/π: the hairline (the lowest roots), and where the hair leaves the skull
  const HAIRLINE = [[0, 0.52], [0.2, 0.3], [0.5, -0.05], [1, -0.5]];
  const EXIT = [[0, 0.42], [0.22, 0.2], [0.5, 0.05], [1, -0.02]];
  // what the hanging hair has to clear, by body height: half-width, depth in front and behind (face, jaw,
  // neck, shoulders, chest, hips). She stoops, so her back comes up into hair hanging from her head.
  const BODY = [[1.8, B.x * 1.05, B.z * 1.13, B.z * 1.05], [1.56, B.x * 0.95, B.z * 1.1, 0.11], [1.5, 0.11, 0.1, 0.13], [1.44, 0.235, 0.13, 0.17], [1.3, 0.2, 0.14, 0.19], [1.0, 0.17, 0.16, 0.2], [0.4, 0.2, 0.17, 0.2]];
  const clear = (th: number, yb: number) => {
    const ex = table(BODY, yb, 1);
    const ez = table(BODY, yb, Math.cos(th) > 0 ? 2 : 3);
    return 1 / Math.sqrt((Math.sin(th) / ex) ** 2 + (Math.cos(th) / ez) ** 2) + 0.012;
  };
  // the gap in the front curtain, by body height: shut over the brow, open on the eyes and the mouth
  const GAP = [[1.75, 0], [1.718, 0.026], [1.692, 0.032], [1.64, 0.03], [1.58, 0.036], [1.4, 0.045], [0.8, 0.05]];

  /** a ribbon through `pts`; `onSkull` points lie on the scalp, the rest hang (`ts` 0..1 down the free part) */
  const strand = (pts: THREE.Vector3[], ts: number[], onSkull: number, root: THREE.Vector3, width: number, phase: number, shade: number, tilt: number) => {
    const base = pos.length / 3;
    pts.forEach((pt, i) => {
      const nx = pt.x;
      const nz = pt.z - C.z;
      const nl = Math.hypot(nx, nz) || 1;
      // the width runs round the head; the normal faces out (and up, on the skull)
      const tx = nz / nl;
      const tz = -nx / nl;
      const w = width * (1 - 0.6 * ts[i]) * (1 - 0.92 * sstep(0.72, 1, ts[i])) * 0.5;
      const up = i < onSkull ? 0.6 : 0;
      // darker at the root, lighter out along the strand
      const sh = shade * lerp(0.6, 1, Math.min(1, (i + 1) / (onSkull + 2) + ts[i]));
      for (const sgn of [-1, 1]) {
        pos.push(pt.x + tx * w * sgn, pt.y, pt.z + tz * w * sgn);
        at.push(ts[i]);
        ph.push(phase);
        // each strand turned a little its own way, so a torch catches some, not the whole curtain
        nr.push(nx / nl + tx * tilt, up, nz / nl + tz * tilt);
        roots.push(root.x, root.y, root.z);
        col.push(sh, sh, sh);
      }
      if (i < pts.length - 1) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
  };

  const CLUMPS = 290;
  const SEG = 12;
  for (let c = 0; c < CLUMPS; c++) {
    const thC = r.range(-Math.PI, Math.PI);
    const aC = Math.abs(thC) / Math.PI;
    // roots spread evenly up from the hairline, so the small front is the densest
    const uC = r.range(table(HAIRLINE, aC, 1), 0.98);
    const phase = r.range(0, Math.PI * 2);
    const front = aC < 0.3;
    const L = aC > 0.6 ? r.range(0.62, 0.85) : front ? r.range(0.42, 0.64) : r.range(0.5, 0.74);
    const loose = front && r.chance(0.08);
    const n = loose ? 1 : 2 + Math.floor(r.range(0, 3));
    for (let k = 0; k < n; k++) {
      const th = thC + r.range(-0.07, 0.07);
      const a = Math.abs(th) / Math.PI;
      const hl = table(HAIRLINE, a, 1);
      const u0 = THREE.MathUtils.clamp(uC + r.range(-0.05, 0.05), hl, 1);
      const uE = Math.min(u0, table(EXIT, a, 1));
      // the higher the root, the further out its layer lies
      const layer = sstep(hl, 1, u0);
      const lift = 1.01 + 0.04 * layer + r.range(0, 0.006);
      const Ls = L * r.range(0.82, 1.08);
      const pts: THREE.Vector3[] = [];
      const ts: number[] = [];
      // on the skull: straight down from the root to where it lifts off
      const ns = Math.max(1, Math.ceil((u0 - uE) / 0.1));
      for (let i = 0; i <= ns; i++) {
        pts.push(scalp(th, lerp(u0, uE, i / ns), lift));
        ts.push(0);
      }
      const E = pts[pts.length - 1].clone();
      let rad = Math.hypot(E.x, E.z - C.z);
      // hanging: the sides fall in front of or behind the shoulders; the front parts round the face
      const side = a > 0.3 && a < 0.72;
      const toward = side ? (a < 0.5 ? 0.24 : 0.78) * Math.PI * Math.sign(th) : th;
      const gather = r.range(-0.04, 0.04);
      const width = loose ? r.range(0.003, 0.006) : r.range(0.014, 0.026);
      // a loose lock hangs in across the gap, over an eye, from its own side
      const drift = loose ? r.range(0.4, 0.9) : 0;
      for (let i = 1; i <= SEG; i++) {
        // finer near the head, where the curtain parts
        const t = (i / SEG) ** 1.4;
        const d = Ls * t;
        const y = E.y - d;
        const yb = y + HJ.y;
        const thH = lerp(th, toward, sstep(0.04, 0.22, d)) + gather * t;
        rad = Math.max(rad, clear(thH, yb), clear(thH, yb - 0.05));
        let x = Math.sin(thH) * rad;
        const z = Math.cos(thH) * rad + C.z;
        if (front) {
          // the strand's edge, not its middle, stops at the gap
          const g = table(GAP, yb, 1) * (1 - drift * sstep(1.76, 1.7, yb) * sstep(1.56, 1.66, yb)) + width * 0.5;
          const X = 0.09;
          // each strand stays on the side it grows from
          if (Math.abs(x) < X || Math.sign(x) !== (Math.sign(th) || 1)) x = (Math.sign(th) || 1) * (g + (Math.min(Math.abs(x), X) * (X - g)) / X);
        }
        pts.push(new THREE.Vector3(x, y + 0.012 * Math.sin(t * 9 + phase) * t, z));
        ts.push(t);
      }
      strand(pts, ts, ns + 1, E, width, phase, r.range(0.8, 1.1) * lerp(0.5, 1, layer), r.range(-0.7, 0.7));
    }
  }
  // the scalp under it all, in the deepest shadow
  const cap = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.42);
  cap.scale(B.x, B.y, B.z);
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
    col.push(0.6, 0.6, 0.6);
  }
  for (let i = 0; i < cap.index!.count; i++) idx.push(base + cap.index!.getX(i));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  g.setAttribute('aRoot', new THREE.Float32BufferAttribute(roots, 3));
  g.setIndex(idx);
  return g;
}

// ───────────────────────────── the figure ─────────────────────────────

const damp = THREE.MathUtils.damp;
const q = new THREE.Quaternion();
const down = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export function CallerFigure({ control }: { control: React.MutableRefObject<GhostControl> }) {
  const u = useMemo<U>(() => ({ uTime: { value: 0 }, uSpeed: { value: 0 }, uRim: { value: 1 } }), []);
  const grav = useMemo(() => ({ value: new THREE.Vector3(0, -1, 0) }), []);
  const rig = useMemo(() => {
    const geo = callerGeometry();
    const { skeleton, bones, rest } = makeSkeleton();
    // a faint cold pallor of her own, so the face reads even at the edge of the beam
    const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, emissive: '#0e1417', roughness: 0.52, vertexColors: true, transparent: true });
    skinShader(skinMat, u);
    const clothMat = new THREE.MeshStandardMaterial({ color: '#b3b2ab', emissive: '#08090a', roughness: 0.95, vertexColors: true, side: THREE.DoubleSide, transparent: true });
    clothShader(clothMat, u);
    // a faint glint, just over the bloom threshold
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 2.0, 2.25), toneMapped: false, transparent: true });
    const hairMat = new THREE.MeshStandardMaterial({ color: '#050506', roughness: 0.45, metalness: 0.1, vertexColors: true, side: THREE.DoubleSide, transparent: true });
    hairShader(hairMat, u, grav);
    // one pass, not a back pass and a front pass: the hair is most of her triangles
    hairMat.forceSinglePass = true;
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
      meshes: [mk(geo.skin, skinMat), mk(geo.cloth, clothMat), mk(geo.eyes, eyeMat)],
      mats: [skinMat, clothMat, eyeMat, hairMat],
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
    set('jaw', 0.003 + breathe * 0.003 + sc * (0.6 + 0.05 * Math.sin(t * 31)) + stun * 0.22, 0, 0);
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
    // hair hangs with gravity whatever the head does, but drapes along her back and chest as she
    // stoops (hanging straight down, it would cut through her)
    b('chest').getWorldQuaternion(q);
    down.copy(DOWN).applyQuaternion(q).lerp(DOWN, 0.3);
    rig.head.getWorldQuaternion(q).invert();
    grav.value.copy(down).applyQuaternion(q).normalize();
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
