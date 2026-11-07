export type GraphicsPreset = 'low' | 'medium' | 'high';
export type HorrorIntensity = 'low' | 'normal' | 'high';

export interface Settings {
  master: number;
  ambience: number;
  dialogue: number;
  effects: number;
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
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  ambience: 0.8,
  dialogue: 0.9,
  effects: 0.85,
  voiceLines: true,
  subtitles: true,
  brightness: 1,
  reducedFlashing: false,
  reducedShake: false,
  intensity: 'normal',
  graphics: 'medium',
  mouseSensitivity: 1,
  invertY: false,
  fov: 72,
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
  dpr: number;
  shadows: boolean;
  rain: number;
  lightPool: number;
  post: boolean;
  textureSize: number;
}

export function graphicsProfile(p: GraphicsPreset): GraphicsProfile {
  const dev = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
  if (p === 'low') return { dpr: 0.85, shadows: false, rain: 1800, lightPool: 4, post: false, textureSize: 256 };
  if (p === 'high') return { dpr: Math.min(2, dev), shadows: true, rain: 7000, lightPool: 8, post: true, textureSize: 1024 };
  return { dpr: Math.min(1.25, dev), shadows: false, rain: 4000, lightPool: 6, post: true, textureSize: 512 };
}
