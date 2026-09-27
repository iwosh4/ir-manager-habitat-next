// Offline PBR texture authoring. Produces tileable albedo / normal / ORM maps into assets/textures/.
// Run: npm run build:textures   (deterministic; output is committed so the app needs no build step)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas } from '@napi-rs/canvas';
import { fbm, ridged, worley, perlin, mulberry32 } from './lib/noise.mjs';
import { Field, normalFromHeight, normalImage, aoFromHeight, ormImage, rgbImage, save, saveCanvas, clamp01, lerp, smooth, mix3, hex } from './lib/image.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'assets/textures');
const only = process.argv.slice(2);
const Q = { quality: 90 };

function writeSet(name, { albedo, height, normalStrength = 2, rough, metal = 0, ao, aoRadius = 6, aoStrength = 3 }) {
  const dir = path.join(OUT, name);
  let bytes = 0;
  if (albedo) bytes += save(albedo, path.join(dir, 'albedo.jpg'), Q);
  if (height) bytes += save(normalImage(normalFromHeight(height, normalStrength)), path.join(dir, 'normal.jpg'), { quality: 94 });
  if (rough) {
    const occ = ao || (height ? aoFromHeight(height, aoRadius, aoStrength) : null);
    bytes += save(ormImage(occ, rough, metal), path.join(dir, 'orm.jpg'), Q);
  }
  console.log(`  ${name.padEnd(18)} ${(bytes / 1024).toFixed(0)} KB`);
}

const sets = {
  // Sealed, polished graphite concrete floor (tile = 2.5 m)
  concrete_floor() {
    const N = 1024;
    const big = Field.from(N, N, (u, v) => fbm(u, v, { freq: 3, octaves: 6, seed: 11 }));
    const mid = Field.from(N, N, (u, v) => fbm(u, v, { freq: 16, octaves: 4, seed: 12 }));
    const trowel = Field.from(N, N, (u, v) => fbm(u, v * 0.25 + u * 0.05, { freq: 8, octaves: 4, seed: 13 }));

    const specks = Field.from(N, N, (u, v) => { const w = worley(u, v, 140, 15); return w.f1 < 0.18 ? (w.id - 0.5) : 0; });
    const pores = Field.from(N, N, (u, v) => { const w = worley(u, v, 220, 16); return w.f1 < 0.07 && w.id > 0.75 ? 1 : 0; });
    const albedo = rgbImage(N, N, (u, v, x, y) => {
      const i = y * N + x;
      let t = 0.5 + big.d[i] * 0.55 + mid.d[i] * 0.18 + trowel.d[i] * 0.12;
      let c = mix3(hex(0x3b3a38), hex(0x5a5854), clamp01(t));
      c = c.map((k) => k * (1 + specks.d[i] * 0.35) * (1 - pores.d[i] * 0.45));
      return c;
    });
    const height = Field.from(N, N, (u, v, x, y) => { const i = y * N + x; return mid.d[i] * 0.15 - pores.d[i] * 0.6 + specks.d[i] * 0.05; });
    const rough = Field.from(N, N, (u, v, x, y) => { const i = y * N + x; return clamp01(0.34 + big.d[i] * 0.22 + trowel.d[i] * 0.2 + pores.d[i] * 0.4); });

    writeSet('concrete_floor', { albedo, height: height.blur(1, 1), normalStrength: 1.2, rough, aoStrength: 1 });
  },

  // Neutral painted plaster, tinted per-material (tile = 2 m)
  plaster() {
    const N = 1024;
    const peel = Field.from(N, N, (u, v) => fbm(u, v, { freq: 64, octaves: 3, seed: 21 }));
    const trow = Field.from(N, N, (u, v) => fbm(u, v, { freq: 4, octaves: 5, seed: 22 }));
    const albedo = rgbImage(N, N, (u, v, x, y) => { const t = 0.93 + trow.d[y * N + x] * 0.06 + peel.d[y * N + x] * 0.015; return [t, t, t * 0.995]; });
    const height = Field.from(N, N, (u, v, x, y) => peel.d[y * N + x] * 0.7 + trow.d[y * N + x] * 0.6);
    const rough = Field.from(N, N, (u, v, x, y) => 0.82 + peel.d[y * N + x] * 0.08);
    writeSet('plaster', { albedo, height, normalStrength: 0.9, rough, aoStrength: 0.4 });
  },

  // Mineral-fibre suspended ceiling tiles, 2x2 tiles per texture (tile = 1.2 m)
  ceiling_tile() {
    const N = 1024;
    const fiss = Field.from(N, N, (u, v) => ridged(u, v, { freq: 24, octaves: 3, seed: 31 }));
    const pits = Field.from(N, N, (u, v) => { const w = worley(u, v, 160, 32); return w.f1 < 0.2 ? 1 - w.f1 / 0.2 : 0; });
    const grid = (u, v) => { // T-bar grid at tile borders
      const du = Math.min(u % 0.5, 0.5 - (u % 0.5)) * 1.2, dv = Math.min(v % 0.5, 0.5 - (v % 0.5)) * 1.2;
      return Math.min(du, dv);
    };
    const albedo = rgbImage(N, N, (u, v, x, y) => {
      const g = grid(u, v); if (g < 0.012) return hex(0xdcdcd8);
      const t = 0.9 - pits.d[y * N + x] * 0.08 - Math.max(0, fiss.d[y * N + x] - 0.8) * 0.3;
      return [t, t, t * 0.985];
    });
    const height = Field.from(N, N, (u, v, x, y) => {
      const g = grid(u, v); if (g < 0.012) return 0.9;
      const bevel = smooth(0.012, 0.022, g);
      return 0.9 - bevel * 0.4 - pits.d[y * N + x] * 0.35 - Math.max(0, fiss.d[y * N + x] - 0.75) * 0.8;
    });
    const rough = Field.from(N, N, (u, v) => (grid(u, v) < 0.012 ? 0.35 : 0.95));
    const metal = Field.from(N, N, (u, v) => (grid(u, v) < 0.012 ? 0.6 : 0));
    writeSet('ceiling_tile', { albedo, height, normalStrength: 2.5, rough, metal, aoStrength: 2 });
  },

  // Oiled oak butcher-block worktop, grain along U (tile = 1.2 m x 0.6 m)
  oak() {
    const W = 1024, H = 512;
    const strips = 10;
    const rnd = mulberry32(41);
    const stripTone = Array.from({ length: strips }, () => rnd());
    const stripOff = Array.from({ length: strips }, () => rnd() * 10);
    const albedo = rgbImage(W, H, (u, v) => {
      const s = Math.floor(v * strips), sv = v * strips - s;
      const off = stripOff[s];
      const grain = fbm((u + off) % 1, (v * 6 + off) % 1, { freq: 4, octaves: 3, seed: 42 });
      const rings = Math.sin((v * 90 + grain * 18 + off * 3) * 2.2) * 0.5 + 0.5;
      const fine = perlin(u * 400, v * 12, 400, 43) * 0.5 + 0.5;
      let base = mix3(hex(0x9a7148), hex(0xc39b6c), stripTone[s] * 0.8 + 0.1);
      base = base.map((c) => c * (0.86 + rings * 0.12) * (0.93 + fine * 0.1));
      const seam = smooth(0.0, 0.02, Math.min(sv, 1 - sv));
      return base.map((c) => c * (0.75 + 0.25 * seam));
    });
    const height = Field.from(W, H, (u, v) => {
      const s = Math.floor(v * strips), sv = v * strips - s;
      const fine = perlin(u * 400, v * 12, 400, 43);
      return fine * 0.3 + smooth(0, 0.02, Math.min(sv, 1 - sv)) * 0.6;
    });
    const rough = Field.from(W, H, (u, v) => 0.42 + perlin(u * 50, v * 8, 50, 44) * 0.08);
    writeSet('oak', { albedo, height, normalStrength: 0.8, rough, aoStrength: 0.6 });
  },

  // Cork bark (tile ~0.5 m), deep vertical crevices
  cork() {
    const N = 1024;
    const h = Field.from(N, N, (u, v) => {
      const r = ridged(u, v, { freq: 5, octaves: 5, seed: 51 });
      const s = fbm(u, (v * 0.35) % 1, { freq: 6, octaves: 4, seed: 52 });
      return r * 0.7 + s * 0.6;
    }).normalize();
    const blotch = Field.from(N, N, (u, v) => fbm(u, v, { freq: 8, octaves: 4, seed: 53 }));
    const albedo = rgbImage(N, N, (u, v, x, y) => {
      const i = y * N + x, t = h.d[i];
      let c = mix3(hex(0x2a1c12), hex(0x7a5a3e), smooth(0.15, 0.85, t));
      c = mix3(c, hex(0x8f7560), clamp01(blotch.d[i] * 1.2) * 0.5);
      return c;
    });
    const rough = Field.from(N, N, (u, v, x, y) => 0.8 + (1 - h.d[y * N + x]) * 0.15);
    writeSet('cork', { albedo, height: h, normalStrength: 7, rough, aoRadius: 8, aoStrength: 4 });
  },

  // Branch bark (U along the branch)
  bark() {
    const N = 512;
    const h = Field.from(N, N, (u, v) => ridged((u * 0.25) % 1, v, { freq: 8, octaves: 4, seed: 61 }) * 0.8 + fbm(u, v, { freq: 16, octaves: 3, seed: 62 }) * 0.5).normalize();
    const albedo = rgbImage(N, N, (u, v, x, y) => mix3(hex(0x3a2d22), hex(0x8c7a66), smooth(0.2, 0.9, h.d[y * N + x])));
    const rough = Field.from(N, N, (u, v, x, y) => 0.75 + (1 - h.d[y * N + x]) * 0.2);
    writeSet('bark', { albedo, height: h, normalStrength: 5, rough, aoStrength: 3 });
  },

  // Desert sand with small pebbles (tile = 0.6 m)
  sand() {
    const N = 1024;
    const dunes = Field.from(N, N, (u, v) => fbm(u, v, { freq: 3, octaves: 4, seed: 71 }));
    const grain = Field.from(N, N, (u, v) => perlin(u * 380, v * 380, 380, 72));
    const peb = Field.from(N, N, (u, v) => { const w = worley(u, v, 26, 73); return w.id > 0.93 ? smooth(0.28, 0.08, w.f1) * (0.6 + w.id * 0.4) : 0; });
    const pebId = Field.from(N, N, (u, v) => worley(u, v, 26, 73).id);
    const albedo = rgbImage(N, N, (u, v, x, y) => {
      const i = y * N + x;
      let c = mix3(hex(0xb88d5e), hex(0xd9b582), clamp01(0.5 + dunes.d[i] * 0.8 + grain.d[i] * 0.25));
      if (peb.d[i] > 0.02) c = mix3(c, mix3(hex(0x7d6a58), hex(0xc9b8a2), pebId.d[i]), smooth(0.02, 0.2, peb.d[i]));
      return c;
    });
    const height = Field.from(N, N, (u, v, x, y) => { const i = y * N + x; return dunes.d[i] * 0.6 + grain.d[i] * 0.12 + peb.d[i] * 0.8; });
    const rough = Field.from(N, N, (u, v, x, y) => 0.92 - peb.d[y * N + x] * 0.25);
    writeSet('sand', { albedo, height, normalStrength: 3, rough, aoStrength: 2 });
  },

  // Tropical bioactive soil with leaf litter & bark chips (tile = 0.5 m)
  soil() {
    const N = 1024;
    const base = Field.from(N, N, (u, v) => fbm(u, v, { freq: 10, octaves: 6, seed: 81 }));
    const fine = Field.from(N, N, (u, v) => perlin(u * 300, v * 300, 300, 84));
    const chipE = new Field(N), chipId = new Field(N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const u = x / N, v = y / N;
      const wu = (u + fbm(u, v, { freq: 6, octaves: 2, seed: 85 }) * 0.04 + 1) % 1;
      const w = worley(wu, v, 22, 82, 1);
      chipE.d[y * N + x] = w.id > 0.62 ? smooth(0.5, 0.15, w.f1 * (1.2 - w.id * 0.3)) : 0;
      chipId.d[y * N + x] = w.id;
    }
    const albedo = rgbImage(N, N, (u, v, x, y) => {
      const i = y * N + x;
      let c = mix3(hex(0x1a120c), hex(0x46331f), clamp01(0.5 + base.d[i] * 1.1 + fine.d[i] * 0.2));
      const e = chipE.d[i];
      if (e > 0) {
        const id = chipId.d[i];
        const lc = id > 0.82 ? mix3(hex(0x6b4424), hex(0x9c6b3b), (id - 0.82) * 5) : mix3(hex(0x2f2016), hex(0x5a3f2a), (id - 0.62) * 5);
        c = mix3(c, lc, smooth(0.0, 0.25, e));
      }
      return c;
    });
    const height = Field.from(N, N, (u, v, x, y) => { const i = y * N + x; return base.d[i] * 0.6 + fine.d[i] * 0.15 + chipE.d[i] * 0.6; });
    const rough = Field.from(N, N, (u, v, x, y) => 0.92 - chipE.d[y * N + x] * 0.2);
    writeSet('soil', { albedo, height, normalStrength: 3, rough, aoStrength: 3 });
  },

  // Layered sandstone / rock (terrarium backgrounds, stones). Tile ~0.5 m.
  rock() {
    const N = 1024;
    const h = Field.from(N, N, (u, v) => {
      const warp = fbm(u, v, { freq: 3, octaves: 4, seed: 91 });
      const strata = Math.sin((v + warp * 0.18) * Math.PI * 2 * 9) * 0.5 + 0.5;
      const r = ridged((u + warp * 0.1) % 1, v, { freq: 5, octaves: 6, seed: 92 });
      const cell = worley((u + warp * 0.05 + 1) % 1, (v + 1) % 1, 5, 93, 1);
      const cracks = smooth(0.0, 0.035, cell.f2 - cell.f1);
      const pits = fbm(u, v, { freq: 24, octaves: 3, seed: 95 });
      return strata * 0.28 + r * 0.75 + cracks * 0.22 + pits * 0.15;
    }).normalize();
    const tone = Field.from(N, N, (u, v) => fbm(u, v, { freq: 4, octaves: 5, seed: 94 }));
    const albedo = rgbImage(N, N, (u, v, x, y) => {
      const i = y * N + x;
      let c = mix3(hex(0x5a4a3d), hex(0xbba386), smooth(0.08, 0.95, h.d[i]));
      c = mix3(c, hex(0x8f8173), clamp01(tone.d[i] + 0.35) * 0.45);
      c = mix3(c, hex(0xd2c2a8), smooth(0.8, 1.0, h.d[i]) * 0.35);
      return c;
    });
    const rough = Field.from(N, N, (u, v, x, y) => 0.76 + (1 - h.d[y * N + x]) * 0.2);
    writeSet('rock', { albedo, height: h, normalStrength: 5, rough, aoRadius: 10, aoStrength: 3 });
  },

  // Moss / live carpet
  moss() {
    const N = 512;
    const h = Field.from(N, N, (u, v) => {
      const w = fbm(u, v, { freq: 4, octaves: 3, seed: 103 });
      const c = worley((u + w * 0.08 + 1) % 1, (v + 1) % 1, 28, 101);
      return (1 - c.f1) * 0.6 + perlin(u * 180, v * 180, 180, 102) * 0.25 + fbm(u, v, { freq: 12, octaves: 4, seed: 104 }) * 0.4;
    }).normalize();
    const tint = Field.from(N, N, (u, v) => fbm(u, v, { freq: 5, octaves: 3, seed: 105 }));
    const albedo = rgbImage(N, N, (u, v, x, y) => { const i = y * N + x; let c = mix3(hex(0x1a2c10), hex(0x6a9433), smooth(0.15, 1, h.d[i])); return mix3(c, hex(0x8a9a3a), clamp01(tint.d[i] + 0.2) * 0.35); });
    const rough = Field.from(N, N, () => 0.92);
    writeSet('moss', { albedo, height: h, normalStrength: 4, rough, aoStrength: 3 });
  },

  // Vermiculite (incubation medium)
  vermiculite() {
    const N = 512;
    const fe = new Field(N), fi = new Field(N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const w = worley(x / N, y / N, 50, 111); fe.d[y * N + x] = w.f2 - w.f1; fi.d[y * N + x] = w.id; }
    const flakes = { d: new Proxy({}, { get: (_, k) => ({ e: fe.d[k], id: fi.d[k] }) }) };
    const albedo = rgbImage(N, N, (u, v, x, y) => { const f = flakes.d[y * N + x]; const c = mix3(hex(0x8a6a3a), hex(0xd9b26a), f.id); return c.map((k) => k * (0.55 + smooth(0, 0.15, f.e) * 0.45)); });
    const height = Field.from(N, N, (u, v, x, y) => smooth(0, 0.2, flakes.d[y * N + x].e) + flakes.d[y * N + x].id * 0.3);
    const rough = Field.from(N, N, (u, v, x, y) => 0.55 + flakes.d[y * N + x].id * 0.3);
    writeSet('vermiculite', { albedo, height, normalStrength: 3, rough, aoStrength: 2 });
  },

  // Brushed aluminium / stainless: streaks along U
  brushed_metal() {
    const N = 512;
    const streak = Field.from(N, N, (u, v) => perlin(u * 2, v * 500, 2, 121) * 0.6 + perlin(u * 8, v * 220, 8, 122) * 0.4);
    const rough = Field.from(N, N, (u, v, x, y) => 0.28 + streak.d[y * N + x] * 0.12);
    const albedo = rgbImage(N, N, (u, v, x, y) => { const t = 0.9 + streak.d[y * N + x] * 0.08; return [t, t, t]; });
    writeSet('brushed_metal', { albedo, height: streak, normalStrength: 0.6, rough, metal: 1, ao: Field.from(N, N, () => 1) });
  },

  // Powder-coat orange-peel micro relief (tinted per material)
  powder_coat() {
    const N = 512;
    const peel = Field.from(N, N, (u, v) => fbm(u, v, { freq: 48, octaves: 3, seed: 131 }));
    const rough = Field.from(N, N, (u, v, x, y) => 0.42 + peel.d[y * N + x] * 0.1);
    writeSet('powder_coat', { height: peel, normalStrength: 1.2, rough, ao: Field.from(N, N, () => 1) });
  },

  // Glazed white metro tiles 30x10 cm (texture = 1.2 x 0.6 m, 4 x 6 tiles, running bond)
  tiles() {
    const W = 1024, H = 512, cols = 4, rows = 6, g = 0.006; // grout in uv
    const tileAt = (u, v) => {
      const r = Math.floor(v * rows); const off = (r % 2) * 0.5;
      const uu = (u * cols + off) % 1, vv = v * rows - r;
      const du = Math.min(uu, 1 - uu) / cols, dv = Math.min(vv, 1 - vv) / rows * (H / W);
      return { d: Math.min(du, dv), id: (Math.floor(u * cols + off) * 7 + r * 13) % 11 / 11 };
    };
    const wav = Field.from(W, H, (u, v) => fbm(u, v, { freq: 8, octaves: 3, seed: 141 }));
    const albedo = rgbImage(W, H, (u, v, x, y) => {
      const t = tileAt(u, v); if (t.d < g) return hex(0x9c9a94);
      const k = 0.9 + t.id * 0.05; return [k, k, k * 0.99];
    });
    const height = Field.from(W, H, (u, v, x, y) => { const t = tileAt(u, v); return t.d < g ? 0 : smooth(g, g * 2.8, t.d) * 0.8 + wav.d[y * W + x] * 0.08; });
    const rough = Field.from(W, H, (u, v) => (tileAt(u, v).d < g ? 0.9 : 0.12));
    writeSet('tiles', { albedo, height, normalStrength: 4, rough, aoStrength: 2 });
  },

  // Water ripples normal (tileable)
  water() {
    const N = 512;
    const h = Field.from(N, N, (u, v) => fbm(u, v, { freq: 6, octaves: 5, gain: 0.55, seed: 151 }));
    writeSet('water', { height: h, normalStrength: 2.5, rough: Field.from(N, N, () => 0.05), ao: Field.from(N, N, () => 1) });
  },

  // Rubber / PVC fine texture (cove base, tub lids)
  rubber() {
    const N = 256;
    const h = Field.from(N, N, (u, v) => perlin(u * 90, v * 90, 90, 161));
    writeSet('rubber', { height: h, normalStrength: 0.8, rough: Field.from(N, N, (u, v, x, y) => 0.7 + h.d[y * N + x] * 0.1), ao: Field.from(N, N, () => 1) });
  },

  // Perforated sheet (vent mesh): alpha mask, 8x8 holes per tile.
  perforated() {
    const N = 256, cells = 8;
    const img = rgbImage(N, N, (u, v) => {
      const r = Math.floor(v * cells); const off = (r % 2) * 0.5;
      const cu = (u * cells + off) % 1 - 0.5, cv = v * cells - r - 0.5;
      const d = Math.hypot(cu, cv);
      const a = smooth(0.33, 0.36, d);
      return [1, 1, 1, a];
    });
    save(img, path.join(OUT, 'perforated/alpha.png'));
    console.log('  perforated         (alpha)');
  },

  // Fine insect mesh (terrarium tops): square weave
  mesh() {
    const N = 256, cells = 16;
    const img = rgbImage(N, N, (u, v) => {
      const cu = (u * cells) % 1, cv = (v * cells) % 1;
      const wire = Math.max(smooth(0.3, 0.2, Math.abs(cu - 0.5) * 2 - 0.55), smooth(0.3, 0.2, Math.abs(cv - 0.5) * 2 - 0.55));
      const edge = Math.min(Math.abs(cu - 0.5), Math.abs(cv - 0.5));
      return [1, 1, 1, clamp01(1 - smooth(0.12, 0.22, edge) + wire * 0)];
    });
    save(img, path.join(OUT, 'mesh/alpha.png'));
    console.log('  mesh               (alpha)');
  },

  // Foliage atlas (2x2): heart leaf, strap leaf, fern frond, succulent/round leaf. RGBA + normal.
  foliage() {
    const N = 1024, C = N / 2;
    const color = createCanvas(N, N), cx = color.getContext('2d');
    const bump = createCanvas(N, N), bx = bump.getContext('2d');
    bx.fillStyle = '#000'; bx.fillRect(0, 0, N, N);
    const rnd = mulberry32(171);

    function leafPath(ctx, ox, oy, w, h, shape) {
      ctx.beginPath();
      if (shape === 'heart') {
        ctx.moveTo(ox + w / 2, oy + h * 0.98);
        ctx.bezierCurveTo(ox + w * 0.05, oy + h * 0.72, ox - w * 0.05, oy + h * 0.1, ox + w * 0.3, oy + h * 0.06);
        ctx.bezierCurveTo(ox + w * 0.42, oy + h * 0.04, ox + w * 0.48, oy + h * 0.12, ox + w / 2, oy + h * 0.16);
        ctx.bezierCurveTo(ox + w * 0.52, oy + h * 0.12, ox + w * 0.58, oy + h * 0.04, ox + w * 0.7, oy + h * 0.06);
        ctx.bezierCurveTo(ox + w * 1.05, oy + h * 0.1, ox + w * 0.95, oy + h * 0.72, ox + w / 2, oy + h * 0.98);
      } else if (shape === 'strap') {
        ctx.moveTo(ox + w * 0.5, oy + h * 0.01);
        ctx.bezierCurveTo(ox + w * 0.78, oy + h * 0.2, ox + w * 0.8, oy + h * 0.8, ox + w * 0.72, oy + h);
        ctx.lineTo(ox + w * 0.28, oy + h);
        ctx.bezierCurveTo(ox + w * 0.2, oy + h * 0.8, ox + w * 0.22, oy + h * 0.2, ox + w * 0.5, oy + h * 0.01);
      } else if (shape === 'oval') {
        ctx.ellipse(ox + w / 2, oy + h / 2, w * 0.36, h * 0.47, 0, 0, Math.PI * 2);
      }
      ctx.closePath();
    }

    function drawLeaf(ox, oy, shape, c0, c1, veins = 7) {
      const pad = 12, w = C - pad * 2, h = C - pad * 2; ox += pad; oy += pad;
      const g = cx.createLinearGradient(ox, oy, ox + w, oy + h);
      g.addColorStop(0, c0); g.addColorStop(1, c1);
      cx.save(); leafPath(cx, ox, oy, w, h, shape); cx.fillStyle = g; cx.fill(); cx.clip();
      // variegation / noise speckle
      for (let i = 0; i < 1400; i++) { cx.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,220' : '0,20,0'},${0.03 + rnd() * 0.04})`; cx.beginPath(); cx.arc(ox + rnd() * w, oy + rnd() * h, 2 + rnd() * 10, 0, 7); cx.fill(); }
      // veins
      cx.strokeStyle = 'rgba(210,235,170,0.55)'; cx.lineWidth = 5;
      cx.beginPath(); cx.moveTo(ox + w / 2, oy + h); cx.lineTo(ox + w / 2, oy + h * 0.08); cx.stroke();
      cx.lineWidth = 2; cx.strokeStyle = 'rgba(200,230,160,0.35)';
      for (let i = 1; i <= veins; i++) {
        const t = i / (veins + 1), y0 = oy + h * (0.1 + t * 0.85);
        for (const s of [-1, 1]) { cx.beginPath(); cx.moveTo(ox + w / 2, y0); cx.quadraticCurveTo(ox + w / 2 + s * w * 0.22, y0 - h * 0.06, ox + w / 2 + s * w * 0.46, y0 - h * 0.16); cx.stroke(); }
      }
      cx.restore();
      bx.save(); leafPath(bx, ox, oy, w, h, shape); bx.fillStyle = '#888'; bx.fill(); bx.clip();
      bx.strokeStyle = '#333'; bx.lineWidth = 8; bx.beginPath(); bx.moveTo(ox + w / 2, oy + h); bx.lineTo(ox + w / 2, oy + h * 0.08); bx.stroke();
      bx.lineWidth = 4; for (let i = 1; i <= veins; i++) { const t = i / (veins + 1), y0 = oy + h * (0.1 + t * 0.85); for (const s of [-1, 1]) { bx.beginPath(); bx.moveTo(ox + w / 2, y0); bx.quadraticCurveTo(ox + w / 2 + s * w * 0.22, y0 - h * 0.06, ox + w / 2 + s * w * 0.46, y0 - h * 0.16); bx.stroke(); } }
      bx.restore();
    }

    function drawFern(ox, oy) {
      const pad = 10, w = C - pad * 2, h = C - pad * 2; ox += pad; oy += pad;
      cx.save(); bx.save();
      cx.strokeStyle = '#3d5a22'; cx.lineWidth = 5; cx.beginPath(); cx.moveTo(ox + w / 2, oy + h); cx.quadraticCurveTo(ox + w * 0.52, oy + h * 0.5, ox + w / 2, oy + 4); cx.stroke();
      const pinnae = 22;
      for (let i = 0; i < pinnae; i++) {
        const t = i / pinnae, y = oy + h * (0.95 - t * 0.9), len = w * 0.46 * Math.sin((1 - t) * Math.PI * 0.85 + 0.15);
        for (const s of [-1, 1]) {
          const g = cx.createLinearGradient(ox + w / 2, y, ox + w / 2 + s * len, y);
          g.addColorStop(0, '#2f5a1e'); g.addColorStop(1, '#6f9c3c');
          cx.fillStyle = g; cx.beginPath(); cx.moveTo(ox + w / 2, y);
          cx.quadraticCurveTo(ox + w / 2 + s * len * 0.5, y - 14, ox + w / 2 + s * len, y - len * 0.25);
          cx.quadraticCurveTo(ox + w / 2 + s * len * 0.5, y + 8, ox + w / 2, y + 10); cx.fill();
          bx.fillStyle = '#777'; bx.beginPath(); bx.moveTo(ox + w / 2, y);
          bx.quadraticCurveTo(ox + w / 2 + s * len * 0.5, y - 14, ox + w / 2 + s * len, y - len * 0.25);
          bx.quadraticCurveTo(ox + w / 2 + s * len * 0.5, y + 8, ox + w / 2, y + 10); bx.fill();
        }
      }
      cx.restore(); bx.restore();
    }

    drawLeaf(0, 0, 'heart', '#2e6a24', '#5f9a3a', 7);        // TL: philodendron / pothos
    drawLeaf(C, 0, 'strap', '#3d6e2c', '#8aa64a', 5);        // TR: bromeliad / sansevieria strap
    drawFern(0, C);                                          // BL: fern frond
    drawLeaf(C, C, 'oval', '#56703a', '#9bb06a', 4);         // BR: small oval (ficus pumila, succulents)

    // Extract rgba, dilate colour under transparent pixels to avoid dark fringes.
    const cd = cx.getImageData(0, 0, N, N).data;
    const rgba = new Uint8ClampedArray(cd);
    for (let pass = 0; pass < 6; pass++) {
      const src = new Uint8ClampedArray(rgba);
      for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
        const i = (y * N + x) * 4; if (src[i + 3] > 10) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = ((y + dy) * N + x + dx) * 4; if (src[j + 3] > 10) { rgba[i] = src[j]; rgba[i + 1] = src[j + 1]; rgba[i + 2] = src[j + 2]; rgba[i + 3] = 1; break; } }
      }
    }
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] === 1) rgba[i] = 0;
    save({ w: N, h: N, rgba }, path.join(OUT, 'foliage/albedo.png'));
    const bd = bx.getImageData(0, 0, N, N).data;
    const hf = Field.from(N, N, (u, v, x, y) => bd[(y * N + x) * 4] / 255).blur(2, 1);
    save(normalImage(normalFromHeight(hf, 4)), path.join(OUT, 'foliage/normal.jpg'), { quality: 92 });
    console.log('  foliage            atlas');
  },

  // Snake skin pattern (ball python style blotches) for animal models
  python_skin() {
    const W = 1024, H = 256;
    const warp = Field.from(W, H, (u, v) => fbm(u, v, { freq: 6, octaves: 3, seed: 181 }));
    const albedo = rgbImage(W, H, (u, v, x, y) => {
      const i = y * W + x;
      const w = worley((u + warp.d[i] * 0.05) % 1, v, 10, 182, 0.8);
      const blotch = smooth(0.42, 0.36, w.f1 * (1 + Math.abs(v - 0.5)));
      const rim = smooth(0.46, 0.42, w.f1) - blotch;
      const dorsal = smooth(0.35, 0.05, Math.abs(v - 0.5));
      let c = mix3(hex(0x2a1d14), hex(0x3b2a1c), dorsal);
      c = mix3(c, hex(0xb48a4c), blotch);
      c = mix3(c, hex(0xe0cfa4), rim * 0.7);
      const belly = smooth(0.35, 0.48, Math.abs(v - 0.5));
      c = mix3(c, hex(0xd8cdb8), belly);
      const sc = worley(u * 6 % 1, v, 12, 183); const scale = smooth(0.0, 0.25, sc.f2 - sc.f1);
      return c.map((k) => k * (0.8 + scale * 0.2));
    });
    const height = Field.from(W, H, (u, v) => { const sc = worley(u * 6 % 1, v, 12, 183); return smooth(0, 0.25, sc.f2 - sc.f1); });
    const rough = Field.from(W, H, () => 0.45);
    writeSet('python_skin', { albedo, height, normalStrength: 2, rough, aoStrength: 1 });
  },
};

console.log('Building textures ->', path.relative(ROOT, OUT));
for (const [name, fn] of Object.entries(sets)) {
  if (only.length && !only.includes(name)) continue;
  const t = Date.now(); fn(); if (Date.now() - t > 3000) console.log(`    (${((Date.now() - t) / 1000).toFixed(1)}s)`);
}
