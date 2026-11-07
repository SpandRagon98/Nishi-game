import { detectDevice, type DeviceTier } from '../perf/device';

export type GraphicsPreset = 'auto' | 'low' | 'medium' | 'high';
export type HorrorIntensity = 'low' | 'normal' | 'high';

export interface Settings {
  master: number;
  ambience: number;
  dialogue: number;
  effects: number;
  music: number;
  voiceLines: boolean;
  subtitles: boolean;
  brightness: number; // 0.6 – 1.6
  reducedFlashing: boolean;
  reducedShake: boolean;
  intensity: HorrorIntensity;
  graphics: GraphicsPreset;
  mouseSensitivity: number; // 0.2 – 3
  invertY: boolean;
  fov: number;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  ambience: 0.8,
  dialogue: 0.9,
  effects: 0.85,
  music: 0.7,
  voiceLines: true,
  subtitles: true,
  brightness: 1,
  reducedFlashing: false,
  reducedShake: false,
  intensity: 'normal',
  graphics: 'auto',
  mouseSensitivity: 1,
  invertY: false,
  fov: 72,
  showFps: false,
};

export const intensityValue = (i: HorrorIntensity) => (i === 'low' ? 0.6 : i === 'high' ? 1.4 : 1);

const KEY = 'nishi.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>;
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (raw[k] !== undefined && typeof raw[k] === typeof DEFAULT_SETTINGS[k]) (out as Record<string, unknown>)[k] = raw[k];
    }
    // saves from before the adaptive renderer move to 'Auto' graphics once
    if (raw.showFps === undefined) out.graphics = 'auto';
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode) — settings stay in memory */
  }
}

export interface GraphicsProfile {
  tier: DeviceTier;
  /** highest and lowest render resolution the adaptive governor may use */
  dpr: number;
  minDpr: number;
  /** shadow maps (flashlight only) */
  shadows: boolean;
  /** pooled point lights for the station fixtures; every lit pixel pays for each one */
  lightPool: number;
  post: boolean;
  /** screen-space ambient occlusion */
  ao: boolean;
  textureSize: number;
  /** fraction of the drifting fog banks drawn */
  mist: number;
  dust: number;
  /** additive light cones and halos under fixtures */
  shafts: boolean;
  /** small practical lights on props (the shrine diya) */
  propLights: boolean;
}

export function graphicsProfile(p: GraphicsPreset): GraphicsProfile {
  const dev = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  const tier: DeviceTier = p === 'auto' ? detectDevice().tier : p;
  switch (tier) {
    case 'mobile':
      return { tier, dpr: Math.min(1, dev * 0.5), minDpr: 0.5, shadows: false, lightPool: 2, post: false, ao: false, textureSize: 256, mist: 0.35, dust: 0, shafts: false, propLights: false };
    case 'low':
      return { tier, dpr: Math.min(0.9, dev), minDpr: 0.5, shadows: false, lightPool: 3, post: false, ao: false, textureSize: 256, mist: 0.5, dust: 300, shafts: false, propLights: false };
    case 'high':
      return { tier, dpr: Math.min(1.5, dev), minDpr: 0.75, shadows: true, lightPool: 6, post: true, ao: true, textureSize: 1024, mist: 1, dust: 900, shafts: true, propLights: true };
    default:
      return { tier, dpr: Math.min(1, dev), minDpr: 0.6, shadows: false, lightPool: 4, post: true, ao: false, textureSize: 512, mist: 0.75, dust: 500, shafts: true, propLights: true };
  }
}
