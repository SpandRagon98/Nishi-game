import { useFrame } from '@react-three/fiber';
import { PLATFORM_ZERO } from '@nishi/shared';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { now } from '../game/fx';
import { runtime } from '../game/runtime';
import { torch } from './Atmosphere';
import { Humanoid, shadowMaterial, type AnimState } from './Characters';

/**
 * Figures standing in the mist, always at the edge of the torchlight. Purely visual and private to
 * each survivor: they fade in far away, face you, and are gone the moment you get close or put a
 * beam on them.
 */
const SPOTS = PLATFORM_ZERO.waypoints.map((w) => w.pos).filter((p) => p.y > -1.5);
const PALETTE = { coat: '#000', accent: '#000', trousers: '#000', skin: '#000', hair: '#000' };

interface Slot {
  pos: THREE.Vector3;
  alpha: number;
  state: 'hidden' | 'in' | 'stand' | 'out';
  until: number;
  next: number;
}

export function Watchers({ count = 2 }: { count?: number }) {
  const mats = useMemo(() => Array.from({ length: count }, () => shadowMaterial()), [count]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const anims = useRef(Array.from({ length: count }, () => ({ current: { speed: 0, crouch: false, down: false, phase: 0 } as AnimState })));
  const slots = useRef<Slot[]>(Array.from({ length: count }, (_, i) => ({ pos: new THREE.Vector3(), alpha: 0, state: 'hidden', until: 0, next: 12 + i * 17 })));

  useFrame((_, dt) => {
    const t = now();
    const e = runtime.eye;
    const snap = runtime.snap;
    const hunting = snap?.ghost.mode === 'hunt' || snap?.ghost.mode === 'warn';
    slots.current.forEach((s, i) => {
      const g = groups.current[i];
      if (!g) return;
      const d = Math.hypot(s.pos.x - e.x, s.pos.z - e.z);
      if (s.state === 'hidden' && t > s.next && !hunting && !runtime.menu) {
        const candidates = SPOTS.filter((p) => {
          const dd = Math.hypot(p.x - e.x, p.z - e.z);
          return dd > 20 && dd < 34 && Math.abs(p.y - (e.y - 1.6)) < 1;
        });
        if (candidates.length) {
          const p = candidates[Math.floor(Math.random() * candidates.length)];
          s.pos.set(p.x + (Math.random() - 0.5) * 2, p.y, p.z + (Math.random() - 0.5) * 1.5);
          s.state = 'in';
          s.until = t + 18 + Math.random() * 20;
        } else s.next = t + 5;
      }
      if (s.state === 'in') {
        s.alpha = Math.min(1, s.alpha + dt * 0.35);
        if (s.alpha >= 1) s.state = 'stand';
      }
      // in the beam, too close, or simply bored of you
      const toFig = new THREE.Vector3(s.pos.x - torch.pos.x, s.pos.y + 1.3 - torch.pos.y, s.pos.z - torch.pos.z);
      const lit = torch.on && toFig.length() < 26 && toFig.normalize().dot(torch.dir) > torch.cos - 0.05;
      if ((s.state === 'stand' || s.state === 'in') && (d < 15 || lit || t > s.until || hunting)) {
        s.state = 'out';
        if (lit || d < 15) audio.whisper({ x: s.pos.x, y: s.pos.y + 1.5, z: s.pos.z });
      }
      if (s.state === 'out') {
        s.alpha = Math.max(0, s.alpha - dt * 3.5);
        if (s.alpha <= 0) {
          s.state = 'hidden';
          s.next = t + 25 + Math.random() * 35;
        }
      }
      g.visible = s.alpha > 0.01;
      g.position.copy(s.pos);
      g.rotation.y = Math.atan2(e.x - s.pos.x, e.z - s.pos.z);
      mats[i].uniforms.uTime.value = t;
      mats[i].uniforms.uOpacity.value = s.alpha * 0.85;
    });
  });

  return (
    <>
      {mats.map((m, i) => (
        <group key={i} visible={false} ref={(el) => {
          groups.current[i] = el;
        }}>
          <Humanoid palette={PALETTE} anim={anims.current[i]} spectral={m} height={0.98} />
        </group>
      ))}
    </>
  );
}
