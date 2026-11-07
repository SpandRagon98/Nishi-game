import { audio } from './engine';

/**
 * Adaptive horror score, synthesised live:
 * - a tanpura (Karplus-Strong plucked strings, Pa-Sa-Sa-Sa) tuned slightly flat so it never settles
 * - a low string cluster built on Sa and komal Re, swelling with threat
 * - high, trembling strings when the Caller is near
 * - dhol/tasha chase percussion and a rising Shepard tone during hunts
 */
export type Mood = 'silent' | 'menu' | 'explore' | 'tension' | 'hunt';

const SA = 138.59 * Math.pow(2, -22 / 1200); // C#3, flattened by 22 cents

class Music {
  private mood: Mood = 'silent';
  private started = false;
  private strings: Map<number, AudioBuffer> = new Map();
  private layers: Record<'tanpura' | 'pad' | 'high' | 'perc' | 'shepard', GainNode> | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private nextPluck = 0;
  private pluckIdx = 0;
  private nextBeat = 0;
  private beatIdx = 0;
  private timer = 0;
  private lastScare = 0;

  private ensure() {
    const ctx = audio.ctx;
    if (!ctx || this.started) return !!ctx && this.started;
    this.started = true;
    const bus = audio.buses.music;
    const mk = () => {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(bus);
      return g;
    };
    this.layers = { tanpura: mk(), pad: mk(), high: mk(), perc: mk(), shepard: mk() };

    // tanpura string buffers
    for (const f of [SA * 0.75, SA, SA * 0.5]) this.strings.set(f, this.pluckBuffer(ctx, f));

    // low strings: Sa, komal Re and Pa, three detuned saws each
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.8;
    lp.connect(this.layers.pad);
    this.padFilter = lp;
    for (const f of [SA / 2, (SA / 2) * Math.pow(2, 1 / 12), (SA / 2) * 1.5, SA]) {
      for (const det of [-11, 0, 13]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.035;
        // slow, independent swells so the cluster breathes
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.04 + Math.random() * 0.06;
        const lg = ctx.createGain();
        lg.gain.value = 0.025;
        lfo.connect(lg).connect(g.gain);
        o.connect(g).connect(lp);
        o.start();
        lfo.start();
      }
    }
    // high trembling strings: a semitone cluster up top
    const hp = ctx.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 1300;
    hp.Q.value = 0.7;
    hp.connect(this.layers.high);
    for (const f of [SA * 4, SA * 4 * Math.pow(2, 1 / 12), SA * 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const trem = ctx.createOscillator();
      trem.frequency.value = 7 + Math.random() * 3;
      const tg = ctx.createGain();
      tg.gain.value = 0.02;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      trem.connect(tg).connect(g.gain);
      o.connect(g).connect(hp);
      o.start();
      trem.start();
    }
    // Shepard tone: octave-spaced sines forever rising, faded at the extremes
    const voices = 6;
    for (let i = 0; i < voices; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g).connect(this.layers.shepard);
      o.start();
      const cycle = 9;
      const tick = () => {
        if (!audio.ctx) return;
        const t = audio.ctx.currentTime;
        const phase = ((t / cycle + i / voices) % 1 + 1) % 1;
        const f = 55 * Math.pow(2, phase * voices);
        o.frequency.setTargetAtTime(f, t, 0.05);
        g.gain.setTargetAtTime(0.05 * Math.sin(phase * Math.PI), t, 0.05);
      };
      window.setInterval(tick, 60);
    }

    this.timer = window.setInterval(() => this.schedule(), 60);
    return true;
  }

  private pluckBuffer(ctx: AudioContext, f: number) {
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 4.5);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const period = Math.round(sr / f);
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const next = (idx + 1) % period;
      const avg = 0.4985 * (line[idx] + line[next]);
      // the tanpura's buzzing bridge (jawari): a touch of nonlinearity
      line[idx] = avg + 0.012 * Math.tanh(avg * 8);
      d[i] = line[idx] * (i < 200 ? i / 200 : 1);
      idx = next;
    }
    return buf;
  }

  private pluck(f: number, t: number, gain: number) {
    const ctx = audio.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.strings.get(f)!;
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.002;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.layers!.tanpura);
    src.start(t);
  }

  private drum(kind: 'dagga' | 'tasha', t: number, accent: number) {
    const ctx = audio.ctx!;
    const dest = this.layers!.perc;
    if (kind === 'dagga') {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(115, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.22);
      const g = ctx.createGain();
      audio.envelope(g, t, 0.003, 0.8 * accent, 0.32);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.4);
      audio.burst(t, 0.05, 0.25 * accent, { type: 'lowpass', f: 900 }, dest);
    } else {
      audio.burst(t, 0.06, 0.38 * accent, { type: 'bandpass', f: 2400 + Math.random() * 800, q: 1.4 }, dest);
      audio.tone(520 + Math.random() * 60, 'triangle', t, 0.002, 0.05 * accent, 0.08, dest);
    }
  }

  private schedule() {
    const ctx = audio.ctx;
    if (!ctx || !this.layers) return;
    const t = ctx.currentTime;
    const ahead = t + 0.25;
    // tanpura cycle: Pa, Sa, Sa, low Sa
    const pattern = [SA * 0.75, SA, SA, SA * 0.5];
    if (this.nextPluck < t) this.nextPluck = t + 0.05;
    while (this.nextPluck < ahead) {
      this.pluck(pattern[this.pluckIdx % 4], this.nextPluck, this.pluckIdx % 4 === 3 ? 0.55 : 0.4);
      this.pluckIdx++;
      this.nextPluck += 1.18 + (this.pluckIdx % 4 === 0 ? 0.5 : 0);
    }
    // hunt percussion: dhol pattern on a 16-step grid at 138 bpm
    if (this.mood === 'hunt') {
      const step = 60 / 138 / 4;
      const dagga = [0, 3, 6, 10, 12];
      const tasha = [2, 5, 7, 8, 11, 13, 14, 15];
      if (this.nextBeat < t) this.nextBeat = t + 0.05;
      while (this.nextBeat < ahead) {
        const s = this.beatIdx % 16;
        if (dagga.includes(s)) this.drum('dagga', this.nextBeat, s === 0 ? 1 : 0.75);
        if (tasha.includes(s)) this.drum('tasha', this.nextBeat, s % 4 === 3 ? 0.9 : 0.55);
        this.beatIdx++;
        this.nextBeat += step;
      }
    }
    // menu: a scream, very far away, now and then
    if (this.mood === 'menu' && t - this.lastScare > 40 && Math.random() < 0.004) {
      this.lastScare = t;
      const a = Math.random() * Math.PI * 2;
      audio.scream('woman', { x: Math.cos(a) * 60, y: 3, z: Math.sin(a) * 60 }, 0.12);
    }
  }

  private pending: Mood | null = null;

  /** call after a user gesture has unlocked audio: starts the score in the pending mood */
  kick() {
    if (this.started || !audio.ctx) return;
    const m = this.pending ?? 'menu';
    this.mood = 'silent';
    this.setMood(m);
  }

  setMood(m: Mood) {
    if (!this.ensure() || !this.layers) {
      this.pending = m;
      return;
    }
    if (m === this.mood) return;
    this.mood = m;
    const t = audio.ctx!.currentTime;
    const L = this.layers;
    const lvl: Record<Mood, [number, number, number, number, number, number]> = {
      // tanpura, pad, high, perc, shepard, pad cutoff
      silent: [0, 0, 0, 0, 0, 300],
      menu: [0.55, 0.8, 0, 0, 0, 380],
      explore: [0.32, 0.55, 0, 0, 0, 340],
      tension: [0.2, 0.9, 0.55, 0, 0.25, 900],
      hunt: [0.1, 1, 0.9, 0.95, 0.6, 1600],
    };
    const [a, b, c, d, e, cut] = lvl[m];
    L.tanpura.gain.setTargetAtTime(a, t, 1.2);
    L.pad.gain.setTargetAtTime(b, t, m === 'hunt' ? 0.3 : 1.5);
    L.high.gain.setTargetAtTime(c, t, m === 'hunt' ? 0.2 : 1.2);
    L.perc.gain.setTargetAtTime(d, t, m === 'hunt' ? 0.05 : 0.8);
    L.shepard.gain.setTargetAtTime(e, t, 1);
    this.padFilter?.frequency.setTargetAtTime(cut, t, 1);
  }

  get current() {
    return this.mood;
  }

  stop() {
    window.clearInterval(this.timer);
  }
}

export const music = new Music();
