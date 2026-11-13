import type { Vec3 } from '@nishi/shared';
import { audio, renderBreath } from '../../audio/engine';
import { clipUrl } from '../../audio/speech';
import { ramp, track, window4 } from '../timeline';

/**
 * The scene's sound, all synthesised here or recorded locally (no licensed samples): the station
 * behind her (a train, the speakers, footsteps chasing her) cut dead by the door, then the open
 * night: wind, a distant electrical hum, her breathing, the phone (vibration, message tones, keys, a
 * ringtone, line static, the hang-up), the voices, a child's giggle, and a low tension that is felt
 * more than heard. Beds are continuous and their levels are a pure function of the timeline's time;
 * one-shots are fired by cues. Pausing suspends the audio clock, seeking silences what is sounding.
 */
const VOICE = import.meta.glob('./voice/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const voiceUrl = (id: string) => VOICE[`./voice/${id}.mp3`];
export const hasVoice = (id: string) => !!voiceUrl(id);

type Bed = { gain: GainNode; stop: () => void };

class CineSound {
  private out: GainNode | null = null;
  private late: GainNode | null = null;
  private beds: Record<string, Bed> = {};
  private live = new Set<AudioScheduledSourceNode>();
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private nextBreath = 0;
  private ringing = false;
  private ringTimer = 0;

  get ctx() {
    return audio.ctx;
  }

  /** after a tap (browsers only start audio from a gesture) */
  start() {
    audio.unlock();
    const ctx = this.ctx;
    if (!ctx || this.out) return;
    // outdoors: the scene's sound goes through the ambience bus, which is nearly dry
    this.out = ctx.createGain();
    this.out.connect(audio.buses.ambience);
    // after the scene has faded out: the scream and the narration
    this.late = ctx.createGain();
    this.late.connect(audio.buses.ambience);
    this.beds.station = this.stationBed();
    this.beds.wind = this.windBed();
    this.beds.hum = this.humBed();
    this.beds.drone = this.droneBed();
    this.beds.static = this.staticBed();
    this.beds.electric = this.electricBed();
    for (const id of Object.keys(VOICE)) void this.buffer(VOICE[id]);
    const pa = clipUrl('Platform Zero... Platform Zero... somebody is waiting for you on Platform Zero.');
    if (pa) void this.buffer(pa);
  }

  private buffer(url: string) {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url).then((r) => r.arrayBuffer()).then((b) => this.ctx!.decodeAudioData(b)).catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  private track<T extends AudioScheduledSourceNode>(n: T) {
    this.live.add(n);
    n.addEventListener('ended', () => this.live.delete(n));
    return n;
  }

  // ───────────────────────────── beds ─────────────────────────────

  private noiseBed(brown: boolean, filters: [BiquadFilterType, number, number][], level = 0): Bed {
    const ctx = this.ctx!;
    const src = audio.noiseSrc(true, brown);
    let node: AudioNode = src;
    for (const [type, f, q] of filters) {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      node.connect(b);
      node = b;
    }
    const gain = ctx.createGain();
    gain.gain.value = level;
    node.connect(gain).connect(this.out!);
    src.start();
    return { gain, stop: () => src.stop() };
  }

  /** the station behind the door: a train grinding through, its brakes, the speakers */
  private stationBed(): Bed {
    const ctx = this.ctx!;
    const bed = this.noiseBed(true, [['lowpass', 140, 0.7]]);
    // wheel clatter: the rumble pulsing over rail joints
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 3.1;
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    const am = ctx.createGain();
    am.gain.value = 0.65;
    lfo.connect(lg).connect(am.gain);
    const src = audio.noiseSrc(true, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 1.2;
    src.connect(bp).connect(am).connect(bed.gain);
    // brakes squealing
    const sq = ctx.createOscillator();
    sq.type = 'sine';
    sq.frequency.value = 2350;
    const sqm = ctx.createOscillator();
    sqm.frequency.value = 5.5;
    const sqmg = ctx.createGain();
    sqmg.gain.value = 40;
    sqm.connect(sqmg).connect(sq.frequency);
    const sqg = ctx.createGain();
    sqg.gain.value = 0.035;
    sq.connect(sqg).connect(bed.gain);
    for (const n of [lfo, src, sq, sqm]) n.start();
    return { gain: bed.gain, stop: () => (bed.stop(), [lfo, src, sq, sqm].forEach((n) => n.stop())) };
  }

  private windBed(): Bed {
    const ctx = this.ctx!;
    const bed = this.noiseBed(true, [['bandpass', 380, 0.45]]);
    // slow gusts
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = ctx.createGain();
    lg.gain.value = 0.35;
    const g = ctx.createGain();
    g.gain.value = 0.65;
    lfo.connect(lg).connect(g.gain);
    const hi = audio.noiseSrc(true, false);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400;
    bp.Q.value = 0.7;
    const hg = ctx.createGain();
    hg.gain.value = 0.05;
    hi.connect(bp).connect(hg).connect(g).connect(bed.gain);
    lfo.start();
    hi.start();
    return { gain: bed.gain, stop: () => (bed.stop(), lfo.stop(), hi.stop()) };
  }

  /** a transformer somewhere: 50 Hz mains and its harmonics, far off */
  private humBed(): Bed {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.connect(gain).connect(this.out!);
    const oscs = [[50, 0.5], [100, 0.4], [150, 0.18], [200, 0.1], [250, 0.05]].map(([f, a]) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a;
      o.connect(g).connect(lp);
      o.start();
      return o;
    });
    return { gain, stop: () => oscs.forEach((o) => o.stop()) };
  }

  /** below hearing, almost: two low tones beating against each other */
  private droneBed(): Bed {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.out!);
    const oscs = [36, 38.3, 54.4].map((f, i) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.25 : 0.6;
      o.connect(g).connect(gain);
      o.start();
      return o;
    });
    const n = this.noiseBed(true, [['lowpass', 70, 0.7]], 0.5);
    n.gain.disconnect();
    n.gain.connect(gain);
    return { gain, stop: () => (oscs.forEach((o) => o.stop()), n.stop()) };
  }

  /** the line: thin hiss with crackles */
  private staticBed(): Bed {
    const ctx = this.ctx!;
    const bed = this.noiseBed(false, [['highpass', 1800, 0.7], ['lowpass', 5200, 0.7]]);
    const crack = ctx.createOscillator();
    crack.type = 'square';
    crack.frequency.value = 13;
    const cg = ctx.createGain();
    cg.gain.value = 0.3;
    const am = ctx.createGain();
    am.gain.value = 0.7;
    crack.connect(cg).connect(am.gain);
    bed.gain.disconnect();
    const mid = ctx.createGain();
    mid.gain.value = 0;
    bed.gain.gain.value = 1;
    bed.gain.connect(am).connect(mid).connect(this.out!);
    crack.start();
    return { gain: mid, stop: () => (bed.stop(), crack.stop()) };
  }

  /** a faulty current: a buzz that sputters */
  private electricBed(): Bed {
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 100;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 2.5;
    const sput = ctx.createOscillator();
    sput.type = 'square';
    sput.frequency.value = 7.3;
    const sg = ctx.createGain();
    sg.gain.value = 0.5;
    const am = ctx.createGain();
    am.gain.value = 0.5;
    sput.connect(sg).connect(am.gain);
    o.connect(bp).connect(am).connect(gain).connect(this.out!);
    o.start();
    sput.start();
    return { gain, stop: () => (o.stop(), sput.stop()) };
  }

  /** every frame: bed levels from the timeline, breaths, the ringtone */
  update(t: number, playing: boolean, plan: { breath: (t: number) => { effort: number; fear: number; on: boolean } }) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const now = ctx.currentTime;
    const set = (k: string, v: number) => this.beds[k]?.gain.gain.setTargetAtTime(v, now, k === 'station' ? 0.012 : 0.25);
    // the station is cut dead the instant the door slams
    set('station', t < SLAM ? 0.5 * ramp(t, 0, 0.6) : 0);
    // silence, then the night comes back in: wind, the hum
    const night = ramp(t, SLAM + 1.2, SLAM + 5) * (1 - ramp(t, FADE_ALL[0], FADE_ALL[1]));
    set('wind', 0.22 * night * (1 + 0.4 * window4(t, 47, 49, 51, 54)));
    set('hum', 0.045 * night);
    set('drone', 0.32 * window4(t, 93, 99, FADE_ALL[0], FADE_ALL[1]) + 0.12 * window4(t, 44.5, 46, 50, 52));
    set('static', track(t, [[61.6, 0], [62.2, 0.025], [85, 0.03], [90, 0.07], [94.2, 0.08], [94.5, 0]], (x) => x));
    set('electric', 0.06 * window4(t, 44.4, 44.8, 47.5, 50.5));
    // the master: the reveal fades everything to nothing
    this.out.gain.setTargetAtTime(1 - ramp(t, FADE_ALL[0], FADE_ALL[1]), now, 0.1);
    // her breathing, paced by the plan
    if (playing && t >= this.nextBreath) {
      const b = plan.breath(t);
      if (b.on) {
        const vary = () => 1 + (Math.random() * 2 - 1) * 0.12;
        const e = b.effort;
        const inh = (1.3 - 0.85 * e) * vary();
        const exh = (1.9 - 1.3 * e) * vary();
        const loud = (0.07 + 0.11 * e) * (0.9 + Math.random() * 0.2) * 2.2;
        renderBreath(ctx, this.out, now + 0.02, { inh, exh, loud, effort: e, fear: b.fear, hiding: false, down: false, voice: 'woman' });
        this.nextBreath = t + inh + exh + (1.6 - 1.5 * e) + Math.random() * 0.2;
      } else this.nextBreath = t + 0.2;
    }
  }

  /** stop everything that is sounding (a seek or restart) */
  hush(t: number) {
    for (const n of this.live) {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live.clear();
    this.stopRing();
    this.nextBreath = t + 0.3;
  }

  pause() {
    void this.ctx?.suspend();
    window.clearTimeout(this.ringTimer);
  }

  resume() {
    void this.ctx?.resume();
    if (this.ringing) this.ringLoop();
  }

  // ───────────────────────────── one-shots ─────────────────────────────

  /** the steel door bursting open against its stop */
  doorBang() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    audio.burst(t, 0.18, 0.5, { type: 'lowpass', f: 1400 }, this.out);
    audio.tone(92, 'triangle', t, 0.003, 0.35, 0.35, this.out);
  }

  /** the door slamming shut: a heavy steel boom and the frame ringing */
  slam() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    const dest = audio.buses.effects;
    audio.tone(48, 'sine', t, 0.002, 1.0, 0.7, dest);
    audio.burst(t, 0.3, 0.9, { type: 'lowpass', f: 1100 }, dest);
    audio.burst(t + 0.01, 0.08, 0.6, { type: 'bandpass', f: 2600, q: 2 }, dest);
    for (const [f, a, d] of [[311, 0.08, 1.4], [458, 0.06, 1.1], [823, 0.04, 0.8], [1290, 0.02, 0.6]]) audio.tone(f, 'sine', t, 0.002, a, d, dest, Math.random() * 10);
    // the latch rattling home
    for (let i = 0; i < 4; i++) audio.burst(t + 0.09 + i * 0.05, 0.03, 0.2 / (i + 1), { type: 'bandpass', f: 3200, q: 3 }, dest);
  }

  /** footsteps chasing her inside, before the door shuts on them */
  chaseStep(pos: Vec3) {
    audio.footstep('tile', pos, 1.4, true);
  }

  step(loud: number) {
    audio.footstep('concrete', { x: 0, y: 0, z: 0 }, loud);
  }

  pa() {
    const url = clipUrl('Platform Zero... Platform Zero... somebody is waiting for you on Platform Zero.');
    if (url) void this.play(url, { gain: 0.35, lowpass: 2600, into: this.beds.station?.gain });
  }

  async play(url: string, o: { gain?: number; lowpass?: number; pan?: number; into?: AudioNode; reverb?: number } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const buf = await this.buffer(url);
    if (!buf) return;
    const src = this.track(ctx.createBufferSource());
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = o.gain ?? 1;
    let node: AudioNode = src.connect(g);
    if (o.lowpass) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = o.lowpass;
      node = node.connect(lp);
    }
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      node = node.connect(p);
    }
    node.connect(o.into ?? this.out);
    if (o.reverb) {
      const send = ctx.createGain();
      send.gain.value = o.reverb;
      node.connect(send).connect(audio.buses.effects);
    }
    src.start();
  }

  /** her scream: on its own gain past the scene's fade, falling away after the cut to black */
  scream() {
    const ctx = this.ctx;
    const url = voiceUrl('aditi_scream');
    if (!ctx || !this.late || !url) return;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.9, t);
    g.gain.setValueAtTime(0.9, t + 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.5);
    g.connect(this.late);
    void this.play(url, { into: g, reverb: 0.12 });
  }

  /** a narration line over the black: close, dry */
  narrate(id: string) {
    const url = voiceUrl(id);
    if (url && this.late) void this.play(url, { into: this.late, gain: 0.95 });
  }

  /** a line of dialogue (a recorded take when there is one) */
  voice(id: string, o: { phone?: boolean } = {}) {
    const url = voiceUrl(id);
    if (!url) return false;
    void this.play(url, o.phone ? { gain: 0.95, pan: -0.15 } : { gain: 1 });
    return true;
  }

  vibrate() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    for (const st of [0, 0.55]) {
      const o = this.track(ctx.createOscillator());
      o.type = 'square';
      o.frequency.value = 165;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      const g = ctx.createGain();
      audio.envelope(g, t + st, 0.02, 0.09, 0.4);
      o.connect(lp).connect(g).connect(this.out);
      o.start(t + st);
      o.stop(t + st + 0.5);
      // the case buzzing against her hand
      audio.burst(t + st, 0.38, 0.025, { type: 'bandpass', f: 2400, q: 6 }, this.out);
    }
  }

  ping() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    audio.tone(1318.5, 'sine', t, 0.004, 0.09, 0.35, this.out);
    audio.tone(1975.5, 'sine', t + 0.11, 0.004, 0.08, 0.5, this.out);
  }

  key() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    audio.burst(ctx.currentTime, 0.012, 0.05, { type: 'bandpass', f: 3400, q: 2 }, this.out);
  }

  sent() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    const f = audio.burst(t, 0.22, 0.05, { type: 'bandpass', f: 900, q: 1.5 }, this.out);
    f.frequency.exponentialRampToValueAtTime(3200, t + 0.22);
  }

  /** a phone ringtone (an original marimba figure), loud enough to make you jump, not a blast */
  startRing() {
    if (this.ringing) return;
    this.ringing = true;
    this.ringLoop();
  }

  private ringLoop() {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.ringing) return;
    const t = ctx.currentTime + 0.02;
    const notes = [[0, 76], [0.18, 83], [0.36, 88], [0.54, 86], [0.9, 83], [1.08, 79], [1.26, 81], [1.44, 76]];
    for (const [at, n] of notes) {
      const f = 440 * 2 ** ((n - 69) / 12);
      for (const [m, a, d] of [[1, 0.16, 0.42], [4, 0.04, 0.12], [10, 0.012, 0.05]]) {
        const o = this.track(ctx.createOscillator());
        o.frequency.value = f * m;
        const g = ctx.createGain();
        audio.envelope(g, t + at, 0.003, a, d);
        o.connect(g).connect(this.out);
        o.start(t + at);
        o.stop(t + at + d + 0.05);
      }
    }
    this.ringTimer = window.setTimeout(() => this.ringLoop(), 2200);
  }

  stopRing() {
    this.ringing = false;
    window.clearTimeout(this.ringTimer);
  }

  click() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    audio.burst(ctx.currentTime, 0.02, 0.06, { type: 'bandpass', f: 2000, q: 2 }, this.out);
  }

  /** the line going dead: three short tones */
  hangup() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) audio.tone(425, 'sine', t + i * 0.32, 0.005, 0.07, 0.18, this.out);
  }

  /** a child's giggle from the station: the recorded take, or a synthesised one */
  giggle() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const url = voiceUrl('child_giggle');
    if (url) return void this.play(url, { gain: 0.5, lowpass: 3200, pan: -0.25, reverb: 0.15 });
    // fallback: three breathy, high voiced "hih"s through a child's formants, far off
    const t = ctx.currentTime;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2800;
    const pan = ctx.createStereoPanner();
    pan.pan.value = -0.25;
    lp.connect(pan).connect(this.out);
    [0, 0.17, 0.33, 0.52].forEach((at, i) => {
      const o = this.track(ctx.createOscillator());
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(520 - i * 18, t + at);
      o.frequency.linearRampToValueAtTime(470 - i * 22, t + at + 0.12);
      const g = ctx.createGain();
      audio.envelope(g, t + at, 0.015, 0.03 * (1 - i * 0.15), 0.11);
      for (const [f, q] of [[1000, 6], [2600, 8], [3600, 9]]) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        o.connect(bp).connect(g);
      }
      g.connect(lp);
      o.start(t + at);
      o.stop(t + at + 0.2);
      audio.burst(t + at, 0.1, 0.012, { type: 'highpass', f: 2500 }, lp);
    });
  }

  /** a short, dry stir in the static as something touches the line */
  crackle() {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) audio.burst(t + Math.random() * 0.4, 0.015, 0.05, { type: 'highpass', f: 3000 }, this.out);
  }
}

/** when the door slams (s): everything from the station stops at this instant */
export const SLAM = 3.0;
/** the sound fades to nothing over this span before the child's face */
export const FADE_ALL: [number, number] = [121.5, 124.5];

export const sound = new CineSound();
