import { STORY_BEATS, type LevelDef, type ObjectiveId, type SurvivorView, type Vec3, type WorldSnapshot } from '@nishi/shared';
import { guide } from './guidance';
import * as THREE from 'three';
import { addApparition, now } from './fx';

/**
 * Short cinematic after each task: the camera leaves Aditi's eyes and glides towards her next goal,
 * letterboxed, on a long lens, with the beat's title over it. Solo play pauses while it runs.
 */
export const CUT_SECONDS = 4.2;

const cut = {
  end: 0,
  start: 0,
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  lookA: new THREE.Vector3(),
  lookB: new THREE.Vector3(),
  fov: 0,
};
const v = (p: Vec3) => new THREE.Vector3(p.x, p.y, p.z);
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();

export const inCutscene = () => now() < cut.end;

export function playCutscene(id: ObjectiveId, me: SurvivorView, level: LevelDef, snap: WorldSnapshot) {
  if (id === 'escape') return false;
  const t = now();
  if (id === 'power') {
    // the platform wakes: a long, low push down Platform Zero, and something standing at the far end
    cut.from.set(36, 2.9, 6);
    cut.to.set(29, 2.1, 4.6);
    cut.lookA.set(-20, 1.6, 2.2);
    cut.lookB.set(-20, 1.2, 3.4);
    setTimeout(() => addApparition({ x: -6, y: 0, z: 3.6 }, Math.atan2(-(29 + 6), -(4.6 - 3.6)), 2.2, 'apparition'), 1500);
  } else {
    // the camera lifts out of Aditi's eyes and glides ahead along the route to her next step,
    // so every cutscene also shows where to go
    const g = guide(level, snap, me);
    const E = v(me.pos).setY(me.pos.y + 1.6);
    const ahead = g ? v(g.heading).setY(g.heading.y + 1.3) : E.clone().add(new THREE.Vector3(-Math.sin(me.yaw) * 6, -0.2, -Math.cos(me.yaw) * 6));
    dir.subVectors(ahead, E).setY(0);
    const d = dir.length();
    dir.normalize();
    cut.from.copy(E).setY(E.y + 0.5);
    cut.to.copy(E).addScaledVector(dir, Math.min(2.4, d * 0.45)).setY(E.y + 0.15);
    cut.lookA.copy(ahead).setY(ahead.y + 0.5);
    cut.lookB.copy(ahead);
  }
  cut.start = t;
  cut.end = t + CUT_SECONDS;
  document.body.dataset.cine = STORY_BEATS[id].title;
  document.body.classList.add('cine');
  setTimeout(() => document.body.classList.remove('cine'), CUT_SECONDS * 1000);
  return true;
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
  const k = (t - cut.start) / (cut.end - cut.start);
  const e = k * k * (3 - 2 * k);
  camera.position.lerpVectors(cut.from, cut.to, e);
  camera.lookAt(tmp.lerpVectors(cut.lookA, cut.lookB, e));
  // a long lens that tightens slowly: the cinematic look
  camera.fov = THREE.MathUtils.lerp(42, 34, e);
  camera.updateProjectionMatrix();
  camera.getWorldDirection(dir);
  return { x: dir.x, y: dir.y, z: dir.z };
}
