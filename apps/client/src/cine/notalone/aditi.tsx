import { useFrame, useLoader } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { wobble } from '../timeline';
import { AXIS, Rig, blinkAt, makeMaterial, modelUrl, prepTextures } from './avatar';
import type { HandPose } from './hand';
import { dressKurti } from './kurti';
import { buildScanHand } from './scanhand';
import type { Anchors } from './script';
import { labelTexture, phoneScreen, type PhoneState } from './screens';

/**
 * Aditi for the cutscene: the downloaded avatar ("Indian Teen In Shorts, Female", Avaturn rig with
 * a face) at a grown woman's height, in a block-print kurti and salwar (kurti.ts), with the scanned hand (rigged in scanhand.ts) at both wrists in
 * place of the avatar's own low-detail hands. Two-bone IK arms reach the script's wrist goals; the
 * neck looks at things; the spine leans, breathes and sobs; her face blinks, fears, cries and talks.
 * In first person her head is not drawn and the lens sits at her eyes.
 */
export interface HandGoal {
  /** where the wrist goes, in her body space (feet at the origin, +z in front of her, +x her left) */
  at: THREE.Vector3;
  /** which way the elbow points (body space) */
  pole: THREE.Vector3;
  /** palm towards this world point, fingers up (holding the phone or the reel up to look at it) */
  face?: THREE.Vector3;
  /** fingertips towards this world point, palm down (typing, reaching) */
  aim?: THREE.Vector3;
  /** with `face`: showing something to that point, held palm up under its lower rim (the reel) */
  cradle?: boolean;
}

export interface AditiDrive {
  pos: THREE.Vector3;
  yaw: number;
  /** ground speed, m/s (drives the gait) */
  speed: number;
  /** forward lean of the spine (rad) */
  lean: number;
  breathRate: number;
  breathDepth: number;
  /** 0..1 hand and head tremble */
  tremble: number;
  /** 0..1 quiet sobbing: the shoulders catch */
  sob: number;
  /** 0..1 she is speaking (her jaw and lips move) */
  talk: number;
  look: THREE.Vector3 | null;
  handR: HandGoal | null;
  handL: HandGoal | null;
  gripR: HandPose;
  gripL: HandPose;
  bagOpen: number;
  phoneVisible: boolean;
  phone: PhoneState;
  screen: number;
  reelInHand: boolean;
  label: number;
  /** the timeline's clock (so breathing and tremble stop when the preview is paused) */
  time: number;
  /** the lens is her eyes: her head is not drawn */
  fp: boolean;
}

export function makeDrive(): AditiDrive {
  return {
    pos: new THREE.Vector3(), yaw: 0, speed: 0, lean: 0, breathRate: 0.3, breathDepth: 0.3, tremble: 0, sob: 0, talk: 0, look: null,
    handR: null, handL: null, gripR: { grip: 'relax' }, gripL: { grip: 'relax' }, bagOpen: 0, phoneVisible: false,
    phone: { mode: 'off', bars: 0, msgs: [], draft: null, dots: false, callSecs: 0, pulse: 0 },
    screen: 0, reelInHand: false, label: 0, time: 0, fp: true,
  };
}

/** the model is 1.47 m to the top of the head; she is about 1.59 m */
const SCALE = 1.08;
const HEAD_PARTS = ['AvatarHead', 'AvatarEyelashes', 'AvatarLeftEyeball', 'AvatarRightEyeball', 'AvatarLeftCornea', 'AvatarRightCornea', 'AvatarTeethLower', 'AvatarTeethUpper', 'haircut'];
const ELBOW_BACK = new THREE.Vector3(0, 0, -1);

/** dev: live knobs (window.__tune.key = value) for fitting props to the hands */
const TUNE: Record<string, number> = {};
if (import.meta.env.DEV) (window as unknown as { __tune: typeof TUNE }).__tune = TUNE;
const tn = (k: string, v: number) => TUNE[k] ?? v;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpQ2 = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();

/**
 * a reel's flange: grey plastic with three windows on to the tape (alpha), a spindle hole, moulded
 * rings; the label sits between two windows at the top
 */
/** worn brown leather: mottled colour, a pebbled grain (bump) and a saddle stitch inset from every edge */
function leatherTextures() {
  const S = 512;
  const mk = () => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    return [cv, cv.getContext('2d')!] as const;
  };
  const [cc, c] = mk();
  const [bc, b] = mk();
  c.fillStyle = '#6a4630';
  c.fillRect(0, 0, S, S);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, S, S);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 260; i++) {
    // mottling: soft darker and lighter patches, darker toward the worn edges
    const x = rnd() * S, y = rnd() * S, r = 20 + rnd() * 60;
    const gr = c.createRadialGradient(x, y, 0, x, y, r);
    const l = rnd() < 0.5 ? '60,36,22' : '128,88,58';
    gr.addColorStop(0, `rgba(${l},0.18)`);
    gr.addColorStop(1, `rgba(${l},0)`);
    c.fillStyle = gr;
    c.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 9000; i++) {
    // pebbles: small light cells with dark creases between them
    const x = rnd() * S, y = rnd() * S, r = 1.5 + rnd() * 2.5;
    b.fillStyle = `rgba(${rnd() < 0.7 ? '200,200,200' : '40,40,40'},0.35)`;
    b.beginPath();
    b.arc(x, y, r, 0, Math.PI * 2);
    b.fill();
  }
  const edge = c.createLinearGradient(0, 0, 0, S);
  edge.addColorStop(0, 'rgba(30,18,10,0.35)');
  edge.addColorStop(0.08, 'rgba(30,18,10,0)');
  edge.addColorStop(0.92, 'rgba(30,18,10,0)');
  edge.addColorStop(1, 'rgba(30,18,10,0.35)');
  c.fillStyle = edge;
  c.fillRect(0, 0, S, S);
  // the stitch: a pressed groove (bump) with waxed thread dashes along it
  const inset = S * 0.06;
  b.strokeStyle = '#3a3a3a';
  b.lineWidth = 7;
  b.strokeRect(inset, inset, S - 2 * inset, S - 2 * inset);
  for (const [ctx, col, w] of [[c, '#c9ab7c', 4], [b, '#c8c8c8', 4]] as const) {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.setLineDash([11, 7]);
    ctx.strokeRect(inset, inset, S - 2 * inset, S - 2 * inset);
    ctx.setLineDash([]);
  }
  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const bump = new THREE.CanvasTexture(bc);
  return { map, bump };
}

function flangeTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const c = S / 2;
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#9a9ea3';
  g.beginPath();
  g.arc(c, c, c - 2, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(40,44,48,0.5)';
  for (const r of [0.97, 0.9, 0.25]) {
    g.lineWidth = 3;
    g.beginPath();
    g.arc(c, c, c * r, 0, Math.PI * 2);
    g.stroke();
  }
  // the windows (cut out: black is transparent)
  g.fillStyle = '#000';
  for (const a0 of [90, -150, -30]) {
    const a = (a0 * Math.PI) / 180;
    const w = (27 * Math.PI) / 180;
    g.beginPath();
    g.arc(c, c, c * 0.84, a - w, a + w);
    g.arc(c, c, c * 0.32, a + w * 0.8, a - w * 0.8, true);
    g.closePath();
    g.fill();
  }
  g.beginPath();
  g.arc(c, c, c * 0.11, 0, Math.PI * 2);
  g.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const TEX = ['body.jpg', 'body_n.jpg', 'head.jpg', 'head_n.jpg', 'eyes_brown.jpg', 'teeth.jpg', 'hair.png', 'hair_n.jpg', 'top.jpg', 'top_n.jpg', 'bottom.jpg', 'bottom_n.jpg', 'shoes.jpg', 'shoes_n.jpg'];
const SRGB = TEX.map((n) => !n.includes('_n'));

/**
 * first person: whatever of her own clothes and neck comes within `uClip.w` of `uClip.xyz` (world) is
 * not drawn, so the collar and hood never fill the lens when she looks down
 */
function clipNearEyes<T extends THREE.Material>(m: T, u: { uClip: { value: THREE.Vector4 } }) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uClip = u.uClip;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClipW;\nuniform vec4 uClip;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (distance(vClipW, uClip.xyz) < uClip.w) discard;');
  };
  m.customProgramCacheKey = () => 'clipNearEyes';
  return m;
}

/** the avatar's materials, by mesh name */
export function avatarMaterials(t: THREE.Texture[], outfit?: { top: THREE.Material; bottom: THREE.Material }) {
  const [body, bodyN, head, headN, eyes, teeth, hair, hairN, top, topN, bottom, bottomN, shoes, shoesN] = t;
  return {
    AvatarBody: makeMaterial({ map: body, normal: bodyN, skin: true }),
    AvatarHead: makeMaterial({ map: head, normal: headN, skin: true, rough: 0.5 }),
    AvatarEyelashes: makeMaterial({ color: '#0b0806', rough: 0.8 }),
    AvatarLeftEyeball: makeMaterial({ map: eyes, rough: 0.2 }),
    AvatarRightEyeball: makeMaterial({ map: eyes, rough: 0.2 }),
    AvatarLeftCornea: makeMaterial({ glass: true }),
    AvatarRightCornea: makeMaterial({ glass: true }),
    AvatarTeethLower: makeMaterial({ map: teeth, rough: 0.4 }),
    AvatarTeethUpper: makeMaterial({ map: teeth, rough: 0.4 }),
    haircut: makeMaterial({ map: hair, normal: hairN, cutout: true, rough: 0.55, color: '#8a8580' }),
    outfit_top: outfit?.top ?? makeMaterial({ map: top, normal: topN, rough: 0.92 }),
    outfit_bottom: outfit?.bottom ?? makeMaterial({ map: bottom, normal: bottomN, rough: 0.95 }),
    outfit_shoes: makeMaterial({ map: shoes, normal: shoesN, rough: 0.8 }),
  } as Record<string, THREE.Material>;
}

export function useAditiModel() {
  const gltf = useLoader(GLTFLoader, modelUrl('aditi/aditi.glb'));
  const tex = useLoader(THREE.TextureLoader, TEX.map((n) => modelUrl(`aditi/${n}`)));
  useMemo(() => prepTextures(tex, SRGB), [tex]);
  return { gltf, tex };
}

/** the avatar, a fresh copy, dressed and posable; `body` is where the caller places her */
export function dressAvatar(scene: THREE.Object3D, mats: Record<string, THREE.Material>, scale: number) {
  const model = cloneSkinned(scene);
  model.scale.setScalar(scale);
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    if (mats[m.name]) m.material = mats[m.name];
    m.castShadow = !m.name.includes('Cornea') && !m.name.includes('Eyelash');
    m.receiveShadow = true;
  });
  const body = new THREE.Group();
  body.add(model);
  return { model, body, rig: new Rig(model, body) };
}

export function CineAditi({ drive, anchors }: { drive: React.MutableRefObject<AditiDrive>; anchors?: React.MutableRefObject<Anchors> }) {
  const { gltf, tex } = useAditiModel();
  const handObj = useLoader(OBJLoader, modelUrl('hand/hand.obj'));
  const handTex = useLoader(THREE.TextureLoader, ['hand.jpg', 'hand_n.jpg', 'hand_r.jpg'].map((n) => modelUrl(`hand/${n}`)));
  useMemo(() => prepTextures(handTex, [true, false, false]), [handTex]);

  const built = useMemo(() => {
    const clip = { uClip: { value: new THREE.Vector4(0, -100, 0, 0) } };
    const mats = avatarMaterials(tex);
    mats.AvatarBody = clipNearEyes(mats.AvatarBody, clip);
    const { model, body, rig } = dressAvatar(gltf.scene, mats, SCALE);
    // her kurti and salwar, cut to her body (the avatar's own hoodie and shorts are hidden)
    dressKurti(model, clip);
    const handMat = new THREE.MeshPhysicalMaterial({
      map: handTex[0], normalMap: handTex[1], roughnessMap: handTex[2], roughness: 1, color: '#f4e6dc',
      sheen: 0.35, sheenColor: new THREE.Color('#b8644a'), sheenRoughness: 0.45,
    });
    const handGeo = (handObj.children[0] as THREE.Mesh).geometry;
    const scanR = buildScanHand(handGeo, handMat, -1);
    const scanL = buildScanHand(handGeo, handMat, 1);
    return { model, body, rig, scanR, scanL, clip };
  }, [gltf, tex, handObj, handTex]);

  const mats = useMemo(() => ({
    bag: (() => {
      const { map, bump } = leatherTextures();
      return new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 1.6, roughness: 0.55, sheen: 0.25, sheenColor: new THREE.Color('#8a6a50'), clearcoat: 0.12, clearcoatRoughness: 0.5 });
    })(),
    lining: new THREE.MeshStandardMaterial({ color: '#140d09', roughness: 0.95 }),
    strap: new THREE.MeshStandardMaterial({ color: '#33261b', roughness: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: '#b08a4a', roughness: 0.35, metalness: 0.85 }),
    phone: new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.35, metalness: 0.55 }),
    flange: (() => {
      const t = flangeTexture();
      return new THREE.MeshStandardMaterial({ map: t, alphaMap: t, alphaTest: 0.12, roughness: 0.38, metalness: 0.35, side: THREE.DoubleSide });
    })(),
    tape: new THREE.MeshStandardMaterial({ color: '#3b2a1e', roughness: 0.5, metalness: 0.2 }),
    hub: new THREE.MeshStandardMaterial({ color: '#d8d4cb', roughness: 0.6 }),
  }), []);
  const bagGeo = useMemo(() => {
    // the body bulges a little at the front; the flap is a thick soft panel rounded at its edges
    const body = new RoundedBoxGeometry(0.24, 0.19, 0.08, 4, 0.018);
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      if (z > 0) p.setZ(i, z + 0.008 * (1 - (x / 0.12) ** 2) * (1 - (y / 0.095) ** 2));
      p.setX(i, x * (1 + 0.04 * (y / 0.095))); // a touch wider at the mouth
    }
    body.computeVertexNormals();
    return { body, lid: new RoundedBoxGeometry(0.25, 0.007, 0.092, 2, 0.003), front: new RoundedBoxGeometry(0.25, 0.114, 0.007, 2, 0.003) };
  }, []);
  const screen = useMemo(phoneScreen, []);
  const label = useMemo(labelTexture, []);
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: screen.tex, toneMapped: false }), [screen]);
  const labelMat = useMemo(() => new THREE.MeshStandardMaterial({ map: label.tex, roughness: 0.85 }), [label]);

  const wristR = useRef<THREE.Group>(null);
  const wristL = useRef<THREE.Group>(null);
  const bagRef = useRef<THREE.Group>(null);
  const strapF = useRef<THREE.Group>(null);
  const strapB = useRef<THREE.Group>(null);
  const flap = useRef<THREE.Group>(null);
  const phone = useRef<THREE.Group>(null);
  const phoneLight = useRef<THREE.PointLight>(null);
  const reelHand = useRef<THREE.Group>(null);
  const st = useRef({ phase: 0, last: new THREE.Vector3(), init: false, headYaw: 0, headPitch: 0 });

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const d = drive.current;
    const s = st.current;
    const { body, rig, scanR, scanL } = built;
    const t = d.time;
    // ── where she stands, and the gait from how far she moved ──
    if (!s.init || d.pos.distanceTo(s.last) > 1.5) {
      s.last.copy(d.pos);
      s.init = true;
    }
    const moved = Math.hypot(d.pos.x - s.last.x, d.pos.z - s.last.z);
    s.last.copy(d.pos);
    body.position.copy(d.pos);
    body.rotation.y = d.yaw;
    const running = d.speed > 1.8;
    s.phase += moved * ((Math.PI * 2) / (running ? 1.6 : 1.15));
    const amp = Math.min(1, d.speed / 1.4) * (running ? 0.7 : 0.45);
    const sw = Math.sin(s.phase);

    rig.reset();
    // her own hands are replaced by the scan: folded away into the wrists
    rig.bone('RightHand').scale.setScalar(1e-3);
    rig.bone('LeftHand').scale.setScalar(1e-3);
    // ── legs: the stride; hips bob and sway ──
    rig.turn('LeftUpLeg', AXIS.X, -sw * amp);
    rig.turn('RightUpLeg', AXIS.X, sw * amp);
    rig.turn('LeftLeg', AXIS.X, Math.max(0, -sw) * amp * 1.3 + 0.04);
    rig.turn('RightLeg', AXIS.X, Math.max(0, sw) * amp * 1.3 + 0.04);
    rig.turn('LeftFoot', AXIS.X, -Math.max(0, -sw) * amp * 0.5);
    rig.turn('RightFoot', AXIS.X, -Math.max(0, sw) * amp * 0.5);
    const hips = rig.bone('Hips');
    hips.position.y += ((-0.01 + Math.abs(Math.cos(s.phase)) * (running ? 0.026 : 0.014) * Math.min(1, amp * 2)) / SCALE);
    rig.turn('Hips', AXIS.Y, sw * 0.07 * amp);
    // standing, her weight drifts slowly from foot to foot, the spine answering it
    const still = 1 - Math.min(1, d.speed / 0.4);
    const shift = (Math.sin(t * 0.7) * 0.7 + Math.sin(t * 0.29 + 2) * 0.3) * still;
    hips.position.x += (shift * 0.007) / SCALE;
    rig.turn('Hips', AXIS.Z, shift * 0.014);
    rig.turn('Spine1', AXIS.Z, -shift * 0.012);
    // ── breathing, lean, sobs ──
    const br = Math.sin(t * Math.PI * 2 * d.breathRate);
    const sob = d.sob * (Math.max(0, Math.sin(t * 5.3)) ** 6 * 0.7 + Math.max(0, Math.sin(t * 2.1 + 1)) ** 8 * 0.5);
    const bend = d.lean + br * 0.015 * d.breathDepth + sob * 0.05 + amp * 0.08;
    rig.turn('Spine', AXIS.X, bend * 0.35);
    rig.turn('Spine1', AXIS.X, bend * 0.35);
    rig.turn('Spine2', AXIS.X, bend * 0.3);
    rig.turn('Spine1', AXIS.Y, -sw * 0.05 * amp);
    const shrug = br * 0.03 * d.breathDepth + sob * 0.06;
    rig.turn('RightShoulder', AXIS.Z, shrug);
    rig.turn('LeftShoulder', AXIS.Z, -shrug);
    body.updateMatrixWorld(true);

    // ── the neck: look at what she is looking at ──
    let yaw = 0;
    let pitch = 0.05;
    if (d.look) {
      const L = body.worldToLocal(tmp.copy(d.look)).sub(body.worldToLocal(rig.at('Head', tmp2)));
      yaw = THREE.MathUtils.clamp(Math.atan2(L.x, L.z), -1.3, 1.3);
      pitch = THREE.MathUtils.clamp(Math.atan2(-L.y, Math.hypot(L.x, L.z)) - bend, -0.55, 1.1);
    }
    const shake = d.tremble * 0.006;
    s.headYaw = THREE.MathUtils.damp(s.headYaw, yaw, 4.2, dt);
    s.headPitch = THREE.MathUtils.damp(s.headPitch, pitch, 4.2, dt);
    const hy = s.headYaw + wobble(t * 5, 4) * shake;
    const hp = s.headPitch + wobble(t * 6, 1) * shake + sob * 0.05;
    for (const [n, f] of [['Neck', 0.35], ['Neck1', 0.2], ['Neck2', 0.2], ['Head', 0.25]] as const) {
      rig.turn(n, AXIS.Y, hy * f);
      rig.turn(n, AXIS.X, hp * f);
    }
    rig.turn('Head', AXIS.Z, wobble(t * 4, 7) * shake * 0.5);
    body.updateMatrixWorld(true);

    // ── arms: IK to the wrist goals; otherwise hanging and swinging with the walk ──
    const bodyQ = body.getWorldQuaternion(tmpQ2);
    const readRoll = d.phoneVisible && d.handR?.face ? tn('roll', 0.75) : 0;
    const arm = (side: -1 | 1, goal: HandGoal | null, wrist: THREE.Group | null) => {
      const P = side < 0 ? 'Right' : 'Left';
      const hang = !goal;
      const g: HandGoal = goal ?? {
        at: new THREE.Vector3(side * 0.19, 0.77, 0.04 + sw * amp * side * 0.18),
        pole: new THREE.Vector3(side * 0.4, -0.3, -1),
      };
      const tr = d.tremble * 0.005;
      const at = g.at.clone().add(new THREE.Vector3(wobble(t * 11, side * 3) * tr, wobble(t * 13, side * 5) * tr, wobble(t * 9, side * 7) * tr));
      const target = body.localToWorld(at);
      const pole = g.pole.clone().applyQuaternion(bodyQ);
      const w = rig.limb(`${P}Arm`, `${P}ForeArm`, `${P}Hand`, target, pole, ELBOW_BACK);
      const elbow = rig.at(`${P}ForeArm`, new THREE.Vector3());
      const fore = new THREE.Vector3().subVectors(w, elbow).normalize();
      // the hand's frame: fingers along -y, palm +z
      let x: THREE.Vector3;
      let y: THREE.Vector3;
      let z: THREE.Vector3;
      if (g.face && g.cradle) {
        // the reel stood up against her palm, the palm turned to her eyes: fingers up its back, leaning in a little
        z = new THREE.Vector3().subVectors(g.face, w).normalize();
        y = new THREE.Vector3(0, -1, 0).addScaledVector(z, z.y).normalize();
        y.applyAxisAngle(z, side * tn('lean', 0.35));
      } else if (g.face) {
        z = new THREE.Vector3().subVectors(g.face, w).normalize();
        y = new THREE.Vector3(0, -1, 0).addScaledVector(z, z.y).normalize();
      } else if (g.aim) {
        y = new THREE.Vector3().subVectors(w, g.aim).normalize();
        z = new THREE.Vector3(0, -1, 0).addScaledVector(y, y.y).normalize();
      } else {
        // fingers carry on from the forearm, the palm turned in towards her thigh
        y = fore.clone().negate();
        z = new THREE.Vector3(-side, 0, hang ? -0.15 : 0.4).applyQuaternion(bodyQ);
        z.addScaledVector(y, -z.dot(y)).normalize();
      }
      // holding the phone to read it, the hand cradles it from below: turned so the fingers wrap its far edge
      const roll = side < 0 ? readRoll : 0;
      if (roll) y.applyAxisAngle(z, roll);
      x = new THREE.Vector3().crossVectors(y, z);
      const wq = new THREE.Quaternion().setFromRotationMatrix(tmpM.makeBasis(x, y, z));
      if (wrist) {
        wrist.position.copy(body.worldToLocal(w.clone()));
        wrist.quaternion.copy(bodyQ).invert().multiply(wq);
        wrist.updateMatrixWorld(true);
        // the scan's bit of forearm follows the real forearm
        const scan = side < 0 ? scanR : scanL;
        const mesh = scan.object.children[0].children[0];
        const dirLocal = elbow.clone().sub(w).transformDirection(tmpM.copy(mesh.matrixWorld).invert()).normalize();
        scan.fore.quaternion.setFromUnitVectors(FORE_REST, dirLocal);
      }
    };
    arm(-1, d.handR, wristR.current);
    arm(1, d.handL, wristL.current);
    scanR.pose({ ...d.gripR, tense: (d.gripR.tense ?? 0) + d.tremble * 0.04 * (1 + wobble(t * 8, 2)) });
    scanL.pose({ ...d.gripL, tense: (d.gripL.tense ?? 0) + d.tremble * 0.04 * (1 + wobble(t * 8, 9)) });

    // ── her face: blinks, fear, tears, words; her eyes on what she looks at ──
    const fear = THREE.MathUtils.clamp(d.tremble, 0, 1);
    const cry = d.sob;
    const talk = d.talk * (0.5 + 0.5 * Math.abs(Math.sin(t * 11.3) * Math.sin(t * 4.1 + 1)));
    const blink = blinkAt(t, 2);
    rig.morph('eyeBlinkLeft', Math.max(blink, cry * 0.35));
    rig.morph('eyeBlinkRight', Math.max(blink, cry * 0.35));
    rig.morph('browInnerUp', 0.25 + fear * 0.45 + cry * 0.3);
    rig.morph('browDownLeft', cry * 0.25);
    rig.morph('browDownRight', cry * 0.25);
    rig.morph('eyeWideLeft', fear * 0.35 * (1 - cry));
    rig.morph('eyeWideRight', fear * 0.35 * (1 - cry));
    rig.morph('mouthFrownLeft', cry * 0.6 + fear * 0.15);
    rig.morph('mouthFrownRight', cry * 0.6 + fear * 0.15);
    rig.morph('mouthStretchLeft', cry * 0.35);
    rig.morph('mouthStretchRight', cry * 0.35);
    rig.morph('jawOpen', 0.04 + talk * 0.32 + d.breathDepth * 0.06 * Math.max(0, br));
    rig.morph('mouthFunnel', talk * 0.2);
    if (d.look && !d.fp) {
      for (const e of ['LeftEye', 'RightEye']) {
        const b = rig.bone(e);
        const from = b.getWorldPosition(tmp);
        const dir = tmp2.subVectors(d.look, from).normalize();
        rig.aim(b, AXIS.Z, AXIS.Y, dir, tmp.set(0, 1, 0));
      }
    }
    const nk = rig.at('Neck2', tmp).add(tmp2.set(0, tn('cy', 0.02), 0));
    built.clip.uClip.value.set(nk.x, nk.y, nk.z, d.fp ? tn('cr', 0.17) : 0);
    for (const n of HEAD_PARTS) {
      const m = rig.meshes[n];
      if (m) m.visible = !d.fp;
    }

    // ── props: the bag at her left hip, its strap across her ──
    body.updateMatrixWorld(true);
    if (bagRef.current) {
      const h = body.worldToLocal(rig.at('Hips', tmp));
      bagRef.current.position.set(h.x + 0.2, h.y - 0.05, h.z + 0.05);
      bagRef.current.rotation.y = -0.32;
    }
    if (strapF.current && strapB.current && bagRef.current) {
      // over the top of her right shoulder (between the collarbone and the joint), clear of her neck
      const sh = body.worldToLocal(rig.at('RightShoulder', new THREE.Vector3()).lerp(rig.at('RightArm', tmp), 0.65)).add(new THREE.Vector3(0, tn('sy', 0.07), tn('sz', -0.01)));
      const chest = body.worldToLocal(rig.at('Spine2', new THREE.Vector3())).add(new THREE.Vector3(0.02, -0.06, 0.125));
      const back = body.worldToLocal(rig.at('Spine2', new THREE.Vector3())).add(new THREE.Vector3(0.02, -0.06, -0.12));
      const bag = bagRef.current.position.clone().add(new THREE.Vector3(0.0, 0.1, 0));
      band(strapF.current, sh, chest, bag);
      band(strapB.current, sh, back, bag);
    }
    if (flap.current) flap.current.rotation.x = -d.bagOpen * 2.1;
    if (phone.current) {
      phone.current.visible = d.phoneVisible;
      phone.current.position.set(tn('px', 0), tn('py', -0.105), tn('pz', 0.03));
      // turned back against the hand's roll, so it stays upright in the cradle
      phone.current.rotation.z = Math.PI - readRoll;
    }
    screen.set(d.phone);
    // kept under the bloom threshold, so the text on it stays sharp
    screenMat.color.setScalar(0.1 + 0.55 * d.screen);
    if (phoneLight.current) phoneLight.current.intensity = d.phoneVisible ? d.screen * 0.12 : 0;
    if (reelHand.current) reelHand.current.visible = d.reelInHand;
    label.set(d.label, t);

    // where things really are, for the lens (it is placed after this, the same frame)
    const an = anchors?.current;
    if (an && phone.current && reelHand.current) {
      body.updateMatrixWorld(true);
      const head = rig.bone('Head');
      head.getWorldQuaternion(tmpQ);
      const turnQ = tmpQ.multiply(rig.restWorldQ(head, new THREE.Quaternion()).invert());
      an.gaze.set(0, 0, 1).applyQuaternion(bodyQ).applyQuaternion(turnQ).normalize();
      rig.at('LeftEye', an.eye).add(rig.at('RightEye', tmp)).multiplyScalar(0.5).addScaledVector(an.gaze, 0.02);
      rig.at('Head', an.head).add(tmp.set(0, 0.08, 0));
      phone.current.getWorldPosition(an.phone);
      phone.current.localToWorld(an.keys.set(0, -0.045, 0.006));
      const reel = reelHand.current;
      if (import.meta.env.DEV) (window as unknown as { __reel: THREE.Object3D }).__reel = reel;
      reel.getWorldPosition(an.reel);
      reel.localToWorld(an.label.set(0, 0.046, 0.0087));
    }
  }, 0);

  const reel = (withLabel: boolean) => (
    <group rotation={[Math.PI / 2, 0, 0]}>
      {[-0.0075, 0.0075].map((y) => (
        <mesh key={y} material={mats.flange} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
          <circleGeometry args={[0.089, 64]} />
        </mesh>
      ))}
      <mesh material={mats.tape}>
        <cylinderGeometry args={[0.066, 0.066, 0.0132, 36]} />
      </mesh>
      <mesh material={mats.hub} position={[0, 0.0005, 0]}>
        <cylinderGeometry args={[0.021, 0.021, 0.0175, 20]} />
      </mesh>
      {withLabel && (
        <mesh material={labelMat} position={[0, 0.0087, -0.046]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.07, 0.0219]} />
        </mesh>
      )}
    </group>
  );

  return (
    <primitive object={built.body}>
      {/* the right hand and the phone */}
      <group ref={wristR}>
        <primitive object={built.scanR.object} />
        {/* the phone on her palm and fingers: its top towards her fingertips, the screen facing out of the palm */}
        <group ref={phone} position={[0.0, -0.105, 0.03]} rotation={[0, 0, Math.PI]} visible={false}>
          <mesh material={mats.phone} castShadow>
            <boxGeometry args={[0.072, 0.15, 0.0085]} />
          </mesh>
          <mesh material={screenMat} position={[0, 0, 0.0044]}>
            <planeGeometry args={[0.066, 0.143]} />
          </mesh>
          <pointLight ref={phoneLight} color="#bcd2ff" intensity={0} distance={1.2} decay={2} position={[0, 0, 0.14]} />
        </group>
      </group>
      {/* the left hand and the reel: its lower rim across the base of her fingers, the fingers up its back, the thumb on its face */}
      <group ref={wristL}>
        <primitive object={built.scanL.object} />
        <group ref={reelHand} position={[0.05, -0.11, 0.024]} rotation={[0, 0, Math.PI]} visible={false}>
          {reel(true)}
        </group>
      </group>
      {/* the leather sling bag on her left hip, its flap hinged at the top */}
      <group ref={bagRef}>
        {/* a soft leather body, rounded at every edge, its dark lining showing at the mouth */}
        <mesh material={mats.bag} geometry={bagGeo.body} castShadow />
        <mesh material={mats.lining} position={[0, 0.0957, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.222, 0.066]} />
        </mesh>
        <group ref={flap} position={[0, 0.097, -0.04]}>
          <mesh material={mats.bag} geometry={bagGeo.lid} position={[0, 0.004, 0.044]} castShadow />
          <mesh material={mats.bag} geometry={bagGeo.front} position={[0, -0.05, 0.089]} castShadow />
          {/* the buckle: a brass frame on a leather tab */}
          <mesh material={mats.strap} position={[0, -0.095, 0.094]}>
            <boxGeometry args={[0.026, 0.05, 0.004]} />
          </mesh>
          <mesh material={mats.brass} position={[0, -0.104, 0.097]}>
            <torusGeometry args={[0.012, 0.0022, 6, 20]} />
          </mesh>
        </group>
      </group>
      {/* the bag's strap, from her right shoulder across her chest (and her back) to the bag */}
      {[strapF, strapB].map((r, i) => (
        <group key={i} ref={r}>
          {[0, 1].map((j) => (
            <mesh key={j} material={mats.strap} castShadow>
              <boxGeometry args={[0.032, 1, 0.006]} />
            </mesh>
          ))}
        </group>
      ))}
    </primitive>
  );
}

/** the scan's forearm direction at rest (from the wrist towards the elbow), in its own space */
const FORE_REST = new THREE.Vector3(-0.07, -9.5, -1.0).normalize();

/** lay a two-piece strap (children of `g`) through three points in body space */
function band(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const pieces = g.children as THREE.Mesh[];
  [[a, b], [b, c]].forEach(([p, q], i) => {
    const m = pieces[i];
    const dir = tmp.subVectors(q, p);
    const len = dir.length();
    m.position.copy(p).addScaledVector(dir, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(AXIS.Y, dir.normalize());
  });
}
