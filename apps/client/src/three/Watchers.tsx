import { useFrame } from '@react-three/fiber';
import { PLATFORM_ZERO } from '@nishi/shared';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { now } from '../game/fx';
import { runtime } from '../game/runtime';
import { torch } from './Atmosphere';
import { CallerFigure, type GhostControl } from './Ghost';

/**
 * The Caller, standing in the mist, always at the edge of the torchlight: barely there, dead still,
 * facing you. Purely visual and private to each survivor: she fades in far away and is gone the moment
 * you get close or put a beam on her.
 */
const SPOTS = PLATFORM_ZERO.waypoints.map((w) => w.pos).filter((p) => p.y > -1.5);

interface Slot {
  pos: THREE.Vector3;
  alpha: number;
  state: 'hidden' | 'in' | 'stand' | 'out';
  until: number;
  next: number;
}

export function Watchers({ count = 2 }: { count?: number }) {
  const controls = useMemo(() => Array.from({ length: count }, () => ({ opacity: 0, speed: 0, stunned: false, still: true }) as GhostControl), [count]);
  const groups = useRef<(THREE.Group | null)[]>([]);
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
      controls[i].opacity = s.alpha * 0.4;
    });
  });

  return (
    <>
      {controls.map((c, i) => (
        <group key={i} visible={false} userData={{ warm: true }} ref={(el) => {
          groups.current[i] = el;
        }}>
          <CallerFigure control={{ current: c }} />
        </group>
      ))}
    </>
  );
}
