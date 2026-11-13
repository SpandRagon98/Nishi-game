import * as THREE from 'three';
import { Timeline, ease, easeIn, easeOut, mix, ramp, track, window4, wobble, type Cue } from '../timeline';
import type { AditiDrive, HandGoal } from './aditi';
import type { HandPose } from './hand';
import type { PhoneState } from './screens';
import { CHILD_AT, CHILD_NEAR, DOOR, MOTHER_AT, WINDOW, type SetDrive } from './set';
import { FADE_ALL, SLAM, sound } from './sound';

/**
 * "YOU'RE NOT ALONE": the scene after Chapter 1's escape, as a timeline. Every visible thing is a
 * function of the time `t` (seconds): where Aditi is and what her hands do, the phone's screen, the
 * reel's label, the door, the lights, the mist, the figures in the window, the lens and the black
 * cards after it. Sounds and voices are cues.
 *
 * The lens is her eyes (first person) except for three shots while her mother is on the line.
 */

const P0 = new THREE.Vector3(4.2, 0, 3.3); // where she stops after the door
const P1 = new THREE.Vector3(3.3, 0, 7.4); // a few steps further out, where the rest happens
const YAW_WALK = Math.atan2(P1.x - P0.x, P1.z - P0.z);
const WIN = new THREE.Vector3(WINDOW.x, 5.95, -0.5);
const YAW_STATION = Math.atan2(WIN.x - P1.x, WIN.z - P1.z) + 0.25;

// ── the ending: the child comes closer, a held second, her scream, cut to black, then her voice ──
const NEAR_AT = 128.0;
/** the reel: up in her hand at 40.8, a second's look, the zoom onto its nameplate, the name changing */
const ZOOM_AT = 41.8;
const NAME_AT = 43.6;
export const SCREAM_AT = 129.05;
const CUT_AT = 129.4;
/** what she says afterwards, over black; each line shows while it is spoken */
export const NARRATION: { id: string; t0: number; t1: number; text: string }[] = [
  { id: 'nar_ran', t0: 133.0, t1: 134.5, text: 'I ran from there.' },
  { id: 'nar_fast', t0: 135.8, t1: 137.7, text: 'I ran as fast as I could...' },
  { id: 'nar_kabir', t0: 139.0, t1: 141.6, text: 'Until I found Kabir waiting beside the car.' },
  { id: 'nar_back', t0: 143.0, t1: 144.8, text: "I didn't look back." },
];
const NAR_END = NARRATION[NARRATION.length - 1].t1;
const TITLE = NAR_END + 2.6;
export const END = TITLE + 12;

/** the shots that are not through her eyes: during the call, and only then */
const OUTSIDE: [number, number][] = [
  [61.7, 70.0], // pulling away from her as the phone reaches her ear: a silhouette against the lamp in the mist
  [74.0, 78.4], // far in front of her: alone in the mist, crying
  [86.4, 91.0], // far off: small against the station
];
export const firstPerson = (t: number) => !OUTSIDE.some(([a, b]) => t >= a && t < b);

/** the rig reports where things really are (this frame), so the lens and her hands find them */
export interface Anchors {
  head: THREE.Vector3;
  /** between her eyes, and the way her face points */
  eye: THREE.Vector3;
  gaze: THREE.Vector3;
  phone: THREE.Vector3;
  /** the phone's keyboard (where her finger types) */
  keys: THREE.Vector3;
  label: THREE.Vector3;
  reel: THREE.Vector3;
}
export const makeAnchors = (): Anchors => ({
  head: new THREE.Vector3(4, 1.8, 3), eye: new THREE.Vector3(4, 1.72, 3.1), gaze: new THREE.Vector3(0, 0, 1),
  phone: new THREE.Vector3(4, 1.3, 3), keys: new THREE.Vector3(4, 1.28, 3), label: new THREE.Vector3(4, 1.3, 3),
  reel: new THREE.Vector3(4, 1.3, 3),
});

export interface Lens {
  /** the lens is her eyes: placed at them, after her body is posed */
  fp: boolean;
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** world point kept sharp, and how strong the blur is elsewhere */
  focus: THREE.Vector3;
  bokeh: number;
}
export const makeLens = (): Lens => ({ fp: true, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, focus: new THREE.Vector3(), bokeh: 0 });

export interface Overlay {
  black: number;
  title: number;
  line: number;
  /** the narration line on the black (-1 none) and its opacity */
  nar: number;
  narAlpha: number;
}

export interface Subtitle {
  t0: number;
  t1: number;
  who: string;
  /** as spoken (romanised Bengali) */
  said: string;
  en: string;
}

export const SUBTITLES: Subtitle[] = [
  { t0: 62.6, t1: 65.6, who: 'ADITI', said: 'Maa...? Maa! Tumi kothay?', en: 'Ma...? Ma! Where are you?' },
  { t0: 68.0, t1: 71.2, who: 'MAA (PHONE)', said: 'Aditi... shunte pachchhish?', en: 'Aditi... can you hear me?' },
  { t0: 72.2, t1: 75.8, who: 'ADITI', said: 'Maa! Ami tomake khujchhi eto bochhor!', en: "Ma! I've been searching for you all these years!" },
  { t0: 78.5, t1: 82.8, who: 'MAA (PHONE)', said: 'Shon... station theke ki kichhu niye eshechhish?', en: 'Listen... did you bring anything out of the station?' },
  { t0: 84.6, t1: 86.0, who: 'ADITI', said: 'Haan...', en: 'Yes...' },
  { t0: 90.8, t1: 94.6, who: 'MAA (PHONE)', said: 'Tahole ekhon ora toke khuje pabe.', en: "Then they'll be able to find you now." },
  { t0: 118.8, t1: 120.7, who: 'ADITI', said: 'Maa...?', en: 'Ma...?' },
];

// ───────────────────────────── her body ─────────────────────────────

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const goal = (at: THREE.Vector3, pole: THREE.Vector3, face?: THREE.Vector3, aim?: THREE.Vector3): HandGoal => ({ at, pole, face, aim });
/** holding the reel up to her eyes: palm up under its rim, its face turned to `eye` */
const show = (at: THREE.Vector3, pole: THREE.Vector3, eye: THREE.Vector3): HandGoal => ({ at, pole, face: eye, cradle: true });
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, k: number) => a.clone().lerp(b, k);
const grip = (g: HandPose['grip'], to?: HandPose['grip'], k = 0, tense = 0): HandPose => ({ grip: g, to, k, tense });
/** her wrist positions were set out for a taller figure: scaled to her shoulders (1.30 m, not 1.49) */
const BODY_K = 0.876;
const vb = (x: number, y: number, z: number) => v(x, y, z).multiplyScalar(BODY_K);

// right hand (her right is -x in body space): the phone. Wrist positions; the phone sits in the palm above them.
const R_HANG = vb(-0.22, 0.86, 0.04);
const R_POCKET = vb(-0.2, 0.88, 0.07);
const R_READ = vb(-0.05, 1.4, 0.33);
const R_UP = vb(-0.1, 1.6, 0.4);
const R_EAR = vb(-0.14, 1.56, 0.04);
const R_LOW = vb(-0.13, 1.14, 0.25);
const R_POLE = v(-0.7, -1, -0.3);
// at her ear the elbow hangs down and a little in front of her, close to her side (not winged out)
const R_EAR_POLE = v(-0.3, -1, 0.35);
// left hand: the reel
// carried at her side, the reel's face against the outside of her thigh, clear of the kurti
const L_CARRY = vb(0.27, 0.86, 0.05);
const L_REEL = vb(0.06, 1.42, 0.36);
const L_HOLD = vb(0.08, 1.3, 0.3);
const L_DROP = vb(0.15, 0.96, 0.22);
const L_POLE = v(0.7, -1, -0.3);
// both hands flat out in front: shoving the door open
const R_PUSH = vb(-0.17, 1.5, 0.44);
// hands on her thighs, bent over, getting her breath back
const R_KNEE = vb(-0.12, 0.8, 0.22);
const KNEE_POLE_R = v(-0.6, 0.2, -1);

const MSG1 = 'Did you get out?';
const MINE = 'Who is this?';
const MSG2 = 'You were supposed to leave the recording behind.';
const TYPE_AT = 30.6;
const KEY_GAP = 0.14;
const TYPE_END = TYPE_AT + MINE.length * KEY_GAP;

/** points of a path with their arrival times; position and speed at `t` */
function path(t: number, pts: [number, THREE.Vector3][], f = (x: number) => x) {
  if (t <= pts[0][0]) return { p: pts[0][1].clone(), speed: 0 };
  for (let i = 1; i < pts.length; i++) {
    const [t1, b] = pts[i];
    const [t0, a] = pts[i - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const e = f(k);
      const dist = a.distanceTo(b);
      const dk = 0.01;
      const speed = a.equals(b) ? 0 : ((f(Math.min(1, k + dk)) - f(Math.max(0, k - dk))) / (2 * dk) * dist) / (t1 - t0);
      return { p: a.clone().lerp(b, e), speed };
    }
  }
  return { p: pts[pts.length - 1][1].clone(), speed: 0 };
}

function body(t: number, a: AditiDrive, anchors: Anchors) {
  // where she is
  const run = path(t, [[0, v(4.0, 0, -2.4)], [0.62, v(4.05, 0, -0.35)], [2.3, v(4.15, 0, 2.6)], [2.85, P0]], (k) => k);
  const walk = path(t, [[11.0, P0], [14.4, P1]], (k) => ease(k * 0.92 + 0.04));
  const at = t < 11 ? run : walk;
  a.pos.copy(at.p);
  a.speed = at.speed;
  // a stumble as she stops
  if (t > 2.3 && t < 3.2) a.speed = Math.min(a.speed, 2);
  // which way she faces: she spins round as the door slams behind her, then turns back
  const turn = ramp(t, 106.3, 109.0);
  const spin = 1.9 * window4(t, 2.35, 2.8, 3.5, 4.0);
  a.yaw = (t < 10.8 ? 0.05 + spin : t < 14.6 ? mix(0.05, YAW_WALK, ramp(t, 10.8, 11.4)) : mix(mix(YAW_WALK, -0.1, ramp(t, 14.6, 16)), YAW_STATION, turn));
  // a shuffle of the feet as she turns round
  if ((turn > 0 && turn < 1) || (spin > 0.05 && spin < 1.85)) a.speed = Math.max(a.speed, 0.6);
  a.fp = firstPerson(t);

  // bent over, hands on her thighs, getting her breath back; straightening up
  a.lean = 0.75 * window4(t, 3.9, 4.6, 5.8, 6.8) + 0.06 * window4(t, 39, 40, 43, 44) + 0.08 * window4(t, 71, 72, 77, 79);
  a.breathRate = track(t, [[0, 0.85], [6, 0.7], [14, 0.45], [20, 0.32], [44, 0.32], [46, 0.5], [60, 0.5], [70, 0.38], [82, 0.6], [92, 0.45], [100, 0.3]]);
  a.breathDepth = track(t, [[0, 1], [8, 0.8], [16, 0.45], [44, 0.45], [46, 0.7], [70, 0.5]]);
  // (steadier while she reads the phone, so the words hold still)
  a.tremble = track(t, [[0, 0.6], [10, 0.45], [20, 0.25], [44, 0.3], [46, 0.85], [56, 0.9], [62, 1], [86, 0.8], [96, 0.6], [110, 0.8]]) * (1 - 0.55 * readW(t));
  a.sob = window4(t, 71, 72, 75.8, 77.5) * 0.9 + window4(t, 62.4, 63, 65.2, 66) * 0.25;
  a.talk = SUBTITLES.some((s) => s.who === 'ADITI' && t >= s.t0 && t < s.t1 - 0.2) ? 1 : 0;

  // where she looks
  const head = a.pos.clone().setY(1.72);
  const fwd = v(Math.sin(a.yaw), 0, Math.cos(a.yaw));
  const around = (deg: number, dist = 6, y = 1.6) => {
    const r = THREE.MathUtils.degToRad(deg) + a.yaw;
    return a.pos.clone().add(v(Math.sin(r) * dist, y, Math.cos(r) * dist));
  };
  if (t < 0.8) a.look = v(DOOR.hinge.x + DOOR.w / 2, 1.2, DOOR.hinge.z + 0.4);
  else if (t < 2.4) a.look = head.clone().addScaledVector(fwd, 5).setY(1.5);
  else if (t < 3.9) a.look = v(DOOR.hinge.x + DOOR.w / 2, 1.3, DOOR.hinge.z);
  else if (t < 6.4) a.look = a.pos.clone().addScaledVector(fwd, 0.55).setY(0);
  else if (t < 10.8) {
    // left, right, back over her shoulder at the door
    a.look = t < 7.6 ? around(-60, 7) : t < 8.8 ? around(70, 7) : t < 9.9 ? around(-125, 6, 1.4) : around(10, 7);
  } else if (t < 14.6) a.look = around(0, 7, 1.3);
  else if (t < 16.2) a.look = around(150, 6, 1.4);
  else if (t < 39.2) a.look = anchors.phone.clone();
  else if (t < 41.4) a.look = anchors.phone.clone().lerp(anchors.reel, ramp(t, 39.2, 40.4));
  else if (t < 49.5) a.look = anchors.reel.clone().lerp(anchors.label, ramp(t, 41.4, 42.4));
  else if (t < 52) a.look = around(-25, 5, 1.5);
  else if (t < 61.1) a.look = anchors.phone.clone();
  else if (t < 82.8) a.look = head.clone().addScaledVector(fwd, 3).setY(t > 71 && t < 77.5 ? 0.5 : 1.35);
  else if (t < 86.4) a.look = anchors.reel.clone();
  else if (t < 94.8) a.look = head.clone().addScaledVector(fwd, 3).setY(1.05);
  else if (t < 100.5) a.look = anchors.phone.clone();
  else if (t < 103.0) a.look = around(40, 6, 1.5);
  else if (t < 106.3) a.look = around(-110, 6, 1.9);
  else if (t < 120.8) a.look = WIN.clone().lerp(v(WIN.x, 5.6, -0.6), ramp(t, 112, 118));
  else {
    // the child and her mother, through the glass; the child once she comes closer
    const child = (t >= NEAR_AT ? CHILD_NEAR : CHILD_AT).clone().add(v(0, 1.08, 0));
    a.look = child.lerp(MOTHER_AT.clone().setY(5.8), t >= NEAR_AT ? 0.06 : 0.18);
  }

  // what she holds things up to: her eyes
  const face = anchors.eye.clone();

  // ── right hand: the door; her thigh; the pocket; the phone up to read, raised for a signal; to the ear; down ──
  let R: HandGoal | null = null;
  let gR = grip('relax');
  if (t >= 0.25 && t < 0.85) {
    R = goal(lerpV(R_HANG, R_PUSH, ramp(t, 0.25, 0.45)), R_POLE, a.pos.clone().addScaledVector(fwd, 4).setY(1.3));
    gR = grip('flat');
  } else if (t >= 4.3 && t < 6.5) (R = goal(R_KNEE, KNEE_POLE_R)), (gR = grip('flat', 'relax', ramp(t, 6.0, 6.5)));
  else if (t >= 16.2 && t < 16.9) (R = goal(lerpV(R_HANG, R_POCKET, ramp(t, 16.2, 16.5)), R_POLE)), (gR = grip('pinch', 'phone', ramp(t, 16.55, 16.9)));
  else if (t >= 16.9 && t < 21.6) R = goal(lerpV(R_POCKET, R_READ, ramp(t, 16.9, 17.9)), R_POLE, face);
  else if (t >= 21.6 && t < 24.4) R = goal(lerpV(R_READ, R_UP, ramp(t, 21.6, 22.7)), R_POLE, face);
  else if (t >= 24.4 && t < 37.9) R = goal(lerpV(R_UP, R_READ, ramp(t, 24.4, 25.3)), R_POLE, face);
  else if (t >= 37.9 && t < 52) R = goal(lerpV(R_READ, R_LOW, ramp(t, 37.9, 39.2)), R_POLE, face);
  else if (t >= 52 && t < 61.1) R = goal(lerpV(R_LOW, R_READ, ramp(t, 52.4, 53.4)), R_POLE, face);
  // at her ear the palm turns to her head, not her eyes: the phone lies along her cheek
  else if (t >= 61.1 && t < 94.8) R = goal(lerpV(R_READ, R_EAR, ramp(t, 61.1, 61.9)), lerpV(R_POLE, R_EAR_POLE, ramp(t, 61.1, 61.9)), lerpV(face, anchors.head, ramp(t, 61.1, 61.9)));
  else if (t >= 94.8 && t < 104) R = goal(lerpV(R_EAR, R_READ.clone().setY(1.26 * BODY_K), ramp(t, 94.8, 95.8)), lerpV(R_EAR_POLE, R_POLE, ramp(t, 94.8, 95.8)), lerpV(anchors.head, face, ramp(t, 94.8, 95.8)));
  else if (t >= 104) R = goal(lerpV(R_READ.clone().setY(1.26 * BODY_K), R_LOW.clone().setY(1.0 * BODY_K), ramp(t, 104, 106.2)), R_POLE, face);
  if (t >= 16.9) gR = grip('phone', 'ear', ramp(t, 61.1, 61.9) * (1 - ramp(t, 94.8, 95.8)), t >= 52 && t < 52.6 ? 0.12 : 0);
  if (t >= TYPE_AT - 1.0 && t < TYPE_END + 0.8) {
    // her right thumb types the reply over the screen (her left hand has the reel); a press for each key
    const since = (t - TYPE_AT) / KEY_GAP;
    const tap = t >= TYPE_AT && t < TYPE_END ? Math.max(0, 1 - Math.abs((since - Math.round(since)) * KEY_GAP) / 0.05) : 0;
    const k = Math.min(ramp(t, TYPE_AT - 1.0, TYPE_AT - 0.3), 1 - ramp(t, TYPE_END + 0.1, TYPE_END + 0.8));
    gR = k < 1 ? grip('phone', 'type', k) : grip('type', 'tap', tap);
  }
  a.handR = R;
  a.gripR = gR;

  // ── left hand: the reel, all along. Carried at her side; up to her eyes; held; nearly dropped ──
  let L: HandGoal | null = goal(L_CARRY.clone().add(v(0, 0, 0.05 * Math.sin(t * 2 * Math.PI * 0.9) * Math.min(1, a.speed / 2))), L_POLE);
  const gL = grip('reel', undefined, 0, t >= 108 ? 0.12 : 0);
  if (t >= 39.4 && t < 49.5) L = show(lerpV(L_CARRY, L_REEL, ramp(t, 39.4, 40.8)), L_POLE, face);
  else if (t >= 49.5 && t < 82.8) {
    // the ring: the reel jerks down, nearly falls, and is caught
    const drop = window4(t, 52.0, 52.18, 52.5, 53.1);
    const base = lerpV(L_REEL, L_HOLD, ramp(t, 49.5, 50.8));
    L = show(lerpV(base, L_DROP, drop), L_POLE, face);
    gL.to = 'relax';
    gL.k = drop * 0.6;
  } else if (t >= 82.8 && t < 106.3) L = show(lerpV(L_HOLD, L_REEL.clone().setY(1.26 * BODY_K), ramp(t, 82.8, 84.2) * (1 - ramp(t, 86.4, 87.8))), L_POLE, face);
  else if (t >= 106.3) L = show(L_HOLD.clone().setY(1.05 * BODY_K), L_POLE, face);
  a.handL = L;
  a.gripL = gL;

  // the props
  a.bagOpen = 0;
  a.reelInHand = true;
  a.label = ramp(t, NAME_AT, NAME_AT + 0.9, (x) => x);
  a.phoneVisible = t >= 16.6;
  a.phone = phoneAt(t);
  a.screen = phoneLight(t);
}

function phoneAt(t: number): PhoneState {
  const s: PhoneState = { mode: 'off', bars: t >= 23.2 ? 1 : 0, msgs: [], draft: null, dots: false, callSecs: 0, pulse: 0 };
  if (t < 17.3) return s;
  if (t < 24.3) return { ...s, mode: 'lock' };
  if (t < 40.6) {
    const msgs: PhoneState['msgs'] = [{ me: false, text: MSG1 }];
    let draft: string | null = null;
    if (t >= TYPE_AT - 0.6 && t < 32.6) draft = MINE.slice(0, Math.max(0, Math.floor((t - TYPE_AT) / KEY_GAP) + 1));
    if (t >= 32.6) msgs.push({ me: true, text: MINE }), (draft = t < 37.9 ? '' : null);
    if (t >= 33.6) msgs.push({ me: false, text: MSG2 });
    return { ...s, mode: 'thread', msgs, draft, dots: t >= 33.0 && t < 33.6 };
  }
  if (t < 52) return s;
  if (t < 61.0) return { ...s, mode: 'incoming', pulse: Math.round((0.5 + 0.5 * Math.sin(t * 6)) * 10) / 10 };
  if (t < 94.6) return { ...s, mode: 'call', callSecs: Math.floor(t - 61.0) };
  if (t < 97.6) return { ...s, mode: 'ended', callSecs: 33 };
  return s;
}

function phoneLight(t: number) {
  if (t < 17.3) return 0;
  if (t < 40.6) return ramp(t, 17.3, 17.6) * (1 - 0.5 * ramp(t, 38.4, 39.4));
  if (t < 52) return 0;
  if (t < 94.6) return t < 61.1 ? 1 : 1 - ramp(t, 61.1, 61.7);
  if (t < 97.6) return ramp(t, 94.8, 95.0) * (1 - ramp(t, 97.0, 97.6));
  return 0;
}

// ───────────────────────────── the set ─────────────────────────────

/** the old sodium lamp: steady, then a stutter now and then (dips, never a flash) */
function lampAt(t: number) {
  const dips: [number, number, number][] = [[7.1, 0.25, 0.35], [7.5, 0.12, 0.6], [9.4, 0.3, 0.2], [26.2, 0.2, 0.5], [49.6, 0.35, 0.3], [50.1, 0.15, 0.5], [101.4, 0.3, 0.3], [NEAR_AT - 0.1, 0.2, 0.15]];
  let k = 1;
  for (const [at, len, depth] of dips) if (t >= at && t < at + len) k = Math.min(k, depth);
  return k * (0.92 + 0.08 * Math.sin(t * 31) * Math.sin(t * 7.7));
}

function setAt(t: number, s: SetDrive) {
  // the door: bursts open as she hits it, swings back on its spring, slams, bounces once
  const open = ramp(t, 0.5, 0.72, easeOut) * 1.78;
  const back = ramp(t, 1.5, SLAM, easeIn);
  const bounce = window4(t, SLAM, SLAM + 0.06, SLAM + 0.08, SLAM + 0.22) * 0.045;
  s.door = t < SLAM ? open * (1 - back) : bounce;
  s.lamp = lampAt(t);
  s.corridor = t < SLAM ? 1 : 0.2;
  // the room upstairs is dark until the mist parts; the bulb dies for an instant as the child moves
  const flick = t >= NEAR_AT - 0.1 && t < NEAR_AT + 0.1 ? 0.05 : 1;
  s.room = ramp(t, 107.2, 110.5) * 0.85 * flick;
  s.figures = t > 107;
  s.fog = track(t, [[0, 0.06], [12, 0.052], [100, 0.052], [107.5, 0.052], [111.5, 0.03], [END, 0.03]]);
  s.part = ramp(t, 107.5, 111.5);
  // the child: head bowed, turned up to her mother; she turns to the glass, lifts her face, smiles
  s.child.turn = ramp(t, 121.4, 123.8);
  s.child.lift = ramp(t, 122.0, 124.8);
  s.child.smile = 0.85 * ramp(t, 125.0, 127.2);
  s.childNear = t >= NEAR_AT;
}

// ───────────────────────────── the lens ─────────────────────────────

function shake(t: number) {
  const slam = Math.exp(-Math.max(0, t - SLAM) * 6) * (t >= SLAM ? 0.02 : 0);
  const ring = Math.exp(-Math.max(0, t - 52) * 5) * (t >= 52 ? 0.008 : 0);
  // running: her head jolting with each stride (the body's own bob does most of it)
  const run = t < 2.4 ? 0.008 : 0;
  return slam + ring + run;
}

/** 0..1 how much she is reading the phone: her eyes close in on it and her head steadies */
const READING: [number, number][] = [[16.9, 39.2], [52.4, 61.1], [94.8, 100.5]];
function readW(t: number) {
  return Math.max(...READING.map(([a, b]) => window4(t, a, a + 0.9, b - 0.5, b)));
}

/** her eyes: how narrow she looks (fov), and how far off things soften */
function eyesAt(t: number, a: AditiDrive, an: Anchors, L: Lens) {
  let fov = 42;
  let bokeh = 0.6;
  const rw = readW(t);
  if (rw > 0) (fov = mix(42, 30, rw)), (bokeh = mix(0.6, 1.2, rw));
  else if (t >= 40.4 && t < 49.5) {
    // a second on the reel in her hand, then her eyes close right in on its nameplate as the name changes, then ease back
    const zoom = window4(t, ZOOM_AT, ZOOM_AT + 1.3, NAME_AT + 2.2, NAME_AT + 3.4);
    fov = mix(40, 9, zoom);
    bokeh = mix(1.2, 2.6, zoom);
  }
  else if (t >= 82.8 && t < 86.4) (fov = 36), (bokeh = 1.2);
  else if (t >= 108) {
    // staring at the window: everything else falls away as she fixes on it
    fov = track(t, [[108, 42], [112, 34], [118.4, 11], [120.8, 6.5], [NEAR_AT, 4.2], [END, 4.2]], ease);
    bokeh = 0.7;
  }
  L.fp = true;
  L.pos.copy(an.eye);
  L.look.copy(a.look ?? an.eye.clone().add(an.gaze));
  L.fov = fov;
  L.focus.copy(L.look);
  L.bokeh = bokeh;
}

function lensAt(t: number, a: AditiDrive, an: Anchors, L: Lens) {
  if (firstPerson(t)) {
    eyesAt(t, a, an, L);
  } else {
    const pos = a.pos;
    const fwd = v(Math.sin(a.yaw), 0, Math.cos(a.yaw));
    const right = v(-Math.cos(a.yaw), 0, Math.sin(a.yaw));
    const head = an.head;
    const at = (base: THREE.Vector3, f: number, r: number, u: number) => base.clone().addScaledVector(fwd, f).addScaledVector(right, r).add(v(0, u, 0));
    let cam: THREE.Vector3;
    let look: THREE.Vector3;
    let fov = 36;
    let focus = head.clone();
    let bokeh = 0.8;
    const left = right.clone().negate();
    if (t < 70) {
      // from her left, the lamp beyond her: the lens draws back and back as she listens, until she is
      // a dark figure in the lit mist, her shadow reaching towards us
      const k = ramp(t, 61.7, 69.5, (x) => easeOut(x));
      cam = at(pos, mix(-0.35, -1.5, k), 0, 0).addScaledVector(left, mix(1.1, 5.2, k)).setY(mix(1.6, 1.25, k));
      look = head.clone().add(v(0, mix(-0.1, -0.45, k), 0)).addScaledVector(right, mix(0, 1.2, k));
      fov = 38;
      bokeh = mix(0.9, 0.35, k);
    } else if (t < 78.4) {
      // far in front of her, low: alone in the mist, head bowed, crying
      const k = ramp(t, 74, 78.4, (x) => x);
      cam = at(pos, mix(5.6, 5.1, k), 1.4, 0.9);
      look = pos.clone().setY(1.15).addScaledVector(right, 0.5);
      fov = 34;
      focus = pos.clone().setY(1.2);
      bokeh = 0.4;
    } else {
      // far off in the mist: a small figure against the station, the lamp above her
      const k = ramp(t, 86.4, 91);
      cam = at(pos, mix(5.4, 5.0, k), -1.5, 1.05);
      // (all of her in frame, feet to the lamp's cone)
      look = pos.clone().setY(1.5).lerp(WIN, 0.14);
      fov = 42;
      focus = pos.clone().setY(1.4);
      bokeh = 0.4;
    }
    // her silhouette a little soft in the mist: the focus falls just short of her
    focus = cam.clone().lerp(focus, 0.68);
    bokeh = Math.max(bokeh, 0.95);
    L.fp = false;
    L.pos.copy(cam);
    L.look.copy(look);
    L.fov = fov;
    L.focus.copy(focus);
    L.bokeh = bokeh;
  }
  // breath of a hand-held lens (in first person: her head), and the jolts
  const sh = shake(t);
  const hand = L.fp ? 0.0015 * (1 - 0.6 * readW(t)) : 0.004;
  L.pos.add(v(wobble(t * 1.3, 1) * hand + wobble(t * 23, 2) * sh, wobble(t * 1.1, 3) * hand + wobble(t * 27, 4) * sh, wobble(t * 0.9, 5) * hand));
}

function overlayAt(t: number, o: Overlay) {
  o.black = t < 1.0 ? 1 - ramp(t, 0.02, 0.35) : t >= CUT_AT ? 1 : 0;
  const i = NARRATION.findIndex((n) => t >= n.t0 - 0.25 && t < n.t1 + 0.6);
  o.nar = i;
  o.narAlpha = i < 0 ? 0 : window4(t, NARRATION[i].t0 - 0.25, NARRATION[i].t0 + 0.2, NARRATION[i].t1, NARRATION[i].t1 + 0.6);
  o.title = window4(t, TITLE, TITLE + 1.5, TITLE + 4.1, TITLE + 5.3);
  o.line = window4(t, TITLE + 5.9, TITLE + 7.1, TITLE + 10.3, TITLE + 11.5);
}

/** everything visible at `t`, except the lens (placed once her body is posed: `lensAt`) */
export function direct(t: number, a: AditiDrive, s: SetDrive, o: Overlay, anchors: Anchors) {
  body(t, a, anchors);
  setAt(t, s);
  s.watch.copy(anchors.eye);
  s.time = t;
  overlayAt(t, o);
}
export { lensAt };

/** her breathing: winded, then settling; caught when frightened; quiet while she speaks */
export function breathPlan(t: number) {
  const speaking = SUBTITLES.some((s) => s.who === 'ADITI' && t > s.t0 - 0.3 && t < s.t1);
  const effort = track(t, [[0, 0.95], [6, 0.8], [14, 0.4], [20, 0.18], [44, 0.18], [46, 0.45], [56, 0.5], [70, 0.35], [72, 0.6], [77, 0.4], [82, 0.55], [92, 0.4], [100, 0.25]]);
  const fear = track(t, [[0, 0.7], [16, 0.3], [44, 0.4], [46, 0.85], [62, 0.9], [100, 0.85]]);
  return { effort, fear, on: !speaking && t > 0.2 && t < FADE_ALL[0] };
}

// ───────────────────────────── cues ─────────────────────────────

export function makeCues(): Cue[] {
  const c: Cue[] = [];
  const at = (t: number, run: () => void) => c.push({ at: t, run });
  at(0.0, () => sound.pa());
  // footsteps chasing her inside, gaining
  for (let i = 0; i < 8; i++) at(0.15 + i * 0.36, () => sound.chaseStep({ x: DOOR.hinge.x + 0.7, y: 0, z: -6 + i * 0.5 }));
  for (let i = 0; i < 7; i++) at(0.1 + i * 0.33, () => sound.step(1.3));
  at(0.66, () => sound.doorBang());
  at(2.55, () => sound.step(0.9));
  at(2.82, () => sound.step(0.6));
  at(SLAM, () => sound.slam());
  for (let i = 0; i < 6; i++) at(11.15 + i * 0.58, () => sound.step(0.62));
  at(24.0, () => sound.vibrate());
  at(24.3, () => sound.ping());
  for (let i = 0; i < MINE.length; i++) at(TYPE_AT + i * KEY_GAP, () => sound.key());
  at(32.6, () => sound.sent());
  at(33.6, () => sound.ping());
  at(NAME_AT, () => sound.crackle());
  at(52.0, () => sound.startRing());
  at(61.0, () => (sound.stopRing(), sound.click()));
  at(62.6, () => sound.voice('aditi_where'));
  at(68.0, () => sound.voice('ma_hear', { phone: true }));
  at(72.2, () => sound.voice('aditi_years'));
  at(78.5, () => sound.voice('ma_brought', { phone: true }));
  at(84.6, () => sound.voice('aditi_yes'));
  at(88.4, () => sound.crackle());
  at(90.8, () => sound.voice('ma_find', { phone: true }));
  at(94.6, () => sound.hangup());
  at(103.2, () => sound.giggle());
  for (const s of [106.6, 107.3, 108.0, 108.7]) at(s, () => sound.step(0.4));
  at(118.8, () => sound.voice('aditi_maa'));
  // the scream starts on the picture and is cut off by the black; afterwards, her voice alone
  at(SCREAM_AT, () => sound.scream());
  for (const n of NARRATION) at(n.t0, () => sound.narrate(n.id));
  return c;
}

/**
 * the pace: every spoken line, the scream and the cut play exactly as written; the quiet stretches
 * between them (walking, reading, looking) run a little quicker, which takes about a tenth off the whole
 */
const SPOKEN: [number, number][] = [
  ...SUBTITLES.map((s): [number, number] => [s.t0 - 0.5, s.t1 + 0.4]),
  ...NARRATION.map((n): [number, number] => [n.t0 - 0.5, n.t1 + 0.6]),
  [NEAR_AT - 1.5, CUT_AT + 0.6],
];
const QUICKER = 0.17;
export function pace(t: number) {
  const near = Math.max(...SPOKEN.map(([a, b]) => window4(t, a - 0.6, a, b, b + 0.6)));
  return 1 + QUICKER * (1 - near);
}

export function makeTimeline(hooks: ConstructorParameters<typeof Timeline>[2]) {
  return new Timeline(END, makeCues(), hooks, pace);
}

export { ease, easeIn };
