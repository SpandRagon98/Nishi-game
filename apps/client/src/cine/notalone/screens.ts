import * as THREE from 'three';

/**
 * What the phone shows and what the reel's label says, drawn on canvases. Each redraws only when
 * its state changes (the state is a string key built from the timeline).
 */

export interface PhoneState {
  mode: 'off' | 'lock' | 'thread' | 'incoming' | 'call' | 'ended';
  bars: number;
  /** messages so far in the thread */
  msgs: { me: boolean; text: string }[];
  /** text in the reply box (typing), or null */
  draft: string | null;
  /** the other side is typing */
  dots: boolean;
  /** seconds into the call */
  callSecs: number;
  /** 0..1 ringing pulse */
  pulse: number;
}

const W = 360;
const H = 780;
const SANS = '"IBM Plex Sans", system-ui, sans-serif';

function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function wrap(c: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (c.measureText(next).width > max && line) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function statusBar(c: CanvasRenderingContext2D, bars: number, light = true) {
  c.fillStyle = light ? 'rgba(235,240,245,0.92)' : '#222';
  c.font = `500 17px ${SANS}`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillText(bars > 0 ? 'Jio' : 'No signal', 22, 26);
  // signal bars
  for (let i = 0; i < 4; i++) {
    c.globalAlpha = i < bars ? 1 : 0.25;
    c.fillRect(W - 112 + i * 7, 32 - (i + 1) * 4.5, 5, (i + 1) * 4.5);
  }
  c.globalAlpha = 1;
  // battery at 9%
  c.strokeStyle = c.fillStyle;
  c.lineWidth = 1.6;
  rounded(c, W - 62, 18, 32, 16, 4);
  c.stroke();
  c.fillStyle = '#e0533d';
  c.fillRect(W - 59, 21, 4, 10);
  c.fillStyle = light ? 'rgba(235,240,245,0.92)' : '#222';
  c.fillRect(W - 29, 23, 2.5, 6);
}

export function drawPhone(c: CanvasRenderingContext2D, s: PhoneState) {
  c.clearRect(0, 0, W, H);
  if (s.mode === 'off') {
    c.fillStyle = '#020203';
    c.fillRect(0, 0, W, H);
    return;
  }
  if (s.mode === 'lock') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0b1a2a');
    g.addColorStop(1, '#03070c');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    statusBar(c, s.bars);
    c.fillStyle = '#e9eef3';
    c.textAlign = 'center';
    c.font = `300 104px ${SANS}`;
    c.fillText('3:14', W / 2, 190);
    c.font = `400 19px ${SANS}`;
    c.fillStyle = 'rgba(233,238,243,0.75)';
    c.fillText('Saturday, 14 November', W / 2, 262);
    if (s.bars === 0) {
      // the thing she is looking at: big and plain
      rounded(c, 70, 330, W - 140, 52, 26);
      c.fillStyle = 'rgba(255,255,255,0.1)';
      c.fill();
      c.fillStyle = '#ffd6c8';
      c.font = `500 22px ${SANS}`;
      c.fillText('NO SIGNAL', W / 2, 357);
    }
    return;
  }
  if (s.mode === 'thread') {
    c.fillStyle = '#0d0f12';
    c.fillRect(0, 0, W, H);
    statusBar(c, s.bars);
    // header
    c.fillStyle = '#16191e';
    c.fillRect(0, 48, W, 76);
    c.fillStyle = '#3a3f47';
    c.beginPath();
    c.arc(44, 86, 20, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#9aa3ad';
    c.font = `500 20px ${SANS}`;
    c.textAlign = 'center';
    c.fillText('?', 44, 87);
    c.textAlign = 'left';
    c.fillStyle = '#eef1f4';
    c.font = `500 19px ${SANS}`;
    c.fillText('UNKNOWN NUMBER', 76, 78);
    c.fillStyle = '#8d96a0';
    c.font = `400 14px ${SANS}`;
    c.fillText('Text message · 3:14 AM', 76, 100);
    // bubbles, newest at the bottom
    c.font = `400 22px ${SANS}`;
    const bottom = s.draft !== null ? H - 300 : H - 90;
    let y = bottom;
    const items = [...s.msgs];
    const blocks = items.map((m) => ({ m, lines: wrap(c, m.text, 220) }));
    if (s.dots) blocks.push({ m: { me: false, text: '' }, lines: ['…'] });
    for (let i = blocks.length - 1; i >= 0; i--) {
      const { m, lines } = blocks[i];
      const bh = lines.length * 30 + 22;
      const bw = Math.max(...lines.map((l) => c.measureText(l).width)) + 34;
      y -= bh + 14;
      const x = m.me ? W - 16 - bw : 16;
      rounded(c, x, y, bw, bh, 20);
      c.fillStyle = m.me ? '#2f6fe0' : '#2a2e35';
      c.fill();
      c.fillStyle = '#f4f6f8';
      lines.forEach((l, k) => c.fillText(l, x + 17, y + 26 + k * 30));
    }
    c.fillStyle = '#8d96a0';
    c.font = `400 13px ${SANS}`;
    c.textAlign = 'center';
    c.fillText('Today 3:14 AM', W / 2, Math.max(150, y - 18));
    c.textAlign = 'left';
    if (s.draft !== null) {
      // the reply box and a keyboard
      rounded(c, 14, H - 286, W - 74, 46, 23);
      c.fillStyle = '#1e2228';
      c.fill();
      c.fillStyle = s.draft ? '#f4f6f8' : '#6c747e';
      c.font = `400 20px ${SANS}`;
      c.fillText(s.draft || 'Text message', 32, H - 256);
      if (s.draft) {
        const w = c.measureText(s.draft).width;
        c.fillStyle = '#5b8cff';
        c.fillRect(34 + w, H - 274, 2, 24);
      }
      c.fillStyle = '#2f6fe0';
      c.beginPath();
      c.arc(W - 34, H - 263, 21, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#fff';
      c.font = `600 20px ${SANS}`;
      c.textAlign = 'center';
      c.fillText('➤', W - 33, H - 262);
      c.fillStyle = '#16191d';
      c.fillRect(0, H - 226, W, 226);
      const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
      c.font = `400 19px ${SANS}`;
      rows.forEach((r, ri) => {
        const kw = 32;
        const x0 = (W - r.length * (kw + 3)) / 2;
        for (let k = 0; k < r.length; k++) {
          rounded(c, x0 + k * (kw + 3), H - 212 + ri * 52, kw, 44, 6);
          c.fillStyle = '#2b3037';
          c.fill();
          c.fillStyle = '#e8ebef';
          c.fillText(r[k], x0 + k * (kw + 3) + kw / 2, H - 186 + ri * 52);
        }
      });
      rounded(c, 90, H - 56, W - 180, 42, 6);
      c.fillStyle = '#2b3037';
      c.fill();
      c.textAlign = 'left';
    }
    return;
  }
  if (s.mode === 'incoming' || s.mode === 'call' || s.mode === 'ended') {
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#11161c');
    g.addColorStop(1, '#040506');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    statusBar(c, s.bars);
    // her photo: a faded portrait silhouette in a circle
    c.save();
    c.beginPath();
    c.arc(W / 2, 220, 70 + (s.mode === 'incoming' ? s.pulse * 8 : 0), 0, Math.PI * 2);
    c.fillStyle = 'rgba(160,190,210,' + (s.mode === 'incoming' ? 0.12 + 0.1 * s.pulse : 0.08) + ')';
    c.fill();
    c.beginPath();
    c.arc(W / 2, 220, 62, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#5a5048';
    c.fillRect(W / 2 - 62, 158, 124, 124);
    c.fillStyle = '#2b2522';
    c.beginPath();
    c.ellipse(W / 2, 205, 24, 30, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.ellipse(W / 2, 280, 52, 36, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    c.textAlign = 'center';
    c.fillStyle = '#f2f4f6';
    c.font = `400 46px ${SANS}`;
    c.fillText('MAA', W / 2, 352);
    c.fillStyle = '#9aa4ae';
    c.font = `400 17px ${SANS}`;
    if (s.mode === 'incoming') {
      c.fillText('mobile', W / 2, 390);
      c.fillStyle = '#c9a77e';
      c.font = `400 15px ${SANS}`;
      c.fillText('Last call · 27 years ago', W / 2, 418);
      // decline / accept
      for (const [x, col, label] of [[86, '#d8433b', 'Decline'], [W - 86, '#2fb35a', 'Accept']] as const) {
        c.fillStyle = col;
        c.beginPath();
        c.arc(x, H - 130, 34, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#c8ced4';
        c.font = `400 15px ${SANS}`;
        c.fillText(label, x, H - 76);
      }
    } else if (s.mode === 'call') {
      const m = Math.floor(s.callSecs / 60);
      const sec = Math.floor(s.callSecs % 60);
      c.fillText(`0${m}:${sec < 10 ? '0' : ''}${sec}`, W / 2, 390);
      c.fillStyle = '#d8433b';
      c.beginPath();
      c.arc(W / 2, H - 130, 34, 0, Math.PI * 2);
      c.fill();
    } else {
      c.fillStyle = '#d0846e';
      c.fillText('Call ended', W / 2, 390);
    }
  }
}

export function phoneScreen() {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  let key = '';
  return {
    tex,
    set(s: PhoneState) {
      const k = JSON.stringify(s);
      if (k === key) return;
      key = k;
      drawPhone(ctx, s);
      tex.needsUpdate = true;
    },
  };
}

// ───────────────────────────── the reel's label ─────────────────────────────

export const OLD_LABEL = ['SHUNYA', 'RECORDING 001'];
export const NEW_LABEL = ['SUBJECT 047', 'ADITI SEN'];

/**
 * A typed paper label on the reel's flange. `k` 0 shows the old text, 1 the new one; in between the
 * text tears sideways in slices, like a bad tape, from one to the other.
 */
export function labelTexture() {
  const LW = 640;
  const LH = 200;
  const cv = document.createElement('canvas');
  cv.width = LW;
  cv.height = LH;
  const c = cv.getContext('2d')!;
  const paper = document.createElement('canvas');
  paper.width = LW;
  paper.height = LH;
  const p = paper.getContext('2d')!;
  // old paper: yellowed, foxed, a tea-coloured stain and a torn corner
  p.fillStyle = '#d9cba6';
  p.fillRect(0, 0, LW, LH);
  for (let i = 0; i < 900; i++) {
    p.fillStyle = `rgba(${90 + Math.random() * 60},${70 + Math.random() * 40},${40},${Math.random() * 0.06})`;
    p.fillRect(Math.random() * LW, Math.random() * LH, 2 + Math.random() * 10, 2 + Math.random() * 6);
  }
  const st = p.createRadialGradient(LW * 0.82, LH * 0.7, 4, LW * 0.82, LH * 0.7, 90);
  st.addColorStop(0, 'rgba(120,80,30,0.0)');
  st.addColorStop(0.8, 'rgba(120,80,30,0.18)');
  st.addColorStop(1, 'rgba(120,80,30,0)');
  p.fillStyle = st;
  p.fillRect(0, 0, LW, LH);
  p.strokeStyle = 'rgba(80,60,40,0.5)';
  p.lineWidth = 3;
  p.strokeRect(10, 10, LW - 20, LH - 20);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const typed = (lines: string[], dx = 0) => {
    c.fillStyle = 'rgba(25,20,18,0.88)';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `500 58px "IBM Plex Mono", monospace`;
    c.fillText(lines[0], LW / 2 + dx, 72);
    c.font = `500 44px "IBM Plex Mono", monospace`;
    c.fillText(lines[1], LW / 2 + dx, 140);
  };
  let last = -1;
  return {
    tex,
    set(k: number, t: number) {
      // the glitch redraws every frame while it runs; otherwise only on change
      const q = k <= 0 ? 0 : k >= 1 ? 1 : 0.5 + Math.floor(t * 30) / 1000;
      if (q === last) return;
      last = q;
      c.drawImage(paper, 0, 0);
      if (k <= 0 || k >= 1) typed(k >= 1 ? NEW_LABEL : OLD_LABEL);
      else {
        // slices of either text, torn sideways
        const scratch = document.createElement('canvas');
        scratch.width = LW;
        scratch.height = LH;
        const s = scratch.getContext('2d')!;
        for (const [lines, alpha] of [[OLD_LABEL, 1 - k], [NEW_LABEL, k]] as const) {
          s.clearRect(0, 0, LW, LH);
          const prev = c;
          s.fillStyle = 'rgba(25,20,18,0.88)';
          s.textAlign = 'center';
          s.textBaseline = 'middle';
          s.font = `500 58px "IBM Plex Mono", monospace`;
          s.fillText(lines[0], LW / 2, 72);
          s.font = `500 44px "IBM Plex Mono", monospace`;
          s.fillText(lines[1], LW / 2, 140);
          for (let y = 0; y < LH; y += 8) {
            const off = (Math.random() - 0.5) * 60 * Math.sin(k * Math.PI);
            prev.globalAlpha = Math.random() < alpha ? 0.95 : 0.15;
            prev.drawImage(scratch, 0, y, LW, 8, off, y, LW, 8);
          }
          prev.globalAlpha = 1;
        }
      }
      tex.needsUpdate = true;
    },
  };
}
