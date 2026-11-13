import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blendPose, type HandPose } from './hand';

/**
 * The scanned female hand (a static photogrammetry mesh, a relaxed open right hand, centimetres,
 * fingers +y, palm +z, thumb +x), given a skeleton here: joint centres measured off the scan,
 * skin weights from the distance to each bone, so its fingers can take the same grips as before.
 *
 * It is built in the wrist frame the script poses hands in (wrist at the origin, fingers along -y,
 * palm +z, thumb on x = `thumb`): the left hand is the right one mirrored.
 */
const CM = 0.0102;
type V3 = [number, number, number];
const WRIST: V3 = [-1.1, 7.5, 1.9];
const ELBOW_SIDE: V3 = [-1.17, -2, 0.9];
// per finger (index, middle, ring, little): knuckle, middle joint, end joint, fingertip
const FINGERS: V3[][] = [
  [[2.6, 16.0, 1.1], [2.85, 20.2, 1.05], [3.1, 22.2, 2.1], [3.35, 23.7, 3.0]],
  [[0.5, 16.2, 1.0], [0.4, 21.2, 1.15], [0.5, 23.1, 2.95], [0.5, 24.4, 3.75]],
  [[-1.9, 16.0, 1.2], [-1.85, 19.7, 2.2], [-1.6, 21.6, 4.2], [-1.5, 22.85, 5.25]],
  [[-4.0, 15.8, 1.4], [-4.15, 18.6, 2.8], [-3.9, 19.85, 4.6], [-3.55, 20.45, 5.35]],
];
// the thumb: its root in the heel of the hand, the knuckle, the joint, the tip
const THUMB: V3[] = [[1.6, 8.9, 2.6], [3.6, 11.5, 2.8], [5.4, 14.9, 2.4], [6.9, 17.0, 2.0]];

const v = (p: V3) => new THREE.Vector3(p[0] - WRIST[0], p[1] - WRIST[1], p[2] - WRIST[2]).multiplyScalar(CM);

/** the curl of joint b (between segments a→b and b→c) towards the palm, measured in the y-z plane */
function curlOf(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const u = new THREE.Vector2(b.y - a.y, b.z - a.z);
  const w = new THREE.Vector2(c.y - b.y, c.z - b.z);
  return Math.atan2(u.x * w.y - u.y * w.x, u.dot(w));
}

export interface ScanHand {
  /** in the wrist frame: add to a group that is at her wrist, turned to the hand's frame */
  object: THREE.Object3D;
  /** forearm bone, turned to follow the real forearm relative to the hand */
  fore: THREE.Bone;
  pose(p: HandPose): void;
}

export function buildScanHand(source: THREE.BufferGeometry, mat: THREE.Material, thumbSide: 1 | -1): ScanHand {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'uv']) if (source.getAttribute(k)) g.setAttribute(k, source.getAttribute(k).clone());
  g.translate(-WRIST[0], -WRIST[1], -WRIST[2]);
  g.scale(CM, CM, CM);
  const geo = mergeVertices(g, 1e-6); // the scan's own smooth normals, shared vertices

  // bones: wrist (root), forearm; per finger three; thumb three
  const root = new THREE.Bone();
  root.name = 'wrist';
  const fore = new THREE.Bone();
  fore.name = 'fore';
  root.add(fore);
  const segs: { a: THREE.Vector3; b: THREE.Vector3; bone: number }[] = [];
  const bones: THREE.Bone[] = [root, fore];
  segs.push({ a: v(ELBOW_SIDE), b: new THREE.Vector3(), bone: 1 });
  const fingers: THREE.Bone[][] = [];
  const rest: { curl: number[]; spread: number }[] = [];
  const O = new THREE.Vector3();
  for (const f of FINGERS) {
    const P = f.map(v);
    // the palm from the wrist to this knuckle belongs to the hand
    segs.push({ a: O.clone(), b: P[0], bone: 0 });
    const chain: THREE.Bone[] = [];
    let parent = root;
    let parentAt = O;
    for (let j = 0; j < 3; j++) {
      const b = new THREE.Bone();
      b.position.copy(P[j]).sub(parentAt);
      parent.add(b);
      bones.push(b);
      segs.push({ a: P[j], b: P[j + 1], bone: bones.length - 1 });
      chain.push(b);
      parent = b;
      parentAt = P[j];
    }
    fingers.push(chain);
    rest.push({
      curl: [curlOf(O, P[0], P[1]), curlOf(P[0], P[1], P[2]), curlOf(P[1], P[2], P[3])],
      spread: Math.atan2(-(P[1].x - P[0].x), P[1].y - P[0].y),
    });
  }
  const T = THUMB.map(v);
  segs.push({ a: O.clone(), b: T[0], bone: 0 });
  const thumb: THREE.Bone[] = [];
  {
    let parent = root;
    let parentAt = O;
    for (let j = 0; j < 3; j++) {
      const b = new THREE.Bone();
      b.position.copy(T[j]).sub(parentAt);
      parent.add(b);
      bones.push(b);
      segs.push({ a: T[j], b: T[j + 1], bone: bones.length - 1 });
      thumb.push(b);
      parent = b;
      parentAt = T[j];
    }
  }

  // skin weights: the four nearest bones by distance to their segment, sharply falling off
  const pos = geo.getAttribute('position');
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const p = new THREE.Vector3();
  const seg = new THREE.Line3();
  const q = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    const best = new Map<number, number>();
    for (const s of segs) {
      seg.set(s.a, s.b);
      seg.closestPointToPoint(p, true, q);
      const d = Math.max(q.distanceTo(p), 0.0015);
      const w = 1 / d ** 6;
      best.set(s.bone, (best.get(s.bone) ?? 0) + w);
    }
    const top = [...best.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    const sum = top.reduce((s, [, w]) => s + w, 0);
    top.forEach(([b, w], k) => {
      si[i * 4 + k] = b;
      sw[i * 4 + k] = w / sum;
    });
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));

  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  mesh.add(root);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));

  // scan frame (fingers +y, palm +z, thumb +x) → wrist frame (fingers -y, palm +z, thumb on `thumbSide`)
  const mirror = new THREE.Group();
  mirror.scale.set(thumbSide === -1 ? 1 : -1, 1, 1);
  mirror.add(mesh);
  const object = new THREE.Group();
  object.rotation.z = Math.PI;
  object.add(mirror);

  // the thumb bends about the axis across its own direction, in the palm's plane
  const tDir = new THREE.Vector3().subVectors(T[2], T[0]).normalize();
  const bendAx = new THREE.Vector3().crossVectors(tDir, new THREE.Vector3(0, 0, 1)).normalize();
  const Z = new THREE.Vector3(0, 0, 1);
  const Xa = new THREE.Vector3(1, 0, 0);
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  return {
    object,
    fore,
    pose(hp) {
      const P = blendPose(hp);
      const tense = hp.tense ?? 0;
      for (let i = 0; i < 4; i++) {
        const [k0, k1, k2, spread] = P.fingers[i];
        const r = rest[i];
        const [b0, b1, b2] = fingers[i];
        b0.quaternion.setFromAxisAngle(Z, -spread * 0.9 - r.spread * 0.6).multiply(qa.setFromAxisAngle(Xa, k0 + tense - r.curl[0]));
        b1.quaternion.setFromAxisAngle(Xa, k1 + tense * 0.8 - r.curl[1]);
        b2.quaternion.setFromAxisAngle(Xa, k2 + tense * 0.5 - r.curl[2]);
      }
      // the scan's thumb rests about like 'relax'
      const [swing, lift, t1, t2] = P.thumb;
      thumb[0].quaternion.setFromAxisAngle(Z, (swing - 0.35) * 0.55).multiply(qb.setFromAxisAngle(bendAx, (lift - 0.3) * 0.7));
      thumb[1].quaternion.setFromAxisAngle(bendAx, (t1 - 0.15) * 0.9);
      thumb[2].quaternion.setFromAxisAngle(bendAx, (t2 - 0.2) * 0.9);
    },
  };
}
