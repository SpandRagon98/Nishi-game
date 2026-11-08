import { useFrame } from '@react-three/fiber';
import { FLAG_CROUCH, FLAG_FLASHLIGHT, survivorById, type SurvivorView } from '@nishi/shared';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { fx, now } from '../game/fx';
import { runtime } from '../game/runtime';
import { CallerFigure, type GhostControl } from './Ghost';

export interface AnimState {
  speed: number;
  crouch: boolean;
  down: boolean;
  phase: number;
}

type Palette = { coat: string; accent: string; trousers: string; skin: string; hair: string };

function Limb({ len, r, material, position, rotation }: { len: number; r: number; material: THREE.Material; position?: [number, number, number]; rotation?: [number, number, number] }) {
  return (
    <mesh material={material} position={position} rotation={rotation} castShadow>
      <capsuleGeometry args={[r, len, 4, 8]} />
    </mesh>
  );
}

/**
 * Procedural humanoid used for survivors (remote players, character select) and, with the spectral
 * material and longer proportions, for the Caller.
 */
export function Humanoid({ palette, anim, characterId, spectral, height = 1 }: {
  palette: Palette; anim: React.MutableRefObject<AnimState>; characterId?: string; spectral?: THREE.Material; height?: number;
}) {
  const mats = useMemo(() => {
    if (spectral) return { coat: spectral, trousers: spectral, skin: spectral, hair: spectral, accent: spectral, shoe: spectral };
    return {
      coat: new THREE.MeshStandardMaterial({ color: palette.coat, roughness: 0.85 }),
      trousers: new THREE.MeshStandardMaterial({ color: palette.trousers, roughness: 0.9 }),
      skin: new THREE.MeshStandardMaterial({ color: palette.skin, roughness: 0.6 }),
      hair: new THREE.MeshStandardMaterial({ color: palette.hair, roughness: 0.7 }),
      accent: new THREE.MeshStandardMaterial({ color: palette.accent, roughness: 0.4, metalness: 0.3, emissive: characterId === 'kabir' ? palette.accent : '#000', emissiveIntensity: 0.15 }),
      shoe: new THREE.MeshStandardMaterial({ color: '#141312', roughness: 0.6 }),
    };
  }, [palette, spectral, characterId]);
  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const long = spectral ? 1.25 : 1;

  useFrame((_, dt) => {
    const a = anim.current;
    a.phase += dt * (2 + a.speed * 2.4);
    const amp = Math.min(1, a.speed / 3) * 0.7;
    const s = Math.sin(a.phase);
    if (legL.current && legR.current && armL.current && armR.current && hips.current && root.current && kneeL.current && kneeR.current) {
      const crouch = a.crouch ? 1 : 0;
      legL.current.rotation.x = s * amp - crouch * 0.9;
      legR.current.rotation.x = -s * amp - crouch * 0.9;
      kneeL.current.rotation.x = Math.max(0, -s) * amp * 1.2 + crouch * 1.6;
      kneeR.current.rotation.x = Math.max(0, s) * amp * 1.2 + crouch * 1.6;
      armL.current.rotation.x = -s * amp * 0.8 + (spectral ? -0.25 : 0);
      armR.current.rotation.x = s * amp * 0.8 - (spectral ? 0.25 : 0.35);
      hips.current.position.y = (0.95 - crouch * 0.38) * long + Math.abs(Math.cos(a.phase)) * 0.03 * amp;
      root.current.rotation.x = THREE.MathUtils.lerp(root.current.rotation.x, a.down ? -Math.PI / 2 : 0, Math.min(1, dt * 6));
      root.current.position.y = THREE.MathUtils.lerp(root.current.position.y, a.down ? 0.2 : 0, Math.min(1, dt * 6));
      if (head.current && spectral) head.current.rotation.z = 0.45 + Math.sin(now() * 0.7) * 0.08;
    }
  });

  const L = 0.42 * long;
  return (
    <group ref={root} scale={height}>
      <group ref={hips} position={[0, 0.95 * long, 0]}>
        {/* legs */}
        {([[-0.1, legL, kneeL], [0.1, legR, kneeR]] as const).map(([x, leg, knee]) => (
          <group key={x} ref={leg} position={[x, 0, 0]}>
            <Limb len={L * 0.8} r={0.075} material={mats.trousers} position={[0, -L / 2, 0]} />
            <group ref={knee} position={[0, -L, 0]}>
              <Limb len={L * 0.8} r={0.065} material={mats.trousers} position={[0, -L / 2, 0]} />
              <mesh position={[0, -L - 0.03, 0.05]} material={mats.shoe}>
                <boxGeometry args={[0.11, 0.07, 0.26]} />
              </mesh>
            </group>
          </group>
        ))}
        {/* torso */}
        <Limb len={0.36 * long} r={0.17} material={mats.coat} position={[0, 0.33 * long, 0]} />
        {characterId === 'kabir' && !spectral && (
          <>
            <mesh position={[0, 0.25, 0.165]} material={mats.accent}>
              <boxGeometry args={[0.34, 0.035, 0.02]} />
            </mesh>
            <mesh position={[0, 0.45, 0.165]} material={mats.accent}>
              <boxGeometry args={[0.34, 0.035, 0.02]} />
            </mesh>
          </>
        )}
        {characterId === 'aditi' && !spectral && (
          <mesh position={[0, 0.66, 0]} rotation={[Math.PI / 2.3, 0, 0]} material={mats.accent}>
            <torusGeometry args={[0.1, 0.018, 6, 16]} />
          </mesh>
        )}
        {/* arms */}
        {([[-0.24, armL], [0.24, armR]] as const).map(([x, arm]) => (
          <group key={x} ref={arm} position={[x, 0.58 * long, 0]}>
            <Limb len={0.27 * long} r={0.055} material={mats.coat} position={[0, -0.17 * long, 0]} />
            <Limb len={0.25 * long} r={0.045} material={spectral ? mats.coat : mats.skin} position={[0, -0.47 * long, 0.03]} />
          </group>
        ))}
        {/* head */}
        <group ref={head} position={[0, 0.83 * long, 0]}>
          <mesh material={mats.skin} castShadow scale={spectral ? [0.9, 1.35, 0.9] : [1, 1.1, 1]}>
            <sphereGeometry args={[0.11, 16, 12]} />
          </mesh>
          {!spectral && (
            <mesh material={mats.hair} position={[0, 0.03, -0.015]} scale={[1.05, 0.9, 1.06]}>
              <sphereGeometry args={[0.112, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
            </mesh>
          )}
          {spectral && (
            <>
              {[-0.035, 0.035].map((x) => (
                <mesh key={x} position={[x, 0.02, 0.095]}>
                  <sphereGeometry args={[0.008, 6, 6]} />
                  <meshBasicMaterial color="#e8f2ff" />
                </mesh>
              ))}
              <mesh position={[0, -0.06, 0.09]} scale={[0.5, 1.8, 0.3]}>
                <sphereGeometry args={[0.03, 8, 8]} />
                <meshBasicMaterial color="#000" />
              </mesh>
            </>
          )}
        </group>
      </group>
    </group>
  );
}

// ───────────────────────────── the Caller ─────────────────────────────

export function spectralMaterial(glow = '#9fb8c8', base = '#06080a') {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.92 }, uGlow: { value: new THREE.Color(glow) }, uBase: { value: new THREE.Color(base) }, uStun: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uStun;
      varying vec3 vN; varying vec3 vV; varying float vY;
      float h(float n){ return fract(sin(n) * 43758.5453); }
      void main() {
        vec3 p = position;
        vec4 w = modelMatrix * vec4(p, 1.0);
        float slice = floor(w.y * 9.0 + floor(uTime * 12.0));
        float glitch = step(0.94, h(slice + floor(uTime * 7.0))) * (h(slice) - 0.5) * 0.18;
        w.x += glitch + uStun * sin(uTime * 90.0 + w.y * 10.0) * 0.03;
        w.z += glitch * 0.5;
        vec4 mv = viewMatrix * w;
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vY = w.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uOpacity; uniform vec3 uGlow; uniform vec3 uBase; uniform float uStun;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float rim = pow(max(1.0 - abs(dot(vN, vV)), 1e-4), 2.2);
        float scan = 0.85 + 0.15 * sin(vY * 140.0 - uTime * 6.0);
        vec3 c = uBase + uGlow * rim * (1.2 + uStun * 2.0) * scan;
        gl_FragColor = vec4(c, uOpacity * (0.75 + rim * 0.5));
      }`,
  });
}

export function shadowMaterial() {
  const m = spectralMaterial('#1a1d22', '#000000');
  m.uniforms.uOpacity.value = 0.95;
  return m;
}

const CALLER_PALETTE = { coat: '#000', accent: '#000', trousers: '#000', skin: '#000', hair: '#000' };

/** The hunting / stunned Caller as seen by survivors. */
export function GhostActor() {
  const group = useRef<THREE.Group>(null);
  const control = useRef<GhostControl>({ opacity: 0, speed: 0, stunned: false });
  const last = useRef(new THREE.Vector3());
  useFrame((_, dt) => {
    const g = (import.meta.env.DEV && runtime.debugCaller) || runtime.snap?.ghost;
    const grp = group.current;
    if (!g || !grp) return;
    const t = now();
    // before a hunt it surfaces as a faint, slowly breathing shape rather than a strobe
    const warn = g.mode === 'warn' && !g.visible;
    grp.visible = g.visible || warn;
    const target = new THREE.Vector3(g.pos.x, g.pos.y, g.pos.z);
    if (grp.position.distanceTo(target) > 4) grp.position.copy(target);
    else grp.position.lerp(target, Math.min(1, dt * 10));
    grp.rotation.y = THREE.MathUtils.lerp(grp.rotation.y, g.yaw + Math.PI, Math.min(1, dt * 8));
    const c = control.current;
    c.speed = dt > 0 ? Math.min(1, last.current.distanceTo(grp.position) / dt / 5) : 0;
    last.current.copy(grp.position);
    c.stunned = g.mode === 'stunned';
    c.opacity = warn ? 0.22 + 0.12 * Math.sin(t * 1.6) : 0.94;
  });
  return (
    <group ref={group} visible={false} userData={{ warm: true }}>
      <CallerFigure control={control} />
    </group>
  );
}

/** Director apparitions / shadows and ghost-player apparitions (render-only). Three pooled slots. */
export function Apparitions() {
  const slots = useMemo(() => [0, 1, 2].map(() => ({ spectral: { opacity: 0, speed: 0, stunned: false } as GhostControl, shadow: shadowMaterial() })), []);
  const refs = useRef<{ spectral: THREE.Group | null; shadow: THREE.Group | null }[]>([0, 1, 2].map(() => ({ spectral: null, shadow: null })));
  const anims = useRef([0, 1, 2].map(() => ({ current: { speed: 0, crouch: false, down: false, phase: 0 } as AnimState })));
  useFrame(() => {
    const t = now();
    fx.apparitions = fx.apparitions.filter((a) => a.until > t);
    const list = fx.apparitions.slice(-3);
    refs.current.forEach((r, i) => {
      const a = list[i];
      for (const kind of ['spectral', 'shadow'] as const) {
        const g = r[kind];
        if (!g) continue;
        const on = !!a && (a.kind === 'shadow') === (kind === 'shadow');
        g.visible = on;
        if (!on) continue;
        g.position.set(a.pos.x, a.pos.y, a.pos.z);
        g.rotation.y = a.yaw + Math.PI;
        const fade = Math.min(1, (a.until - t) * 2);
        if (kind === 'shadow') {
          slots[i].shadow.uniforms.uTime.value = t;
          slots[i].shadow.uniforms.uOpacity.value = fade * 0.9;
        } else slots[i].spectral.opacity = fade * 0.85;
      }
    });
  });
  return (
    <>
      {slots.map((m, i) =>
        (['spectral', 'shadow'] as const).map((kind) => (
          <group key={`${i}${kind}`} visible={false} userData={{ warm: true }} ref={(el) => {
            refs.current[i][kind] = el;
          }}>
            {kind === 'shadow' ? (
              <Humanoid palette={CALLER_PALETTE} anim={anims.current[i]} spectral={m.shadow} height={1.05} />
            ) : (
              <CallerFigure control={{ current: m.spectral }} />
            )}
          </group>
        )),
      )}
    </>
  );
}

// ───────────────────────────── remote survivors ─────────────────────────────

const beamMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `varying float vH; varying float vDepth; void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying float vH; varying float vDepth; void main(){ float a = vH * vH * 0.09 * smoothstep(1.0, 4.0, vDepth); gl_FragColor = vec4(vec3(1.0,0.93,0.78)*a, a); }`,
  });

function RemoteSurvivor({ id, ghostVision }: { id: string; ghostVision: boolean }) {
  const group = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const anim = useRef<AnimState>({ speed: 0, crouch: false, down: false, phase: 0 });
  const last = useRef(new THREE.Vector3());
  const init = useRef(false);
  const view = runtime.snap?.survivors.find((s) => s.id === id);
  const def = survivorById(view?.characterId ?? 'aditi');
  const bm = useMemo(beamMat, []);
  useFrame((_, dt) => {
    const s = runtime.snap?.survivors.find((x) => x.id === id);
    const g = group.current;
    if (!s || !g) return;
    g.visible = !s.hiding && s.status !== 'captured' && s.status !== 'escaped';
    const target = new THREE.Vector3(s.pos.x, s.pos.y, s.pos.z);
    if (!init.current || g.position.distanceTo(target) > 5) {
      g.position.copy(target);
      init.current = true;
    } else g.position.lerp(target, Math.min(1, dt * 12)); // interpolate between 15 Hz server updates
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, s.yaw + Math.PI, Math.min(1, dt * 10));
    anim.current.speed = dt > 0 ? Math.min(6, last.current.distanceTo(g.position) / dt) : 0;
    anim.current.crouch = !!(s.flags & FLAG_CROUCH);
    anim.current.down = s.status === 'downed';
    last.current.copy(g.position);
    if (beam.current) {
      beam.current.visible = !!(s.flags & FLAG_FLASHLIGHT) && s.status === 'alive';
      beam.current.rotation.x = -Math.PI / 2 + s.pitch;
    }
    if (ring.current) {
      // the Caller "hears" noise as rings through walls
      ring.current.visible = ghostVision && s.noise > 0.2 && g.visible;
      const k = (now() * 1.5) % 1;
      ring.current.scale.setScalar(0.5 + k * (s.noise >= 1 ? 6 : 2.5));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - k) * 0.6;
    }
  });
  return (
    <group ref={group}>
      <Humanoid palette={def.palette} anim={anim} characterId={def.id} />
      <group ref={beam} position={[0.2, 1.35, 0.15]}>
        <mesh material={bm} position={[0, 3, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[1.3, 6, 16, 1, true]} />
        </mesh>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]} visible={false} renderOrder={10}>
        <ringGeometry args={[0.9, 1, 32]} />
        <meshBasicMaterial color="#b8d6ff" transparent depthTest={false} opacity={0.5} />
      </mesh>
    </group>
  );
}

export function RemoteSurvivors({ localId, ghostVision }: { localId: string; ghostVision: boolean }) {
  const [ids, setIds] = useState<string[]>([]);
  useFrame(() => {
    const next = (runtime.snap?.survivors ?? []).map((s: SurvivorView) => s.id).filter((id) => id !== localId);
    if (next.join() !== ids.join()) setIds(next);
  });
  return (
    <>
      {ids.map((id) => (
        <RemoteSurvivor key={id} id={id} ghostVision={ghostVision} />
      ))}
    </>
  );
}
