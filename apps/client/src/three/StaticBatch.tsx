import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching for hand-built scenery.
 *
 * The station is assembled from ~1,000 small meshes with their own materials, which costs a draw call
 * (and often a shader/state switch) each. Shortly after mount this component watches its children,
 * keeps anything that moved between two snapshots (fans, flames, swinging lamps) as-is, and merges the
 * rest into one mesh per look-alike material per 16 m cell — a few dozen draw calls instead of a
 * thousand, while still letting the camera frustum cull far cells.
 *
 * Opt a mesh out with `userData.dynamic = true`. Materials with a non-black emissive colour are animated
 * by the game, so they are only merged with meshes that share the very same material instance.
 */
const CELL = 16;
const SNAP_A = 2;
const SNAP_B = 40;

const MAT_PROPS = [
  'type', 'transparent', 'opacity', 'side', 'alphaTest', 'depthWrite', 'depthTest', 'polygonOffset', 'polygonOffsetFactor',
  'polygonOffsetUnits', 'vertexColors', 'flatShading', 'roughness', 'metalness', 'envMapIntensity', 'fog', 'toneMapped',
  'wireframe', 'blending', 'colorWrite', 'normalScale', 'bumpScale', 'aoMapIntensity', 'emissiveIntensity',
  'clearcoat', 'clearcoatRoughness', 'transmission', 'thickness', 'ior', 'sheen', 'specularIntensity', 'iridescence', 'shininess',
] as const;
const MAP_PROPS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap', 'emissiveMap', 'bumpMap', 'envMap', 'lightMap'] as const;

function materialKey(m: THREE.Material): string {
  const any = m as unknown as Record<string, unknown>;
  const emissive = any.emissive as THREE.Color | undefined;
  if (m instanceof THREE.ShaderMaterial || (emissive && emissive.r + emissive.g + emissive.b > 0) || m.userData.unique) return m.uuid;
  const parts: unknown[] = [];
  for (const k of MAT_PROPS) {
    const v = any[k];
    parts.push(v instanceof THREE.Vector2 ? `${v.x},${v.y}` : v);
  }
  const color = any.color as THREE.Color | undefined;
  parts.push(color ? color.getHexString() : '-');
  for (const k of MAP_PROPS) parts.push((any[k] as THREE.Texture | null | undefined)?.uuid ?? '-');
  return parts.join('|');
}

function attributeKey(g: THREE.BufferGeometry) {
  return Object.keys(g.attributes)
    .sort()
    .map((k) => `${k}${g.attributes[k].itemSize}`)
    .join(',') + (g.index ? ':i' : ':n');
}

function isCandidate(o: THREE.Object3D): o is THREE.Mesh {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (Array.isArray(m.material) || m.morphTargetInfluences || o.userData.dynamic) return false;
  if (m.material instanceof THREE.ShaderMaterial) return false;
  // a hidden ancestor (or self) means something toggles it: leave it alone
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return !!m.geometry?.attributes.position;
}

export function StaticBatch({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const root = useRef<THREE.Group>(null);
  const scene = useThree((s) => s.scene);
  const state = useRef({ frame: 0, done: false, snap: new Map<THREE.Mesh, THREE.Matrix4>(), out: null as THREE.Group | null });

  useEffect(
    () => () => {
      const out = state.current.out;
      if (!out) return;
      scene.remove(out);
      out.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.dispose());
    },
    [scene],
  );

  useFrame(() => {
    const s = state.current;
    if (!enabled || s.done || !root.current) return;
    s.frame++;
    if (s.frame === SNAP_A) {
      root.current.updateMatrixWorld(true);
      root.current.traverse((o) => {
        if (isCandidate(o)) s.snap.set(o, o.matrixWorld.clone());
      });
      return;
    }
    if (s.frame < SNAP_B) return;
    s.done = true;
    root.current.updateMatrixWorld(true);

    const groups = new Map<string, { mat: THREE.Material; cast: boolean; receive: boolean; order: number; meshes: THREE.Mesh[] }>();
    const center = new THREE.Vector3();
    for (const [mesh, before] of s.snap) {
      if (!mesh.parent || !isCandidate(mesh) || !mesh.matrixWorld.equals(before)) continue;
      const g = mesh.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      center.copy(g.boundingSphere!.center).applyMatrix4(mesh.matrixWorld);
      const cell = `${Math.floor(center.x / CELL)},${Math.floor(center.z / CELL)}`;
      const mat = mesh.material as THREE.Material;
      const key = `${materialKey(mat)}#${attributeKey(g)}#${mesh.castShadow ? 1 : 0}${mesh.receiveShadow ? 1 : 0}#${mesh.renderOrder}#${cell}`;
      let grp = groups.get(key);
      if (!grp) groups.set(key, (grp = { mat, cast: mesh.castShadow, receive: mesh.receiveShadow, order: mesh.renderOrder, meshes: [] }));
      grp.meshes.push(mesh);
    }

    const out = new THREE.Group();
    out.name = 'static-batch';
    out.matrixAutoUpdate = false;
    let merged = 0;
    for (const grp of groups.values()) {
      if (grp.meshes.length < 2) continue;
      // mirrored transforms flip winding; merging would turn those faces inside out
      if (grp.meshes.some((m) => m.matrixWorld.determinant() < 0)) continue;
      const geos = grp.meshes.map((m) => {
        const c = m.geometry.clone();
        c.applyMatrix4(m.matrixWorld);
        return c;
      });
      const geo = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      if (!geo) continue;
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, grp.mat);
      mesh.castShadow = grp.cast;
      mesh.receiveShadow = grp.receive;
      mesh.renderOrder = grp.order;
      mesh.matrixAutoUpdate = false;
      out.add(mesh);
      for (const m of grp.meshes) {
        m.visible = false;
        m.matrixAutoUpdate = false;
      }
      merged += grp.meshes.length;
    }
    scene.add(out);
    s.out = out;
    s.snap.clear();
    if (import.meta.env.DEV) console.info(`[static-batch] merged ${merged} meshes into ${out.children.length}`);
  });

  return <group ref={root}>{children}</group>;
}
