import * as THREE from 'three';

/**
 * Aditi's clothes, made to fit her own body (the avatar's hoodie and shorts are hidden): a straight
 * knee-length cotton kurti in a taupe-brown block print with cream buttis, a mandarin collar, a
 * buttoned placket and three-quarter sleeves; loose off-white salwar gathered at the ankles.
 *
 * Everything is built in the avatar's bind space (T-pose, metres, feet at y = 0, facing +z, her left
 * +x) and skinned to her skeleton:
 * - the kurti's body and sleeves are tubes fitted to slices of her hoodie (the avatar has no skin
 *   under its clothes), skinned like the hoodie;
 * - the salwar is her legs lifted off along their normals (one midpoint subdivision first), so it
 *   bends exactly as she does and never sinks into her;
 * - the kurti's skirt hangs straight from her hips over both legs, front and back panels open at
 *   the side slits, following her legs only partly as she walks;
 * - the collar is a band round her neck.
 */
type V3 = THREE.Vector3;
const smooth = THREE.MathUtils.smoothstep;
const SLEEVE_END = 0.445; // |x| where the three-quarter sleeves end (mid forearm)
const NECK_Y = 1.258; // the base of her neck, where the collar sits
const SKIRT_TOP = 0.95; // the skirt starts just inside the kurti's body and comes out at its hem
const BODY_HEM = 0.9;
const HEM = 0.43; // just below the knee
const SLIT = 0.68; // side slits open from here down
const ANKLE = 0.102;

interface Src {
  pos: V3[];
  nrm: V3[];
  si: number[][];
  sw: number[][];
  tris: [number, number, number][];
}

/** the body mesh, welded by position (its UV seams split vertices), with smooth normals */
function weld(body: THREE.SkinnedMesh): Src {
  const g = body.geometry;
  const P = g.getAttribute('position');
  const SI = g.getAttribute('skinIndex');
  const SW = g.getAttribute('skinWeight');
  const n = P.count;
  const idx = g.index ? Array.from(g.index.array) : [...Array(n).keys()];
  const key = new Map<string, number>();
  const map: number[] = [];
  const src: Src = { pos: [], nrm: [], si: [], sw: [], tris: [] };
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(P, i);
    const k = `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
    let j = key.get(k);
    if (j === undefined) {
      j = src.pos.length;
      key.set(k, j);
      src.pos.push(p);
      src.nrm.push(new THREE.Vector3());
      src.si.push([SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)]);
      src.sw.push([SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)]);
    }
    map[i] = j;
  }
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [map[idx[t]], map[idx[t + 1]], map[idx[t + 2]]];
    if (a === b || b === c || a === c) continue;
    src.tris.push([a, b, c]);
    const fn = e1.subVectors(src.pos[b], src.pos[a]).cross(e2.subVectors(src.pos[c], src.pos[a]));
    for (const v of [a, b, c]) src.nrm[v].add(fn);
  }
  for (const v of src.nrm) v.normalize();
  return src;
}

/** the average of two vertices' skin weights, kept to the four largest */
function mixWeights(ia: number[], wa: number[], ib: number[], wb: number[]) {
  const m = new Map<number, number>();
  for (let k = 0; k < 4; k++) {
    m.set(ia[k], (m.get(ia[k]) ?? 0) + wa[k] * 0.5);
    m.set(ib[k], (m.get(ib[k]) ?? 0) + wb[k] * 0.5);
  }
  const top = [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
  const s = top.reduce((acc, [, w]) => acc + w, 0) || 1;
  while (top.length < 4) top.push([0, 0]);
  return { si: top.map(([b]) => b), sw: top.map(([, w]) => w / s) };
}

interface Piece {
  pos: V3[];
  nrm: V3[];
  si: number[][];
  sw: number[][];
  tris: [number, number, number][];
}

/** the triangles of `src` that `keep` accepts, subdivided once (midpoints, normals interpolated) */
function cutAndSubdivide(src: Src, keep: (tri: V3[]) => boolean): Piece {
  const out: Piece = { pos: [], nrm: [], si: [], sw: [], tris: [] };
  const remap = new Map<number, number>();
  const vert = (i: number) => {
    let j = remap.get(i);
    if (j === undefined) {
      j = out.pos.length;
      remap.set(i, j);
      out.pos.push(src.pos[i].clone());
      out.nrm.push(src.nrm[i].clone());
      out.si.push(src.si[i]);
      out.sw.push(src.sw[i]);
    }
    return j;
  };
  const mids = new Map<string, number>();
  const mid = (a: number, b: number) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    let j = mids.get(k);
    if (j === undefined) {
      j = out.pos.length;
      mids.set(k, j);
      out.pos.push(out.pos[a].clone().lerp(out.pos[b], 0.5));
      out.nrm.push(out.nrm[a].clone().add(out.nrm[b]).normalize());
      const w = mixWeights(out.si[a], out.sw[a], out.si[b], out.sw[b]);
      out.si.push(w.si);
      out.sw.push(w.sw);
    }
    return j;
  };
  for (const [a0, b0, c0] of src.tris) {
    if (!keep([src.pos[a0], src.pos[b0], src.pos[c0]])) continue;
    const [a, b, c] = [vert(a0), vert(b0), vert(c0)];
    const [ab, bc, ca] = [mid(a, b), mid(b, c), mid(c, a)];
    out.tris.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
  }
  return out;
}

/**
 * a piece to a skinned geometry: lifted along the normals by `ease`, per-corner garment coordinates
 * from `coords` (triangle centroid, corner) with the seam where u wraps fixed by `wrap`
 */
function toGeometry(
  p: Piece,
  ease: (q: V3, n: V3) => number,
  coords: (centroid: V3, q: V3) => [number, number, number],
  wrap: (centroid: V3) => number,
) {
  const pos = p.pos.map((q, i) => q.clone().addScaledVector(p.nrm[i], ease(q, p.nrm[i])));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos.flatMap((q) => [q.x, q.y, q.z]), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(p.si.flat(), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(p.sw.flat(), 4));
  g.setIndex(p.tris.flat());
  g.computeVertexNormals();
  const flat = g.toNonIndexed();
  // garment coordinates per corner: (u around, v down the body, placket flag) in metres
  const gar = new Float32Array(flat.getAttribute('position').count * 3);
  const c = new THREE.Vector3();
  p.tris.forEach(([a, b, d], t) => {
    c.copy(p.pos[a]).add(p.pos[b]).add(p.pos[d]).divideScalar(3);
    const uv = [a, b, d].map((i) => coords(c, p.pos[i]));
    const w = wrap(c);
    const us = uv.map((x) => x[0]);
    if (Math.max(...us) - Math.min(...us) > w / 2) for (const x of uv) if (x[0] < 0) x[0] += w;
    uv.forEach((x, k) => gar.set(x, (t * 3 + k) * 3));
  });
  flat.setAttribute('gar', new THREE.BufferAttribute(gar, 3));
  return flat;
}

/** 2D convex hull (monotone chain) of (x, z) points */
function hull(pts: THREE.Vector2[]) {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo: THREE.Vector2[] = [];
  const hi: THREE.Vector2[] = [];
  for (const p of s) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (const p of [...s].reverse()) {
    while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop();
    hi.push(p);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

/** how far from `c` along `d` the hull's edge is */
function hullRadius(h: THREE.Vector2[], c: THREE.Vector2, d: THREE.Vector2) {
  let best = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i];
    const b = h[(i + 1) % h.length];
    const e = new THREE.Vector2().subVectors(b, a);
    const den = d.x * e.y - d.y * e.x;
    if (Math.abs(den) < 1e-9) continue;
    const ac = new THREE.Vector2().subVectors(a, c);
    const t = (ac.x * e.y - ac.y * e.x) / den;
    const s = (ac.x * d.y - ac.y * d.x) / den;
    if (t > 0 && s >= 0 && s <= 1) best = Math.max(best, t);
  }
  return best;
}

/** a mesh's bind-space points and skin weights (to copy weights from the nearest one) */
interface Cloud {
  pos: V3[];
  si: number[][];
  sw: number[][];
}

function cloudOf(m: THREE.SkinnedMesh): Cloud {
  const P = m.geometry.getAttribute('position');
  const SI = m.geometry.getAttribute('skinIndex');
  const SW = m.geometry.getAttribute('skinWeight');
  const c: Cloud = { pos: [], si: [], sw: [] };
  for (let i = 0; i < P.count; i++) {
    c.pos.push(new THREE.Vector3().fromBufferAttribute(P, i));
    c.si.push([SI.getX(i), SI.getY(i), SI.getZ(i), SI.getW(i)]);
    c.sw.push([SW.getX(i), SW.getY(i), SW.getZ(i), SW.getW(i)]);
  }
  return c;
}

function nearest(c: Cloud, q: V3) {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < c.pos.length; i++) {
    const d = c.pos[i].distanceToSquared(q);
    if (d < bd) (bd = d), (best = i);
  }
  return best;
}

/**
 * a tube of rings round an axis, each ring the hull of a slice of `pts` (lifted by `ease`), skinned
 * like the nearest point of `skin`. Axis 'y': rings in (x, z), angle 0 at her front, seam at her back.
 * Axis 'x' (a sleeve on `side`): rings in (z, y), angle 0 on top, seam under the arm.
 */
function tube(o: {
  axis: 'y' | 'x';
  side?: number;
  stations: number[];
  pts: V3[];
  band: number;
  keep: (q: V3, s: number) => boolean;
  ease: (s: number, a: number) => number;
  /** a ring's own radius instead of the slice's hull (the shoulders up to the neck) */
  ring?: (s: number, a: number) => number | null;
  skin: Cloud;
  uScale: number;
  placket?: boolean;
  na?: number;
}) {
  const NA = o.na ?? 48;
  const radii: number[][] = [];
  const centres: THREE.Vector2[] = [];
  for (const s of o.stations) {
    const sl = o.pts.filter((q) => Math.abs((o.axis === 'y' ? q.y : q.x) - s) < o.band && o.keep(q, s));
    const p2 = sl.map((q) => (o.axis === 'y' ? new THREE.Vector2(q.x, q.z) : new THREE.Vector2(q.z, q.y)));
    const box = new THREE.Box2().setFromPoints(p2.length ? p2 : [new THREE.Vector2()]);
    const c = box.getCenter(new THREE.Vector2());
    if (o.axis === 'y') c.x = 0;
    const h = p2.length >= 3 ? hull(p2) : [];
    const r: number[] = [];
    for (let i = 0; i <= NA; i++) {
      const a = -Math.PI + (i / NA) * Math.PI * 2;
      // axis y: angle 0 = +z (her front); axis x: angle 0 = +y (the top of the arm)
      const d = o.axis === 'y' ? new THREE.Vector2(Math.sin(a), Math.cos(a)) : new THREE.Vector2(Math.sin(a), Math.cos(a));
      r.push(h.length ? hullRadius(h, c, d) : 0);
    }
    radii.push(r);
    centres.push(c);
  }
  // smooth the rings into each other
  const sm = radii.map((r, j) => r.map((v, i) => (radii[Math.max(0, j - 1)][i] + 2 * v + radii[Math.min(radii.length - 1, j + 1)][i]) / 4));
  const pos: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const gar: number[] = [];
  const q = new THREE.Vector3();
  o.stations.forEach((s, j) => {
    const c = centres[j];
    for (let i = 0; i <= NA; i++) {
      const a = -Math.PI + (i / NA) * Math.PI * 2;
      const own = o.ring?.(s, a);
      const r = (own ?? sm[j][i]) + o.ease(s, a);
      if (o.axis === 'y') q.set(c.x + Math.sin(a) * r, s, c.y + Math.cos(a) * r);
      else q.set(s, c.y + Math.cos(a) * r, c.x + Math.sin(a) * r);
      pos.push(q.x, q.y, q.z);
      const k = nearest(o.skin, q);
      si.push(...o.skin.si[k]);
      sw.push(...o.skin.sw[k]);
      gar.push(a * o.uScale, o.axis === 'y' ? s : Math.abs(s), o.placket ? 1 : 0);
    }
  });
  const idx: number[] = [];
  const flip = o.axis === 'x' && (o.side ?? 1) < 0;
  for (let j = 0; j < o.stations.length - 1; j++) {
    for (let i = 0; i < NA; i++) {
      const a = j * (NA + 1) + i;
      const b = a + NA + 1;
      if (flip) idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('gar', new THREE.Float32BufferAttribute(gar, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** the skirt: front and back panels from the hips to the knee, straight-hanging, slit at the sides */
function skirt(pts: V3[], bone: (n: string) => number) {
  const NV = 20;
  const NU = 26; // per panel
  const C = new THREE.Vector2(0, -0.012);
  const rings: number[][] = []; // radius per angle sample (full circle, 4 * NU steps)
  const NA = NU * 4;
  let prev: number[] | null = null;
  for (let j = 0; j <= NV; j++) {
    const y = THREE.MathUtils.lerp(SKIRT_TOP, HEM, j / NV);
    const sl = pts.filter((q) => Math.abs(q.y - y) < 0.03 && Math.abs(q.x) < 0.26).map((q) => new THREE.Vector2(q.x, q.z));
    const h = hull(sl);
    const r: number[] = [];
    for (let i = 0; i < NA; i++) {
      const a = (i / NA) * Math.PI * 2;
      const d = new THREE.Vector2(Math.sin(a), Math.cos(a));
      // hangs straight: never narrower than the ring above it; a little A-line flare
      const base = Math.max(sl.length >= 3 ? hullRadius(h, C, d) : 0, prev ? prev[i] : 0);
      r.push(base);
    }
    prev = r;
    rings.push(r);
  }
  const hips = bone('Hips');
  const legL = bone('LeftUpLeg');
  const legR = bone('RightUpLeg');
  const panel = (back: boolean) => {
    const pos: number[] = [];
    const si: number[] = [];
    const sw: number[] = [];
    const gar: number[] = [];
    for (let j = 0; j <= NV; j++) {
      const y = THREE.MathUtils.lerp(SKIRT_TOP, HEM, j / NV);
      // below the slit's top the side edges part a little
      const gap = 0.09 * smooth(SLIT - y, 0, 0.05);
      for (let i = 0; i <= NU; i++) {
        const f = i / NU;
        const a = (back ? Math.PI / 2 : -Math.PI / 2) + gap + f * (Math.PI - 2 * gap);
        const ri = Math.round(((a / (Math.PI * 2)) % 1 + 1) % 1 * NA) % NA;
        const rad = rings[j][ri] - 0.007 + 0.03 * smooth(SKIRT_TOP - y, 0, 0.17) + Math.max(0, 0.86 - y) * 0.1;
        const x = C.x + Math.sin(a) * rad;
        const z = C.y + Math.cos(a) * rad;
        pos.push(x, y, z);
        // follows her legs more the lower it hangs, each side its own leg
        const k = smooth(SKIRT_TOP - y, 0.02, SKIRT_TOP - HEM) * 0.62;
        const l = THREE.MathUtils.clamp(0.5 + Math.sin(a) * 0.9, 0, 1);
        si.push(hips, legL, legR, 0);
        sw.push(1 - k, k * l, k * (1 - l), 0);
        gar.push((a - (back ? Math.PI : 0)) * 0.16, y, 0);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const a = j * (NU + 1) + i;
        const b = a + NU + 1;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setAttribute('gar', new THREE.Float32BufferAttribute(gar, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  return [panel(false), panel(true)];
}

/** the mandarin collar: a band round the base of her neck, open a little at the front */
function collar(head: THREE.SkinnedMesh | undefined, bone: (n: string) => number) {
  const pts: THREE.Vector2[] = [];
  const all: V3[] = [];
  if (head) {
    const P = head.geometry.getAttribute('position');
    for (let i = 0; i < P.count; i++) all.push(new THREE.Vector3().fromBufferAttribute(P, i));
  }
  for (const q of all) if (q.y > 1.228 && q.y < 1.262) pts.push(new THREE.Vector2(q.x, q.z));
  const h = hull(pts);
  const C = pts.reduce((s, p) => s.add(p), new THREE.Vector2()).divideScalar(Math.max(1, pts.length));
  const NU = 40;
  const pos: number[] = [];
  const si: number[] = [];
  const sw: number[] = [];
  const gar: number[] = [];
  const s2 = bone('Spine2');
  const nk = bone('Neck');
  const ys = [NECK_Y - 0.004, NECK_Y + 0.016, NECK_Y + 0.036];
  ys.forEach((y, j) => {
    for (let i = 0; i <= NU; i++) {
      const a = 0.16 + (i / NU) * (Math.PI * 2 - 0.32);
      const d = new THREE.Vector2(Math.sin(a), Math.cos(a));
      const r = hullRadius(h, C, d) + 0.011 - j * 0.002;
      pos.push(C.x + d.x * r, y, C.y + d.y * r);
      si.push(s2, nk, 0, 0);
      sw.push(0.65 - j * 0.12, 0.35 + j * 0.12, 0, 0);
      gar.push(a * 0.06, y, 0);
    }
  });
  const idx: number[] = [];
  for (let j = 0; j < ys.length - 1; j++) {
    for (let i = 0; i < NU; i++) {
      const a = j * (NU + 1) + i;
      const b = a + NU + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('gar', new THREE.Float32BufferAttribute(gar, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ── fabrics ──

/** the print: taupe-brown cotton, cream buttis (little flowers on a stem) in a half-drop repeat */
function printTexture() {
  // 1024² for one 8.5 cm repeat: the threads, the slub and the edges of each printed flower hold up in a close-up
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const rnd = mulberry(7);
  g.fillStyle = '#5e4d40';
  g.fillRect(0, 0, S, S);
  // dye: soft uneven patches (wrapped, so the tile still repeats)
  for (let i = 0; i < 70; i++) {
    const x = rnd() * S, y = rnd() * S, r = S * (0.05 + rnd() * 0.12);
    const col = rnd() < 0.5 ? '120,100,82' : '52,40,31';
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, `rgba(${col},0.07)`);
      gr.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = gr;
      g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  // the plain weave: a lighter warp thread and a darker weft one, alternating
  for (let i = 0; i < S; i += 2) {
    g.fillStyle = `rgba(255,236,210,${0.025 + rnd() * 0.02})`;
    g.fillRect(i, 0, 1, S);
    g.fillStyle = `rgba(20,12,6,${0.03 + rnd() * 0.025})`;
    g.fillRect(0, i, S, 1);
  }
  // slub: thick and thin places in the cotton yarn, mostly along the weft
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? '255,240,220' : '30,20,12'},${0.03 + rnd() * 0.04})`;
    g.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 18, 1 + (rnd() < 0.2 ? 1 : 0));
  }
  // one hand-block flower, drawn once: shaded petals, a stem and two leaves, the ink thin in places
  const s = S / 3.8;
  const M = Math.ceil(s * 1.6);
  const mc = document.createElement('canvas');
  mc.width = mc.height = M;
  const m = mc.getContext('2d')!;
  m.translate(M / 2, M * 0.4);
  m.strokeStyle = '#b9a27c';
  m.lineWidth = s * 0.055;
  m.lineCap = 'round';
  m.beginPath();
  m.moveTo(0, s * 0.15);
  m.quadraticCurveTo(s * 0.04, s * 0.4, -s * 0.01, s * 0.64);
  m.stroke();
  for (const sd of [-1, 1]) {
    const lg = m.createLinearGradient(0, s * 0.45, sd * s * 0.33, s * 0.4);
    lg.addColorStop(0, '#b5a07a');
    lg.addColorStop(1, '#cdb994');
    m.fillStyle = lg;
    m.beginPath();
    m.ellipse(sd * s * 0.17, s * 0.45, s * 0.16, s * 0.065, sd * -0.5, 0, Math.PI * 2);
    m.fill();
    m.strokeStyle = 'rgba(90,70,50,0.45)';
    m.lineWidth = s * 0.012;
    m.beginPath();
    m.moveTo(sd * s * 0.04, s * 0.5);
    m.lineTo(sd * s * 0.3, s * 0.38);
    m.stroke();
  }
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    const px = Math.cos(a) * s * 0.17, py = Math.sin(a) * s * 0.17;
    const pg = m.createRadialGradient(0, 0, s * 0.04, 0, 0, s * 0.32);
    pg.addColorStop(0, '#c8b68f');
    pg.addColorStop(0.45, '#e6d7b4');
    pg.addColorStop(1, '#d4c29b');
    m.fillStyle = pg;
    m.beginPath();
    m.ellipse(px, py, s * 0.155, s * 0.112, a, 0, Math.PI * 2);
    m.fill();
  }
  m.strokeStyle = 'rgba(70,50,36,0.55)';
  m.lineWidth = s * 0.022;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
    m.beginPath();
    m.moveTo(Math.cos(a) * s * 0.06, Math.sin(a) * s * 0.06);
    m.lineTo(Math.cos(a) * s * 0.25, Math.sin(a) * s * 0.25);
    m.stroke();
  }
  m.fillStyle = '#5a4433';
  m.beginPath();
  m.arc(0, 0, s * 0.07, 0, Math.PI * 2);
  m.fill();
  m.fillStyle = '#d9c79f';
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    m.beginPath();
    m.arc(Math.cos(a) * s * 0.04, Math.sin(a) * s * 0.04, s * 0.011, 0, Math.PI * 2);
    m.fill();
  }
  // where the block didn't take the ink: little bare specks the ground shows through
  m.setTransform(1, 0, 0, 1, 0, 0);
  m.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    m.fillStyle = `rgba(0,0,0,${0.25 + rnd() * 0.5})`;
    m.beginPath();
    m.arc(rnd() * M, rnd() * M, 0.6 + rnd() * 1.8, 0, Math.PI * 2);
    m.fill();
  }
  // a 2 × 2 half-drop block, each print a little off true like a hand block, wrapped so the tile repeats
  for (const [x, y, rot] of [[0.25, 0.22, -0.05], [0.75, 0.72, 0.07]]) {
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
      g.save();
      g.translate((x + dx) * S, (y + dy) * S);
      g.rotate(rot);
      g.drawImage(mc, -M / 2, -M * 0.4);
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 16;
  t.flipY = false; // the garment's v runs down from the shoulders: the flowers stand on their stems
  return t;
}

/** a plain-weave normal map (warp and weft), tiling */
function weaveNormal() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d')!;
  const img = g.createImageData(S, S);
  const rnd = mulberry(3);
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cell = (Math.floor(x / 4) + Math.floor(y / 4)) % 2;
      const u = ((x % 4) + 0.5) / 4;
      const v = ((y % 4) + 0.5) / 4;
      h[y * S + x] = (cell ? Math.sin(u * Math.PI) : Math.sin(v * Math.PI)) * 0.8 + rnd() * 0.2;
    }
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x + S - 1) % S)];
      const dy = h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x];
      const n = new THREE.Vector3(-dx * 1.2, -dy * 1.2, 1).normalize();
      const o = (y * S + x) * 4;
      img.data[o] = (n.x * 0.5 + 0.5) * 255;
      img.data[o + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[o + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t >>> 14) ^ t) / 4294967296 + 0.5;
  };
}

export interface ClipUniform {
  uClip: { value: THREE.Vector4 };
}

/**
 * a cotton material on the garment coordinates (`gar`: metres round and down): `tile` metres per
 * print repeat; the kurti also draws its placket (a darker strip with cream buttons down the front)
 */
function fabric(opts: { print?: THREE.Texture; color: THREE.ColorRepresentation; weave: THREE.Texture; tile: number; placket?: boolean; clip?: ClipUniform }) {
  const m = new THREE.MeshPhysicalMaterial({
    color: opts.color, roughness: 0.9, sheen: 0.18, sheenRoughness: 0.8, sheenColor: new THREE.Color('#a89680'),
    side: THREE.DoubleSide, normalScale: new THREE.Vector2(0.35, 0.35),
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPrint = { value: opts.print ?? null };
    sh.uniforms.uWeave = { value: opts.weave };
    sh.uniforms.uTile = { value: opts.tile };
    sh.uniforms.uClip = opts.clip?.uClip ?? { value: new THREE.Vector4(0, -100, 0, 0) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 gar;\nvarying vec3 vGar;\nvarying vec3 vClipW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGar = gar;\nvClipW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vGar;
varying vec3 vClipW;
uniform sampler2D uPrint;
uniform sampler2D uWeave;
uniform float uTile;
uniform vec4 uClip;`,
      )
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (distance(vClipW, uClip.xyz) < uClip.w) discard;')
      .replace(
        '#include <map_fragment>',
        `${opts.print ? 'diffuseColor.rgb *= texture2D(uPrint, vec2(vGar.x, -vGar.y) / uTile).rgb;' : ''}
${opts.placket ? `{
  float pu = abs(vGar.x);
  if (vGar.z > 0.5 && vGar.y > 1.05 && vGar.y < 1.215 && pu < 0.016) {
    diffuseColor.rgb *= 0.72;
    float edge = smoothstep(0.0012, 0.0, abs(pu - 0.0145));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.53, 0.41), edge * 0.6);
    float by = mod(vGar.y - 1.06, 0.034) - 0.017;
    float b = smoothstep(0.0046, 0.0036, length(vec2(vGar.x, by)));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.7, 0.55), b);
  }
}` : ''}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  vec3 wn = texture2D(uWeave, vec2(vGar.x, vGar.y) / 0.006).xyz * 2.0 - 1.0;
  wn.xy *= 0.35;
  vec3 q0 = dFdx(-vViewPosition); vec3 q1 = dFdy(-vViewPosition);
  vec2 st0 = dFdx(vGar.xy); vec2 st1 = dFdy(vGar.xy);
  vec3 N = normal;
  vec3 q1perp = cross(q1, N); vec3 q0perp = cross(N, q0);
  vec3 T = q1perp * st0.x + q0perp * st1.x;
  vec3 B = q1perp * st0.y + q0perp * st1.y;
  float det = max(dot(T, T), dot(B, B));
  float scale = (det == 0.0) ? 0.0 : inversesqrt(det);
  normal = normalize(mat3(T * scale, B * scale, N) * wn);
}`,
      );
  };
  m.customProgramCacheKey = () => `fabric-${!!opts.print}-${!!opts.placket}`;
  return m;
}

/**
 * dress her: the kurti, its collar and skirt, and the salwar are added beside her body mesh (same
 * skeleton, same bind); her own top and shorts are hidden. `clip` is the first-person neck clip.
 */
export function dressKurti(model: THREE.Object3D, clip?: ClipUniform) {
  let body: THREE.SkinnedMesh | undefined;
  let head: THREE.SkinnedMesh | undefined;
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    if (m.name === 'AvatarBody') body = m;
    if (m.name === 'AvatarHead') head = m;
    if (m.name === 'outfit_top' || m.name === 'outfit_bottom') m.visible = false;
  });
  if (!body) throw new Error('no AvatarBody');
  const src = weld(body);
  const bones = body.skeleton.bones;
  const bone = (n: string) => {
    const i = bones.findIndex((b) => b.name === n);
    if (i < 0) throw new Error(`no bone ${n}`);
    return i;
  };

  const weave = weaveNormal();
  const print = printTexture();
  const kurtiMat = fabric({ print, color: '#ffffff', weave, tile: 0.085, placket: true, clip });
  const plainKurti = fabric({ print, color: '#ffffff', weave, tile: 0.085, clip });
  const salwarMat = fabric({ color: '#e6e0d4', weave, tile: 1, clip });

  // her hoodie gives the shape of her body under it (Avaturn bodies have no skin where clothes cover)
  const hoodie = model.getObjectByName('outfit_top') as THREE.SkinnedMesh;
  const shorts = model.getObjectByName('outfit_bottom') as THREE.SkinnedMesh;
  const hood = cloudOf(hoodie);
  // the kurti's body: the hoodie's torso (without the hood on her back), a little closer to her, up
  // over the shoulders to the base of the neck
  const ys: number[] = [];
  for (let y = BODY_HEM; y < 1.236; y += 0.02) ys.push(y);
  ys.push(1.236, 1.272);
  const torsoGeo = tube({
    axis: 'y',
    stations: ys,
    pts: hood.pos,
    band: 0.014,
    keep: (q) => Math.abs(q.x) < 0.16 && !(q.z < -0.1 && q.y > 1.07),
    ease: () => -0.004,
    ring: (y) => (y > 1.25 ? 0.066 : null),
    skin: hood,
    uScale: 0.14,
    placket: true,
  });
  // three-quarter sleeves, set in at the shoulder, a little wider at the cuff
  const sleeve = (side: number) => {
    const xs: number[] = [];
    for (let x = 0.12; x < SLEEVE_END; x += 0.022) xs.push(side * x);
    xs.push(side * SLEEVE_END);
    return tube({
      axis: 'x',
      side,
      stations: xs,
      pts: hood.pos,
      band: 0.012,
      keep: (q) => q.y > 1.12 && Math.abs(q.z) < 0.12,
      ease: (x) => 0.002 + 0.011 * smooth(Math.abs(x), 0.3, SLEEVE_END),
      skin: hood,
      uScale: 0.05,
      na: 32,
    });
  };
  // the salwar: easy over the thighs, full and folded below the knee, gathered at the ankle
  const legs = cutAndSubdivide(src, (tri) => tri.every((q) => q.y < 0.86 && Math.abs(q.x) < 0.3) && tri.some((q) => q.y >= ANKLE));
  for (const q of legs.pos) if (q.y < ANKLE) q.y = ANKLE;
  const salwarGeo = toGeometry(
    legs,
    (q) => {
      const cx = Math.sign(q.x || 1) * 0.08;
      const a = Math.atan2(q.z, q.x - cx);
      const full = 0.012 + 0.03 * smooth(0.78 - q.y, 0, 0.2) - 0.03 * smooth(0.24 - q.y, 0, 0.11);
      return full * (1 + 0.38 * Math.sin(a * 6 + q.y * 9) * smooth(0.7 - q.y, 0, 0.2));
    },
    (_, q) => [Math.atan2(q.z, q.x - Math.sign(q.x || 1) * 0.08) * 0.08, q.y, 0],
    () => Math.PI * 2 * 0.08,
  );
  const torsoPts = hood.pos.filter((q) => Math.abs(q.x) < 0.16 && !(q.z < -0.1 && q.y > 1.07));
  const [front, back] = skirt([...torsoPts, ...src.pos, ...cloudOf(shorts).pos], bone);
  const band = collar(head, bone);

  const parent = body.parent!;
  const meshes = [
    new THREE.SkinnedMesh(torsoGeo, kurtiMat),
    new THREE.SkinnedMesh(sleeve(1), plainKurti),
    new THREE.SkinnedMesh(sleeve(-1), plainKurti),
    new THREE.SkinnedMesh(front, plainKurti),
    new THREE.SkinnedMesh(back, plainKurti),
    new THREE.SkinnedMesh(band, plainKurti),
    new THREE.SkinnedMesh(salwarGeo, salwarMat),
  ];
  meshes.forEach((m, i) => {
    m.name = ['kurti', 'kurtiSleeveL', 'kurtiSleeveR', 'kurtiFront', 'kurtiBack', 'kurtiCollar', 'salwar'][i];
    m.bind(body!.skeleton, body!.bindMatrix);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    parent.add(m);
  });
  return meshes;
}
