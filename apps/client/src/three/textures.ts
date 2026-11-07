import type { MaterialId } from '@nishi/shared';
import * as THREE from 'three';

/**
 * Procedural PBR texture sets (albedo + roughness + normal), generated on a canvas at load time.
 * Everything is original and tileable; the level uses world-space UVs so tiling is seamless.
 */

export interface TextureSet {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  normalMap: THREE.Texture;
}

// ───────────── tileable value noise ─────────────
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function makeNoise(seed: number) {
  return (x: number, y: number, periodX: number, periodY = periodX) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const wx = (n: number) => ((n % periodX) + periodX) % periodX;
    const wy = (n: number) => ((n % periodY) + periodY) % periodY;
    const a = hash(wx(xi), wy(yi), seed);
    const b = hash(wx(xi + 1), wy(yi), seed);
    const c = hash(wx(xi), wy(yi + 1), seed);
    const d = hash(wx(xi + 1), wy(yi + 1), seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/** fbm over [0,1)² that tiles; base = lattice cells across the texture */
function field(size: number, base: number, octaves: number, seed: number, stretch: [number, number] = [1, 1]) {
  const n = makeNoise(seed);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1;
      let f = 1;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const px = Math.max(1, Math.round(base * f * stretch[0]));
        const py = Math.max(1, Math.round(base * f * stretch[1]));
        sum += amp * n((x / size) * px, (y / size) * py, px, py);
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      out[y * size + x] = sum / norm;
    }
  }
  return out;
}

/** separate periods per axis for stretched noise (grain, streaks) */
function fieldXY(size: number, bx: number, by: number, octaves: number, seed: number) {
  const n = makeNoise(seed);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let amp = 1;
      let f = 1;
      let sum = 0;
      let norm = 0;
      for (let o = 0; o < octaves; o++) {
        const px = Math.max(1, Math.round(bx * f));
        const py = Math.max(1, Math.round(by * f));
        sum += amp * n((x / size) * px, (y / size) * py, px, py);
        norm += amp;
        amp *= 0.5;
        f *= 2;
      }
      out[y * size + x] = sum / norm;
    }
  }
  return out;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

interface Painter {
  size: number;
  rgb: Uint8ClampedArray; // RGBA
  rough: Float32Array;
  height: Float32Array;
}

function painter(size: number): Painter {
  return { size, rgb: new Uint8ClampedArray(size * size * 4), rough: new Float32Array(size * size), height: new Float32Array(size * size) };
}

function put(p: Painter, i: number, r: number, g: number, b: number, rough: number, h: number) {
  p.rgb[i * 4] = r;
  p.rgb[i * 4 + 1] = g;
  p.rgb[i * 4 + 2] = b;
  p.rgb[i * 4 + 3] = 255;
  p.rough[i] = rough;
  p.height[i] = h;
}

function toCanvasTexture(size: number, draw: (img: ImageData) => void, srgb: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  draw(img);
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function finish(p: Painter, normalStrength = 2): TextureSet {
  const { size } = p;
  const map = toCanvasTexture(size, (img) => img.data.set(p.rgb), true);
  const roughnessMap = toCanvasTexture(size, (img) => {
    for (let i = 0; i < size * size; i++) {
      const v = clamp01(p.rough[i]) * 255;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
  }, false);
  const normalMap = toCanvasTexture(size, (img) => {
    const h = p.height;
    const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * normalStrength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * normalStrength;
        const len = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
  }, false);
  return { map, roughnessMap, normalMap };
}

// ───────────── individual materials ─────────────

type Gen = (size: number) => Painter;

const concrete: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 3, 4, 11);
  const fine = field(S, 48, 3, 12);
  const stains = fieldXY(S, 6, 2, 3, 13);
  for (let i = 0; i < S * S; i++) {
    const v = 0.72 + big[i] * 0.35 + (fine[i] - 0.5) * 0.18 - smooth(0.55, 0.75, stains[i]) * 0.25;
    put(p, i, 96 * v, 95 * v, 90 * v, 0.78 + fine[i] * 0.2, fine[i] * 0.6 + big[i] * 0.4);
  }
  return p;
};

const platform: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 2, 4, 21);
  const fine = field(S, 64, 2, 22);
  const tint = field(S, 4, 1, 23);
  const puddle = field(S, 3, 3, 24);
  const tiles = 4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const tx = ((x / S) * tiles) % 1;
      const ty = ((y / S) * tiles) % 1;
      const grout = Math.min(tx, 1 - tx, ty, 1 - ty) < 0.018;
      const cell = hash(Math.floor((x / S) * tiles), Math.floor((y / S) * tiles), 25);
      const wet = smooth(0.56, 0.66, puddle[i]);
      let v = 0.6 + big[i] * 0.3 + (fine[i] - 0.5) * 0.14 + (cell - 0.5) * 0.12 + (tint[i] - 0.5) * 0.1;
      if (grout) v *= 0.45;
      v *= 1 - wet * 0.35;
      put(p, i, 104 * v, 101 * v, 94 * v, grout ? 0.9 : 0.5 - wet * 0.42 + fine[i] * 0.15, grout ? 0 : 0.6 + fine[i] * 0.2);
    }
  }
  return p;
};

/** 4 m wide × 4.2 m tall: dark green railway dado to 1.2 m, cream above, water streaks, peeling paint */
const plaster: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 3, 4, 31);
  const fine = field(S, 40, 3, 32);
  const streak = fieldXY(S, 24, 2, 3, 33);
  const peel = field(S, 6, 4, 34);
  for (let y = 0; y < S; y++) {
    const worldY = (1 - y / S) * 4.2;
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const peeled = smooth(0.64, 0.68, peel[i]);
      const grime = smooth(0.4, 0.9, streak[i]) * (0.4 + 0.6 * (1 - worldY / 4.2));
      let r: number, g: number, b: number, rough: number;
      if (worldY < 1.2) {
        const v = 0.8 + big[i] * 0.3 + (fine[i] - 0.5) * 0.1;
        [r, g, b] = [38 * v, 62 * v, 49 * v];
        rough = 0.45 + fine[i] * 0.2;
      } else if (worldY < 1.26) {
        [r, g, b] = [96, 30, 26];
        rough = 0.5;
      } else {
        const v = 0.82 + big[i] * 0.22 + (fine[i] - 0.5) * 0.08;
        [r, g, b] = [186 * v, 172 * v, 140 * v];
        rough = 0.88;
      }
      if (peeled > 0) {
        const raw = 0.75 + fine[i] * 0.2;
        r = r * (1 - peeled) + 150 * raw * peeled;
        g = g * (1 - peeled) + 140 * raw * peeled;
        b = b * (1 - peeled) + 120 * raw * peeled;
        rough = rough * (1 - peeled) + 0.95 * peeled;
      }
      const dark = 1 - grime * 0.45;
      put(p, i, r * dark, g * dark * 0.98, b * dark * 0.95, rough, fine[i] * 0.3 - peeled * 0.3);
    }
  }
  return p;
};

/** terrazzo floor with brass divider strips every 1.2 m */
const mosaic: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 3, 3, 41);
  const dirt = field(S, 5, 4, 42);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const chip = hash(Math.floor(x / 2.2), Math.floor(y / 2.2), 43);
      let r = 128, g = 122, b = 112;
      if (chip > 0.86) [r, g, b] = [205, 200, 190];
      else if (chip > 0.78) [r, g, b] = [60, 58, 55];
      else if (chip > 0.74) [r, g, b] = [140, 80, 60];
      const v = 0.75 + big[i] * 0.3 - smooth(0.5, 0.8, dirt[i]) * 0.3;
      const tx = ((x / S) * 2) % 1;
      const ty = ((y / S) * 2) % 1;
      const brass = Math.min(tx, 1 - tx, ty, 1 - ty) < 0.006;
      if (brass) put(p, i, 150, 118, 60, 0.35, 0.4);
      else put(p, i, r * v, g * v, b * v, 0.3 + dirt[i] * 0.4, 0.5);
    }
  }
  return p;
};

const rust: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 4, 5, 51);
  const fine = field(S, 60, 2, 52);
  const paint = field(S, 5, 4, 53);
  for (let i = 0; i < S * S; i++) {
    const painted = smooth(0.5, 0.56, paint[i]);
    const v = 0.65 + big[i] * 0.45;
    const pit = fine[i] > 0.78 ? 0.6 : 1;
    const rr = 112 * v * pit, rg = 54 * v * pit, rb = 28 * v * pit;
    const pr = 46, pg = 66, pb = 58;
    put(p, i, rr * (1 - painted) + pr * painted, rg * (1 - painted) + pg * painted, rb * (1 - painted) + pb * painted,
      0.85 - painted * 0.35, big[i] * 0.5 + painted * 0.2 + fine[i] * 0.3);
  }
  return p;
};

const wood: Gen = (S) => {
  const p = painter(S);
  const grain = fieldXY(S, 2, 40, 4, 61);
  const knots = field(S, 6, 3, 62);
  const planks = 4;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const py = ((y / S) * planks) % 1;
      const gap = py < 0.025;
      const tone = hash(Math.floor((y / S) * planks), 0, 63);
      const v = (0.65 + grain[i] * 0.55 + (tone - 0.5) * 0.2) * (knots[i] > 0.75 ? 0.7 : 1);
      if (gap) put(p, i, 18, 12, 8, 0.9, 0);
      else put(p, i, 78 * v, 47 * v, 27 * v, 0.55 + grain[i] * 0.2, 0.6 + grain[i] * 0.3);
    }
  }
  return p;
};

const brick: Gen = (S) => {
  const p = painter(S);
  const fine = field(S, 50, 3, 71);
  const soot = field(S, 3, 4, 72);
  const rows = 26;
  const cols = 8;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ry = (y / S) * rows;
      const row = Math.floor(ry);
      const rx = (x / S) * cols + (row % 2) * 0.5;
      const fy = ry % 1;
      const fx = rx % 1;
      const mortar = fy < 0.12 || fx < 0.035;
      const tone = hash(Math.floor(rx), row, 73);
      const v = (0.7 + tone * 0.35 + (fine[i] - 0.5) * 0.2) * (1 - smooth(0.5, 0.85, soot[i]) * 0.45);
      if (mortar) put(p, i, 92 * v, 88 * v, 80 * v, 0.95, 0);
      else put(p, i, 128 * v, 56 * v, 40 * v, 0.85, 0.7 + fine[i] * 0.3);
    }
  }
  return p;
};

const ballast: Gen = (S) => {
  const p = painter(S);
  const a = field(S, 40, 2, 81);
  const b = field(S, 20, 3, 82);
  const oil = field(S, 3, 3, 83);
  for (let i = 0; i < S * S; i++) {
    const stone = smooth(0.42, 0.6, a[i] * 0.6 + b[i] * 0.4);
    const v = (0.35 + stone * 0.5 + b[i] * 0.2) * (1 - smooth(0.6, 0.8, oil[i]) * 0.4);
    put(p, i, 92 * v, 86 * v, 78 * v, 0.9 - stone * 0.2, stone);
  }
  return p;
};

const corrugated: Gen = (S) => {
  const p = painter(S);
  const streak = fieldXY(S, 30, 3, 3, 91);
  const big = field(S, 4, 4, 92);
  const ribs = 26;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const rib = Math.sin((x / S) * ribs * Math.PI * 2) * 0.5 + 0.5;
      const rusty = smooth(0.45, 0.75, streak[i] * 0.7 + big[i] * 0.3);
      const v = 0.6 + rib * 0.25 + big[i] * 0.2;
      put(p, i, (112 * (1 - rusty) + 120 * rusty) * v, (116 * (1 - rusty) + 62 * rusty) * v, (114 * (1 - rusty) + 34 * rusty) * v,
        0.45 + rusty * 0.45, rib);
    }
  }
  return p;
};

const stone: Gen = (S) => {
  const p = painter(S);
  const fine = field(S, 40, 3, 101);
  const moss = field(S, 4, 4, 102);
  const rows = 5;
  const cols = 3;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const ry = (y / S) * rows;
      const row = Math.floor(ry);
      const rx = (x / S) * cols + (row % 2) * 0.5;
      const joint = ry % 1 < 0.04 || rx % 1 < 0.02;
      const tone = hash(Math.floor(rx), row, 103);
      const m = smooth(0.58, 0.72, moss[i]);
      const v = 0.55 + tone * 0.3 + (fine[i] - 0.5) * 0.25;
      if (joint) put(p, i, 30, 30, 28, 0.95, 0);
      else put(p, i, (70 * (1 - m) + 40 * m) * v, (70 * (1 - m) + 62 * m) * v, (66 * (1 - m) + 34 * m) * v, 0.8, 0.6 + fine[i] * 0.4);
    }
  }
  return p;
};

/** Indian Railways coach side: deep maroon, two cream lines, grime and rust bloom near the bottom (3 m tall). */
const carriage: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 4, 4, 111);
  const streak = fieldXY(S, 20, 2, 3, 112);
  for (let y = 0; y < S; y++) {
    const worldY = (1 - y / S) * 3;
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const line = Math.abs(worldY - 0.95) < 0.03 || Math.abs(worldY - 2.05) < 0.03;
      const panel = (x / S) * 6 % 1 < 0.008;
      const rustB = smooth(0.6, 0.2, worldY) * smooth(0.3, 0.7, big[i]);
      const v = 0.7 + big[i] * 0.3 - smooth(0.5, 0.9, streak[i]) * 0.3;
      let [r, g, b] = line ? [190, 160, 90] : [84, 24, 20];
      r = r * (1 - rustB) + 110 * rustB;
      g = g * (1 - rustB) + 60 * rustB;
      b = b * (1 - rustB) + 30 * rustB;
      put(p, i, r * v * (panel ? 0.5 : 1), g * v * (panel ? 0.5 : 1), b * v * (panel ? 0.5 : 1), 0.5 + rustB * 0.4, panel ? 0 : 0.5 + big[i] * 0.2);
    }
  }
  return p;
};

const ceiling: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 3, 4, 121);
  const damp = field(S, 4, 5, 122);
  const fine = field(S, 50, 2, 123);
  for (let i = 0; i < S * S; i++) {
    const stain = smooth(0.55, 0.7, damp[i]);
    const ring = Math.abs(damp[i] - 0.56) < 0.006 ? 0.6 : 1;
    const v = (0.7 + big[i] * 0.25 + (fine[i] - 0.5) * 0.08) * ring;
    put(p, i, (166 - stain * 60) * v, (162 - stain * 72) * v, (150 - stain * 85) * v, 0.95, fine[i] * 0.4 - stain * 0.2);
  }
  return p;
};

/** glazed white subway tiles, 15 cm, with grime */
const tile: Gen = (S) => {
  const p = painter(S);
  const grime = field(S, 4, 4, 131);
  const fine = field(S, 60, 2, 132);
  const n = 8;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const tx = ((x / S) * n) % 1;
      const ty = ((y / S) * n) % 1;
      const grout = Math.min(tx, 1 - tx, ty, 1 - ty) < 0.04;
      const cell = hash(Math.floor((x / S) * n), Math.floor((y / S) * n), 133);
      const dirty = smooth(0.45, 0.85, grime[i]);
      const cracked = cell > 0.93 && Math.abs(tx - ty) < 0.02;
      const v = (0.85 + cell * 0.1 + (fine[i] - 0.5) * 0.05) * (1 - dirty * 0.55);
      if (grout || cracked) put(p, i, 54, 52, 48, 0.9, 0);
      else put(p, i, 205 * v, 203 * v, 192 * v, 0.18 + dirty * 0.5, 0.8);
    }
  }
  return p;
};

const metal: Gen = (S) => {
  const p = painter(S);
  const big = field(S, 3, 4, 141);
  const scratch = fieldXY(S, 60, 4, 2, 142);
  for (let i = 0; i < S * S; i++) {
    const v = 0.55 + big[i] * 0.3 + (scratch[i] > 0.7 ? 0.15 : 0);
    put(p, i, 70 * v, 72 * v, 74 * v, 0.55 - (scratch[i] > 0.7 ? 0.2 : 0) + big[i] * 0.2, big[i] * 0.3);
  }
  return p;
};

const GENERATORS: Partial<Record<MaterialId, Gen>> = {
  concrete, platform, plaster, mosaic, rust, wood, brick, ballast, corrugated, stone, carriage, ceiling, tile, metal,
};

/** world metres per texture repeat [u, v] */
export const TEXTURE_SCALE: Record<MaterialId, [number, number]> = {
  concrete: [3, 3], platform: [2.4, 2.4], plaster: [4, 4.2], mosaic: [2.4, 2.4], rust: [2, 2], wood: [2, 2], brick: [2, 2],
  ballast: [2, 2], corrugated: [2, 2], stone: [3, 2.4], carriage: [3, 3], ceiling: [3, 3], tile: [1.2, 1.2], metal: [2, 2],
  darkness: [1, 1],
};

const NORMAL_STRENGTH: Partial<Record<MaterialId, number>> = { ballast: 5, brick: 3, stone: 3, corrugated: 4, wood: 1.5, tile: 2.5, mosaic: 0.6 };

export type TextureLibrary = Partial<Record<MaterialId, TextureSet>>;

/** Generates all sets, yielding between each so a loading bar can update. */
export async function generateTextures(size: number, onProgress: (f: number) => void): Promise<TextureLibrary> {
  const lib: TextureLibrary = {};
  const ids = Object.keys(GENERATORS) as MaterialId[];
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    lib[id] = finish(GENERATORS[id]!(size), NORMAL_STRENGTH[id] ?? 2);
    onProgress((k + 1) / ids.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  return lib;
}

let cached: { size: number; lib: TextureLibrary } | null = null;
export async function getTextures(size: number, onProgress: (f: number) => void) {
  if (cached && cached.size === size) {
    onProgress(1);
    return cached.lib;
  }
  const lib = await generateTextures(size, onProgress);
  cached = { size, lib };
  return lib;
}
export const cachedTextures = () => cached?.lib ?? null;

/** Text signage on a canvas (railway yellow boards, posters, timetables). */
export function signTexture(
  w: number, h: number, paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** grime pass for signs */
export function ageCanvas(ctx: CanvasRenderingContext2D, w: number, h: number, amount = 0.35) {
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * w * 0.06 + 2;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(30,22,12,${Math.random() * amount})`);
    g.addColorStop(1, 'rgba(30,22,12,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * w;
    ctx.fillStyle = `rgba(60,35,15,${Math.random() * amount * 0.6})`;
    ctx.fillRect(x, Math.random() * h * 0.4, 1 + Math.random() * 3, h * (0.3 + Math.random() * 0.7));
  }
}
