import type { SfxId, Surface, Vec3 } from '@nishi/shared';

/**
 * Procedural Web Audio engine. Every sound in the game is synthesised at runtime — no recorded or
 * licensed samples are required. Buses: master → { ambience, dialogue, effects }.
 */
class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private buses!: Record<'ambience' | 'dialogue' | 'effects', GainNode>;
  private duck!: GainNode;
  private noise!: AudioBuffer;
  private brown!: AudioBuffer;
  private rain: { gain: GainNode; lp: BiquadFilterNode; roof: GainNode } | null = null;
  private hum: GainNode | null = null;
  private drone: { gain: GainNode; lp: BiquadFilterNode } | null = null;
  private staticBed: GainNode | null = null;
  private heartbeatAt = 0;
  private volumes = { master: 0.8, ambience: 0.8, dialogue: 0.9, effects: 0.85 };
  private loops = new Map<string, { stop: () => void }>();
  private ambienceRunning = false;

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.duck = ctx.createGain();
      this.master.connect(this.duck).connect(ctx.destination);
      this.buses = {
        ambience: ctx.createGain(),
        dialogue: ctx.createGain(),
        effects: ctx.createGain(),
      };
      for (const b of Object.values(this.buses)) b.connect(this.master);
      this.noise = this.makeNoise(2, false);
      this.brown = this.makeNoise(4, true);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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

  private noiseSrc(loop = true, brown = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = brown ? this.brown : this.noise;
    s.loop = loop;
    if (loop) s.loopStart = Math.random();
    return s;
  }

  /** Positional panner (HRTF) or a plain gain for UI/2D sounds. */
  private out(bus: keyof AudioEngine['buses'], pos?: Vec3, ref = 2): AudioNode {
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

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, type: OscillatorType, t: number, a: number, peak: number, d: number, dest: AudioNode, detune = 0) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = ctx.createGain();
    this.env(g, t, a, peak, d);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + a + d + 0.05);
    return o;
  }

  private burst(t: number, dur: number, peak: number, filter: { type: BiquadFilterType; f: number; q?: number }, dest: AudioNode, brown = false) {
    const ctx = this.ctx!;
    const s = this.noiseSrc(false, brown);
    const f = ctx.createBiquadFilter();
    f.type = filter.type;
    f.frequency.value = filter.f;
    f.Q.value = filter.q ?? 0.8;
    const g = ctx.createGain();
    this.env(g, t, Math.min(0.01, dur / 4), peak, dur);
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
    // monsoon rain: broadband hiss + roof patter
    const rs = this.noiseSrc();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    const rg = ctx.createGain();
    rg.gain.value = 0.22;
    rs.connect(hp).connect(lp).connect(rg).connect(this.buses.ambience);
    rs.start();
    const roofSrc = this.noiseSrc(true, true);
    const roofF = ctx.createBiquadFilter();
    roofF.type = 'bandpass';
    roofF.frequency.value = 900;
    roofF.Q.value = 0.6;
    const roof = ctx.createGain();
    roof.gain.value = 0.25;
    roofSrc.connect(roofF).connect(roof).connect(this.buses.ambience);
    roofSrc.start();
    this.rain = { gain: rg, lp, roof };

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
  }

  /** Called ~10× per second from the game loop. */
  updateAmbience(p: { indoor: boolean; underground: boolean; hum: number; ghostDist: number; hunting: boolean; signalRange: number; menu?: boolean }) {
    if (!this.ctx || !this.rain) return;
    const t = this.ctx.currentTime;
    const rainLevel = p.underground ? 0.03 : p.indoor ? 0.12 : 0.24;
    this.rain.gain.gain.setTargetAtTime(rainLevel, t, 0.4);
    this.rain.lp.frequency.setTargetAtTime(p.underground ? 500 : p.indoor ? 1400 : 6500, t, 0.4);
    this.rain.roof.gain.setTargetAtTime(p.underground ? 0.02 : p.indoor ? 0.32 : 0.18, t, 0.4);
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

  /** brief total silence, e.g. the instant a hunt begins */
  silence(seconds: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setTargetAtTime(0.05, t, 0.05);
    this.duck.gain.setTargetAtTime(1, t + seconds, 0.4);
  }

  // ───────────────────────────── one-shots ─────────────────────────────

  thunder(delay: number, power: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const dest = this.buses.ambience;
    const f = this.burst(t, 3.5 + power * 2, 0.5 * power, { type: 'lowpass', f: 320 }, dest, true);
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 3);
    for (let i = 0; i < 4; i++) this.burst(t + 0.3 + Math.random() * 2.5, 0.8 + Math.random(), 0.25 * power, { type: 'lowpass', f: 200 }, dest, true);
  }

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
        this.env(g, t, 0.05, 0.25, dur);
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
        this.env(g, t, 1.5, 0.3, 1.5);
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
        this.env(g, t, 0.4, 0.45, 5.8);
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
        this.env(g, t, 0.3, 0.12, 2.6);
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
        this.env(g, t, 0.02, 0.6, 1.4);
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
        this.env(g, t, 0.01, 0.3, 1.2);
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
  }
}

export const audio = new AudioEngine();
