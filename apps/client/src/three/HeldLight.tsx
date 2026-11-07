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

const beamMat = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uI: { value: 0 } },
    vertexShader: `varying float vH; varying float vEdge;
      void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vec3 n = normalize(normalMatrix * normal); vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; varying float vH; varying float vEdge;
      void main(){ float a = pow(vH, 1.6) * (0.35 + 0.65 * pow(vEdge, 2.0)) * 0.05 * uI; gl_FragColor = vec4(vec3(1.0, 0.95, 0.84) * a, a); }`,
  });

/**
 * First-person hand holding Aditi's phone torch or the station's metal flashlight.
 * Follows the camera with a little lag and sway so it feels hand-held, and draws its beam in the mist.
 */
export function HeldLight({ state, skin }: { state: React.MutableRefObject<HeldState>; skin: string }) {
  const camera = useThree((s) => s.camera);
  const root = useRef<THREE.Group>(null);
  const phone = useRef<THREE.Group>(null);
  const torch = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const lens = useRef<THREE.MeshStandardMaterial>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const bm = useMemo(beamMat, []);
  const lag = useRef(new THREE.Quaternion());
  const t = useRef(0);
  const offset = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, dt) => {
    const s = state.current;
    const g = root.current;
    if (!g) return;
    g.visible = !s.hidden;
    t.current += dt * (s.sprinting ? 11 : s.moving ? 7 : 1.4);
    const shake = app().settings.reducedShake ? 0.3 : 1;
    const bobX = Math.sin(t.current) * (s.moving ? 0.012 : 0.003) * shake;
    const bobY = Math.abs(Math.cos(t.current)) * (s.moving ? 0.014 : 0.003) * shake;
    lag.current.slerp(camera.quaternion, Math.min(1, dt * 14));
    g.quaternion.copy(lag.current);
    offset.set(0.27 + bobX, -0.3 - bobY - (s.sprinting ? 0.05 : 0), -0.5).applyQuaternion(camera.quaternion);
    g.position.copy(camera.position).add(offset);
    if (phone.current) phone.current.visible = !s.strong;
    if (torch.current) torch.current.visible = s.strong;
    const k = s.on ? s.intensity : 0;
    if (lens.current) lens.current.emissiveIntensity = k * 9;
    if (led.current) led.current.emissiveIntensity = k * 14;
    bm.uniforms.uI.value = k * (s.strong ? 1 : 0.5);
    if (beam.current) beam.current.scale.set(s.strong ? 1 : 1.8, s.strong ? 1 : 0.55, s.strong ? 1 : 1.8);
  });

  return (
    <group ref={root} scale={0.85}>
      {/* hand */}
      <mesh position={[0.005, -0.03, 0.06]} rotation={[0.2, 0, 0.15]} scale={[0.85, 0.75, 1.15]}>
        <sphereGeometry args={[0.055, 16, 12]} />
        <meshStandardMaterial color={skin} roughness={0.65} />
      </mesh>
      <mesh position={[0.0, -0.05, 0.16]} rotation={[1.35, 0, 0.1]}>
        <capsuleGeometry args={[0.032, 0.12, 4, 10]} />
        <meshStandardMaterial color="#1a1c1f" roughness={0.9} />
      </mesh>
      {/* phone */}
      <group ref={phone} rotation={[-Math.PI / 2 + 0.15, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.072, 0.012, 0.15]} />
          <meshStandardMaterial color="#111316" roughness={0.3} metalness={0.4} />
        </mesh>
        <mesh position={[-0.02, 0.0065, -0.055]}>
          <boxGeometry args={[0.022, 0.003, 0.03]} />
          <meshStandardMaterial color="#050505" roughness={0.1} metalness={0.8} />
        </mesh>
        <mesh position={[-0.02, 0.0075, -0.062]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.005, 12]} />
          <meshStandardMaterial ref={led} color="#fff" emissive="#fff6e8" emissiveIntensity={0} />
        </mesh>
      </group>
      {/* metal flashlight */}
      <group ref={torch} rotation={[Math.PI / 2, 0, 0]}>
        <mesh position={[0, 0.04, 0]}>
          <cylinderGeometry args={[0.019, 0.019, 0.2, 18]} />
          <meshStandardMaterial color="#1b1c1e" metalness={0.75} roughness={0.38} />
        </mesh>
        {[0.0, 0.03, 0.06, 0.09].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[0.0195, 0.0025, 6, 18]} />
            <meshStandardMaterial color="#0c0c0c" roughness={0.9} />
          </mesh>
        ))}
        <mesh position={[0, -0.09, 0]}>
          <cylinderGeometry args={[0.032, 0.021, 0.07, 20]} />
          <meshStandardMaterial color="#26282b" metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0, -0.126, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.029, 20]} />
          <meshStandardMaterial ref={lens} color="#e8e4d8" emissive="#fff3dc" emissiveIntensity={0} roughness={0.1} />
        </mesh>
      </group>
      {/* visible beam */}
      <mesh ref={beam} material={bm} position={[0, 0, -4.1]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[1.5, 8, 24, 1, true]} />
      </mesh>
    </group>
  );
}
