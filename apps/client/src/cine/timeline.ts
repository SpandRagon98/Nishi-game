/**
 * A reusable cinematic timeline. A sequence is a duration plus timed cues (fire-and-forget events:
 * sounds, voice lines). Everything visible is a pure function of `time`, so play, pause, seek,
 * restart and skip all stay in sync: a scene reads `tl.time` every frame and poses itself.
 */
export interface Cue {
  at: number;
  run: () => void;
}

export interface TimelineHooks {
  /** the clock stopped or started (pause sound, free or lock controls) */
  onPause?: () => void;
  onResume?: () => void;
  /** the clock jumped (restart, skip): stop anything still sounding */
  onSeek?: (t: number) => void;
  onEnd?: () => void;
}

export class Timeline {
  time = 0;
  playing = false;
  ended = false;
  private listeners = new Set<() => void>();

  /**
   * `rate(t)`: how fast the script plays at script time t (1 = as written). Everything stays a function of
   * script time, so a stretch can be quickened without moving a single cue relative to the picture.
   */
  constructor(public duration: number, private cues: Cue[], private hooks: TimelineHooks = {}, private rate: (t: number) => number = () => 1) {
    this.cues = [...cues].sort((a, b) => a.at - b.at);
  }

  private real: number[] | null = null;
  /** seconds of real playback from the start to script time `t` (for the clock and progress bar) */
  realAt(t: number) {
    const step = 0.05;
    if (!this.real) {
      this.real = [0];
      for (let x = 0; x < this.duration; x += step) this.real.push(this.real[this.real.length - 1] + step / this.rate(x + step / 2));
    }
    const i = Math.min(this.real.length - 1, Math.max(0, t / step));
    const lo = Math.floor(i);
    return this.real[lo] + (this.real[Math.min(lo + 1, this.real.length - 1)] - this.real[lo]) * (i - lo);
  }

  /** UI subscribes to play/pause/end changes (not to every frame) */
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
  private emit() {
    for (const fn of this.listeners) fn();
  }

  play() {
    if (this.ended) this.seek(0);
    if (this.playing) return;
    this.playing = true;
    this.hooks.onResume?.();
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    this.hooks.onPause?.();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** jump to `t` without firing the cues in between */
  seek(t: number) {
    this.time = Math.max(0, Math.min(this.duration, t));
    this.ended = this.time >= this.duration;
    this.hooks.onSeek?.(this.time);
    this.emit();
  }

  restart() {
    this.seek(0);
    this.play();
  }

  /** advance the clock; fires every cue in (previous time, new time] */
  update(dt: number) {
    if (!this.playing || this.ended) return;
    const from = this.time;
    const to = Math.min(this.duration, from + dt * this.rate(from));
    this.time = to;
    for (const c of this.cues) {
      if (c.at > from && c.at <= to) c.run();
      else if (from === 0 && c.at === 0) c.run();
    }
    if (to >= this.duration) {
      this.ended = true;
      this.playing = false;
      this.hooks.onEnd?.();
      this.emit();
    }
  }
}

// ───────────────────────────── curves ─────────────────────────────

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** smootherstep: zero velocity and acceleration at both ends */
export const ease = (x: number) => {
  const k = clamp01(x);
  return k * k * k * (k * (k * 6 - 15) + 10);
};
export const easeOut = (x: number) => 1 - (1 - clamp01(x)) ** 3;
export const easeIn = (x: number) => clamp01(x) ** 3;
/** 0 before a, 1 after b, eased between */
export const ramp = (t: number, a: number, b: number, f = ease) => f((t - a) / (b - a));
/** 0 → 1 → 0: up over [a, b], held, down over [c, d] */
export const window4 = (t: number, a: number, b: number, c: number, d: number) => Math.min(ramp(t, a, b), 1 - ramp(t, c, d));
export const mix = (a: number, b: number, k: number) => a + (b - a) * k;

/** a keyframed number: [[time, value], ...], eased between neighbours */
export function track(t: number, keys: [number, number][], f = ease) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      return mix(v0, v1, f((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

/** cheap smooth noise in -1..1 (for hand tremble, breathing camera, flicker) */
export function wobble(t: number, seed = 0) {
  return (Math.sin(t * 1.7 + seed) * 0.5 + Math.sin(t * 3.1 + seed * 2.3) * 0.3 + Math.sin(t * 7.3 + seed * 5.1) * 0.2);
}
