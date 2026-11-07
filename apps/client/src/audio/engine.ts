import type { SfxId, Surface, Vec3 } from '@nishi/shared';

/**
 * Procedural Web Audio engine. Every sound in the game is synthesised at runtime — no recorded or
 * licensed samples are required. Buses: master → { ambience, dialogue, effects }.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  buses!: Record<'ambience' | 'dialogue' | 'effects' | 'music', GainNode>;
  private duck!: GainNode;
  private reverbIn!: GainNode;
  private analyser!: AnalyserNode;
  private levelBuf = new Uint8Array(256);
  noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private night: { wind: GainNode; whistle: GainNode; whistleF: BiquadFilterNode; city: GainNode } | null = null;
  private hum: GainNode | null = null;
  private drone: { gain: GainNode; lp: BiquadFilterNode } | null = null;
  private staticBed: GainNode | null = null;
  private heartbeatAt = 0;
  private volumes = { master: 0.8, ambience: 0.8, dialogue: 0.9, effects: 0.85, music: 0.7 };
  private loops = new Map<string, { stop: () => void }>();
  private ambienceRunning = false;
  private envState = { indoor: false, underground: false, menu: true };
  private timers: number[] = [];

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.duck = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      // a brick-wall-ish limiter keeps stacked screams, drums and reverb from clipping
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -12;
      limiter.knee.value = 8;
      limiter.ratio.value = 14;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      this.master.connect(limiter).connect(this.duck).connect(ctx.destination);
      limiter.connect(this.analyser);
      this.buses = { ambience: ctx.createGain(), dialogue: ctx.createGain(), effects: ctx.createGain(), music: ctx.createGain() };
      // one big, wet, iron-and-concrete hall for everything
      const verb = ctx.createConvolver();
      verb.buffer = this.makeImpulse(3.8, 2.1);
      this.reverbIn = ctx.createGain();
      const verbOut = ctx.createGain();
      verbOut.gain.value = 0.9;
      this.reverbIn.connect(verb).connect(verbOut).connect(this.master);
      const sends = { ambience: 0.12, dialogue: 0.28, effects: 0.42, music: 0.34 } as const;
      for (const [k, b] of Object.entries(this.buses) as [keyof typeof sends, GainNode][]) {
        b.connect(this.master);
        const send = ctx.createGain();
        send.gain.value = sends[k];
        b.connect(send).connect(this.reverbIn);
      }
      this.noise = this.makeNoise(2, false);
      this.brown = this.makeNoise(4, true);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        // sparse early reflections off the platform walls, then a dense dark tail
        const early = t < 0.09 && Math.random() < 0.012 ? (Math.random() * 2 - 1) * 0.8 : 0;
        d[i] = early + (Math.random() * 2 - 1) * Math.pow(1 - t / seconds, decay) * 0.5;
      }
      let lp = 0;
      for (let i = 0; i < len; i++) {
        lp += (d[i] - lp) * (0.25 - 0.2 * (i / len));
        d[i] = lp;
      }
    }
    return buf;
  }

  /** current output loudness 0..1 (drives the prologue's VU needles) */
  level() {
    if (!this.ctx) return 0;
    this.analyser.getByteTimeDomainData(this.levelBuf);
    let peak = 0;
    for (const v of this.levelBuf) peak = Math.max(peak, Math.abs(v - 128) / 128);
    return peak;
  }

  setVolumes(v: Partial<typeof this.volumes>) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.buses.ambience.gain.setTargetAtTime(this.volumes.ambience, t, 0.05);
    this.buses.dialogue.gain.setTargetAtTime(this.volumes.dialogue, t, 0.05);
    this.buses.effects.gain.setTargetAtTime(this.volumes.effects, t, 0.05);
    this.buses.music.gain.setTargetAtTime(this.volumes.music, t, 0.05);
  }

  get dialogueVolume() {
    return this.volumes.master * this.volumes.dialogue;
  }

  private makeNoise(seconds: number, brown: boolean) {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  noiseSrc(loop = true, brown = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }

  /** Positional panner (HRTF) or a plain gain for UI/2D sounds. */
  out(bus: keyof AudioEngine['buses'], pos?: Vec3, ref = 2): AudioNode {
    const ctx = this.ctx!;
    if (!pos) return this.buses[bus];
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = 1.3;
    p.maxDistance = 60;
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    p.connect(this.buses[bus]);
    return p;
  }

  setListener(pos: Vec3, fwd: Vec3) {
    const ctx = this.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    const t = ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.value = 0;
      l.upY.value = 1;
      l.upZ.value = 0;
    }
  }

  envelope(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(freq: number, type: OscillatorType, t: number, a: number, peak: number, d: number, dest: AudioNode, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    this.envelope(g, t, a, peak, d);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  burst(t: number, dur: number, peak: number, filter: { type: BiquadFilterType; f: number; q?: number }, dest: AudioNode, brown = false) {
    const ctx = this.ctx!;
    const s = this.noiseSrc(false, brown);
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.f;
    f.Q.value = filter.q ?? 0.8;
    const g = ctx.createGain();
    this.envelope(g, t, Math.min(0.01, dur / 4), peak, dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
    return f;
  }

  // ───────────────────────────── ambience beds ─────────────────────────────

  startAmbience() {
    if (!this.ctx || this.ambienceRunning) return;
    this.ambienceRunning = true;
    const ctx = this.ctx;

    // night wind moving through the iron shed, with a hollow whistle that comes and goes
    const ws = this.noiseSrc(true, true);
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 320;
    wf.Q.value = 0.5;
    const wind = ctx.createGain();
    wind.gain.value = 0.25;
    ws.connect(wf).connect(wind).connect(this.buses.ambience);
    ws.start();
    const hs = this.noiseSrc();
    const whistleF = ctx.createBiquadFilter();
    whistleF.type = 'bandpass';
    whistleF.frequency.value = 760;
    whistleF.Q.value = 22;
    const whistle = ctx.createGain();
    whistle.gain.value = 0;
    hs.connect(whistleF).connect(whistle).connect(this.buses.ambience);
    hs.start();
    // the city that never quite sleeps: distant traffic rumble beyond the walls
    const cs = this.noiseSrc(true, true);
    const cf = ctx.createBiquadFilter();
    cf.type = 'lowpass';
    cf.frequency.value = 140;
    const city = ctx.createGain();
    city.gain.value = 0.18;
    cs.connect(cf).connect(city).connect(this.buses.ambience);
    cs.start();
    this.night = { wind, whistle, whistleF, city };

    // 50 Hz mains hum from the fluorescent tubes (Indian grid frequency)
    const hum = ctx.createGain();
    hum.gain.value = 0;
    for (const [f, a] of [[50, 0.5], [100, 0.35], [150, 0.15], [200, 0.06]] as const) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = a * 0.08;
      o.connect(g).connect(hum);
      o.start();
    }
    hum.connect(this.buses.ambience);
    this.hum = hum;

    // the Caller's presence: detuned low drone
    const dg = ctx.createGain();
    dg.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 220;
    for (const f of [41.2, 41.9, 61.7]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(dlp);
      o.start();
    }
    dlp.connect(dg).connect(this.buses.ambience);
    this.drone = { gain: dg, lp: dlp };

    // radio static bed (ghost proximity signal)
    const ss = this.noiseSrc();
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 2400;
    sf.Q.value = 0.7;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    ss.connect(sf).connect(sg).connect(this.buses.effects);
    ss.start();
    this.staticBed = sg;

    // sparse random events
    this.every(2, 6, () => this.windGust());
    this.every(7, 22, () => !this.envState.underground && this.honk());
    this.every(1.5, 5, () => !this.envState.indoor && !this.envState.underground && this.crickets());
    this.every(0.6, 3.5, () => (this.envState.underground || Math.random() < 0.3) && this.drip());
    this.every(60, 140, () => this.trainHorn());
    this.every(30, 75, () => !this.envState.underground && this.dogHowl());
  }

  private every(min: number, max: number, fn: () => unknown) {
    const tick = () => {
      if (!this.ctx) return;
      try {
        fn();
      } catch {
        /* never let ambience kill the loop */
      }
      this.timers.push(window.setTimeout(tick, (min + Math.random() * (max - min)) * 1000));
    };
    this.timers.push(window.setTimeout(tick, (min + Math.random() * (max - min)) * 1000));
  }

  /** Called ~10× per second from the game loop. */
  updateAmbience(p: { indoor: boolean; underground: boolean; hum: number; ghostDist: number; hunting: boolean; signalRange: number; menu?: boolean }) {
    if (!this.ctx || !this.night) return;
    this.envState = { indoor: p.indoor, underground: p.underground, menu: !!p.menu };
    const t = this.ctx.currentTime;
    this.night.wind.gain.setTargetAtTime(p.underground ? 0.05 : p.indoor ? 0.14 : 0.26, t, 0.6);
    this.night.city.gain.setTargetAtTime(p.underground ? 0.03 : p.indoor ? 0.1 : 0.18, t, 0.6);
    this.hum!.gain.setTargetAtTime(p.hum, t, 0.2);
    const near = Math.max(0, 1 - p.ghostDist / p.signalRange);
    this.drone!.gain.gain.setTargetAtTime((p.hunting ? 0.14 : 0.06) * near * near + (p.hunting ? 0.03 : 0), t, 0.3);
    this.drone!.lp.frequency.setTargetAtTime(p.hunting ? 420 : 200, t, 0.3);
    this.staticBed!.gain.setTargetAtTime(p.menu ? 0 : near * near * (p.hunting ? 0.11 : 0.05) * (0.6 + Math.random() * 0.8), t, 0.05);
    if (near > 0.35 && !p.menu) {
      const now = performance.now();
      const rate = 1100 - near * 600 - (p.hunting ? 200 : 0);
      if (now - this.heartbeatAt > rate) {
        this.heartbeatAt = now;
        const dest = this.buses.effects;
        this.tone(52, 'sine', t, 0.01, 0.35 * near, 0.18, dest);
        this.tone(48, 'sine', t + 0.22, 0.01, 0.25 * near, 0.2, dest);
      }
    }
  }

  private farPos(dist = 70): Vec3 {
    const a = Math.random() * Math.PI * 2;
    return { x: Math.cos(a) * dist, y: 2, z: Math.sin(a) * dist };
  }

  private windGust() {
    if (!this.night || !this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.night;
    const peak = this.envState.underground ? 0.02 : 0.05 + Math.random() * 0.07;
    n.whistle.gain.cancelScheduledValues(t);
    n.whistle.gain.setTargetAtTime(peak, t, 0.8);
    n.whistle.gain.setTargetAtTime(0, t + 1.5 + Math.random() * 2, 1.2);
    n.whistleF.frequency.setTargetAtTime(560 + Math.random() * 500, t, 1.5);
  }

  private honk() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dest = this.out('ambience', this.farPos(90), 8);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1100;
    f.connect(dest);
    const base = 380 + Math.random() * 160;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.25 + Math.random() * 0.2);
      const len = 0.12 + Math.random() * 0.35;
      for (const m of [1, 1.26]) this.tone(base * m, 'square', st, 0.01, 0.05, len, f);
    }
  }

  private crickets() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const p = this.farPos(12 + Math.random() * 18);
    p.y = -1;
    const dest = this.out('ambience', p, 4);
    const f = 4100 + Math.random() * 600;
    const pulses = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < pulses; i++) {
      const st = t + i * 0.09;
      const o = ctx.createOscillator();
      o.frequency.value = f;
      const g = ctx.createGain();
      this.envelope(g, st, 0.005, 0.018, 0.05);
      o.connect(g).connect(dest);
      o.start(st);
      o.stop(st + 0.07);
    }
  }

  private drip() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const e = this.listenerPos;
    const dest = this.out('effects', { x: e.x + (Math.random() - 0.5) * 10, y: e.y + 1.5, z: e.z + (Math.random() - 0.5) * 10 }, 1.5);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1600 + Math.random() * 1800, t);
    o.frequency.exponentialRampToValueAtTime(600 + Math.random() * 300, t + 0.06);
    const g = ctx.createGain();
    this.envelope(g, t, 0.002, 0.1, 0.08);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.12);
  }

  /** an electric loco's two-tone horn, kilometres away (or right inside the tunnel) */
  trainHorn(near = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.out('ambience', near ? { x: 60, y: 2, z: 11 } : this.farPos(160), near ? 10 : 25);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = near ? 3000 : 1400;
    f.connect(dest);
    const blasts: [number, number][] = [[0, 1.1], [1.4, 2.4]];
    for (const [off, len] of blasts) {
      for (const fr of [466, 554]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr * (near ? 1 : 0.99);
        const g = ctx.createGain();
        this.envelope(g, t + off, 0.08, near ? 0.2 : 0.09, len);
        o.connect(g).connect(f);
        o.start(t + off);
        o.stop(t + off + len + 0.2);
      }
    }
  }

  private dogHowl() {
    const ctx = this.ctx!;
    this.voice(
      { f0: 520, contour: [[0, 0.8], [0.6, 1.1], [2.2, 1.25], [3.2, 0.85]], formants: [[380, 1], [900, 0.45], [2300, 0.15]], dur: 3.2, gain: 0.05, breath: 0.03, vibrato: 4, jitter: 0.01 },
      this.out('ambience', this.farPos(110), 20),
      ctx.currentTime,
    );
  }

  // ───────────────────────────── voices: screams, shrieks, moans ─────────────────────────────

  get listenerPos(): Vec3 {
    const l = this.ctx?.listener;
    return l?.positionX ? { x: l.positionX.value, y: l.positionY.value, z: l.positionZ.value } : { x: 0, y: 0, z: 0 };
  }

  /**
   * Source-filter voice synthesis: a glottal buzz with vibrato and jitter plus aspirated breath,
   * shaped by parallel formant resonances and driven into soft clipping.
   */
  private voice(
    o: {
      f0: number; contour: [number, number][]; formants: [number, number][]; dur: number; gain: number; breath: number;
      vibrato: number; jitter: number; drive?: number; formantShift?: [number, number][];
    },
    dest: AudioNode,
    t: number,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createGain();
    const oscs: OscillatorNode[] = [];
    for (const [type, det, amp] of [['sawtooth', 0, 1], ['sawtooth', 9, 0.6], ['square', -7, 0.25]] as const) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(src);
      oscs.push(osc);
    }
    for (const osc of oscs) {
      osc.frequency.setValueAtTime(o.f0 * o.contour[0][1], t);
      for (const [at, mul] of o.contour.slice(1)) osc.frequency.linearRampToValueAtTime(o.f0 * mul * (1 + (Math.random() - 0.5) * o.jitter * 2), t + at);
    }
    const vib = ctx.createOscillator();
    vib.frequency.value = o.vibrato;
    const vibG = ctx.createGain();
    vibG.gain.value = o.f0 * 0.035;
    vib.connect(vibG);
    for (const osc of oscs) vibG.connect(osc.frequency);
    const n = this.noiseSrc(false);
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.value = o.breath;
    n.connect(nf).connect(ng).connect(src);
    const out = ctx.createGain();
    o.formants.forEach(([f, amp], i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f, t);
      if (o.formantShift?.[i]) bp.frequency.linearRampToValueAtTime(o.formantShift[i][0], t + o.formantShift[i][1]);
      bp.Q.value = 7 + i * 2;
      const g = ctx.createGain();
      g.gain.value = amp * 2;
      src.connect(bp).connect(g).connect(out);
    });
    const ws = ctx.createWaveShaper();
    const drive = o.drive ?? 2.5;
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) curve[i] = Math.tanh(((i - 256) / 256) * drive);
    ws.curve = curve;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(o.gain, t + 0.06);
    env.gain.setValueAtTime(o.gain, t + o.dur * 0.75);
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    out.connect(ws).connect(env).connect(dest);
    for (const osc of oscs) {
      osc.start(t);
      osc.stop(t + o.dur + 0.05);
    }
    vib.start(t);
    vib.stop(t + o.dur + 0.05);
    n.start(t, Math.random());
    n.stop(t + o.dur + 0.05);
    return env;
  }

  /** A human scream. kind decides pitch and vowel; phone = squeezed through a telephone line. */
  scream(kind: 'woman' | 'man' | 'child', pos?: Vec3, gain = 0.5, phone = false) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    let dest: AudioNode = this.out('dialogue', pos, 3);
    if (phone) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 420;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 3200;
      hp.connect(lp).connect(dest);
      dest = hp;
    }
    const f0 = kind === 'man' ? 330 + Math.random() * 90 : kind === 'child' ? 980 : 720 + Math.random() * 160;
    const vowel: [number, number][] = kind === 'man' ? [[730, 1], [1250, 0.6], [2600, 0.3]] : [[920, 1], [1550, 0.65], [3000, 0.35]];
    const dur = 1.6 + Math.random() * 0.9;
    this.voice(
      {
        f0, dur, gain, breath: 0.12, vibrato: 6 + Math.random() * 2, jitter: 0.04, drive: 3.2,
        contour: [[0, 0.78], [0.18, 1.12], [dur * 0.55, 1.05], [dur * 0.8, 1.18], [dur, 0.62]],
        formants: vowel,
        formantShift: [[vowel[0][0] * 0.85, dur], [vowel[1][0] * 1.25, dur], [vowel[2][0], dur]],
      },
      dest,
      t,
    );
  }

  /** The Caller manifesting: an inhuman rising shriek, ring-modulated, with a reversed swell before it. */
  shriek(pos?: Vec3, gain = 0.45) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.out('dialogue', pos, 4);
    const swell = this.noiseSrc(false);
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.setValueAtTime(400, t);
    sf.frequency.exponentialRampToValueAtTime(3000, t + 0.9);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t);
    sg.gain.exponentialRampToValueAtTime(gain * 0.6, t + 0.9);
    sg.gain.linearRampToValueAtTime(0, t + 0.95);
    swell.connect(sf).connect(sg).connect(dest);
    swell.start(t, Math.random());
    swell.stop(t + 1);
    const ring = ctx.createGain();
    ring.gain.value = 0;
    const mod = ctx.createOscillator();
    mod.frequency.value = 57;
    mod.connect(ring.gain);
    ring.connect(dest);
    mod.start(t + 0.9);
    mod.stop(t + 3.4);
    for (const det of [0, 0.5, 1.04]) {
      this.voice(
        {
          f0: 170 * (1 + det * 0.12), dur: 2.4, gain: gain * 0.7, breath: 0.3, vibrato: 11, jitter: 0.12, drive: 4,
          contour: [[0, 0.8], [0.5, 2.6], [1.2, 7.5], [1.9, 6.4], [2.4, 3]],
          formants: [[600, 1], [1400, 0.8], [3300, 0.6]],
          formantShift: [[1100, 2.4], [2400, 2.4], [4200, 2.4]],
        },
        ring,
        t + 0.9,
      );
    }
  }

  /** low, breathy moan of something just out of sight */
  moan(pos: Vec3, gain = 0.2) {
    if (!this.ctx) return;
    this.voice(
      {
        f0: 95 + Math.random() * 40, dur: 2.8 + Math.random(), gain, breath: 0.45, vibrato: 3, jitter: 0.06, drive: 1.6,
        contour: [[0, 0.9], [1.2, 1.15], [2.2, 0.95], [3.2, 0.7]],
        formants: [[330, 1], [800, 0.4], [2400, 0.12]],
      },
      this.out('dialogue', pos, 2),
      this.ctx.currentTime,
    );
  }

  /** orchestral scare: screeching high strings sliding down, a sub hit, and sometimes a scream */
  stinger(pos?: Vec3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.buses.music;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 700;
    hp.connect(dest);
    for (let i = 0; i < 7; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      const f = 1400 + Math.random() * 1300;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 1.6);
      const trem = ctx.createOscillator();
      trem.frequency.value = 13 + Math.random() * 6;
      const tg = ctx.createGain();
      tg.gain.value = 0.5;
      const g = ctx.createGain();
      this.envelope(g, t, 0.015, 0.045, 1.7);
      trem.connect(tg).connect(g.gain);
      o.connect(g).connect(hp);
      o.start(t);
      trem.start(t);
      o.stop(t + 1.8);
      trem.stop(t + 1.8);
    }
    this.tone(38, 'sine', t, 0.005, 0.9, 1.4, this.buses.music);
    this.burst(t, 0.5, 0.5, { type: 'lowpass', f: 300 }, this.buses.music, true);
    if (Math.random() < 0.6) this.scream('woman', pos, 0.3);
  }

  // ───────────────────────────── tape machine ─────────────────────────────

  private tape: { stop: () => void } | null = null;
  tapeStart(reverse = false) {
    if (!this.ctx) return;
    this.tapeStop();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const hiss = this.noiseSrc();
    const hf = ctx.createBiquadFilter();
    hf.type = 'highpass';
    hf.frequency.value = 3500;
    const hg = ctx.createGain();
    hg.gain.value = 0.05;
    hiss.connect(hf).connect(hg).connect(this.buses.dialogue);
    hiss.start(t);
    const motor = ctx.createOscillator();
    motor.type = 'triangle';
    motor.frequency.value = reverse ? 180 : 92;
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.7;
    const wg = ctx.createGain();
    wg.gain.value = 3;
    wow.connect(wg).connect(motor.frequency);
    const mg = ctx.createGain();
    mg.gain.value = reverse ? 0.05 : 0.012;
    motor.connect(mg).connect(this.buses.effects);
    motor.start(t);
    wow.start(t);
    this.burst(t, 0.06, 0.4, { type: 'bandpass', f: 1200, q: 2 }, this.buses.effects);
    this.tape = {
      stop: () => {
        const e = ctx.currentTime;
        hg.gain.setTargetAtTime(0, e, 0.05);
        motor.frequency.setTargetAtTime(20, e, 0.15);
        mg.gain.setTargetAtTime(0, e, 0.2);
        hiss.stop(e + 0.5);
        motor.stop(e + 0.6);
        wow.stop(e + 0.6);
        this.burst(e, 0.06, 0.45, { type: 'bandpass', f: 900, q: 2 }, this.buses.effects);
      },
    };
  }

  tapeStop() {
    this.tape?.stop();
    this.tape = null;
  }

  /** brief total silence, e.g. the instant a hunt begins */
  silence(seconds: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.05, t, 0.05);
    this.duck.gain.setTargetAtTime(1, t + seconds, 0.4);
  }

  // ───────────────────────────── one-shots ─────────────────────────────

  footstep(surface: Surface, pos: Vec3, loud: number, remote = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + Math.random() * 0.01;
    const dest = this.out('effects', remote ? pos : undefined);
    const v = (remote ? 0.9 : 0.35) * loud;
    switch (surface) {
      case 'metal':
        this.burst(t, 0.06, v * 0.6, { type: 'bandpass', f: 1800, q: 2 }, dest);
        this.tone(620 + Math.random() * 300, 'triangle', t, 0.002, v * 0.12, 0.25, dest);
        this.tone(1390 + Math.random() * 200, 'sine', t, 0.002, v * 0.05, 0.35, dest);
        break;
      case 'wood':
        this.tone(110 + Math.random() * 20, 'sine', t, 0.004, v * 0.6, 0.09, dest);
        this.burst(t, 0.05, v * 0.4, { type: 'bandpass', f: 700, q: 1.2 }, dest);
        break;
      case 'gravel':
        for (let i = 0; i < 4; i++) this.burst(t + i * 0.012, 0.03, v * 0.35, { type: 'highpass', f: 2500 + Math.random() * 2000 }, dest);
        this.burst(t, 0.08, v * 0.3, { type: 'bandpass', f: 600 }, dest);
        break;
      case 'water':
        this.burst(t, 0.12, v * 0.5, { type: 'highpass', f: 1800 }, dest);
        this.burst(t + 0.02, 0.18, v * 0.25, { type: 'bandpass', f: 500, q: 3 }, dest);
        break;
      case 'tile':
        this.burst(t, 0.045, v * 0.55, { type: 'bandpass', f: 2600, q: 1.5 }, dest);
        this.tone(180, 'sine', t, 0.003, v * 0.25, 0.05, dest);
        break;
      default:
        this.burst(t, 0.06, v * 0.55, { type: 'bandpass', f: 1100, q: 1 }, dest);
        this.tone(95, 'sine', t, 0.004, v * 0.3, 0.07, dest);
    }
  }

  sfx(id: SfxId, pos?: Vec3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.out('effects', pos, id === 'footsteps' ? 3 : 2);
    switch (id) {
      case 'door_open':
      case 'door_close':
      case 'creak': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 9;
        f.frequency.value = 900;
        const g = ctx.createGain();
        const dur = 0.7 + Math.random() * 0.5;
        o.frequency.setValueAtTime(70, t);
        for (let i = 1; i < 10; i++) o.frequency.linearRampToValueAtTime(50 + Math.random() * 90, t + (dur * i) / 10);
        this.envelope(g, t, 0.05, 0.25, dur);
        o.connect(f).connect(g).connect(dest);
        o.start(t);
        o.stop(t + dur + 0.1);
        if (id === 'door_close') this.tone(70, 'sine', t + dur * 0.8, 0.005, 0.5, 0.25, dest);
        break;
      }
      case 'door_slam':
        this.tone(55, 'sine', t, 0.003, 0.9, 0.5, dest);
        this.burst(t, 0.25, 0.8, { type: 'lowpass', f: 900 }, dest);
        this.burst(t + 0.02, 0.6, 0.2, { type: 'bandpass', f: 300, q: 4 }, dest);
        break;
      case 'locked':
        for (let i = 0; i < 3; i++) this.burst(t + i * 0.09, 0.05, 0.35, { type: 'bandpass', f: 2200, q: 4 }, dest);
        break;
      case 'unlock':
        this.burst(t, 0.04, 0.4, { type: 'bandpass', f: 3000, q: 5 }, dest);
        this.tone(900, 'triangle', t + 0.08, 0.002, 0.1, 0.2, dest);
        break;
      case 'spark':
        for (let i = 0; i < 14; i++) this.burst(t + Math.random() * 0.6, 0.02, 0.5, { type: 'highpass', f: 3000 }, dest);
        this.tone(60, 'square', t, 0.01, 0.2, 0.5, dest);
        break;
      case 'power_up': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(20, t);
        o.frequency.exponentialRampToValueAtTime(100, t + 2);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 400;
        const g = ctx.createGain();
        this.envelope(g, t, 1.5, 0.3, 1.5);
        o.connect(f).connect(g).connect(dest);
        o.start(t);
        o.stop(t + 3.2);
        this.tone(45, 'sine', t + 1.6, 0.005, 0.8, 0.6, dest);
        break;
      }
      case 'gate_motor': {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = 38;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 7;
        const lg = ctx.createGain();
        lg.gain.value = 9;
        lfo.connect(lg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 600;
        const g = ctx.createGain();
        this.envelope(g, t, 0.4, 0.45, 5.8);
        o.connect(f).connect(g).connect(dest);
        o.start(t);
        lfo.start(t);
        o.stop(t + 6.5);
        lfo.stop(t + 6.5);
        for (let i = 0; i < 10; i++) this.burst(t + i * 0.6 + Math.random() * 0.3, 0.12, 0.3, { type: 'bandpass', f: 1500, q: 3 }, dest);
        break;
      }
      case 'phone_ring':
        // Indian ring cadence: 400 Hz × 25 Hz, 0.4 on / 0.2 off / 0.4 on / 2.0 off
        for (let c = 0; c < 4; c++) {
          for (const off of [0, 0.6]) {
            const st = t + c * 3 + off;
            const o = ctx.createOscillator();
            o.frequency.value = 400;
            const am = ctx.createOscillator();
            am.frequency.value = 25;
            const amg = ctx.createGain();
            amg.gain.value = 0.5;
            const g = ctx.createGain();
            g.gain.value = 0;
            g.gain.setValueAtTime(0.18, st);
            g.gain.setValueAtTime(0, st + 0.4);
            const mod = ctx.createGain();
            mod.gain.value = 0.5;
            am.connect(amg).connect(mod.gain);
            o.connect(mod).connect(g).connect(dest);
            o.start(st);
            am.start(st);
            o.stop(st + 0.45);
            am.stop(st + 0.45);
          }
        }
        break;
      case 'footsteps':
        for (let i = 0; i < 6; i++) {
          const st = t + i * 0.55 + Math.random() * 0.05;
          this.tone(85, 'sine', st, 0.004, 0.35, 0.09, dest);
          this.burst(st, 0.06, 0.35, { type: 'bandpass', f: 1000 }, dest);
        }
        break;
      case 'train_creak': {
        const o = ctx.createOscillator();
        const m = ctx.createOscillator();
        const mg = ctx.createGain();
        o.frequency.value = 220 + Math.random() * 200;
        m.frequency.value = o.frequency.value * 1.41;
        mg.gain.value = 180;
        m.connect(mg).connect(o.frequency);
        const g = ctx.createGain();
        this.envelope(g, t, 0.3, 0.12, 2.6);
        o.connect(g).connect(dest);
        o.start(t);
        m.start(t);
        o.stop(t + 3);
        m.stop(t + 3);
        this.tone(70, 'sine', t + 1.2, 0.005, 0.4, 0.8, dest);
        break;
      }
      case 'keypad_ok':
        [880, 1175, 1568].forEach((f, i) => this.tone(f, 'sine', t + i * 0.12, 0.005, 0.15, 0.2, dest));
        break;
      case 'keypad_fail':
        this.tone(140, 'square', t, 0.005, 0.18, 0.6, dest);
        this.tone(147, 'square', t, 0.005, 0.18, 0.6, dest);
        break;
      case 'capture': {
        this.silence(1.4);
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(900, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 1.4);
        const g = ctx.createGain();
        this.envelope(g, t, 0.02, 0.6, 1.4);
        const ws = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i - 128) / 128) * 6);
        ws.curve = curve;
        o.connect(ws).connect(g).connect(this.buses.effects);
        o.start(t);
        o.stop(t + 1.5);
        this.burst(t, 1.2, 0.5, { type: 'bandpass', f: 400, q: 1 }, this.buses.effects, true);
        break;
      }
      case 'revive':
        [392, 523, 659].forEach((f, i) => this.tone(f, 'sine', t + i * 0.15, 0.05, 0.12, 0.5, dest));
        break;
      case 'stun': {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(3200, t);
        o.frequency.exponentialRampToValueAtTime(300, t + 1.2);
        const g = ctx.createGain();
        this.envelope(g, t, 0.01, 0.3, 1.2);
        o.connect(g).connect(dest);
        o.start(t);
        o.stop(t + 1.3);
        this.burst(t, 0.9, 0.4, { type: 'highpass', f: 4000 }, dest);
        break;
      }
      case 'pickup':
        this.burst(t, 0.03, 0.4, { type: 'bandpass', f: 2500, q: 2 }, dest);
        this.tone(660, 'sine', t + 0.03, 0.005, 0.06, 0.25, dest);
        break;
      case 'tape': {
        const f = this.burst(t, 1.4, 0.2, { type: 'bandpass', f: 4000, q: 0.5 }, dest);
        f.frequency.linearRampToValueAtTime(2500, t + 1.4);
        this.tone(1000, 'sine', t, 0.05, 0.04, 1.2, dest, -40);
        break;
      }
      case 'hide':
      case 'unhide':
        this.sfx('creak', pos);
        break;
      case 'scream_distant':
        this.scream(Math.random() < 0.7 ? 'woman' : 'man', pos, 0.22);
        break;
      case 'train_horn':
        this.trainHorn(true);
        break;
      case 'paper':
        for (let i = 0; i < 5; i++) this.burst(t + i * 0.05, 0.06, 0.18, { type: 'highpass', f: 3500 }, dest);
        break;
    }
  }

  /** railway PA chime (original three-note motif) */
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const d = this.buses.dialogue;
    [659.3, 523.3, 392, 523.3].forEach((f, i) => {
      this.tone(f, 'sine', t + i * 0.42, 0.02, 0.16, 1.1, d);
      this.tone(f * 2, 'sine', t + i * 0.42, 0.02, 0.03, 0.7, d);
    });
  }

  radioBurst(fake = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.35, 0.22, { type: 'bandpass', f: fake ? 1500 : 2200, q: 0.9 }, this.buses.dialogue);
    this.tone(fake ? 990 : 1200, 'sine', t + 0.3, 0.005, 0.05, 0.08, this.buses.dialogue);
  }

  whisper(pos?: Vec3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dest = this.out('dialogue', pos, 1);
    for (let i = 0; i < 7; i++) {
      const st = t + i * 0.28 + Math.random() * 0.1;
      const f = this.burst(st, 0.3, 0.16, { type: 'bandpass', f: 1200 + Math.random() * 2400, q: 6 }, dest);
      f.frequency.linearRampToValueAtTime(800 + Math.random() * 3000, st + 0.3);
    }
  }

  /** Continuous positional emitters (reel hiss, echo traps, ringing phone). */
  setLoop(key: string, kind: 'hiss' | 'footsteps' | 'phone', pos: Vec3 | null) {
    if (!this.ctx) return;
    const existing = this.loops.get(key);
    if (!pos) {
      existing?.stop();
      this.loops.delete(key);
      return;
    }
    if (existing) return;
    const ctx = this.ctx;
    if (kind === 'hiss') {
      const s = this.noiseSrc();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 5000;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      s.connect(f).connect(g).connect(this.out('effects', pos, 0.7));
      s.start();
      this.loops.set(key, { stop: () => s.stop() });
    } else {
      let alive = true;
      const tick = () => {
        if (!alive) return;
        this.sfx(kind === 'phone' ? 'phone_ring' : 'footsteps', pos);
        setTimeout(tick, kind === 'phone' ? 12000 : 3300);
      };
      tick();
      this.loops.set(key, { stop: () => (alive = false) });
    }
  }

  stopAllLoops() {
    for (const l of this.loops.values()) l.stop();
    this.loops.clear();
    this.tapeStop();
  }
}

export const audio = new AudioEngine();
