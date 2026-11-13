import * as THREE from 'three';

/**
 * The downloaded character models (Avaturn avatars: a Mixamo skeleton with finger bones, ARKit face
 * blendshapes), converted to GLB by scratch tooling and kept in ./models (git-ignored: third-party
 * licences, see the preview's credits). This is the posing kit the cutscene drives them with:
 * rest pose bookkeeping, turns about the body's own axes, aiming a bone, a two-bone arm, faces.
 *
 * Body space: the model faces +z, her left is +x, y up (the same as the script's body space).
 */
// (built from the module's own address: Vite would rewrite a URL template with import.meta into a one-level glob)
const MODELS = import.meta.url.replace(/[^/]*$/, '') + 'models/';
export const modelUrl = (path: string) => MODELS + path;

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const tq = new THREE.Quaternion();
const tq2 = new THREE.Quaternion();
const tm = new THREE.Matrix4();
const tm2 = new THREE.Matrix4();
const tv = new THREE.Vector3();
const tv2 = new THREE.Vector3();
const tv3 = new THREE.Vector3();

export interface MaterialSpec {
  map?: THREE.Texture;
  normal?: THREE.Texture;
  color?: THREE.ColorRepresentation;
  rough?: number;
  /** skin: a soft sheen at grazing angles */
  skin?: boolean;
  /** cut-out cards (hair) */
  cutout?: boolean;
  /** see-through gloss (the cornea over the eye) */
  glass?: boolean;
}

/** textures loaded through R3F's cache are shared; colour maps are sRGB, everything else linear */
export function prepTextures(list: THREE.Texture[], srgb: boolean[]) {
  list.forEach((t, i) => {
    t.colorSpace = srgb[i] ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = 4;
    t.needsUpdate = true;
  });
}

const maps = (s: MaterialSpec) => ({ ...(s.map ? { map: s.map } : {}), ...(s.normal ? { normalMap: s.normal } : {}) });

export function makeMaterial(s: MaterialSpec): THREE.Material {
  if (s.glass) return new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.02, transmission: 0, transparent: true, opacity: 0.12, depthWrite: false });
  if (s.skin) {
    return new THREE.MeshPhysicalMaterial({
      ...maps(s), color: s.color ?? '#ffffff', roughness: s.rough ?? 0.55,
      sheen: 0.35, sheenColor: new THREE.Color('#b8644a'), sheenRoughness: 0.45, normalScale: new THREE.Vector2(0.8, 0.8),
      // a faint oily film over the skin, and a softer specular than plastic
      clearcoat: 0.07, clearcoatRoughness: 0.42, specularIntensity: 0.55,
    });
  }
  if (s.cutout) {
    // hair (and lashes): strands catch a soft sheen along their length instead of a flat diffuse
    return new THREE.MeshPhysicalMaterial({
      ...maps(s), color: s.color ?? '#ffffff', roughness: s.rough ?? 0.62, alphaTest: 0.42, side: THREE.DoubleSide,
      sheen: 0.55, sheenColor: new THREE.Color('#5a4a3c'), sheenRoughness: 0.32, specularIntensity: 0.6,
    });
  }
  return new THREE.MeshStandardMaterial({
    ...maps(s), color: s.color ?? '#ffffff', roughness: s.rough ?? 0.85,
    alphaTest: s.cutout ? 0.42 : 0, transparent: false, side: s.cutout ? THREE.DoubleSide : THREE.FrontSide,
  });
}

/** a posable instance of a skinned model */
export class Rig {
  readonly bones: Record<string, THREE.Bone> = {};
  readonly meshes: Record<string, THREE.SkinnedMesh> = {};
  private restQ = new Map<THREE.Bone, THREE.Quaternion>();
  private restP = new Map<THREE.Bone, THREE.Vector3>();
  private restS = new Map<THREE.Bone, THREE.Vector3>();
  /** each bone's rotation in body space at rest */
  private restBQ = new Map<THREE.Bone, THREE.Quaternion>();
  private morphs: { mesh: THREE.SkinnedMesh; dict: Record<string, number> }[] = [];

  /** `model` is the loaded scene; `body` is the group it sits in (placed and turned by the caller) */
  constructor(readonly model: THREE.Object3D, readonly body: THREE.Object3D) {
    model.traverse((o) => {
      if ((o as THREE.Bone).isBone && !this.bones[o.name]) this.bones[o.name] = o as THREE.Bone;
      if ((o as THREE.SkinnedMesh).isSkinnedMesh) {
        const m = o as THREE.SkinnedMesh;
        this.meshes[m.name] = m;
        m.frustumCulled = false; // skinned bounds are the bind pose's; she moves well outside it
        if (m.morphTargetDictionary) this.morphs.push({ mesh: m, dict: m.morphTargetDictionary });
      }
    });
    model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
    for (const b of Object.values(this.bones)) {
      this.restQ.set(b, b.quaternion.clone());
      this.restP.set(b, b.position.clone());
      this.restS.set(b, b.scale.clone());
      const q = new THREE.Quaternion();
      tm.multiplyMatrices(inv, b.matrixWorld).decompose(tv, q, tv2);
      this.restBQ.set(b, q);
    }
  }

  bone(name: string) {
    const b = this.bones[name];
    if (!b) throw new Error(`no bone ${name}`);
    return b;
  }

  /** back to the bind pose (every frame, before posing) */
  reset() {
    for (const b of Object.values(this.bones)) {
      b.quaternion.copy(this.restQ.get(b)!);
      b.position.copy(this.restP.get(b)!);
      b.scale.copy(this.restS.get(b)!);
    }
  }

  restPos(name: string) {
    return this.restP.get(this.bone(name))!;
  }

  /** turn a bone about one of the body's axes (as it was at rest), on top of its current pose */
  turn(name: string, axis: THREE.Vector3, angle: number) {
    if (!angle) return;
    const b = this.bone(name);
    const local = tv.copy(axis).applyQuaternion(tq.copy(this.restBQ.get(b)!).invert());
    b.quaternion.multiply(tq2.setFromAxisAngle(local.normalize(), angle));
  }

  /** set a bone's world rotation (its parent's world matrix must be current) */
  setWorldQ(b: THREE.Bone, q: THREE.Quaternion) {
    b.parent!.getWorldQuaternion(tq);
    b.quaternion.copy(tq.invert().multiply(q));
  }

  /** the bone's rest rotation in world terms right now (body placement × rest) */
  restWorldQ(b: THREE.Bone, out: THREE.Quaternion) {
    this.body.getWorldQuaternion(out);
    this.model.getWorldQuaternion(tq2);
    return out.copy(tq2).multiply(this.restBQ.get(b)!);
  }

  /**
   * swing `b` so the direction it had at rest towards `restDirBody` (body space) now points along
   * `dirW` (world), keeping the rest `restUpBody` as close to `upW` as it can
   */
  aim(b: THREE.Bone, restDirBody: THREE.Vector3, restUpBody: THREE.Vector3, dirW: THREE.Vector3, upW: THREE.Vector3) {
    // (dirW/upW may be this module's scratch vectors: use them before anything overwrites them)
    const to = basis(dirW, upW, tm2);
    const bodyQ = this.body.getWorldQuaternion(tq);
    const from = basis(tv.copy(restDirBody).applyQuaternion(bodyQ), tv2.copy(restUpBody).applyQuaternion(bodyQ), tm);
    const delta = new THREE.Quaternion().setFromRotationMatrix(to.multiply(from.transpose()));
    const rest = this.restWorldQ(b, new THREE.Quaternion());
    this.setWorldQ(b, delta.multiply(rest));
  }

  /**
   * a two-bone limb (upper, lower, end) reaching `target` (world) with the joint bulging towards
   * `pole` (world direction); returns where the end really is
   */
  limb(upper: string, lower: string, end: string, target: THREE.Vector3, pole: THREE.Vector3, restBend: THREE.Vector3) {
    const U = this.bone(upper);
    const Lw = this.bone(lower);
    const E = this.bone(end);
    const a = this.restP.get(Lw)!.length() * this.modelScale();
    const bl = this.restP.get(E)!.length() * this.modelScale();
    const S = U.getWorldPosition(new THREE.Vector3());
    const d = new THREE.Vector3().subVectors(target, S);
    const len = THREE.MathUtils.clamp(d.length(), Math.abs(a - bl) + 1e-3, (a + bl) * 0.999);
    const dir = d.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + len * len - bl * bl) / (2 * a * len), -1, 1);
    const u = tv3.copy(pole).addScaledVector(dir, -pole.dot(dir));
    if (u.lengthSq() < 1e-8) u.set(0, -1, 0).addScaledVector(dir, dir.y);
    u.normalize();
    const elbow = S.clone().addScaledVector(dir, cosA * a).addScaledVector(u, Math.sqrt(1 - cosA * cosA) * a);
    const wrist = S.clone().addScaledVector(dir, len);
    // rest directions in body space: along each bone, and the way its joint bulges when it bends
    const upRest = this.bodyDirOf(U, Lw);
    const loRest = this.bodyDirOf(Lw, E);
    this.aim(U, upRest, restBend, tv.subVectors(elbow, S).normalize(), u);
    U.updateMatrixWorld(true);
    this.aim(Lw, loRest, restBend, tv.subVectors(wrist, elbow).normalize(), u);
    Lw.updateMatrixWorld(true);
    return wrist;
  }

  /** body-space direction from bone `a` to its child `b` at rest */
  private bodyDirOf(a: THREE.Bone, b: THREE.Bone) {
    return b.userData.restDir ?? (b.userData.restDir = this.restP.get(b)!.clone().applyQuaternion(this.restBQ.get(a)!).normalize());
  }

  /** the model's own scale (bones are in model units) */
  private modelScale() {
    return this.model.getWorldScale(tv).x / this.body.getWorldScale(tv2).x;
  }

  /** a face blendshape, on every mesh that has it (head, lashes, teeth) */
  morph(name: string, v: number) {
    for (const { mesh, dict } of this.morphs) {
      const i = dict[name];
      if (i !== undefined) mesh.morphTargetInfluences![i] = v;
    }
  }

  /** world position of a bone */
  at(name: string, out = new THREE.Vector3()) {
    return this.bone(name).getWorldPosition(out);
  }
}

/** an orthonormal basis (dir, up⊥, dir×up) as columns */
function basis(dir: THREE.Vector3, up: THREE.Vector3, out: THREE.Matrix4) {
  const d = new THREE.Vector3().copy(dir).normalize();
  const u = new THREE.Vector3().copy(up).addScaledVector(d, -up.dot(d));
  if (u.lengthSq() < 1e-8) u.set(0, 0, 1).addScaledVector(d, -d.z);
  u.normalize();
  const w = new THREE.Vector3().crossVectors(d, u);
  return out.makeBasis(d, u, w);
}

export const AXIS = { X, Y, Z: new THREE.Vector3(0, 0, 1) };

/** seconds-based blink: a quick close and open every few seconds */
export function blinkAt(t: number, seed: number) {
  const period = 3.1 + (seed % 3) * 0.9;
  const ph = (t + seed * 1.7) % period;
  return ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
}
