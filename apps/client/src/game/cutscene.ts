import { STORY_BEATS, type LevelDef, type ObjectiveId, type SurvivorView, type Vec3, type WorldSnapshot } from '@nishi/shared';
import { guide } from './guidance';
import * as THREE from 'three';
import { addApparition, fx, now } from './fx';

/**
 * After each task a short storyboarded sequence plays, cut like a film in 2.39:1 scope:
 *   1. an insert on what she just did (the kit, the drawer, the fuse box, the console),
 *   2. the camera leaving her eyes and gliding along the route to the next step,
 *   3. a reveal of that next goal,
 * and after the big beats a jump-scare cut: the Caller, much closer than she should be.
 * Solo play pauses while it runs.
 */
interface Shot {
  d: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  lookA: THREE.Vector3;
  lookB: THREE.Vector3;
  fov: [number, number];
  /** runs once when the shot cuts in */
  at?: () => void;
}

const cut = { start: 0, end: 0, fov: 0, shots: [] as Shot[], fired: -1 };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const v = (p: Vec3) => V(p.x, p.y, p.z);
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();

export const inCutscene = () => now() < cut.end;

const itemPos = (level: LevelDef, id: string) => {
  const it = level.interactables.find((i) => i.id === id);
  return it?.pos ? v(it.pos) : null;
};

/** close and slow on something in the scene, from the side she approached it */
function insert(at: THREE.Vector3, eye: THREE.Vector3, d = 1.7): Shot {
  const back = tmp.subVectors(eye, at).setY(0).normalize();
  const side = V(-back.z, 0, back.x);
  const from = at.clone().addScaledVector(back, 1.25).addScaledVector(side, 0.45).setY(at.y + 0.55);
  const to = at.clone().addScaledVector(back, 0.8).addScaledVector(side, 0.2).setY(at.y + 0.4);
  return { d, from, to, lookA: at.clone(), lookB: at.clone().setY(at.y - 0.03), fov: [36, 30] };
}

/** out of her eyes and along the route */
function glide(eye: THREE.Vector3, ahead: THREE.Vector3, d = 2.4): Shot {
  dir.subVectors(ahead, eye).setY(0);
  const len = dir.length();
  dir.normalize();
  return {
    d,
    from: eye.clone().setY(eye.y + 0.5),
    to: eye.clone().addScaledVector(dir, Math.min(2.4, len * 0.45)).setY(eye.y + 0.15),
    lookA: ahead.clone().setY(ahead.y + 0.5),
    lookB: ahead.clone(),
    fov: [42, 36],
  };
}

/** the next goal itself, from a few metres off, low */
function reveal(target: THREE.Vector3, eye: THREE.Vector3, d = 2): Shot {
  const back = tmp.subVectors(eye, target).setY(0).normalize();
  const look = target.clone().setY(Math.max(target.y, 0) + 0.9);
  return {
    d,
    from: target.clone().addScaledVector(back, 3.4).setY(look.y + 0.35),
    to: target.clone().addScaledVector(back, 2.4).setY(look.y + 0.15),
    lookA: look.clone(),
    lookB: look.clone().setY(look.y - 0.1),
    fov: [40, 33],
  };
}

/**
 * The scare: a hard cut to her standing right there, head snapping, reaching for the lens.
 * `cam` looks along `fwd`; she appears `dist` metres in front.
 */
function scare(cam: THREE.Vector3, fwd: THREE.Vector3, d = 1.1, dist = 1.9): Shot {
  const f = fwd.clone().setY(0).normalize();
  const p = cam.clone().addScaledVector(f, dist).setY(0);
  const head = p.clone().setY(1.55);
  return {
    d,
    from: cam.clone(),
    to: cam.clone().addScaledVector(f, -0.12),
    lookA: head.clone().setY(1.5),
    lookB: head,
    fov: [34, 31],
    at: () => {
      addApparition({ x: p.x, y: 0, z: p.z }, Math.atan2(-(cam.x - p.x), -(cam.z - p.z)), d + 0.25, 'apparition', true);
      fx.shake = Math.max(fx.shake, 0.5);
    },
  };
}

function storyboard(id: ObjectiveId, me: SurvivorView, level: LevelDef, snap: WorldSnapshot): Shot[] {
  const eye = v(me.pos).setY(me.pos.y + 1.6);
  const g = guide(level, snap, me);
  const ahead = g ? v(g.heading).setY(g.heading.y + 1.3) : eye.clone().add(V(-Math.sin(me.yaw) * 6, -0.2, -Math.cos(me.yaw) * 6));
  const next = g ? v(g.target) : null;
  const far = next && next.distanceTo(eye) > 7;
  const route = [glide(eye, ahead), ...(far ? [reveal(next, eye)] : [])];
  const at = (item: string) => itemPos(level, item);

  switch (id) {
    case 'flashlight':
    case 'office':
    case 'reels':
    case 'decode': {
      const used = { flashlight: at('flashlight_kit'), office: at('drawer'), reels: eye.clone().setY(me.pos.y + 0.5).add(V(-Math.sin(me.yaw), 0, -Math.cos(me.yaw))), decode: at('pa_console') }[id];
      return [...(used ? [insert(used, eye)] : []), ...route];
    }
    case 'power': {
      // the fuse box, then the whole platform waking up, then something standing at the far end...
      const fuse = at('fuse_box');
      const camEnd = V(29, 2.1, 4.6);
      return [
        ...(fuse ? [insert(fuse, eye, 1.4)] : []),
        {
          d: 3.2,
          from: V(36, 2.9, 6),
          to: camEnd,
          lookA: V(-20, 1.6, 2.2),
          lookB: V(-20, 1.2, 3.4),
          fov: [42, 34],
          at: () => setTimeout(() => addApparition({ x: -6, y: 0, z: 3.6 }, Math.atan2(-(29 + 6), -(4.6 - 3.6)), 2.2, 'apparition'), 1200),
        },
        // ...and then she is right in front of the lens
        scare(V(12, 1.55, 4.2), V(-1, 0, 0.05)),
      ];
    }
    case 'exit': {
      // the doors stand open, Kabir's headlights pour in, and behind her in the hall: the Caller
      const gate = at('exit_gate') ?? V(-10, 1.2, -13.7);
      return [
        {
          d: 2.6,
          from: V(gate.x + 1.6, 1.25, gate.z + 6.5),
          to: V(gate.x + 0.5, 1.45, gate.z + 3.2),
          lookA: V(gate.x, 1.2, gate.z - 6),
          lookB: V(gate.x, 1.0, gate.z - 8),
          fov: [40, 33],
        },
        // reverse angle from the corridor, looking back into the hall she is leaving
        scare(V(gate.x + 0.3, 1.55, gate.z - 2.4), V(0.05, 0, 1), 1.3, 2.6),
      ];
    }
    default:
      return route;
  }
}

/** Starts the sequence for a finished task. Returns how long it runs (s), or 0 when there is none. */
export function playCutscene(id: ObjectiveId, me: SurvivorView, level: LevelDef, snap: WorldSnapshot) {
  if (id === 'escape') return 0;
  const t = now();
  cut.shots = storyboard(id, me, level, snap);
  cut.fired = -1;
  const total = cut.shots.reduce((s, x) => s + x.d, 0);
  cut.start = t;
  cut.end = t + total;
  document.body.dataset.cine = STORY_BEATS[id].title;
  document.body.style.setProperty('--cine-dur', `${total}s`);
  document.body.classList.add('cine');
  setTimeout(() => document.body.classList.remove('cine'), total * 1000);
  return total;
}

/** Drives the camera while a cutscene runs. Returns the view direction, or null when none is playing. */
export function applyCutscene(camera: THREE.PerspectiveCamera): Vec3 | null {
  const t = now();
  if (t >= cut.end) {
    if (cut.fov) {
      camera.fov = cut.fov;
      cut.fov = 0;
      camera.updateProjectionMatrix();
    }
    return null;
  }
  if (!cut.fov) cut.fov = camera.fov;
  // which shot, and how far through it
  let e = t - cut.start;
  let i = 0;
  while (i < cut.shots.length - 1 && e > cut.shots[i].d) e -= cut.shots[i++].d;
  const s = cut.shots[i];
  if (cut.fired !== i) {
    cut.fired = i;
    s.at?.();
  }
  const k = Math.min(1, e / s.d);
  const ease = k * k * (3 - 2 * k);
  camera.position.lerpVectors(s.from, s.to, ease);
  camera.lookAt(tmp.lerpVectors(s.lookA, s.lookB, ease));
  // a long lens that tightens slowly: the cinematic look
  camera.fov = THREE.MathUtils.lerp(s.fov[0], s.fov[1], ease);
  camera.updateProjectionMatrix();
  camera.getWorldDirection(dir);
  return { x: dir.x, y: dir.y, z: dir.z };
}
