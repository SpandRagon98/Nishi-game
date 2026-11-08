import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier, type RapierCollider, type RapierRigidBody } from '@react-three/rapier';
import {
  ADITI_THOUGHTS, ADRENALINE_BOOST,
  FLAG_CROUCH, FLAG_FLASHLIGHT, FLAG_MOVING, FLAG_SPRINT, OBJECTIVES, forwardFromYawPitch, survivorById, zoneAt,
  type LevelDef, type Vec3,
} from '@nishi/shared';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { fx, now } from '../game/fx';
import { consumeMouse, isDown, matches } from '../game/input';
import { guide } from '../game/guidance';
import { runtime } from '../game/runtime';
import { applyCutscene, inCutscene } from '../game/cutscene';
import { mutter } from '../game/events';
import type { GameSession } from '../game/session';
import { findTarget, type Target } from '../game/targeting';
import { app, type HudState } from '../state/store';

type HudGuide = HudState['guide'];
import { lightLevels } from './Lights';
import { torch } from './Atmosphere';
import { HeldLight } from './HeldLight';

const HALF = 0.55;
const RADIUS = 0.3;
const CENTER = HALF + RADIUS; // body centre above the feet
const EYE = 1.62;
const EYE_CROUCH = 1.05;

export function clockText(t: number) {
  const secs = 3 * 3600 + 13 * 60 + t * 3; // 1 real second = 3 station seconds
  const h = Math.floor(secs / 3600) % 24;
  const m = Math.floor(secs / 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function SurvivorController({ session, level, shadows }: { session: GameSession; level: LevelDef; shadows: boolean }) {
  const body = useRef<RapierRigidBody>(null);
  const collider = useRef<RapierCollider>(null);
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);

  const ctrl = useMemo(() => {
    const c = world.createCharacterController(0.03);
    c.setUp({ x: 0, y: 1, z: 0 });
    c.setMaxSlopeClimbAngle((55 * Math.PI) / 180);
    c.setMinSlopeSlideAngle((65 * Math.PI) / 180);
    c.enableAutostep(0.42, 0.12, false);
    c.enableSnapToGround(0.45);
    c.setSlideEnabled(true);
    return c;
  }, [world]);
  useEffect(() => () => world.removeCharacterController(ctrl), [world, ctrl]);

  const st = useRef({
    yaw: -Math.PI / 2, pitch: 0, vy: 0, eye: EYE, flash: false, crouch: false, stride: 0, bob: 0,
    lastHud: 0, thinkAt: 0, thought: Math.floor(Math.random() * 8), target: null as Target | null, reviving: null as string | null, lastStep: 0, spawned: false,
    // smoothed torch: aim, brightness and the near-wall dimmer all ease so the light glides
    aim: new THREE.Vector3(0, 0, -1), torchK: 0, wallK: 1, fear: 0,
  });

  // flashlight
  const spot = useMemo(() => {
    const s = new THREE.SpotLight('#ffe9c4', 0, 26, 0.42, 0.45, 1.6);
    s.castShadow = shadows;
    s.shadow.mapSize.set(512, 512);
    s.shadow.bias = -0.0004;
    s.shadow.camera.near = 0.2;
    return s;
  }, [shadows]);
  useEffect(() => {
    scene.add(spot, spot.target);
    return () => {
      scene.remove(spot, spot.target);
      spot.dispose();
    };
  }, [scene, spot]);

  // teleports from the authority (spawn, checkpoint, unhide, corrections)
  useEffect(
    () =>
      session.onTeleport((p) => {
        body.current?.setTranslation({ x: p.x, y: p.y + CENTER, z: p.z }, true);
        body.current?.setNextKinematicTranslation({ x: p.x, y: p.y + CENTER, z: p.z });
        st.current.vy = 0;
      }),
    [session],
  );

  // discrete actions
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const s = app();
      if (s.overlay && s.overlay !== 'journal') return;
      const snap = session.snapshot();
      const me = snap?.survivors.find((x) => x.id === session.localId);
      if (!me) return;
      if (matches('interact', e.code)) {
        if (me.hiding) return session.interact(me.hiding);
        const t = st.current.target;
        if (!t) return;
        if (t.kind === 'revive') {
          st.current.reviving = t.id;
          session.revive(t.id);
        } else session.interact(t.id);
      } else if (matches('flashlight', e.code)) {
        st.current.flash = !st.current.flash;
        audio.sfx('locked');
      } else if (matches('ability', e.code)) {
        session.ability();
      } else if (matches('journal', e.code)) {
        s.setOverlay('journal');
      } else if (matches('radio', e.code) && session.kind === 'multi') {
        document.exitPointerLock();
        s.setOverlay('chat');
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (matches('interact', e.code) && st.current.reviving) {
        st.current.reviving = null;
        session.revive(null);
      }
      if (matches('journal', e.code) && app().overlay === 'journal') app().setOverlay(null);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [session]);

  const tmpE = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), []);
  const held = useRef({ on: false, strong: false, intensity: 1, moving: false, sprinting: false, hidden: false });
  const tmpV = useMemo(() => new THREE.Vector3(), []);
  const ray = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }), [rapier]);
  useEffect(() => () => audio.setBreath(null), []);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const s = st.current;
    const snap = session.snapshot();
    const me = snap?.survivors.find((x) => x.id === session.localId);
    const b = body.current;
    const col = collider.current;
    if (!snap || !me || !b || !col) return;
    const settings = app().settings;
    const overlay = app().overlay;
    const def = survivorById(me.characterId);

    if (!s.spawned) {
      s.spawned = true;
      b.setTranslation({ x: me.pos.x, y: me.pos.y + CENTER, z: me.pos.z }, true);
      s.yaw = me.yaw;
    }

    // look
    const m = consumeMouse();
    if (import.meta.env.DEV && runtime.debugLook) {
      s.yaw = runtime.debugLook.yaw;
      s.pitch = runtime.debugLook.pitch;
      runtime.debugLook = null;
    }
    const cine = inCutscene();
    if ((!overlay || overlay === 'journal') && !cine) {
      const k = 0.0021 * settings.mouseSensitivity;
      s.yaw -= m.dx * k;
      s.pitch -= m.dy * k * (settings.invertY ? -1 : 1);
      s.pitch = Math.max(-1.45, Math.min(1.45, s.pitch));
    }

    const alive = me.status === 'alive';
    const hiding = me.hiding ? level.hidingSpots.find((h) => h.id === me.hiding) : undefined;
    const t = b.translation();
    const feet: Vec3 = { x: t.x, y: t.y - CENTER, z: t.z };
    let flags = 0;
    let moving = false;
    let sprinting = false;

    if (hiding) {
      // peek through the slats: limited look range around the spot's facing
      const d = THREE.MathUtils.euclideanModulo(s.yaw - hiding.yaw + Math.PI, Math.PI * 2) - Math.PI;
      s.yaw = hiding.yaw + Math.max(-0.7, Math.min(0.7, d));
      s.pitch = Math.max(-0.5, Math.min(0.4, s.pitch));
      s.flash = false;
    } else if (alive && (!overlay || overlay === 'journal') && !cine) {
      let ix = 0;
      let iz = 0;
      if (isDown('forward')) iz -= 1;
      if (isDown('back')) iz += 1;
      if (isDown('left')) ix -= 1;
      if (isDown('right')) ix += 1;
      const len = Math.hypot(ix, iz);
      moving = len > 0;
      s.crouch = isDown('crouch');
      // sprint never tires out; Kabir's Adrenaline adds a burst on top
      sprinting = moving && isDown('sprint') && !s.crouch;
      const boost = def.ability.id === 'adrenaline' && me.abilityActiveUntil > snap.time ? ADRENALINE_BOOST : 1;
      const speed = (s.crouch ? def.stats.crouch : sprinting ? def.stats.sprint : def.stats.walk) * boost;
      const sin = Math.sin(s.yaw);
      const cos = Math.cos(s.yaw);
      const vx = len ? ((ix * cos + iz * sin) / len) * speed : 0;
      const vz = len ? ((-ix * sin + iz * cos) / len) * speed : 0;
      s.vy = Math.max(-20, s.vy - 9.81 * dt);
      ctrl.computeColliderMovement(col, { x: vx * dt, y: s.vy * dt, z: vz * dt });
      const mv = ctrl.computedMovement();
      if (ctrl.computedGrounded() && s.vy < 0) s.vy = -0.5;
      b.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
      const horiz = Math.hypot(mv.x, mv.z);
      s.stride += horiz;
      s.bob += horiz * (sprinting ? 2.2 : 2.6);
      const strideLen = s.crouch ? 0.55 : sprinting ? 1.0 : 0.72;
      if (s.stride > strideLen) {
        s.stride = 0;
        const zone = zoneAt(level, feet);
        audio.footstep(zone?.surface ?? 'concrete', feet, s.crouch ? 0.35 : sprinting ? 1.3 : 0.8);
      }
    }
    if (!alive) s.flash = false;

    if (moving) flags |= FLAG_MOVING;
    if (sprinting) flags |= FLAG_SPRINT;
    if (s.crouch) flags |= FLAG_CROUCH;
    if (s.flash && me.hasFlashlight) flags |= FLAG_FLASHLIGHT;
    session.sendMove({ x: feet.x, y: feet.y, z: feet.z, yaw: s.yaw, pitch: s.pitch, flags });

    // camera
    const targetEye = me.status === 'downed' ? 0.45 : s.crouch ? EYE_CROUCH : EYE;
    s.eye += (targetEye - s.eye) * Math.min(1, dt * 10);
    const bobAmt = settings.reducedShake ? 0.25 : 1;
    const bobY = moving ? Math.sin(s.bob) * 0.035 * bobAmt : 0;
    const shake = settings.reducedShake ? fx.shake * 0.2 : fx.shake;
    fx.shake = Math.max(0, fx.shake - dt * 1.4);
    if (hiding) camera.position.set(hiding.eye.x, hiding.eye.y, hiding.eye.z);
    else camera.position.set(feet.x, feet.y + s.eye + bobY, feet.z);
    // smooth tremor instead of per-frame random jitter
    const tq = now();
    camera.position.x += Math.sin(tq * 31.7) * Math.sin(tq * 12.3) * shake * 0.03;
    camera.position.y += Math.sin(tq * 27.1 + 1.3) * Math.sin(tq * 9.7) * shake * 0.03;
    tmpE.set(s.pitch, s.yaw, me.status === 'downed' ? 0.5 : moving ? Math.sin(s.bob * 0.5) * 0.004 * bobAmt : 0);
    camera.quaternion.setFromEuler(tmpE);
    const cineDir = applyCutscene(camera as THREE.PerspectiveCamera);
    runtime.eye = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const fwd = cineDir ?? forwardFromYawPitch(s.yaw, s.pitch);
    audio.setListener(runtime.eye, fwd);

    // torch: the aim trails the view slightly and every brightness change eases, so the pool of light
    // glides across the walls instead of snapping or strobing
    const g = snap.ghost;
    const gd = Math.hypot(g.pos.x - feet.x, g.pos.y - feet.y, g.pos.z - feet.z);
    // during a cutscene the torch becomes the key light, shining from the camera onto Aditi
    const flashOn = s.flash || !!cineDir;
    // the found flashlight is a proper beam; before that, Aditi's phone torch
    const strong = me.hasFlashlight || !!cineDir;
    const threatened = gd < 10 && (g.mode === 'hunt' || g.mode === 'warn');
    s.torchK = THREE.MathUtils.damp(s.torchK, flashOn ? (threatened ? 0.35 : 1) : 0, flashOn ? 9 : 14, dt);
    s.aim.lerp(tmpV.set(fwd.x, fwd.y, fwd.z), 1 - Math.exp(-16 * dt)).normalize();
    spot.position.copy(camera.position).add(tmpV.set(0.2, -0.3, -0.45).applyQuaternion(camera.quaternion));
    // close to a wall a real torch floods a small bright disc: dim it so the screen never whites out
    if (flashOn) {
      ray.origin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
      ray.dir = { x: s.aim.x, y: s.aim.y, z: s.aim.z };
      const hit = world.castRay(ray, 8, true, undefined, undefined, col, b);
      const d = hit ? hit.timeOfImpact : 8;
      s.wallK = THREE.MathUtils.damp(s.wallK, THREE.MathUtils.clamp((d - 0.3) / 3.2, 0.25, 1), 6, dt);
    }
    const k = s.torchK * s.wallK;
    spot.intensity = (strong ? 30 : 9) * k;
    spot.distance = strong ? 30 : 12;
    spot.angle = strong ? 0.38 : 0.68;
    spot.penumbra = strong ? 0.55 : 0.9;
    spot.target.position.copy(spot.position).addScaledVector(s.aim, 6);
    spot.target.updateMatrixWorld();
    torch.on = s.torchK > 0.02;
    torch.strength = k * (strong ? 1 : 0.45);
    torch.pos.copy(spot.position);
    torch.dir.copy(s.aim);
    torch.cos = Math.cos(strong ? 0.3 : 0.55);
    held.current = { on: flashOn, strong, intensity: s.torchK, moving, sprinting, hidden: !!hiding || !alive || !!cineDir };

    // breathing: slow and cold at rest, quicker when moving, ragged when hunted or spent
    s.fear = THREE.MathUtils.damp(s.fear, threatened ? 1 : gd < 14 ? 0.45 : 0, 1.2, dt);
    audio.setBreath({
      exertion: sprinting ? 1 : me.exhausted ? 0.9 : moving ? (s.crouch ? 0.15 : 0.35) : 0,
      fear: s.fear,
      hiding: !!hiding,
      down: me.status === 'downed',
      voice: me.characterId === 'kabir' ? 'man' : 'woman',
    });

    // interaction target
    s.target = alive && !hiding ? findTarget(level, snap, me, runtime.eye, fwd) : null;
    if (s.reviving && (!s.target || s.target.id !== s.reviving)) {
      session.revive(null);
      s.reviving = null;
    }

    // ambience + HUD at ~10 Hz
    const tn = now();
    if (tn - s.lastHud > 0.1) {
      s.lastHud = tn;
      // now and then, when nothing is near, Aditi says something to herself
      if (!s.thinkAt) s.thinkAt = tn + 40;
      if (tn > s.thinkAt && alive && !hiding && !cine && s.fear < 0.15 && me.characterId === 'aditi' && session.role !== 'ghost') {
        s.thinkAt = tn + 75 + Math.random() * 60;
        mutter(ADITI_THOUGHTS.ambient[s.thought++ % ADITI_THOUGHTS.ambient.length]);
      }
      const zone = zoneAt(level, feet);
      const signalRange = me.characterId === 'aditi' ? 24 : 17;
      let hum = 0;
      for (const l of level.lights) {
        if (l.kind !== 'tube') continue;
        const d = Math.hypot(l.pos.x - runtime.eye.x, l.pos.y - runtime.eye.y, l.pos.z - runtime.eye.z);
        hum = Math.max(hum, (lightLevels.get(l.id) ?? 0) * Math.max(0, 1 - d / 9));
      }
      audio.updateAmbience({
        indoor: !!zone?.indoor, underground: feet.y < -1.5, hum: hum * 0.9, ghostDist: gd,
        hunting: g.mode === 'hunt' || g.mode === 'warn', signalRange,
      });
      const ability = def.ability;
      const echo = fx.echoSense.until > tn
        ? fx.echoSense.points.map((p) => {
            const a = Math.atan2(-(p.pos.x - feet.x), -(p.pos.z - feet.z)) - s.yaw;
            return { angle: Math.atan2(Math.sin(a), Math.cos(a)), kind: p.kind, dist: Math.hypot(p.pos.x - feet.x, p.pos.z - feet.z) };
          })
        : [];
      const objective = OBJECTIVES.find((o) => !snap.world.objectives[o.id])?.id ?? null;
      let guideHud: HudGuide = null;
      if (app().settings.guidance && alive) {
        const gdn = guide(level, snap, { ...me, pos: feet });
        if (gdn) {
          const a = Math.atan2(-(gdn.heading.x - feet.x), -(gdn.heading.z - feet.z)) - s.yaw;
          guideHud = { step: gdn.step, angle: Math.atan2(Math.sin(a), Math.cos(a)), dist: gdn.distance, vertical: gdn.vertical };
        }
      }
      app().setHud({
        prompt: hiding ? 'Leave the hiding place' : s.target?.label ?? null,
        zone: zone?.name ?? '',
        clock: clockText(snap.time),
        stamina: me.stamina,
        exhausted: me.exhausted,
        flashlight: flashOn,
        hasFlashlight: me.hasFlashlight,
        abilityName: ability.name,
        abilityLeft: Math.max(0, me.abilityReadyAt - snap.time),
        abilityCooldown: ability.cooldown,
        abilityActive: me.abilityActiveUntil > snap.time,
        hiding: !!hiding,
        status: me.status,
        bleedout: me.bleedout,
        reviveProgress: me.reviveProgress,
        signal: Math.max(0, 1 - gd / signalRange),
        objective,
        echo,
        teammates: snap.survivors.filter((x) => x.id !== me.id).map((x) => ({ id: x.id, name: x.name, status: x.status, characterId: x.characterId })),
        ghost: null,
        downedNearby: s.target?.kind === 'revive' ? s.target.id : null,
        guide: guideHud,
      });
    }
  });

  return (
    <>
      <RigidBody ref={body} type="kinematicPosition" colliders={false} enabledRotations={[false, false, false]}>
        <CapsuleCollider ref={collider} args={[HALF, RADIUS]} />
      </RigidBody>
      <HeldLight state={held} />
    </>
  );
}
