// Hand-painted texture atlas for the PLANNER (stylized) renderer.
// One 2304² atlas = 9×9 tiles of 256 px (240 px painted content + 8 px wrapped gutter on every side).
// Everything is painted procedurally with a small brush toolkit (wrapped strokes, dabs, soft gradients),
// so tiles are seamless where they repeat and the whole set shares one visual language.
//   node tools/asset-pipeline/build-planner-atlas.mjs   ->  assets/planner/atlas.webp + atlas.json
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { mulberry32, fbm } from './lib/noise.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets/planner');
const GRID = 9, CELL = 256, PAD = 8, S = CELL - PAD * 2; // 240 px content

// ---------------------------------------------------------------- brush toolkit
const hex = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function ramp(stops, t) { // stops: [[t, 0xrrggbb], ...]
  t = Math.min(1, Math.max(0, t));
  for (let i = 1; i < stops.length; i++) if (t <= stops[i][0]) {
    const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
    return mix(hex(c0), hex(c1), (t - t0) / (t1 - t0 || 1));
  }
  return hex(stops[stops.length - 1][1]);
}

class Painter {
  constructor(seed = 1, { wrap = true, alpha = false } = {}) {
    this.c = createCanvas(S, S); this.x = this.c.getContext('2d');
    this.r = mulberry32(seed); this.wrap = wrap; this.alpha = alpha;
  }
  rnd(a = 0, b = 1) { return a + (b - a) * this.r(); }
  _each(fn) { // draw with wrap-around for seamless tiles
    if (!this.wrap) return fn(0, 0);
    for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) fn(dx, dy);
  }
  fill(c) { this.x.fillStyle = css(c); this.x.fillRect(0, 0, S, S); return this; }
  vgrad(stops) { const g = this.x.createLinearGradient(0, 0, 0, S); for (const [t, c, a = 1] of stops) g.addColorStop(t, css(hex(c), a)); this.x.fillStyle = g; this.x.fillRect(0, 0, S, S); return this; }
  hgrad(stops) { const g = this.x.createLinearGradient(0, 0, S, 0); for (const [t, c, a = 1] of stops) g.addColorStop(t, css(hex(c), a)); this.x.fillStyle = g; this.x.fillRect(0, 0, S, S); return this; }
  /** Noise-modulated colour field (low-frequency painterly mottling). */
  mottle(stops, { freq = 3, oct = 4, amount = 1, alpha = 1, seed = 7 } = {}) {
    const x = this.x, id = x.getImageData(0, 0, S, S), d = id.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const n = fbm(i / S, j / S, { freq, octaves: oct, seed }) * 1.4 * amount + 0.5;
      const c = ramp(stops, n), k = (j * S + i) * 4;
      d[k] = d[k] * (1 - alpha) + c[0] * alpha; d[k + 1] = d[k + 1] * (1 - alpha) + c[1] * alpha; d[k + 2] = d[k + 2] * (1 - alpha) + c[2] * alpha;
    }
    x.putImageData(id, 0, 0); return this;
  }
  /** Posterise to a few painted value steps (keeps hue). */
  posterize(levels = 6, amount = 0.5) {
    const id = this.x.getImageData(0, 0, S, S), d = id.data;
    for (let k = 0; k < d.length; k += 4) for (let c = 0; c < 3; c++) { const v = d[k + c] / 255, q = Math.round(v * levels) / levels; d[k + c] = (v + (q - v) * amount) * 255; }
    this.x.putImageData(id, 0, 0); return this;
  }
  /** Brush stroke: a curved tapered line (two passes: soft body + crisper core). */
  stroke(x0, y0, len, width, ang, color, alpha = 0.3, { bend = 0.2, blur = 1.2, taper = true } = {}) {
    const x = this.x, c = Math.cos(ang), s = Math.sin(ang);
    const x1 = x0 + c * len, y1 = y0 + s * len, mx = (x0 + x1) / 2 - s * len * bend, my = (y0 + y1) / 2 + c * len * bend;
    this._each((dx, dy) => {
      x.save(); x.filter = blur ? `blur(${blur}px)` : 'none';
      x.lineCap = 'round'; x.strokeStyle = css(color, alpha * 0.55); x.lineWidth = width * 1.5;
      x.beginPath(); x.moveTo(x0 + dx, y0 + dy); x.quadraticCurveTo(mx + dx, my + dy, x1 + dx, y1 + dy); x.stroke();
      x.filter = 'none'; x.strokeStyle = css(color, alpha); x.lineWidth = taper ? width * 0.7 : width;
      x.beginPath(); x.moveTo(x0 + dx, y0 + dy); x.quadraticCurveTo(mx + dx, my + dy, x1 + dx, y1 + dy); x.stroke();
      x.restore();
    });
    return this;
  }
  /** Many strokes in a direction, colours from a palette function. */
  strokes(n, { len = [20, 60], width = [3, 9], ang = 0, jitter = 0.25, alpha = [0.12, 0.3], color, bend = 0.15, blur = 1.2, area } = {}) {
    for (let i = 0; i < n; i++) {
      const px = area ? this.rnd(area[0], area[2]) : this.rnd(0, S), py = area ? this.rnd(area[1], area[3]) : this.rnd(0, S);
      const col = typeof color === 'function' ? color(px / S, py / S, this) : color;
      this.stroke(px, py, this.rnd(...len), this.rnd(...width), ang + this.rnd(-jitter, jitter), col, this.rnd(...alpha), { bend: this.rnd(-bend, bend), blur });
    }
    return this;
  }
  dab(x0, y0, r, color, alpha = 0.5, blur = 1) {
    const x = this.x;
    this._each((dx, dy) => { x.save(); x.filter = blur ? `blur(${blur}px)` : 'none'; x.fillStyle = css(color, alpha); x.beginPath(); x.ellipse(x0 + dx, y0 + dy, r, r * this.rnd(0.6, 1), this.rnd(0, 3), 0, 7); x.fill(); x.restore(); });
    return this;
  }
  dabs(n, { r = [2, 6], color, alpha = [0.3, 0.7], blur = 0.8, area } = {}) {
    for (let i = 0; i < n; i++) {
      const px = area ? this.rnd(area[0], area[2]) : this.rnd(0, S), py = area ? this.rnd(area[1], area[3]) : this.rnd(0, S);
      this.dab(px, py, this.rnd(...r), typeof color === 'function' ? color(px / S, py / S, this) : color, this.rnd(...alpha), blur);
    }
    return this;
  }
  /** Painted pebble/ball with light from the top-left. */
  pebble(px, py, r, base, alpha = 1) {
    const x = this.x;
    this._each((dx, dy) => {
      const g = x.createRadialGradient(px + dx - r * 0.35, py + dy - r * 0.4, r * 0.1, px + dx, py + dy, r);
      g.addColorStop(0, css(mix(base, [255, 240, 210], 0.45), alpha)); g.addColorStop(0.55, css(base, alpha)); g.addColorStop(1, css(mix(base, [20, 12, 8], 0.55), alpha));
      x.fillStyle = g; x.beginPath(); x.ellipse(px + dx, py + dy, r, r * 0.85, 0, 0, 7); x.fill();
    });
  }
  line(x0, y0, x1, y1, color, width = 1, alpha = 1) { const x = this.x; x.strokeStyle = css(color, alpha); x.lineWidth = width; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); return this; }
  rect(x0, y0, w, h, color, alpha = 1, r = 0) { const x = this.x; x.fillStyle = css(color, alpha); x.beginPath(); x.roundRect(x0, y0, w, h, r); x.fill(); return this; }
  text(t, px, py, size, color, alpha = 1, weight = 'bold') { const x = this.x; x.fillStyle = css(color, alpha); x.font = `${weight} ${size}px Arial`; x.fillText(t, px, py); return this; }
  grain(amount = 10, seed = 3) {
    const r = mulberry32(seed), id = this.x.getImageData(0, 0, S, S), d = id.data;
    for (let k = 0; k < d.length; k += 4) { const n = (r() - 0.5) * amount; d[k] += n; d[k + 1] += n; d[k + 2] += n; }
    this.x.putImageData(id, 0, 0); return this;
  }
}

// ---------------------------------------------------------------- tile recipes
const T = {};
const P = (seed, opts) => new Painter(seed, opts);
const warm = (a, b) => (u, v, p) => mix(hex(a), hex(b), p.rnd());

// --- architecture
T.floor = () => P(1).fill(hex(0x34312e)).mottle([[0, 0x262422], [0.45, 0x363230], [0.7, 0x403b37], [1, 0x4b4540]], { freq: 2, seed: 11 })
  .strokes(70, { len: [40, 120], width: [10, 26], ang: 0.35, jitter: 0.5, alpha: [0.05, 0.12], color: warm(0x4d4741, 0x2a2725), blur: 4 })
  .strokes(14, { len: [30, 90], width: [1, 2], ang: 0.2, jitter: 1.5, alpha: [0.1, 0.22], color: hex(0x5d5750), blur: 0.4 })
  .dabs(160, { r: [0.6, 1.6], color: warm(0x5a544d, 0x1d1b1a), alpha: [0.3, 0.6], blur: 0.2 }).grain(5);
T.wall_dark = () => P(2).fill(hex(0x30323a)).mottle([[0, 0x272930], [0.5, 0x31333a], [1, 0x3b3d44]], { freq: 2, seed: 21 })
  .strokes(60, { len: [60, 160], width: [14, 30], ang: Math.PI / 2, jitter: 0.15, alpha: [0.04, 0.09], color: warm(0x40424a, 0x25272c), blur: 5 }).grain(4);
T.wall_light = () => P(3).fill(hex(0x77726b)).mottle([[0, 0x68635d], [0.5, 0x77726b], [1, 0x86817a]], { freq: 2, seed: 31 })
  .strokes(60, { len: [60, 160], width: [14, 30], ang: Math.PI / 2, jitter: 0.2, alpha: [0.04, 0.09], color: warm(0x8a857e, 0x625d57), blur: 5 }).grain(4);
T.wall_cap = () => P(4).fill(hex(0x18191b)).strokes(30, { len: [40, 100], width: [6, 12], ang: 0, alpha: [0.05, 0.1], color: hex(0x2a2b2e), blur: 3 });
T.ceiling = () => { const p = P(5).fill(hex(0x8a8781)).mottle([[0, 0x7d7a74], [1, 0x94918b]], { freq: 3, seed: 51 }).dabs(260, { r: [0.5, 1.5], color: hex(0x6d6a65), alpha: [0.3, 0.5], blur: 0 });
  for (const t of [0, S / 2]) { p.rect(t - 2, 0, 4, S, hex(0xb2afa8)); p.rect(0, t - 2, S, 4, hex(0xb2afa8)); p.line(t + 2, 0, t + 2, S, hex(0x57544f), 1, 0.6); p.line(0, t + 2, S, t + 2, hex(0x57544f), 1, 0.6); }
  return p; };
T.panel_light = () => P(6, { wrap: false }).vgrad([[0, 0xfff6e8], [0.5, 0xfffbf2], [1, 0xfff1dd]]).strokes(10, { len: [80, 200], width: [8, 20], ang: 0, alpha: [0.05, 0.1], color: hex(0xffffff), blur: 6 });
T.skirting = () => P(7).fill(hex(0x1e1f22)).mottle([[0, 0x18191b], [1, 0x252629]], { freq: 3, seed: 71 }).strokes(30, { len: [60, 160], width: [2, 5], ang: 0, jitter: 0.02, alpha: [0.05, 0.1], color: hex(0x3a3b3e), blur: 1 });
T.drain = () => { const p = P(8, { wrap: false }).fill(hex(0x6e7074)).vgrad([[0, 0x8d8f93], [1, 0x5a5c60]]);
  for (let i = 0; i < 9; i++) p.rect(26, 22 + i * 22, S - 52, 10, hex(0x1b1c1e), 1, 4); p.rect(0, 0, S, 6, hex(0xa9abaf)); return p; };

// --- metals & boards
// Tiling surfaces are value-flat (seamless when repeated): the painted light & gradients live in the
// vertex colours of the geometry, not in the texture.
T.metal_dark = () => P(10).fill(hex(0x242529)).mottle([[0, 0x1d1e21], [0.5, 0x25262a], [1, 0x2e2f33]], { freq: 3, seed: 101 })
  .strokes(90, { len: [60, 180], width: [1, 3], ang: 0, jitter: 0.02, alpha: [0.08, 0.2], color: warm(0x5e5d61, 0x0e0f10), blur: 0.4 });
T.steel = () => P(11).fill(hex(0x3c3f45)).mottle([[0, 0x34373c], [0.5, 0x3d4046], [1, 0x484b51]], { freq: 3, seed: 111 })
  .strokes(80, { len: [40, 120], width: [2, 6], ang: 0, jitter: 0.04, alpha: [0.05, 0.14], color: warm(0x6b6e75, 0x24262a), blur: 1 })
  .dabs(40, { r: [0.6, 1.8], color: hex(0x9a9ca0), alpha: [0.2, 0.45], blur: 0.3 });
T.alu = () => P(12).fill(hex(0xaeaca6)).mottle([[0, 0x9e9c96], [0.5, 0xafada7], [1, 0xc2c0ba]], { freq: 3, seed: 121 })
  .strokes(120, { len: [60, 200], width: [1, 2], ang: 0, jitter: 0.01, alpha: [0.08, 0.2], color: warm(0xf2f0ea, 0x6b6965), blur: 0.3 });
T.stainless = () => P(13).fill(hex(0xa2a5a6)).mottle([[0, 0x8e9193], [0.5, 0xa3a6a7], [1, 0xbabcbc]], { freq: 3, seed: 131 })
  .strokes(100, { len: [60, 200], width: [1, 3], ang: 0, jitter: 0.01, alpha: [0.06, 0.16], color: warm(0xe6e7e6, 0x5b5e60), blur: 0.4 });
T.laminate = () => P(14).fill(hex(0x2d2f33)).mottle([[0, 0x26282b], [1, 0x35373b]], { freq: 3, seed: 141 })
  .strokes(40, { len: [80, 200], width: [3, 8], ang: Math.PI / 2, jitter: 0.03, alpha: [0.04, 0.09], color: warm(0x44464b, 0x1c1d20), blur: 2 });
T.plastic_white = () => P(15).fill(hex(0xdedbd4)).mottle([[0, 0xd2cfc8], [1, 0xe9e6e0]], { freq: 3, seed: 151 });
T.plastic_black = () => P(16).fill(hex(0x1e1f22)).mottle([[0, 0x18191b], [1, 0x26272a]], { freq: 3, seed: 161 }).strokes(20, { len: [40, 100], width: [4, 10], ang: 0, alpha: [0.04, 0.08], color: hex(0x4a4b4f), blur: 3 });
T.rubber = () => P(17).fill(hex(0x141415)).dabs(200, { r: [0.5, 1.2], color: hex(0x2a2a2c), alpha: [0.3, 0.5], blur: 0 });
T.amber = () => P(18).fill(hex(0xe8913a)).mottle([[0, 0xd98330], [1, 0xf3a257]], { freq: 3, seed: 181 }).strokes(20, { len: [60, 160], width: [2, 5], ang: 0, alpha: [0.1, 0.2], color: hex(0xffd29a), blur: 1 });
T.wood = () => { const p = P(19).fill(hex(0xa77a4a)); const planks = 6;
  for (let i = 0; i < planks; i++) { const y0 = (i / planks) * S, h = S / planks; p.rect(0, y0, S, h, mix(hex(0x9c7042), hex(0xc4945e), p.rnd()), 1); }
  p.strokes(160, { len: [40, 160], width: [1, 3], ang: 0, jitter: 0.03, alpha: [0.08, 0.22], color: warm(0x6e4a2a, 0xd8a870), blur: 0.4 });
  for (let i = 0; i < planks; i++) { const y = (i / planks) * S; p.line(0, y, S, y, hex(0x4f3219), 2, 0.7); p.line(0, y + 2, S, y + 2, hex(0xe0b27a), 1, 0.35); }
  return p.grain(6); };
T.tiles_white = () => { const p = P(20).fill(hex(0x8f8c86)); const rows = 6, cols = 3;
  for (let r = 0; r < rows; r++) for (let c = -1; c < cols + 1; c++) { const off = (r % 2) * S / cols / 2; const x0 = c * S / cols + off + 2, y0 = r * S / rows + 2, w = S / cols - 4, h = S / rows - 4;
    const g = p.x.createLinearGradient(0, y0, 0, y0 + h); g.addColorStop(0, css(hex(0xfdfcf8))); g.addColorStop(1, css(hex(0xd9d6cf))); p.x.fillStyle = g; p.x.beginPath(); p.x.roundRect(x0, y0, w, h, 4); p.x.fill();
    p.line(x0 + 4, y0 + 3, x0 + w * 0.6, y0 + 3, hex(0xffffff), 2, 0.8); }
  return p; };
T.paper = () => P(21).fill(hex(0xefebe2)).mottle([[0, 0xe2ddd2], [1, 0xf6f3ec]], { freq: 5, seed: 211 }).grain(4);
T.cardboard = () => P(22).fill(hex(0xa7825a)).mottle([[0, 0x94714c], [1, 0xb8946a]], { freq: 4, seed: 221 })
  .strokes(30, { len: [60, 200], width: [2, 4], ang: Math.PI / 2, jitter: 0.02, alpha: [0.08, 0.16], color: hex(0x7a5b3c), blur: 1 }).rect(0, S * 0.45, S, 18, hex(0xc9a87c), 0.7);
T.pegboard = () => { const p = P(23).fill(hex(0x8c9095)); const n = 10;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const cx = (i + 0.5) * S / n, cy = (j + 0.5) * S / n; p.dab(cx, cy, 3.2, hex(0x1f2023), 1, 0.3); p.dab(cx + 1, cy + 1.5, 1.6, hex(0xc6c9cc), 0.35, 0.3); }
  return p; };
T.vent = () => { const p = P(24).fill(hex(0x1a1b1d)); const rows = 8, cols = 5;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) { const x0 = i * S / cols + 6, y0 = j * S / rows + 8; p.rect(x0, y0, S / cols - 12, S / rows - 16, hex(0x050506), 1, 6); p.line(x0 + 3, y0 + S / rows - 16, x0 + S / cols - 15, y0 + S / rows - 16, hex(0x55575b), 2, 0.8); }
  return p; };
T.grille = () => { const p = P(25).fill(hex(0xc9c6bf)); for (let j = 0; j < 14; j++) { const y = 10 + j * 16; p.rect(12, y, S - 24, 7, hex(0x3b3c3f), 1, 3); p.line(14, y + 8, S - 14, y + 8, hex(0xf6f4ee), 1, 0.8); } return p; };
T.mesh = () => { const p = P(26, { alpha: true }); p.x.clearRect(0, 0, S, S); const n = 24; p.x.strokeStyle = 'rgba(28,29,31,0.95)'; p.x.lineWidth = 2.2;
  for (let i = 0; i <= n; i++) { const t = (i / n) * S; p.x.beginPath(); p.x.moveTo(t, 0); p.x.lineTo(t, S); p.x.stroke(); p.x.beginPath(); p.x.moveTo(0, t); p.x.lineTo(S, t); p.x.stroke(); }
  return p; };

// --- emissive / light
T.led_warm = () => P(30, { wrap: false }).vgrad([[0, 0xffd9a0], [0.5, 0xfff4e0], [1, 0xffd9a0]]);
T.led_cool = () => P(31, { wrap: false }).vgrad([[0, 0xcfe2ff], [0.5, 0xf6fbff], [1, 0xcfe2ff]]);
T.glow = () => { const p = P(32, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S); const g = p.x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,240,215,0.9)'); g.addColorStop(0.35, 'rgba(255,220,170,0.35)'); g.addColorStop(1, 'rgba(255,200,140,0)'); p.x.fillStyle = g; p.x.fillRect(0, 0, S, S); return p; };
T.shaft = () => { const p = P(33, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S); // light cone: bright top, fading down & to sides
  const id = p.x.getImageData(0, 0, S, S), d = id.data; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const u = i / S - 0.5, v = j / S; const w = 0.25 + v * 0.25; const a = Math.max(0, 1 - Math.abs(u) / w) ** 1.5 * (1 - v) ** 1.6 * 0.55; const k = (j * S + i) * 4; d[k] = 255; d[k + 1] = 238; d[k + 2] = 205; d[k + 3] = a * 255; } p.x.putImageData(id, 0, 0); return p; };
T.shadow = () => { const p = P(34, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S);
  const id = p.x.getImageData(0, 0, S, S), d = id.data; for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const u = Math.abs(i / S - 0.5) * 2, v = Math.abs(j / S - 0.5) * 2; const e = Math.max(u, v); const a = (1 - Math.min(1, Math.max(0, (e - 0.62) / 0.38))) ** 1.6 * 0.72; const k = (j * S + i) * 4; d[k] = 10; d[k + 1] = 8; d[k + 2] = 8; d[k + 3] = a * 255; } p.x.putImageData(id, 0, 0); return p; };
T.blinds = () => { const p = P(35, { wrap: false }).fill(hex(0xfdf6e6)); const n = 16;
  for (let i = 0; i < n; i++) { const y = (i / n) * S; const g = p.x.createLinearGradient(0, y, 0, y + S / n); g.addColorStop(0, css(hex(0xe9e4d8))); g.addColorStop(0.7, css(hex(0xbdb7aa))); g.addColorStop(0.72, css(hex(0xfff8e6))); g.addColorStop(1, css(hex(0xfff3da))); p.x.fillStyle = g; p.x.fillRect(0, y, S, S / n - 1); }
  return p; };
T.frosted = () => P(36, { wrap: false }).vgrad([[0, 0xe5eef4], [0.55, 0xf4f1e6], [1, 0xd9dfd0]]).strokes(20, { len: [60, 180], width: [20, 40], ang: 0.9, alpha: [0.05, 0.1], color: hex(0xffffff), blur: 10 });
T.exit_sign = () => { const p = P(37, { wrap: false }).fill(hex(0x138a4a)).vgrad([[0, 0x1fb362, 0.9], [1, 0x0f6f3b, 0.9]]); p.text('EXIT', 60, 150, 70, hex(0xf2fff6)); p.rect(20, 40, 30, 70, hex(0xf2fff6), 1, 6); return p; };

// --- glass & water (transparent material)
T.glass = () => { const p = P(40, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S); p.x.fillStyle = 'rgba(200,225,230,0.05)'; p.x.fillRect(0, 0, S, S);
  const streak = (x0, w, a) => { p.x.save(); p.x.filter = 'blur(3px)'; p.x.fillStyle = `rgba(255,255,255,${a})`; p.x.beginPath(); p.x.moveTo(x0, 0); p.x.lineTo(x0 + w, 0); p.x.lineTo(x0 + w - S * 0.55, S); p.x.lineTo(x0 - S * 0.55, S); p.x.fill(); p.x.restore(); };
  streak(S * 0.66, 14, 0.16); streak(S * 0.76, 4, 0.26); streak(S * 0.22, 3, 0.08);
  p.x.fillStyle = 'rgba(255,255,255,0.22)'; p.x.fillRect(0, 0, S, 2); p.x.fillRect(0, 0, 2, S); return p; };
T.water = () => { const p = P(41, { alpha: true }); p.x.clearRect(0, 0, S, S); const g = p.x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(70,150,138,0.62)'); g.addColorStop(1, 'rgba(38,98,96,0.62)'); p.x.fillStyle = g; p.x.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) { const x0 = p.rnd(0, S), y0 = p.rnd(0, S); p.stroke(x0, y0, p.rnd(20, 60), p.rnd(1.5, 3.5), p.rnd(-0.2, 0.2), hex(0xd8fff6), p.rnd(0.25, 0.55), { bend: 0.4, blur: 0.8 }); }
  return p; };
T.water_side = () => { const p = P(42, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S); const g = p.x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(120,200,190,0.55)'); g.addColorStop(0.08, 'rgba(60,140,130,0.4)'); g.addColorStop(1, 'rgba(20,70,70,0.72)'); p.x.fillStyle = g; p.x.fillRect(0, 0, S, S);
  for (let i = 0; i < 18; i++) p.dab(p.rnd(0, S), p.rnd(S * 0.2, S), p.rnd(1, 2.5), hex(0xd8fff6), p.rnd(0.2, 0.5), 0.5); return p; };
T.foam = () => { const p = P(43, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S); for (let i = 0; i < 40; i++) p.stroke(p.rnd(S * 0.3, S * 0.7), p.rnd(0, S * 0.3), p.rnd(40, 140), p.rnd(2, 6), Math.PI / 2 + p.rnd(-0.08, 0.08), hex(0xeafffb), p.rnd(0.15, 0.45), { blur: 1.5 }); return p; };

// --- naturals
T.sand = () => P(50).fill(hex(0xc39664)).mottle([[0, 0xa87c4f], [0.5, 0xc79a67], [1, 0xdcb584]], { freq: 3, seed: 501 })
  .strokes(40, { len: [40, 120], width: [2, 4], ang: 0.1, jitter: 0.3, alpha: [0.18, 0.32], color: hex(0xe8c796), bend: 0.4, blur: 1 })
  .strokes(40, { len: [40, 120], width: [2, 4], ang: 0.1, jitter: 0.3, alpha: [0.12, 0.25], color: hex(0x8c6340), bend: 0.4, blur: 1 })
  .dabs(70, { r: [1, 3], color: warm(0x8f7a66, 0xe9dcc8), alpha: [0.5, 0.9], blur: 0.3 }).grain(8);
T.soil = () => P(51).fill(hex(0x2e2016)).mottle([[0, 0x1e150e], [0.5, 0x2f2117], [1, 0x453022]], { freq: 4, seed: 511 })
  .strokes(90, { len: [8, 22], width: [3, 7], ang: 0, jitter: 3, alpha: [0.35, 0.7], color: (u, v, p) => (p.rnd() < 0.5 ? mix(hex(0x6e4523), hex(0xa36a35), p.rnd()) : mix(hex(0x3a281a), hex(0x5c3f28), p.rnd())), bend: 0.3, blur: 0.4 })
  .dabs(80, { r: [0.8, 2], color: hex(0x120c08), alpha: [0.5, 0.8], blur: 0.2 }).grain(6);
T.moss = () => { const p = P(52).fill(hex(0x2c4a1c)).mottle([[0, 0x1d3312], [0.5, 0x33561f], [1, 0x4c7a2a]], { freq: 4, seed: 521 });
  for (let i = 0; i < 260; i++) { const x0 = p.rnd(0, S), y0 = p.rnd(0, S), r = p.rnd(3, 8); p.dab(x0, y0, r, mix(hex(0x3f6b23), hex(0x6f9f36), p.rnd()), 0.55, 0.6); p.dab(x0 - r * 0.3, y0 - r * 0.35, r * 0.4, hex(0xa9cf5a), 0.45, 0.4); }
  return p.grain(6); };
T.cork = () => P(53).fill(hex(0x5a3d26)).mottle([[0, 0x3a2617], [0.5, 0x5e4029], [1, 0x7d5a3c]], { freq: 3, seed: 531 })
  .strokes(60, { len: [60, 180], width: [6, 16], ang: Math.PI / 2, jitter: 0.25, alpha: [0.3, 0.55], color: hex(0x22150c), bend: 0.3, blur: 1.5 })
  .strokes(60, { len: [40, 140], width: [3, 7], ang: Math.PI / 2, jitter: 0.25, alpha: [0.2, 0.45], color: warm(0xa27a52, 0xc79a68), bend: 0.3, blur: 0.8 })
  .dabs(40, { r: [2, 5], color: hex(0x1a0f08), alpha: [0.4, 0.7], blur: 0.8 }).grain(6);
T.bark = () => P(54).fill(hex(0x5b4a3b)).strokes(120, { len: [60, 200], width: [3, 9], ang: 0, jitter: 0.06, alpha: [0.2, 0.45], color: (u, v, p) => (p.rnd() < 0.5 ? mix(hex(0x2e241c), hex(0x3f3226), p.rnd()) : mix(hex(0x8b7760), hex(0xa99479), p.rnd())), bend: 0.08, blur: 0.8 }).grain(6);
T.driftwood = () => P(55).fill(hex(0x8e8272)).strokes(120, { len: [60, 200], width: [3, 8], ang: 0, jitter: 0.05, alpha: [0.2, 0.4], color: (u, v, p) => (p.rnd() < 0.45 ? mix(hex(0x4f463c), hex(0x655a4c), p.rnd()) : mix(hex(0xb8ad9c), hex(0xd6ccbb), p.rnd())), bend: 0.08, blur: 0.8 }).grain(5);
T.rock_warm = () => { // painted sandstone: stacked rounded slabs, lit from the top-left, dark cracks
  const p = P(56).fill(hex(0x5a3c28)).mottle([[0, 0x4a3020], [0.5, 0x5e3f2a], [1, 0x6e4a31]], { freq: 3, seed: 561 });
  const x = p.x;
  const slab = (cx, cy, w, h, base) => { const n = 9, ks = Array.from({ length: n }, () => 0.82 + p.rnd(0, 0.22)); p._each((dx, dy) => {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const k = ks[i]; pts.push([cx + dx + Math.cos(a) * w * k, cy + dy + Math.sin(a) * h * k * (Math.sin(a) > 0 ? 0.85 : 1)]); }
    x.save(); x.beginPath(); x.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) { const c = pts[(i + 1) % n], m = [(pts[i][0] + c[0]) / 2, (pts[i][1] + c[1]) / 2]; x.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
    x.closePath();
    const g = x.createLinearGradient(cx + dx - w * 0.4, cy + dy - h, cx + dx + w * 0.3, cy + dy + h);
    g.addColorStop(0, css(mix(base, [255, 226, 180], 0.42))); g.addColorStop(0.45, css(base)); g.addColorStop(1, css(mix(base, [40, 22, 12], 0.5)));
    x.fillStyle = g; x.shadowColor = 'rgba(20,10,5,0.75)'; x.shadowBlur = 6; x.shadowOffsetY = 3; x.fill(); x.restore();
  }); };
  const rows = [[0.08, 0.1], [0.3, 0.12], [0.52, 0.1], [0.74, 0.12], [0.94, 0.1]];
  for (const [ry, rh] of rows) { let cx = p.rnd(0, S * 0.3); while (cx < S * 1.05) { const w = p.rnd(S * 0.1, S * 0.2); slab(cx + w, ry * S + p.rnd(-6, 6), w, rh * S * p.rnd(0.85, 1.1), mix(hex(0xa8764c), hex(0xd5a06a), p.rnd())); cx += w * 2 + p.rnd(2, 8); } }
  p.strokes(40, { len: [20, 70], width: [1.5, 4], ang: 0, jitter: 0.15, alpha: [0.18, 0.35], color: hex(0xf8d9a8), bend: 0.2, blur: 0.6 })
    .strokes(30, { len: [10, 40], width: [1.5, 3], ang: 0.2, jitter: 0.8, alpha: [0.2, 0.4], color: hex(0x3a2214), blur: 0.5 })
    .dabs(40, { r: [1, 2.5], color: hex(0x3a2214), alpha: [0.3, 0.6], blur: 0.3 });
  return p.grain(7); };
T.rock_dark = () => P(57).fill(hex(0x46494a)).mottle([[0, 0x2e3233], [0.5, 0x474b4c], [1, 0x646866]], { freq: 3, seed: 571 })
  .strokes(60, { len: [30, 100], width: [4, 12], ang: 0.3, jitter: 0.6, alpha: [0.2, 0.4], color: warm(0x252929, 0x1b1e1f), blur: 1.5 })
  .strokes(60, { len: [20, 80], width: [2, 6], ang: 0.3, jitter: 0.6, alpha: [0.15, 0.35], color: warm(0x8a9088, 0x6f7a6a), blur: 1 })
  .dabs(40, { r: [3, 7], color: hex(0x4d6b2e), alpha: [0.25, 0.45], blur: 1.5 }).grain(6);
T.rock_facet = () => P(58).fill(hex(0x8d7a66)).mottle([[0, 0x6e5d4d], [0.5, 0x8f7c68], [1, 0xae9a82]], { freq: 4, seed: 581 })
  .strokes(40, { len: [20, 60], width: [2, 5], ang: 0, jitter: 3, alpha: [0.15, 0.3], color: warm(0x4d3f33, 0xc9b69c), blur: 0.8 }).grain(8);
T.gravel = () => { const p = P(59).fill(hex(0x5b4c3d)); for (let i = 0; i < 180; i++) p.pebble(p.rnd(0, S), p.rnd(0, S), p.rnd(4, 9), mix(hex(0x6f6252), hex(0xa4937c), p.rnd())); return p.grain(6); };
T.clay = () => { const p = P(60).fill(hex(0x4b2616)); for (let i = 0; i < 120; i++) p.pebble(p.rnd(0, S), p.rnd(0, S), p.rnd(8, 13), mix(hex(0x9a4a26), hex(0xc4673a), p.rnd())); return p; };

// --- cross sections (repeat U, clamp V; top of tile = surface)
function section(seed, layers) {
  const p = P(seed);
  for (const L of layers) {
    const y0 = L.from * S, y1 = L.to * S;
    p.x.save(); p.x.beginPath(); p.x.rect(0, y0, S, y1 - y0); p.x.clip();
    p.rect(0, y0, S, y1 - y0, hex(L.color));
    if (L.pebbles) for (let i = 0; i < L.pebbles; i++) p.pebble(p.rnd(0, S), p.rnd(y0 + 4, y1 - 2), p.rnd(...L.size), mix(hex(L.p0), hex(L.p1), p.rnd()));
    if (L.bits) p.strokes(L.bits, { len: [6, 16], width: [2, 5], ang: 0, jitter: 3, alpha: [0.35, 0.7], color: (u, v, pp) => mix(hex(L.b0), hex(L.b1), pp.rnd()), blur: 0.4, area: [0, y0, S, y1] });
    if (L.ripples) p.strokes(L.ripples, { len: [30, 90], width: [1.5, 3], ang: 0, jitter: 0.1, alpha: [0.2, 0.4], color: hex(L.r0), blur: 0.8, area: [0, y0, S, y1] });
    p.x.restore();
    if (L.edge) { p.line(0, y0 + 1, S, y0 + 1, hex(L.edge), 2, 0.6); }
  }
  // soft darkening towards the bottom (painted depth)
  const g = p.x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); p.x.fillStyle = g; p.x.fillRect(0, 0, S, S);
  return p.grain(5);
}
T.section_arid = () => section(61, [
  { from: 0, to: 0.55, color: 0xc39664, ripples: 30, r0: 0xe6c592, bits: 20, b0: 0x8a6d52, b1: 0xd9c3a2, edge: 0xf1d4a4 },
  { from: 0.55, to: 1, color: 0x9c7148, ripples: 20, r0: 0xc49a6b, pebbles: 30, size: [3, 6], p0: 0x7d6a58, p1: 0xbfae98 },
]);
T.section_tropical = () => section(62, [
  { from: 0, to: 0.12, color: 0x3f6624, bits: 40, b0: 0x4f7c2c, b1: 0x86b246, edge: 0x9cc75a },
  { from: 0.12, to: 0.58, color: 0x2c1e14, bits: 70, b0: 0x5a3a22, b1: 0x9b6534 },
  { from: 0.58, to: 0.62, color: 0x1b1c1d },
  { from: 0.62, to: 1, color: 0x4a2515, pebbles: 70, size: [7, 11], p0: 0x9a4a26, p1: 0xc9703d },
]);
T.section_palu = () => section(63, [
  { from: 0, to: 0.5, color: 0x33251a, bits: 50, b0: 0x5a3a22, b1: 0x8b5c32, edge: 0x6b8a3a },
  { from: 0.5, to: 1, color: 0x4b3e30, pebbles: 90, size: [4, 8], p0: 0x6f6252, p1: 0xa4937c },
]);

// --- foliage (alpha cut-outs, clamp)
function leaf(seed, { shape, c0, c1, vein = 0xcfe39a, rim = 0xe7f5b0 }) {
  const p = P(seed, { wrap: false, alpha: true }); const x = p.x; x.clearRect(0, 0, S, S);
  const path = () => { x.beginPath();
    if (shape === 'heart') { x.moveTo(S / 2, S * 0.97); x.bezierCurveTo(S * 0.02, S * 0.7, S * 0.02, S * 0.08, S * 0.32, S * 0.06); x.bezierCurveTo(S * 0.44, S * 0.05, S * 0.48, S * 0.12, S / 2, S * 0.16); x.bezierCurveTo(S * 0.52, S * 0.12, S * 0.56, S * 0.05, S * 0.68, S * 0.06); x.bezierCurveTo(S * 0.98, S * 0.08, S * 0.98, S * 0.7, S / 2, S * 0.97); }
    else if (shape === 'strap') { x.moveTo(S / 2, S * 0.01); x.bezierCurveTo(S * 0.72, S * 0.2, S * 0.74, S * 0.8, S * 0.66, S); x.lineTo(S * 0.34, S); x.bezierCurveTo(S * 0.26, S * 0.8, S * 0.28, S * 0.2, S / 2, S * 0.01); }
    else { x.ellipse(S / 2, S / 2, S * 0.38, S * 0.47, 0, 0, 7); }
    x.closePath(); };
  path(); const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, css(hex(c1))); g.addColorStop(1, css(hex(c0))); x.fillStyle = g; x.fill();
  x.save(); path(); x.clip();
  for (let i = 0; i < 40; i++) p.stroke(p.rnd(0, S), p.rnd(0, S), p.rnd(20, 60), p.rnd(6, 16), p.rnd(-2, 2), p.rnd() < 0.5 ? hex(c1) : hex(c0), p.rnd(0.1, 0.25), { blur: 3 });
  x.strokeStyle = css(hex(vein), 0.7); x.lineWidth = 4; x.beginPath(); x.moveTo(S / 2, S); x.lineTo(S / 2, S * 0.06); x.stroke();
  x.lineWidth = 2; x.strokeStyle = css(hex(vein), 0.45);
  for (let i = 1; i <= 6; i++) { const y0 = S * (0.1 + i * 0.13); for (const s of [-1, 1]) { x.beginPath(); x.moveTo(S / 2, y0); x.quadraticCurveTo(S / 2 + s * S * 0.2, y0 - S * 0.05, S / 2 + s * S * 0.42, y0 - S * 0.15); x.stroke(); } }
  x.lineWidth = 8; x.strokeStyle = css(hex(rim), 0.35); path(); x.stroke(); // painted rim light
  x.restore();
  return p;
}
T.leaf_heart = () => leaf(70, { shape: 'heart', c0: 0x1f4a1a, c1: 0x5a9a34 });
T.leaf_strap = () => leaf(71, { shape: 'strap', c0: 0x2c5a24, c1: 0x86ad44 });
T.leaf_oval = () => leaf(72, { shape: 'oval', c0: 0x355a26, c1: 0x8db85a });
T.leaf_red = () => leaf(73, { shape: 'strap', c0: 0x5a1f22, c1: 0xb8514a, vein: 0xf2b4a0, rim: 0xffd2c0 });
T.fern = () => { const p = P(74, { wrap: false, alpha: true }); const x = p.x; x.clearRect(0, 0, S, S);
  x.strokeStyle = css(hex(0x3a5a22)); x.lineWidth = 4; x.beginPath(); x.moveTo(S / 2, S); x.quadraticCurveTo(S * 0.52, S * 0.5, S / 2, 4); x.stroke();
  for (let i = 0; i < 20; i++) { const t = i / 20, y = S * (0.96 - t * 0.9), len = S * 0.44 * Math.sin((1 - t) * Math.PI * 0.85 + 0.15);
    for (const s of [-1, 1]) { const g = x.createLinearGradient(S / 2, y, S / 2 + s * len, y); g.addColorStop(0, css(hex(0x2a5219))); g.addColorStop(1, css(hex(0x86b547))); x.fillStyle = g; x.beginPath(); x.moveTo(S / 2, y); x.quadraticCurveTo(S / 2 + s * len * 0.5, y - 12, S / 2 + s * len, y - len * 0.22); x.quadraticCurveTo(S / 2 + s * len * 0.5, y + 7, S / 2, y + 8); x.fill(); } }
  return p; };
T.grass = () => { const p = P(75, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) { const x0 = S / 2 + p.rnd(-30, 30), lean = p.rnd(-0.6, 0.6); const c = mix(hex(0x9c8250), hex(0xe0c98e), p.rnd());
    p.x.strokeStyle = css(c, 0.95); p.x.lineWidth = p.rnd(2, 4); p.x.lineCap = 'round'; p.x.beginPath(); p.x.moveTo(x0, S); p.x.quadraticCurveTo(x0 + lean * 30, S * 0.5, x0 + lean * 90, p.rnd(10, S * 0.45)); p.x.stroke(); }
  return p; };
T.succulent = () => P(76).fill(hex(0x8aac99)).mottle([[0, 0x6f917e], [1, 0xa8c6b4]], { freq: 3, seed: 761 }).strokes(30, { len: [30, 80], width: [4, 10], ang: Math.PI / 2, alpha: [0.1, 0.2], color: hex(0xd9b3c4), blur: 3 });
T.stem = () => P(77).fill(hex(0x5c7d36)).mottle([[0, 0x4b6a2b], [1, 0x6f9142]], { freq: 3, seed: 771 });

// --- animals
T.skin_python = () => { const p = P(80).fill(hex(0x3a281b));
  for (let i = 0; i < 16; i++) { const x0 = p.rnd(0, S), y0 = p.rnd(S * 0.2, S * 0.8), r = p.rnd(12, 24); p.dab(x0, y0, r + 5, hex(0xe8d6a8), 0.9, 1); p.dab(x0, y0, r, hex(0xb07d3e), 1, 0.8); p.dab(x0 + 2, y0 + 2, r * 0.35, hex(0x3a281b), 0.8, 0.8); }
  p.vgrad([[0, 0xd9ceb6, 0.0], [0.85, 0xd9ceb6, 0], [1, 0xe4dac2, 0.9]]);
  for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) p.dab(i * 12 + (j % 2) * 6, j * 12, 5, hex(0x000000), 0.07, 0.5);
  return p; };
T.skin_gecko = () => { const p = P(81).fill(hex(0xe2b54a)).mottle([[0, 0xc8952f], [1, 0xf0cc6c]], { freq: 3, seed: 811 }); p.dabs(70, { r: [2, 5], color: hex(0x2a1c10), alpha: [0.7, 0.95], blur: 0.5 }); return p; };

// --- faces (clamp, painted details)
T.label = () => { const p = P(90, { wrap: false }).fill(hex(0xefeae0)); p.rect(0, 0, 26, S, hex(0xe8913a)); for (let i = 0; i < 4; i++) p.rect(44, 40 + i * 44, 120 + p.rnd(-40, 60), 14, hex(0x3a3b3e), 0.8, 4); return p; };
T.display = () => { const p = P(91, { wrap: false }).fill(hex(0x121315)); p.rect(20, 40, 150, 70, hex(0x1e1409)); p.text('31.5', 30, 100, 56, hex(0xffa640)); p.rect(20, 140, 90, 40, hex(0x0b1a10)); p.text('88%', 26, 172, 32, hex(0x7dffae));
  for (let i = 0; i < 3; i++) p.dab(150 + i * 28, 165, 9, hex(0x5e6166), 1, 0.2); return p; };
T.control_face = () => { const p = P(92, { wrap: false }).vgrad([[0, 0xe6e4df], [1, 0xc8c6c0]]); p.rect(14, 14, S - 28, S - 28, hex(0xd9d7d2), 1, 6);
  p.rect(30, 40, 110, 110, hex(0x2c2f33), 0.85, 4); for (let i = 0; i < 6; i++) p.rect(38 + i * 16, 60, 11, 34, i % 3 === 0 ? hex(0xb23a2e) : hex(0xf1efe9), 1, 2);
  p.rect(155, 45, 55, 40, hex(0x121315), 1, 4); p.text('24°', 160, 76, 24, hex(0xffa640)); p.rect(30, 185, 70, 18, hex(0xe8913a), 1, 3); return p; };
T.ac_face = () => { const p = P(93, { wrap: false }).vgrad([[0, 0xf4f2ed], [0.75, 0xdedbd4], [1, 0xb9b6af]]); for (let i = 0; i < 6; i++) p.line(20, 170 + i * 9, S - 20, 170 + i * 9, hex(0x6b6964), 2, 0.6); p.rect(S - 60, 40, 30, 10, hex(0xffa640), 0.9, 3); return p; };
T.board = () => { const p = P(94, { wrap: false }).fill(hex(0xf2f0ea)); const sheet = (x0, y0, w, h) => { p.rect(x0 + 3, y0 + 3, w, h, hex(0x9a978f), 0.4); p.rect(x0, y0, w, h, hex(0xfbfaf6)); p.rect(x0 + 8, y0 + 8, w - 16, 10, hex(0x2c2e31), 0.85);
    for (let i = 0; i < 7; i++) { p.line(x0 + 8, y0 + 32 + i * 12, x0 + w - 8, y0 + 32 + i * 12, hex(0xa9a69e), 1, 0.9); if (p.rnd() < 0.5) p.dab(x0 + 14 + p.rnd(0, w - 30), y0 + 27 + i * 12, 3, hex(0xe8913a), 0.9, 0.2); } p.dab(x0 + w / 2, y0 + 4, 5, hex(0xb23a2e), 1, 0.2); };
  sheet(14, 20, 90, 120); sheet(116, 24, 90, 120); sheet(40, 150, 120, 72); return p; };
T.incubator_interior = () => { const p = P(95, { wrap: false }).vgrad([[0, 0x6e5a42], [1, 0x3d3226]]); // warm lit shelves with eggs in vermiculite
  for (let s = 0; s < 4; s++) { const y = 30 + s * 54; p.rect(10, y + 30, S - 20, 4, hex(0xd7d8d6), 0.9); for (const bx of [20, 124]) { p.rect(bx, y + 6, 96, 24, hex(0xc59a55), 1, 3); for (let e = 0; e < 5; e++) { const ex = bx + 12 + e * 18, ey = y + 12; p.dab(ex, ey, 7, hex(0xf6efe0), 1, 0.4); p.dab(ex - 2, ey - 3, 2.5, hex(0xffffff), 0.8, 0.3); } } }
  return p; };
T.tub_front = () => { const p = P(96, { wrap: false }).vgrad([[0, 0xe8ebe9], [1, 0xc9ceca]]); p.rect(40, 70, 70, 50, hex(0x2c2d30), 0.35, 12); p.rect(150, 90, 50, 30, hex(0xffffff), 0.5, 10);
  p.rect(90, 16, 60, 18, hex(0xd2d6d3), 1, 8); p.rect(165, 20, 48, 22, hex(0xefeae0), 1, 2); p.rect(165, 20, 7, 22, hex(0xe8913a), 1, 1); p.line(4, 4, S - 4, 4, hex(0xffffff), 3, 0.8); return p; };
T.door_leaf = () => { const p = P(97, { wrap: false }).hgrad([[0, 0x2b2d31], [0.5, 0x35373b], [1, 0x27292c]]); p.rect(0, S - 40, S, 40, hex(0x8e9094), 0.9); p.rect(60, 60, 120, 30, hex(0xefeae0), 0.9, 3); p.rect(60, 60, 12, 30, hex(0xe8913a), 1, 2); return p; };
T.extinguisher = () => P(98).vgrad([[0, 0xe0584a], [0.3, 0xb3281f], [1, 0x6e1510]]).strokes(10, { len: [60, 200], width: [3, 8], ang: Math.PI / 2, alpha: [0.15, 0.3], color: hex(0xff9a8a), blur: 2 });
T.sack = () => { const p = P(99, { wrap: false }).fill(hex(0x3d4a3b)).mottle([[0, 0x2f3a2e], [1, 0x4b5a48]], { freq: 3, seed: 991 }); p.rect(40, 70, 160, 90, hex(0xe6dcc4), 1, 6); p.rect(55, 85, 110, 16, hex(0x3a3b3e), 0.8, 3); p.rect(55, 115, 70, 10, hex(0xe8913a), 0.9, 3); return p; };
T.bin = () => { const p = P(100).vgrad([[0, 0x6c7178], [1, 0x4a4e54]]); p.rect(70, 100, 100, 30, hex(0xefeae0), 1, 3); return p; };
T.tools = () => { const p = P(101, { wrap: false, alpha: true }); p.x.clearRect(0, 0, S, S); // tongs, hook, scissors silhouettes for the pegboard
  p.rect(40, 30, 8, 150, hex(0xb9bcbf)); p.rect(52, 30, 8, 150, hex(0xa2a5a8)); p.rect(38, 22, 24, 22, hex(0x1c1d1f), 1, 5);
  p.rect(100, 20, 5, 190, hex(0xc8cbcd)); p.rect(95, 20, 15, 60, hex(0x1c1d1f), 1, 6); p.x.strokeStyle = css(hex(0xc8cbcd)); p.x.lineWidth = 5; p.x.beginPath(); p.x.arc(117, 210, 14, Math.PI, 0.2, true); p.x.stroke();
  p.x.lineWidth = 7; p.x.strokeStyle = css(hex(0xb23a2e)); p.x.beginPath(); p.x.arc(160, 60, 13, 0, 7); p.x.stroke(); p.x.beginPath(); p.x.arc(190, 60, 13, 0, 7); p.x.stroke(); p.rect(166, 72, 6, 90, hex(0xd0d3d5)); p.rect(180, 72, 6, 90, hex(0xbfc2c4));
  return p; };

// ---------------------------------------------------------------- assemble
const names = Object.keys(T);
if (names.length > GRID * GRID) throw new Error(`too many tiles: ${names.length}`);
const atlas = createCanvas(GRID * CELL, GRID * CELL);
const ax = atlas.getContext('2d');
const meta = { size: GRID * CELL, grid: GRID, cell: CELL, pad: PAD, tiles: {} };
names.forEach((name, i) => {
  const p = T[name]();
  const cx = (i % GRID) * CELL, cy = Math.floor(i / GRID) * CELL;
  if (p.wrap) { // wrapped gutter so repeating tiles filter seamlessly
    for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) { ax.save(); ax.beginPath(); ax.rect(cx, cy, CELL, CELL); ax.clip(); ax.drawImage(p.c, cx + PAD + dx * S, cy + PAD + dy * S); ax.restore(); }
  } else { // clamped tiles: stretch the edge pixels into the gutter
    ax.save(); ax.beginPath(); ax.rect(cx, cy, CELL, CELL); ax.clip();
    ax.drawImage(p.c, 0, 0, S, 1, cx, cy, CELL, PAD); ax.drawImage(p.c, 0, S - 1, S, 1, cx, cy + CELL - PAD, CELL, PAD);
    ax.drawImage(p.c, 0, 0, 1, S, cx, cy, PAD, CELL); ax.drawImage(p.c, S - 1, 0, 1, S, cx + CELL - PAD, cy, PAD, CELL);
    ax.drawImage(p.c, cx + PAD, cy + PAD); ax.restore();
  }
  meta.tiles[name] = i;
});
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'atlas.webp'), atlas.toBuffer('image/webp', 92));
fs.writeFileSync(path.join(OUT, 'atlas.json'), JSON.stringify(meta, null, 1));
fs.writeFileSync('/tmp/claude-0/pw/atlas_preview.png', createCanvas(1024, 1024).getContext('2d') ? (() => { const c = createCanvas(1024, 1024); c.getContext('2d').drawImage(atlas, 0, 0, 1024, 1024); return c.toBuffer('image/png'); })() : Buffer.alloc(0));
console.log(`atlas: ${names.length} tiles, ${(fs.statSync(path.join(OUT, 'atlas.webp')).size / 1024).toFixed(0)} KB`);
