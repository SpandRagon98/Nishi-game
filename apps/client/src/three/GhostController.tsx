import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, interactionGroups, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import { GHOST_ABILITIES, GHOST_SPEED, forwardFromYawPitch, zoneAt, type GhostAbilityId, type LevelDef } from '@nishi/shared';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { music } from '../audio/music';
import { now } from '../game/fx';
import { consumeMouse, isDown, matches } from '../game/input';
import { runtime } from '../game/runtime';
import type { GameSession } from '../game/session';
import { app } from '../state/store';
import { clockText } from './SurvivorController';

const HALF = 0.6;
const RADIUS = 0.3;
const CENTER = HALF + RADIUS;
/** The Caller collides with walls (group 0) but drifts through doors (group 1). */
const GHOST_FILTER = interactionGroups(2, [0]);

const KEY_TO_ABILITY: [Parameters<typeof matches>[0], GhostAbilityId][] = [
  ['ghostVoice', 'voice'],
  ['ghostApparition', 'apparition'],
  ['ghostBlackout', 'blackout'],
  ['ghostEcho', 'echo'],
  ['ghostHunt', 'hunt'],
];

export function GhostController({ session, level }: { session: GameSession; level: LevelDef }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const { world } = useRapier();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const ctrl = useMemo(() => {
    const c = world.createCharacterController(0.03);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((60 * Math.PI) / 180);
    c.enableAutostep(0.45, 0.1, false);
    c.enableSnapToGround(0.5);
    c.setSlideEnabled(true);
    return c;
  }, [world]);
  useEffect(() => () => world.removeCharacterController(ctrl), [world, ctrl]);
  const st = useRef({ yaw: Math.PI / 2, pitch: 0, vy: 0, spawned: false, lastHud: 0, stride: 0 });
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const sense = useMemo(() => new THREE.PointLight('#7f9fc0', 3, 14, 2), []);
  useEffect(() => {
    scene.add(sense);
    return () => {
      scene.remove(sense);
    };
  }, [scene, sense]);

  useEffect(
    () =>
      session.onTeleport((p) => {
        body.current?.setTranslation({ x: p.x, y: p.y + CENTER, z: p.z }, true);
        st.current.vy = 0;
      }),
    [session],
  );

  useEffect(() => {
    const aim = () => {
      const fwd = forwardFromYawPitch(st.current.yaw, st.current.pitch);
      const snap = session.snapshot();
      const g = snap?.ghost;
      if (!g) return null;
      ray.set(camera.position, new THREE.Vector3(fwd.x, fwd.y, fwd.z));
      ray.far = 25;
      const levelObj = scene.getObjectByName('level');
      const hit = levelObj ? ray.intersectObject(levelObj, true)[0] : undefined;
      const p = hit ? hit.point.clone().addScaledVector(ray.ray.direction, -0.45) : camera.position.clone().addScaledVector(ray.ray.direction, 10);
      return { x: p.x, y: g.pos.y, z: p.z };
    };
    const aimedSurvivor = () => {
      const snap = session.snapshot();
      if (!snap) return undefined;
      const fwd = forwardFromYawPitch(st.current.yaw, st.current.pitch);
      let best: string | undefined;
      let bestDot = 0.85;
      for (const s of snap.survivors) {
        if (s.status !== 'alive') continue;
        const dx = s.pos.x - camera.position.x;
        const dy = s.pos.y + 1.2 - camera.position.y;
        const dz = s.pos.z - camera.position.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > GHOST_ABILITIES.voice.range) continue;
        const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
        if (dot > bestDot) {
          bestDot = dot;
          best = s.id;
        }
      }
      return best;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || app().overlay) return;
      for (const [action, ability] of KEY_TO_ABILITY) {
        if (!matches(action, e.code)) continue;
        if (ability === 'apparition' || ability === 'echo') {
          const p = aim();
          if (p) session.ghostAbility(ability, p);
        } else if (ability === 'voice') session.ghostAbility('voice', undefined, aimedSurvivor());
        else session.ghostAbility(ability);
      }
      if (matches('journal', e.code)) app().setOverlay('journal');
    };
    const onUp = (e: KeyboardEvent) => {
      if (matches('journal', e.code) && app().overlay === 'journal') app().setOverlay(null);
    };
    const onMouse = (e: MouseEvent) => {
      if (e.button === 0 && document.pointerLockElement) session.ghostCapture();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    window.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('mousedown', onMouse);
    };
  }, [session, camera, scene, ray]);

  const tmpE = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const snap = session.snapshot();
    const b = body.current;
    const col = collider.current;
    if (!snap || !b || !col) return;
    const g = snap.ghost;
    const settings = app().settings;
    if (!s.spawned) {
      s.spawned = true;
      b.setTranslation({ x: g.pos.x, y: g.pos.y + CENTER, z: g.pos.z }, true);
    }
    const m = consumeMouse();
    if (import.meta.env.DEV && runtime.debugLook) {
      s.yaw = runtime.debugLook.yaw;
      s.pitch = runtime.debugLook.pitch;
      runtime.debugLook = null;
    }
    if (!app().overlay || app().overlay === 'journal') {
      const k = 0.0021 * settings.mouseSensitivity;
      s.yaw -= m.dx * k;
      s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch - m.dy * k * (settings.invertY ? -1 : 1)));
    }
    const t = b.translation();
    const stunned = g.mode === 'stunned';
    let ix = 0;
    let iz = 0;
    if (!app().overlay || app().overlay === 'journal') {
      if (isDown('forward')) iz -= 1;
      if (isDown('back')) iz += 1;
      if (isDown('left')) ix -= 1;
      if (isDown('right')) ix += 1;
    }
    const len = Math.hypot(ix, iz);
    const speed = stunned ? 0 : g.mode === 'hunt' ? GHOST_SPEED.hunt : GHOST_SPEED.roam;
    const sin = Math.sin(s.yaw);
    const cos = Math.cos(s.yaw);
    const vx = len ? ((ix * cos + iz * sin) / len) * speed : 0;
    const vz = len ? ((-ix * sin + iz * cos) / len) * speed : 0;
    s.vy = Math.max(-20, s.vy - 9.81 * dt);
    ctrl.computeColliderMovement(col, { x: vx * dt, y: s.vy * dt, z: vz * dt }, undefined, GHOST_FILTER);
    const mv = ctrl.computedMovement();
    if (ctrl.computedGrounded() && s.vy < 0) s.vy = -0.5;
    b.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    const feet = { x: t.x, y: t.y - CENTER, z: t.z };
    session.sendMove({ x: feet.x, y: feet.y, z: feet.z, yaw: s.yaw, pitch: s.pitch, flags: len ? 8 : 0 });

    // the Caller drifts: a slow, unsettling sway instead of footsteps
    const sway = settings.reducedShake ? 0 : Math.sin(now() * 1.3) * 0.03;
    camera.position.set(feet.x, feet.y + 1.95 + sway, feet.z);
    tmpE.set(s.pitch, s.yaw, sway * 0.5 + (stunned ? (Math.random() - 0.5) * 0.08 : 0));
    camera.quaternion.setFromEuler(tmpE);
    runtime.eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    sense.position.copy(camera.position);
    sense.intensity = g.mode === 'hunt' ? 5 : 3;
    audio.setListener(runtime.eye, forwardFromYawPitch(s.yaw, s.pitch));

    const tn = now();
    if (tn - s.lastHud > 0.1) {
      s.lastHud = tn;
      const zone = zoneAt(level, feet);
      audio.updateAmbience({ indoor: !!zone?.indoor, underground: feet.y < -1.5, hum: 0, ghostDist: 99, hunting: false, signalRange: 1 });
      music.setMood(g.mode === 'hunt' || g.mode === 'warn' ? 'hunt' : 'tension');
      const readyIn = Object.fromEntries(
        (Object.keys(GHOST_ABILITIES) as GhostAbilityId[]).map((id) => [id, Math.max(0, (g.readyAt[id] ?? 0) - snap.time)]),
      ) as Record<GhostAbilityId, number>;
      app().setHud({
        prompt: null,
        zone: zone?.name ?? '',
        clock: clockText(snap.time),
        status: 'ghost',
        teammates: snap.survivors.map((x) => ({ id: x.id, name: x.name, status: x.hiding ? 'alive' : x.status, characterId: x.characterId })),
        ghost: {
          energy: g.energy, readyIn, mode: g.mode, time: snap.time,
          huntLeft: Math.max(0, g.huntUntil - snap.time), warnLeft: Math.max(0, g.warnUntil - snap.time), stunLeft: Math.max(0, g.stunUntil - snap.time),
        },
      });
    }
  });

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[HALF, RADIUS]} collisionGroups={GHOST_FILTER} />
    </RigidBody>
  );
}
