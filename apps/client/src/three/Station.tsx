import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { now } from '../game/fx';
import { runtime } from '../game/runtime';
import { MOON_DIR } from './Atmosphere';
import { ageCanvas, cachedTextures, signTexture } from './textures';

/**
 * Kolkata-style architecture layered on top of the gameplay level:
 * a Howrah-like arched cast-iron train shed, a brick arcade with iron grilles, a suburban EMU with its
 * headlight boring through the mist, wall graffiti and slow ceiling fans.
 */

// arch geometry over the tracks (circle through z 6.5 → 19.6 at y 5.1, crown at y 10.5)
const ARCH = { cz: 13.05, cy: 3.83, r: 6.67, max: (79 * Math.PI) / 180 };
const BAYS = Array.from({ length: 12 }, (_, i) => -36 + i * 8);

const arcPoint = (t: number, r = ARCH.r) => {
  const th = -ARCH.max + t * ARCH.max * 2;
  return new THREE.Vector3(0, ARCH.cy + r * Math.cos(th), ARCH.cz + r * Math.sin(th));
};

class ArcCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private radius: number) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()) {
    return target.copy(arcPoint(t, this.radius));
  }
}

function rod(a: THREE.Vector3, b: THREE.Vector3, r: number) {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 5, 1, true);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q);
  const m = a.clone().add(b).multiplyScalar(0.5);
  g.translate(m.x, m.y, m.z);
  return g;
}

function trussGeometry() {
  const parts: THREE.BufferGeometry[] = [
    new THREE.TubeGeometry(new ArcCurve(ARCH.r), 64, 0.09, 6),
    new THREE.TubeGeometry(new ArcCurve(ARCH.r - 0.55), 64, 0.06, 6),
  ];
  const n = 26;
  for (let i = 0; i < n; i++) {
    const a = arcPoint(i / n);
    const b = arcPoint((i + 1) / n, ARCH.r - 0.55);
    parts.push(rod(a, b, 0.025));
    parts.push(rod(arcPoint((i + 1) / n), b, 0.025));
  }
  // tie rod across the arch springing points, with hangers
  const s0 = arcPoint(0);
  const s1 = arcPoint(1);
  parts.push(rod(s0, s1, 0.03));
  for (const t of [0.25, 0.5, 0.75]) parts.push(rod(arcPoint(t, ARCH.r - 0.55), new THREE.Vector3(0, s0.y, ARCH.cz + (t - 0.5) * 13), 0.018));
  const strip = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(ng.attributes)) if (k !== 'position' && k !== 'normal') ng.deleteAttribute(k);
    return ng;
  });
  return mergeGeometries(strip)!;
}

/** Curved roof skin under the arches, with an independent UV set for the broken-panel mask. */
function roofSkin(x0: number, x1: number) {
  const nx = 48;
  const nt = 40;
  const pos: number[] = [];
  const nrm: number[] = [];
  const uv: number[] = [];
  const uv1: number[] = [];
  const idx: number[] = [];
  const R = ARCH.r + 0.12;
  const arcLen = R * ARCH.max * 2;
  for (let j = 0; j <= nt; j++) {
    const t = j / nt;
    const th = -ARCH.max + t * ARCH.max * 2;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + ((x1 - x0) * i) / nx;
      pos.push(x, ARCH.cy + R * Math.cos(th), ARCH.cz + R * Math.sin(th));
      nrm.push(0, -Math.cos(th), -Math.sin(th));
      uv.push(((t * arcLen) / 2), x / 2);
      uv1.push(i / nx, t);
    }
  }
  for (let j = 0; j < nt; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i;
      idx.push(a, a + 1, a + nx + 1, a + 1, a + nx + 2, a + nx + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
  g.setIndex(idx);
  return g;
}

/** missing roof sheets: [u (0..1 along x), t (0..1 across arch), w, h] — also where moonlight falls through */
const HOLES: [number, number, number, number][] = [
  [0.08, 0.62, 0.04, 0.1], [0.19, 0.3, 0.05, 0.12], [0.31, 0.55, 0.03, 0.16], [0.43, 0.7, 0.06, 0.08],
  [0.52, 0.38, 0.04, 0.12], [0.63, 0.6, 0.05, 0.14], [0.74, 0.28, 0.03, 0.1], [0.86, 0.52, 0.06, 0.12], [0.94, 0.72, 0.03, 0.08],
];
const ROOF_X0 = -40;
const ROOF_X1 = 54;

function holeMask() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#000';
  for (const [u, t, w, h] of HOLES) {
    g.fillRect((u - w / 2) * 1024, (t - h / 2) * 256, w * 1024, h * 256);
    // ragged edges
    for (let k = 0; k < 6; k++) g.fillRect((u - w / 2 + Math.random() * w) * 1024, (t - h / 2 - 0.02) * 256, 10 + Math.random() * 30, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.channel = 1;
  tex.flipY = false;
  return tex;
}

const shaftMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; varying float vDepth; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vDepth;
      void main(){
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float fall = smoothstep(0.0, 0.25, vUv.y) * (0.35 + 0.65 * vUv.y);
        float flick = 0.85 + 0.15 * sin(uTime * 0.7 + vUv.x * 9.0);
        float a = edge * fall * 0.075 * flick * smoothstep(2.0, 7.0, vDepth);
        gl_FragColor = vec4(vec3(0.55, 0.78, 0.82) * a, a);
      }`,
  });

function TrainShed({ shadows }: { shadows: boolean }) {
  const lib = cachedTextures();
  const truss = useMemo(trussGeometry, []);
  const iron = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.55, metalness: 0.7, map: lib?.rust?.map }), [lib]);
  const roof = useMemo(() => {
    const g = roofSkin(ROOF_X0, ROOF_X1);
    const set = lib?.corrugated;
    const m = new THREE.MeshStandardMaterial({
      map: set?.map, normalMap: set?.normalMap, roughnessMap: set?.roughnessMap, metalness: 0.5, roughness: 1,
      color: '#6d6a64', side: THREE.DoubleSide, alphaMap: holeMask(), alphaTest: 0.5,
    });
    return { g, m };
  }, [lib]);
  const trussRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    BAYS.forEach((x, i) => trussRef.current?.setMatrixAt(i, m.makeTranslation(x, 0, 0)));
    if (trussRef.current) trussRef.current.instanceMatrix.needsUpdate = true;
  }, []);
  const shafts = useMemo(() => {
    const mat = shaftMat();
    const items = HOLES.map(([u, t]) => {
      const x = ROOF_X0 + u * (ROOF_X1 - ROOF_X0);
      const top = arcPoint(t, ARCH.r);
      return { x, y: top.y, z: top.z };
    });
    return { mat, items };
  }, []);
  useFrame(() => {
    shafts.mat.uniforms.uTime.value = now();
  });
  const shaftLen = 12;
  // slant the light along the moon direction
  const tilt = Math.atan2(MOON_DIR.z, MOON_DIR.y);
  return (
    <group name="shed">
      <instancedMesh ref={trussRef} args={[truss, iron, BAYS.length]} castShadow={shadows} frustumCulled={false} />
      <mesh geometry={roof.g} material={roof.m} receiveShadow={shadows} />
      {/* purlins */}
      {[0.08, 0.27, 0.5, 0.73, 0.92].map((t) => {
        const p = arcPoint(t, ARCH.r + 0.02);
        return (
          <mesh key={t} position={[(ROOF_X0 + ROOF_X1) / 2, p.y, p.z]} material={iron}>
            <boxGeometry args={[ROOF_X1 - ROOF_X0, 0.14, 0.1]} />
          </mesh>
        );
      })}
      {/* columns on both sides + eave girders */}
      {BAYS.map((x) => (
        <group key={x}>
          <mesh position={[x, 1.95, 19.3]} material={iron}>
            <cylinderGeometry args={[0.16, 0.2, 6.3, 10]} />
          </mesh>
          <mesh position={[x, 4.9, 19.3]} material={iron}>
            <cylinderGeometry args={[0.32, 0.16, 0.4, 10]} />
          </mesh>
          {x > 36 && (
            <mesh position={[x, 1.95, 6.5]} material={iron}>
              <cylinderGeometry args={[0.16, 0.2, 6.3, 10]} />
            </mesh>
          )}
        </group>
      ))}
      {[6.5, 19.3].map((z) => (
        <mesh key={z} position={[(ROOF_X0 + ROOF_X1) / 2, 5.15, z]} material={iron}>
          <boxGeometry args={[ROOF_X1 - ROOF_X0, 0.35, 0.22]} />
        </mesh>
      ))}
      {/* moonlight falling through the broken sheets */}
      {shafts.items.map((s, i) => (
        <mesh key={i} material={shafts.mat} position={[s.x, s.y - shaftLen / 2, s.z]} rotation={[tilt * 0.35, (i % 3) * 0.4, 0]}>
          <planeGeometry args={[2.2, shaftLen]} />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────────── brick arcade with iron grilles ─────────────────────────────

function grilleTexture() {
  return signTexture(512, 512, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = '#fff';
    c.lineWidth = 7;
    for (let x = 12; x < w; x += 28) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, h);
      c.stroke();
    }
    c.lineWidth = 10;
    for (const y of [0.18, 0.62, 0.97]) {
      c.beginPath();
      c.moveTo(0, y * h);
      c.lineTo(w, y * h);
      c.stroke();
    }
    c.lineWidth = 5;
    for (let x = 26; x < w; x += 56) {
      c.beginPath();
      c.arc(x, 0.18 * h + 22, 20, 0, Math.PI * 2);
      c.stroke();
    }
  });
}

function Arcade() {
  const lib = cachedTextures();
  const { geo, mat } = useMemo(() => {
    const x0 = -50;
    const x1 = 56;
    const shape = new THREE.Shape();
    shape.moveTo(x0, -1.2);
    shape.lineTo(x1, -1.2);
    shape.lineTo(x1, 5.1);
    shape.lineTo(x0, 5.1);
    shape.lineTo(x0, -1.2);
    const openings = [-44, ...BAYS.slice(0, -1).map((x) => x + 4)];
    for (const cx of openings) {
      const hw = 2.7;
      const hole = new THREE.Path();
      hole.moveTo(cx - hw, 0.15);
      hole.lineTo(cx + hw, 0.15);
      hole.lineTo(cx + hw, 2.1);
      hole.absarc(cx, 2.1, hw, 0, Math.PI, false);
      hole.lineTo(cx - hw, 0.15);
      shape.holes.push(hole);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.6, bevelEnabled: false, curveSegments: 18 });
    g.translate(0, 0, 19.5);
    const set = lib?.brick;
    const clone = (t?: THREE.Texture) => {
      if (!t) return undefined;
      const c = t.clone();
      c.repeat.set(0.5, 0.5);
      c.needsUpdate = true;
      return c;
    };
    const m = new THREE.MeshStandardMaterial({ map: clone(set?.map), normalMap: clone(set?.normalMap), roughnessMap: clone(set?.roughnessMap), roughness: 1, color: '#9a8478' });
    return { geo: g, mat: m, openings };
  }, [lib]);
  const grille = useMemo(() => {
    const t = grilleTexture();
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    return new THREE.MeshStandardMaterial({ color: '#141210', metalness: 0.7, roughness: 0.5, alphaMap: t, alphaTest: 0.5, side: THREE.DoubleSide });
  }, []);
  const openings = useMemo(() => [-44, ...BAYS.slice(0, -1).map((x) => x + 4)], []);
  return (
    <group name="arcade">
      <mesh geometry={geo} material={mat} />
      {openings.map((x) => (
        <mesh key={x} position={[x, 2.48, 19.8]} material={grille}>
          <planeGeometry args={[5.4, 4.66]} />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────────── graffiti, stains, fans ─────────────────────────────

type Decal = { text: string; font: string; color: string; pos: [number, number, number]; rot: number; w: number; h: number; drip?: boolean };

const DECALS: Decal[] = [
  { text: 'ও আসছে', font: '700 150px "Noto Serif Bengali", "Nirmala UI", serif', color: '#7a1a12', pos: [-8.6, 1.6, 0.02], rot: 0, w: 2.6, h: 1, drip: true },
  { text: "DON'T ANSWER", font: '700 120px Arial, sans-serif', color: '#b9b4a6', pos: [12, 1.9, 0.02], rot: 0, w: 2.8, h: 0.7 },
  { text: '৩ বার', font: '700 170px "Noto Serif Bengali", "Nirmala UI", serif', color: '#5d1510', pos: [30.6, 1.5, 0.02], rot: 0, w: 1.8, h: 1, drip: true },
  { text: 'SHUNYA', font: '700 140px Georgia, serif', color: '#2a2a2a', pos: [-5, -2.1, 1.99], rot: 0, w: 2.2, h: 0.7 },
  { text: 'মা?', font: '700 190px "Noto Serif Bengali", "Nirmala UI", serif', color: '#6d150f', pos: [14, -2.0, 5.0], rot: Math.PI, w: 1.2, h: 1, drip: true },
  { text: 'বাবু পান', font: '600 110px "Noto Serif Bengali", "Nirmala UI", serif', color: '#3d3020', pos: [-27.5, 2.4, 0.02], rot: 0, w: 2.0, h: 0.6 },
];

function decalTexture(d: Decal) {
  return signTexture(1024, Math.round((1024 * d.h) / d.w), (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = d.color;
    c.font = d.font;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.globalAlpha = 0.85;
    c.fillText(d.text, w / 2, h * 0.45);
    if (d.drip) {
      for (let i = 0; i < 14; i++) {
        const x = w * 0.15 + Math.random() * w * 0.7;
        c.fillRect(x, h * 0.5, 3 + Math.random() * 4, h * (0.1 + Math.random() * 0.45));
      }
    }
    ageCanvas(c, w, h, 0.25);
  });
}

function Stains() {
  // paan spit and damp at the base of walls
  const mat = useMemo(() => {
    const t = signTexture(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 30; i++) {
        const x = w / 2 + (Math.random() - 0.5) * w * 0.5;
        const y = h * 0.7 + (Math.random() - 0.5) * h * 0.4;
        const r = 4 + Math.random() * 22;
        c.fillStyle = `rgba(${90 + Math.random() * 40},${15 + Math.random() * 15},10,${0.25 + Math.random() * 0.4})`;
        c.beginPath();
        c.arc(x, y, r, 0, Math.PI * 2);
        c.fill();
      }
      for (let i = 0; i < 8; i++) c.fillRect(w / 2 + (Math.random() - 0.5) * w * 0.3, h * 0.4, 3, h * 0.35);
    });
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
  }, []);
  const spots: [number, number, number][] = [[-29, 0.5, 0.02], [-21, 0.4, 0.02], [-3, 0.55, 0.02], [2.5, 0.45, 0.02], [17, 0.5, 0.02], [28.5, 0.45, 0.02]];
  return (
    <>
      {spots.map((p, i) => (
        <mesh key={i} position={p} material={mat}>
          <planeGeometry args={[0.9, 0.9]} />
        </mesh>
      ))}
    </>
  );
}

function CeilingFan({ position, speed }: { position: [number, number, number]; speed: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * speed * (runtime.snap?.world.power ? 1 : 0.15);
  });
  return (
    <group position={position}>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.6, 6]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      <group ref={ref}>
        <mesh>
          <cylinderGeometry args={[0.12, 0.1, 0.12, 12]} />
          <meshStandardMaterial color="#3a3934" metalness={0.5} roughness={0.5} />
        </mesh>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]} position={[Math.cos((i * Math.PI * 2) / 3) * 0.55, -0.02, -Math.sin((i * Math.PI * 2) / 3) * 0.55]}>
            <boxGeometry args={[0.9, 0.012, 0.13]} />
            <meshStandardMaterial color="#4a4639" metalness={0.4} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function StationArchitecture({ shadows }: { shadows: boolean }) {
  const decals = useMemo(() => DECALS.map((d) => ({ d, tex: decalTexture(d) })), []);
  return (
    <group name="station-architecture">
      <TrainShed shadows={shadows} />
      <Arcade />
      {decals.map(({ d, tex }, i) => (
        <mesh key={i} position={d.pos} rotation={[0, d.rot, 0]}>
          <planeGeometry args={[d.w, d.h]} />
          <meshStandardMaterial map={tex} transparent depthWrite={false} roughness={0.9} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      <Stains />
      <CeilingFan position={[-14, 3.6, -7]} speed={1.4} />
      <CeilingFan position={[-5, 3.6, -7]} speed={0.9} />
      <CeilingFan position={[5, 3.6, -9]} speed={1.1} />
      <CeilingFan position={[-25, 3.6, -9]} speed={0.7} />
    </group>
  );
}
