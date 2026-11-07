import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fx, now } from '../game/fx';
import { runtime } from '../game/runtime';
import { ageCanvas, cachedTextures } from './textures';

/**
 * A parked Kolkata suburban EMU rake on track 1: three coaches of maroon-and-cream steel, barred
 * windows, open doorways, bogies, roof ventilators and a raised pantograph on the overhead wire.
 * The first coach is enterable (its collision shell lives in the level data); the last one runs
 * into the tunnel with a single failing light inside.
 */

const Z = 10; // track 1 centreline
const HALF_W = 1.58;
const BOTTOM = -0.3;
const TOP = 2.75;
const RAIL_TOP = -0.915;
const WHEEL_R = 0.46;

interface CoachSpec {
  x0: number;
  x1: number;
  doors: [number, number][]; // world x ranges on both sides
  platformDoorsOnly?: boolean; // far side painted shut (gameplay coach)
  number: string;
  ladies?: boolean;
  lit?: boolean;
  cab?: boolean;
}

const COACHES: CoachSpec[] = [
  { x0: -12, x1: 12, doors: [[-10, -9], [9, 10]], platformDoorsOnly: true, number: 'ER 99313 M', cab: true },
  { x0: 12.3, x1: 34.3, doors: [[14.2, 15.4], [22.7, 23.9], [31.2, 32.4]], number: 'ER 99314 T', ladies: true },
  { x0: 34.6, x1: 56.6, doors: [[36.5, 37.7], [45, 46.2], [53.5, 54.7]], number: 'ER 99315 T', lit: true },
];

// ───────────────────────────── painted side textures ─────────────────────────────

function windowsFor(c: CoachSpec) {
  const out: [number, number][] = [];
  for (let x = c.x0 + 0.9; x < c.x1 - 1.2; x += 1.38) {
    const w: [number, number] = [x, x + 0.95];
    if (c.doors.some(([a, b]) => w[1] > a - 0.25 && w[0] < b + 0.25)) continue;
    out.push(w);
  }
  return out;
}

function sideTexture(c: CoachSpec, opts: { interior: boolean; withDoors: boolean; mirrorText?: boolean }) {
  const L = c.x1 - c.x0;
  const W = 2048;
  const H = 256;
  const ppm = W / L;
  const vpm = H / (TOP - BOTTOM);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const yPx = (y: number) => H - (y - BOTTOM) * vpm;
  const xPx = (x: number) => (x - c.x0) * ppm;
  // the platform side is seen from behind its plane, so its lettering is painted mirrored
  const text = (str: string, x: number, y: number) => {
    if (!opts.mirrorText) return g.fillText(str, x, y);
    g.save();
    g.translate(x + g.measureText(str).width, y);
    g.scale(-1, 1);
    g.fillText(str, 0, 0);
    g.restore();
  };

  if (opts.interior) {
    g.fillStyle = '#5d6b5f';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#3f4a42';
    g.fillRect(0, yPx(0.95), W, yPx(0.05) - yPx(0.95));
  } else {
    // maroon body, faded cream window band, darker skirt
    g.fillStyle = '#4b1712';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#b9a477';
    g.fillRect(0, yPx(2.0), W, yPx(0.95) - yPx(2.0));
    g.fillStyle = '#2b0f0c';
    g.fillRect(0, yPx(0.05), W, H - yPx(0.05));
    g.fillStyle = '#d8c48f';
    g.fillRect(0, yPx(2.42), W, 3);
    // panel seams and rivets
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = 0; x < W; x += ppm * 1.38) g.fillRect(x, 0, 2, H);
    g.fillStyle = 'rgba(255,240,210,0.12)';
    for (let x = 4; x < W; x += 9) {
      g.fillRect(x, yPx(2.36), 2, 2);
      g.fillRect(x, yPx(0.12), 2, 2);
    }
  }

  // grime: dark streaks running down from the windows and roof
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.6;
    g.fillStyle = `rgba(20,12,8,${Math.random() * 0.22})`;
    g.fillRect(x, y, 1 + Math.random() * 3, H * (0.1 + Math.random() * 0.5));
  }
  // rust bloom along the bottom
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * W;
    const y = yPx(0.2) + Math.random() * (H - yPx(0.2));
    const r = 3 + Math.random() * 14;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(120,58,22,0.55)');
    grd.addColorStop(1, 'rgba(120,58,22,0)');
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // windows: holes with horizontal bars
  for (const [a, b] of windowsFor(c)) {
    const x0 = xPx(a);
    const x1 = xPx(b);
    const y0 = yPx(1.9);
    const y1 = yPx(1.05);
    g.fillStyle = opts.interior ? '#2e3530' : '#1d1d1c';
    g.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    g.clearRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#2a2826';
    for (let k = 1; k < 6; k++) g.fillRect(x0, y0 + ((y1 - y0) * k) / 6 - 1.5, x1 - x0, 3);
  }

  // doorways (open, Kolkata-style) or painted shut
  for (const [a, b] of c.doors) {
    const x0 = xPx(a);
    const x1 = xPx(b);
    if (opts.withDoors) {
      g.clearRect(x0, yPx(2.05), x1 - x0, yPx(0.05) - yPx(2.05));
      g.fillStyle = '#9a9488';
      g.fillRect(x0 + (x1 - x0) / 2 - 2, yPx(2.0), 4, yPx(0.3) - yPx(2.0)); // grab pole
    } else {
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.strokeRect(x0, yPx(2.05), x1 - x0, yPx(0.05) - yPx(2.05));
    }
  }

  if (!opts.interior) {
    g.fillStyle = '#e8dcb4';
    g.font = '700 30px "IBM Plex Mono", monospace';
    text(c.number, xPx(c.x0 + L * 0.42), yPx(0.55));
    if (c.ladies) {
      g.font = '700 34px "Noto Serif Bengali", "Nirmala UI", serif';
      g.fillStyle = '#efe4c0';
      text('মহিলা · महिला · LADIES', xPx(c.x0 + L * 0.2), yPx(0.62));
    }
    g.font = '600 24px Arial, sans-serif';
    g.fillStyle = 'rgba(230,220,190,0.7)';
    text('POH 11-98  ·  RTN 11-99', xPx(c.x1 - 4.5), yPx(0.35));
  }
  ageCanvas(g, W, H, 0.35);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function frontTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 512;
  const g = cv.getContext('2d')!;
  const W = 512;
  const H = 512;
  g.fillStyle = '#4b1712';
  g.fillRect(0, 0, W, H);
  // cream window band
  g.fillStyle = '#b9a477';
  g.fillRect(0, H * 0.25, W, H * 0.34);
  // windscreen recesses
  g.fillStyle = '#121212';
  g.fillRect(W * 0.07, H * 0.27, W * 0.38, H * 0.27);
  g.fillRect(W * 0.55, H * 0.27, W * 0.38, H * 0.27);
  // yellow-black warning chevrons on the buffer beam
  for (let i = -2; i < 16; i++) {
    g.fillStyle = i % 2 ? '#c9a21a' : '#151515';
    g.beginPath();
    g.moveTo(i * 40, H);
    g.lineTo(i * 40 + 40, H);
    g.lineTo(i * 40 + 90, H * 0.86);
    g.lineTo(i * 40 + 50, H * 0.86);
    g.fill();
  }
  g.fillStyle = '#e3d6ae';
  g.font = '700 44px "IBM Plex Mono", monospace';
  g.textAlign = 'center';
  g.fillText('99313', W / 2, H * 0.74);
  ageCanvas(g, W, H, 0.45);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function destinationTexture() {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 96;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#0a0907';
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffae42';
  g.textBaseline = 'middle';
  g.font = '600 44px "Noto Serif Bengali", "Nirmala UI", serif';
  g.fillText('নিশিপুর লোকাল', 16, 50);
  g.font = '600 28px "IBM Plex Mono", monospace';
  g.fillText('N 0', 430, 48);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ───────────────────────────── pieces ─────────────────────────────

function Bogie({ x, mats }: { x: number; mats: Record<string, THREE.Material> }) {
  const wheelY = RAIL_TOP + WHEEL_R;
  return (
    <group position={[x, 0, Z]}>
      <mesh position={[0, -0.62, 0]} material={mats.under}>
        <boxGeometry args={[2.8, 0.32, 2.3]} />
      </mesh>
      {[-1.05, 1.05].map((dx) =>
        [-0.79, 0.79].map((dz) => (
          <group key={`${dx}${dz}`} position={[dx, wheelY, dz]}>
            <mesh rotation={[Math.PI / 2, 0, 0]} material={mats.wheel}>
              <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.13, 24]} />
            </mesh>
            <mesh position={[0, 0, dz > 0 ? 0.12 : -0.12]} material={mats.under}>
              <boxGeometry args={[0.32, 0.3, 0.14]} />
            </mesh>
          </group>
        )),
      )}
      {[-0.6, 0.6].map((dx) => (
        <mesh key={dx} position={[dx, -0.32, 0.95]} material={mats.spring}>
          <cylinderGeometry args={[0.1, 0.1, 0.3, 10]} />
        </mesh>
      ))}
    </group>
  );
}

function Pantograph({ x, mats }: { x: number; mats: Record<string, THREE.Material> }) {
  const rods = useMemo(() => {
    const out: { a: THREE.Vector3; b: THREE.Vector3 }[] = [];
    for (const dz of [-0.45, 0.45]) {
      const A = new THREE.Vector3(-0.75, 3.25, dz);
      const C = new THREE.Vector3(0.45, 4.45, dz * 0.8);
      const H = new THREE.Vector3(-0.05, 5.5, dz * 0.5);
      out.push({ a: A, b: C }, { a: C, b: H });
      out.push({ a: new THREE.Vector3(-0.75, 3.25, dz), b: new THREE.Vector3(0.75, 3.25, dz) });
    }
    return out;
  }, []);
  return (
    <group position={[x, 0, Z]}>
      {[-0.7, 0.7].map((dx) =>
        [-0.45, 0.45].map((dz) => (
          <group key={`${dx}${dz}`} position={[dx, 3.05, dz]}>
            {[0, 0.06, 0.12].map((y) => (
              <mesh key={y} position={[0, y, 0]} material={mats.insulator}>
                <cylinderGeometry args={[0.06, 0.06, 0.04, 10]} />
              </mesh>
            ))}
          </group>
        )),
      )}
      {rods.map(({ a, b }, i) => {
        const len = a.distanceTo(b);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        return (
          <mesh key={i} position={mid} quaternion={q} material={mats.panto}>
            <cylinderGeometry args={[0.025, 0.025, len, 6]} />
          </mesh>
        );
      })}
      <mesh position={[-0.05, 5.55, 0]} material={mats.panto}>
        <boxGeometry args={[0.12, 0.05, 1.9]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[-0.05, 5.45, s * 1.05]} rotation={[s * 0.8, 0, 0]} material={mats.panto}>
          <boxGeometry args={[0.05, 0.04, 0.35]} />
        </mesh>
      ))}
    </group>
  );
}

const beamMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uI: { value: 1 } },
    vertexShader: `varying float vH; varying float vEdge; varying float vDepth;
      void main(){ vH = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z;
        vec3 n = normalize(normalMatrix * normal); vEdge = abs(dot(n, normalize(-mv.xyz)));
        gl_Position = projectionMatrix * mv; }`,
    // the beam is 30 m long and the platform runs through its wide end: anything near the camera
    // fades away, otherwise the screen-clipped cone shows up as a flashing white slab
    fragmentShader: `uniform float uI; varying float vH; varying float vEdge; varying float vDepth;
      void main(){ float a = pow(max(vH, 1e-4), 2.4) * pow(max(vEdge, 1e-4), 1.2) * 0.12 * uI * smoothstep(4.0, 14.0, vDepth); gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * a, a); }`,
  });

function glareMaterial() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.07, 'rgba(245,250,255,0.9)');
  grad.addColorStop(0.25, 'rgba(220,235,245,0.2)');
  grad.addColorStop(1, 'rgba(220,235,245,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const s = g.createLinearGradient(0, 0, 256, 0);
  s.addColorStop(0, 'rgba(230,240,255,0)');
  s.addColorStop(0.5, 'rgba(230,240,255,0.55)');
  s.addColorStop(1, 'rgba(230,240,255,0)');
  g.fillStyle = s;
  g.fillRect(0, 125, 256, 6);
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
}

function Cab({ shadows, mats, body }: { shadows: boolean; mats: Record<string, THREE.Material>; body: THREE.Material }) {
  const scene = useThree((s) => s.scene);
  const front = useMemo(() => frontTexture(), []);
  const dest = useMemo(() => destinationTexture(), []);
  const beam = useMemo(beamMaterial, []);
  const glare = useMemo(glareMaterial, []);
  const glareRef = useRef<THREE.Sprite>(null);
  const lamp = useRef<THREE.MeshStandardMaterial>(null);
  const spot = useMemo(() => {
    const s = new THREE.SpotLight('#e9f2ff', 170, 80, 0.28, 0.6, 1.6);
    s.position.set(-13.5, 2.98, Z);
    s.target.position.set(-50, 0.1, 8.8);
    // a second shadow map would re-render the whole station every frame; the torch casts the only shadows
    s.castShadow = false;
    return s;
  }, []);
  useEffect(() => {
    scene.add(spot, spot.target);
    return () => {
      scene.remove(spot, spot.target);
      spot.dispose();
    };
  }, [scene, spot]);
  const level = useRef(0.92);
  const camera = useThree((s) => s.camera);
  const beamRef = useRef<THREE.Mesh>(null);
  const probe = useMemo(() => ({ apex: new THREE.Vector3(), dir: new THREE.Vector3(), v: new THREE.Vector3() }), []);
  useFrame((_, dt) => {
    const t = now();
    // the headlamp sags (never strobes) when the Caller hunts nearby or the platform browns out
    let target = 0.92 + Math.sin(t * 0.6) * 0.03;
    const g = runtime.snap?.ghost;
    if (g && (g.mode === 'hunt' || g.mode === 'warn') && Math.hypot(g.pos.x + 12.7, g.pos.z - Z) < 28) target = 0.3;
    if ((fx.flicker.get('l_plat_flicker') ?? 0) > t) target *= 0.5;
    level.current = THREE.MathUtils.damp(level.current, target, 1.6, Math.min(dt, 0.1));
    const k = level.current;
    spot.intensity = 150 * k;
    // fade the whole beam when the camera is in or near it: seen from inside, an additive cone just
    // smears the screen white
    let near = 1;
    const bm = beamRef.current;
    if (bm) {
      bm.updateWorldMatrix(true, false);
      probe.dir.set(0, 1, 0).transformDirection(bm.matrixWorld); // towards the apex
      probe.apex.setFromMatrixPosition(bm.matrixWorld).addScaledVector(probe.dir, 15);
      probe.dir.negate();
      probe.v.copy(camera.position).sub(probe.apex);
      const along = THREE.MathUtils.clamp(probe.v.dot(probe.dir), 0, 30);
      const off = probe.v.addScaledVector(probe.dir, -along).length();
      const outside = off - (along / 30) * 4.6;
      near = THREE.MathUtils.smoothstep(outside, 2.5, 7);
    }
    beam.uniforms.uI.value = k * 0.8 * near;
    if (lamp.current) lamp.current.emissiveIntensity = 12 * k;
    glare.opacity = 0.55 * k;
    glareRef.current?.scale.setScalar(2.1 * (0.6 + 0.4 * k));
  });
  const x = -12;
  const beamLen = 30;
  return (
    <group name="emu-cab">
      {/* nose: slightly raked upper front */}
      <mesh position={[x - 0.33, (BOTTOM + 1.7) / 2, Z]} material={body} castShadow={shadows}>
        <boxGeometry args={[0.66, 1.7 - BOTTOM, HALF_W * 2]} />
      </mesh>
      <mesh position={[x - 0.27, 2.25, Z]} rotation={[0, 0, -0.12]} material={body}>
        <boxGeometry args={[0.55, 1.1, HALF_W * 2]} />
      </mesh>
      <mesh position={[x - 0.672, 1.32, Z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[HALF_W * 2, 3.25]} />
        <meshStandardMaterial map={front} roughness={0.75} metalness={0.25} />
      </mesh>
      {/* windscreens with wipers */}
      {[Z - 0.72, Z + 0.72].map((z) => (
        <group key={z}>
          <mesh position={[x - 0.69, 1.95, z]} rotation={[0, -Math.PI / 2, 0.12]}>
            <planeGeometry args={[1.12, 0.82]} />
            <meshStandardMaterial color="#020304" roughness={0.04} metalness={0.9} envMapIntensity={2.2} />
          </mesh>
          <mesh position={[x - 0.72, 1.66, z + 0.18]} rotation={[0.6, 0, 0]} material={mats.under}>
            <boxGeometry args={[0.02, 0.6, 0.02]} />
          </mesh>
        </group>
      ))}
      {/* destination board */}
      <mesh position={[x - 0.58, 2.6, Z]} rotation={[0, -Math.PI / 2, 0.12]}>
        <planeGeometry args={[1.8, 0.3]} />
        <meshStandardMaterial map={dest} emissiveMap={dest} emissive="#ffffff" emissiveIntensity={0.7} />
      </mesh>
      {/* headlight + glare + beam */}
      <mesh position={[x - 0.5, 2.98, Z]} rotation={[0, 0, Math.PI / 2]} material={mats.under}>
        <cylinderGeometry args={[0.24, 0.26, 0.22, 24]} />
      </mesh>
      <mesh position={[x - 0.62, 2.98, Z]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.19, 0.19, 0.02, 24]} />
        <meshStandardMaterial ref={lamp} color="#ffffff" emissive="#eef5ff" emissiveIntensity={16} />
      </mesh>
      <sprite ref={glareRef} material={glare} position={[x - 0.8, 2.98, Z]} scale={[2.6, 2.6, 1]} />
      {/* apex at the lamp, widening down the track (cone +y points back at the lamp) */}
      <mesh ref={beamRef} material={beam} position={[x - 0.7 - beamLen / 2, 2.6, Z - 0.3]} rotation={[0, 0, -Math.PI / 2 + 0.05]}>
        <coneGeometry args={[4.6, beamLen, 28, 1, true]} />
      </mesh>
      {/* marker and tail lamps, horns, buffers, coupler */}
      {[Z - 1.15, Z + 1.15].map((z) => (
        <group key={z}>
          <mesh position={[x - 0.68, 0.9, z]}>
            <sphereGeometry args={[0.075, 12, 8]} />
            <meshStandardMaterial color="#fff" emissive="#fff2d6" emissiveIntensity={5} />
          </mesh>
          <mesh position={[x - 0.68, 0.62, z]}>
            <sphereGeometry args={[0.06, 12, 8]} />
            <meshStandardMaterial color="#300" emissive="#ff1a0a" emissiveIntensity={2.2} />
          </mesh>
          <mesh position={[x - 0.2, 3.12, z * 0 + Z + (z > Z ? 0.5 : -0.5)]} rotation={[0, 0, Math.PI / 2]} material={mats.under}>
            <cylinderGeometry args={[0.04, 0.08, 0.35, 10]} />
          </mesh>
          <mesh position={[x - 0.85, -0.05, z * 0.85 + Z * 0.15]} rotation={[0, 0, Math.PI / 2]} material={mats.wheel}>
            <cylinderGeometry args={[0.17, 0.17, 0.35, 16]} />
          </mesh>
        </group>
      ))}
      <mesh position={[x - 0.9, -0.15, Z]} material={mats.under}>
        <boxGeometry args={[0.45, 0.22, 0.35]} />
      </mesh>
      <mesh position={[x - 0.75, -0.55, Z]} rotation={[0, 0, -0.5]} material={mats.under}>
        <boxGeometry args={[0.12, 0.6, 2.6]} />
      </mesh>
    </group>
  );
}

function Coach({ c, mats, shadows }: { c: CoachSpec; mats: Record<string, THREE.Material>; shadows: boolean }) {
  const L = c.x1 - c.x0;
  const cx = (c.x0 + c.x1) / 2;
  const lib = cachedTextures();
  const { outer, outerFar, inner } = useMemo(() => {
    const normal = lib?.metal?.normalMap?.clone();
    if (normal) {
      normal.repeat.set(L / 2, 1.5);
      normal.needsUpdate = true;
    }
    const mk = (tex: THREE.Texture, rough = 0.68) =>
      new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: rough, metalness: 0.3, normalMap: normal, normalScale: new THREE.Vector2(0.4, 0.4) });
    return {
      outer: mk(sideTexture(c, { interior: false, withDoors: true, mirrorText: true })),
      outerFar: mk(sideTexture(c, { interior: false, withDoors: !c.platformDoorsOnly })),
      inner: c.cab ? mk(sideTexture(c, { interior: true, withDoors: true }), 0.85) : null,
    };
  }, [c, L, lib]);
  const innerFar = useMemo(() => (c.cab ? new THREE.MeshStandardMaterial({ map: sideTexture(c, { interior: true, withDoors: false }), alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide }) : null), [c]);
  const vents = useRef<THREE.InstancedMesh>(null);
  const ventCount = Math.floor((L - 2) / 1.6);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < ventCount; i++) vents.current?.setMatrixAt(i, m.makeTranslation(c.x0 + 1.6 + i * 1.6, TOP + 0.3, Z));
    if (vents.current) vents.current.instanceMatrix.needsUpdate = true;
  }, [c, ventCount]);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(() => {
    if (!glow.current) return;
    const t = now();
    // one weak tube left burning inside: a faint, steady teal glow, never a bright panel
    glow.current.emissiveIntensity = 0.2 + Math.sin(t * 0.4) * 0.03;
  });
  const roofH = 0.34;
  return (
    <group>
      {/* sides */}
      <mesh position={[cx, (BOTTOM + TOP) / 2, Z - HALF_W]} material={outer} castShadow={shadows} receiveShadow={shadows}>
        <planeGeometry args={[L, TOP - BOTTOM]} />
      </mesh>
      <mesh position={[cx, (BOTTOM + TOP) / 2, Z + HALF_W]} material={outerFar} castShadow={shadows}>
        <planeGeometry args={[L, TOP - BOTTOM]} />
      </mesh>
      {inner && innerFar && (
        <>
          <mesh position={[cx, (0.05 + TOP) / 2 + 0.0, Z - HALF_W + 0.1]} material={inner}>
            <planeGeometry args={[L, TOP - 0.05]} />
          </mesh>
          <mesh position={[cx, (0.05 + TOP) / 2, Z + HALF_W - 0.1]} material={innerFar}>
            <planeGeometry args={[L, TOP - 0.05]} />
          </mesh>
        </>
      )}
      {/* roof: outer steel and a pale inner ceiling */}
      <mesh position={[cx, TOP, Z]} rotation={[0, 0, Math.PI / 2]} scale={[roofH / HALF_W, 1, 1]} material={mats.roof} castShadow={shadows}>
        <cylinderGeometry args={[HALF_W, HALF_W, L, 24, 1, true, 0, Math.PI]} />
      </mesh>
      <mesh position={[cx, TOP - 0.01, Z]} rotation={[0, 0, Math.PI / 2]} scale={[roofH / HALF_W, 1, 1]} material={mats.ceiling}>
        <cylinderGeometry args={[HALF_W - 0.03, HALF_W - 0.03, L, 24, 1, true, 0, Math.PI]} />
      </mesh>
      <instancedMesh ref={vents} args={[undefined, mats.roof, ventCount]} frustumCulled={false}>
        <sphereGeometry args={[0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </instancedMesh>
      {/* ends: gangway walls */}
      {[c.x0, c.x1].map((x) => (
        <mesh key={x} position={[x, (BOTTOM + TOP) / 2, Z]} rotation={[0, Math.PI / 2, 0]} material={mats.end}>
          <planeGeometry args={[HALF_W * 2, TOP - BOTTOM]} />
        </mesh>
      ))}
      {/* underframe and equipment */}
      <mesh position={[cx, -0.13, Z]} material={mats.under}>
        <boxGeometry args={[L, 0.34, HALF_W * 2 - 0.1]} />
      </mesh>
      {[0.28, 0.42, 0.58, 0.7].map((f) => (
        <mesh key={f} position={[c.x0 + L * f, -0.5, Z + (f > 0.5 ? 0.4 : -0.3)]} material={mats.under}>
          <boxGeometry args={[1.6 + f, 0.5, 1.1]} />
        </mesh>
      ))}
      <Bogie x={c.x0 + 3.3} mats={mats} />
      <Bogie x={c.x1 - 3.3} mats={mats} />
      {/* sealed coaches: darkness behind the bars; the last coach has one dying light */}
      {!c.cab && (
        <mesh position={[cx, 1.3, Z]}>
          <boxGeometry args={[L - 0.2, 2.5, HALF_W * 2 - 0.25]} />
          {c.lit ? (
            <meshStandardMaterial ref={glow} color="#0a0d0e" emissive="#6f9aa3" emissiveIntensity={0.22} side={THREE.BackSide} />
          ) : (
            <meshStandardMaterial color="#050606" side={THREE.BackSide} />
          )}
        </mesh>
      )}
      {c.lit && (
        <mesh position={[c.x0 + 6.2, 1.25, Z - 0.6]}>
          <capsuleGeometry args={[0.2, 0.55, 4, 10]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
      )}
    </group>
  );
}

export function Train({ shadows }: { shadows: boolean }) {
  const lib = cachedTextures();
  const mats = useMemo<Record<string, THREE.Material>>(
    () => ({
      roof: new THREE.MeshStandardMaterial({ color: '#2f3132', roughness: 0.6, metalness: 0.6, map: lib?.metal?.map, side: THREE.FrontSide }),
      ceiling: new THREE.MeshStandardMaterial({ color: '#8e968d', roughness: 0.9, side: THREE.BackSide }),
      under: new THREE.MeshStandardMaterial({ color: '#121212', roughness: 0.7, metalness: 0.6 }),
      wheel: new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.35, metalness: 0.85, map: lib?.rust?.map }),
      spring: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: 0.5, metalness: 0.7 }),
      panto: new THREE.MeshStandardMaterial({ color: '#2d2f30', roughness: 0.5, metalness: 0.8 }),
      insulator: new THREE.MeshStandardMaterial({ color: '#7d7466', roughness: 0.3 }),
      end: new THREE.MeshStandardMaterial({ color: '#2b0f0c', roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }),
    }),
    [lib],
  );
  const cabBody = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#4b1712', roughness: 0.65, metalness: 0.3, map: lib?.carriage?.map }),
    [lib],
  );
  return (
    <group name="emu">
      {COACHES.map((c) => (
        <Coach key={c.number} c={c} mats={mats} shadows={shadows} />
      ))}
      {/* gangway bellows between coaches */}
      {[12.15, 34.45].map((x) => (
        <mesh key={x} position={[x, 1.1, Z]} material={mats.under}>
          <boxGeometry args={[0.35, 2.3, 1.3]} />
        </mesh>
      ))}
      <Pantograph x={-6.5} mats={mats} />
      <Cab shadows={shadows} mats={mats} body={cabBody} />
    </group>
  );
}
