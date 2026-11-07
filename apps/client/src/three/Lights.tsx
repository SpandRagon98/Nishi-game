import { useFrame } from '@react-three/fiber';
import type { LightDef, LevelDef } from '@nishi/shared';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx, now } from '../game/fx';
import { runtime } from '../game/runtime';
import { MOON_DIR } from './Atmosphere';
import { StaticBatch } from './StaticBatch';

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

/** faulty tubes breathe slowly and sag now and then; nothing strobes */
function chronic(def: LightDef, t: number) {
  const f = def.faulty ?? 0;
  if (!f) return 1;
  const seed = def.id.length * 17.3 + def.pos.x;
  const slow = Math.sin(t * 0.7 + seed) * Math.sin(t * 0.23 + seed * 1.7);
  return 1 - f * (0.18 + 0.32 * Math.max(0, slow));
}

/** target brightness of a level light; the rig eases towards it so every change is a fade */
export function computeLightLevel(def: LightDef, t: number): number {
  const snap = runtime.snap;
  const power = runtime.menu ? false : !!snap?.world.power;
  if (def.circuit === 'main' && !power) return 0;
  if (snap && (snap.world.lightsOff[def.id] ?? 0) > snap.time) return 0;
  let f = chronic(def, t);
  // a director "flicker" is a slow brown-out, not a strobe
  const forced = fx.flicker.get(def.id);
  if (forced && forced > t) f *= 0.3;
  // the Caller drains light near it while hunting
  const g = snap?.ghost;
  if (g && (g.mode === 'hunt' || g.mode === 'warn')) {
    const d = Math.hypot(g.pos.x - def.pos.x, g.pos.z - def.pos.z, (g.pos.y - def.pos.y) * 0.5);
    if (d < 9) f *= 0.3 + (d / 9) * 0.7;
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
      varying float vH; varying float vEdge; varying float vDepth;
      void main() {
        vH = uv.y;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        vec3 n = normalize(normalMatrix * normal);
        vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uOpacity;
      varying float vH; varying float vEdge; varying float vDepth;
      void main() {
        // fade out as the camera gets close or walks through it, so it never washes the screen
        float a = pow(max(vH, 1e-4), 1.6) * pow(max(vEdge, 1e-4), 1.4) * uOpacity * smoothstep(1.2, 4.5, vDepth);
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });

function Fixture({ def, shafts }: { def: LightDef; shafts: boolean }) {
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
  const coneH = !shafts ? 0 : def.kind === 'tube' ? (def.pos.y < 0 ? 2.8 : indoor ? 3.8 : 4.6) : def.kind === 'bulb' ? 3.2 : 0;
  useFrame(() => {
    const lv = lightLevels.get(def.id) ?? 0;
    tubeMat.emissiveIntensity = lv * (def.kind === 'lamp' ? 6 : def.kind === 'lantern' ? 8 : 3.2);
    cone.uniforms.uOpacity.value = lv * (def.kind === 'tube' ? 0.07 : 0.05);
    haloMat.opacity = Math.min(1, lv) * (def.kind === 'lamp' ? 0.35 : def.kind === 'sign' ? 0.18 : 0.28);
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
      {shafts && <sprite material={haloMat} scale={def.kind === 'tube' ? [2.6, 1.3, 1] : def.kind === 'sign' ? [3, 1.6, 1] : [1.7, 1.7, 1]} />}
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

interface Slot {
  id: string | null;
  /** crossfade weight: a slot fades out before it moves to another fixture, then fades back in */
  w: number;
}

export function LightRig({ level, pool, shafts = true }: { level: LevelDef; pool: number; shafts?: boolean }) {
  const refs = useRef<(THREE.PointLight | null)[]>([]);
  const slots = useRef<Slot[]>([]);
  const wanted = useRef<string[]>([]);
  const lastAssign = useRef(0);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const byId = useMemo(() => new Map(level.lights.map((l) => [l.id, l])), [level]);
  if (slots.current.length !== pool) slots.current = Array.from({ length: pool }, () => ({ id: null, w: 0 }));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = now();
    const under = runtime.eye.y < -1.5;
    if (hemi.current) hemi.current.intensity = THREE.MathUtils.damp(hemi.current.intensity, under ? 0.03 : 0.07, 2, dt);
    if (moon.current) moon.current.intensity = THREE.MathUtils.damp(moon.current.intensity, under ? 0 : 0.28, 2, dt);
    // ease every light towards its target so power cuts, brown-outs and the Caller's drain all fade
    for (const l of level.lights) {
      const target = computeLightLevel(l, t);
      const cur = lightLevels.get(l.id) ?? target;
      const rate = target > cur ? 2.2 : 3.5;
      lightLevels.set(l.id, THREE.MathUtils.damp(cur, target, rate, dt));
    }

    if (t - lastAssign.current > 0.25) {
      lastAssign.current = t;
      const e = runtime.eye;
      wanted.current = level.lights
        .filter((l) => (lightLevels.get(l.id) ?? 0) > 0.02 || l.circuit === 'emergency')
        .map((l) => ({ id: l.id, d: (l.pos.x - e.x) ** 2 + ((l.pos.y - e.y) * 2) ** 2 + (l.pos.z - e.z) ** 2 }))
        .sort((a, b) => a.d - b.d)
        // one spare so a fixture right on the edge of the set doesn't swap back and forth
        .slice(0, pool + 1)
        .map((x) => x.id);
    }
    const want = wanted.current;
    const core = new Set(want.slice(0, pool));
    const keep = new Set(want);
    const held = new Set(slots.current.map((s) => s.id));
    for (const slot of slots.current) {
      const stale = !slot.id || !keep.has(slot.id);
      if (stale) {
        slot.w = Math.max(0, slot.w - dt * 2.5);
        if (slot.w === 0) {
          // free: take the nearest wanted fixture nobody is lighting yet
          const next = want.find((id) => core.has(id) && !held.has(id)) ?? null;
          if (slot.id) held.delete(slot.id);
          slot.id = next;
          if (next) held.add(next);
        }
      } else slot.w = Math.min(1, slot.w + dt * 2.5);
    }
    refs.current.forEach((pl, i) => {
      const slot = slots.current[i];
      if (!pl || !slot) return;
      const def = slot.id ? byId.get(slot.id) : undefined;
      if (!def) {
        pl.intensity = 0;
        return;
      }
      pl.position.set(def.pos.x, def.pos.y - 0.15, def.pos.z);
      pl.color.set(def.color);
      pl.distance = def.distance;
      const ease = slot.w * slot.w * (3 - 2 * slot.w);
      pl.intensity = def.intensity * LIGHT_SCALE * (lightLevels.get(def.id) ?? 0) * ease;
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
      <StaticBatch>
        {level.lights.map((l) => (
          <Fixture key={l.id} def={l} shafts={shafts} />
        ))}
      </StaticBatch>
    </>
  );
}
