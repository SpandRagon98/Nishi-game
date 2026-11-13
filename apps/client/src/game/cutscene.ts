import { ADITI_THOUGHTS, CUTSCENE_LINES, hasLineOfSight, penetratesWalls, STORY_BEATS, type LevelDef, type ObjectiveId, type SurvivorView, type Vec3, type WorldSnapshot } from '@nishi/shared';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { speak } from '../audio/speech';
import { app, useApp } from '../state/store';
import { addApparition, fx, now } from './fx';

/**
 * After each task a short scene plays, cut like a film in 2.39:1 scope. Mostly through Aditi's own eyes
 * (handheld, breathing, the torch as the only key light, as in a first-person horror film), with a few
 * locked-off wide shots and long-lens push-ins. Every scene is a beat of the story: Ma's torch, Ma's
 * note, Ma's voice on the last reel, the station waking, Ma on the speakers, and the run. The Caller
 * is in all of them, a little closer each time. Solo play pauses while one runs.
 */
interface Shot {
  d: number;
  /** camera and aim keyframes, eased across the shot */
  cam: THREE.Vector3[];
  look: THREE.Vector3[];
  fov: [number, number];
  /** handheld: 0 on a tripod, ~0.5 a careful hand, 1 walking and scared */
  hand?: number;
  /** fades up from black over this many seconds */
  dip?: number;
  /** things that happen during the shot, at seconds from its start */
  cues?: [number, () => void][];
}

const cut = { start: 0, end: 0, fov: 0, focus: 3, shots: [] as Shot[], fired: new Set<string>(), seed: 0 };
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const v = (p: Vec3) => V(p.x, p.y, p.z);
const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();
const shake = new THREE.Vector3();

export const inCutscene = () => now() < cut.end;
/** how far the scene's camera is from what it is looking at (m) */
export const cineFocus = () => cut.focus;

/** where an item is this run: some (the kit, the reels) are placed at random when the night starts */
const itemPos = (level: LevelDef, snap: WorldSnapshot | undefined, id: string) => {
  const p = snap?.world.itemPos[id] ?? level.interactables.find((i) => i.id === id)?.pos;
  return p ? v(p) : null;
};
/**
 * somewhere she can see from `eye`: the first of `tries` ([degrees off `facing`, metres]) that is open
 * floor in plain sight, so a figure placed there is never inside or behind a wall
 */
function inSight(level: LevelDef, snap: WorldSnapshot | undefined, eye: THREE.Vector3, facing: THREE.Vector3, floor: number, tries: [number, number][]) {
  const dyn = { closedDoors: snap ? Object.entries(snap.world.doors).filter(([, d]) => !d.open).map(([id]) => id) : [], exitOpen: !!snap?.world.exitOpen };
  const from = { x: eye.x, y: floor, z: eye.z };
  const at = (deg: number, d: number) => {
    const a = THREE.MathUtils.degToRad(deg);
    return V(eye.x + (facing.x * Math.cos(a) - facing.z * Math.sin(a)) * d, floor, eye.z + (facing.z * Math.cos(a) + facing.x * Math.sin(a)) * d);
  };
  for (const [deg, d] of tries) {
    const q = at(deg, d);
    if (!penetratesWalls(level, q, 0.35, dyn) && hasLineOfSight(level, from, q, dyn)) return q;
  }
  return at(tries[tries.length - 1][0], 2);
}

const yawTo = (from: THREE.Vector3, to: THREE.Vector3) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** a line of dialogue inside a scene: subtitle and voice */
function say(speaker: string, text: string, kind: 'tape' | 'announcement' | 'whisper' | 'thought', voice: 'female' | 'male' = 'female') {
  const s = app();
  s.subtitle({ speaker, text, kind }, 1600 + text.length * 62);
  void speak(text, { enabled: s.settings.voiceLines, voice, rate: kind === 'thought' ? 0.95 : 0.9, pitch: 0.95 });
}
const thought = (id: ObjectiveId) => {
  const t = ADITI_THOUGHTS.after[id];
  if (t) say('ADITI', t, 'thought');
};
const ma = (id: ObjectiveId, kind: 'tape' | 'announcement' | 'whisper', speaker = 'MA') => {
  for (const l of CUTSCENE_LINES[id] ?? []) say(l.who === 'caller' ? '' : speaker, l.who === 'caller' ? `"${l.text}"` : l.text, kind);
};

/** close and slow on something she just touched, from the side she came at it */
function insert(at: THREE.Vector3, eye: THREE.Vector3, d: number, o: Partial<Shot> = {}): Shot {
  const back = tmp.subVectors(eye, at).setY(0).normalize();
  const side = V(-back.z, 0, back.x);
  return {
    d,
    cam: [at.clone().addScaledVector(back, 1.0).addScaledVector(side, 0.35).setY(at.y + 0.5), at.clone().addScaledVector(back, 0.72).addScaledVector(side, 0.18).setY(at.y + 0.38)],
    look: [at.clone(), at.clone().setY(at.y - 0.03)],
    fov: [38, 32],
    hand: 0.3,
    ...o,
  };
}

/** a hard cut to her, right there, lunging for the lens */
function scare(cam: THREE.Vector3, fwd: THREE.Vector3, d = 1.15, dist = 1.85): Shot {
  const f = fwd.clone().setY(0).normalize();
  const p = cam.clone().addScaledVector(f, dist).setY(cam.y - 1.55);
  const head = p.clone().setY(p.y + 1.55);
  return {
    d,
    cam: [cam.clone(), cam.clone().addScaledVector(f, -0.14)],
    look: [head.clone().setY(head.y - 0.04), head],
    fov: [34, 31],
    hand: 1,
    cues: [[0, () => {
      addApparition({ x: p.x, y: p.y, z: p.z }, yawTo(p, cam), d + 0.25, 'apparition', true);
      audio.shriek({ x: p.x, y: head.y, z: p.z }, 0.34);
      fx.shake = Math.max(fx.shake, 0.55);
    }]],
  };
}

const withCue = (s: Shot, when: number, fn: () => void): Shot => ({ ...s, cues: [...(s.cues ?? []), [when, fn]] });

function storyboard(id: ObjectiveId, me: SurvivorView, level: LevelDef, snap?: WorldSnapshot): Shot[] {
  const floor = me.pos.y;
  const eye = v(me.pos).setY(floor + 1.6);
  const facing = V(-Math.sin(me.yaw), 0, -Math.cos(me.yaw));
  const at = (item: string) => itemPos(level, snap, item);

  switch (id) {
    case 'flashlight': {
      // her torch clicks on; the beam crosses the platform and, for a moment, finds someone standing
      // at the far end. When it swings back, nobody is there.
      const kit = at('flashlight_kit') ?? eye.clone().addScaledVector(facing, 1).setY(floor + 0.6);
      const her = inSight(level, snap, eye, facing, floor, [[35, 9], [-35, 9], [50, 8], [-50, 8], [25, 7], [-25, 7], [70, 6], [-70, 6], [0, 5]]);
      const eyeAt = (p: THREE.Vector3) => p.clone().setY(floor + 1.45);
      return [
        insert(kit, eye, 3.2, { dip: 0.6, cues: [[0.4, () => audio.sfx('pickup')], [1.0, () => thought('flashlight')]] }),
        {
          d: 6.4,
          cam: [eye.clone(), eye.clone().addScaledVector(facing, 0.15)],
          look: [kit.clone().setY(kit.y + 0.2), eyeAt(her), eyeAt(her).setY(floor + 1.4), eyeAt(her).lerp(eye, 0.4).addScaledVector(V(-(her.z - eye.z), 0, her.x - eye.x).normalize(), 5), eyeAt(her)],
          fov: [50, 42],
          hand: 0.6,
          cues: [[0, () => addApparition(her, yawTo(her, eye), 3.4, 'apparition', false, { still: true })]],
        },
      ];
    }
    case 'office': {
      // the drawer; Ma's note in it, in her voice; the line that has rung for twenty-seven years rings
      // once; and someone walks past the doorway behind her
      const drawer = at('drawer') ?? V(5.6, 0.6, -6.95);
      const phone = at('phone') ?? V(6.4, 0.9, -7.5);
      // the drawer slides 0.3 m out of the desk (towards +z); the note lies in its tray
      const note = drawer.clone().add(V(0.02, -0.066, 0.1));
      return [
        {
          d: 2.6,
          cam: [drawer.clone().add(V(-0.38, 0.78, 0.95)), drawer.clone().add(V(-0.22, 0.62, 0.72))],
          look: [note.clone(), note.clone().add(V(0, -0.01, 0))],
          fov: [40, 34],
          hand: 0.3,
          dip: 0.4,
          cues: [[0.3, () => audio.sfx('paper')]],
        },
        {
          d: 5,
          cam: [note.clone().add(V(-0.03, 0.42, 0.16)), note.clone().add(V(0, 0.32, 0.11))],
          look: [note.clone(), note.clone().add(V(0, 0, -0.01))],
          fov: [36, 31],
          hand: 0.2,
          cues: [[0.3, () => ma('office', 'tape', "MA (HER NOTE)")]],
        },
        {
          d: 2.8,
          cam: [phone.clone().add(V(-0.45, 0.28, 0.9)), phone.clone().add(V(-0.3, 0.2, 0.62))],
          look: [phone.clone(), phone.clone().add(V(0, -0.02, 0))],
          fov: [36, 30],
          hand: 0.2,
          cues: [[0.35, () => audio.sfx('phone_ring', { x: phone.x, y: phone.y, z: phone.z })]],
        },
        {
          d: 3.6,
          cam: [V(6.6, 1.5, -9.6), V(6.4, 1.5, -9.2)],
          look: [V(3.6, 1.3, -1.2), V(3.3, 1.25, -1.2)],
          fov: [40, 36],
          hand: 0.5,
          cues: [
            [0.5, () => addApparition({ x: 0.6, y: 0, z: -1.6 }, -Math.PI / 2, 2.6, 'shadow', false, { vel: { x: 2.1, y: 0, z: 0 } })],
            [1.8, () => thought('office')],
          ],
        },
      ];
    }
    case 'reels': {
      // the last reel, where she found it, in the beam: Ma's voice, recorded today, says her name.
      // Then every light near her dies, and something crosses behind her.
      const reels = ['reel_a', 'reel_b', 'reel_c'].map((r) => [r, at(r)] as const).filter((r): r is [string, THREE.Vector3] => !!r[1]);
      const [reelId, reel] = reels.sort((p, q) => p[1].distanceToSquared(eye) - q[1].distanceToSquared(eye))[0] ?? ['', eye.clone().addScaledVector(facing, 0.9).setY(floor)];
      const behind = inSight(level, snap, eye, facing, floor, [[150, 6], [-150, 6], [160, 4.5], [-160, 4.5], [130, 4], [-130, 4], [180, 3]]).setY(floor + 1.4);
      return [
        insert(reel.clone().setY(reel.y + 0.03), eye, 5.8, {
          dip: 0.35,
          fov: [36, 27],
          cues: [[0, () => (fx.sceneReel = reelId)], [0.2, () => audio.sfx('tape')], [0.5, () => ma('reels', 'tape')]],
        }),
        {
          d: 4.4,
          cam: [eye.clone(), eye.clone()],
          look: [eye.clone().addScaledVector(facing, 4).setY(floor + 1.3), behind],
          fov: [48, 44],
          hand: 0.75,
          cues: [
            [0, () => (fx.sceneReel = '')],
            [0.5, () => {
              for (const l of level.lights) if (l.pos && Math.hypot(l.pos.x - eye.x, l.pos.z - eye.z) < 26) fx.flicker.set(l.id, now() + 3.2);
            }],
            [2.2, () => {
              const p = behind.clone().setY(floor);
              addApparition(p, yawTo(p, eye), 1.5, 'shadow', false, { vel: { x: facing.z * 2.6, y: 0, z: -facing.x * 2.6 } });
            }],
            [3.0, () => thought('reels')],
          ],
        },
      ];
    }
    case 'power': {
      // the fuse box; the platform waking up a light at a time; at its far end, under the last tube,
      // she is waiting, barely there. The tube above her stutters, and when it steadies she is gone.
      const fuse = at('fuse_box') ?? V(25, 1.5, -13.6);
      const her = V(15, 0, 3.6);
      const lens = V(28.4, 1.75, 4.5);
      return [
        insert(fuse, eye, 2.4, { cues: [[0.4, () => audio.sfx('spark', { x: fuse.x, y: fuse.y, z: fuse.z })], [1.5, () => audio.sfx('power_up')]] }),
        {
          d: 4.8,
          cam: [V(40, 3.2, 6.8), V(36.5, 2.8, 5.8)],
          look: [V(-20, 1.6, 2.6), V(-20, 1.25, 3.4)],
          fov: [42, 35],
          hand: 0.08,
          cues: [[0, () => (fx.powerOnAt = now())]],
        },
        {
          d: 4,
          cam: [V(30, 1.8, 4.6), lens.clone()],
          look: [her.clone().setY(1.45), her.clone().setY(1.4)],
          fov: [20, 16],
          hand: 0.12,
          cues: [
            [0, () => addApparition(her, yawTo(her, lens), 2.9, 'apparition', false, { still: true })],
            [1.9, () => {
              for (const l of level.lights) if (l.pos && Math.hypot(l.pos.x - her.x, l.pos.z - her.z) < 9) fx.flicker.set(l.id, now() + 1.6);
            }],
          ],
        },
      ];
    }
    case 'decode': {
      // the console takes the code; every speaker falls silent; then Ma's voice comes out of them
      const con = at('pa_console') ?? V(18.5, 1.1, -7.5);
      const gate = at('exit_gate') ?? V(-10, 1.2, -13.7);
      return [
        insert(con, eye, 2.4, { cues: [[0.3, () => audio.sfx('keypad_ok')]] }),
        {
          d: 5.4,
          // low, under the canopy, up at the horn on the post: the speakers that have only ever announced
          // trains say her daughter's name
          cam: [V(13.9, 1.2, 2.3), V(13.3, 1.45, 3.1)],
          look: [V(12, 3.95, 5.9), V(12, 4.0, 5.95)],
          fov: [30, 21],
          hand: 0.15,
          dip: 0.3,
          cues: [[0, () => audio.silence(1.2)], [1.0, () => ma('decode', 'announcement', 'PUBLIC ADDRESS (MA)')]],
        },
        {
          d: 3.4,
          cam: [eye.clone(), eye.clone().addScaledVector(facing, 0.12)],
          look: [eye.clone().addScaledVector(facing, 4), gate.clone().setY(1.3)],
          fov: [48, 42],
          hand: 0.55,
          cues: [[0.5, () => audio.sfx('gate_motor', { x: gate.x, y: gate.y, z: gate.z })], [1.4, () => thought('decode')]],
        },
      ];
    }
    case 'exit': {
      // the doors stand open, Kabir's headlights pour in. Behind her, at the far end of the hall,
      // something says her name in Ma's voice, and starts to run.
      const gate = at('exit_gate') ?? V(-10, 1.2, -13.7);
      const corridor = V(gate.x + 0.3, floor + 1.55, gate.z - 2.4);
      const far = V(gate.x + 1.5, floor, gate.z + 10.5);
      const toCam = corridor.clone().setY(floor).sub(far).normalize();
      let runner: ReturnType<typeof addApparition> | null = null;
      return [
        {
          d: 3,
          cam: [V(gate.x + 1.6, floor + 1.25, gate.z + 6.5), V(gate.x + 0.5, floor + 1.45, gate.z + 3.2)],
          look: [V(gate.x, floor + 1.2, gate.z - 6), V(gate.x, floor + 1.0, gate.z - 8)],
          fov: [40, 33],
          hand: 0.4,
        },
        {
          d: 3.3,
          cam: [corridor.clone(), corridor.clone().add(V(0, 0, -0.1))],
          look: [far.clone().setY(floor + 1.45), far.clone().setY(floor + 1.35).addScaledVector(toCam, 4)],
          fov: [30, 27],
          hand: 0.3,
          cues: [
            [0, () => (runner = addApparition(far, yawTo(far, corridor), 3.6, 'apparition', false, { still: true }))],
            [0.35, () => ma('exit', 'whisper')],
            [1.7, () => {
              if (!runner) return;
              runner.still = false;
              runner.vel = { x: toCam.x * 5.6, y: 0, z: toCam.z * 5.6 };
            }],
          ],
        },
        withCue(scare(corridor, V(0.05, 0, 1)), 0.9, () => thought('exit')),
      ];
    }
    default:
      return [];
  }
}

let black: HTMLDivElement | null = null;
function blackout(a: number) {
  if (!black) {
    black = document.createElement('div');
    black.className = 'cine-black';
    document.body.appendChild(black);
  }
  black.style.opacity = a.toFixed(3);
}

/** Starts the scene for a finished task. Returns how long it runs (s), or 0 when there is none. */
export function playCutscene(id: ObjectiveId, me: SurvivorView, level: LevelDef, snap?: WorldSnapshot) {
  const shots = storyboard(id, me, level, snap);
  if (!shots.length) return 0;
  const t = now();
  cut.shots = shots;
  // the scene's lines are timed to the picture: whatever was still queued stays in the radio log
  useApp.setState({ subtitles: [] });
  cut.fired.clear();
  cut.seed = Math.random() * 100;
  const total = shots.reduce((s, x) => s + x.d, 0);
  cut.start = t;
  cut.end = t + total;
  document.body.dataset.cine = STORY_BEATS[id].title;
  document.body.style.setProperty('--cine-dur', `${total}s`);
  document.body.classList.add('cine');
  setTimeout(() => {
    document.body.classList.remove('cine');
    blackout(0);
  }, total * 1000);
  return total;
}

/** eased position along keyframes (Catmull-Rom through them, smooth in and out) */
function along(keys: THREE.Vector3[], k: number, out: THREE.Vector3) {
  if (keys.length === 1) return out.copy(keys[0]);
  const e = k * k * (3 - 2 * k);
  const f = e * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(f));
  const u = f - i;
  const p0 = keys[Math.max(0, i - 1)];
  const p1 = keys[i];
  const p2 = keys[i + 1];
  const p3 = keys[Math.min(keys.length - 1, i + 2)];
  const u2 = u * u;
  const u3 = u2 * u;
  return out.set(0, 0, 0)
    .addScaledVector(p0, -0.5 * u3 + u2 - 0.5 * u)
    .addScaledVector(p1, 1.5 * u3 - 2.5 * u2 + 1)
    .addScaledVector(p2, -1.5 * u3 + 2 * u2 + 0.5 * u)
    .addScaledVector(p3, 0.5 * u3 - 0.5 * u2);
}

/** a hand-held camera: slow drift, a breathing bob and small quick tremors */
function handheld(t: number, amount: number, out: THREE.Vector3) {
  const s = cut.seed;
  return out.set(
    Math.sin(t * 0.9 + s) * 0.6 + Math.sin(t * 2.3 + s * 2) * 0.3 + Math.sin(t * 6.1 + s * 3) * 0.1,
    Math.sin(t * 1.25 + s * 1.7) * 0.7 + Math.sin(t * 3.7 + s) * 0.2,
    Math.sin(t * 0.7 + s * 0.6) * 0.5 + Math.sin(t * 2.9 + s * 1.3) * 0.25,
  ).multiplyScalar(0.012 * amount);
}

/** Drives the camera while a scene runs. Returns the view direction, or null when none is playing. */
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
  let e = t - cut.start;
  let i = 0;
  while (i < cut.shots.length - 1 && e > cut.shots[i].d) e -= cut.shots[i++].d;
  const s = cut.shots[i];
  for (const [j, [when, fn]] of (s.cues ?? []).entries()) {
    const key = `${i}:${j}`;
    if (e >= when && !cut.fired.has(key)) {
      cut.fired.add(key);
      fn();
    }
  }
  const k = Math.min(1, e / s.d);
  along(s.cam, k, camera.position);
  const hand = s.hand ?? 0;
  if (hand) camera.position.add(handheld(t, hand, shake));
  along(s.look, k, tmp);
  if (hand) tmp.add(handheld(t * 1.3 + 7, hand * 1.6, shake));
  cut.focus = camera.position.distanceTo(tmp);
  camera.lookAt(tmp);
  // a slight roll on a hand-held camera
  if (hand) camera.rotateZ(Math.sin(t * 0.8 + cut.seed) * 0.006 * hand);
  // a long lens that tightens slowly: the cinematic look
  const ef = k * k * (3 - 2 * k);
  camera.fov = THREE.MathUtils.lerp(s.fov[0], s.fov[1], ef);
  camera.updateProjectionMatrix();
  // fades: up from black where a shot asks, and down to black in the last moments of the scene
  const end = cut.end - t;
  blackout(Math.max(s.dip ? 1 - Math.min(1, e / s.dip) : 0, end < 0.3 ? 1 - end / 0.3 : 0));
  camera.getWorldDirection(dir);
  return { x: dir.x, y: dir.y, z: dir.z };
}
