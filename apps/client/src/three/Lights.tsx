import { useFrame } from '@react-three/fiber';
import type { LightDef, LevelDef } from '@nishi/shared';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx, now } from '../game/fx';
import { runtime } from '../game/runtime';
import { app } from '../state/store';
import { MOON_DIR } from './Atmosphere';

/** current brightness factor (0..1+) of every level light, shared with other scene parts */
export const lightLevels = new Map<string, number>();

const LIGHT_SCALE = 3.6;

let haloTex: THREE.Texture | null = null;
function halo() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

function chronic(def: LightDef, t: number, reduced: boolean) {
  const f = def.faulty ?? 0;
  if (!f) return 1;
  const seed = def.id.length * 17.3 + def.pos.x;
  const n = Math.sin(t * 9.1 + seed) * Math.sin(t * 3.7 + seed * 1.7) * Math.sin(t * 0.9 + seed * 0.3);
  if (n > 1 - f * 0.35) return reduced ? 0.55 : 0.08 + Math.random() * 0.15;
  return 1 - f * 0.15 * (0.5 + 0.5 * Math.sin(t * 50 + seed));
}

export function computeLightLevel(def: LightDef, t: number, reduced: boolean): number {
  const snap = runtime.snap;
  const power = runtime.menu ? false : !!snap?.world.power;
  if (def.circuit === 'main' && !power) return 0;
  if (snap && (snap.world.lightsOff[def.id] ?? 0) > snap.time) return 0;
  let f = chronic(def, t, reduced);
  const forced = fx.flicker.get(def.id);
  if (forced && forced > t) {
    if (reduced) f *= 0.45 + 0.15 * Math.sin(t * 6);
    else f *= Math.sin(t * 37 + def.pos.z) * Math.sin(t * 11.3) > 0 ? 1 : 0.04;
  }
  if (def.circuit === 'main' && fx.powerOnAt && t - fx.powerOnAt < 2.5) {
    const k = (t - fx.powerOnAt) / 2.5;
    f *= reduced ? k : Math.random() < k ? 1 : 0.05;
  }
  // the Caller drains light near it while hunting
  const g = snap?.ghost;
  if (g && (g.mode === 'hunt' || g.mode === 'warn')) {
    const d = Math.hypot(g.pos.x - def.pos.x, g.pos.z - def.pos.z, (g.pos.y - def.pos.y) * 0.5);
    if (d < 9) f *= 0.25 + (d / 9) * 0.75;
  }
  return f;
}

const coneMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
    vertexShader: /* glsl */ `
      varying float vH; varying float vEdge;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vH; varying float vEdge;
      void main() {
        float a = pow(vH, 1.6) * pow(vEdge, 1.4) * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });

function Fixture({ def }: { def: LightDef }) {
  const tubeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#2a2a28', emissive: new THREE.Color(def.color), emissiveIntensity: 0, roughness: 0.4 }),
    [def.color],
  );
  const cone = useMemo(coneMaterial, []);
  const haloMat = useMemo(
    () => new THREE.SpriteMaterial({ map: halo(), color: def.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    [def.color],
  );
  const indoor = def.pos.y < 4.5;
  const coneH = def.kind === 'tube' ? (def.pos.y < 0 ? 2.8 : indoor ? 3.8 : 4.6) : def.kind === 'bulb' ? 3.2 : 0;
  useFrame(() => {
    const lv = lightLevels.get(def.id) ?? 0;
    tubeMat.emissiveIntensity = lv * (def.kind === 'lamp' ? 6 : def.kind === 'lantern' ? 8 : 3.2);
    cone.uniforms.uOpacity.value = lv * (def.kind === 'tube' ? 0.07 : 0.05);
    haloMat.opacity = Math.min(1, lv) * (def.kind === 'lamp' ? 0.5 : def.kind === 'sign' ? 0.25 : 0.42);
    (cone.uniforms.uColor.value as THREE.Color).set(def.color);
  });
  return (
    <group position={[def.pos.x, def.pos.y, def.pos.z]}>
      {def.kind === 'tube' && (
        <>
          <mesh position={[0, 0.06, 0]}>
            <boxGeometry args={[1.35, 0.06, 0.16]} />
            <meshStandardMaterial color="#3b3a36" roughness={0.6} metalness={0.4} />
          </mesh>
          <mesh material={tubeMat} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.025, 0.025, 1.22, 8]} />
          </mesh>
        </>
      )}
      {def.kind === 'bulb' && (
        <>
          <mesh position={[0, 0.12, 0]}>
            <coneGeometry args={[0.28, 0.18, 16, 1, true]} />
            <meshStandardMaterial color="#2c3a2e" side={THREE.DoubleSide} roughness={0.5} metalness={0.5} />
          </mesh>
          <mesh material={tubeMat}>
            <sphereGeometry args={[0.07, 12, 8]} />
          </mesh>
          <mesh position={[0, 0.6, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 1.0, 4]} />
            <meshBasicMaterial color="#111" />
          </mesh>
        </>
      )}
      {def.kind === 'lantern' && (
        <>
          <mesh position={[0, 0.3, -0.25]}>
            <boxGeometry args={[0.04, 0.04, 0.5]} />
            <meshStandardMaterial color="#1c1a17" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <cylinderGeometry args={[0.13, 0.09, 0.32, 6]} />
            <meshStandardMaterial color="#2a2a26" metalness={0.5} roughness={0.4} transparent opacity={0.55} />
          </mesh>
          <mesh position={[0, 0.22, 0]}>
            <coneGeometry args={[0.17, 0.14, 6]} />
            <meshStandardMaterial color="#1a1916" metalness={0.6} roughness={0.5} />
          </mesh>
          <mesh material={tubeMat}>
            <sphereGeometry args={[0.05, 10, 8]} />
          </mesh>
        </>
      )}
      <sprite material={haloMat} scale={def.kind === 'tube' ? [2.6, 1.3, 1] : def.kind === 'sign' ? [3, 1.6, 1] : [1.7, 1.7, 1]} />
      {def.kind === 'lamp' && (
        <mesh material={tubeMat}>
          <sphereGeometry args={[0.05, 10, 8]} />
        </mesh>
      )}
      {coneH > 0 && (
        <mesh material={cone} position={[0, -coneH / 2, 0]}>
          <coneGeometry args={[def.kind === 'tube' ? 2.2 : 1.7, coneH, 24, 1, true]} />
        </mesh>
      )}
    </group>
  );
}

export function LightRig({ level, pool }: { level: LevelDef; pool: number }) {
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const assigned = useRef<string[]>([]);
  const lastAssign = useRef(0);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const byId = useMemo(() => new Map(level.lights.map((l) => [l.id, l])), [level]);

  useFrame(() => {
    const t = now();
    const reduced = app().settings.reducedFlashing;
    const under = runtime.eye.y < -1.5;
    if (hemi.current) hemi.current.intensity = under ? 0.03 : 0.07;
    if (moon.current) moon.current.intensity = under ? 0 : 0.28;
    for (const l of level.lights) lightLevels.set(l.id, computeLightLevel(l, t, reduced));

    if (t - lastAssign.current > 0.2) {
      lastAssign.current = t;
      const e = runtime.eye;
      assigned.current = level.lights
        .filter((l) => (lightLevels.get(l.id) ?? 0) > 0 || l.circuit === 'emergency')
        .map((l) => ({ id: l.id, d: (l.pos.x - e.x) ** 2 + ((l.pos.y - e.y) * 2) ** 2 + (l.pos.z - e.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        .slice(0, pool)
        .map((x) => x.id);
    }
    refs.current.forEach((pl, i) => {
      if (!pl) return;
      const def = byId.get(assigned.current[i]);
      if (!def) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(def.pos.x, def.pos.y - 0.15, def.pos.z);
      pl.color.set(def.color);
      pl.distance = def.distance;
      pl.intensity = def.intensity * LIGHT_SCALE * (lightLevels.get(def.id) ?? 0);
    });

  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#1b3a40', '#030404', 0.07]} />
      <directionalLight ref={moon} color="#7fb3bd" intensity={0.28} position={[MOON_DIR.x * 60, MOON_DIR.y * 60, MOON_DIR.z * 60]} />
      {Array.from({ length: pool }, (_, i) => (
        <pointLight key={i} ref={(el) => {
            refs.current[i] = el;
          }} decay={2} intensity={0} />
      ))}
      {level.lights.map((l) => (
        <Fixture key={l.id} def={l} />
      ))}
    </>
  );
}
