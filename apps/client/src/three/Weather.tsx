import { useFrame } from '@react-three/fiber';
import type { LevelDef } from '@nishi/shared';
import { useMemo } from 'react';
import * as THREE from 'three';
import { runtime } from '../game/runtime';

const AREA = 46;
const HEIGHT = 22;

/** GPU rain: streaks wrap around the camera; discarded under roofs (canopy, building, carriage). */
export function Rain({ count, level }: { count: number; level: LevelDef }) {
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(count * 2 * 3);
    const seed = new Float32Array(count * 2);
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = Math.random() * AREA;
      const y = Math.random() * HEIGHT;
      const z = Math.random() * AREA;
      const sd = Math.random();
      for (let k = 0; k < 2; k++) {
        pos.set([x, y, z], (i * 2 + k) * 3);
        seed[i * 2 + k] = sd;
        end[i * 2 + k] = k;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const roofs = level.roofs.slice(0, 6).map((r) => new THREE.Vector4(r.minX, r.minZ, r.maxX, r.maxZ));
    while (roofs.length < 6) roofs.push(new THREE.Vector4(0, 0, 0, 0));
    const m = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uRoofs: { value: roofs }, uFlash: { value: 0 } },
      vertexShader: /* glsl */ `
        uniform float uTime; uniform vec3 uCam;
        attribute float aSeed; attribute float aEnd;
        varying vec3 vWorld; varying float vEnd;
        void main() {
          float speed = 13.0 + aSeed * 5.0;
          vec3 p = position;
          p.y = mod(p.y - uTime * speed, ${HEIGHT.toFixed(1)});
          p.xz = mod(p.xz - uCam.xz + ${(AREA / 2).toFixed(1)}, ${AREA.toFixed(1)}) + uCam.xz - ${(AREA / 2).toFixed(1)};
          p.y += uCam.y - 8.0;
          p += aEnd * vec3(0.04, 0.38, 0.02);
          vWorld = p; vEnd = aEnd;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec4 uRoofs[6]; uniform float uFlash;
        varying vec3 vWorld; varying float vEnd;
        void main() {
          for (int i = 0; i < 6; i++) {
            vec4 r = uRoofs[i];
            if (vWorld.x > r.x && vWorld.x < r.z && vWorld.z > r.y && vWorld.z < r.w && vWorld.y < 5.3) discard;
          }
          if (vWorld.y < -1.25) discard;
          float a = 0.16 + vEnd * 0.14 + uFlash * 0.35;
          gl_FragColor = vec4(vec3(0.62, 0.68, 0.78) * (0.8 + uFlash), a);
        }`,
    });
    return { geo: g, mat: m };
  }, [count, level]);

  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
    (mat.uniforms.uCam.value as THREE.Vector3).set(runtime.eye.x, runtime.eye.y, runtime.eye.z);
  });

  return <lineSegments geometry={geo} material={mat} frustumCulled={false} />;
}

/** low drifting ground fog sheets */
export function GroundFog() {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vW; varying vec2 vUv;
          void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vW; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
            return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
          void main() {
            vec2 p = vW * 0.12 + vec2(uTime * 0.05, uTime * 0.02);
            float v = n(p) * 0.6 + n(p * 2.3 - uTime * 0.03) * 0.4;
            float edge = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x) * smoothstep(0.0, 0.15, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
            gl_FragColor = vec4(vec3(0.42, 0.46, 0.52), smoothstep(0.35, 0.9, v) * 0.16 * edge);
          }`,
      }),
    [],
  );
  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });
  const sheets: [number, number, number, number, number][] = [
    [3, -0.85, 13.5, 110, 12],
    [0, 0.35, 4, 84, 9],
    [0, 0.55, 4.5, 84, 9],
    [-10, 0.3, -7, 60, 14],
    [0, -3.1, 3.5, 72, 4],
  ];
  return (
    <group>
      {sheets.map(([x, y, z, w, d], i) => (
        <mesh key={i} material={mat} position={[x, y, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[w, d]} />
        </mesh>
      ))}
    </group>
  );
}

/** distant city glow and silhouettes beyond the boundary fence */
export function Horizon() {
  const glow = useMemo(
    () =>
      new THREE.ShaderMaterial({
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; void main(){
          float g = pow(1.0 - vUv.y, 3.0);
          vec3 c = mix(vec3(0.012,0.016,0.024), vec3(0.22,0.12,0.06), g);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    [],
  );
  const towers = useMemo(() => {
    const out: [number, number, number, number][] = [];
    let x = -120;
    while (x < 140) {
      const w = 6 + Math.random() * 14;
      out.push([x + w / 2, 8 + Math.random() * 26, 90 + Math.random() * 40, w]);
      x += w + Math.random() * 6;
    }
    return out;
  }, []);
  return (
    <group>
      <mesh material={glow} position={[0, 30, 160]}>
        <planeGeometry args={[600, 90]} />
      </mesh>
      <mesh material={glow} position={[0, 30, -160]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[600, 90]} />
      </mesh>
      {towers.map(([x, h, z, w], i) => (
        <mesh key={i} position={[x, h / 2 - 2, z]}>
          <boxGeometry args={[w, h, 6]} />
          <meshBasicMaterial color="#040507" />
        </mesh>
      ))}
      {/* trees and electricity poles behind the fence */}
      {Array.from({ length: 26 }, (_, i) => (
        <mesh key={`t${i}`} position={[-60 + i * 5 + Math.sin(i * 7) * 2, 3, 24 + Math.cos(i * 3) * 3]}>
          <coneGeometry args={[2.4 + (i % 3), 9 + (i % 4) * 2, 6]} />
          <meshBasicMaterial color="#030405" />
        </mesh>
      ))}
    </group>
  );
}
