import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { app } from '../state/store';

export interface HeldState {
  on: boolean;
  strong: boolean;
  intensity: number;
  moving: boolean;
  sprinting: boolean;
  hidden: boolean;
}

/** the phone's lock screen: 03:13, no signal, the torch toggle lit when the light is on */
function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (on: boolean) => {
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0d1a1f');
    grad.addColorStop(1, '#05080a');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 256);
    g.fillStyle = 'rgba(210,225,228,0.85)';
    g.font = '600 9px sans-serif';
    g.fillText('No service', 8, 13);
    g.fillRect(104, 6, 14, 7);
    g.fillStyle = '#9b2a22';
    g.fillRect(105, 7, 3, 5);
    g.fillStyle = 'rgba(220,232,235,0.92)';
    g.font = '300 34px sans-serif';
    g.textAlign = 'center';
    g.fillText('03:13', 64, 58);
    g.font = '9px sans-serif';
    g.fillStyle = 'rgba(200,215,218,0.6)';
    g.fillText('3 missed calls · Unknown', 64, 74);
    // torch toggle
    g.beginPath();
    g.arc(30, 226, 13, 0, Math.PI * 2);
    g.fillStyle = on ? 'rgba(235,240,240,0.95)' : 'rgba(255,255,255,0.12)';
    g.fill();
    g.fillStyle = on ? '#111' : 'rgba(230,235,235,0.8)';
    g.fillRect(27, 218, 6, 12);
    g.fillRect(25, 215, 10, 4);
    tex.needsUpdate = true;
  };
  draw(false);
  return { tex, draw };
}

/**
 * Aditi's phone, held low at the bottom-right of the view: only its top edge and a sliver of the dim
 * lock screen show. It sways with a soft lag so the torch light feels hand-held.
 */
export function HeldLight({ state }: { state: React.MutableRefObject<HeldState> }) {
  const camera = useThree((s) => s.camera);
  const root = useRef<THREE.Group>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const screen = useMemo(screenTexture, []);
  const lastOn = useRef(false);
  const lag = useRef(new THREE.Quaternion());
  const t = useRef(0);
  const sway = useRef(new THREE.Vector2());
  const offset = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = state.current;
    const g = root.current;
    if (!g) return;
    g.visible = !s.hidden;
    t.current += dt * (s.sprinting ? 9 : s.moving ? 6 : 1.2);
    const shake = app().settings.reducedShake ? 0.3 : 1;
    const tx = Math.sin(t.current) * (s.moving ? 0.008 : 0.002) * shake;
    const ty = Math.abs(Math.cos(t.current)) * (s.moving ? 0.01 : 0.002) * shake + (s.sprinting ? 0.03 : 0);
    sway.current.x = THREE.MathUtils.damp(sway.current.x, tx, 10, dt);
    sway.current.y = THREE.MathUtils.damp(sway.current.y, ty, 10, dt);
    lag.current.slerp(camera.quaternion, 1 - Math.exp(-12 * dt));
    g.quaternion.copy(lag.current);
    offset.set(0.2 + sway.current.x, -0.335 - sway.current.y, -0.42).applyQuaternion(camera.quaternion);
    g.position.copy(camera.position).add(offset);
    if (led.current) led.current.emissiveIntensity = s.on ? 4 * s.intensity : 0;
    if (s.on !== lastOn.current) {
      lastOn.current = s.on;
      screen.draw(s.on);
    }
  });

  return (
    <group ref={root}>
      {/* tipped back a little, top edge towards the station */}
      <group rotation={[-0.42, -0.12, 0.05]}>
        <mesh>
          <boxGeometry args={[0.072, 0.15, 0.0085]} />
          <meshStandardMaterial color="#15171a" roughness={0.35} metalness={0.55} />
        </mesh>
        <mesh position={[0, 0, 0.0044]}>
          <planeGeometry args={[0.066, 0.143]} />
          <meshStandardMaterial map={screen.tex} emissiveMap={screen.tex} emissive="#ffffff" emissiveIntensity={0.22} roughness={0.15} metalness={0.1} />
        </mesh>
        {/* rear torch LED, visible as a glow on the top edge */}
        <mesh position={[-0.024, 0.066, -0.0046]} rotation={[0, Math.PI, 0]}>
          <circleGeometry args={[0.004, 10]} />
          <meshStandardMaterial ref={led} color="#ffffff" emissive="#fff6e8" emissiveIntensity={0} />
        </mesh>
      </group>
    </group>
  );
}
