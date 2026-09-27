// Pixel-field helpers for the offline texture pipeline (tileable, wrap-around).
import { createCanvas } from '@napi-rs/canvas';
import fs from 'node:fs';
import path from 'node:path';

export class Field {
  constructor(w, h = w, fill = 0) { this.w = w; this.h = h; this.d = new Float32Array(w * h).fill(fill); }
  static from(w, h, fn) {
    const f = new Field(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f.d[y * w + x] = fn(x / w, y / h, x, y);
    return f;
  }
  get(x, y) { const w = this.w, h = this.h; x = ((x % w) + w) % w; y = ((y % h) + h) % h; return this.d[y * w + x]; }
  sample(u, v) { // bilinear, wrapping
    const x = u * this.w - 0.5, y = v * this.h - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const a = this.get(x0, y0), b = this.get(x0 + 1, y0), c = this.get(x0, y0 + 1), d = this.get(x0 + 1, y0 + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }
  map(fn) { const o = new Field(this.w, this.h); for (let i = 0; i < this.d.length; i++) o.d[i] = fn(this.d[i], i); return o; }
  clone() { const o = new Field(this.w, this.h); o.d.set(this.d); return o; }
  normalize(lo = 0, hi = 1) {
    let mn = Infinity, mx = -Infinity;
    for (const v of this.d) { if (v < mn) mn = v; if (v > mx) mx = v; }
    const s = (hi - lo) / (mx - mn || 1);
    for (let i = 0; i < this.d.length; i++) this.d[i] = lo + (this.d[i] - mn) * s;
    return this;
  }
  blur(radius = 1, passes = 2) { // box blur approximating gaussian, wrap-around
    let src = this;
    for (let p = 0; p < passes; p++) {
      const tmp = new Field(this.w, this.h), out = new Field(this.w, this.h);
      const n = radius * 2 + 1;
      for (let y = 0; y < this.h; y++) { let acc = 0; for (let k = -radius; k <= radius; k++) acc += src.get(k, y);
        for (let x = 0; x < this.w; x++) { tmp.d[y * this.w + x] = acc / n; acc += src.get(x + radius + 1, y) - src.get(x - radius, y); } }
      for (let x = 0; x < this.w; x++) { let acc = 0; for (let k = -radius; k <= radius; k++) acc += tmp.get(x, k);
        for (let y = 0; y < this.h; y++) { out.d[y * this.w + x] = acc / n; acc += tmp.get(x, y + radius + 1) - tmp.get(x, y - radius); } }
      src = out;
    }
    return src;
  }
}

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];

/** Height field -> tangent-space normal map (OpenGL convention, +Y up as glTF expects). */
export function normalFromHeight(hf, strength = 2) {
  const w = hf.w, h = hf.h, out = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (hf.get(x + 1, y) - hf.get(x - 1, y)) * strength * w / 256;
    const dy = (hf.get(x, y + 1) - hf.get(x, y - 1)) * strength * h / 256;
    // image y goes down; glTF normal maps: green = +v (up). v increases upward in UV space.
    let nx = -dx, ny = dy, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 3; out[i] = nx * 0.5 + 0.5; out[i + 1] = ny * 0.5 + 0.5; out[i + 2] = nz * 0.5 + 0.5;
  }
  return { w, h, rgb: out };
}

/** Cavity-style ambient occlusion from a height field. */
export function aoFromHeight(hf, radius = 6, strength = 3) {
  const b = hf.blur(radius, 2);
  return Field.from(hf.w, hf.h, (u, v, x, y) => clamp01(1 - Math.max(0, b.get(x, y) - hf.get(x, y)) * strength));
}

export function rgbImage(w, h, fn) { // fn(u,v,x,y) -> [r,g,b] (0..1) or [r,g,b,a]
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x / w, y / h, x, y); const i = (y * w + x) * 4;
    rgba[i] = clamp01(c[0]) * 255; rgba[i + 1] = clamp01(c[1]) * 255; rgba[i + 2] = clamp01(c[2]) * 255;
    rgba[i + 3] = c.length > 3 ? clamp01(c[3]) * 255 : 255;
  }
  return { w, h, rgba };
}

export function normalImage(n) {
  return rgbImage(n.w, n.h, (u, v, x, y) => { const i = (y * n.w + x) * 3; return [n.rgb[i], n.rgb[i + 1], n.rgb[i + 2]]; });
}

/** Pack glTF ORM: R = occlusion, G = roughness, B = metalness. */
export function ormImage(ao, rough, metal) {
  const w = rough.w, h = rough.h;
  return rgbImage(w, h, (u, v, x, y) => {
    const i = y * w + x;
    return [ao ? ao.d[i] : 1, rough.d[i], metal ? (typeof metal === 'number' ? metal : metal.d[i]) : 0];
  });
}

export function save(img, file, { quality = 88 } = {}) {
  const c = createCanvas(img.w, img.h);
  const ctx = c.getContext('2d');
  const id = ctx.createImageData(img.w, img.h);
  id.data.set(img.rgba);
  ctx.putImageData(id, 0, 0);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = file.endsWith('.png') ? c.toBuffer('image/png') : c.toBuffer('image/jpeg', quality);
  fs.writeFileSync(file, buf);
  return buf.length;
}

export function saveCanvas(canvas, file, { quality = 88 } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const buf = file.endsWith('.png') ? canvas.toBuffer('image/png') : canvas.toBuffer('image/jpeg', quality);
  fs.writeFileSync(file, buf);
  return buf.length;
}
