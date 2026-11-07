import { useMemo } from 'react';
import * as THREE from 'three';

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
