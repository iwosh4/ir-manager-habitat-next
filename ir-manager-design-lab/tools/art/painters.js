// IR Manager Concept B — procedural "specimen plate" painters.
// Runs in a browser (canvas 2D) at BUILD time (tools/generate-assets.mjs) and produces the WebP imagery used by
// the app: top-down animal portraits, skin macro crops, clutches, feeders, supplements. Everything is original,
// generated from code — no third-party photographs.

// ------------------------------------------------------------------ seeded randomness & noise
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function makeNoise(seed) {
  const r = rng(seed), P = new Uint8Array(512), G = new Float32Array(256);
  for (let i = 0; i < 256; i++) { P[i] = i; G[i] = r(); }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  for (let i = 0; i < 256; i++) P[i + 256] = P[i];
  const s = (t) => t * t * (3 - 2 * t);
  const v = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, X = xi & 255, Y = yi & 255;
    const a = G[P[P[X] + Y]], b = G[P[P[X + 1] + Y]], c = G[P[P[X] + Y + 1]], d = G[P[P[X + 1] + Y + 1]];
    const u = s(xf), w = s(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  v.fbm = (x, y, o = 4) => { let t = 0, amp = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { t += v(x * f, y * f) * amp; n += amp; amp *= 0.5; f *= 2.03; } return t / n; };
  return v;
}
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(c1, c2, t) { const a = typeof c1 === 'string' ? hex(c1) : c1, b = typeof c2 === 'string' ? hex(c2) : c2; return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function rgb(c, k = 1, a = 1) { const x = typeof c === 'string' ? hex(c) : c; return `rgba(${clamp(x[0] * k, 0, 255) | 0},${clamp(x[1] * k, 0, 255) | 0},${clamp(x[2] * k, 0, 255) | 0},${a})`; }

// ------------------------------------------------------------------ substrates (backgrounds)
export function substrate(ctx, W, H, kind, seed) {
  const r = rng(seed), n = makeNoise(seed + 7);
  const pal = {
    cork: ['#2a1c12', '#5a3b24', '#7a5436'], moss: ['#101a0e', '#26391c', '#3f5a2a'], sand: ['#6e5638', '#a88a5e', '#c9aa76'],
    leaf: ['#1e150d', '#4a3219', '#6f4b22'], paper: ['#b9b1a3', '#d9d2c4', '#ece6da'], vermiculite: ['#3c342b', '#6e6152', '#9a8b76'],
    slate: ['#121416', '#23272b', '#34393e'], bark: ['#1b1510', '#3a2c20', '#58432f'],
  }[kind];
  const img = ctx.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const f = n.fbm(x / 90, y / 90, 5), g = n(x / 7, y / 7);
    let c;
    if (kind === 'cork' || kind === 'bark') c = mix(pal[0], f > 0.5 ? pal[2] : pal[1], smooth(0.2, 0.8, f * 0.8 + n(x / 3, y / 40) * 0.35));
    else if (kind === 'moss') c = mix(pal[0], mix(pal[1], pal[2], g), smooth(0.25, 0.75, f + g * 0.25));
    else if (kind === 'vermiculite') c = mix(pal[0], mix(pal[1], pal[2], n(x / 4, y / 4)), smooth(0.3, 0.7, n(x / 5.5, y / 5.5) * 0.7 + f * 0.4));
    else c = mix(pal[0], mix(pal[1], pal[2], g), smooth(0.1, 0.9, f));
    const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // debris / structure
  if (kind === 'leaf' || kind === 'moss') for (let i = 0; i < 38; i++) { // leaf litter
    const x = r() * W, y = r() * H, s = 18 + r() * 42, a = r() * Math.PI * 2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = rgb(kind === 'moss' ? mix('#23361a', '#4c6a2c', r()) : mix('#3a2410', '#8a5a26', r()), 0.9, 0.85);
    ctx.beginPath(); ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * 0.45, s, 0); ctx.quadraticCurveTo(0, s * 0.45, -s, 0); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.stroke(); ctx.restore();
  }
  if (kind === 'cork' || kind === 'bark') { ctx.globalAlpha = 0.35; for (let i = 0; i < 60; i++) { ctx.strokeStyle = r() > 0.5 ? '#140d08' : '#8a6444'; ctx.lineWidth = 1 + r() * 2.5; const y = r() * H; ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= W; x += 30) ctx.lineTo(x, y + Math.sin(x / 60 + i) * 6 + (r() - 0.5) * 5); ctx.stroke(); } ctx.globalAlpha = 1; }
  if (kind === 'vermiculite') for (let i = 0; i < W * H / 60; i++) { const x = r() * W, y = r() * H; ctx.fillStyle = rgb(mix('#8c7c66', '#d8c8a6', r()), 1, 0.55); ctx.beginPath(); ctx.ellipse(x, y, 1 + r() * 3, 0.6 + r() * 1.8, r() * 3, 0, 7); ctx.fill(); }
}
export function studioLight(ctx, W, H, { x = 0.38, y = 0.3, strength = 0.55, vignette = 0.75 } = {}) {
  let g = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, Math.max(W, H) * 0.85);
  g.addColorStop(0, `rgba(255,236,205,${strength * 0.35})`); g.addColorStop(0.5, 'rgba(255,230,200,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${vignette})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function dropShadow(ctx, fn, { blur = 18, dx = 8, dy = 12, alpha = 0.55 } = {}) {
  ctx.save(); ctx.shadowColor = `rgba(0,0,0,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = dx; ctx.shadowOffsetY = dy; ctx.fillStyle = '#000'; fn(); ctx.restore();
}

// ------------------------------------------------------------------ pattern fill helper: paint pixels inside a path
function maskFrom(W, H, paths) {
  const m = new OffscreenCanvas(W, H), c = m.getContext('2d'); c.fillStyle = '#000';
  for (const p of [].concat(paths)) c.fill(p); // each part filled separately: overlapping parts never cancel
  return m;
}
function paintInside(ctx, paths, W, H, colorAt) {
  const oc = new OffscreenCanvas(W, H), o = oc.getContext('2d');
  const img = o.createImageData(W, H), d = img.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = colorAt(x, y); const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; }
  o.putImageData(img, 0, 0);
  o.globalCompositeOperation = 'destination-in'; o.drawImage(maskFrom(W, H, paths), 0, 0);
  ctx.drawImage(oc, 0, 0);
}
function shadowOf(ctx, W, H, paths, { blur, dx, dy, alpha }) {
  ctx.save(); ctx.shadowColor = `rgba(0,0,0,${alpha})`; ctx.shadowBlur = blur; ctx.shadowOffsetX = dx; ctx.shadowOffsetY = dy;
  ctx.drawImage(maskFrom(W, H, paths), 0, 0); ctx.restore();
}
function tintInside(ctx, W, H, paths, style) { const oc = new OffscreenCanvas(W, H), o = oc.getContext('2d'); o.fillStyle = style; o.fillRect(0, 0, W, H); o.globalCompositeOperation = 'destination-in'; o.drawImage(maskFrom(W, H, paths), 0, 0); ctx.drawImage(oc, 0, 0); }
function shadeInside(ctx, path, cx, cy, rx, ry, { light = [-0.45, -0.55], ambient = 0.35, rim = 0.5 } = {}) {
  // soft volumetric shading of a blob-like body (top-down) + specular sheen
  ctx.save(); ctx.clip(path);
  let g = ctx.createRadialGradient(cx + light[0] * rx * 0.5, cy + light[1] * ry * 0.5, 0, cx, cy, Math.max(rx, ry) * 1.15);
  g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${rim})`);
  ctx.fillStyle = g; ctx.fillRect(cx - rx * 2, cy - ry * 2, rx * 4, ry * 4);
  ctx.restore();
}
function gloss(ctx, x, y, rx, ry, a = 0.55, rot = -0.5) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
  g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rx, 0, 7); ctx.fill(); ctx.restore();
}

// ------------------------------------------------------------------ FROG (Dendrobates) — top-down
function frogPaths(s) {
  // unit frog, facing up (-y), body centre at 0,0, size s ≈ body length
  const body = new Path2D(), legs = new Path2D(), pads = [];
  const L = s;
  // body + head as one smooth outline
  body.moveTo(0, -0.62 * L);
  body.bezierCurveTo(0.2 * L, -0.62 * L, 0.3 * L, -0.5 * L, 0.3 * L, -0.34 * L);
  body.bezierCurveTo(0.33 * L, -0.2 * L, 0.37 * L, 0.05 * L, 0.34 * L, 0.22 * L);
  body.bezierCurveTo(0.3 * L, 0.42 * L, 0.14 * L, 0.52 * L, 0, 0.52 * L);
  body.bezierCurveTo(-0.14 * L, 0.52 * L, -0.3 * L, 0.42 * L, -0.34 * L, 0.22 * L);
  body.bezierCurveTo(-0.37 * L, 0.05 * L, -0.33 * L, -0.2 * L, -0.3 * L, -0.34 * L);
  body.bezierCurveTo(-0.3 * L, -0.5 * L, -0.2 * L, -0.62 * L, 0, -0.62 * L);
  const limb = (pts, w) => { // thick limb as capsule chain
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], a = Math.atan2(y2 - y1, x2 - x1), ww = w * (1 - i * 0.18);
      const nx = Math.sin(a) * ww, ny = -Math.cos(a) * ww;
      legs.moveTo(x1 + nx, y1 + ny); legs.lineTo(x2 + nx * 0.8, y2 + ny * 0.8); legs.lineTo(x2 - nx * 0.8, y2 - ny * 0.8); legs.lineTo(x1 - nx, y1 - ny); legs.closePath();
      legs.moveTo(x2 + ww * 0.8, y2); legs.arc(x2, y2, ww * 0.8, 0, Math.PI * 2);
    }
  };
  for (const sx of [1, -1]) {
    // front leg: out, then forward
    const f = [[0.24 * sx * L, -0.26 * L], [0.52 * sx * L, -0.2 * L], [0.62 * sx * L, -0.46 * L]];
    limb(f, 0.075 * L);
    for (const [dx, dy] of [[0.12, -0.14], [0.02, -0.18], [-0.07, -0.12]]) { const x = f[2][0] + dx * sx * L, y = f[2][1] + dy * L; legs.moveTo(f[2][0], f[2][1]); pads.push([x, y, 0.045 * L]); limbSeg(legs, f[2][0], f[2][1], x, y, 0.022 * L); }
    // hind leg: folded Z
    const h = [[0.26 * sx * L, 0.28 * L], [0.6 * sx * L, 0.18 * L], [0.44 * sx * L, 0.52 * L], [0.72 * sx * L, 0.66 * L]];
    limb(h, 0.1 * L);
    for (const [dx, dy] of [[0.2, -0.02], [0.18, 0.12], [0.08, 0.2], [-0.04, 0.2]]) { const x = h[3][0] + dx * sx * L, y = h[3][1] + dy * L; pads.push([x, y, 0.042 * L]); limbSeg(legs, h[3][0], h[3][1], x, y, 0.02 * L); }
  }
  return { body, legs, pads };
}
function limbSeg(p, x1, y1, x2, y2, w, w2 = w) { // tapered capsule with round caps
  const a = Math.atan2(y2 - y1, x2 - x1);
  p.moveTo(x1 + Math.cos(a + Math.PI / 2) * w, y1 + Math.sin(a + Math.PI / 2) * w);
  p.arc(x1, y1, w, a + Math.PI / 2, a - Math.PI / 2);
  p.lineTo(x2 + Math.cos(a - Math.PI / 2) * w2, y2 + Math.sin(a - Math.PI / 2) * w2);
  p.arc(x2, y2, w2, a - Math.PI / 2, a + Math.PI / 2);
  p.closePath();
}

export function paintFrog(ctx, W, H, { species = 'azureus', seed = 1, scale = 0.5, rot = 0, bg = 'moss' } = {}) {
  const r = rng(seed), n = makeNoise(seed * 13 + 5);
  substrate(ctx, W, H, bg, seed + 100);
  const L = Math.min(W, H) * scale, cx = W * (0.5 + (r() - 0.5) * 0.06), cy = H * (0.54 + (r() - 0.5) * 0.05);
  const a = rot + (r() - 0.5) * 0.9;
  const { body, legs, pads } = frogPaths(L);
  const M = new DOMMatrix().translate(cx, cy).rotate(a * 180 / Math.PI);
  const tb = new Path2D(); tb.addPath(body, M); const tl = new Path2D(); tl.addPath(legs, M);
  const tp = new Path2D(); for (const [x, y, rr] of pads) { const p = M.transformPoint({ x, y }); tp.moveTo(p.x + rr, p.y); tp.arc(p.x, p.y, rr, 0, 7); }
  const all = [tl, tp, tb];
  shadowOf(ctx, W, H, all, { blur: L * 0.08, dx: L * 0.04, dy: L * 0.06, alpha: 0.65 });
  const inv = M.inverse();
  // colour field in frog-local space
  const col = species === 'azureus'
    ? (x, y) => {
      const p = inv.transformPoint({ x, y }), u = p.x / L, v = p.y / L;
      const base = mix('#0d2f8c', '#3f8ff0', clamp(0.55 - v * 0.6 + n(u * 3, v * 3) * 0.3));
      const spot = n(u * 9 + 3, v * 9) + n(u * 21, v * 21) * 0.25;
      const body = Math.hypot(u / 0.34, (v + 0.05) / 0.56) < 1;
      const k = body ? smooth(0.66, 0.7, spot) * smooth(-0.62, -0.25, v) : smooth(0.7, 0.74, spot);
      return mix(base, '#05070d', k);
    }
    : species === 'leucomelas'
      ? (x, y) => {
        const p = inv.transformPoint({ x, y }), u = p.x / L, v = p.y / L;
        // three irregular yellow bands (head, mid-body, rump) with black spots and ragged edges
        const wob = (n.fbm(u * 3.5 + 2, v * 3.5, 3) - 0.5) * 0.22 + Math.abs(u) * 0.12;
        const d = Math.min(Math.abs(v + 0.4 + wob), Math.abs(v - 0.02 + wob * 1.2), Math.abs(v - 0.4 + wob));
        const legBand = Math.abs(u) > 0.36 ? smooth(0.55, 0.6, n(u * 5, v * 5)) : 0;
        const band = Math.max(1 - smooth(0.085, 0.11, d), legBand);
        const yel = mix('#e9a806', '#ffd23a', n(u * 4, v * 4));
        const spot = smooth(0.73, 0.76, n(u * 11, v * 11));
        return mix(mix('#07080a', '#17181c', n(u * 5, v * 5)), mix(yel, '#07080a', spot), band);
      }
      : (x, y) => mix('#2a8a3a', '#7fd06a', n(x / 40, y / 40));
  paintInside(ctx, all, W, H, col);
  // shading: legs darker, body volume
  tintInside(ctx, W, H, [tl, tp], 'rgba(0,0,10,0.18)');
  shadeInside(ctx, tb, cx, cy, L * 0.36, L * 0.56, { rim: 0.62 });
  // eyes: glossy black, bulging at head sides
  for (const sx of [1, -1]) {
    const e = M.transformPoint({ x: 0.22 * sx * L, y: -0.4 * L });
    ctx.fillStyle = '#030305'; ctx.beginPath(); ctx.ellipse(e.x, e.y, L * 0.085, L * 0.075, a, 0, 7); ctx.fill();
    gloss(ctx, e.x - L * 0.025, e.y - L * 0.03, L * 0.035, L * 0.022, 0.9);
  }
  // wet sheen
  const g1 = M.transformPoint({ x: -0.1 * L, y: -0.1 * L }); gloss(ctx, g1.x, g1.y, L * 0.22, L * 0.1, 0.22, a - 0.6);
  const g2 = M.transformPoint({ x: -0.12 * L, y: -0.48 * L }); gloss(ctx, g2.x, g2.y, L * 0.12, L * 0.05, 0.3, a - 0.2);
  studioLight(ctx, W, H);
}

// ------------------------------------------------------------------ GECKO (Correlophus ciliatus) — top-down
const GECKO_W = [[0, 0.018], [0.035, 0.075], [0.08, 0.115], [0.13, 0.1], [0.17, 0.075], [0.26, 0.118], [0.4, 0.135], [0.5, 0.118], [0.56, 0.085], [0.7, 0.05], [1, 0.008]];
function profile(pts, t) { for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, wa] = pts[i - 1], [b, wb] = pts[i]; const k = (t - a) / (b - a); return lerp(wa, wb, (1 - Math.cos(k * Math.PI)) / 2); } return pts[pts.length - 1][1]; }
export function paintGecko(ctx, W, H, { morph = 'harlequin', seed = 1, scale = 0.78, bg = 'cork' } = {}) {
  const r = rng(seed), n = makeNoise(seed * 17 + 3);
  substrate(ctx, W, H, bg, seed + 200);
  const L = Math.min(W, H) * scale, cx = W * 0.5, cy = H * 0.5, a = (r() - 0.5) * 0.7 + 0.35;
  const M = new DOMMatrix().translate(cx, cy).rotate(a * 180 / Math.PI);
  const curl = 0.6 + r() * 0.8;
  const spine = []; for (let i = 0; i <= 90; i++) { const t = i / 90; const y = -0.5 + t * 0.95; const x = Math.sin(t * 3 + seed) * 0.025 + (t > 0.55 ? Math.pow((t - 0.55) / 0.45, 2) * 0.22 * curl : 0); spine.push([x * L, y * L, t]); }
  const width = (t) => profile(GECKO_W, t) * L;
  const body = new Path2D(), left = [], right = [];
  const frame = (i) => { const [x, y, t] = spine[i], [x2, y2] = spine[Math.min(spine.length - 1, i + 1)], [x0, y0] = spine[Math.max(0, i - 1)]; const ang = Math.atan2(y2 - y0, x2 - x0); return { x, y, t, nx: -Math.sin(ang), ny: Math.cos(ang), tx: Math.cos(ang), ty: Math.sin(ang) }; };
  for (let i = 0; i < spine.length; i++) { const f = frame(i), w = width(f.t); left.push([f.x + f.nx * w, f.y + f.ny * w]); right.push([f.x - f.nx * w, f.y - f.ny * w]); }
  body.moveTo(...left[0]); for (const p of left) body.lineTo(...p); for (const p of [...right].reverse()) body.lineTo(...p); body.closePath();
  const legs = new Path2D(), pads = [];
  const limb = (ti, side, out, back, fwd, toesAng) => {
    const f = frame(Math.round(ti * 90)), w = width(f.t);
    const sx = f.x + f.nx * side * w * 0.7, sy = f.y + f.ny * side * w * 0.7;             // shoulder / hip
    const ex = sx + f.nx * side * out * L - f.tx * back * L, ey = sy + f.ny * side * out * L - f.ty * back * L; // elbow / knee
    const hx = ex + f.nx * side * 0.05 * L + f.tx * fwd * L, hy = ey + f.ny * side * 0.05 * L + f.ty * fwd * L; // wrist / ankle
    limbSeg(legs, sx, sy, ex, ey, 0.036 * L, 0.03 * L); limbSeg(legs, ex, ey, hx, hy, 0.028 * L, 0.022 * L);
    const base = Math.atan2(hy - ey, hx - ex);
    for (let k = -2; k <= 2; k++) { const ang = base + k * 0.42 + side * toesAng; const tx = hx + Math.cos(ang) * 0.07 * L, ty = hy + Math.sin(ang) * 0.07 * L; limbSeg(legs, hx, hy, tx, ty, 0.011 * L, 0.009 * L); pads.push([tx, ty, 0.02 * L]); }
  };
  for (const side of [1, -1]) { limb(0.22, side, 0.16, 0.06, -0.16, 0.2); limb(0.52, side, 0.17, -0.1, 0.12, -0.25); }
  const pb = new Path2D(); pb.addPath(body, M); const pl = new Path2D(); pl.addPath(legs, M);
  const pp = new Path2D(); for (const [x, y, rr] of pads) { const p = M.transformPoint({ x, y }); pp.moveTo(p.x + rr, p.y); pp.arc(p.x, p.y, rr, 0, 7); }
  const all = [pl, pp, pb];
  shadowOf(ctx, W, H, all, { blur: L * 0.05, dx: L * 0.03, dy: L * 0.04, alpha: 0.6 });
  const inv = M.inverse();
  const morphs = { harlequin: ['#7a3f16', '#d9822f', '#f1dfbc'], dalmatian: ['#b8903e', '#e3c671', '#15100b'], flame: ['#5e2412', '#bf4d1d', '#f0c89c'], olive: ['#44441f', '#77773a', '#d6c797'] };
  const [c0, c1, c2] = morphs[morph] || morphs.harlequin;
  paintInside(ctx, all, W, H, (x, y) => {
    const p = inv.transformPoint({ x, y }), u = p.x / L, v = p.y / L;
    let c = mix(c0, c1, smooth(0.25, 0.8, n.fbm(u * 5, v * 5, 3) + 0.15));
    if (morph === 'dalmatian') c = mix(c, c2, smooth(0.72, 0.75, n(u * 16, v * 16)));
    else {
      const t = clamp((v + 0.5) / 0.95), w = Math.max(0.01, profile(GECKO_W, t)), flank = Math.abs(u - (t > 0.55 ? Math.pow((t - 0.55) / 0.45, 2) * 0.22 * curl : 0)) / w;
      if (flank < 1.02) c = mix(c, c2, smooth(0.55, 0.95, flank) * smooth(0.4, 0.62, n(u * 6, v * 9)) * (t > 0.15 && t < 0.6 ? 1 : 0.4));
      else c = mix(c, c2, smooth(0.6, 0.72, n(u * 9, v * 9)) * 0.6); // limbs
    }
    return mix(c, [0, 0, 0], (n(u * 70, v * 70) - 0.5) * 0.28); // granular skin
  });
  shadeInside(ctx, pb, cx, cy, L * 0.2, L * 0.5, { rim: 0.55 });
  tintInside(ctx, W, H, [pl, pp], 'rgba(0,0,0,.14)');
  // crests: fringe from above the eyes along the dorsolateral edges
  ctx.save(); ctx.strokeStyle = rgb(c2, 0.95, 0.85); ctx.lineWidth = Math.max(1, L * 0.007); ctx.lineCap = 'round';
  for (const sd of [1, -1]) { ctx.beginPath(); for (let i = 5; i < 50; i++) { const f = frame(i), w = width(f.t) * 0.72, q = M.transformPoint({ x: f.x + f.nx * sd * w, y: f.y + f.ny * sd * w }); const j = (i % 2 ? 1 : -1) * L * 0.004; if (i === 5) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x + j, q.y + j); } ctx.stroke(); }
  ctx.restore();
  for (const sd of [1, -1]) { const f = frame(7), q = M.transformPoint({ x: f.x + f.nx * sd * width(f.t) * 0.72, y: f.y + f.ny * sd * width(f.t) * 0.72 }); ctx.fillStyle = '#3a2410'; ctx.beginPath(); ctx.arc(q.x, q.y, L * 0.026, 0, 7); ctx.fill(); ctx.fillStyle = '#0a0604'; ctx.beginPath(); ctx.ellipse(q.x, q.y, L * 0.005, L * 0.02, a, 0, 7); ctx.fill(); gloss(ctx, q.x - L * 0.008, q.y - L * 0.01, L * 0.01, L * 0.007, 0.9); }
  const g1 = M.transformPoint({ x: -0.04 * L, y: -0.05 * L }); gloss(ctx, g1.x, g1.y, L * 0.12, L * 0.05, 0.12, a - 1.2);
  studioLight(ctx, W, H);
}

// ------------------------------------------------------------------ SNAKES — coiled, top-down
const SNAKES = {
  regius: { w: 0.075, turns: 2.1, head: 'python', pattern: (n, u, s) => {
    const back = smooth(0.52, 0.56, n.fbm(u * 0.9, s * 1.4, 3) + (1 - Math.abs(s)) * 0.12);
    const base = mix('#6b4a1f', '#b88838', smooth(0.2, 0.8, n(u * 3, s * 2)));
    const alien = smooth(0.62, 0.66, n(u * 1.6 + 9, s * 2.2));
    let c = mix('#1c120b', base, back);
    c = mix(c, '#d9b36a', alien * back * 0.8);
    return mix(c, '#e9dcc0', smooth(0.82, 0.98, Math.abs(s)) * 0.6);
  } },
  spilota: { w: 0.07, turns: 2.4, head: 'python', pattern: (n, u, s) => {
    const f = n.fbm(u * 1.4, s * 1.8, 3);
    const ring = Math.abs(f - 0.5);
    let c = mix('#4a4222', '#8f7d3a', smooth(0.3, 0.8, n(u * 3, s * 3)));
    c = mix('#0c0b08', c, smooth(0.035, 0.07, ring));
    return mix(c, '#d8c48a', smooth(0.14, 0.2, ring) * smooth(0.55, 0.6, n(u * 2 + 5, s * 2)) * 0.8);
  } },
  squamigera: { w: 0.06, turns: 2.6, head: 'viper', pattern: (n, u, s) => {
    let c = mix('#1f5a1c', '#62a83a', smooth(0.25, 0.85, n(u * 2, s * 2) + (1 - Math.abs(s)) * 0.2));
    const band = smooth(0.9, 0.97, Math.sin(u * 2.1 + n(u, s) * 2));
    c = mix(c, '#c9d65a', band * 0.7);
    const keel = Math.abs(((u * 11 + (s * 7 | 0) * 0.5) % 1) - 0.5); // keeled scale rows
    return mix(c, '#0a1a08', smooth(0.44, 0.5, keel) * 0.55);
  } },
  lindheimeri: { w: 0.065, turns: 2.3, head: 'colubrid', pattern: (n, u, s) => {
    const bl = smooth(0.56, 0.6, n(u * 1.9, s * 1.2) + (1 - Math.abs(s)) * 0.1);
    let c = mix('#7d7a66', '#b5ad8a', n(u * 3, s * 3));
    return mix(c, '#2b1d14', bl);
  } },
  leucistic: { w: 0.065, turns: 2.3, head: 'colubrid', eye: '#2c5a9a', pattern: (n, u, s) => mix('#d9d6cf', '#fbfaf6', smooth(0.2, 0.8, n(u * 3, s * 3) + (1 - Math.abs(s)) * 0.3)) },
};
export function paintSnake(ctx, W, H, { species = 'regius', seed = 1, bg = 'bark' } = {}) {
  const sp = SNAKES[species], r = rng(seed), n = makeNoise(seed * 29 + 11);
  substrate(ctx, W, H, bg, seed + 300);
  const S = Math.min(W, H), cx = W * (0.5 + (r() - 0.5) * 0.05), cy = H * (0.5 + (r() - 0.5) * 0.05);
  const bw = sp.w * S, gap = bw * 2.25, turns = sp.turns + r() * 0.3, a0 = r() * Math.PI * 2;
  // spiral path from inner (tail) to outer, then head crosses inward over the coils
  const pts = [];
  const thetaMax = turns * Math.PI * 2;
  for (let th = 0.6; th <= thetaMax;) { const rr = gap * th / (Math.PI * 2) + bw * 0.6; pts.push([cx + Math.cos(th + a0) * rr, cy + Math.sin(th + a0) * rr]); th += Math.min(0.012, 1.4 / rr); } // ~1.4 px arc steps at any size
  // neck + head: continue tangentially then curve toward the centre across the coils
  const [lx, ly] = pts[pts.length - 1], [px, py] = pts[pts.length - 2]; let dx = lx - px, dy = ly - py; const dl = Math.hypot(dx, dy); dx /= dl; dy /= dl;
  let hx = lx, hy = ly, hdx = dx, hdy = dy;
  const hs = Math.max(1.4, S / 480 * 1.3); for (let i = 0; i < 90 * 2.6 / hs; i++) { const tx = cx - hx, ty = cy - hy, tl = Math.hypot(tx, ty); hdx = lerp(hdx, tx / tl, 0.035 * hs / 2.6); hdy = lerp(hdy, ty / tl, 0.035 * hs / 2.6); const hl = Math.hypot(hdx, hdy); hdx /= hl; hdy /= hl; hx += hdx * hs * S / 480; hy += hdy * hs * S / 480; pts.push([hx, hy]); }
  const N = pts.length; const cum = [0]; for (let i = 1; i < N; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[N - 1];
  const widthAt = (t) => bw * (t < 0.12 ? 0.25 + t / 0.12 * 0.75 : t > 0.93 ? 1 - (t - 0.93) / 0.07 * 0.45 : 1);
  // shadow pass
  ctx.save(); ctx.filter = `blur(${bw * 0.35}px)`; ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (let i = 0; i < N; i += 2) { const t = cum[i] / total; ctx.beginPath(); ctx.arc(pts[i][0] + bw * 0.25, pts[i][1] + bw * 0.35, widthAt(t) * 1.02, 0, 7); ctx.fill(); }
  ctx.restore(); ctx.filter = 'none';
  // body: lateral scanlines with pattern + cylindrical shading
  const LAT = 22;
  for (let i = 0; i < N - 1; i++) {
    const t = cum[i] / total, w = widthAt(t), [x, y] = pts[i], [x2, y2] = pts[i + 1];
    let tx = x2 - x, ty = y2 - y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl; const nx = -ty, ny = tx;
    const u = cum[i] / bw * 0.22;
    for (let k = 0; k < LAT; k++) {
      const s = (k + 0.5) / LAT * 2 - 1; // -1..1 across the body
      let c = sp.pattern(n, u, s);
      const lightDot = clamp(0.55 + (-nx * 0.6 - ny * 0.8) * s * 0.55); // side facing the light is brighter
      const cyl = Math.sqrt(1 - s * s);
      c = mix([0, 0, 0], c, 0.28 + 0.72 * cyl * (0.65 + lightDot * 0.5));
      const scale = 0.9 + 0.2 * (((u * 14 + s * 5) % 1 + 1) % 1 > 0.85 ? 0 : 1); // scale rows
      ctx.fillStyle = rgb(c, scale);
      const px = Math.max(2.4, (2 * w) / LAT + 1.2); ctx.fillRect(x + nx * s * w - px / 2, y + ny * s * w - px / 2, px, px);
    }
  }
  // highlight ridge
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.strokeStyle = 'rgba(255,245,225,0.10)'; ctx.lineWidth = bw * 0.35; ctx.lineCap = 'round';
  ctx.beginPath(); for (let i = 0; i < N; i += 3) { const [x, y] = pts[i]; if (!i) ctx.moveTo(x - bw * 0.25, y - bw * 0.3); else ctx.lineTo(x - bw * 0.25, y - bw * 0.3); } ctx.stroke(); ctx.restore();
  // head
  const [ex, ey] = pts[N - 1], [bx, by] = pts[N - 12]; const ang = Math.atan2(ey - by, ex - bx);
  ctx.save(); ctx.translate(ex, ey); ctx.rotate(ang);
  const hl = bw * (sp.head === 'viper' ? 1.9 : 1.7), hw = bw * (sp.head === 'viper' ? 1.25 : sp.head === 'python' ? 1.0 : 0.85);
  const head = new Path2D(); head.moveTo(-hl * 0.2, -hw * 0.75); head.bezierCurveTo(hl * 0.35, -hw * (sp.head === 'viper' ? 1.1 : 0.9), hl * 0.9, -hw * 0.6, hl, 0); head.bezierCurveTo(hl * 0.9, hw * 0.6, hl * 0.35, hw * (sp.head === 'viper' ? 1.1 : 0.9), -hl * 0.2, hw * 0.75); head.closePath();
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = bw * 0.4; ctx.shadowOffsetX = bw * 0.2; ctx.shadowOffsetY = bw * 0.3;
  const hc = sp.pattern(n, total / bw * 0.22, 0); ctx.fillStyle = rgb(hc, 0.95); ctx.fill(head); ctx.restore();
  ctx.save(); ctx.clip(head);
  const g = ctx.createLinearGradient(0, -hw, 0, hw); g.addColorStop(0, 'rgba(255,255,255,0.12)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = g; ctx.fillRect(-hl, -hw * 1.2, hl * 2.2, hw * 2.4);
  if (species === 'regius') { ctx.strokeStyle = 'rgba(20,12,6,.8)'; ctx.lineWidth = hw * 0.18; for (const sy of [1, -1]) { ctx.beginPath(); ctx.moveTo(-hl * 0.2, sy * hw * 0.35); ctx.lineTo(hl * 0.75, sy * hw * 0.12); ctx.stroke(); } }
  if (sp.head === 'viper') { ctx.fillStyle = 'rgba(10,30,8,.35)'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(r() * hl, (r() - 0.5) * hw * 1.6, hw * 0.07, 0, 7); ctx.fill(); } }
  ctx.restore();
  for (const sy of [1, -1]) { ctx.fillStyle = sp.eye || (sp.head === 'viper' ? '#c7c03a' : '#1a120a'); ctx.beginPath(); ctx.ellipse(hl * 0.55, sy * hw * 0.62, hw * 0.16, hw * 0.13, 0, 0, 7); ctx.fill(); if (sp.head === 'viper') { ctx.fillStyle = '#050505'; ctx.fillRect(hl * 0.55 - 1, sy * hw * 0.62 - hw * 0.11, 2, hw * 0.22); } gloss(ctx, hl * 0.53, sy * hw * 0.58, hw * 0.07, hw * 0.05, 0.8); }
  ctx.restore();
  studioLight(ctx, W, H, { strength: 0.5 });
}

// ------------------------------------------------------------------ CHAMELEON (Furcifer pardalis) — side view on a branch
export function paintChameleon(ctx, W, H, { locale = 'ambilobe', seed = 1 } = {}) {
  const r = rng(seed), n = makeNoise(seed * 31 + 1);
  substrate(ctx, W, H, 'slate', seed + 400);
  for (let i = 0; i < 26; i++) { const x = r() * W, y = r() * H, rr = 20 + r() * 80; const g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `rgba(${40 + r() * 40 | 0},${80 + r() * 60 | 0},${40 + r() * 30 | 0},0.32)`); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
  const S = Math.min(W, H), flip = r() > 0.5 ? -1 : 1;
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(flip, 1); ctx.translate(-W / 2, -H / 2);
  const by = H * 0.64, x0 = W * 0.1, s = S * 1.05;
  const P = (x, y) => [x0 + x * s, by + y * s];
  // branch
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10;
  const bgr = ctx.createLinearGradient(0, by - S * 0.02, 0, by + S * 0.05); bgr.addColorStop(0, '#7a5a3e'); bgr.addColorStop(0.45, '#46331f'); bgr.addColorStop(1, '#1b120a'); ctx.fillStyle = bgr;
  ctx.beginPath(); ctx.moveTo(-10, by - S * 0.005); ctx.bezierCurveTo(W * 0.3, by - S * 0.02, W * 0.7, by + S * 0.01, W + 10, by - S * 0.01); ctx.lineTo(W + 10, by + S * 0.05); ctx.bezierCurveTo(W * 0.7, by + S * 0.07, W * 0.3, by + S * 0.05, -10, by + S * 0.055); ctx.fill(); ctx.restore();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 12; i++) { ctx.beginPath(); const yy = by + S * (0.005 + r() * 0.04); ctx.moveTo(r() * W, yy); ctx.lineTo(r() * W, yy + (r() - 0.5) * 4); ctx.stroke(); }
  const body = new Path2D();
  body.moveTo(...P(0.0, -0.205));
  body.bezierCurveTo(...P(0.0, -0.25), ...P(0.05, -0.33), ...P(0.15, -0.37)); // casque front
  body.bezierCurveTo(...P(0.19, -0.37), ...P(0.2, -0.32), ...P(0.21, -0.29)); // casque back
  body.bezierCurveTo(...P(0.28, -0.35), ...P(0.4, -0.38), ...P(0.5, -0.35)); // dorsal arc
  body.bezierCurveTo(...P(0.6, -0.32), ...P(0.66, -0.24), ...P(0.67, -0.16)); // rump
  body.bezierCurveTo(...P(0.63, -0.1), ...P(0.5, -0.085), ...P(0.4, -0.09)); // belly
  body.bezierCurveTo(...P(0.3, -0.1), ...P(0.2, -0.11), ...P(0.14, -0.13)); // throat
  body.bezierCurveTo(...P(0.09, -0.15), ...P(0.03, -0.17), ...P(0.0, -0.205));
  const tail = new Path2D(), tp = [];
  const tc = [0.8, 0.12];
  for (let t = 0; t <= 1; t += 0.008) {
    // from the rump down behind the branch into an inward spiral
    const ang = -Math.PI * 0.75 + t * Math.PI * 2.7, rr = 0.15 * (1 - t * 0.78);
    tp.push(P(tc[0] + Math.cos(ang) * rr, tc[1] + Math.sin(ang) * rr));
  }
  tp.unshift(P(0.66, -0.17));
  for (let i = 0; i < tp.length - 1; i++) { const w = s * 0.042 * (1 - (i / tp.length) * 0.82); limbSeg(tail, ...tp[i], ...tp[i + 1], w, w * 0.99); }
  const legs = new Path2D();
  const leg = (hx, hy, kx, ky, fx, fy, w) => { limbSeg(legs, ...P(hx, hy), ...P(kx, ky), w, w * 0.8); limbSeg(legs, ...P(kx, ky), ...P(fx, fy), w * 0.8, w * 0.65); const [a, b] = P(fx, fy); legs.moveTo(a + w * 1.5, b); legs.ellipse(a, b, w * 1.6, w * 0.9, 0, 0, 7); };
  leg(0.27, -0.14, 0.2, -0.05, 0.25, 0.0, s * 0.024); leg(0.57, -0.14, 0.66, -0.06, 0.6, 0.0, s * 0.026);
  const all = [tail, legs, body];
  shadowOf(ctx, W, H, all, { blur: 24, dx: 0, dy: 12, alpha: 0.5 });
  const pal = locale === 'nosybe' ? ['#0f4f9a', '#26a4c4', '#e6f4ff', '#1b3470'] : ['#8a1d18', '#1f8a5c', '#f2e2c4', '#c63c2a'];
  paintInside(ctx, all, W, H, (x, y) => {
    const u = (x - x0) / s, v = (y - by) / s;
    let c = mix(pal[0], pal[3], smooth(0.3, 0.7, n(u * 6, v * 6)));
    const bars = Math.sin(u * 34 + n(u * 3, v * 3) * 3.5);
    c = mix(c, pal[1], smooth(0.25, 0.75, bars) * 0.78 * smooth(-0.37, -0.2, v));
    const stripe = -0.16 + (u - 0.4) * 0.02 + (n(u * 8, 2) - 0.5) * 0.02;
    if (u > 0.22 && u < 0.62) c = mix(c, pal[2], (1 - smooth(0.008, 0.016, Math.abs(v - stripe))) * 0.9);
    if (u < 0.2 && v > -0.2) c = mix(c, pal[2], 0.35); // lips / throat
    return mix(c, [0, 0, 0], (n(u * 140, v * 140) - 0.5) * 0.4); // granular scales
  });
  ctx.save(); ctx.clip(body); const g = ctx.createLinearGradient(0, by - s * 0.38, 0, by - s * 0.08); g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  tintInside(ctx, W, H, [legs], 'rgba(0,0,0,.18)');
  // dorsal crest
  ctx.fillStyle = rgb(pal[2], 0.8, 0.8); for (let i = 0; i < 12; i++) { const t = 0.25 + i * 0.026; const [px, py] = P(t, -0.355 - Math.sin((t - 0.21) / 0.46 * Math.PI) * 0.025 + 0.012); ctx.beginPath(); ctx.moveTo(px - 3, py + 2); ctx.lineTo(px, py - 5); ctx.lineTo(px + 3, py + 2); ctx.fill(); }
  // mouth line & eye turret
  ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...P(0.005, -0.195)); ctx.quadraticCurveTo(...P(0.07, -0.17), ...P(0.12, -0.19)); ctx.stroke();
  const [ex, ey] = P(0.1, -0.245);
  const eg = ctx.createRadialGradient(ex - s * 0.01, ey - s * 0.01, 1, ex, ey, s * 0.04); eg.addColorStop(0, rgb(pal[1], 1.3)); eg.addColorStop(1, rgb(pal[0], 0.6));
  ctx.fillStyle = eg; ctx.beginPath(); ctx.arc(ex, ey, s * 0.038, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.arc(ex, ey, s * 0.038 * k / 4, 0, 7); ctx.stroke(); }
  ctx.fillStyle = '#050505'; ctx.beginPath(); ctx.arc(ex + s * 0.01, ey, s * 0.009, 0, 7); ctx.fill(); gloss(ctx, ex - s * 0.01, ey - s * 0.012, s * 0.012, s * 0.008, 0.8);
  ctx.restore();
  studioLight(ctx, W, H, { strength: 0.45 });
}

// ------------------------------------------------------------------ EGGS (clutch in vermiculite, top-down)
export function paintClutch(ctx, W, H, { count = 6, size = 0.16, seed = 1, tint = '#f2ecdd', gecko = false } = {}) {
  const r = rng(seed); substrate(ctx, W, H, 'vermiculite', seed + 500);
  const S = Math.min(W, H), eggs = [];
  const ew = S * size, eh = ew * (gecko ? 1.55 : 1.35);
  for (let i = 0; i < count; i++) {
    for (let tries = 0; tries < 200; tries++) {
      const x = W / 2 + (r() - 0.5) * W * 0.62, y = H / 2 + (r() - 0.5) * H * 0.55, a = r() * Math.PI;
      if (eggs.every((e) => Math.hypot(e.x - x, e.y - y) > ew * 1.35)) { eggs.push({ x, y, a }); break; }
    }
  }
  for (const e of eggs) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.a);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = ew * 0.25; ctx.shadowOffsetX = ew * 0.1; ctx.shadowOffsetY = ew * 0.14; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, ew / 2, eh / 2, 0, 0, 7); ctx.fill(); ctx.restore();
    const g = ctx.createRadialGradient(-ew * 0.15, -eh * 0.18, ew * 0.05, 0, 0, eh * 0.62);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, tint); g.addColorStop(1, rgb(tint, 0.62));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, ew / 2, eh / 2, 0, 0, 7); ctx.fill();
    // leathery texture & candling veins
    ctx.globalAlpha = 0.12; for (let k = 0; k < 18; k++) { ctx.strokeStyle = '#8a7a60'; ctx.lineWidth = 0.8; ctx.beginPath(); const t = r() * 6.28; ctx.moveTo(Math.cos(t) * ew * 0.2, Math.sin(t) * eh * 0.2); ctx.quadraticCurveTo(Math.cos(t + 0.5) * ew * 0.35, Math.sin(t + 0.5) * eh * 0.35, Math.cos(t + 0.3) * ew * 0.45, Math.sin(t + 0.3) * eh * 0.45); ctx.stroke(); }
    ctx.globalAlpha = 1; gloss(ctx, -ew * 0.14, -eh * 0.2, ew * 0.14, ew * 0.08, 0.6, -0.8);
    ctx.restore();
  }
  // vermiculite flakes partially covering the eggs
  for (let i = 0; i < 260; i++) { const x = r() * W, y = r() * H; ctx.fillStyle = rgb(mix('#7a6b58', '#d2c19c', r()), 1, 0.7); ctx.beginPath(); ctx.ellipse(x, y, 1.5 + r() * 3, 1 + r() * 2, r() * 3, 0, 7); ctx.fill(); }
  studioLight(ctx, W, H, { strength: 0.5 });
}

// ------------------------------------------------------------------ FEEDERS (top-down)
export function paintDubia(ctx, W, H, { seed = 1, count = 5, bg = 'paper' } = {}) {
  const r = rng(seed); substrate(ctx, W, H, bg, seed + 600);
  const S = Math.min(W, H);
  for (let k = 0; k < count; k++) {
    const x = W * (0.2 + r() * 0.6), y = H * (0.2 + r() * 0.6), a = r() * 6.28, s = S * (0.12 + r() * 0.08);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = s * 0.2; ctx.shadowOffsetX = s * 0.06; ctx.shadowOffsetY = s * 0.1;
    ctx.fillStyle = '#2a170c'; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.42, s * 0.62, 0, 0, 7); ctx.fill(); ctx.restore();
    // legs
    ctx.strokeStyle = '#3a2414'; ctx.lineWidth = s * 0.03; for (const sx of [1, -1]) for (const ly of [-0.2, 0.05, 0.3]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.36, ly * s); ctx.lineTo(sx * s * 0.55, (ly + 0.08) * s); ctx.lineTo(sx * s * 0.62, (ly + 0.22) * s); ctx.stroke(); }
    const g = ctx.createRadialGradient(-s * 0.12, -s * 0.2, s * 0.05, 0, 0, s * 0.65); g.addColorStop(0, '#9a5a2c'); g.addColorStop(0.6, '#5a2e14'); g.addColorStop(1, '#241208');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s * 0.4, s * 0.6, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(20,8,2,.55)'; ctx.lineWidth = s * 0.012; for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.ellipse(0, i * s * 0.1 + s * 0.05, s * 0.38, s * 0.07, 0, 0.15, Math.PI - 0.15); ctx.stroke(); }
    ctx.fillStyle = '#c9a070'; ctx.beginPath(); ctx.ellipse(0, -s * 0.45, s * 0.18, s * 0.08, 0, 0, 7); ctx.globalAlpha = 0.5; ctx.fill(); ctx.globalAlpha = 1;
    gloss(ctx, -s * 0.12, -s * 0.15, s * 0.16, s * 0.09, 0.35, -0.9);
    ctx.restore();
  }
  studioLight(ctx, W, H, { strength: 0.45, vignette: 0.6 });
}
export function paintCricket(ctx, W, H, { seed = 1, count = 4, bg = 'paper' } = {}) {
  const r = rng(seed); substrate(ctx, W, H, bg, seed + 700);
  const S = Math.min(W, H);
  for (let k = 0; k < count; k++) {
    const x = W * (0.22 + r() * 0.56), y = H * (0.22 + r() * 0.56), a = r() * 6.28, s = S * (0.2 + r() * 0.06);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = '#2a1c10'; ctx.lineCap = 'round';
    ctx.lineWidth = s * 0.012; for (const sx of [1, -1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.03, -s * 0.28); ctx.quadraticCurveTo(sx * s * 0.25, -s * 0.6, sx * s * 0.2, -s * 0.85); ctx.stroke(); }
    ctx.lineWidth = s * 0.03; for (const sx of [1, -1]) { ctx.beginPath(); ctx.moveTo(sx * s * 0.07, s * 0.05); ctx.lineTo(sx * s * 0.2, s * 0.02); ctx.lineTo(sx * s * 0.15, s * 0.4); ctx.stroke(); ctx.beginPath(); ctx.moveTo(sx * s * 0.07, -s * 0.12); ctx.lineTo(sx * s * 0.18, -s * 0.16); ctx.stroke(); }
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = s * 0.12; ctx.shadowOffsetX = s * 0.04; ctx.shadowOffsetY = s * 0.06;
    const g = ctx.createLinearGradient(-s * 0.1, 0, s * 0.1, 0); g.addColorStop(0, '#3a2a18'); g.addColorStop(0.5, '#8a6a3a'); g.addColorStop(1, '#3a2a18');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.09, s * 0.3, 0, 0, 7); ctx.fill(); ctx.restore();
    ctx.fillStyle = '#4a3420'; ctx.beginPath(); ctx.ellipse(0, -s * 0.22, s * 0.08, s * 0.08, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-s * 0.08, s * (0.0 + i * 0.05)); ctx.lineTo(s * 0.08, s * (0.0 + i * 0.05)); ctx.stroke(); }
    gloss(ctx, -s * 0.03, -s * 0.05, s * 0.05, s * 0.12, 0.3, 0);
    ctx.restore();
  }
  studioLight(ctx, W, H, { strength: 0.45, vignette: 0.6 });
}
export function paintJar(ctx, W, H, { label = 'DENDROCARE', color = '#e8913a', cap = '#1a1a1a', seed = 1, sub = 'vitamin · mineral' } = {}) {
  substrate(ctx, W, H, 'slate', seed + 800);
  const S = Math.min(W, H), jw = S * 0.44, jh = S * 0.56, x = W / 2 - jw / 2, y = H * 0.24;
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 30; ctx.shadowOffsetX = 12; ctx.shadowOffsetY = 18; ctx.fillStyle = '#000'; ctx.fillRect(x, y, jw, jh); ctx.restore();
  let g = ctx.createLinearGradient(x, 0, x + jw, 0); g.addColorStop(0, '#d9d6cf'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(1, '#8e8a82');
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x, y, jw, jh, jw * 0.06); ctx.fill();
  g = ctx.createLinearGradient(x, 0, x + jw, 0); g.addColorStop(0, rgb(cap, 0.7)); g.addColorStop(0.35, rgb(cap, 1.6)); g.addColorStop(1, rgb(cap, 0.5));
  ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(x - jw * 0.02, y - jh * 0.16, jw * 1.04, jh * 0.18, jw * 0.04); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 14; i++) ctx.fillRect(x + i * jw / 14, y - jh * 0.15, 1.5, jh * 0.16);
  // label
  ctx.fillStyle = color; ctx.fillRect(x, y + jh * 0.22, jw, jh * 0.5);
  ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(x, y + jh * 0.62, jw, jh * 0.1);
  ctx.fillStyle = '#fff'; ctx.font = `700 ${jw * 0.1}px Inter, sans-serif`; ctx.textAlign = 'center'; ctx.fillText(label, W / 2, y + jh * 0.44);
  ctx.font = `500 ${jw * 0.055}px Inter, sans-serif`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(sub, W / 2, y + jh * 0.53);
  g = ctx.createLinearGradient(x, 0, x + jw, 0); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(0.3, 'rgba(255,255,255,.18)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)');
  ctx.fillStyle = g; ctx.fillRect(x, y, jw, jh);
  studioLight(ctx, W, H, { strength: 0.35, vignette: 0.7 });
}

// ------------------------------------------------------------------ macro crop (skin detail) — draws any painter large and crops
export function macro(ctx, W, H, painter, opts) {
  // gentle zoom (1.6×) so the animal stays recognisable; crop around the upper-centre where heads & patterns are
  const S = Math.round(W * 1.6), big = new OffscreenCanvas(S, S), b = big.getContext('2d');
  painter(b, S, S, opts);
  const snake = painter === paintSnake, sx = (S - W) * (snake ? 0.1 : 0.55), sy = snake ? S * 0.08 : Math.max(0, S * 0.3 - H * 0.25);
  ctx.drawImage(big, sx, sy, W, H, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(12,13,15,0.85)'); g.addColorStop(0.5, 'rgba(12,13,15,0.2)'); g.addColorStop(1, 'rgba(12,13,15,0.0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
// Wide collage banner: several specimen plates blended on one substrate (dashboard brief, login, empty states)
export function banner(ctx, W, H, { seed = 1 } = {}) {
  substrate(ctx, W, H, 'leaf', seed + 900);
  const place = (fn, opts, cx, cy, size, rot = 0) => {
    const c = new OffscreenCanvas(size, size), x = c.getContext('2d'); fn(x, size, size, opts);
    const m = new OffscreenCanvas(size, size), mx = m.getContext('2d'); const g = mx.createRadialGradient(size / 2, size / 2, size * 0.22, size / 2, size / 2, size * 0.5); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); mx.fillStyle = g; mx.fillRect(0, 0, size, size);
    x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.drawImage(c, -size / 2, -size / 2); ctx.restore();
  };
  place(paintSnake, { species: 'regius', seed: 61, bg: 'leaf' }, W * 0.96, H * 0.62, H * 1.35);
  place(paintClutch, { count: 5, seed: 3, size: 0.16 }, W * 0.72, H * 0.78, H * 0.95, 0.2);
  place(paintGecko, { morph: 'harlequin', seed: 31, bg: 'leaf' }, W * 0.64, H * 0.28, H * 1.0, -0.3);
  place(paintFrog, { species: 'azureus', seed: 11, bg: 'moss', scale: 0.45 }, W * 0.84, H * 0.2, H * 0.95, 0.4);
  place(paintFrog, { species: 'leucomelas', seed: 21, bg: 'moss', scale: 0.4 }, W * 0.5, H * 0.72, H * 0.8, -0.6);
  studioLight(ctx, W, H, { x: 0.75, y: 0.3, strength: 0.4, vignette: 0.6 });
}
