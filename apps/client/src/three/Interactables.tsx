import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, interactionGroups, type RapierRigidBody } from '@react-three/rapier';
import type { DoorDef, InteractableDef, LevelDef, MaterialId, Vec3 } from '@nishi/shared';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { now } from '../game/fx';
import { runtime } from '../game/runtime';

export const DOOR_GROUP = interactionGroups(1);

function doorGeometry(d: DoorDef) {
  const w = d.axis === 'x' ? d.gap.maxX - d.gap.minX : d.gap.maxZ - d.gap.minZ;
  const hinge: [number, number, number] = d.axis === 'x' ? [d.gap.minX, 0, (d.gap.minZ + d.gap.maxZ) / 2] : [(d.gap.minX + d.gap.maxX) / 2, 0, d.gap.minZ];
  const closed = d.axis === 'x' ? 0 : -Math.PI / 2;
  const open = d.axis === 'x' ? (d.swing === -1 ? 1.75 : -1.75) : closed + (d.swing === 1 ? 1.65 : -1.65);
  return { w, hinge, closed, open };
}

function Door({ def, materials }: { def: DoorDef; materials: Record<MaterialId, THREE.Material> }) {
  const body = useRef<RapierRigidBody>(null);
  const { w, hinge, closed, open } = useMemo(() => doorGeometry(def), [def]);
  const angle = useRef(def.open ? open : closed);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const e = useMemo(() => new THREE.Euler(), []);
  useFrame((_, dt) => {
    const st = runtime.snap?.world.doors[def.id];
    const target = (st ? st.open : def.open) ? open : closed;
    const slam = 1 - Math.exp(-dt * (target === closed ? 9 : 4));
    angle.current += (target - angle.current) * slam;
    e.set(0, angle.current, 0);
    q.setFromEuler(e);
    body.current?.setNextKinematicRotation(q);
  });
  const mat = def.lockedBy ? materials.rust : materials.wood;
  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={hinge} rotation={[0, angle.current, 0]}>
      <CuboidCollider args={[w / 2 - 0.02, def.height / 2, 0.035]} position={[w / 2, def.height / 2, 0]} collisionGroups={DOOR_GROUP} />
      <mesh position={[w / 2, def.height / 2, 0]} material={mat} castShadow>
        <boxGeometry args={[w - 0.04, def.height - 0.02, 0.06]} />
      </mesh>
      <mesh position={[w - 0.12, 1.0, 0.05]}>
        <boxGeometry args={[0.03, 0.12, 0.04]} />
        <meshStandardMaterial color="#8a7448" metalness={0.8} roughness={0.35} />
      </mesh>
      {/* a small grimy window in wooden doors */}
      {!def.lockedBy && (
        <mesh position={[w / 2, 1.55, 0.032]}>
          <planeGeometry args={[w * 0.5, 0.4]} />
          <meshStandardMaterial color="#0b0d0f" roughness={0.15} metalness={0.5} />
        </mesh>
      )}
    </RigidBody>
  );
}

/** Collapsible scissor gate at the exit; its collider disappears once open. */
function ExitGate({ level }: { level: LevelDef }) {
  const lattice = useRef<THREE.Group>(null);
  const [solid, setSolid] = useState(true);
  const gb = level.exitGate;
  const bars = useMemo(() => Array.from({ length: 18 }, (_, i) => i), []);
  useFrame(() => {
    const snap = runtime.snap;
    const w = snap?.world;
    let progress = 0;
    if (w?.exitOpen) progress = 1;
    else if (w?.exitOpenAt) progress = Math.max(0, Math.min(1, 1 - (w.exitOpenAt - (snap?.time ?? 0)) / 6));
    if (lattice.current) lattice.current.scale.x = 1 - progress * 0.88 + Math.sin(now() * 40) * (progress > 0 && progress < 1 ? 0.004 : 0);
    const shouldBeSolid = !w?.exitOpen;
    if (shouldBeSolid !== solid) setSolid(shouldBeSolid);
  });
  const x0 = gb.c[0] - gb.s[0] / 2;
  return (
    <group>
      {solid && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[gb.s[0] / 2, gb.s[1] / 2, gb.s[2] / 2]} position={gb.c} />
        </RigidBody>
      )}
      <group ref={lattice} position={[x0, 0, gb.c[2]]}>
        {bars.map((i) => (
          <mesh key={i} position={[(i / 17) * gb.s[0], 1.5, 0]}>
            <boxGeometry args={[0.025, 3, 0.025]} />
            <meshStandardMaterial color="#3a2c22" metalness={0.6} roughness={0.5} />
          </mesh>
        ))}
        {bars.slice(0, 17).map((i) =>
          [0.8, 2.2].map((y, k) => (
            <mesh key={`${i}-${k}`} position={[((i + 0.5) / 17) * gb.s[0], y, 0.02]} rotation={[0, 0, k % 2 ? 0.9 : -0.9]}>
              <boxGeometry args={[0.018, 0.4, 0.018]} />
              <meshStandardMaterial color="#45352a" metalness={0.6} roughness={0.5} />
            </mesh>
          )),
        )}
        <mesh position={[gb.s[0] / 2, 3.05, 0]}>
          <boxGeometry args={[gb.s[0], 0.1, 0.08]} />
          <meshStandardMaterial color="#2e241d" metalness={0.6} roughness={0.5} />
        </mesh>
      </group>
      {/* gate motor box */}
      <mesh position={[gb.c[0] + 2.4, 2.6, gb.c[2] + 0.25]}>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial color="#4a4d47" metalness={0.5} roughness={0.6} />
      </mesh>
    </group>
  );
}

const glintMat = () =>
  new THREE.SpriteMaterial({
    map: (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,240,210,1)');
      grad.addColorStop(0.25, 'rgba(255,220,170,0.35)');
      grad.addColorStop(1, 'rgba(255,220,170,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });

function Glint({ seed }: { seed: number }) {
  const ref = useRef<THREE.Sprite>(null);
  const m = useMemo(glintMat, []);
  useFrame(() => {
    const t = now();
    const s = Math.max(0, Math.sin(t * 1.3 + seed)) ** 8;
    m.opacity = 0.15 + s * 0.6;
    ref.current?.scale.setScalar(0.12 + s * 0.12);
  });
  return <sprite ref={ref} material={m} position={[0, 0.08, 0]} />;
}

const FUSE_COLORS: Record<number, string> = { 5: '#c8b27a', 10: '#a8322a', 15: '#2d5aa8', 20: '#d6b52a', 30: '#3a8a46' };

function Item({ def }: { def: InteractableDef }) {
  const group = useRef<THREE.Group>(null);
  const drawer = useRef<THREE.Mesh>(null);
  const fuses = useRef<(THREE.Mesh | null)[]>([]);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const pos = useRef<Vec3 | null>(def.pos ?? null);

  useFrame(() => {
    const w = runtime.snap?.world;
    if (!w || !group.current) return;
    const p = w.itemPos[def.id] ?? def.pos;
    if (p && (pos.current?.x !== p.x || pos.current?.z !== p.z)) {
      pos.current = p;
      group.current.position.set(p.x, p.y, p.z);
    }
    const taken = def.kind === 'reel' && w.collected.includes(def.id);
    group.current.visible = !taken;
    if (def.kind === 'reel') audio.setLoop(def.id, 'hiss', taken || !p ? null : p);
    if (drawer.current) drawer.current.position.z = w.office.drawer ? 0.3 : 0;
    if (def.kind === 'fuse_box') {
      fuses.current.forEach((f, i) => {
        if (!f) return;
        (f.material as THREE.MeshStandardMaterial).color.set(FUSE_COLORS[w.fuse.slots[i]] ?? '#888');
      });
      if (lamp.current) {
        lamp.current.emissive.set(w.power ? '#29ff6a' : w.fuse.lockoutUntil > (runtime.snap?.time ?? 0) ? '#ff2a1a' : '#331111');
        lamp.current.emissiveIntensity = w.power ? 3 : 2;
      }
    }
    if (def.kind === 'pa_console' && lamp.current) {
      lamp.current.emissive.set(w.decoded ? '#29ff6a' : w.power ? '#ffb020' : '#140a00');
      lamp.current.emissiveIntensity = w.power ? 3 : 0.5;
    }
  });

  const p = def.pos ?? { x: 0, y: -50, z: 0 };
  return (
    <group ref={group} position={[p.x, p.y, p.z]}>
      {def.kind === 'flashlight_kit' && (
        <>
          <mesh position={[0, 0.09, 0]} castShadow>
            <boxGeometry args={[0.42, 0.18, 0.28]} />
            <meshStandardMaterial color="#8d1612" roughness={0.6} metalness={0.3} />
          </mesh>
          <mesh position={[0, 0.181, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.12, 0.04]} />
            <meshBasicMaterial color="#e8e2d0" />
          </mesh>
          <mesh position={[0, 0.181, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
            <planeGeometry args={[0.12, 0.04]} />
            <meshBasicMaterial color="#e8e2d0" />
          </mesh>
          <Glint seed={1} />
        </>
      )}
      {def.kind === 'reel' && (
        <>
          <mesh position={[0, 0.02, 0]} castShadow>
            <cylinderGeometry args={[0.13, 0.13, 0.035, 28]} />
            <meshStandardMaterial color="#6f6658" metalness={0.7} roughness={0.35} />
          </mesh>
          <mesh position={[0, 0.039, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.03, 0.1, 24]} />
            <meshStandardMaterial color="#1a1512" roughness={0.4} />
          </mesh>
          <Glint seed={def.id.charCodeAt(5)} />
        </>
      )}
      {def.kind === 'note' && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0.4]} position={[0, 0.003, 0]}>
            <planeGeometry args={def.id === 'note_photo' ? [0.1, 0.13] : [0.16, 0.22]} />
            <meshStandardMaterial color={def.id === 'note_photo' ? '#9c8f78' : '#d2c7aa'} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <Glint seed={def.id.length} />
        </>
      )}
      {def.kind === 'logbook' && (
        <>
          <mesh position={[0, 0.025, 0]} rotation={[0, 0.3, 0]} castShadow>
            <boxGeometry args={[0.3, 0.05, 0.22]} />
            <meshStandardMaterial color="#3f1e14" roughness={0.8} />
          </mesh>
          <Glint seed={3} />
        </>
      )}
      {def.kind === 'drawer' && (
        <mesh ref={drawer}>
          <boxGeometry args={[0.6, 0.18, 0.05]} />
          <meshStandardMaterial color="#4a2b18" roughness={0.7} />
        </mesh>
      )}
      {def.kind === 'phone' && (
        <group rotation={[0, -0.5, 0]}>
          <mesh position={[0, 0.05, 0]} castShadow>
            <boxGeometry args={[0.2, 0.1, 0.22]} />
            <meshStandardMaterial color="#0d0d0d" roughness={0.25} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0.1, 0.04]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.055, 0.055, 0.01, 20]} />
            <meshStandardMaterial color="#d8d0bb" roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.13, -0.04]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.025, 0.16, 4, 8]} />
            <meshStandardMaterial color="#0d0d0d" roughness={0.25} />
          </mesh>
        </group>
      )}
      {def.kind === 'fuse_box' && (
        <group position={[0, 0, -0.08]}>
          <mesh position={[0.62, 0, 0.32]} rotation={[0, -1.2, 0]}>
            <boxGeometry args={[0.02, 1.1, 0.6]} />
            <meshStandardMaterial color="#5b5f58" metalness={0.5} roughness={0.6} />
          </mesh>
          {[0, 1, 2, 3].map((i) => (
            <mesh key={i} ref={(el) => {
              fuses.current[i] = el;
            }} position={[-0.36 + i * 0.24, -0.05, 0.08]}>
              <boxGeometry args={[0.1, 0.32, 0.08]} />
              <meshStandardMaterial color="#888" roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, 0.42, 0.08]}>
            <sphereGeometry args={[0.03, 10, 8]} />
            <meshStandardMaterial ref={lamp} color="#111" emissive="#331111" />
          </mesh>
        </group>
      )}
      {def.kind === 'pa_console' && (
        <group rotation={[0, -Math.PI / 2, 0]}>
          <mesh position={[0, 0.05, 0]} rotation={[-0.4, 0, 0]}>
            <boxGeometry args={[0.7, 0.08, 0.4]} />
            <meshStandardMaterial color="#353a36" metalness={0.4} roughness={0.6} />
          </mesh>
          {Array.from({ length: 12 }, (_, i) => (
            <mesh key={i} position={[-0.12 + (i % 3) * 0.06, 0.1 + Math.floor(i / 3) * -0.025, -0.05 + Math.floor(i / 3) * 0.055]} rotation={[-0.4, 0, 0]}>
              <boxGeometry args={[0.045, 0.015, 0.04]} />
              <meshStandardMaterial color="#c8c2ae" roughness={0.6} />
            </mesh>
          ))}
          <mesh position={[0.22, 0.12, -0.05]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshStandardMaterial ref={lamp} color="#111" emissive="#140a00" />
          </mesh>
          <mesh position={[0.15, 0.22, -0.12]} rotation={[0.5, 0, 0]}>
            <cylinderGeometry args={[0.03, 0.04, 0.12, 12]} />
            <meshStandardMaterial color="#1c1c1c" metalness={0.6} roughness={0.4} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function EchoEmitters() {
  const active = useRef(new Set<string>());
  useFrame(() => {
    const echoes = runtime.snap?.world.echoes ?? [];
    const keys = new Set<string>();
    for (const e of echoes) {
      const k = `echo:${e.pos.x.toFixed(1)}:${e.pos.z.toFixed(1)}:${e.until.toFixed(0)}`;
      keys.add(k);
      if (!active.current.has(k)) audio.setLoop(k, e.sound === 'phone' ? 'phone' : 'footsteps', e.pos);
    }
    for (const k of active.current) if (!keys.has(k)) audio.setLoop(k, 'footsteps', null);
    active.current = keys;
  });
  return null;
}

export function Interactables({ level, materials }: { level: LevelDef; materials: Record<MaterialId, THREE.Material> }) {
  return (
    <group name="interactables">
      {level.doors.map((d) => (
        <Door key={d.id} def={d} materials={materials} />
      ))}
      <ExitGate level={level} />
      {level.interactables.filter((i) => i.kind !== 'exit_gate').map((i) => (
        <Item key={i.id} def={i} />
      ))}
      <EchoEmitters />
    </group>
  );
}
