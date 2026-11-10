import { hasLineOfSight, NISHI_CALL, penetratesWalls, PLATFORM_ZERO, type DynamicBlockers, type WorldSnapshot } from '@nishi/shared';
import * as THREE from 'three';
import { audio } from '../audio/engine';
import { clipUrl, speak } from '../audio/speech';
import { app } from '../state/store';
import { inCutscene } from './cutscene';
import { mutter } from './events';
import { addApparition, fx, now } from './fx';
import { runtime } from './runtime';
import { LocalSession } from './session';

/**
 * Nishir daak, the night call. Out of nowhere, in Ma's voice, the Caller calls Aditi's name: once,
 * far off in one ear; again, nearer and behind; then a third time, softly, right behind her shoulder.
 * The folk rule says the Nishi can only call twice, so the third call is safe to answer. This one has
 * learned the third call: turn towards it and she is standing there. Keep facing away and it passes.
 * Story (solo) only; the rest of the station stays near silent.
 */
type Voice = Awaited<ReturnType<typeof audio.voiceAt>>;

/** seconds after the episode starts: the three calls, Aditi's replies, the window to turn */
const CALL_AT = [0, 7.5, 15.5];
const REPLY_AT = [2.8, 10.8];
const WATCH = [16.1, 21];
/** where each call comes from: degrees from where she is facing (to one side) and metres away */
const FROM: [number, number][] = [[95, 13], [145, 7], [165, 2.5]];
const FAR = [0.85, 0.5, 0];

const N = {
  session: null as unknown,
  at: 0,
  next: 0,
  step: -1,
  replied: -1,
  side: 1,
  src: [] as THREE.Vector3[],
  voice: null as Voice,
  episodes: 0,
  officeAt: 0,
  told: false,
};

const fwd = new THREE.Vector3();
const flat = (v: THREE.Vector3) => v.setY(0).normalize();

function blockers(snap: WorldSnapshot): DynamicBlockers {
  return { closedDoors: Object.entries(snap.world.doors).filter(([, d]) => !d.open).map(([id]) => id), exitOpen: snap.world.exitOpen };
}

const local = () => (runtime.session instanceof LocalSession ? runtime.session : null);
const self = () => runtime.snap?.survivors.find((s) => s.id === runtime.session?.localId) ?? null;

/** a point `deg` degrees round from facing `f` (to `side`), `d` metres from `eye`, on her floor */
function around(eye: THREE.Vector3, f: THREE.Vector3, deg: number, d: number, floor: number) {
  const a = THREE.MathUtils.degToRad(deg);
  const right = new THREE.Vector3(-f.z, 0, f.x);
  return eye.clone().addScaledVector(f, Math.cos(a) * d).addScaledVector(right, Math.sin(a) * d * N.side).setY(floor);
}

/** pan for a source: how far into the left or right ear it sits as she turns */
function panFor(src: THREE.Vector3, eye: THREE.Vector3, f: THREE.Vector3) {
  const to = flat(src.clone().sub(eye));
  const right = new THREE.Vector3(-f.z, 0, f.x);
  return THREE.MathUtils.clamp(to.dot(right) * 1.35, -0.95, 0.95);
}

function canStart(snap: WorldSnapshot, t: number) {
  const me = self();
  const g = snap.ghost;
  if (!me || me.status !== 'alive' || me.hiding) return false;
  if (!snap.world.objectives.office || snap.world.objectives.decode || N.episodes >= 3 || t < N.next) return false;
  if (g.mode !== 'roam' || g.visible || inCutscene() || app().overlay) return false;
  // only into a quiet moment: nobody on the radio, no announcement still on screen
  if (app().subtitles.some((x) => x.end > performance.now())) return false;
  return Math.hypot(g.pos.x - me.pos.x, g.pos.z - me.pos.z) > 10;
}

/** starts an episode now (the Testing Studio calls this directly) */
export function startNishi() {
  const me = self();
  if (!local() || !me) return false;
  N.at = now();
  N.step = -1;
  N.replied = -1;
  N.side = Math.random() < 0.5 ? 1 : -1;
  N.src = [];
  N.episodes++;
  return true;
}

function call(k: number, eye: THREE.Vector3, f: THREE.Vector3, floor: number, snap: WorldSnapshot) {
  N.step = k;
  let p = around(eye, f, FROM[k][0], FROM[k][1], floor);
  if (k === 2) {
    // the third call is right behind her: somewhere she could actually be standing
    const dyn = blockers(snap);
    const me = { x: eye.x, y: floor, z: eye.z };
    for (const [deg, d] of [[165, 2.5], [180, 2.2], [150, 2.4], [170, 1.8], [140, 3]]) {
      const q = around(eye, f, deg, d, floor);
      if (!penetratesWalls(PLATFORM_ZERO, q, 0.3, dyn) && hasLineOfSight(PLATFORM_ZERO, me, q, dyn)) {
        p = q;
        break;
      }
    }
  }
  N.src[k] = p;
  const text = NISHI_CALL.calls[k];
  app().subtitle({ speaker: k < 2 ? 'MA?' : '', text: k < 2 ? text : `"${text}"`, kind: 'whisper' }, 2600 + k * 600);
  const url = clipUrl(text);
  N.voice = null;
  if (url && app().settings.voiceLines) void audio.voiceAt(url, panFor(p, eye, f), FAR[k], k === 2 ? 0.95 : 1).then((v) => (N.voice = v));
  // no recording yet: the browser's voice, unplaced
  else void speak(text, { enabled: app().settings.voiceLines, voice: 'female', rate: 0.8, pitch: k === 2 ? 0.7 : 0.9 });
  // the station holds its breath around the last one
  if (k === 2) audio.silence(2.2);
}

function turned(src: THREE.Vector3, eye: THREE.Vector3) {
  const s = local();
  const at = { x: src.x, y: src.y, z: src.z };
  const ok = s?.sim.nishiTurned(s.localId, at);
  if (!ok) addApparition(at, Math.atan2(-(eye.x - at.x), -(eye.z - at.z)), 1.6, 'apparition', true);
  audio.shriek(at, 0.36);
  fx.shake = Math.max(fx.shake, 0.75);
  tell(3000);
}

/** the first time, the story card explains the rule she just learned */
function tell(delay: number) {
  if (N.told) return;
  N.told = true;
  setTimeout(() => app().beat('nishi'), delay);
}

function end(t: number, gap: number) {
  N.at = 0;
  N.voice = null;
  N.next = t + gap;
}

/** runs every frame from the scene */
export function updateNishi(camera: THREE.Camera) {
  const s = local();
  const snap = runtime.snap;
  if (s !== N.session) {
    Object.assign(N, { session: s, at: 0, next: 0, episodes: 0, officeAt: 0, told: false, voice: null });
  }
  if (!s || !snap) return;
  const t = now();
  // the first call comes a little while after she reads Ma's note ("do not let it call a third time")
  if (snap.world.objectives.office && !N.officeAt) {
    N.officeAt = t;
    N.next = Math.max(N.next, t + 24);
  }
  if (!N.at) {
    if (canStart(snap, t)) startNishi();
    else return;
  }
  const me = self();
  if (!me) return;
  camera.getWorldDirection(fwd);
  const f = flat(fwd.clone());
  const eye = camera.position.clone();
  const e = t - N.at;
  // a real hunt, a cutscene or a dead player ends it
  if (snap.ghost.mode === 'warn' || (snap.ghost.mode === 'hunt' && N.step < 2) || inCutscene() || me.status !== 'alive') return end(t, 60);

  for (let k = N.step + 1; k < 3 && e >= CALL_AT[k]; k++) call(k, eye, f, me.pos.y, snap);
  for (let k = N.replied + 1; k < 2 && N.step >= k && e >= REPLY_AT[k]; k++) {
    N.replied = k;
    mutter(NISHI_CALL.replies[k]);
  }
  const cur = N.src[N.step];
  if (N.voice && cur) N.voice.setPan(panFor(cur, eye, f));

  if (N.step === 2 && e >= WATCH[0]) {
    const src = N.src[2];
    const to = flat(src.clone().sub(eye));
    // she turned to face the voice
    if (to.dot(f) > Math.cos(THREE.MathUtils.degToRad(55))) {
      turned(src, eye);
      return end(t, 150 + Math.random() * 60);
    }
    if (e >= WATCH[1]) {
      mutter(NISHI_CALL.resisted);
      tell(2600);
      return end(t, 110 + Math.random() * 70);
    }
  }
}
