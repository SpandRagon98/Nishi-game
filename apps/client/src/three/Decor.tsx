import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ageCanvas, signTexture } from './textures';
import { lightLevels } from './Lights';

type V3 = [number, number, number];

/** Instanced boxes: one draw call for many identical props. */
function Instanced({ items, size, material }: { items: { p: V3; r?: V3; s?: V3 }[]; size: V3; material: THREE.Material }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    items.forEach((it, i) => {
      e.set(...(it.r ?? [0, 0, 0]));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(...it.p), q, new THREE.Vector3(...(it.s ?? [1, 1, 1])));
      ref.current!.setMatrixAt(i, m);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} material={material} frustumCulled={false}>
      <boxGeometry args={size} />
    </instancedMesh>
  );
}

const mat = (color: string, rough = 0.8, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function Board({ tex, w, h, position, rotation = [0, 0, 0], emissive, both = false }: {
  tex: THREE.Texture; w: number; h: number; position: V3; rotation?: V3; emissive?: string; both?: boolean;
}) {
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.75, emissive: emissive ? new THREE.Color(emissive) : undefined, emissiveMap: emissive ? tex : undefined,
      emissiveIntensity: 0, side: both ? THREE.DoubleSide : THREE.FrontSide,
    }),
    [tex, emissive, both],
  );
  useFrame(() => {
    if (emissive) material.emissiveIntensity = (lightLevels.get('l_sign') ?? 0) * 0.9;
  });
  return (
    <mesh position={position} rotation={rotation} material={material}>
      <planeGeometry args={[w, h]} />
    </mesh>
  );
}

// ───────────────────────────── signage textures ─────────────────────────────

const YELLOW = '#e9bf12';

function stationBoard() {
  return signTexture(1024, 420, (c, w, h) => {
    c.fillStyle = YELLOW;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#111';
    c.lineWidth = 14;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 112px "Noto Serif Bengali", "Nirmala UI", "Vrinda", serif';
    c.fillText('নিশিপুর', w / 2, h * 0.26);
    c.font = '600 92px "Nirmala UI", "Mangal", "Noto Sans Devanagari", serif';
    c.fillText('निशिपुर', w / 2, h * 0.55);
    c.font = '700 84px "IBM Plex Sans", Arial, sans-serif';
    c.fillText('NISHIPUR JN.', w / 2, h * 0.82);
    ageCanvas(c, w, h, 0.4);
  });
}

function platformBoard() {
  return signTexture(512, 256, (c, w, h) => {
    c.fillStyle = YELLOW;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '700 150px "Noto Serif Bengali", "Nirmala UI", serif';
    c.fillText('০', w * 0.25, h * 0.52);
    c.font = '700 150px Arial, sans-serif';
    c.fillText('0', w * 0.75, h * 0.52);
    c.font = '600 30px Arial, sans-serif';
    c.fillText('PLATFORM  ·  প্ল্যাটফর্ম  ·  प्लेटफ़ॉर्म', w / 2, h * 0.9);
    ageCanvas(c, w, h, 0.45);
  });
}

function exitBoard() {
  return signTexture(768, 256, (c, w, h) => {
    c.fillStyle = YELLOW;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#111';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = '600 70px "Noto Serif Bengali", "Nirmala UI", serif';
    c.fillText('বাহির  ·  बाहर', w / 2, h * 0.33);
    c.font = '700 74px Arial, sans-serif';
    c.fillText('WAY OUT  ↑', w / 2, h * 0.75);
    ageCanvas(c, w, h, 0.35);
  });
}

function timetable() {
  return signTexture(1024, 640, (c, w, h) => {
    c.fillStyle = '#121313';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#d6cfae';
    c.font = '600 40px "IBM Plex Mono", monospace';
    c.fillText('ARRIVALS / DEPARTURES   আগমন / প্রস্থান', 36, 64);
    c.font = '30px "IBM Plex Mono", monospace';
    const rows = [
      ['03013', 'HOWRAH LOCAL', '01:40', 'DEPARTED'],
      ['03027', 'SEALDAH LOCAL', '02:25', 'DEPARTED'],
      ['03313', 'NISHIPUR SHUTTLE', '03:13', 'ARRIVING PF 0'],
      ['03313', 'NISHIPUR SHUTTLE', '03:13', 'ARRIVING PF 0'],
      ['03313', 'NISHIPUR SHUTTLE', '03:13', 'ARRIVING PF 0'],
      ['--', 'SERVICE SUSPENDED', '14.03.99', '--'],
    ];
    rows.forEach((r, i) => {
      const y = 140 + i * 78;
      c.fillStyle = i >= 2 && i <= 4 ? '#c7442f' : '#c9c2a0';
      c.fillText(r[0], 36, y);
      c.fillText(r[1], 190, y);
      c.fillText(r[2], 590, y);
      c.fillText(r[3], 730, y);
    });
    ageCanvas(c, w, h, 0.25);
  });
}

function poster(kind: 'shunya' | 'pickpocket') {
  return signTexture(512, 720, (c, w, h) => {
    c.fillStyle = kind === 'shunya' ? '#cdbf9a' : '#d8d2bf';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2a1d16';
    c.textAlign = 'center';
    if (kind === 'shunya') {
      c.font = '700 64px "Cormorant Garamond", Georgia, serif';
      c.fillText('PROJECT', w / 2, 110);
      c.font = '700 96px "Cormorant Garamond", Georgia, serif';
      c.fillText('SHUNYA', w / 2, 210);
      c.beginPath();
      c.arc(w / 2, 390, 120, 0, Math.PI * 2);
      c.lineWidth = 16;
      c.stroke();
      c.beginPath();
      c.arc(w / 2, 390, 30, 0, Math.PI * 2);
      c.fill();
      c.font = '28px Georgia, serif';
      c.fillText('Your voice is part of India.', w / 2, 570);
      c.fillText('Record your story at the booth', w / 2, 612);
      c.fillText('on Platform Zero.', w / 2, 650);
    } else {
      c.font = '700 54px Arial, sans-serif';
      c.fillText('BEWARE OF', w / 2, 140);
      c.fillText('PICKPOCKETS', w / 2, 210);
      c.font = '600 54px "Noto Serif Bengali", "Nirmala UI", serif';
      c.fillText('পকেটমার হইতে', w / 2, 360);
      c.fillText('সাবধান', w / 2, 440);
      c.font = '26px Arial, sans-serif';
      c.fillText('Eastern Railway · Nishipur Division', w / 2, 640);
    }
    ageCanvas(c, w, h, 0.55);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = 'rgba(10,8,6,0.75)';
      c.fillRect(Math.random() * w, Math.random() * h, 40 + Math.random() * 120, 6 + Math.random() * 30);
    }
  });
}

function clockFace() {
  return signTexture(256, 256, (c, w) => {
    const r = w / 2;
    c.fillStyle = '#e8e1cc';
    c.beginPath();
    c.arc(r, r, r - 4, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 8;
    c.strokeStyle = '#1a1a1a';
    c.stroke();
    c.fillStyle = '#1a1a1a';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.fillRect(r + Math.sin(a) * (r - 26) - 3, r - Math.cos(a) * (r - 26) - 9, 6, 18);
    }
    const hand = (a: number, len: number, wd: number) => {
      c.lineWidth = wd;
      c.beginPath();
      c.moveTo(r, r);
      c.lineTo(r + Math.sin(a) * len, r - Math.cos(a) * len);
      c.stroke();
    };
    // stopped at 3:13
    hand(((3 + 13 / 60) / 12) * Math.PI * 2, r * 0.5, 9);
    hand((13 / 60) * Math.PI * 2, r * 0.78, 6);
    ageCanvas(c, w, w, 0.3);
  });
}

function coachNumber() {
  return signTexture(512, 128, (c, w, h) => {
    c.fillStyle = 'rgba(0,0,0,0)';
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#d8c58e';
    c.font = '700 64px Arial, sans-serif';
    c.fillText('ER 99313  GS', 16, 80);
  });
}

function trackDiagram() {
  return signTexture(1024, 256, (c, w, h) => {
    c.fillStyle = '#20262a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d9d2b8';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(30, 90);
    c.lineTo(w - 30, 90);
    c.moveTo(30, 170);
    c.lineTo(w - 30, 170);
    c.moveTo(300, 90);
    c.lineTo(420, 170);
    c.moveTo(640, 170);
    c.lineTo(760, 90);
    c.stroke();
    c.fillStyle = '#d9d2b8';
    c.font = '22px "IBM Plex Mono", monospace';
    c.fillText('PF 0', 470, 70);
    c.fillText('UP MAIN', 40, 210);
    c.fillText('TUNNEL →', w - 160, 60);
    ageCanvas(c, w, h, 0.25);
  });
}

// ───────────────────────────── the decor ─────────────────────────────

export function Decor() {
  const m = useMemo(
    () => ({
      rail: mat('#5d5a55', 0.35, 0.85),
      sleeper: mat('#5c5a55', 0.95),
      truss: mat('#3a2a20', 0.8, 0.4),
      wire: mat('#1b1b1b', 0.6, 0.6),
      yellow: mat('#b99515', 0.7),
      glass: mat('#05080b', 0.08, 0.6, { transparent: true, opacity: 0.88 }),
      bar: mat('#2a2522', 0.6, 0.6),
      puddle: mat('#050607', 0.04, 0.3),
      litter: mat('#b9b2a0', 0.9, 0, { side: THREE.DoubleSide }),
      lever: [mat('#8e1d17', 0.5, 0.3), mat('#151515', 0.5, 0.3), mat('#1e3f78', 0.5, 0.3)],
      brass: mat('#8a6a30', 0.4, 0.8),
      pipe: mat('#3b3d3e', 0.5, 0.7),
      dark: mat('#0b0b0c', 0.9),
      wood: mat('#3b2416', 0.7),
      rock: mat('#403c38', 0.95),
    }),
    [],
  );
  const tex = useMemo(
    () => ({
      station: stationBoard(), plat: platformBoard(), exit: exitBoard(), timetable: timetable(),
      shunya: poster('shunya'), pick: poster('pickpocket'), clock: clockFace(), coach: coachNumber(), diagram: trackDiagram(),
    }),
    [],
  );

  const rails = useMemo(() => {
    const out: { p: V3 }[] = [];
    for (const zc of [10, 15]) for (const dz of [-0.838, 0.838]) out.push({ p: [7, -1.0, zc + dz] });
    return out;
  }, []);
  const sleepers = useMemo(() => {
    const out: { p: V3; r: V3 }[] = [];
    for (const zc of [10, 15]) for (let x = -49.5; x < 63.5; x += 0.65) out.push({ p: [x, -1.13, zc], r: [0, (Math.random() - 0.5) * 0.04, 0] });
    return out;
  }, []);
  const trusses = useMemo(() => Array.from({ length: 19 }, (_, i) => ({ p: [-36 + i * 4, 4.9, 3.65] as V3 })), []);
  const litter = useMemo(
    () =>
      Array.from({ length: 70 }, () => {
        const zone = Math.random();
        const p: V3 = zone < 0.55 ? [-38 + Math.random() * 76, 0.012, 0.4 + Math.random() * 7] : zone < 0.8 ? [-19.5 + Math.random() * 19, 0.012, -13.5 + Math.random() * 13] : [-29 + Math.random() * 58, -3.488, 2.2 + Math.random() * 2.6];
        return { p, r: [-Math.PI / 2, 0, Math.random() * Math.PI] as V3, s: [0.6 + Math.random(), 0.6 + Math.random(), 1] as V3 };
      }),
    [],
  );
  const puddles = useMemo(() => {
    const out: { p: V3; s: [number, number] }[] = [];
    for (let i = 0; i < 12; i++) out.push({ p: [-38 + Math.random() * 76, 0.006, 5 + Math.random() * 2.8], s: [0.8 + Math.random() * 2, 0.5 + Math.random()] });
    for (let i = 0; i < 6; i++) out.push({ p: [-28 + Math.random() * 56, -3.494, 2.5 + Math.random() * 2], s: [1 + Math.random() * 2.5, 0.6 + Math.random() * 0.6] });
    for (let i = 0; i < 10; i++) out.push({ p: [-48 + Math.random() * 100, -1.19, 12.2 + Math.random() * 1.2], s: [1 + Math.random() * 3, 0.5 + Math.random()] });
    return out;
  }, []);
  const windows = useMemo(() => {
    const out: { p: V3 }[] = [];
    for (let x = -11; x <= 11; x += 1.6) {
      if (Math.abs(x + 9.5) < 0.9 || Math.abs(x - 9.5) < 0.9) continue;
      for (const z of [8.385, 8.515, 11.485, 11.615]) out.push({ p: [x, 1.42, z] });
    }
    return out;
  }, []);
  const windowBars = useMemo(() => {
    const out: { p: V3 }[] = [];
    for (const w of windows) for (let k = -2; k <= 2; k++) out.push({ p: [w.p[0] + k * 0.17, 1.42, w.p[2] + (w.p[2] < 10 ? (w.p[2] < 8.45 ? -0.01 : 0.01) : w.p[2] > 11.55 ? 0.01 : -0.01)] });
    return out;
  }, [windows]);
  const levers = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ p: [11.5 + i * 0.47, 1.65, -13.05] as V3, r: [0.25 * (i % 3 === 0 ? -1 : 1), 0, 0] as V3, k: i % 3 })), []);
  const masts = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ p: [-40 + i * 25, 2.4, 18.6] as V3 })), []);

  return (
    <group name="decor">
      {/* tracks */}
      <Instanced items={rails} size={[114, 0.17, 0.08]} material={m.rail} />
      <Instanced items={sleepers} size={[0.26, 0.15, 2.75]} material={m.sleeper} />
      {/* platform edge safety strip */}
      <mesh position={[0, 0.004, 7.62]} rotation={[-Math.PI / 2, 0, 0]} material={m.yellow}>
        <planeGeometry args={[80, 0.28]} />
      </mesh>
      <Instanced items={trusses} size={[0.12, 0.22, 7.9]} material={m.truss} />
      {/* catenary masts and wires */}
      <Instanced items={masts} size={[0.25, 7.2, 0.25]} material={m.wire} />
      {[10, 15].map((z) => (
        <mesh key={z} position={[7, 5.6, z]} rotation={[0, 0, Math.PI / 2]} material={m.wire}>
          <cylinderGeometry args={[0.012, 0.012, 114, 4]} />
        </mesh>
      ))}
      {masts.map((ms, i) => (
        <mesh key={i} position={[ms.p[0], 5.9, 14.3]} material={m.wire}>
          <boxGeometry args={[0.12, 0.12, 8.6]} />
        </mesh>
      ))}

      {/* signage */}
      {[-14, 22].map((x) => (
        <group key={x}>
          <Board tex={tex.station} w={2.7} h={1.1} position={[x, 3.7, 4.02]} emissive="#ffd27a" />
          <Board tex={tex.station} w={2.7} h={1.1} position={[x, 3.7, 3.98]} rotation={[0, Math.PI, 0]} emissive="#ffd27a" />
          <mesh position={[x - 1.2, 4.35, 4]} material={m.bar}>
            <boxGeometry args={[0.05, 1.3, 0.05]} />
          </mesh>
          <mesh position={[x + 1.2, 4.35, 4]} material={m.bar}>
            <boxGeometry args={[0.05, 1.3, 0.05]} />
          </mesh>
        </group>
      ))}
      {[-28, 4, 28].map((x) => (
        <group key={x}>
          <Board tex={tex.plat} w={0.9} h={0.45} position={[x, 3.2, 6.29]} rotation={[0, Math.PI, 0]} />
          <Board tex={tex.plat} w={0.9} h={0.45} position={[x, 3.2, 6.71]} />
        </group>
      ))}
      <Board tex={tex.exit} w={1.8} h={0.6} position={[-10, 3.55, -13.68]} />
      <Board tex={tex.exit} w={1.5} h={0.5} position={[-10, 3.75, -0.32]} rotation={[0, Math.PI, 0]} />
      <Board tex={tex.timetable} w={3.2} h={2} position={[-4.5, 2.6, -13.7]} />
      <Board tex={tex.shunya} w={0.7} h={1} position={[-17, 1.8, -0.32]} rotation={[0, Math.PI, 0]} />
      <Board tex={tex.pick} w={0.7} h={1} position={[8, 1.7, -0.32]} rotation={[0, Math.PI, 0]} />
      <Board tex={tex.shunya} w={0.7} h={1} position={[-12, -2.0, 1.99]} />
      <Board tex={tex.pick} w={0.7} h={1} position={[-19.7, 1.7, -10]} rotation={[0, Math.PI / 2, 0]} />
      <Board tex={tex.diagram} w={4} h={1} position={[15, 2.4, -13.72]} />
      {/* station clock (stopped at 3:13) */}
      <group position={[-2, 3.9, 4]}>
        <Board tex={tex.clock} w={0.7} h={0.7} position={[0, 0, 0.03]} />
        <Board tex={tex.clock} w={0.7} h={0.7} position={[0, 0, -0.03]} rotation={[0, Math.PI, 0]} />
        <mesh material={m.bar}>
          <cylinderGeometry args={[0.37, 0.37, 0.05, 24]} />
        </mesh>
        <mesh position={[0, 0.7, 0]} material={m.bar}>
          <boxGeometry args={[0.04, 1, 0.04]} />
        </mesh>
      </group>
      <Board tex={tex.clock} w={0.45} h={0.45} position={[5, 2.6, -13.72]} />

      {/* carriage */}
      <Instanced items={windows} size={[1.1, 0.7, 0.005]} material={m.glass} />
      <Instanced items={windowBars} size={[0.025, 0.72, 0.02]} material={m.bar} />
      <Board tex={tex.coach} w={1.6} h={0.4} position={[2, 0.65, 8.38]} rotation={[0, Math.PI, 0]} />
      <mesh position={[0, 2.82, 10]} rotation={[0, 0, Math.PI / 2]} scale={[0.22, 1, 1]} material={m.rail}>
        <cylinderGeometry args={[1.62, 1.62, 24, 18, 1, false, 0, Math.PI]} />
      </mesh>
      {[-8, 6].map((x) => (
        <mesh key={x} position={[x, -0.75, 10]} material={m.dark}>
          <boxGeometry args={[2.6, 0.6, 2.4]} />
        </mesh>
      ))}

      {/* wet patches */}
      {puddles.map((p, i) => (
        <mesh key={i} position={p.p} rotation={[-Math.PI / 2, 0, i]} scale={[p.s[0], p.s[1], 1]} material={m.puddle}>
          <circleGeometry args={[0.5, 20]} />
        </mesh>
      ))}
      <Instanced items={litter} size={[0.18, 0.12, 0.002]} material={m.litter} />

      {/* signal cabin lever frame */}
      {levers.map((l, i) => (
        <mesh key={i} position={l.p} rotation={l.r} material={m.lever[l.k]}>
          <boxGeometry args={[0.07, 0.95, 0.07]} />
        </mesh>
      ))}
      {/* maintenance pipes */}
      {[-0.6, -1.0].map((dz, i) => (
        <mesh key={i} position={[25, 3.7 - i * 0.25, -13.5 - dz * 0.2]} rotation={[0, 0, Math.PI / 2]} material={m.pipe}>
          <cylinderGeometry args={[0.07, 0.07, 9.8, 10]} />
        </mesh>
      ))}
      {/* locker vents */}
      {[-6.5, -5.5, -4.5, -3.5].map((z) => (
        <mesh key={z} position={[29.18, 1.6, z]} material={m.dark}>
          <boxGeometry args={[0.01, 0.25, 0.6]} />
        </mesh>
      ))}
      {/* tea stall shutter & ledge */}
      <mesh position={[0, 1.0, 5.33]} material={m.wood}>
        <boxGeometry args={[2.8, 0.06, 0.18]} />
      </mesh>
      {/* tunnel: rubble and the dark beyond */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[59 + (i % 3) * 0.4, -1 + (i % 2) * 0.3, 9.2 + i * 0.6]} rotation={[i, i * 2, 0]} material={m.rock}>
          <dodecahedronGeometry args={[0.35 + (i % 3) * 0.15]} />
        </mesh>
      ))}
      {/* the street beyond the shutter: sodium light leaking under it */}
      <mesh position={[-10, 0.25, -21.95]}>
        <planeGeometry args={[3.8, 0.5]} />
        <meshBasicMaterial color="#c98a3a" />
      </mesh>
    </group>
  );
}
