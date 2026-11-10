import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody, interactionGroups, type RapierRigidBody } from '@react-three/rapier';
import type { DoorDef, InteractableDef, LevelDef, MaterialId, Vec3 } from '@nishi/shared';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { inCutscene } from '../game/cutscene';
import { fx, now } from '../game/fx';
import { runtime } from '../game/runtime';
import { coneMaterial, shaftTime } from './Lights';

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

/** 0 = shut, 1 = fully open; the motor takes 6 s once the gate is released */
export function exitProgress() {
  const snap = runtime.snap;
  const w = snap?.world;
  if (w?.exitOpen) return 1;
  if (!w?.exitOpenAt) return 0;
  return Math.max(0, Math.min(1, 1 - (w.exitOpenAt - (snap?.time ?? 0)) / 6));
}

/** soft elongated pool of light, for the headlights on the corridor floor */
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 0, 0, 32, 0, 256);
  grad.addColorStop(0, 'rgba(255,236,200,1)');
  grad.addColorStop(0.5, 'rgba(255,220,170,0.35)');
  grad.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

/**
 * The way out: a pair of riveted steel doors in a heavy frame. Once the gate is released the motor
 * judders them open, swinging out into the exit corridor, and Kabir's headlights pour in through the
 * mist. The collider stays until they are fully open.
 */
function ExitGate({ level, materials }: { level: LevelDef; materials: Record<MaterialId, THREE.Material> }) {
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const outside = useRef<THREE.Group>(null);
  const [solid, setSolid] = useState(true);
  const gb = level.exitGate;
  const x0 = gb.c[0] - gb.s[0] / 2;
  const x1 = gb.c[0] + gb.s[0] / 2;
  const z = gb.c[2];
  const leafW = gb.s[0] / 2 - 0.02;
  const leafH = gb.s[1] - 0.06;
  const m = useMemo(() => {
    const beam = coneMaterial();
    (beam.uniforms.uColor.value as THREE.Color).set('#ffe2b8');
    beam.uniforms.uSoft.value = 1;
    return {
      steel: new THREE.MeshStandardMaterial({ color: '#4b4f4c', metalness: 0.7, roughness: 0.48 }),
      frame: new THREE.MeshStandardMaterial({ color: '#2b2d2b', metalness: 0.6, roughness: 0.55 }),
      // wired glass: the headlights outside already glow faintly through it while the doors are shut
      glass: new THREE.MeshStandardMaterial({ color: '#141a1d', emissive: new THREE.Color('#d9a56a'), emissiveIntensity: 0.06, roughness: 0.2, metalness: 0.3 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#220806', emissive: new THREE.Color('#ff2a12'), emissiveIntensity: 2.4 }),
      beam,
      flare: new THREE.SpriteMaterial({ map: glintMat().map, color: '#fff1d8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
      car: new THREE.MeshStandardMaterial({ color: '#15171a', metalness: 0.6, roughness: 0.35 }),
      pool: new THREE.MeshBasicMaterial({ map: poolTexture(), color: '#ffdcae', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
    };
  }, []);
  useFrame(() => {
    const p = exitProgress();
    const t = now();
    const moving = p > 0 && p < 1;
    // the motor hesitates, catches, then drives them steadily: eased with a little judder while running
    const ease = p < 0.08 ? p * 0.6 : 0.048 + (1 - (1 - (p - 0.08) / 0.92) ** 2) * 0.952;
    const a = ease * 1.5 + (moving ? Math.sin(t * 29) * 0.006 : 0);
    if (left.current) left.current.rotation.y = a;
    if (right.current) right.current.rotation.y = -a;
    // red while locked, a slow amber pulse while the motor runs, green once it's open
    m.lamp.emissive.set(p >= 1 ? '#39ff6a' : moving ? '#ffae1a' : '#ff2a12');
    m.lamp.emissiveIntensity = moving ? 1.6 + Math.sin(t * 4) * 1.0 : 2.4;
    const light = THREE.MathUtils.smoothstep(p, 0.02, 0.5);
    m.glass.emissiveIntensity = 0.06 + light * 0.3;
    m.beam.uniforms.uOpacity.value = light * 0.38;
    shaftTime.value = t;
    m.pool.opacity = light * 0.4;
    m.flare.opacity = 0.35 + light * 0.65;
    if (outside.current) outside.current.visible = p > 0;
    const shouldBeSolid = !runtime.snap?.world.exitOpen;
    if (shouldBeSolid !== solid) setSolid(shouldBeSolid);
  });
  const leaf = (side: 1 | -1) => (
    // built along +x from its hinge; the right leaf is mirrored
    <group scale={[side, 1, 1]}>
      <mesh position={[leafW / 2, leafH / 2 + 0.03, 0]} material={materials.rust} castShadow>
        <boxGeometry args={[leafW, leafH, 0.07]} />
      </mesh>
      {/* stiles, rails and the window frame stand proud of the sheet */}
      {[0.06, leafW - 0.06].map((x) => (
        <mesh key={x} position={[x, leafH / 2 + 0.03, 0.045]} material={m.steel}>
          <boxGeometry args={[0.1, leafH, 0.03]} />
        </mesh>
      ))}
      {[0.12, 1.15, 1.75, leafH - 0.06].map((y) => (
        <mesh key={y} position={[leafW / 2, y, 0.045]} material={m.steel}>
          <boxGeometry args={[leafW - 0.1, 0.08, 0.03]} />
        </mesh>
      ))}
      <mesh position={[leafW / 2, 2.35, 0.04]} material={m.glass}>
        <boxGeometry args={[0.52, 0.5, 0.02]} />
      </mesh>
      {/* wire in the glass */}
      {[-0.13, 0, 0.13].map((d) => (
        <mesh key={d} position={[leafW / 2 + d, 2.35, 0.052]} material={m.frame}>
          <boxGeometry args={[0.012, 0.5, 0.005]} />
        </mesh>
      ))}
      {/* push bar */}
      <mesh position={[leafW * 0.55, 1.0, 0.11]} rotation={[0, 0, Math.PI / 2]} material={m.frame}>
        <cylinderGeometry args={[0.025, 0.025, leafW * 0.75, 8]} />
      </mesh>
    </group>
  );
  return (
    <group>
      {solid && (
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[gb.s[0] / 2, gb.s[1] / 2, gb.s[2] / 2]} position={gb.c} />
        </RigidBody>
      )}
      {/* nobody crawls out under the jammed street shutter: the escape zone ends the run before it */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[2.3, 0.75, 0.15]} position={[gb.c[0], 0.75, -22.15]} />
      </RigidBody>
      <group ref={left} position={[x0, 0, z]}>
        {leaf(1)}
      </group>
      <group ref={right} position={[x1, 0, z]}>
        {leaf(-1)}
      </group>
      {/* the frame: posts, a deep lintel and the status lamp */}
      {[x0 - 0.06, x1 + 0.06].map((x) => (
        <mesh key={x} position={[x, gb.s[1] / 2, z + 0.12]} material={m.frame}>
          <boxGeometry args={[0.14, gb.s[1], 0.36]} />
        </mesh>
      ))}
      <mesh position={[gb.c[0], gb.s[1] + 0.09, z + 0.12]} material={m.frame}>
        <boxGeometry args={[gb.s[0] + 0.26, 0.18, 0.36]} />
      </mesh>
      <mesh position={[x1 + 0.06, gb.s[1] + 0.3, z + 0.32]} material={m.lamp}>
        <sphereGeometry args={[0.07, 12, 8]} />
      </mesh>
      {/* gate motor box */}
      <mesh position={[x1 + 0.5, 2.6, z + 0.25]}>
        <boxGeometry args={[0.5, 0.6, 0.3]} />
        <meshStandardMaterial color="#4a4d47" metalness={0.5} roughness={0.6} />
      </mesh>
      {/* outside: Kabir's car at the end of the corridor, headlights on full */}
      <group ref={outside} visible={false} userData={{ warm: true }}>
        {/* the old Ambassador, nose-in to the gate, and the wet road under it */}
        <mesh material={m.car} position={[gb.c[0], 0.62, -24.8]}>
          <boxGeometry args={[1.8, 0.7, 4.2]} />
        </mesh>
        <mesh material={m.car} position={[gb.c[0], 1.22, -25.3]}>
          <boxGeometry args={[1.55, 0.55, 2.0]} />
        </mesh>
        <mesh material={m.car} position={[gb.c[0], 0.01, -26]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[12, 8]} />
        </mesh>
        {/* a sodium streetlight across the road, so the car reads as a silhouette */}
        <mesh position={[gb.c[0], 2, -29.5]}>
          <planeGeometry args={[14, 6]} />
          <meshBasicMaterial color="#5a3a1a" />
        </mesh>
        {[-0.62, 0.62].map((dx) => (
          <group key={dx} position={[gb.c[0] + dx, 0.72, -22.66]}>
            <sprite material={m.flare} scale={[1.9, 1.9, 1]} />
            <mesh material={m.beam} rotation={[-Math.PI / 2 - 0.03, 0, 0]} position={[0, 0, 5]}>
              <coneGeometry args={[1.9, 10, 24, 1, true]} />
            </mesh>
          </group>
        ))}
        <mesh material={m.pool} rotation={[-Math.PI / 2, 0, 0]} position={[gb.c[0], 0.02, -17]}>
          <planeGeometry args={[3.6, 9.5]} />
        </mesh>
      </group>
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
    // a steady warm glow you can spot across a dark room, plus a slow catch-light pulse
    const s = Math.max(0, Math.sin(t * 1.6 + seed)) ** 6;
    // (a scene shows the thing itself, not the game's marker on it)
    m.opacity = inCutscene() ? 0 : 0.4 + s * 0.55;
    ref.current?.scale.setScalar(0.2 + s * 0.16);
  });
  return <sprite ref={ref} material={m} position={[0, 0.08, 0]} />;
}

/** Ma's note, folded open in the drawer: her handwriting, read close in the office scene */
let noteTex: THREE.CanvasTexture | null = null;
function maNote() {
  if (noteTex) return noteTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const x = c.getContext('2d')!;
  x.fillStyle = '#d9cfb4';
  x.fillRect(0, 0, 256, 320);
  // a crease, foxing, faint ruled lines
  x.fillStyle = 'rgba(90,70,40,0.12)';
  x.fillRect(0, 158, 256, 3);
  for (let i = 0; i < 26; i++) {
    x.beginPath();
    x.arc((i * 97) % 256, (i * 61) % 320, 3 + (i % 5) * 3, 0, 7);
    x.fill();
  }
  x.strokeStyle = 'rgba(70,90,130,0.18)';
  for (let y = 54; y < 310; y += 26) x.strokeRect(14, y, 228, 0.5);
  x.fillStyle = '#1d2236';
  x.font = 'italic 22px "Segoe Script", "Bradley Hand", cursive';
  ['Aditi,', 'Three reels.', 'Three numbers.', 'Do not let it', 'call a third', 'time.', '', '        - Ma'].forEach((l, i) => x.fillText(l, 20 + (i % 2) * 4, 46 + i * 26));
  noteTex = new THREE.CanvasTexture(c);
  noteTex.colorSpace = THREE.SRGBColorSpace;
  noteTex.anisotropy = 4;
  return noteTex;
}

const FUSE_COLORS: Record<number, string> = { 5: '#c8b27a', 10: '#a8322a', 15: '#2d5aa8', 20: '#d6b52a', 30: '#3a8a46' };

function Item({ def }: { def: InteractableDef }) {
  const group = useRef<THREE.Group>(null);
  const drawer = useRef<THREE.Group>(null);
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
    group.current.visible = !taken || (fx.sceneReel === def.id && inCutscene());
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
        // the face, and behind it the tray (inside the desk until it slides out) with Ma's note in it
        <group ref={drawer}>
          <mesh>
            <boxGeometry args={[0.6, 0.18, 0.05]} />
            <meshStandardMaterial color="#4a2b18" roughness={0.7} />
          </mesh>
          <mesh position={[0, 0.03, 0.03]}>
            <boxGeometry args={[0.12, 0.025, 0.02]} />
            <meshStandardMaterial color="#8a7a5a" roughness={0.4} metalness={0.6} />
          </mesh>
          <mesh position={[0, -0.075, -0.22]}>
            <boxGeometry args={[0.54, 0.015, 0.4]} />
            <meshStandardMaterial color="#3a2214" roughness={0.85} />
          </mesh>
          {[-0.265, 0.265].map((sx) => (
            <mesh key={sx} position={[sx, -0.025, -0.22]}>
              <boxGeometry args={[0.012, 0.1, 0.4]} />
              <meshStandardMaterial color="#3a2214" roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[0.02, -0.066, -0.2]} rotation={[-Math.PI / 2, 0, 0.12]}>
            <planeGeometry args={[0.16, 0.2]} />
            <meshStandardMaterial map={maNote()} roughness={0.9} />
          </mesh>
        </group>
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
      <ExitGate level={level} materials={materials} />
      {level.interactables.filter((i) => i.kind !== 'exit_gate').map((i) => (
        <Item key={i.id} def={i} />
      ))}
      <EchoEmitters />
    </group>
  );
}
