import * as THREE from 'three';
import type { Vec3 } from '@nishi/shared';
import { isDown, keyHeld } from '../game/input';
import { app } from '../state/store';

/**
 * Testing Studio free camera: fly anywhere, through walls. WASD + mouse, Shift fast, Space up, C down.
 * Starts from the player's own view. Dev builds only (the controller calls it behind import.meta.env.DEV).
 */
let st: { on: boolean; pos: THREE.Vector3; yaw: number; pitch: number; e: THREE.Euler; dir: THREE.Vector3 } | null = null;

export function flyCamera(camera: THREE.Camera, dt: number, m: { dx: number; dy: number }, yaw: number, pitch: number): Vec3 {
  st ??= { on: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, e: new THREE.Euler(0, 0, 0, 'YXZ'), dir: new THREE.Vector3() };
  if (!st.on) {
    st.on = true;
    st.pos.copy(camera.position);
    st.yaw = yaw;
    st.pitch = pitch;
  }
  const k = 0.0021 * app().settings.mouseSensitivity;
  if (document.pointerLockElement) {
    st.yaw -= m.dx * k;
    st.pitch = Math.max(-1.5, Math.min(1.5, st.pitch - m.dy * k));
    const speed = (isDown('sprint') ? 12 : 4) * dt;
    const f = (isDown('forward') ? 1 : 0) - (isDown('back') ? 1 : 0);
    const r = (isDown('right') ? 1 : 0) - (isDown('left') ? 1 : 0);
    const u = (keyHeld('Space') ? 1 : 0) - (keyHeld('KeyC') ? 1 : 0);
    st.e.set(st.pitch, st.yaw, 0);
    st.dir.set(r, 0, -f).applyEuler(st.e);
    st.pos.addScaledVector(st.dir, speed).y += u * speed;
  }
  st.e.set(st.pitch, st.yaw, 0);
  camera.position.copy(st.pos);
  camera.quaternion.setFromEuler(st.e);
  st.dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  return { x: st.dir.x, y: st.dir.y, z: st.dir.z };
}

/** the next time the free camera turns on, it starts again from the player's eyes */
export const resetFlyCamera = () => st && (st.on = false);
