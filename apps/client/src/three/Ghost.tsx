import { useFrame } from '@react-three/fiber';
import { Rng } from '@nishi/shared';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { now } from '../game/fx';

/**
 * The Caller as a woman: a tall figure in a torn, grimy white saree with the pallu over her shoulders,
 * long wet black hair parted over a grey face and falling past her waist, thin bare arms with old
 * bangles, and eyes that glow white. Hem and hair drift on their own; she hovers rather than walks.
 * Everything is procedural (no assets) and costs a handful of draw calls.
 */
export interface GhostControl {
  opacity: number;
  /** 0..1, how fast she is moving: hair and hem stream behind */
  speed: number;
  stunned: boolean;
  /** 0..1: how hard she goes for you. Up close she lunges, arms reaching, head snapping */
  scare?: number;
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

/** Cold rim light on any material, so she reads as a pale silhouette in the dark like a backlit figure. */
function rim(shader: THREE.WebGLProgramParametersWithUniforms, u: U, color: string, strength: number) {
  Object.assign(shader.uniforms, u, { uRimColor: { value: new THREE.Color(color).multiplyScalar(strength) } });
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uRim;\nuniform vec3 uRimColor;')
    .replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRimColor * uRim * pow(max(1.0 - abs(dot(normal, normalize(vViewPosition))), 1e-4), 2.6);',
    );
}

/** Cloth: hem sways and trails, the bottom edge is torn into strips, grime collects low down. */
function cloth(m: THREE.MeshStandardMaterial, u: U, hem: number) {
  m.onBeforeCompile = (shader) => {
    rim(shader, u, '#a9c4d6', 0.55);
    shader.uniforms.uHem = { value: hem };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSpeed;\nuniform float uHem;\nvarying float vH;\nvarying float vAng;')
      // uneven vertical folds, deeper towards the hem where the cloth hangs heavy
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
float fAng = atan(position.z, position.x);
float fArg = 12.0 * fAng + 1.8 * sin(4.0 * fAng);
float fAmp = 0.0075 * (0.35 + clamp((uHem + 1.1 - position.y) / 1.1, 0.0, 1.0));
objectNormal = normalize(objectNormal - vec3(-sin(fAng), 0.0, cos(fAng)) * fAmp * (12.0 + 7.2 * cos(4.0 * fAng)) * cos(fArg) / max(length(position.xz), 0.05));`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
transformed.xz += position.xz / max(length(position.xz), 0.05) * fAmp * sin(fArg);
float hh = position.y;
float low = clamp((uHem + 0.75 - hh) / 0.75, 0.0, 1.0);
low *= low;
float ang = atan(position.z, position.x);
transformed.x += sin(uTime * 1.3 + ang * 3.0 + hh * 5.0) * low * 0.045;
transformed.z += cos(uTime * 1.05 + ang * 2.0 + hh * 4.0) * low * 0.045 - low * uSpeed * 0.16;
vH = hh;
vAng = ang;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uHem;\nvarying float vH;\nvarying float vAng;\n${NOISE}`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float rag = 0.16 * gNoise(vec2(vAng * 6.0, 1.3)) + 0.07 * gNoise(vec2(vAng * 23.0, 4.1));
if (vH < uHem + rag) discard;
float hole = gNoise(vec2(vAng * 9.0, vH * 7.0));
if (hole > 0.86 && vH < uHem + 0.6) discard;
diffuseColor.rgb *= mix(0.58, 1.0, gNoise(vec2(vAng * 4.0, vH * 5.0)));
diffuseColor.rgb *= mix(vec3(0.32, 0.29, 0.25), vec3(1.0), smoothstep(uHem, uHem + 0.55, vH));
// the saree thins into the mist instead of standing on the floor
if (uHem < 0.5) diffuseColor.a *= mix(0.2, 1.0, smoothstep(uHem, uHem + 0.5, vH));`,
      );
  };
}

function hair(m: THREE.MeshStandardMaterial, u: U) {
  m.onBeforeCompile = (shader) => {
    rim(shader, u, '#7d93a3', 0.35);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSpeed;\nattribute float aT;\nattribute float aPhase;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float k = aT * aT;
transformed.x += sin(uTime * 0.85 + aPhase) * k * 0.045;
transformed.z += (cos(uTime * 0.7 + aPhase * 1.3) * 0.035 - uSpeed * 0.28) * k;`,
      );
  };
}

/** Long hair as one mesh of tapering strips hanging from the scalp, parted over the face. */
function hairGeometry(headY: number) {
  const r = new Rng(31313);
  const pos: number[] = [];
  const at: number[] = [];
  const ph: number[] = [];
  const nr: number[] = [];
  const idx: number[] = [];
  const SEG = 12;
  const R = 0.108;
  const N = 440;
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * Math.PI * 2 + r.range(-0.02, 0.02); // 0 = facing forward (+z)
    const front = Math.cos(theta) > 0.35;
    // a clear parting: nothing hangs straight down the middle of the face
    const parting = front && Math.abs(Math.sin(theta)) < 0.5;
    // a few loose wet strands still fall across her face
    if (parting && !r.chance(0.12)) continue;
    const L = front ? r.range(0.55, 0.85) : r.range(0.85, 1.3);
    const radial = new THREE.Vector3(Math.sin(theta), 0, Math.cos(theta));
    const tangent = new THREE.Vector3(Math.cos(theta), 0, -Math.sin(theta));
    // roots start under the scalp cap and comb outward, so no strand ends show at the hairline
    const rootY = headY + r.range(0.095, 0.115);
    const width = parting ? r.range(0.003, 0.006) : r.range(0.009, 0.022);
    // shade the hair as one smooth mass (normals point away from the head) rather than as flat ribbons
    const nrm = radial.clone().addScaledVector(tangent, r.range(-0.3, 0.3)).normalize();
    const phase = r.range(0, Math.PI * 2);
    const base = pos.length / 3;
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const d = L * t;
      // fall off the scalp, clear the shoulders, then hang straight and heavy
      const out = THREE.MathUtils.lerp(0.07, R * 0.92 + 0.012, THREE.MathUtils.smoothstep(d, 0, 0.09)) + 0.1 * THREE.MathUtils.smoothstep(d, 0.1, 0.3) * (front ? 0.55 : 1);
      const c = new THREE.Vector3().addScaledVector(radial, out).setY(rootY - d + 0.02 * Math.sin(t * 9 + phase));
      const w = width * (1 - 0.75 * t) * 0.5;
      for (const sgn of [-1, 1]) {
        const p = c.clone().addScaledVector(tangent, sgn * w);
        pos.push(p.x, p.y, p.z);
        at.push(t);
        ph.push(phase);
        nr.push(nrm.x, nrm.y, nrm.z);
      }
      if (s < SEG) {
        const a = base + s * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.Float32BufferAttribute(at, 1));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  g.setIndex(idx);
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nr, 3));
  return g;
}

const lathe = (pts: [number, number][], segs = 40) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segs);

const HEAD_Y = 1.665;

/**
 * A unit sphere pushed into a gaunt face (+z forward): sunken eye sockets under a brow, hollow cheeks,
 * a narrow jaw. Vertex colours darken what is deep, which reads as shadow even under a flat torch.
 */
function faceGeometry() {
  const g = new THREE.SphereGeometry(1, 44, 34);
  const p = g.attributes.position as THREE.BufferAttribute;
  const col: number[] = [];
  const v = new THREE.Vector3();
  const ss = THREE.MathUtils.smoothstep;
  const blob = (x: number, y: number, cx: number, cy: number, r: number) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (r * r));
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ax = Math.abs(v.x);
    const front = ss(v.z, 0.3, 0.8);
    const socket = blob(ax, v.y, 0.34, 0.07, 0.19) * front;
    const cheek = blob(ax, v.y, 0.56, -0.3, 0.24) * ss(v.z, 0.0, 0.6);
    const brow = Math.exp(-(((v.y - 0.24) / 0.07) ** 2)) * (1 - ss(ax, 0.35, 0.62)) * front;
    const lips = blob(v.x * 0.55, v.y, 0, -0.55, 0.09) * front;
    v.x *= 1 - 0.3 * ss(-v.y, 0.1, 0.95);
    v.multiplyScalar(1 - 0.08 * cheek);
    v.z += 0.04 * brow - 0.12 * socket;
    p.setXYZ(i, v.x, v.y, v.z);
    const shade = 1 - 0.85 * socket - 0.35 * cheek - 0.45 * lips;
    col.push(shade, shade, shade * 1.04);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** limbs taper: thin at the wrist, a little fuller near the shoulder, bony at the elbow */
const UPPER_ARM = lathe([[0.001, -0.345], [0.021, -0.335], [0.024, -0.3], [0.029, -0.18], [0.033, -0.07], [0.03, -0.012], [0.001, 0]], 12);
const FOREARM = lathe([[0.001, -0.31], [0.016, -0.3], [0.017, -0.27], [0.025, -0.12], [0.024, -0.03], [0.023, 0], [0.001, 0.014]], 12);

function Arm({ side, skin, bangle, armRef }: { side: 1 | -1; skin: THREE.Material; bangle: THREE.Material; armRef: React.Ref<THREE.Group> }) {
  return (
    <group ref={armRef} position={[side * 0.185, 1.38, 0.01]} rotation={[-0.18, 0, side * 0.1]}>
      <mesh material={skin} geometry={UPPER_ARM} />
      <group position={[0, -0.33, 0]} rotation={[-0.42, 0, -side * 0.06]}>
        <mesh material={skin} geometry={FOREARM} />
        {[-0.24, -0.27].map((y) => (
          <mesh key={y} material={bangle} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.026, 0.005, 6, 18]} />
          </mesh>
        ))}
        {/* hand: a narrow palm and long, slightly curled fingers */}
        <group position={[0, -0.33, 0.005]}>
          <mesh material={skin} scale={[0.045, 0.07, 0.018]}>
            <sphereGeometry args={[1, 10, 8]} />
          </mesh>
          {[-0.022, -0.007, 0.008, 0.022].map((x, i) => (
            <mesh key={x} material={skin} position={[x * side, -0.1 + Math.abs(i - 1.5) * 0.01, 0.012]} rotation={[0.25 + i * 0.05, 0, 0]}>
              <capsuleGeometry args={[0.0065, 0.085 - Math.abs(i - 1.5) * 0.012, 3, 6]} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

export function CallerFigure({ control }: { control: React.MutableRefObject<GhostControl> }) {
  const u = useMemo<U>(() => ({ uTime: { value: 0 }, uSpeed: { value: 0 }, uRim: { value: 1 } }), []);
  const parts = useMemo(() => {
    const saree = new THREE.MeshStandardMaterial({ color: '#b9b5aa', roughness: 0.95, side: THREE.DoubleSide, transparent: true });
    cloth(saree, u, 0.0);
    const pallu = new THREE.MeshStandardMaterial({ color: '#aeaba1', roughness: 0.95, side: THREE.DoubleSide, transparent: true });
    cloth(pallu, u, 1.02);
    const skin = new THREE.MeshStandardMaterial({ color: '#5d666b', roughness: 0.5, transparent: true });
    skin.onBeforeCompile = (s) => rim(s, u, '#b8cad6', 0.4);
    const face = new THREE.MeshStandardMaterial({ color: '#5d666b', roughness: 0.5, vertexColors: true, transparent: true });
    face.onBeforeCompile = skin.onBeforeCompile;
    const hairMat = new THREE.MeshStandardMaterial({ color: '#040405', roughness: 0.32, metalness: 0.1, side: THREE.DoubleSide, transparent: true });
    hair(hairMat, u);
    const scalp = new THREE.MeshStandardMaterial({ color: '#040405', roughness: 0.35, transparent: true });
    const socket = new THREE.MeshBasicMaterial({ color: '#050506', transparent: true });
    // brighter than the bloom threshold, so the eyes glow
    const eye = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.75, 3.1), toneMapped: false, transparent: true });
    const bangle = new THREE.MeshStandardMaterial({ color: '#6d6450', roughness: 0.45, metalness: 0.7, transparent: true });
    return {
      mats: [saree, pallu, skin, face, hairMat, scalp, socket, eye, bangle],
      saree, pallu, skin, face, hairMat, scalp, socket, eye, bangle,
      // enough segments around for the folds to show
      body: lathe([[0.3, 0], [0.31, 0.12], [0.29, 0.32], [0.25, 0.56], [0.2, 0.8], [0.165, 0.98], [0.15, 1.08], [0.155, 1.22], [0.163, 1.32], [0.158, 1.41], [0.12, 1.48], [0.05, 1.52]], 120),
      shawl: lathe([[0.198, 1.02], [0.203, 1.16], [0.195, 1.3], [0.175, 1.4], [0.135, 1.48], [0.06, 1.52]], 120),
      faceGeo: faceGeometry(),
      hairGeo: hairGeometry(0),
    };
  }, [u]);

  const root = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  // head twitches: every so often the head snaps to a wrong angle, holds, and slowly comes back
  const tw = useRef({ next: 0, until: 0, z: 0, y: 0, scare: 0 });
  useFrame((_, dt) => {
    const t = now();
    const c = control.current;
    const w = tw.current;
    w.scare = THREE.MathUtils.damp(w.scare, c.scare ?? 0, (c.scare ?? 0) > w.scare ? 7 : 2, dt);
    if (t > w.next) {
      w.until = t + 0.16 + Math.random() * 0.25;
      w.z = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.4);
      w.y = (Math.random() - 0.5) * 0.9;
      // calm: a twitch every few seconds; going for you: constantly
      w.next = t + (w.scare > 0.2 ? 0.5 + Math.random() * 0.7 : 2.5 + Math.random() * 4);
    }
    const snapping = t < w.until;
    u.uTime.value = t;
    u.uSpeed.value += (c.speed - u.uSpeed.value) * 0.1;
    u.uRim.value = c.stunned ? 2.4 : 1;
    for (const m of parts.mats) m.opacity = c.opacity;
    if (root.current) {
      // she hovers a hand's width off the floor, leaning into the chase
      root.current.position.y = 0.05 + Math.sin(t * 0.9) * 0.025;
      root.current.rotation.x = u.uSpeed.value * 0.18 + w.scare * 0.22;
      root.current.position.x = c.stunned ? (Math.random() - 0.5) * 0.06 : 0;
      // the lunge: she pitches forward at you
      root.current.position.z = w.scare * 0.35;
    }
    const h = head.current;
    if (h) {
      const z = 0.17 + Math.sin(t * 0.55) * 0.04;
      const x = 0.1 + Math.sin(t * 0.37) * 0.03 - w.scare * 0.25;
      if (snapping) {
        // no easing on the way out: the snap is the scare
        h.rotation.z = z + w.z;
        h.rotation.y = w.y;
      } else {
        h.rotation.z = THREE.MathUtils.damp(h.rotation.z, z, 3, dt);
        h.rotation.y = THREE.MathUtils.damp(h.rotation.y, 0, 3, dt);
      }
      h.rotation.x = x;
    }
    // arms rise and reach out towards you
    const reach = -0.18 - w.scare * 1.25;
    if (armL.current) armL.current.rotation.x = reach + Math.sin(t * 7.3) * 0.04 * w.scare;
    if (armR.current) armR.current.rotation.x = reach * 0.9 + Math.sin(t * 6.1 + 1) * 0.04 * w.scare;
  });

  return (
    <group ref={root}>
      <mesh geometry={parts.body} material={parts.saree} scale={[1, 1, 0.72]} />
      <mesh geometry={parts.shawl} material={parts.pallu} scale={[1, 1, 0.8]} rotation={[0, 0.4, 0.11]} />
      <Arm side={1} skin={parts.skin} bangle={parts.bangle} armRef={armL} />
      <Arm side={-1} skin={parts.skin} bangle={parts.bangle} armRef={armR} />
      <mesh material={parts.skin} position={[0, 1.55, 0.008]}>
        <cylinderGeometry args={[0.036, 0.042, 0.1, 10]} />
      </mesh>
      <group ref={head} position={[0, HEAD_Y, 0]}>
        <mesh geometry={parts.faceGeo} material={parts.face} scale={[0.1, 0.125, 0.108]} />
        <mesh material={parts.scalp} scale={[0.107, 0.134, 0.115]}>
          <sphereGeometry args={[1, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4]} />
        </mesh>
        {[-0.034, 0.034].map((x) => (
          <group key={x} position={[x, 0.008, 0.086]}>
            <mesh material={parts.socket} scale={[0.022, 0.014, 0.01]}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
            <mesh material={parts.eye} position={[0, 0, 0.007]} scale={[0.01, 0.0075, 0.005]}>
              <sphereGeometry args={[1, 10, 8]} />
            </mesh>
          </group>
        ))}
        <mesh geometry={parts.hairGeo} material={parts.hairMat} />
        <mesh material={parts.skin} position={[0, -0.022, 0.103]} scale={[0.007, 0.022, 0.011]}>
          <sphereGeometry args={[1, 8, 8]} />
        </mesh>
        {/* a dark, slightly open mouth */}
        <mesh material={parts.socket} position={[0, -0.068, 0.094]} scale={[0.016, 0.009, 0.006]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      </group>
    </group>
  );
}
