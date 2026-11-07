import { RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, DepthOfField, EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { ageCanvas, cachedTextures, signTexture } from '../three/textures';

export type DeckState = 'lab' | 'playing' | 'choice' | 'rewind' | 'call' | 'intro' | 'arrival';

/**
 * Aditi's desk at 1:52 AM: a 1990s two-in-one radio-cassette recorder, the unmarked cassette, a
 * desk lamp, headphones and paperwork. Units are metres; the deck is ~42 cm wide.
 */

const PLASTIC = { color: '#1d1d1c', roughness: 0.42, metalness: 0.08 };

function labelTexture() {
  return signTexture(512, 192, (c, w, h) => {
    c.fillStyle = '#e3dcc6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#b03a2e';
    c.fillRect(0, 0, w, 22);
    c.fillStyle = '#f3efe2';
    c.font = '700 14px Arial';
    c.fillText('C-60   SIDE  A', 14, 16);
    c.strokeStyle = 'rgba(60,70,120,0.35)';
    c.lineWidth = 1;
    for (let y = 46; y < h; y += 22) {
      c.beginPath();
      c.moveTo(10, y);
      c.lineTo(w - 10, y);
      c.stroke();
    }
    c.fillStyle = '#1c2a6a';
    c.font = 'italic 600 34px "Segoe Script", "Comic Sans MS", cursive';
    c.save();
    c.rotate(-0.02);
    c.fillText('SHUNYA  7731', 40, 70);
    c.font = '600 30px "Noto Serif Bengali", "Nirmala UI", serif';
    c.fillText('মা — ১৩.৩.৯৯', 60, 112);
    c.font = 'italic 22px "Segoe Script", "Comic Sans MS", cursive';
    c.fillText('do not play at night', 230, 150);
    c.restore();
    // window cut-out in the label
    c.clearRect(w * 0.22, h * 0.52, w * 0.56, h * 0.34);
    ageCanvas(c, w, h, 0.25);
  });
}

function grilleTexture() {
  return signTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#121212';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#050505';
    for (let y = 6; y < h; y += 10) for (let x = 6 + ((y / 10) % 2) * 5; x < w; x += 10) {
      c.beginPath();
      c.arc(x, y, 3, 0, Math.PI * 2);
      c.fill();
    }
  });
}

function panelTexture() {
  return signTexture(1024, 256, (c, w, h) => {
    c.fillStyle = '#26262a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#b8b2a2';
    c.font = '700 34px "IBM Plex Sans", Arial';
    c.fillText('SURALOK', 40, 52);
    c.font = '18px "IBM Plex Mono", monospace';
    c.fillText('STEREO RADIO CASSETTE RECORDER  ·  2-BAND', 40, 82);
    // tuning scale
    c.fillStyle = '#d9cfae';
    c.fillRect(560, 24, 420, 70);
    c.fillStyle = '#222';
    c.font = '14px "IBM Plex Mono", monospace';
    ['MW 530', '600', '800', '1000', '1400', '1600 KHz'].forEach((t, i) => c.fillText(t, 572 + i * 68, 52));
    ['SW 6', '7', '9', '11', '13', '15 MHz'].forEach((t, i) => c.fillText(t, 572 + i * 68, 82));
    c.fillStyle = '#b02a1e';
    c.fillRect(760, 26, 3, 66);
    // key labels
    c.fillStyle = '#9c968a';
    c.font = '600 16px Arial';
    ['REC', 'PLAY', 'REW', 'F.FWD', 'STOP/EJ', 'PAUSE'].forEach((t, i) => c.fillText(t, 340 + i * 58, 236));
    ageCanvas(c, w, h, 0.2);
  });
}

function Cassette({ state }: { state: React.MutableRefObject<DeckState> }) {
  const root = useRef<THREE.Group>(null);
  const hubs = useRef<(THREE.Group | null)[]>([]);
  const packs = useRef<(THREE.Mesh | null)[]>([]);
  const label = useMemo(labelTexture, []);
  const shell = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#0e0f10', roughness: 0.25, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.3 }), []);
  const windowMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#9aa3a6', roughness: 0.05, transmission: 0.85, transparent: true, opacity: 0.35, thickness: 0.002 }), []);
  const progress = useRef(0);
  const spool = useRef(0.6);
  // resting on the desk, then into the deck's door
  const rest = useMemo(() => ({ p: new THREE.Vector3(-0.1, 0.0062, 0.17), r: new THREE.Euler(-Math.PI / 2, 0, 0.28) }), []);
  const slot = useMemo(() => ({ p: new THREE.Vector3(0.02, 0.116, 0.0365), r: new THREE.Euler(0, 0, 0) }), []);
  useFrame((_, dt) => {
    const st = state.current;
    const inside = st === 'playing' || st === 'choice' || st === 'rewind' || st === 'call';
    progress.current = THREE.MathUtils.clamp(progress.current + (inside ? dt : -dt) * 0.9, 0, 1);
    const k = THREE.MathUtils.smootherstep(progress.current, 0, 1);
    const g = root.current;
    if (g) {
      g.position.lerpVectors(rest.p, slot.p, k);
      g.position.y += Math.sin(k * Math.PI) * 0.09;
      g.quaternion.slerpQuaternions(new THREE.Quaternion().setFromEuler(rest.r), new THREE.Quaternion().setFromEuler(slot.r), k);
    }
    const speed = st === 'playing' ? 2.2 : st === 'rewind' ? -14 : 0;
    spool.current = THREE.MathUtils.clamp(spool.current - speed * dt * 0.004, 0.25, 0.95);
    hubs.current.forEach((h, i) => {
      if (h) h.rotation.z += speed * dt * (i === 0 ? 1 : 1.3);
    });
    packs.current.forEach((p, i) => {
      if (!p) return;
      const r = i === 0 ? spool.current : 1.2 - spool.current;
      p.scale.set(r, r, 1);
    });
  });
  return (
    <group ref={root}>
      <RoundedBox args={[0.1, 0.0635, 0.012]} radius={0.002} smoothness={3} material={shell} castShadow />
      <mesh position={[0, 0.006, 0.0062]}>
        <planeGeometry args={[0.088, 0.034]} />
        <meshStandardMaterial map={label} transparent alphaTest={0.4} roughness={0.85} />
      </mesh>
      {/* tape packs and hubs seen through the window */}
      {[-0.021, 0.021].map((x, i) => (
        <group key={x} position={[x, 0.0035, 0.0058]}>
          <mesh ref={(el) => {
            packs.current[i] = el;
          }}>
            <circleGeometry args={[0.019, 40]} />
            <meshStandardMaterial color="#3a2516" roughness={0.35} metalness={0.2} />
          </mesh>
          <group ref={(el) => {
            hubs.current[i] = el;
          }} position={[0, 0, 0.0002]}>
            <mesh>
              <ringGeometry args={[0.0035, 0.0068, 24]} />
              <meshStandardMaterial color="#e9e6dc" roughness={0.5} />
            </mesh>
            {[0, 1, 2, 3, 4, 5].map((k) => (
              <mesh key={k} rotation={[0, 0, (k * Math.PI) / 3]} position={[Math.cos((k * Math.PI) / 3) * 0.003, Math.sin((k * Math.PI) / 3) * 0.003, 0]}>
                <boxGeometry args={[0.0012, 0.0012, 0.0005]} />
                <meshStandardMaterial color="#e9e6dc" />
              </mesh>
            ))}
          </group>
        </group>
      ))}
      <mesh position={[0, 0.0035, 0.0063]} material={windowMat}>
        <planeGeometry args={[0.05, 0.0115]} />
      </mesh>
      {/* tape exposed at the bottom edge, screws */}
      <mesh position={[0, -0.029, 0.0035]}>
        <boxGeometry args={[0.05, 0.0018, 0.0042]} />
        <meshStandardMaterial color="#2b1c12" roughness={0.3} metalness={0.3} />
      </mesh>
      {[[-0.045, 0.026], [0.045, 0.026], [-0.045, -0.026], [0.045, -0.026], [0, -0.022]].map(([x, y], i) => (
        <mesh key={i} position={[x, y, 0.0061]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.0016, 0.0016, 0.0005, 10]} />
          <meshStandardMaterial color="#8d8a84" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Deck({ state }: { state: React.MutableRefObject<DeckState> }) {
  const grille = useMemo(grilleTexture, []);
  const panel = useMemo(panelTexture, []);
  const keys = useRef<(THREE.Mesh | null)[]>([]);
  const needles = useRef<(THREE.Mesh | null)[]>([]);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const door = useRef<THREE.Group>(null);
  const lvl = useRef(0);
  useFrame((_, dt) => {
    const st = state.current;
    const playing = st === 'playing';
    const rewinding = st === 'rewind';
    keys.current.forEach((k, i) => {
      if (!k) return;
      const down = (i === 1 && playing) || (i === 2 && rewinding);
      k.position.y = THREE.MathUtils.lerp(k.position.y, down ? 0.214 : 0.222, Math.min(1, dt * 18));
    });
    lvl.current = THREE.MathUtils.lerp(lvl.current, playing || rewinding ? Math.min(1, audio.level() * 3.5) : 0, Math.min(1, dt * 12));
    needles.current.forEach((n, i) => {
      if (n) n.rotation.z = 0.75 - lvl.current * 1.5 * (i ? 0.92 : 1) - (Math.random() - 0.5) * lvl.current * 0.08;
    });
    if (led.current) led.current.emissiveIntensity = playing || rewinding ? 4 : 1.2;
    if (door.current) {
      const open = st === 'lab' || st === 'intro';
      door.current.rotation.x = THREE.MathUtils.lerp(door.current.rotation.x, open ? -0.45 : 0, Math.min(1, dt * 4));
    }
  });
  return (
    <group position={[0.02, 0, -0.02]}>
      <RoundedBox args={[0.42, 0.21, 0.1]} radius={0.012} smoothness={4} position={[0, 0.105, 0]} castShadow receiveShadow>
        <meshStandardMaterial {...PLASTIC} />
      </RoundedBox>
      {/* silver trim band */}
      <mesh position={[0, 0.193, 0.0505]}>
        <planeGeometry args={[0.4, 0.008]} />
        <meshStandardMaterial color="#a5a39d" metalness={0.95} roughness={0.25} />
      </mesh>
      {/* speakers */}
      {[-0.135, 0.135].map((x) => (
        <group key={x} position={[x, 0.1, 0.0505]}>
          <mesh>
            <circleGeometry args={[0.06, 40]} />
            <meshStandardMaterial map={grille} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, 0.0005]}>
            <ringGeometry args={[0.06, 0.066, 40]} />
            <meshStandardMaterial color="#8c8a85" metalness={0.9} roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* panel print and tuning scale */}
      <mesh position={[0, 0.168, 0.0506]}>
        <planeGeometry args={[0.2, 0.05]} />
        <meshStandardMaterial map={panel} roughness={0.6} />
      </mesh>
      {/* cassette door with smoked window */}
      {/* recessed cassette well behind a lightly smoked door */}
      <mesh position={[0, 0.118, 0.0505]}>
        <planeGeometry args={[0.13, 0.085]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.9} />
      </mesh>
      <group ref={door} position={[0, 0.0755, 0.0625]}>
        <mesh position={[0, 0.0425, 0]}>
          <boxGeometry args={[0.13, 0.085, 0.002]} />
          <meshStandardMaterial color="#3d4044" roughness={0.05} metalness={0.2} transparent opacity={0.22} depthWrite={false} />
        </mesh>
      </group>
      {/* VU meters */}
      {[-0.03, 0.03].map((x, i) => (
        <group key={x} position={[x, 0.024, 0.0508]}>
          <mesh>
            <planeGeometry args={[0.045, 0.022]} />
            <meshStandardMaterial color="#d8c99b" emissive="#ffb347" emissiveIntensity={0.35} roughness={0.6} />
          </mesh>
          <mesh ref={(el) => {
            needles.current[i] = el;
          }} position={[0, -0.009, 0.0004]} rotation={[0, 0, 0.75]}>
            <boxGeometry args={[0.0014, 0.034, 0.0004]} />
            <meshStandardMaterial color="#0a0a0a" />
          </mesh>
        </group>
      ))}
      {/* piano keys */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <mesh key={i} ref={(el) => {
          keys.current[i] = el;
        }} position={[-0.075 + i * 0.03, 0.222, 0.022]}>
          <boxGeometry args={[0.026, 0.014, 0.05]} />
          <meshStandardMaterial color={i === 0 ? '#7a1c14' : '#bdb9ae'} roughness={0.45} metalness={i === 0 ? 0 : 0.3} />
        </mesh>
      ))}
      {/* carry handle, antenna, power LED, dials */}
      <mesh position={[0, 0.228, -0.02]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.13, 0.008, 8, 32, Math.PI]} />
        <meshStandardMaterial color="#8f8c86" metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position={[0.19, 0.38, -0.03]} rotation={[0, 0, -0.25]}>
        <cylinderGeometry args={[0.0025, 0.004, 0.36, 8]} />
        <meshStandardMaterial color="#c9c6bf" metalness={1} roughness={0.15} />
      </mesh>
      <mesh position={[0.09, 0.03, 0.0515]}>
        <sphereGeometry args={[0.003, 10, 8]} />
        <meshStandardMaterial ref={led} color="#300" emissive="#ff2a10" emissiveIntensity={1.2} />
      </mesh>
      {[0.155, 0.185].map((x) => (
        <mesh key={x} position={[x, 0.178, 0.052]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.009, 0.009, 0.008, 20]} />
          <meshStandardMaterial color="#9b978f" metalness={0.9} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function DeskProps() {
  const lib = cachedTextures();
  const wood = useMemo(() => {
    const m = lib?.wood?.map?.clone();
    if (m) {
      m.repeat.set(1.2, 1.2);
      m.needsUpdate = true;
    }
    return new THREE.MeshStandardMaterial({ map: m, color: '#6b4a32', roughness: 0.55 });
  }, [lib]);
  const paper = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: signTexture(256, 340, (c, w, h) => {
          c.fillStyle = '#d8d1bd';
          c.fillRect(0, 0, w, h);
          c.fillStyle = '#2b2b33';
          c.font = '700 15px "IBM Plex Mono", monospace';
          c.fillText('SPECTROGRAM — REEL 7731', 14, 26);
          for (let x = 14; x < w - 14; x += 2) {
            const a = 30 + Math.abs(Math.sin(x * 0.09) * Math.sin(x * 0.013)) * 70;
            c.fillStyle = `rgba(40,40,60,${0.2 + Math.random() * 0.5})`;
            c.fillRect(x, 140 - a / 2, 2, a);
          }
          c.font = '13px "IBM Plex Mono", monospace';
          c.fillText('03:13:00  voice A (female) — match 98%', 14, 220);
          c.fillText('03:13:04  voice B — NO MATCH', 14, 240);
          c.fillText('03:13:04  voice B — NO MATCH', 14, 260);
          ageCanvas(c, w, h, 0.25);
        }),
        roughness: 0.95,
      }),
    [],
  );
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={wood}>
        <planeGeometry args={[2.4, 1.4]} />
      </mesh>
      <mesh position={[0.36, 0.0008, 0.18]} rotation={[-Math.PI / 2, 0, -0.18]} material={paper} receiveShadow>
        <planeGeometry args={[0.21, 0.28]} />
      </mesh>
      {/* headphones */}
      <group position={[-0.42, 0.03, -0.05]} rotation={[0, 0.6, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.085, 0.008, 8, 24, Math.PI]} />
          <meshStandardMaterial color="#151515" roughness={0.5} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.085, -0.01, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
            <cylinderGeometry args={[0.035, 0.035, 0.025, 24]} />
            <meshStandardMaterial color="#1c1c1c" roughness={0.6} />
          </mesh>
        ))}
      </group>
      {/* steel tumbler of cold chai */}
      <mesh position={[0.3, 0.045, -0.12]} castShadow>
        <cylinderGeometry args={[0.032, 0.026, 0.09, 24]} />
        <meshStandardMaterial color="#b9b6ae" metalness={1} roughness={0.22} />
      </mesh>
      {/* stack of tape boxes */}
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0.48, 0.008 + i * 0.016, -0.18]} rotation={[0, 0.2 + i * 0.08, 0]} castShadow>
          <boxGeometry args={[0.11, 0.016, 0.07]} />
          <meshStandardMaterial color={['#20222a', '#2b201c', '#1b2621', '#2a2a2a'][i]} roughness={0.3} />
        </mesh>
      ))}
      {/* desk lamp */}
      <group position={[-0.5, 0, -0.3]}>
        <mesh position={[0, 0.01, 0]}>
          <cylinderGeometry args={[0.07, 0.08, 0.02, 24]} />
          <meshStandardMaterial color="#1a1a1a" metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0.05, 0.2, 0.05]} rotation={[0.3, 0, -0.35]}>
          <cylinderGeometry args={[0.007, 0.007, 0.4, 8]} />
          <meshStandardMaterial color="#222" metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0.18, 0.38, 0.14]} rotation={[0.9, 0, -0.9]}>
          <coneGeometry args={[0.07, 0.12, 24, 1, true]} />
          <meshStandardMaterial color="#2b4a3a" side={THREE.DoubleSide} metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0.2, 0.355, 0.16]}>
          <sphereGeometry args={[0.022, 12, 10]} />
          <meshStandardMaterial color="#fff" emissive="#ffcf8a" emissiveIntensity={6} />
        </mesh>
      </group>
      {/* back wall: shelves of tapes, a window with moonlight through the blinds */}
      <mesh position={[0, 0.6, -0.75]}>
        <planeGeometry args={[3, 1.6]} />
        <meshStandardMaterial color="#1a1c1b" roughness={0.95} />
      </mesh>
      {Array.from({ length: 34 }, (_, i) => (
        <mesh key={i} position={[-0.95 + (i % 17) * 0.06, 0.55 + Math.floor(i / 17) * 0.26, -0.7]}>
          <boxGeometry args={[0.04, 0.17 + (i % 3) * 0.02, 0.1]} />
          <meshStandardMaterial color={['#2a211b', '#1c2126', '#3a2c20', '#20201c'][i % 4]} roughness={0.7} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={`b${i}`} position={[0.62, 0.45 + i * 0.07, -0.74]}>
          <planeGeometry args={[0.6, 0.03]} />
          <meshBasicMaterial color="#5d8c96" toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

function Rig({ state }: { state: React.MutableRefObject<DeckState> }) {
  const camera = useThree((s) => s.camera);
  const focus = useMemo(() => new THREE.Vector3(-0.02, 0.07, 0.06), []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const st = state.current;
    const close = st === 'playing' || st === 'rewind' || st === 'choice' || st === 'call';
    const target = close ? new THREE.Vector3(0.06, 0.3, 0.66) : new THREE.Vector3(-0.05, 0.46, 0.92);
    camera.position.lerp(target, 0.01);
    camera.position.x += Math.sin(t * 0.4) * 0.0004;
    camera.position.y += Math.sin(t * 0.53) * 0.0003;
    camera.lookAt(focus.x + Math.sin(t * 0.2) * 0.01, focus.y, focus.z);
  });
  return null;
}

export function CassetteScene({ state }: { state: DeckState }) {
  const ref = useRef<DeckState>(state);
  ref.current = state;
  return (
    <Canvas className="cassette-canvas" shadows dpr={[1, 1.5]} camera={{ fov: 32, near: 0.01, far: 10, position: [-0.05, 0.46, 0.92] }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.9 }}>
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050606', 1.2, 2.8]} />
      <ambientLight intensity={0.04} />
      <spotLight position={[-0.3, 0.5, -0.14]} angle={0.75} penumbra={0.7} intensity={2.6} distance={2} decay={2} color="#ffcf8a" castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0004} target-position={[0, 0, 0.05]} />
      <directionalLight position={[1, 0.8, -0.6]} intensity={0.25} color="#6f9aa6" />
      <pointLight position={[0.2, 0.15, 0.4]} intensity={0.08} color="#ffb070" />
      <Deck state={ref} />
      <Cassette state={ref} />
      <DeskProps />
      <Rig state={ref} />
      <EffectComposer multisampling={0}>
        <DepthOfField focusDistance={0.0} focalLength={0.04} bokehScale={3.2} target={[0, 0.1, 0.04]} />
        <Bloom intensity={0.6} luminanceThreshold={0.7} mipmapBlur />
        <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.35} />
        <Vignette offset={0.2} darkness={0.85} />
      </EffectComposer>
    </Canvas>
  );
}
