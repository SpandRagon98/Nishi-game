import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { now } from '../game/fx';
import { ageCanvas, cachedTextures, signTexture } from './textures';

/** Lived-in, abandoned details of a Bengal railway platform. Visual only. */

type V3 = [number, number, number];

const mat = (color: string, rough = 0.8, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function Box({ p, s, m, r }: { p: V3; s: V3; m: THREE.Material; r?: V3 }) {
  return (
    <mesh position={p} rotation={r} material={m} castShadow receiveShadow>
      <boxGeometry args={s} />
    </mesh>
  );
}

/** Indian Railways cast-iron bench: wooden slats on curled iron frames. */
function IronBench({ x, z, rot = 0, wood, iron }: { x: number; z: number; rot?: number; wood: THREE.Material; iron: THREE.Material }) {
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      {[-1.05, 0, 1.05].map((dx) => (
        <group key={dx} position={[dx, 0, 0]}>
          <Box p={[0, 0.25, -0.18]} s={[0.05, 0.5, 0.05]} m={iron} />
          <Box p={[0, 0.25, 0.2]} s={[0.05, 0.5, 0.05]} m={iron} />
          <Box p={[0, 0.48, 0]} s={[0.05, 0.05, 0.5]} m={iron} />
          <Box p={[0, 0.78, 0.25]} r={[-0.2, 0, 0]} s={[0.05, 0.62, 0.05]} m={iron} />
        </group>
      ))}
      {[0, 1, 2].map((k) => (
        <Box key={k} p={[0, 0.66 + k * 0.17, 0.27 + k * 0.035]} r={[-0.2, 0, 0]} s={[2.4, 0.09, 0.025]} m={wood} />
      ))}
    </group>
  );
}

function WeighingMachine({ p }: { p: V3 }) {
  const face = useMemo(
    () =>
      signTexture(256, 256, (c, w) => {
        const r = w / 2;
        c.fillStyle = '#d9cfb3';
        c.beginPath();
        c.arc(r, r, r - 6, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#2a2420';
        c.lineWidth = 3;
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 1.6 - Math.PI * 0.8;
          c.beginPath();
          c.moveTo(r + Math.sin(a) * (r - 14), r - Math.cos(a) * (r - 14));
          c.lineTo(r + Math.sin(a) * (r - (i % 5 ? 24 : 34)), r - Math.cos(a) * (r - (i % 5 ? 24 : 34)));
          c.stroke();
        }
        c.fillStyle = '#7a1a12';
        c.font = '700 22px Arial';
        c.textAlign = 'center';
        c.fillText('WEIGHT · ওজন', r, r + 42);
        c.font = '600 16px Arial';
        c.fillText('YOUR FORTUNE  ১ টাকা', r, r + 66);
        c.strokeStyle = '#111';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(r, r);
        c.lineTo(r + 60, r - 62);
        c.stroke();
        ageCanvas(c, w, w, 0.5);
      }),
    [],
  );
  const red = useMemo(() => mat('#6e1410', 0.45, 0.4), []);
  const chrome = useMemo(() => mat('#9a958c', 0.25, 0.9), []);
  return (
    <group position={p}>
      <Box p={[0, 0.06, 0.05]} s={[0.62, 0.12, 0.72]} m={chrome} />
      <Box p={[0, 1.0, -0.12]} s={[0.56, 1.8, 0.32]} m={red} />
      <mesh position={[0, 1.38, 0.045]}>
        <circleGeometry args={[0.22, 32]} />
        <meshStandardMaterial map={face} roughness={0.2} metalness={0.1} />
      </mesh>
      <mesh position={[0, 1.38, 0.05]}>
        <ringGeometry args={[0.21, 0.24, 32]} />
        <meshStandardMaterial color="#8a8070" metalness={0.9} roughness={0.3} />
      </mesh>
      {[-0.2, -0.1, 0, 0.1, 0.2].map((x) => (
        <mesh key={x} position={[x, 1.86, 0.04]}>
          <sphereGeometry args={[0.025, 8, 6]} />
          <meshStandardMaterial color="#5a4a30" roughness={0.3} />
        </mesh>
      ))}
      <Box p={[0, 0.85, 0.045]} s={[0.4, 0.32, 0.01]} m={chrome} />
    </group>
  );
}

/** A small platform shrine wrapped in red cloth, vermilion, dried marigolds and a guttering diya. */
function Shrine({ p, light: withLight = true }: { p: V3; light?: boolean }) {
  const flame = useRef<THREE.Mesh>(null);
  const light = useRef<THREE.PointLight>(null);
  useFrame(() => {
    const t = now();
    const k = 0.75 + Math.sin(t * 17) * 0.12 + Math.sin(t * 7.3) * 0.13;
    flame.current?.scale.set(1, k, 1);
    if (light.current) light.current.intensity = 0.9 * k;
  });
  const marigolds = useMemo(() => Array.from({ length: 22 }, (_, i) => {
    const a = (i / 22) * Math.PI * 2;
    return [Math.cos(a) * 0.19, 0.62 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.19 + 0.02] as V3;
  }), []);
  return (
    <group position={p}>
      <Box p={[0, 0.48, 0]} s={[0.5, 0.05, 0.3]} m={mat('#3a2417', 0.8)} />
      <mesh position={[0, 0.66, 0]}>
        <sphereGeometry args={[0.13, 14, 10]} />
        <meshStandardMaterial color="#b8340f" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.68, 0.11]}>
        <boxGeometry args={[0.04, 0.12, 0.01]} />
        <meshStandardMaterial color="#e0451a" roughness={0.4} />
      </mesh>
      {marigolds.map((m, i) => (
        <mesh key={i} position={m}>
          <sphereGeometry args={[0.035, 8, 6]} />
          <meshStandardMaterial color={i % 3 ? '#7a4a14' : '#a5681c'} roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0.17, 0.53, 0.06]}>
        <cylinderGeometry args={[0.04, 0.025, 0.03, 12]} />
        <meshStandardMaterial color="#6b3a1c" roughness={0.9} />
      </mesh>
      <mesh ref={flame} position={[0.17, 0.57, 0.06]}>
        <coneGeometry args={[0.01, 0.045, 8]} />
        <meshBasicMaterial color="#ffb347" />
      </mesh>
      {withLight && <pointLight ref={light} position={[0.17, 0.62, 0.12]} color="#ff9a3a" intensity={0.9} distance={2.2} decay={2} />}
      {/* red threads tied around the pillar */}
      {[0.9, 1.0, 1.08].map((y) => (
        <mesh key={y} position={[0, y, -0.2]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.2, 0.006, 4, 20]} />
          <meshStandardMaterial color="#9a1810" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Trunk({ p, r }: { p: V3; r: number }) {
  const label = useMemo(
    () =>
      signTexture(256, 96, (c, w, h) => {
        c.fillStyle = '#2d3d43';
        c.fillRect(0, 0, w, h);
        c.fillStyle = '#d6cdb1';
        c.font = '700 34px "IBM Plex Mono", monospace';
        c.fillText('M. SEN', 18, 44);
        c.font = '600 22px "Noto Serif Bengali", "Nirmala UI", serif';
        c.fillText('কলকাতা ৭০০০১৪', 18, 78);
        ageCanvas(c, w, h, 0.5);
      }),
    [],
  );
  return (
    <group position={p} rotation={[0, r, 0]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.8, 0.4, 0.45]} />
        <meshStandardMaterial map={label} roughness={0.55} metalness={0.5} />
      </mesh>
      {[-0.3, 0.3].map((x) => (
        <Box key={x} p={[x, 0.2, 0]} s={[0.04, 0.42, 0.47]} m={mat('#141414', 0.5, 0.8)} />
      ))}
    </group>
  );
}

/** A child's doll lying face down. */
function Doll({ p, r }: { p: V3; r: number }) {
  const cloth = useMemo(() => mat('#7c2a3a', 0.9), []);
  const skin = useMemo(() => mat('#c8b29a', 0.5), []);
  return (
    <group position={p} rotation={[0, r, 0]}>
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} material={cloth}>
        <capsuleGeometry args={[0.05, 0.12, 4, 8]} />
      </mesh>
      <mesh position={[0, 0.05, -0.15]} material={skin}>
        <sphereGeometry args={[0.055, 12, 10]} />
      </mesh>
      <mesh position={[0, 0.072, -0.15]} material={mat('#1a1210', 0.9)}>
        <sphereGeometry args={[0.057, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, 0.03, -0.02]} rotation={[Math.PI / 2, 0, s * 0.6]} material={skin}>
          <capsuleGeometry args={[0.015, 0.07, 4, 6]} />
        </mesh>
      ))}
    </group>
  );
}

function Chappals({ p }: { p: V3 }) {
  const m = useMemo(() => mat('#3b2a1e', 0.8), []);
  return (
    <group position={p}>
      <Box p={[0, 0.008, 0]} r={[0, 0.3, 0]} s={[0.1, 0.016, 0.26]} m={m} />
      <Box p={[0.16, 0.008, 0.05]} r={[0, -0.5, 0]} s={[0.1, 0.016, 0.26]} m={m} />
    </group>
  );
}

function IndicatorBoard({ p }: { p: V3 }) {
  const t = useMemo(
    () =>
      signTexture(512, 128, (c, w, h) => {
        c.fillStyle = '#060606';
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(160,30,20,0.55)';
        for (let x = 10; x < w; x += 9) for (let y = 10; y < h; y += 9) if (Math.random() < 0.05) c.fillRect(x, y, 4, 4);
        c.font = '28px "IBM Plex Mono", monospace';
        c.fillStyle = 'rgba(190,40,25,0.75)';
        c.fillText('৩:১৩  ---  PF 0  ---  ৩:১৩', 22, 74);
      }),
    [],
  );
  return (
    <group position={p}>
      <mesh>
        <boxGeometry args={[2.6, 0.55, 0.16]} />
        <meshStandardMaterial color="#101010" roughness={0.5} metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, 0, s * 0.081]} rotation={[0, s > 0 ? 0 : Math.PI, 0]}>
          <planeGeometry args={[2.45, 0.45]} />
          <meshStandardMaterial map={t} emissiveMap={t} emissive="#ffffff" emissiveIntensity={0.35} />
        </mesh>
      ))}
      {[-1.1, 1.1].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.6, 4]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      ))}
    </group>
  );
}

/** A broken tube light hanging by one chain, swaying. */
function HangingTube({ p }: { p: V3 }) {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    if (g.current) g.current.rotation.z = 0.95 + Math.sin(now() * 0.9) * 0.06;
  });
  return (
    <group position={p}>
      <group ref={g}>
        <mesh position={[0, -0.3, 0]}>
          <cylinderGeometry args={[0.006, 0.006, 0.6, 4]} />
          <meshStandardMaterial color="#222" />
        </mesh>
        <mesh position={[0.62, -0.62, 0]}>
          <boxGeometry args={[1.3, 0.06, 0.14]} />
          <meshStandardMaterial color="#3b3a36" metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0.62, -0.67, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.022, 0.022, 1.15, 8]} />
          <meshStandardMaterial color="#3c3f3e" roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

function cobwebTexture() {
  return signTexture(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(230,230,225,0.55)';
    c.lineWidth = 1;
    const spokes = 9;
    for (let i = 0; i < spokes; i++) {
      const a = (i / (spokes - 1)) * (Math.PI / 2);
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(Math.cos(a) * w, Math.sin(a) * h);
      c.stroke();
    }
    for (let r = 24; r < w; r += 18 + Math.random() * 8) {
      c.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / (spokes - 1)) * (Math.PI / 2);
        const rr = r * (0.92 + Math.random() * 0.12);
        if (i === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.stroke();
    }
  });
}

/** Clumps of weeds pushing through the ballast. */
function Weeds() {
  const ref = useRef<THREE.InstancedMesh>(null);
  const { geo, material, count } = useMemo(() => {
    const t = signTexture(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const x = w / 2 + (Math.random() - 0.5) * w * 0.7;
        c.strokeStyle = `rgba(${40 + Math.random() * 30},${60 + Math.random() * 40},${30 + Math.random() * 20},1)`;
        c.lineWidth = 2 + Math.random() * 2;
        c.beginPath();
        c.moveTo(x, h);
        c.quadraticCurveTo(x + (Math.random() - 0.5) * 30, h * 0.5, x + (Math.random() - 0.5) * 50, h * (0.1 + Math.random() * 0.4));
        c.stroke();
      }
    });
    const a = new THREE.PlaneGeometry(0.7, 0.55);
    a.translate(0, 0.27, 0);
    const b = a.clone();
    b.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pos = [...(a.getAttribute('position').array as Float32Array), ...(b.getAttribute('position').array as Float32Array)];
    const uv = [...(a.getAttribute('uv').array as Float32Array), ...(b.getAttribute('uv').array as Float32Array)];
    const idxA = Array.from(a.index!.array);
    const idx = [...idxA, ...idxA.map((i) => i + 4)];
    merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    merged.setIndex(idx);
    merged.computeVertexNormals();
    return {
      geo: merged,
      material: new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, color: '#6f7f62' }),
      count: 320,
    };
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let i = 0; i < count; i++) {
      const lane = Math.random();
      const z = lane < 0.35 ? 12.2 + Math.random() * 1.2 : lane < 0.7 ? 16.8 + Math.random() * 2.5 : 8.2 + Math.random() * 0.4;
      const x = -49 + Math.random() * 104;
      e.set(0, Math.random() * Math.PI, 0);
      q.setFromEuler(e);
      const s = 0.6 + Math.random() * 0.9;
      m.compose(new THREE.Vector3(x, -1.2, z), q, new THREE.Vector3(s, s, s));
      ref.current?.setMatrixAt(i, m);
    }
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [count]);
  return <instancedMesh ref={ref} args={[geo, material, count]} frustumCulled={false} />;
}

/** Cables sagging between the canopy columns. */
function Cables() {
  const geo = useMemo(() => {
    const parts: THREE.BufferGeometry[] = [];
    for (let x = -36; x < 36; x += 8) {
      const a = new THREE.Vector3(x, 4.6, 6.5);
      const b = new THREE.Vector3(x + 8, 4.6, 6.5);
      const mid = a.clone().add(b).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.7 - Math.random() * 0.6, 0));
      parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.012, 4));
    }
    return parts;
  }, []);
  const m = useMemo(() => mat('#0b0b0b', 0.6), []);
  return (
    <>
      {geo.map((g, i) => (
        <mesh key={i} geometry={g} material={m} />
      ))}
    </>
  );
}

let blobTex: THREE.Texture | null = null;
function blob() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.85)');
  grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

/** Soft fake ambient occlusion: dark falloff where things meet the floor. */
function ContactShadows() {
  const m = useMemo(() => new THREE.MeshBasicMaterial({ map: blob(), transparent: true, depthWrite: false, color: '#000000', polygonOffset: true, polygonOffsetFactor: -4 }), []);
  const items: { p: V3; s: [number, number] }[] = [
    ...[-32, -16, 16, 32].map((x) => ({ p: [x, 0.004, 5.9] as V3, s: [3.4, 1.4] as [number, number] })),
    ...[-36, -28, -20, -12, -4, 4, 12, 20, 28, 36].map((x) => ({ p: [x, 0.004, 6.5] as V3, s: [1.1, 1.1] as [number, number] })),
    ...[[-15.5, -8.8], [-4.5, -8.8], [-15.5, -4.5], [-4.5, -4.5]].map(([x, z]) => ({ p: [x, 0.004, z] as V3, s: [6, 1.6] as [number, number] })),
    { p: [-21.4, 0.004, 0.5], s: [1.2, 1.2] },
    { p: [0, 0.004, 6.2], s: [4.4, 2.6] },
    { p: [24.1, 0.004, 6], s: [2.6, 1.4] },
    { p: [5, 0.004, -7.5], s: [5.5, 2.4] },
  ];
  // under the whole EMU rake and along the base of every wall
  const strips: { p: V3; s: [number, number] }[] = [
    { p: [22, -1.19, 10], s: [70, 4.6] },
    { p: [0, 0.004, 0.25], s: [62, 1.0] },
    { p: [0, 0.004, -13.75], s: [62, 1.0] },
    { p: [0, -3.495, 2.2], s: [62, 0.8] },
    { p: [0, -3.495, 4.8], s: [62, 0.8] },
  ];
  return (
    <group>
      {[...items, ...strips].map((it, i) => (
        <mesh key={i} position={it.p} rotation={[-Math.PI / 2, 0, 0]} scale={[it.s[0], it.s[1], 1]} material={m} renderOrder={1}>
          <planeGeometry args={[1, 1]} />
        </mesh>
      ))}
    </group>
  );
}

export function Props({ lights = true }: { lights?: boolean }) {
  const lib = cachedTextures();
  const wood = useMemo(() => mat('#3b2616', 0.75, 0, { map: lib?.wood?.map }), [lib]);
  const iron = useMemo(() => mat('#1c1a18', 0.5, 0.75), []);
  const web = useMemo(() => new THREE.MeshBasicMaterial({ map: cobwebTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.6 }), []);
  const paper = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: signTexture(256, 320, (c, w, h) => {
          c.fillStyle = '#b9b09a';
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#2a2620';
          c.font = '700 26px "Noto Serif Bengali", "Nirmala UI", serif';
          c.fillText('দৈনিক সংবাদ', 18, 40);
          c.font = '15px Georgia';
          c.fillText('14 March 1999', 18, 64);
          c.font = '700 20px Georgia';
          c.fillText('ARCHIVISTS MISSING', 18, 104);
          for (let y = 124; y < h - 10; y += 12) c.fillRect(18, y, w - 36 - Math.random() * 60, 4);
          ageCanvas(c, w, h, 0.6);
        }),
        roughness: 0.95,
        side: THREE.DoubleSide,
      }),
    [],
  );
  return (
    <group name="props">
      {[-32, -16, 16, 32].map((x) => (
        <IronBench key={x} x={x} z={5.85} wood={wood} iron={iron} />
      ))}
      {[[-15.5, -8.8], [-4.5, -8.8], [-15.5, -4.5], [-4.5, -4.5]].map(([x, z]) => (
        <group key={`${x}${z}`} scale={[2.05, 1, 1]}>
          <IronBench x={x / 2.05} z={z} rot={Math.PI} wood={wood} iron={iron} />
        </group>
      ))}
      <WeighingMachine p={[-21.4, 0, 0.42]} />
      <Shrine p={[-4, 0, 6.32 - 0.16]} light={lights} />
      <Trunk p={[8.4, 0, 5.1]} r={0.4} />
      <Doll p={[2.4, 0, 6.85]} r={1.1} />
      <Chappals p={[-6.8, 0, 3.1]} />
      <Chappals p={[-1.2, -3.5, 3.0]} />
      <mesh position={[16.4, 0.53, 5.95]} rotation={[-Math.PI / 2, 0, 0.3]} material={paper}>
        <planeGeometry args={[0.42, 0.52]} />
      </mesh>
      <mesh position={[-9.5, 0.012, 2.6]} rotation={[-Math.PI / 2, 0, -0.6]} material={paper}>
        <planeGeometry args={[0.42, 0.52]} />
      </mesh>
      <IndicatorBoard p={[-8, 4.25, 3]} />
      <IndicatorBoard p={[18, 4.25, 3]} />
      <HangingTube p={[6, 4.95, 4.2]} />
      <HangingTube p={[-30, 4.95, 2.6]} />
      {/* cobwebs in the corners of pillars and canopy */}
      {[-36, -20, -4, 12, 28].map((x) => (
        <mesh key={x} position={[x + 0.18, 4.4, 6.68]} rotation={[Math.PI, 0, Math.PI / 2]} material={web}>
          <planeGeometry args={[1.1, 1.1]} />
        </mesh>
      ))}
      <mesh position={[-29.7, 3.6, -13.7]} rotation={[0, 0, Math.PI]} material={web}>
        <planeGeometry args={[1.4, 1.4]} />
      </mesh>
      <mesh position={[29.7, 3.6, -0.6]} rotation={[0, Math.PI, Math.PI]} material={web}>
        <planeGeometry args={[1.4, 1.4]} />
      </mesh>
      <Weeds />
      <Cables />
      <ContactShadows />
    </group>
  );
}
