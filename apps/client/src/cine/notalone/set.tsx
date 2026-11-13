import { useFrame, useThree } from '@react-three/fiber';
import type { BoxDef, BoxKind, LevelDef, MaterialId } from '@nishi/shared';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { buildLevelGeometry, makeMaterials } from '../../three/Level';
import { cachedTextures, signTexture, ageCanvas } from '../../three/textures';
import { makeNightEnvironment } from '../../three/Atmosphere';
import { WindowFigures, type ChildDrive, type FiguresDrive } from './figures';

/**
 * Outside Platform Zero: the street front of Nishipur Junction at 3:14 AM. A two-storey colonial
 * station front in the game's own plaster, stone and rust (the same procedural materials as the
 * level), its emergency exit, a jammed main shutter, upstairs windows (one lit, two figures in it), an
 * old sodium streetlight, and mist: dense height fog plus banks rolling along the ground.
 *
 * Station front at z = 0 facing +z (the street). The emergency exit is at x = 4.
 */

/** an axis-aligned box from its corners (as the level builders do) */
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, mat: MaterialId, kind: BoxKind): BoxDef => ({
  c: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], s: [x1 - x0, y1 - y0, z1 - z0], mat, kind,
});

export const DOOR = { hinge: new THREE.Vector3(3.25, 0, 0.05), w: 1.5, h: 2.45 };
export const LAMP = new THREE.Vector3(-0.9, 5.7, 7.2);
/** the lit window upstairs, and where the two of them stand behind it */
export const WINDOW = { x: -2.5, y0: 4.72, y1: 7.3, w: 1.4 };
export const MOTHER_AT = new THREE.Vector3(-2.88, 4.4, -0.8);
export const CHILD_AT = new THREE.Vector3(-2.5, 4.4, -0.72);
export const CHILD_NEAR = new THREE.Vector3(-2.36, 4.4, -0.42);

export interface SetDrive {
  /** door swing, radians outward */
  door: number;
  /** 0..1 */
  lamp: number;
  /** 0..1 the bulb in the upstairs room */
  room: number;
  /** the red emergency lamp in the corridor */
  corridor: number;
  fog: number;
  /** 0..1 the mist between her and the station thins */
  part: number;
  /** the figures at the window are there */
  figures: boolean;
  /** the child has moved closer to the glass */
  childNear: boolean;
  child: ChildDrive;
  /** where Aditi's eyes are (the two in the window watch her) */
  watch: THREE.Vector3;
  /** the timeline's clock (their breathing stops when the preview is paused) */
  time: number;
}

export function makeSetDrive(): SetDrive {
  return { door: 0, lamp: 1, room: 1, corridor: 1, fog: 0.07, part: 0, figures: true, childNear: false, child: { lift: 0, smile: 0, turn: 0 }, watch: new THREE.Vector3(3.3, 1.5, 7.4), time: 0 };
}

/** a wall with rectangular holes cut through it: [x0, x1, y0, y1][] */
function holed(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, mat: MaterialId, holes: [number, number, number, number][]): BoxDef[] {
  const xs = [...new Set([x0, x1, ...holes.flatMap((h) => [h[0], h[1]])])].filter((x) => x >= x0 && x <= x1).sort((a, b) => a - b);
  const out: BoxDef[] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i];
    const xb = xs[i + 1];
    const mid = (xa + xb) / 2;
    const cut = holes.filter((h) => h[0] < mid && mid < h[1]).map((h) => [h[2], h[3]] as const).sort((a, b) => a[0] - b[0]);
    let y = y0;
    for (const [ha, hb] of cut) {
      if (ha > y) out.push(box(xa, y, z0, xb, ha, z1, mat, 'wall'));
      y = Math.max(y, hb);
    }
    if (y < y1) out.push(box(xa, y, z0, xb, y1, z1, mat, 'wall'));
  }
  return out;
}

const UP_WINDOWS = [-10.2, -6.4, WINDOW.x, 1.2, 4.6, 8.2, 11.6];
const DOWN_WINDOWS = [-11.2, 0.4, 8.0, 11.4];

function stationBoxes(): BoxDef[] {
  const b: BoxDef[] = [];
  const ground: [number, number, number, number][] = [
    [DOOR.hinge.x, DOOR.hinge.x + DOOR.w, 0, DOOR.h], // the emergency exit
    [-8.2, -3.8, 0, 3.6], // the main entrance, its shutter jammed down
    ...DOWN_WINDOWS.map((x) => [x - 0.65, x + 0.65, 1.1, 2.7] as [number, number, number, number]),
  ];
  const upper: [number, number, number, number][] = UP_WINDOWS.map((x) => [x - WINDOW.w / 2, x + WINDOW.w / 2, WINDOW.y0, WINDOW.y1]);
  b.push(...holed(-15, 15, 0.7, 4.4, -0.45, 0, 'plaster', ground.map((h) => [h[0], h[1], Math.max(0.7, h[2]), h[3]])));
  b.push(...holed(-15, 15, 0, 0.7, -0.45, 0.06, 'stone', ground.filter((h) => h[2] < 0.7).map((h) => [h[0], h[1], 0, 0.7])));
  b.push(...holed(-15, 15, 4.4, 8.6, -0.45, 0, 'plaster', upper));
  // string course, cornice and parapet
  b.push(box(-15.2, 4.32, -0.45, 15.2, 4.62, 0.22, 'concrete', 'wall'));
  b.push(box(-15.3, 8.5, -0.45, 15.3, 8.86, 0.3, 'concrete', 'wall'));
  b.push(box(-15, 8.86, -0.4, 15, 9.7, -0.05, 'plaster', 'wall'));
  b.push(box(-15.1, 9.7, -0.45, 15.1, 9.86, 0.02, 'concrete', 'wall'));
  // pilasters between the bays
  for (const x of [-12.6, -8.6, -4.3, -0.6, 2.9, 6.4, 9.8, 13.5]) b.push(box(x - 0.22, 0.7, 0, x + 0.22, 8.5, 0.14, 'plaster', 'wall'));
  // sills under every window
  for (const x of UP_WINDOWS) b.push(box(x - 0.82, WINDOW.y0 - 0.14, 0, x + 0.82, WINDOW.y0, 0.18, 'concrete', 'wall'));
  for (const x of DOWN_WINDOWS) b.push(box(x - 0.78, 0.98, 0, x + 0.78, 1.1, 0.16, 'concrete', 'wall'));
  // behind the dark windows: shuttered black rooms
  for (const x of UP_WINDOWS.filter((x) => x !== WINDOW.x)) b.push(box(x - 0.8, WINDOW.y0, -0.9, x + 0.8, WINDOW.y1, -0.8, 'darkness', 'wall'));
  for (const x of DOWN_WINDOWS) b.push(box(x - 0.75, 1.1, -0.9, x + 0.75, 2.7, -0.8, 'darkness', 'wall'));
  // the lit room upstairs: floor, back and side walls, ceiling
  const rx = WINDOW.x;
  b.push(box(rx - 1.9, 4.2, -3.6, rx + 1.9, 4.4, -0.45, 'wood', 'floor'));
  b.push(box(rx - 1.9, 4.4, -3.7, rx + 1.9, 8.5, -3.55, 'plaster', 'wall'));
  b.push(box(rx - 2.0, 4.4, -3.6, rx - 1.85, 8.5, -0.45, 'plaster', 'wall'));
  b.push(box(rx + 1.85, 4.4, -3.6, rx + 2.0, 8.5, -0.45, 'plaster', 'wall'));
  b.push(box(rx - 1.9, 8.3, -3.6, rx + 1.9, 8.5, -0.45, 'ceiling', 'ceiling'));
  // a cupboard against the back wall
  b.push(box(rx + 0.5, 4.4, -3.55, rx + 1.6, 6.3, -3.0, 'wood', 'prop'));
  // the corridor behind the emergency exit: where she came from
  const cx0 = DOOR.hinge.x - 0.15;
  const cx1 = DOOR.hinge.x + DOOR.w + 0.15;
  b.push(box(cx0, -0.1, -9, cx1, 0, -0.45, 'mosaic', 'floor'));
  b.push(box(cx0 - 0.15, 0, -9, cx0, 3, -0.45, 'tile', 'wall'));
  b.push(box(cx1, 0, -9, cx1 + 0.15, 3, -0.45, 'tile', 'wall'));
  b.push(box(cx0, 3, -9, cx1, 3.15, -0.45, 'ceiling', 'ceiling'));
  b.push(box(cx0, 0, -9.15, cx1, 3, -9, 'darkness', 'wall'));
  // the forecourt, the kerb and the road beyond, a boundary wall at the far side of the road
  b.push(box(-40, -0.25, -0.45, 40, 0, 13, 'platform', 'floor'));
  b.push(box(-40, -0.25, 13, 40, 0.12, 13.3, 'stone', 'floor'));
  b.push(box(-40, -0.4, 13.3, 40, -0.05, 26, 'concrete', 'floor'));
  b.push(box(-40, -0.4, 26, 40, 2.2, 26.5, 'brick', 'wall'));
  // stubby bollards along the kerb
  for (const x of [-10, -6, -2, 2, 6, 10]) b.push(box(x - 0.13, 0, 12.5, x + 0.13, 0.75, 12.76, 'concrete', 'prop'));
  return b;
}

function useStationGeometry() {
  return useMemo(() => buildLevelGeometry({ boxes: stationBoxes() } as unknown as LevelDef), []);
}

function boardTexture() {
  return signTexture(1024, 160, (c, w, h) => {
    c.fillStyle = '#d9b324';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#1b1a16';
    c.lineWidth = 8;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#16140f';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 54px "Noto Serif Bengali", serif';
    c.fillText('নিশিপুর জংশন', w * 0.21, h / 2 + 4);
    c.font = '600 50px "IBM Plex Sans", sans-serif';
    c.fillText('निशिपुर जं.', w * 0.52, h / 2);
    c.fillText('NISHIPUR JN.', w * 0.81, h / 2);
    ageCanvas(c, w, h, 0.55);
  });
}

function exitTexture() {
  return signTexture(512, 128, (c, w, h) => {
    c.fillStyle = '#7b1612';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#e9dccb';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 40px "Noto Serif Bengali", serif';
    c.fillText('জরুরি নির্গমন', w / 2, h * 0.32);
    c.font = '600 38px "IBM Plex Sans", sans-serif';
    c.fillText('EMERGENCY EXIT', w / 2, h * 0.74);
    ageCanvas(c, w, h, 0.6);
  });
}

/** the station front, the street, the streetlight and the lit room */
export function StationSet({ drive }: { drive: React.MutableRefObject<SetDrive> }) {
  const lib = cachedTextures();
  const materials = useMemo(() => makeMaterials(lib ?? {}, true), [lib]);
  const parts = useStationGeometry();
  const board = useMemo(boardTexture, []);
  const exitSign = useMemo(exitTexture, []);
  const m = useMemo(() => ({
    shutter: new THREE.MeshStandardMaterial({ color: '#3d4f47', roughness: 0.8, map: lib?.wood?.map, normalMap: lib?.wood?.normalMap }),
    frame: new THREE.MeshStandardMaterial({ color: '#2a231c', roughness: 0.8 }),
    glass: new THREE.MeshStandardMaterial({ color: '#7f8f8a', roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false }),
    glow: new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffb366', emissiveIntensity: 2.4 }),
    sodium: new THREE.MeshStandardMaterial({ color: '#2b2116', emissive: '#ffad52', emissiveIntensity: 3 }),
    bulb: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.3, 1.2), toneMapped: false }),
    red: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.25, 0.18), toneMapped: false }),
    pole: new THREE.MeshStandardMaterial({ color: '#2f3336', roughness: 0.7, metalness: 0.6 }),
    board: new THREE.MeshStandardMaterial({ map: board, roughness: 0.8 }),
    exit: new THREE.MeshStandardMaterial({ map: exitSign, roughness: 0.8 }),
  }), [lib, board, exitSign]);
  const door = useRef<THREE.Group>(null);
  const lampLight = useRef<THREE.SpotLight>(null);
  const lampTarget = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(LAMP.x + 0.4, 0, LAMP.z - 0.6);
    return o;
  }, []);
  const roomLight = useRef<THREE.PointLight>(null);
  const faceLight = useRef<THREE.PointLight>(null);
  const corridorLight = useRef<THREE.PointLight>(null);
  const figures = useRef<THREE.Group>(null);
  const people = useRef<FiguresDrive>({ mother: MOTHER_AT.clone(), child: CHILD_AT.clone(), childDrive: drive.current.child, watch: drive.current.watch, time: 0 });

  useFrame(() => {
    const d = drive.current;
    people.current.childDrive = d.child;
    people.current.watch = d.watch;
    people.current.time = d.time;
    people.current.child.copy(d.childNear ? CHILD_NEAR : CHILD_AT);
    if (door.current) door.current.rotation.y = -d.door;
    if (lampLight.current) lampLight.current.intensity = 55 * d.lamp;
    m.sodium.emissiveIntensity = 0.15 + 3 * d.lamp;
    if (roomLight.current) roomLight.current.intensity = 12 * d.room;
    // a faint warm bounce on the child's face, only once she lifts it
    if (faceLight.current) {
      faceLight.current.intensity = 0.14 * d.child.lift * d.room;
      faceLight.current.position.set((d.childNear ? CHILD_NEAR : CHILD_AT).x + 0.12, 5.45, -0.3);
    }
    m.bulb.color.setRGB(3.2 * d.room + 0.05, 2.3 * d.room + 0.04, 1.2 * d.room + 0.03);
    m.glow.emissiveIntensity = 2.4 * d.room;
    if (corridorLight.current) corridorLight.current.intensity = 2.2 * d.corridor;
    if (figures.current) figures.current.visible = d.figures;
  });

  const rx = WINDOW.x;
  return (
    <group>
      {parts.map((p) => (
        <mesh key={p.mat} geometry={p.geo} material={materials[p.mat]} receiveShadow castShadow={p.mat !== 'platform' && p.mat !== 'concrete'} />
      ))}
      {/* the station's name board over the main entrance, and its jammed rolling shutter */}
      <mesh material={m.board} position={[-6, 3.95, 0.09]}>
        <planeGeometry args={[5.6, 0.62]} />
      </mesh>
      <mesh material={materials.corrugated} position={[-6, 1.8, -0.2]}>
        <boxGeometry args={[4.4, 3.6, 0.06]} />
      </mesh>
      {/* the emergency exit: a rusted steel door, the sign over it, the dead lamp above that */}
      <mesh material={m.exit} position={[DOOR.hinge.x + DOOR.w / 2, DOOR.h + 0.32, 0.02]}>
        <planeGeometry args={[1.25, 0.31]} />
      </mesh>
      <group ref={door} position={[DOOR.hinge.x, 0, 0.0]}>
        <mesh material={materials.rust} position={[DOOR.w / 2, DOOR.h / 2, -0.03]} castShadow receiveShadow>
          <boxGeometry args={[DOOR.w - 0.02, DOOR.h - 0.02, 0.06]} />
        </mesh>
        {/* the push bar and two strap hinges */}
        <mesh material={m.pole} position={[DOOR.w * 0.55, 1.05, -0.07]}>
          <boxGeometry args={[DOOR.w * 0.7, 0.05, 0.04]} />
        </mesh>
        {[0.5, 1.95].map((y) => (
          <mesh key={y} material={m.pole} position={[0.3, y, 0.005]}>
            <boxGeometry args={[0.55, 0.06, 0.012]} />
          </mesh>
        ))}
      </group>
      <pointLight ref={corridorLight} color="#ff3a28" intensity={2.2} distance={6} decay={2} position={[DOOR.hinge.x + DOOR.w / 2, 2.7, -3.5]} />
      <mesh material={m.red} position={[DOOR.hinge.x + DOOR.w / 2, 2.95, -3.5]}>
        <boxGeometry args={[0.18, 0.06, 0.1]} />
      </mesh>
      {/* window frames: a cross of wooden bars in every upstairs window, louvred shutters folded back */}
      {UP_WINDOWS.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          {/* the lit window's casement stands open: no upright in the way of who is standing in it */}
          {x !== rx && (
            <mesh material={m.frame} position={[0, (WINDOW.y0 + WINDOW.y1) / 2, -0.22]}>
              <boxGeometry args={[0.06, WINDOW.y1 - WINDOW.y0, 0.07]} />
            </mesh>
          )}
          <mesh material={m.frame} position={[0, 6.62, -0.22]}>
            <boxGeometry args={[WINDOW.w, 0.06, 0.07]} />
          </mesh>
          {x === rx ? (
            <mesh material={m.glass} position={[0, (WINDOW.y0 + WINDOW.y1) / 2, -0.25]}>
              <planeGeometry args={[WINDOW.w, WINDOW.y1 - WINDOW.y0]} />
            </mesh>
          ) : (
            <mesh material={m.shutter} position={[0, (WINDOW.y0 + WINDOW.y1) / 2, -0.3]}>
              <boxGeometry args={[WINDOW.w, WINDOW.y1 - WINDOW.y0, 0.04]} />
            </mesh>
          )}
          {[-1, 1].map((s) => (
            <mesh key={s} material={m.shutter} position={[s * (WINDOW.w / 2 + 0.36), (WINDOW.y0 + WINDOW.y1) / 2, 0.06]} rotation={[0, s * (x === rx ? 0.02 : 0.15), 0]}>
              <boxGeometry args={[0.68, WINDOW.y1 - WINDOW.y0, 0.04]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* barred ground-floor windows */}
      {DOWN_WINDOWS.map((x) => (
        <group key={x}>
          {[-0.45, -0.15, 0.15, 0.45].map((dx) => (
            <mesh key={dx} material={m.pole} position={[x + dx, 1.9, -0.12]}>
              <cylinderGeometry args={[0.012, 0.012, 1.6, 6]} />
            </mesh>
          ))}
        </group>
      ))}
      {/* the lit room: one bare bulb on a flex, a faint warm wash on the back wall */}
      <mesh material={m.bulb} position={[rx + 0.35, 7.3, -1.9]}>
        <sphereGeometry args={[0.045, 10, 8]} />
      </mesh>
      <mesh material={m.frame} position={[rx + 0.35, 7.9, -1.9]}>
        <cylinderGeometry args={[0.005, 0.005, 1.15, 4]} />
      </mesh>
      <pointLight ref={roomLight} color="#ffbe6e" intensity={7} distance={7} decay={2} position={[rx + 0.35, 7.2, -1.9]} />
      <pointLight ref={faceLight} color="#ffc890" intensity={0} distance={1.2} decay={2} />
      {/* her mother and the child, facing the street */}
      <group ref={figures}>
        <WindowFigures drive={people} />
      </group>
      {/* the streetlight: an old cast-iron post, a swan-neck arm, a sodium lantern */}
      <group position={[LAMP.x - 1.1, 0, LAMP.z]}>
        <mesh material={m.pole} position={[0, 3, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.11, 6, 10]} />
        </mesh>
        <mesh material={m.pole} position={[0.55, 6.02, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.035, 0.035, 1.2, 8]} />
        </mesh>
        <mesh material={m.sodium} position={[1.1, 5.82, 0]}>
          <cylinderGeometry args={[0.16, 0.24, 0.26, 12]} />
        </mesh>
      </group>
      <spotLight ref={lampLight} color="#ffae57" intensity={55} distance={22} angle={0.95} penumbra={0.7} decay={2} position={LAMP} target={lampTarget} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.0006} />
      <primitive object={lampTarget} />
    </group>
  );
}

/** cold night light: a moon behind the station, a blue-grey sky fill, reflections from the game's night sky */
export function NightLight() {
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    scene.background = new THREE.Color('#0d1519');
    const env = makeNightEnvironment(gl);
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => env.dispose();
  }, [scene, gl]);
  return (
    <>
      <hemisphereLight args={['#4a6878', '#0a0d10', 0.55]} />
      <directionalLight color="#9db8cc" intensity={0.35} position={[-6, 14, -16]} />
    </>
  );
}

/**
 * Mist rolling along the ground: soft billboards that drift with the wind and wrap round; a few more
 * that swirl closer around Aditi. They fade before they reach the lens, so the camera never pokes
 * through one. `part` thins the banks between her and the station.
 */
export function GroundMist({ drive, around }: { drive: React.MutableRefObject<SetDrive>; around: React.MutableRefObject<THREE.Vector3> }) {
  const { geo, mat } = useMemo(() => {
    const tex = (() => {
      const s = 128;
      const cv = document.createElement('canvas');
      cv.width = cv.height = s;
      const c = cv.getContext('2d')!;
      const img = c.createImageData(s, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
        const dx = x / s - 0.5;
        const dy = y / s - 0.5;
        const r = Math.sqrt(dx * dx + dy * dy) * 2;
        let n = 0;
        let a = 0.5;
        let f = 3;
        for (let o = 0; o < 4; o++) {
          n += a * (Math.sin(x * f * 0.05 + o * 1.3) * Math.sin(y * f * 0.047 + o * 2.1) * 0.5 + 0.5);
          a *= 0.5;
          f *= 2;
        }
        const v = Math.max(0, 1 - r) ** 1.8 * (0.5 + n * 0.65);
        const i = (y * s + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.min(255, v * 255);
      }
      c.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv);
      return t;
    })();
    // x, y, z, size, swirl (1 = orbits round her)
    const banks: number[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 90; i++) banks.push(rnd(-22, 22), rnd(0.2, 1.4), rnd(-0.2, 26), rnd(3, 7.5), 0);
    for (let i = 0; i < 26; i++) banks.push(rnd(-14, 14), rnd(1.8, 4.5), rnd(0.5, 18), rnd(5, 10), 0);
    for (let i = 0; i < 14; i++) banks.push(rnd(0, Math.PI * 2), rnd(0.3, 1.5), rnd(1.6, 3.6), rnd(2, 3.5), 1);
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('uv', quad.getAttribute('uv'));
    const arr = new Float32Array(banks);
    g.setAttribute('aBank', new THREE.InstancedBufferAttribute(new Float32Array(arr.filter((_, i) => i % 5 < 4)), 4));
    g.setAttribute('aSwirl', new THREE.InstancedBufferAttribute(new Float32Array(arr.filter((_, i) => i % 5 === 4)), 1));
    g.instanceCount = banks.length / 5;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTex: { value: tex }, uTime: { value: 0 }, uPart: { value: 0 }, uAround: { value: new THREE.Vector3() },
        uLamp: { value: LAMP.clone() }, uLampK: { value: 1 }, uColor: { value: new THREE.Color('#6d8590') }, uWarm: { value: new THREE.Color('#d9a066') },
      },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uAround; attribute vec4 aBank; attribute float aSwirl;
        varying vec2 vUv; varying float vFade; varying vec3 vW;
        void main() {
          vUv = uv;
          vec3 c = aBank.xyz;
          if (aSwirl > 0.5) {
            // banks orbiting slowly round her, rising and sinking
            float a = aBank.x + uTime * 0.06;
            c = uAround + vec3(cos(a) * aBank.z, aBank.y + sin(uTime * 0.2 + aBank.x) * 0.25, sin(a) * aBank.z);
          } else {
            float k = aBank.x * 1.3 + aBank.z * 0.7;
            c.x += uTime * 0.22 + sin(uTime * 0.07 + k) * 1.2;
            c.x = mod(c.x + 24.0, 48.0) - 24.0;
            c.z += cos(uTime * 0.05 + k) * 0.6;
            c.y += sin(uTime * 0.11 + k) * 0.12;
          }
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          float size = aBank.w;
          vec3 p = c + right * position.x * size * 1.7 + vec3(0.0, 1.0, 0.0) * position.y * size * 0.6;
          vW = p;
          float d = -(viewMatrix * vec4(c, 1.0)).z;
          vFade = smoothstep(0.8, 3.2, d) * (1.0 - smoothstep(32.0, 46.0, d));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          if (vFade < 0.002) gl_Position = vec4(0.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex; uniform vec3 uColor; uniform vec3 uWarm; uniform vec3 uLamp; uniform float uLampK; uniform float uPart; uniform vec3 uAround;
        varying vec2 vUv; varying float vFade; varying vec3 vW;
        void main() {
          float a = texture2D(uTex, vUv).a * 0.3 * vFade;
          // the mist parts: banks between her and the station thin out
          float between = smoothstep(uAround.z + 0.5, uAround.z - 2.0, vW.z) * smoothstep(-1.0, 3.0, vW.z) * step(1.6, vW.y + 0.6);
          a *= 1.0 - uPart * (0.35 + 0.6 * between);
          if (a < 0.003) discard;
          float lit = uLampK * (1.0 - smoothstep(1.5, 9.0, distance(vW, vec3(uLamp.x, 1.0, uLamp.z))));
          gl_FragColor = vec4(mix(uColor, uWarm, lit * 0.55), a);
        }`,
    });
    return { geo: g, mat: m };
  }, []);
  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uTime.value += Math.min(dt, 0.05);
    u.uPart.value = drive.current.part;
    u.uLampK.value = drive.current.lamp;
    (u.uAround.value as THREE.Vector3).copy(around.current);
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} renderOrder={3} />;
}

/**
 * Light in the mist: soft cones where the air catches it, under the sodium lamp and out of the lit
 * window once its bulb comes on. Additive, brightest along their axis, fading at the ends and edges,
 * stirred by the drifting mist. They stand clear of where Aditi is, so nothing she holds is washed out.
 */
export function LightShafts({ drive }: { drive: React.MutableRefObject<SetDrive> }) {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uK: { value: 1 }, uColor: { value: new THREE.Color('#ffae57') } },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
          void main() {
            vUv = uv;
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            vV = normalize(cameraPosition - w.xyz);
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform float uK; uniform vec3 uColor;
          varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vW;
          void main() {
            // bright on the axis (faces turned to us), gone at the silhouette; fading towards the far end
            float core = pow(abs(dot(vN, vV)), 2.2);
            float along = smoothstep(0.0, 0.25, vUv.y) * pow(vUv.y, 0.6) * (1.0 - smoothstep(0.92, 1.0, vUv.y));
            float stir = 0.65 + 0.35 * sin(vW.x * 1.7 + uTime * 0.35) * sin(vW.y * 2.3 - uTime * 0.27 + vW.z * 0.9);
            float a = core * along * stir * uK * 0.2;
            gl_FragColor = vec4(uColor * a, 1.0);
          }`,
      }),
    [],
  );
  const winMat = useMemo(() => {
    const m = mat.clone();
    m.uniforms.uColor.value = new THREE.Color('#ffc890');
    return m;
  }, [mat]);
  const geo = useMemo(() => {
    const lamp = new THREE.CylinderGeometry(0.22, 2.4, LAMP.y - 0.1, 28, 1, true);
    const win = new THREE.CylinderGeometry(0.62, 1.7, 7.5, 24, 1, true);
    return { lamp, win };
  }, []);
  useFrame((_, dt) => {
    const d = drive.current;
    mat.uniforms.uTime.value += Math.min(dt, 0.05);
    winMat.uniforms.uTime.value = mat.uniforms.uTime.value;
    mat.uniforms.uK.value = d.lamp;
    winMat.uniforms.uK.value = d.room * 0.8;
  });
  // the window's beam leans out and down towards the road, from the glass
  const out = new THREE.Vector3(0.25, -0.45, 1).normalize();
  const winQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), out);
  const winAt = new THREE.Vector3(WINDOW.x, (WINDOW.y0 + WINDOW.y1) / 2, -0.35).addScaledVector(out, 3.75);
  return (
    <>
      <mesh geometry={geo.lamp} material={mat} position={[LAMP.x, (LAMP.y - 0.1) / 2, LAMP.z]} renderOrder={4} frustumCulled={false} />
      <mesh geometry={geo.win} material={winMat} position={winAt} quaternion={winQ} renderOrder={4} frustumCulled={false} />
    </>
  );
}
