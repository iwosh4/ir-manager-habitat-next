// Tileable procedural noise used by the offline texture/model pipeline.
// All functions are deterministic (seeded) so assets are reproducible.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const mod = (a, n) => ((a % n) + n) % n;

/** Tileable 2D gradient noise in [-1,1]. x,y in lattice units, period in lattice cells. */
export function perlin(x, y, period = 256, seed = 0) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const g = (ix, iy) => {
    const a = hash2(mod(ix, period), mod(iy, period), seed) * Math.PI * 2;
    return [Math.cos(a), Math.sin(a)];
  };
  const d = (ix, iy, dx, dy) => { const v = g(ix, iy); return v[0] * dx + v[1] * dy; };
  const n00 = d(x0, y0, fx, fy), n10 = d(x0 + 1, y0, fx - 1, fy);
  const n01 = d(x0, y0 + 1, fx, fy - 1), n11 = d(x0 + 1, y0 + 1, fx - 1, fy - 1);
  const u = fade(fx), v = fade(fy);
  return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
}

/** Tileable fBm. u,v in [0,1). */
export function fbm(u, v, { freq = 4, octaves = 5, gain = 0.5, lacunarity = 2, seed = 0 } = {}) {
  let amp = 1, sum = 0, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    sum += amp * perlin(u * f, v * f, f, seed + o * 17);
    norm += amp; amp *= gain; f *= lacunarity;
  }
  return sum / norm; // roughly [-0.7,0.7]
}

export function ridged(u, v, opts = {}) {
  const { freq = 4, octaves = 5, gain = 0.5, seed = 0 } = opts;
  let amp = 1, sum = 0, norm = 0, f = freq;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(perlin(u * f, v * f, f, seed + o * 31));
    sum += amp * n * n; norm += amp; amp *= gain; f *= 2;
  }
  return sum / norm;
}

/** Tileable Worley (cellular) noise. Returns {f1, f2, id}. */
export function worley(u, v, cells = 8, seed = 0, jitter = 1) {
  const x = u * cells, y = v * cells;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 1e9, f2 = 1e9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j;
    const hx = mod(cx, cells), hy = mod(cy, cells);
    const px = cx + 0.5 + (hash2(hx, hy, seed) - 0.5) * jitter;
    const py = cy + 0.5 + (hash2(hx, hy, seed + 99) - 0.5) * jitter;
    const dx = px - x, dy = py - y;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd < f1) { f2 = f1; f1 = dd; id = hash2(hx, hy, seed + 7); } else if (dd < f2) f2 = dd;
  }
  return { f1, f2, id };
}

/** Non-tileable 3D value-ish noise for mesh displacement (smooth). */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  const h = (a, b, c) => hash2(a * 7919 + c * 104729, b * 15485863 + c, seed) * 2 - 1;
  const lerp = (a, b, t) => a + (b - a) * t;
  const x00 = lerp(h(xi, yi, zi), h(xi + 1, yi, zi), fx);
  const x10 = lerp(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx);
  const x01 = lerp(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx);
  const x11 = lerp(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

export function fbm3(x, y, z, octaves = 4, seed = 0) {
  let amp = 1, sum = 0, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o * 13);
    norm += amp; amp *= 0.5; f *= 2.03;
  }
  return sum / norm;
}
