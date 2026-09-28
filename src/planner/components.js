import * as THREE from 'three';
import { TILE_CLAMP, TILE_REPEAT_U } from './PaintedMaterials.js';
import { PaintBuilder } from './PaintBuilder.js';
import { rng, fbm, rbox, cyl, lathe, heightfield, skirt, taperTube, rock, leafCard, quad, flat, relief, dome, ellipsoid, profileBar } from './geometry.js';

/**
 * PLANNER parametric components ("builder-ready" asset kit).
 *
 * Every component is a function of real dimensions in metres, so an enclosure can be resized without
 * stretching: frame profiles keep their section, handles / hinges / labels keep their size, glass, vents,
 * substrate and backgrounds are regenerated for the new extents. The logical object (RoomDocument) only
 * provides w / d / h and props; nothing here is ever written back to data.
 *
 * Local frame of every component: origin at the footprint centre on the underside, front = +Z, up = +Y.
 */

// ----------------------------------------------------------------------------------------- palette
// Tints multiply the painted atlas. The room is kept in graphite / warm greys; amber is reserved for
// status & identity accents; enclosure interiors carry the saturated, natural colour.
export const TINT = {
  frame: [0.55, 0.56, 0.6], graphite: [1.5, 1.52, 1.62], steel: [0.95, 0.96, 1.0], white: [0.8, 0.78, 0.75],
  laminate: [2.3, 2.3, 2.4], black: [0.9, 0.9, 0.95], glassEdge: [0.5, 0.72, 0.68],
  warmRock: [1.0, 0.9, 0.78], sand: [1.02, 0.94, 0.8], leaf: [0.85, 1.0, 0.8], moss: [0.95, 1.05, 0.85],
};
const WARM = 0xffd6a0, COOL = 0xdcebff, AMBER = [1.0, 0.58, 0.18];
const sat = (x) => Math.min(1, Math.max(0, x));

export const box = (b, w, h, d, tile, pos, o = {}) => b.add(rbox(w, h, d, o.r ?? Math.min(w, h, d) * 0.2), tile, { pos, ...o });

/** Floor contact shadow (painted blob) under a footprint. */
export function contactShadow(b, w, d, { y = 0.003, spread = 0.16, strength = 0.85 } = {}) {
  b.add(flat(w + spread * 2, d + spread * 2), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [0, y, 0], alpha: strength });
}
/** Painted shadow on the wall behind a mounted item. */
export function wallShadow(b, w, h, d, { spread = 0.08, drop = 0.03, strength = 0.6 } = {}) {
  b.add(quad(w + spread * 2, h + spread * 2), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [0.01, h / 2 - drop, -d / 2 + 0.002], alpha: strength });
}

// ----------------------------------------------------------------------------------------- frames
/** Straight frame profile between two points (square/rounded section). */
export function frameProfile(b, a, c, { w = 0.018, h = 0.018, tile = 'metal_dark', color = TINT.frame, r = 0.003, ...o } = {}) {
  const A = new THREE.Vector3(...a), C = new THREE.Vector3(...c);
  const len = A.distanceTo(C);
  const g = profileBar(w, h, len, r);
  const dir = C.clone().sub(A).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  const e = new THREE.Euler().setFromQuaternion(q);
  b.add(g, tile, { pos: A.add(C).multiplyScalar(0.5).toArray(), rot: [e.x, e.y, e.z], order: 'XYZ', color, uvScale: 6, ...o });
}

/** Thin bright edge (painted highlight on a frame edge). */
export function highlight(b, len, pos, { axis = 'x', t = 0.0025, color = [1.05, 1.02, 0.96], tile = 'alu' } = {}) {
  const g = axis === 'x' ? rbox(len, t, t) : axis === 'y' ? rbox(t, len, t) : rbox(t, t, len);
  b.add(g, tile, { pos, color, uvScale: 4 });
}

/** Glass pane (w × h) facing +Z; cheap stylised glass + tinted edges. */
export function glassPanel(b, w, h, pos, { rotY = 0, edge = true, alpha = 1, tint = [1.0, 1.0, 1.0] } = {}) {
  b.push(pos, rotY);
  b.add(quad(w, h), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', color: tint, alpha });
  if (edge) {
    for (const s of [-1, 1]) b.add(rbox(0.004, h, 0.005), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [s * (w / 2 - 0.002), 0, 0], color: TINT.glassEdge, alpha: 0.45 });
    b.add(rbox(w, 0.004, 0.005), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [0, h / 2 - 0.002, 0], color: TINT.glassEdge, alpha: 0.45 });
  }
  b.pop();
}

/** Door panel for cabinets: inset panel with shadow gap + fixed-size bar handle. */
export function doorPanel(b, w, h, pos, { tile = 'metal_dark', color = TINT.laminate, handle = 'right', handleLen = 0.14, t = 0.018 } = {}) {
  const [x, y, z] = pos;
  box(b, w - 0.004, h - 0.004, t, tile, [x, y, z + t / 2], { color, r: 0.004, uvScale: 1.2, grad: [0.62, 1.08] });
  b.add(flat(w, 0.004).rotateX(Math.PI / 2), 'shadow', { bucket: 'opaque', color: [0.05, 0.05, 0.05], pos: [x, y - h / 2, z + 0.001] });
  if (handle) {
    const hx = handle === 'right' ? x + w / 2 - 0.035 : handle === 'left' ? x - w / 2 + 0.035 : x;
    const vertical = handle !== 'top';
    const hy = handle === 'top' ? y + h / 2 - 0.04 : y + Math.min(h * 0.3, 0.25);
    const hl = Math.min(handleLen, (vertical ? h : w) * 0.6);
    box(b, vertical ? 0.012 : hl, vertical ? hl : 0.012, 0.012, 'stainless', [hx, hy, z + t + 0.014], { r: 0.005, color: [1.05, 1.05, 1.08] });
    for (const s of [-1, 1]) box(b, 0.008, 0.008, 0.016, 'stainless', vertical ? [hx, hy + s * (hl / 2 - 0.01), z + t + 0.006] : [hx + s * (hl / 2 - 0.01), hy, z + t + 0.006], { r: 0.002 });
  }
}

/** Ventilation strip (w × h) facing +Z. */
export function ventStrip(b, w, h, pos, { color = [0.8, 0.8, 0.84], slotsPerM = 7 } = {}) {
  b.add(rbox(w, h, 0.004, 0.0015), 'vent', { pos, color, uv: 'xy', uvScale: [slotsPerM, 1 / h], uvOffset: [0, 0.5], mode: TILE_REPEAT_U });
}

/** LED light strip with painted glow; registers a painted lamp when lit. */
export function lightStrip(b, w, pos, { temp = 'warm', lit = true, depth = 0.035, lampRadius = 0.7, lampIntensity = 1, lampDrop = 0.05 } = {}) {
  const [x, y, z] = pos;
  box(b, w, 0.014, depth, 'alu', [x, y + 0.007, z], { r: 0.005, color: [0.8, 0.8, 0.84] });
  b.add(flat(w - 0.012, depth * 0.62).rotateX(Math.PI), temp === 'warm' ? 'led_warm' : 'led_cool', { mode: TILE_CLAMP, uv: 'keep', pos: [x, y - 0.0005, z], glow: lit ? 1 : 0, color: lit ? [1, 1, 1] : [0.35, 0.35, 0.36] });
  if (lit) {
    b.add(flat(w * 1.1, depth * 3).rotateX(Math.PI), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [x, y - 0.004, z], color: temp === 'warm' ? [0.9, 0.62, 0.32] : [0.55, 0.68, 0.9], alpha: 0.5 });
    b.lamp([x, y - lampDrop, z], { radius: lampRadius, color: temp === 'warm' ? WARM : COOL, intensity: lampIntensity });
  }
}

/** Label card (generic painted label) + optional status dot. */
export function labelCard(b, pos, { w = 0.075, h = 0.028, status = null, dim = false } = {}) {
  const [x, y, z] = pos;
  box(b, w + 0.006, h + 0.006, 0.003, 'plastic_black', [x, y, z], { r: 0.001, color: TINT.black });
  b.add(quad(w, h), 'label', { mode: TILE_CLAMP, uv: 'keep', pos: [x, y, z + 0.0017], color: dim ? [0.6, 0.6, 0.6] : [1, 1, 1], glow: dim ? 0 : 0.12 });
  if (status) b.add(new THREE.CircleGeometry(0.0045, 10), 'amber', { pos: [x + w / 2 + 0.012, y, z + 0.002], glow: 1, color: status === 'warn' ? [1.0, 0.3, 0.15] : AMBER });
}

/** Rack rail / upright post (rounded square tube) with levelling foot. */
export function rackRail(b, h, pos, { s = 0.035, color = TINT.graphite } = {}) {
  const [x, y, z] = pos;
  const g = profileBar(s, s, h - 0.02, 0.005).rotateX(-Math.PI / 2);
  b.add(g, 'metal_dark', { pos: [x, y + 0.02 + (h - 0.02) / 2, z], color, uvScale: 4, grad: [0.85, 1.05] });
  b.add(cyl(0.018, 0.02, 0.014, 10), 'rubber', { pos: [x, y + 0.007, z], color: TINT.black });
  b.add(cyl(0.02, 0.02, 0.006, 10), 'plastic_black', { pos: [x, y + h - 0.003, z], color: TINT.black });
}

/** Cabinet module: carcass + plinth + top + doors. Returns top height. */
export function cabinetModule(b, W, H, D, { doors = 2, tile = 'metal_dark', color = TINT.laminate, top = 'metal_dark', topColor = null, plinth = 0.06, handles = true } = {}) {
  const t = 0.018;
  // carcass
  box(b, W, H - plinth - t, D - 0.02, tile, [0, plinth + (H - plinth - t) / 2, -0.01], { color, r: 0.004, uvScale: 2, grad: [0.6, 1.05] });
  box(b, W - 0.04, plinth, D - 0.08, 'plastic_black', [0, plinth / 2, -0.03], { color: TINT.black, r: 0.004 });
  box(b, W + 0.006, t, D + 0.004, top, [0, H - t / 2, 0], { color: topColor || color.map((c) => c * 1.1), r: 0.004, uvScale: 2 });
  highlight(b, W + 0.004, [0, H - 0.001, D / 2 + 0.001], { color: [0.9, 0.88, 0.84] });
  const dw = (W - 0.01) / doors, dh = H - plinth - t - 0.01;
  for (let i = 0; i < doors; i++) {
    const x = -W / 2 + 0.005 + dw * (i + 0.5);
    const side = doors === 1 ? 'right' : i % 2 === 0 ? 'right' : 'left';
    doorPanel(b, dw, dh, [x, plinth + dh / 2 + 0.004, D / 2 - 0.02], { tile, color: color.map((c) => c * 1.06), handle: handles ? side : null });
  }
  return H;
}

// ----------------------------------------------------------------------------------------- terrarium shell
/**
 * Framed glass enclosure. style: sliding | hinged | rimless.
 * Returns interior bounds {x0,x1,z0,z1,floor,top} for the diorama.
 */
export function terrariumShell(b, { W, H, D, style = 'sliding', light = 'warm', lit = true, vent = 0.05, basking = false, occupied = true, label = true, lampIntensity = 1 }) {
  const f = style === 'rimless' ? 0.006 : 0.018;
  const hb = style === 'rimless' ? 0.014 : style === 'sliding' ? 0.05 : 0.04;
  const ht = style === 'rimless' ? 0 : 0.026;
  const I = { x0: -W / 2 + f + 0.002, x1: W / 2 - f - 0.002, z0: -D / 2 + f + 0.004, z1: D / 2 - f - 0.012, floor: 0.012, top: H - ht - 0.004 };
  const fr = { color: TINT.frame };
  // glass base plate & bottom frame
  box(b, W - 0.004, 0.012, D - 0.004, 'plastic_black', [0, 0.006, 0], { color: [0.2, 0.2, 0.22], r: 0.002 });
  if (style === 'rimless') {
    // black silicone trim + thick low-iron glass edges
    for (const s of [-1, 1]) box(b, W, 0.014, 0.008, 'plastic_black', [0, 0.007, s * (D / 2 - 0.004)], { color: [0.22, 0.22, 0.24], r: 0.002 });
    glassPanel(b, W, H - 0.014, [0, 0.014 + (H - 0.014) / 2, D / 2 - 0.004], { tint: [0.92, 1.0, 0.98] });
    for (const s of [-1, 1]) glassPanel(b, D - 0.012, H - 0.014, [s * (W / 2 - 0.004), 0.014 + (H - 0.014) / 2, 0], { rotY: s * Math.PI / 2 });
    for (const s of [-1, 1]) b.add(rbox(0.006, H - 0.014, 0.006), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [s * (W / 2 - 0.003), 0.014 + (H - 0.014) / 2, D / 2 - 0.003], color: TINT.glassEdge, alpha: 0.95 });
    b.add(rbox(W, 0.006, 0.006), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [0, H - 0.003, D / 2 - 0.003], color: TINT.glassEdge, alpha: 0.95 });
    // glass cover (partial, back 2/3) + light bar resting on it
    b.add(flat(W - 0.02, D * 0.62), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [0, H - 0.008, -D * 0.17], alpha: 0.5 });
  } else {
    box(b, W, hb, f, 'metal_dark', [0, hb / 2, D / 2 - f / 2], { ...fr, r: 0.003, grad: [0.7, 1.05] });
    highlight(b, W - 0.01, [0, hb - 0.001, D / 2 + 0.0005]);
    box(b, W, 0.022, f, 'metal_dark', [0, 0.011, -D / 2 + f / 2], fr);
    for (const s of [-1, 1]) box(b, f, 0.022, D, 'metal_dark', [s * (W / 2 - f / 2), 0.011, 0], fr);
    // top frame
    box(b, W, ht, f, 'metal_dark', [0, H - ht / 2, D / 2 - f / 2], { ...fr, grad: [0.85, 1.1] });
    highlight(b, W - 0.01, [0, H - 0.001, D / 2 + 0.0005], { color: [0.95, 0.95, 0.95] });
    box(b, W, ht, f, 'metal_dark', [0, H - ht / 2, -D / 2 + f / 2], fr);
    for (const s of [-1, 1]) box(b, f, ht, D, 'metal_dark', [s * (W / 2 - f / 2), H - ht / 2, 0], fr);
    // corner uprights
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, f, H - hb - ht + 0.002, f, 'metal_dark', [sx * (W / 2 - f / 2), hb + (H - hb - ht) / 2, sz * (D / 2 - f / 2)], { ...fr, r: 0.003 });
    for (const sx of [-1, 1]) highlight(b, H - hb - ht, [sx * (W / 2 - 0.001), hb + (H - hb - ht) / 2, D / 2 + 0.0005], { axis: 'y', color: [0.7, 0.72, 0.75] });
    // side glass
    const gh = H - hb - ht;
    for (const s of [-1, 1]) glassPanel(b, D - 2 * f, gh, [s * (W / 2 - f / 2), hb + gh / 2, 0], { rotY: s * Math.PI / 2, edge: false });
    // top mesh screen (see-through)
    b.add(flat(W - 2 * f, D - 2 * f), 'mesh', { bucket: 'decal', pos: [0, H - 0.004, 0], uvScale: 7, color: [0.55, 0.55, 0.58], alpha: 0.5 });
    const frontH = gh - (style === 'hinged' ? vent : 0);
    const fy = hb + (style === 'hinged' ? 0 : 0) + frontH / 2;
    if (style === 'sliding') {
      const pw = W / 2 + 0.02 - f;
      glassPanel(b, pw, frontH, [-(W / 4) + 0.01, fy, D / 2 - 0.006]);
      glassPanel(b, pw, frontH, [(W / 4) - 0.01, fy, D / 2 - 0.014]);
      // finger pulls at the meeting edges
      box(b, 0.01, 0.055, 0.008, 'plastic_black', [-0.005 + 0.012 + 0.0, hb + frontH * 0.45, D / 2 - 0.0], { color: TINT.black, r: 0.003 });
      box(b, 0.01, 0.055, 0.008, 'plastic_black', [0.005 - 0.012, hb + frontH * 0.45, D / 2 - 0.018], { color: TINT.black, r: 0.003 });
      // lock
      b.add(cyl(0.006, 0.006, 0.006, 10).rotateX(Math.PI / 2), 'stainless', { pos: [0.03, hb + 0.012, D / 2 + 0.003] });
    } else {
      const pw = W / 2 - f;
      glassPanel(b, pw, frontH, [-(W / 4) + f / 4, fy, D / 2 - 0.008]);
      glassPanel(b, pw, frontH, [(W / 4) - f / 4, fy, D / 2 - 0.008]);
      box(b, 0.014, frontH, 0.014, 'metal_dark', [0, fy, D / 2 - 0.008], { ...fr, r: 0.003 }); // centre stile
      for (const s of [-1, 1]) {
        b.add(cyl(0.008, 0.008, 0.012, 12).rotateX(Math.PI / 2), 'stainless', { pos: [s * 0.022, fy, D / 2 + 0.002], color: [1.05, 1.05, 1.08] });
        for (const hy of [0.25, 0.75]) box(b, 0.008, 0.03, 0.006, 'plastic_black', [s * (W / 2 - f - 0.004), hb + frontH * hy, D / 2 - 0.002], { color: TINT.black, r: 0.002 });
      }
      ventStrip(b, W - 2 * f, vent - 0.004, [0, hb + frontH + vent / 2, D / 2 - 0.006], { slotsPerM: 9 });
    }
  }
  // lighting fixture inside the top
  const temp = light;
  const ly = I.top - 0.018;
  lightStrip(b, Math.max(0.2, W - 0.12), [0, ly, -D * 0.08], { temp, lit, lampRadius: Math.max(0.55, Math.hypot(W * 0.7, H)), lampIntensity: lampIntensity, lampDrop: Math.min(0.12, H * 0.2) });
  if (basking) {
    const bx = -W * 0.28;
    b.add(lathe([[0.004, 0.1], [0.03, 0.095], [0.06, 0.066], [0.074, 0.02], [0.076, 0], [0.072, 0], [0.056, 0.06], [0.026, 0.09]], 18), 'metal_dark', { pos: [bx, H - 0.004, -D * 0.05], color: [0.55, 0.56, 0.6] });
    b.add(ellipsoid(0.026, 0.02, 0.026, 10), 'led_warm', { pos: [bx, H - 0.02, -D * 0.05], glow: lit ? 1 : 0, color: lit ? [1.2, 0.9, 0.6] : [0.4, 0.38, 0.36] });
    if (lit) b.lamp([bx, H - 0.06, -D * 0.05], { radius: 0.34, color: 0xffa860, intensity: 1.2 });
  }
  if (label && style !== 'rimless') labelCard(b, [W / 2 - 0.07, hb / 2, D / 2 + 0.002], { status: occupied ? 'ok' : null, dim: !occupied });
  return I;
}

/** Baked interior occlusion: darker towards the back corners and the floor edges. */
export function interiorAO(I) {
  const depth = I.z1 - I.z0, hgt = I.top - I.floor;
  return (p) => {
    const back = sat((p.z - I.z0) / (depth * 0.8));
    const side = sat(Math.min(p.x - I.x0, I.x1 - p.x) / 0.07);
    const low = sat((p.y - I.floor) / (hgt * 0.25));
    return (0.6 + 0.4 * back) * (0.8 + 0.2 * side) * (0.85 + 0.15 * low);
  };
}

// ----------------------------------------------------------------------------------------- nature
export function backgroundPanel(b, I, { tile = 'rock_warm', depth = 0.05, seed = 1, ledges = true, color = [1, 1, 1], uvScale = 3 } = {}) {
  const w = I.x1 - I.x0, h = I.top - I.floor - 0.01;
  const r = rng(seed);
  const L = ledges ? Array.from({ length: Math.max(2, Math.round(w * 3)) }, (_, i) => ({ x: (r() - 0.5) * w * 0.8, y: -h / 2 + h * (0.3 + r() * 0.5), w: 0.08 + r() * 0.1, h: 0.04 + r() * 0.03, d: depth * 0.9 })) : [];
  b.add(relief(w, h, depth, { resX: Math.max(8, Math.round(w * 18)), resY: Math.max(6, Math.round(h * 18)), seed, ledges: L }), tile, { pos: [(I.x0 + I.x1) / 2, I.floor + h / 2, I.z0], uvScale, color, lit: true, ao: interiorAO(I) });
}

export function sideRock(b, I, { tile = 'rock_warm', seed = 2, color = [1, 1, 1] } = {}) {
  const h = I.top - I.floor - 0.02, dd = (I.z1 - I.z0) * 0.5;
  for (const s of [-1, 1]) {
    b.add(relief(dd, h, 0.035, { resX: 6, resY: 8, seed: seed + s }), tile, { pos: [s * (I.x1 - 0.001), I.floor + h / 2, I.z0 + dd / 2], rot: [0, -s * Math.PI / 2, 0], uvScale: 1.7, color, lit: true, ao: interiorAO(I) });
  }
}

/** Substrate volume: painted top surface + visible cross-section behind the front glass. */
export function substrateVolume(b, I, surf, { top = 'sand', section = 'section_arid', uvScale = 4, color = [1, 1, 1], res = 1 } = {}) {
  const w = I.x1 - I.x0, d = I.z1 - I.z0;
  b.add(heightfield(I.x0, I.x1, I.z0, I.z1 + 0.006, Math.max(6, Math.round(w * 26 * res)), Math.max(4, Math.round(d * 20 * res)), surf), top, { uvScale, color, lit: true, ao: interiorAO(I), jitter: 0.12 });
  b.add(skirt(I.x0, I.x1, I.z1 + 0.006, I.floor, (x) => surf(x, I.z1 + 0.006), Math.max(8, Math.round(w * 24))), section, { mode: TILE_REPEAT_U, uv: 'keep', color: [0.95, 0.95, 0.95] });
}

export function stone(b, pos, r, { seed = 1, sx = 1, sy = 0.55, sz = 0.85, tile = 'rock_facet', color = TINT.warmRock, rotY = 0, lit = true, ao } = {}) {
  b.add(rock(r, { sx, sy, sz, seed }), tile, { pos, rot: [0, rotY, 0], uvScale: 5, color, lit, ao, jitter: 0.1 });
}

export function branch(b, points, { r0 = 0.02, r1 = 0.008, seed = 1, twigs = 2, tile = 'bark', color = [1, 1, 1], lit = true } = {}) {
  const g = taperTube(points, r0, r1, { radial: 7, segs: Math.max(8, points.length * 5), vScale: 5, jag: 0.25, seed });
  b.add(g, tile, { uv: 'keep', color, lit });
  const curve = g.userData.curve, r = rng(seed);
  for (let i = 0; i < twigs; i++) {
    const t = 0.35 + r() * 0.5, p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    const side = new THREE.Vector3(-tan.z, 0.4 + r() * 0.4, tan.x).normalize().multiplyScalar((r() > 0.5 ? 1 : -1) * (0.06 + r() * 0.06));
    b.add(taperTube([p, p.clone().add(side.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, 0.02, 0)), p.clone().add(side)], r0 * 0.45, r1 * 0.3, { radial: 5, segs: 5, vScale: 5 }), tile, { uv: 'keep', color, lit });
  }
  return curve;
}

export function corkTube(b, pos, { len = 0.25, r = 0.06, rotY = 0, lit = true } = {}) {
  const g = cyl(r, r * 0.92, len, 11, true).rotateZ(Math.PI / 2);
  const p = g.attributes.position; const rr = rng(7);
  for (let i = 0; i < p.count; i++) { const k = 1 + (rr() - 0.5) * 0.16; p.setY(i, p.getY(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals();
  b.add(g, 'cork', { bucket: 'cutout', pos: [pos[0], pos[1] + r * 0.8, pos[2]], rot: [0, rotY, 0], uvScale: 6, lit, color: [0.95, 0.9, 0.85] });
  // dark inner shadow disc (reads as a hollow hide)
  b.add(new THREE.CircleGeometry(r * 0.85, 12).rotateY(Math.PI / 2), 'shadow', { pos: [pos[0] + Math.cos(rotY) * len * 0.3, pos[1] + r * 0.8, pos[2] - Math.sin(rotY) * len * 0.3], rot: [0, rotY, 0], color: [0.06, 0.05, 0.04] });
}

export function waterBowl(b, pos, { r = 0.06, color = [0.3, 0.28, 0.27], tile = 'plastic_black' } = {}) {
  b.add(lathe([[0, 0], [r * 0.85, 0], [r, r * 0.35], [r * 1.02, r * 0.42], [r * 0.9, r * 0.42], [r * 0.82, r * 0.12], [0, r * 0.12]], 16), tile, { pos, color, lit: true });
  b.add(new THREE.CircleGeometry(r * 0.88, 16).rotateX(-Math.PI / 2), 'water', { bucket: 'glass', pos: [pos[0], pos[1] + r * 0.34, pos[2]], uvScale: 8, alpha: 0.85, color: [0.7, 0.85, 0.85] });
}

/** Rosette of strap leaves (bromeliad). */
export function bromeliad(b, pos, { size = 0.14, seed = 1, leaves = 10, tile = 'leaf_strap', color = TINT.leaf, heart = 'leaf_red' } = {}) {
  const r = rng(seed);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + r() * 0.3, tilt = 0.55 + r() * 0.35;
    const len = size * (0.75 + r() * 0.4);
    b.add(leafCard(len, len * 0.28, { bend: 0.5, fold: 0.35, segs: 3 }), tile, { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos, rot: [tilt, a, 0], color, lit: true });
  }
  if (heart) for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4, len = size * 0.45;
    b.add(leafCard(len, len * 0.34, { bend: 0.3, segs: 2 }), heart, { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos, rot: [0.25, a, 0], color: [1.1, 0.95, 0.95], lit: true, glow: 0.05 });
  }
}

export function fernClump(b, pos, { size = 0.2, seed = 2, fronds = 8, color = [0.9, 1.05, 0.85] } = {}) {
  const r = rng(seed);
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + r() * 0.5, len = size * (0.7 + r() * 0.5);
    b.add(leafCard(len, len * 0.42, { bend: 0.9, fold: 0.1, segs: 4, droop: 0.4 }), 'fern', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos, rot: [0.35 + r() * 0.3, a, 0], color, lit: true });
  }
}

export function strapPlant(b, pos, { size = 0.3, seed = 3, leaves = 6, color = [0.8, 0.95, 0.72], spread = 0.18 } = {}) {
  const r = rng(seed);
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2 + r(), len = size * (0.6 + r() * 0.45);
    b.add(leafCard(len, Math.max(0.03, len * 0.16), { bend: 0.08 + r() * 0.1, fold: 0.35, segs: 3 }), 'leaf_strap', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [pos[0] + Math.cos(a) * 0.01, pos[1], pos[2] + Math.sin(a) * 0.01], rot: [spread * (0.5 + r()), a, 0], color, lit: true });
  }
}

export function grassTuft(b, pos, { h = 0.1, seed = 4, color = [1, 0.95, 0.8] } = {}) {
  const r = rng(seed);
  for (let i = 0; i < 3; i++) b.add(leafCard(h, h * 1.1, { bend: 0.05, fold: 0, segs: 1 }), 'grass', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos, rot: [0, (i / 3) * Math.PI + r() * 0.4, 0], color, lit: true });
}

export function succulent(b, pos, { size = 0.05, seed = 5, color = [0.8, 1.0, 0.92] } = {}) {
  // fleshy rosette: three rings of fat leaves, inner ring more upright
  const r = rng(seed);
  const rings = [[8, 1.0, 1.05], [6, 0.72, 0.7], [4, 0.45, 0.35]];
  rings.forEach(([n, k, tilt], ri) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ri * 0.45 + r() * 0.2, len = size * k * 0.55;
      const g = ellipsoid(len * 0.42, len * 0.18, len, 7);
      g.translate(0, 0, len * 0.8);
      b.add(g, 'succulent', { pos: [pos[0], pos[1] + size * 0.1 * ri, pos[2]], rot: [-tilt * 0.6, a, 0], color: ri === 2 ? color.map((c) => c * 1.12) : color, lit: true });
    }
  });
}

export function groundCover(b, pos, { radius = 0.07, count = 14, seed = 6, size = 0.03, color = [0.75, 1.0, 0.7], surf = null } = {}) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * radius;
    const x = pos[0] + Math.cos(a) * d, z = pos[2] + Math.sin(a) * d;
    const y = surf ? surf(x, z) : pos[1];
    b.add(leafCard(size * (0.7 + r() * 0.5), size * 0.8, { bend: 0.2, segs: 1 }), 'leaf_heart', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [x, y, z], rot: [1.0 + r() * 0.4, r() * 6.28, 0], color, lit: true });
  }
}

export function mossMound(b, pos, r, { sy = 0.62, color = TINT.moss, seed = 1 } = {}) {
  // cushion of 3 overlapping domes: reads as volume, not as a flat disc
  const q = rng(Math.round(seed * 13 + 7));
  b.add(dome(r, sy, 12), 'moss', { pos, uvScale: 9, color, lit: true, jitter: 0.25 });
  for (let i = 0; i < 2; i++) {
    const a = q() * 6.28, d = r * (0.55 + q() * 0.3), rr = r * (0.45 + q() * 0.25);
    b.add(dome(rr, sy * 1.1, 10), 'moss', { pos: [pos[0] + Math.cos(a) * d, pos[1] - 0.002, pos[2] + Math.sin(a) * d], uvScale: 9, color: color.map((c) => c * (0.9 + q() * 0.2)), lit: true, jitter: 0.25 });
  }
}

/** Leaf litter: small dry leaves scattered on the substrate (tropical floors). */
export function leafLitter(b, I, surf, { count = 24, seed = 3 } = {}) {
  const r = rng(seed), w = I.x1 - I.x0, d = I.z1 - I.z0;
  for (let i = 0; i < count; i++) {
    const x = I.x0 + 0.02 + r() * (w - 0.04), z = I.z0 + d * (0.3 + r() * 0.68), sz = 0.018 + r() * 0.016;
    b.add(leafCard(sz, sz * 0.7, { bend: 0.1, segs: 1 }), r() > 0.4 ? 'leaf_oval' : 'leaf_heart', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [x, surf(x, z) + 0.002, z], rot: [1.45 + r() * 0.2, r() * 6.28, 0], color: [1.3, 0.85, 0.45], lit: true });
  }
}

export function vine(b, points, { leaf = 0.045, seed = 7, every = 0.05, color = [0.9, 1.05, 0.85] } = {}) {
  const g = taperTube(points, 0.0035, 0.002, { radial: 4, segs: 14, vScale: 8 });
  b.add(g, 'stem', { uv: 'keep', color: [0.6, 0.75, 0.45], lit: true });
  const c = g.userData.curve, len = c.getLength(), r = rng(seed);
  for (let s = every * 0.5; s < len; s += every * (0.8 + r() * 0.4)) {
    const t = s / len, p = c.getPointAt(t), tan = c.getTangentAt(t);
    const yaw = Math.atan2(tan.x, tan.z) + (r() > 0.5 ? 1.2 : -1.2);
    b.add(leafCard(leaf * (0.75 + r() * 0.45), leaf * 0.8, { bend: 0.25, segs: 2, droop: 0.3 }), 'leaf_heart', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: p.toArray(), rot: [1.2 + r() * 0.5, yaw, 0], color, lit: true });
  }
}

// ----------------------------------------------------------------------------------------- animals
export function coiledPython(b, pos, { scale = 1, yaw = 0 } = {}) {
  // ball python at rest: two stacked coils, head resting on top pointing outwards
  const s = scale, pts = [];
  const n = 40, turns = 2.15;
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * turns * Math.PI * 2;
    const rad = (0.078 - t * 0.036) * s;
    pts.push(new THREE.Vector3(Math.cos(a) * rad, (0.019 + Math.min(1, t * 1.6) * 0.03) * s, Math.sin(a) * rad));
  }
  const tail = [new THREE.Vector3(0.11 * s, 0.01 * s, 0.03 * s), new THREE.Vector3(0.095 * s, 0.014 * s, 0.0)];
  const neck = pts[pts.length - 1];
  const headPos = neck.clone().add(new THREE.Vector3(0.03 * s, 0.012 * s, 0.035 * s));
  b.push(pos, yaw);
  b.add(taperTube([...tail, ...pts, headPos.clone().lerp(neck, 0.4)], 0.008 * s, 0.021 * s, { radial: 9, segs: 64, vScale: 10 }), 'skin_python', { uv: 'keep', color: [1.1, 1.0, 0.9], lit: true });
  b.add(ellipsoid(0.02 * s, 0.013 * s, 0.03 * s, 10), 'skin_python', { pos: headPos.toArray(), rot: [0.15, Math.atan2(0.03, 0.035), 0], color: [0.72, 0.55, 0.38], lit: true });
  for (const k of [-1, 1]) b.add(ellipsoid(0.0028 * s, 0.0028 * s, 0.0028 * s, 6), 'plastic_black', { pos: [headPos.x + k * 0.012 * s, headPos.y + 0.006 * s, headPos.z + 0.012 * s], color: [0.05, 0.05, 0.05] });
  b.pop();
}

export function gecko(b, pos, { scale = 1, yaw = 0, color = [1.05, 0.95, 0.85], tile = 'skin_gecko', pitch = 0 } = {}) {
  b.push(pos, 0, [pitch, yaw, 0]);
  const s = scale;
  b.add(ellipsoid(0.022 * s, 0.012 * s, 0.045 * s, 10), tile, { pos: [0, 0.014 * s, 0], color, lit: true });
  b.add(ellipsoid(0.016 * s, 0.011 * s, 0.02 * s, 8), tile, { pos: [0, 0.018 * s, 0.05 * s], color, lit: true });
  b.add(taperTube([[0, 0.012 * s, -0.04 * s], [0.02 * s, 0.01 * s, -0.08 * s], [0.0, 0.008 * s, -0.12 * s]], 0.009 * s, 0.002 * s, { radial: 5, segs: 6, vScale: 12 }), tile, { uv: 'keep', color, lit: true });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(taperTube([[sx * 0.016 * s, 0.012 * s, sz * 0.024 * s], [sx * 0.032 * s, 0.004 * s, sz * 0.03 * s], [sx * 0.036 * s, 0.001, sz * 0.04 * s]], 0.004 * s, 0.003 * s, { radial: 4, segs: 3 }), tile, { uv: 'keep', color, lit: true });
  b.pop();
}

export function frog(b, pos, { yaw = 0 } = {}) {
  b.push(pos, yaw);
  const blue = [0.2, 0.42, 1.1];
  b.add(ellipsoid(0.02, 0.014, 0.024, 10), 'paper', { pos: [0, 0.014, 0], color: blue, lit: true, glow: 0.05 });
  for (const s of [-1, 1]) {
    b.add(ellipsoid(0.005, 0.005, 0.005, 6), 'plastic_black', { pos: [s * 0.009, 0.024, 0.016], color: [0.1, 0.1, 0.12] });
    b.add(taperTube([[s * 0.014, 0.008, -0.01], [s * 0.026, 0.004, -0.004], [s * 0.028, 0.001, 0.012]], 0.004, 0.003, { radial: 4, segs: 3 }), 'paper', { uv: 'keep', color: [0.12, 0.2, 0.6], lit: true });
  }
  b.pop();
}

// ----------------------------------------------------------------------------------------- dioramas
/** ARID: sandstone background, sand, slate basking stack, cork hide, branch, succulents, python. */
export function aridInterior(b, I, { seed = 1, occupied = true, rich = true, animal = 'python' } = {}) {
  const w = I.x1 - I.x0, d = I.z1 - I.z0, cx = (I.x0 + I.x1) / 2;
  backgroundPanel(b, I, { tile: 'rock_warm', depth: Math.min(0.06, d * 0.14), seed, color: [1.05, 0.95, 0.85], uvScale: 1.7 });
  if (rich) sideRock(b, I, { tile: 'rock_warm', seed: seed + 3, color: [0.95, 0.88, 0.8] });
  { // sandstone slabs bolted into the background: silhouettes & basking ledges
    const r0 = rng(seed + 90), hh = I.top - I.floor;
    for (let i = 0; i < Math.max(2, Math.round(w * 4)); i++) {
      const x = I.x0 + w * (0.12 + 0.76 * (i + r0() * 0.5) / Math.max(2, Math.round(w * 4))), y = I.floor + hh * (0.35 + r0() * 0.4);
      stone(b, [x, y, I.z0 + 0.03], Math.min(0.09, hh * 0.2) * (0.8 + r0() * 0.4), { seed: seed + 91 + i, sx: 1.4, sy: 0.45, sz: 0.55, rotY: (r0() - 0.5) * 0.3, tile: 'rock_warm', color: [1.05, 0.95, 0.85], ao: interiorAO(I) });
    }
  }
  const surf = (x, z) => I.floor + 0.035 + (1 - (z - I.z0) / d) * Math.min(0.05, (I.top - I.floor) * 0.1) + (fbm(x * 6 + seed, z * 6, 2) - 0.5) * 0.02;
  substrateVolume(b, I, surf, { top: 'sand', section: 'section_arid', color: TINT.sand, uvScale: 5 });
  const ao = interiorAO(I);
  const bx = cx - w * 0.28, bz = I.z0 + d * 0.42;
  stone(b, [bx, surf(bx, bz) + 0.012, bz], Math.min(0.12, w * 0.12), { seed: seed + 11, sx: 1.15, sy: 0.32, sz: 0.8, ao });
  stone(b, [bx + 0.02, surf(bx, bz) + 0.045, bz + 0.01], Math.min(0.085, w * 0.085), { seed: seed + 12, sx: 1, sy: 0.3, sz: 0.9, rotY: 0.6, ao, color: [1.05, 0.95, 0.85] });
  stone(b, [bx + w * 0.14, surf(bx + w * 0.14, bz + 0.08) + 0.01, bz + 0.08], 0.045, { seed: seed + 13, sy: 0.6, ao });
  const r = rng(seed + 40);
  for (let i = 0; i < Math.round(w * 10); i++) { const x = cx + (r() - 0.5) * w * 0.85, z = I.z0 + d * (0.3 + r() * 0.65); stone(b, [x, surf(x, z) + 0.002, z], 0.008 + r() * 0.012, { seed: seed + 50 + i, sy: 0.6, ao }); }
  if (w > 0.45) corkTube(b, [cx + w * 0.22, surf(cx + w * 0.22, I.z0 + d * 0.3) - 0.01, I.z0 + d * 0.3], { len: Math.min(0.28, w * 0.3), r: Math.min(0.065, d * 0.14), rotY: 0.25 });
  branch(b, [[cx + w * 0.42, surf(cx + w * 0.42, I.z0 + d * 0.8), I.z0 + d * 0.8], [cx + w * 0.25, I.floor + (I.top - I.floor) * 0.3, I.z0 + d * 0.5], [cx + w * 0.05, I.floor + (I.top - I.floor) * 0.55, I.z0 + d * 0.35], [cx - w * 0.12, I.floor + (I.top - I.floor) * 0.68, I.z0 + d * 0.22]], { r0: 0.018, r1: 0.008, seed: seed + 4, twigs: 2, tile: 'driftwood', color: [1.15, 1.05, 0.92] });
  waterBowl(b, [cx - w * 0.3, surf(cx - w * 0.3, I.z0 + d * 0.78) - 0.008, I.z0 + d * 0.78], { r: Math.min(0.07, w * 0.07) });
  strapPlant(b, [cx + w * 0.4, surf(cx + w * 0.4, I.z0 + d * 0.2) - 0.005, I.z0 + d * 0.2], { size: Math.min(0.26, (I.top - I.floor) * 0.6), leaves: 6, seed: seed + 21 });
  succulent(b, [cx + 0.02, surf(cx + 0.02, I.z0 + d * 0.85) - 0.004, I.z0 + d * 0.85], { size: 0.045, seed: seed + 22 });
  succulent(b, [cx + w * 0.1, surf(cx + w * 0.1, I.z0 + d * 0.9) - 0.004, I.z0 + d * 0.9], { size: 0.032, seed: seed + 23, color: [0.9, 0.85, 0.7] });
  if (rich) succulent(b, [cx - w * 0.44, surf(cx - w * 0.44, I.z0 + d * 0.2) - 0.004, I.z0 + d * 0.2], { size: 0.04, seed: seed + 24 });
  for (const [fx, fz, s] of [[-0.12, 0.6, 31], [0.36, 0.85, 32], [-0.4, 0.55, 33], [0.05, 0.2, 34]]) { const x = cx + fx * w, z = I.z0 + fz * d; grassTuft(b, [x, surf(x, z) - 0.003, z], { h: Math.min(0.1, (I.top - I.floor) * 0.25), seed: s }); }
  if (occupied) {
    if (animal === 'python') coiledPython(b, [cx - 0.02, surf(cx - 0.02, I.z0 + d * 0.62), I.z0 + d * 0.62], { scale: Math.min(1, w * 1.1), yaw: 0.4 });
    else gecko(b, [cx + 0.02, surf(cx + 0.02, I.z0 + d * 0.65), I.z0 + d * 0.65], { yaw: 0.8 });
  }
  return surf;
}

/** TROPICAL: cork background, drainage + soil section, moss, branches, bromeliads, fern, vines, gecko. */
export function tropicalInterior(b, I, { seed = 1, occupied = true, rich = true } = {}) {
  const w = I.x1 - I.x0, d = I.z1 - I.z0, h = I.top - I.floor, cx = (I.x0 + I.x1) / 2;
  backgroundPanel(b, I, { tile: 'cork', depth: Math.min(0.07, d * 0.16), seed, ledges: false, color: [0.95, 0.9, 0.85], uvScale: 4 });
  { // vertical cork branches against the background (depth & climbing structure)
    const r0 = rng(seed + 80);
    for (let i = 0; i < (rich ? 3 : 2); i++) {
      const x = I.x0 + w * (0.18 + 0.64 * i / 2) + (r0() - 0.5) * 0.04;
      branch(b, [[x, I.floor, I.z0 + 0.04], [x + (r0() - 0.5) * 0.06, I.floor + h * 0.5, I.z0 + 0.05 + r0() * 0.02], [x + (r0() - 0.5) * 0.08, I.top - 0.02, I.z0 + 0.04]], { r0: 0.03, r1: 0.022, seed: seed + 81 + i, twigs: 0, tile: 'cork', color: [0.85, 0.75, 0.65] });
    }
  }
  const drain = I.floor + Math.min(0.04, h * 0.06);
  const surf = (x, z) => drain + 0.045 + (1 - (z - I.z0) / d) * Math.min(0.04, h * 0.06) + (fbm(x * 7 + seed, z * 7, 2) - 0.5) * 0.016;
  substrateVolume(b, I, surf, { top: 'soil', section: 'section_tropical', uvScale: 5 });
  const at = (fx, fz) => { const x = cx + fx * w, z = I.z0 + fz * d; return [x, surf(x, z), z]; };
  for (const [fx, fz, s] of [[-0.3, 0.72, 1], [0.22, 0.62, 1.25], [0.0, 0.3, 0.85], [0.35, 0.85, 0.7]]) { const p = at(fx, fz); mossMound(b, [p[0], p[1] - 0.006, p[2]], 0.04 * s * Math.min(1, w * 1.8), { sy: 0.42, seed: seed + fx * 10 + 3 }); }
  branch(b, [at(-0.34, 0.6), [cx - w * 0.16, I.floor + h * 0.38, I.z0 + d * 0.45], [cx + w * 0.08, I.floor + h * 0.62, I.z0 + d * 0.3], [cx + w * 0.34, I.floor + h * 0.82, I.z0 + d * 0.22]], { r0: 0.02, r1: 0.009, seed: seed + 8, twigs: 3 });
  if (rich) branch(b, [at(0.38, 0.72), [cx + w * 0.25, I.floor + h * 0.34, I.z0 + d * 0.5], [cx + w * 0.03, I.floor + h * 0.46, I.z0 + d * 0.35]], { r0: 0.014, r1: 0.007, seed: seed + 9, twigs: 1 });
  const bs = Math.min(1.35, h * 1.6);
  bromeliad(b, [cx + w * 0.08, I.floor + h * 0.62, I.z0 + d * 0.32], { size: 0.12 * bs, seed: seed + 3, leaves: 11 });
  if (rich) bromeliad(b, [cx + w * 0.3, I.floor + h * 0.78, I.z0 + 0.05], { size: 0.08 * bs, seed: seed + 11, leaves: 8, tile: 'leaf_red', heart: null });
  bromeliad(b, [cx - w * 0.28, I.floor + h * 0.45, I.z0 + 0.05], { size: 0.1 * bs, seed: seed + 4, leaves: 9, tile: 'leaf_red', heart: 'leaf_strap' });
  bromeliad(b, at(0.28, 0.3), { size: 0.15 * bs, seed: seed + 5, leaves: 12 });
  fernClump(b, at(-0.33, 0.28), { size: 0.2 * bs, seed: seed + 6, fronds: 8 });
  vine(b, [at(0.34, 0.12), [cx + w * 0.37, I.floor + h * 0.35, I.z0 + 0.05], [cx + w * 0.2, I.floor + h * 0.55, I.z0 + 0.06], [cx - w * 0.08, I.floor + h * 0.7, I.z0 + 0.05], [cx - w * 0.33, I.floor + h * 0.85, I.z0 + 0.06]], { leaf: 0.05 * bs, seed: seed + 7 });
  if (rich) vine(b, [[cx - w * 0.4, I.floor + h * 0.9, I.z0 + 0.05], [cx - w * 0.36, I.floor + h * 0.68, I.z0 + 0.07], [cx - w * 0.4, I.floor + h * 0.5, I.z0 + 0.06]], { leaf: 0.045 * bs, seed: seed + 8 });
  groundCover(b, at(0.03, 0.72), { radius: 0.08 * Math.min(1, w * 1.6), count: rich ? 22 : 12, seed: seed + 9, surf, size: 0.035 });
  leafLitter(b, I, surf, { count: rich ? 26 : 12, seed: seed + 12 });
  if (rich) groundCover(b, at(-0.2, 0.85), { radius: 0.05, count: 9, seed: seed + 10, surf });
  // mist nozzle
  box(b, 0.014, 0.02, 0.014, 'plastic_black', [cx + w * 0.34, I.top - 0.01, I.z0 + d * 0.2], { color: TINT.black });
  if (occupied) gecko(b, [cx - w * 0.14, I.floor + h * 0.4 + 0.012, I.z0 + d * 0.45], { yaw: 0.9, pitch: -0.35, color: [1.05, 0.8, 0.6], tile: 'skin_gecko' });
  return surf;
}

/** PALUDARIUM (tank part): dark rock wall, water & land, waterfall, driftwood, planting, frog. */
export function paludariumInterior(b, I, { seed = 1, occupied = true, lit = true } = {}) {
  const w = I.x1 - I.x0, d = I.z1 - I.z0, h = I.top - I.floor, cx = (I.x0 + I.x1) / 2;
  backgroundPanel(b, I, { tile: 'rock_dark', depth: Math.min(0.08, d * 0.16), seed, color: [0.9, 0.95, 0.95], uvScale: 3 });
  const waterY = I.floor + h * 0.34;
  const landX = cx + w * 0.05;
  const surf = (x, z) => {
    const t = THREE.MathUtils.smoothstep(x, landX - 0.1, landX + 0.12);
    return I.floor + 0.035 + t * (waterY - I.floor + 0.02) + (1 - (z - I.z0) / d) * 0.03 + (fbm(x * 6 + seed, z * 6, 2) - 0.5) * 0.014;
  };
  substrateVolume(b, I, surf, { top: 'soil', section: 'section_palu', uvScale: 5 });
  // underwater gravel
  b.add(heightfield(I.x0, landX + 0.02, I.z0 + 0.03, I.z1, 18, 8, (x, z) => surf(x, z) + 0.003), 'gravel', { uvScale: 7, lit: true, ao: interiorAO(I) });
  // retaining rock wall
  const ao = interiorAO(I);
  for (let i = 0; i < Math.round(d / 0.07); i++) { const z = I.z0 + 0.05 + i * 0.07; stone(b, [landX + 0.02, I.floor + 0.07, z], 0.065 + (i % 2) * 0.018, { seed: seed + 60 + i, sx: 0.9, sy: 1.3, sz: 0.9, tile: 'rock_dark', color: [0.85, 0.9, 0.9], ao }); }
  const r = rng(seed + 70);
  for (let i = 0; i < 5; i++) { const x = I.x0 + 0.06 + r() * (landX - I.x0 - 0.12), z = I.z0 + 0.1 + r() * (d - 0.15); stone(b, [x, surf(x, z) + 0.008, z], 0.025 + r() * 0.035, { seed: seed + 80 + i, sy: 0.7, tile: 'rock_dark', color: [0.8, 0.88, 0.88], ao }); }
  // water body: surface + front face (seen through the glass) + soft glow on the surface
  const wx0 = I.x0 + 0.002, wx1 = landX + 0.07, wh = waterY - I.floor - 0.02;
  b.add(flat(wx1 - wx0, d + 0.01), 'water', { bucket: 'glass', pos: [(wx0 + wx1) / 2, waterY, (I.z0 + I.z1) / 2 + 0.005], uvScale: 5, alpha: 0.6, color: [0.75, 1.0, 0.95] });
  b.add(quad(wx1 - wx0, wh), 'water_side', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [(wx0 + wx1) / 2, I.floor + 0.02 + wh / 2, I.z1 + 0.008], alpha: 0.55, color: [0.7, 1.0, 0.95] });
  b.add(quad(wx1 - wx0, 0.012), 'foam', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [(wx0 + wx1) / 2, waterY - 0.004, I.z1 + 0.009], rot: [0, 0, Math.PI / 2], alpha: 0.12, color: [0.6, 0.9, 0.9] });
  // waterfall ribbon down the rock wall
  const fx = cx - w * 0.24;
  const fall = new THREE.PlaneGeometry(0.075, 0.26, 1, 8); const fp = fall.attributes.position;
  for (let i = 0; i < fp.count; i++) { const t = fp.getY(i) / 0.26 + 0.5; fp.setZ(i, 0.06 * (1 - t) * (1 - t)); }
  fall.computeVertexNormals();
  b.add(fall, 'foam', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [fx, waterY + 0.13, I.z0 + 0.04], alpha: 0.85, color: [0.9, 1.0, 1.0] });
  b.add(fall, 'foam', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [fx, waterY + 0.13, I.z0 + 0.042], alpha: lit ? 0.6 : 0.2, color: [0.55, 0.8, 0.85] });
  b.add(new THREE.RingGeometry(0.012, 0.06, 16).rotateX(-Math.PI / 2), 'foam', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [fx, waterY + 0.002, I.z0 + 0.1], alpha: 0.6 });
  stone(b, [fx, waterY + 0.26, I.z0 + 0.05], 0.06, { seed: seed + 90, sx: 1.2, sy: 0.5, sz: 0.8, tile: 'rock_dark', color: [0.85, 0.9, 0.9] });
  // driftwood
  branch(b, [[cx - w * 0.3, I.floor + 0.04, I.z0 + d * 0.62], [cx - w * 0.12, waterY + 0.04, I.z0 + d * 0.5], [cx + w * 0.13, waterY + 0.17, I.z0 + d * 0.38], [cx + w * 0.34, waterY + 0.29, I.z0 + d * 0.25]], { r0: 0.028, r1: 0.012, seed: seed + 21, twigs: 3, tile: 'driftwood', color: [1.05, 1.0, 0.95] });
  // planting
  const at = (fx2, fz) => { const x = cx + fx2 * w, z = I.z0 + fz * d; return [x, surf(x, z), z]; };
  bromeliad(b, [cx + w * 0.15, waterY + 0.13, I.z0 + d * 0.4], { size: 0.15, seed: seed + 31, leaves: 12 });
  bromeliad(b, at(0.38, 0.35), { size: 0.2, seed: seed + 32, leaves: 13, tile: 'leaf_red', heart: 'leaf_strap' });
  fernClump(b, at(0.25, 0.25), { size: 0.26, seed: seed + 33, fronds: 10 });
  fernClump(b, [cx - w * 0.38, waterY + 0.16, I.z0 + 0.05], { size: 0.18, seed: seed + 34, fronds: 7 });
  groundCover(b, at(0.25, 0.7), { radius: 0.09, count: 18, seed: seed + 35, surf });
  groundCover(b, at(0.42, 0.78), { radius: 0.05, count: 9, seed: seed + 36, surf });
  vine(b, [at(0.44, 0.15), [cx + w * 0.42, I.floor + h * 0.55, I.z0 + 0.06], [cx + w * 0.25, I.floor + h * 0.78, I.z0 + 0.07], [cx, I.floor + h * 0.84, I.z0 + 0.07]], { leaf: 0.06, seed: seed + 37 });
  vine(b, [[cx - w * 0.05, I.floor + h * 0.95, I.z0 + 0.06], [cx - w * 0.12, I.floor + h * 0.7, I.z0 + 0.08], [cx - w * 0.1, I.floor + h * 0.52, I.z0 + 0.07]], { leaf: 0.055, seed: seed + 38 });
  for (const [fx2, fz, s] of [[0.18, 0.55, 1], [0.36, 0.6, 0.8]]) { const p = at(fx2, fz); mossMound(b, [p[0], p[1] - 0.003, p[2]], 0.05 * s, {}); }
  for (let i = 0; i < 4; i++) { const p = at(-0.42 + i * 0.08, 0.3); strapPlant(b, [p[0], p[1], p[2]], { size: 0.14, leaves: 4, seed: seed + 40 + i, color: [0.6, 0.95, 0.6], spread: 0.1 }); }
  // epiphytes & moss on the rock wall, moss carpet on the land
  for (const [fx2, fy, sz, sd] of [[-0.05, 0.62, 0.09, 1], [0.3, 0.72, 0.1, 2], [-0.3, 0.8, 0.07, 3], [0.1, 0.9, 0.08, 4]]) {
    const x = cx + fx2 * w, y = I.floor + fy * h;
    mossMound(b, [x, y - 0.02, I.z0 + 0.05], 0.035, { sy: 0.5, seed: seed + 50 + sd });
    if (sd % 2) bromeliad(b, [x, y, I.z0 + 0.06], { size: sz, seed: seed + 60 + sd, leaves: 8, heart: sd === 3 ? 'leaf_red' : null });
    else fernClump(b, [x, y, I.z0 + 0.06], { size: sz * 1.3, seed: seed + 70 + sd, fronds: 6 });
  }
  for (const [fx2, fz, s2] of [[0.12, 0.72, 1.1], [0.3, 0.82, 0.9], [0.44, 0.5, 0.8], [0.2, 0.35, 0.7]]) { const p = at(fx2, fz); mossMound(b, [p[0], p[1] - 0.004, p[2]], 0.045 * s2, { seed: seed + 80 + fz * 10 }); }
  leafLitter(b, { x0: landX + 0.05, x1: I.x1, z0: I.z0, z1: I.z1 }, surf, { count: 14, seed: seed + 90 });
  // pump & heater
  box(b, 0.05, 0.08, 0.04, 'plastic_black', [I.x0 + 0.04, I.floor + 0.06, I.z0 + 0.03], { color: TINT.black });
  if (occupied) frog(b, at(0.3, 0.55), { yaw: 0.6 });
  return surf;
}

/** Prepared, unoccupied enclosure: paper, hide, bowl — deliberately quiet. */
export function emptyInterior(b, I) {
  const w = I.x1 - I.x0, d = I.z1 - I.z0, cx = (I.x0 + I.x1) / 2;
  b.add(flat(w - 0.01, d), 'paper', { pos: [cx, I.floor + 0.002, (I.z0 + I.z1) / 2], uvScale: 3, color: [0.78, 0.76, 0.72], ao: interiorAO(I) });
  box(b, Math.min(0.14, w * 0.28), 0.055, Math.min(0.1, d * 0.3), 'plastic_black', [cx + w * 0.18, I.floor + 0.03, I.z0 + d * 0.35], { color: TINT.black, r: 0.012, ao: interiorAO(I) });
  waterBowl(b, [cx - w * 0.2, I.floor + 0.003, I.z0 + d * 0.62], { r: 0.04, tile: 'stainless', color: [0.9, 0.9, 0.92] });
}

/** Stand-alone terrarium cell (used by racks and by the single terrarium types). */
export function terrariumCell(mats, { W, H, D, style = 'sliding', interior = 'arid', lit = true, occupied = true, seed = 1, rich = true, basking = false, vent }) {
  const c = new PaintBuilder(mats);
  const light = interior === 'arid' ? 'warm' : 'cool';
  const empty = interior === 'empty' || !occupied && interior === 'empty';
  const I = terrariumShell(c, { W, H, D, style, light, lit: lit && !empty, vent: vent ?? (style === 'hinged' ? 0.06 : 0.035), basking: basking && lit, occupied: occupied && !empty, lampIntensity: interior === 'palu' ? 1.1 : 1 });
  if (interior === 'arid') aridInterior(c, I, { seed, occupied, rich, animal: W > 0.8 ? 'python' : 'gecko' });
  else if (interior === 'tropical') tropicalInterior(c, I, { seed, occupied, rich });
  else if (interior === 'palu') paludariumInterior(c, I, { seed, occupied, lit });
  else emptyInterior(c, I);
  return c;
}
