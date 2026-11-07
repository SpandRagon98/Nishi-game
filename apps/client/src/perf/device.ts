/**
 * Device capability probe. Runs once, before the first canvas, and classifies the machine into a
 * rendering tier so 'Auto' graphics can pick a profile that holds 40–60 fps. Phones and tablets get
 * their own tier so the same build can be hosted for mobile later.
 */
export type DeviceTier = 'mobile' | 'low' | 'medium' | 'high';

export interface DeviceInfo {
  tier: DeviceTier;
  mobile: boolean;
  gpu: string;
  cores: number;
  memory: number;
}

let cached: DeviceInfo | null = null;

function gpuName(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'none';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return 'unknown';
  }
}

export function classify(p: { ua: string; touch: number; gpu: string; cores: number; memory: number }): DeviceTier {
  const mobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(p.ua) || (/Macintosh/.test(p.ua) && p.touch > 1);
  if (mobile) return 'mobile';
  const g = p.gpu;
  if (/SwiftShader|llvmpipe|Software|Basic Render|none/i.test(g)) return 'low';
  const discrete = /NVIDIA|GeForce|RTX|GTX|Quadro|Radeon (RX|Pro|R9)|Arc\(?TM\)? A|Arc A/i.test(g);
  const apple = /Apple M\d|Apple GPU/i.test(g);
  const integrated = /Intel|UHD|Iris|HD Graphics|Radeon\(TM\) Graphics|Radeon Graphics|Vega \d|Mali|Adreno|PowerVR/i.test(g);
  if (discrete && p.cores >= 6 && p.memory >= 8) return 'high';
  if (discrete || apple) return 'medium';
  if (integrated) return p.cores >= 8 && p.memory >= 8 ? 'medium' : 'low';
  return p.cores >= 8 ? 'medium' : 'low';
}

export function detectDevice(): DeviceInfo {
  if (cached) return cached;
  if (typeof navigator === 'undefined') return (cached = { tier: 'medium', mobile: false, gpu: 'n/a', cores: 4, memory: 4 });
  const nav = navigator as Navigator & { deviceMemory?: number };
  const info = {
    ua: nav.userAgent,
    touch: nav.maxTouchPoints ?? 0,
    gpu: gpuName(),
    cores: nav.hardwareConcurrency ?? 4,
    memory: nav.deviceMemory ?? 8,
  };
  const tier = classify(info);
  cached = { tier, mobile: tier === 'mobile', gpu: info.gpu, cores: info.cores, memory: info.memory };
  return cached;
}
