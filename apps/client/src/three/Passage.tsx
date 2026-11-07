import { Rng } from '@nishi/shared';
import { useMemo } from 'react';
import * as THREE from 'three';
import { cachedTextures } from './textures';

/**
 * Set dressing for the underground passage (x -30..30, floor y -3.5, walls at z 2 and z 5).
 * Everything here is deliberately one-sided and irregular so the tunnel never reads as a mirror:
 * service pipes and a sagging cable run only along the north wall, the south wall has a painted dado
 * that is peeling in places, tiles have fallen off in patches, and debris collects where water pools.
 * Purely visual: nothing here collides, and it is all static so StaticBatch merges it.
 */
const FLOOR = -3.5;
const NORTH = 2.0; // inner face of the north wall
const SOUTH = 5.0; // inner face of the south wall
const CEIL = -0.6;

type V3 = [number, number, number];

function catenary(a: THREE.Vector3, b: THREE.Vector3, sag: number, n = 12) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= sag * 4 * t * (1 - t);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function PassageDetail() {
  const lib = cachedTextures();
  const mats = useMemo(
    () => ({
      pipe: new THREE.MeshStandardMaterial({ color: '#3b3a36', roughness: 0.55, metalness: 0.6, map: lib?.rust?.map }),
      bracket: new THREE.MeshStandardMaterial({ color: '#1d1c1a', roughness: 0.6, metalness: 0.7 }),
      cable: new THREE.MeshStandardMaterial({ color: '#0d0d0d', roughness: 0.7 }),
      tray: new THREE.MeshStandardMaterial({ color: '#2a2c2b', roughness: 0.5, metalness: 0.65, map: lib?.metal?.map }),
      dado: new THREE.MeshStandardMaterial({ color: '#4a5a46', roughness: 0.85, map: lib?.plaster?.map }),
      dadoLine: new THREE.MeshStandardMaterial({ color: '#2b1c14', roughness: 0.8 }),
      brick: new THREE.MeshStandardMaterial({ color: '#8a6a58', roughness: 0.95, map: lib?.brick?.map, normalMap: lib?.brick?.normalMap }),
      shard: new THREE.MeshStandardMaterial({ color: '#b9b8ae', roughness: 0.35 }),
      rubble: new THREE.MeshStandardMaterial({ color: '#4d4a44', roughness: 0.95, map: lib?.concrete?.map }),
      panel: new THREE.MeshStandardMaterial({ color: '#77756c', roughness: 0.85, map: lib?.ceiling?.map, side: THREE.DoubleSide }),
      bin: new THREE.MeshStandardMaterial({ color: '#23402f', roughness: 0.6, metalness: 0.4, map: lib?.rust?.map }),
      tube: new THREE.MeshStandardMaterial({ color: '#9aa39f', roughness: 0.3, emissive: '#000000' }),
      poster: new THREE.MeshStandardMaterial({ color: '#8f7f62', roughness: 0.95, map: lib?.plaster?.map, side: THREE.DoubleSide }),
    }),
    [lib],
  );

  const layout = useMemo(() => {
    const r = new Rng(1313);
    // north wall: two service pipes on irregularly spaced brackets, broken off near the east stairs
    const brackets: number[] = [];
    for (let x = -29; x < 21; x += r.range(1.7, 3.2)) brackets.push(x);
    // a sagging cable hung between every other bracket, dropping lower in a few spans
    const cables = brackets.slice(0, -1).filter((_, i) => i % 2 === 0).map((x, i) => {
      const x2 = brackets[Math.min(brackets.length - 1, brackets.indexOf(x) + 2)];
      return catenary(new THREE.Vector3(x, -1.0, NORTH + 0.1), new THREE.Vector3(x2, -1.0, NORTH + 0.1), i % 3 === 1 ? 0.75 : r.range(0.12, 0.35));
    });
    // fallen tiles on the north wall, showing the brick behind
    const patches = Array.from({ length: 8 }, () => ({
      x: r.range(-28, 28),
      y: FLOOR + r.range(0.4, 2.2),
      w: r.range(0.5, 1.7),
      h: r.range(0.35, 1.1),
    }));
    // south wall dado: painted band with peeled gaps
    const dado: [number, number][] = [];
    for (const [a, b] of [[-30, -4], [2, 30]] as const) {
      let x = a;
      while (x < b) {
        const len = r.range(2.5, 7);
        dado.push([x, Math.min(b, x + len)]);
        x += len + (r.chance(0.45) ? r.range(0.4, 1.8) : 0);
      }
    }
    const shards: { p: V3; r: number; s: number }[] = patches.flatMap((pt) =>
      Array.from({ length: 5 + r.int(0, 6) }, () => ({
        p: [pt.x + r.range(-0.8, 0.8), FLOOR + 0.008, NORTH + r.range(0.08, 0.9)] as V3,
        r: r.range(0, Math.PI),
        s: r.range(0.06, 0.13),
      })),
    );
    const rubble: { p: V3; s: V3; r: number }[] = [];
    for (const cx of [-19.5, 7.5, 23]) {
      for (let i = 0; i < 7; i++) {
        rubble.push({ p: [cx + r.range(-0.9, 0.9), FLOOR + 0.04, NORTH + r.range(0.12, 0.7)], s: [r.range(0.08, 0.22), r.range(0.05, 0.14), r.range(0.08, 0.2)], r: r.range(0, 3) });
      }
    }
    return { brackets, cables, patches, dado, shards, rubble };
  }, []);

  const cableGeos = useMemo(() => layout.cables.map((c) => new THREE.TubeGeometry(c, 20, 0.012, 5, false)), [layout]);
  const pipeLen = 21 - -29.5;
  const pipeX = (-29.5 + 21) / 2;

  return (
    <group name="passage-detail">
      {/* service pipes: north wall only, ending in a snapped stub near the east stairs */}
      {[[-1.05, 0.07, 0.045], [-1.32, 0.16, 0.06]].map(([y, dz, rad]) => (
        <mesh key={y} position={[pipeX, y, NORTH + dz]} rotation={[0, 0, Math.PI / 2]} material={mats.pipe}>
          <cylinderGeometry args={[rad, rad, pipeLen, 8]} />
        </mesh>
      ))}
      <mesh position={[21.2, -1.55, NORTH + 0.16]} rotation={[0, 0, 0.5]} material={mats.pipe}>
        <cylinderGeometry args={[0.06, 0.06, 0.6, 8]} />
      </mesh>
      {layout.brackets.map((x) => (
        <mesh key={x} position={[x, -1.2, NORTH + 0.08]} material={mats.bracket}>
          <boxGeometry args={[0.05, 0.42, 0.16]} />
        </mesh>
      ))}
      {cableGeos.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.cable} />
      ))}
      {/* cable tray under the ceiling, north side, west half only */}
      <mesh position={[-11, CEIL - 0.16, NORTH + 0.45]} material={mats.tray}>
        <boxGeometry args={[36, 0.05, 0.4]} />
      </mesh>
      <mesh position={[-11, CEIL - 0.12, NORTH + 0.25]} material={mats.tray}>
        <boxGeometry args={[36, 0.1, 0.02]} />
      </mesh>
      {/* tiles fallen away: brick showing through */}
      {layout.patches.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, NORTH + 0.006]} material={mats.brick}>
          <planeGeometry args={[p.w, p.h]} />
        </mesh>
      ))}
      {/* south wall: institutional green dado, peeling */}
      {layout.dado.map(([a, b], i) => (
        <group key={i}>
          <mesh position={[(a + b) / 2, FLOOR + 0.62, SOUTH - 0.006]} rotation={[0, Math.PI, 0]} material={mats.dado}>
            <planeGeometry args={[b - a, 1.24]} />
          </mesh>
          <mesh position={[(a + b) / 2, FLOOR + 1.255, SOUTH - 0.008]} rotation={[0, Math.PI, 0]} material={mats.dadoLine}>
            <planeGeometry args={[b - a, 0.035]} />
          </mesh>
        </group>
      ))}
      {/* two torn notices on the south wall */}
      {[[-17.2, -1.9, 0.08], [11.6, -2.05, -0.12]].map(([x, y, rz]) => (
        <mesh key={x} position={[x, y, SOUTH - 0.012]} rotation={[0, Math.PI, rz]} material={mats.poster}>
          <planeGeometry args={[0.62, 0.85]} />
        </mesh>
      ))}
      {/* floor: tile shards under the bare patches, rubble heaps, a fallen ceiling panel, a toppled bin */}
      {layout.shards.map((s, i) => (
        <mesh key={i} position={s.p} rotation={[-Math.PI / 2, 0, s.r]} material={mats.shard}>
          <planeGeometry args={[s.s, s.s * 0.8]} />
        </mesh>
      ))}
      {layout.rubble.map((s, i) => (
        <mesh key={i} position={s.p} rotation={[s.r, s.r * 1.7, 0]} scale={s.s} material={mats.rubble}>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}
      <mesh position={[13.4, FLOOR + 0.09, 3.9]} rotation={[-Math.PI / 2 + 0.12, 0.08, 0.5]} material={mats.panel}>
        <planeGeometry args={[1.2, 0.6]} />
      </mesh>
      <mesh position={[-23.2, FLOOR + 0.2, 4.55]} rotation={[0, 0.4, Math.PI / 2]} material={mats.bin}>
        <cylinderGeometry args={[0.2, 0.17, 0.62, 12, 1, true]} />
      </mesh>
      {/* a dead tube fitting hanging by one end over the middle of the walkway */}
      <group position={[4.6, CEIL - 0.05, 3.2]} rotation={[0, 0.3, -0.75]}>
        <mesh position={[0.6, 0, 0]} rotation={[0, 0, Math.PI / 2]} material={mats.tube}>
          <cylinderGeometry args={[0.025, 0.025, 1.2, 6]} />
        </mesh>
        <mesh position={[0.6, 0.05, 0]} material={mats.bracket}>
          <boxGeometry args={[1.25, 0.05, 0.1]} />
        </mesh>
      </group>
    </group>
  );
}
