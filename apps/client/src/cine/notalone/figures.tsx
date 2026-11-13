import { useFrame, useLoader } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { avatarMaterials, dressAvatar, useAditiModel } from './aditi';
import { AXIS, makeMaterial, modelUrl, prepTextures, type Rig } from './avatar';

/**
 * The two of them in the lit window upstairs, holding hands.
 *
 * Her mother: the downloaded "Indian Woman in Saree" avatar, standing still, her head bowed a
 * little towards the street, watching Aditi. She does not blink.
 *
 * The child is Aditi at seven: the same face (the same avatar, a child's size and proportions: a
 * bigger head on a small body), in a faded school uniform. Head bowed, turned up to her mother;
 * then she turns to the glass, lifts her face and smiles. The smile is all mouth: her eyes stay
 * wide and still, and never leave Aditi.
 */
export interface ChildDrive {
  /** 0 head bowed, 1 lifted, looking straight out */
  lift: number;
  /** 0..1 */
  smile: number;
  /** 0 turned to her mother, 1 turned to the glass */
  turn: number;
}

export interface FiguresDrive {
  mother: THREE.Vector3;
  child: THREE.Vector3;
  childDrive: ChildDrive;
  /** where Aditi's eyes are: both of them watch her */
  watch: THREE.Vector3;
  /** the timeline's clock: every movement is a function of it, so the preview pauses and scrubs */
  time: number;
}

const MA_TEX = ['body.jpg', 'head.jpg', 'eyes_brown.jpg', 'hair.png', 'saree.jpg'];
const CHILD_SCALE = 0.79;
const CHILD_YAW = 0.45;
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();

/** curl a hand's fingers (rest: palm down, fingers out along ±x) */
function curl(rig: Rig, side: 'Left' | 'Right', k: number) {
  const s = side === 'Left' ? -1 : 1;
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let j = 1; j <= 3; j++) rig.turn(`${side}Hand${f}${j}`, AXIS.Z, s * k * (j === 1 ? 0.9 : 1.1));
  rig.turn(`${side}HandThumb2`, AXIS.Z, s * k * 0.4);
}

/** turn the neck and head towards a world point (shared over the neck bones); returns nothing */
function lookAt(rig: Rig, body: THREE.Object3D, target: THREE.Vector3, k = 1, extraPitch = 0) {
  const L = body.worldToLocal(tmp.copy(target)).sub(body.worldToLocal(rig.at('Head', tmp2)));
  const yaw = THREE.MathUtils.clamp(Math.atan2(L.x, L.z), -1.2, 1.2) * k;
  const pitch = THREE.MathUtils.clamp(Math.atan2(-L.y, Math.hypot(L.x, L.z)), -0.5, 0.9) * k + extraPitch;
  for (const [n, f] of [['Neck', 0.35], ['Neck1', 0.2], ['Neck2', 0.2], ['Head', 0.25]] as const) {
    rig.turn(n, AXIS.Y, yaw * f);
    rig.turn(n, AXIS.X, pitch * f);
  }
}

function eyesOn(rig: Rig, target: THREE.Vector3) {
  for (const e of ['LeftEye', 'RightEye']) {
    const b = rig.bone(e);
    rig.aim(b, AXIS.Z, AXIS.Y, tmp.subVectors(target, b.getWorldPosition(tmp2)).normalize(), tmp2.set(0, 1, 0));
  }
}

export function WindowFigures({ drive }: { drive: React.MutableRefObject<FiguresDrive> }) {
  const maGltf = useLoader(GLTFLoader, modelUrl('ma/ma.glb'));
  const maTex = useLoader(THREE.TextureLoader, MA_TEX.map((n) => modelUrl(`ma/${n}`)));
  useMemo(() => prepTextures(maTex, [true, true, true, true, true]), [maTex]);
  const { gltf, tex } = useAditiModel();

  const ma = useMemo(() => {
    const [body, head, eyes, hair, saree] = maTex;
    // the head and body normal maps are the same Avaturn base as Aditi's
    const a = avatarMaterials(tex);
    const mats: Record<string, THREE.Material> = {
      ...a,
      AvatarBody: makeMaterial({ map: body, normal: tex[1], skin: true }),
      AvatarHead: makeMaterial({ map: head, normal: tex[3], skin: true, rough: 0.5 }),
      AvatarLeftEyeball: makeMaterial({ map: eyes, rough: 0.2 }),
      AvatarRightEyeball: makeMaterial({ map: eyes, rough: 0.2 }),
      haircut: makeMaterial({ map: hair, normal: tex[7], cutout: true, rough: 0.55, color: '#6f6a66' }),
      outfit: makeMaterial({ map: saree, rough: 0.9 }),
    };
    return dressAvatar(maGltf.scene, mats, 0.97);
  }, [maGltf, maTex, tex]);

  const child = useMemo(() => {
    const uniform = {
      top: makeMaterial({ normal: tex[9], color: '#7f949c', rough: 0.95 }),
      bottom: makeMaterial({ normal: tex[11], color: '#262c33', rough: 0.95 }),
    };
    const c = dressAvatar(gltf.scene, avatarMaterials(tex, uniform), CHILD_SCALE);
    return c;
  }, [gltf, tex]);

  useFrame(() => {
    const d = drive.current;
    const t = d.time;
    // ── her mother: still; arms down; her left hand holding the child's ──
    {
      const { body, rig } = ma;
      body.position.copy(d.mother);
      body.rotation.y = 0;
      rig.reset();
      const br = Math.sin(t * Math.PI * 2 * 0.22);
      // her weight on her right hip, swaying very slowly, the breath in her chest and shoulders
      const sway = Math.sin(t * 0.83) * 0.6 + Math.sin(t * 0.37 + 1.3) * 0.4;
      rig.bone('Hips').position.x -= (0.012 + sway * 0.004) / 0.97;
      rig.turn('Hips', AXIS.Z, -0.025 - sway * 0.008);
      rig.turn('Spine', AXIS.Z, 0.018 + sway * 0.005);
      rig.turn('Spine1', AXIS.X, 0.04 + br * 0.008);
      rig.turn('Spine1', AXIS.Z, 0.008);
      rig.turn('Spine2', AXIS.X, 0.03 + br * 0.006);
      rig.turn('LeftShoulder', AXIS.Z, -br * 0.012);
      rig.turn('RightShoulder', AXIS.Z, br * 0.012);
      rig.turn('RightLeg', AXIS.X, 0.06);
      body.updateMatrixWorld(true);
      lookAt(rig, body, d.watch, 0.8, 0.12);
      body.updateMatrixWorld(true);
      rig.limb('RightArm', 'RightForeArm', 'RightHand', body.localToWorld(tmp.set(-0.2, 0.86, 0.04)), tmp2.set(-0.3, 0, -1), new THREE.Vector3(0, 0, -1));
      curl(rig, 'Right', 0.25);
      // reaching down to the child's raised hand between them
      const hold = d.mother.clone().lerp(d.child, 0.5).add(new THREE.Vector3(0, 0.74, 0.1));
      rig.limb('LeftArm', 'LeftForeArm', 'LeftHand', hold, new THREE.Vector3(0.6, 0, -1), new THREE.Vector3(0, 0, -1));
      curl(rig, 'Left', 0.75);
      eyesOn(rig, d.watch);
      rig.morph('browInnerUp', 0.12);
      rig.morph('mouthPressLeft', 0.2);
      rig.morph('mouthPressRight', 0.2);
    }
    // ── the child ──
    {
      const { body, rig } = child;
      const c = d.childDrive;
      body.position.copy(d.child);
      body.rotation.y = CHILD_YAW;
      rig.reset();
      // a child's proportions: the head large for the body, the neck short
      rig.bone('Head').scale.setScalar(1.22);
      rig.bone('Neck1').position.multiplyScalar(0.6);
      // a child's quick shallow breath; the smallest sway, stopping dead once she has turned
      const cb = Math.sin(t * Math.PI * 2 * 0.36);
      rig.turn('Spine1', AXIS.X, cb * 0.01);
      rig.turn('Spine2', AXIS.X, cb * 0.008);
      rig.turn('Spine', AXIS.Z, Math.sin(t * 0.9) * 0.012 * (1 - c.turn));
      body.updateMatrixWorld(true);
      // bowed: chin down, a little to one side, turned up towards her mother; then to the glass, lifted
      const pitch = THREE.MathUtils.lerp(0.62, -0.04, c.lift);
      const yaw = THREE.MathUtils.lerp(-0.85, 0, c.turn);
      const roll = THREE.MathUtils.lerp(0.1, -0.07, c.lift);
      for (const [n, f] of [['Neck', 0.4], ['Neck2', 0.25], ['Head', 0.35]] as const) {
        rig.turn(n, AXIS.Y, yaw * f);
        rig.turn(n, AXIS.X, pitch * f);
        rig.turn(n, AXIS.Z, roll * f);
      }
      body.updateMatrixWorld(true);
      // her right hand up in her mother's
      const hold = d.mother.clone().lerp(d.child, 0.5).add(new THREE.Vector3(0, 0.74, 0.1));
      rig.limb('RightArm', 'RightForeArm', 'RightHand', hold, new THREE.Vector3(-0.5, -0.3, -1), new THREE.Vector3(0, 0, -1));
      curl(rig, 'Right', 0.7);
      rig.limb('LeftArm', 'LeftForeArm', 'LeftHand', body.localToWorld(tmp.set(0.17, 0.62 / 1, 0.03)), tmp2.set(0.3, 0, -1), new THREE.Vector3(0, 0, -1));
      curl(rig, 'Left', 0.3);
      // eyes: down at the floor while bowed; on Aditi once she has turned to the glass
      body.updateMatrixWorld(true);
      if (c.turn > 0.4) eyesOn(rig, d.watch);
      rig.morph('mouthSmileLeft', c.smile * 0.95);
      rig.morph('mouthSmileRight', c.smile * 0.95);
      rig.morph('mouthPressLeft', c.smile * 0.25);
      rig.morph('mouthPressRight', c.smile * 0.25);
      rig.morph('eyeWideLeft', 0.15 + c.lift * 0.3);
      rig.morph('eyeWideRight', 0.15 + c.lift * 0.3);
      rig.morph('cheekSquintLeft', 0);
      rig.morph('cheekSquintRight', 0);
    }
  });

  return (
    <>
      <primitive object={ma.body} />
      <primitive object={child.body} />
    </>
  );
}
