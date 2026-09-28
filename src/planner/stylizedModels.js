import * as THREE from 'three';
import { TILE_CLAMP, TILE_REPEAT_U } from './PaintedMaterials.js';
import { PaintBuilder } from './PaintBuilder.js';
import { rng, rbox, cyl, lathe, quad, flat, leafCard, taperTube, ellipsoid, profileBar } from './geometry.js';
import {
  TINT, box, contactShadow, wallShadow, frameProfile, highlight, glassPanel, doorPanel, ventStrip, lightStrip, labelCard,
  rackRail, cabinetModule, terrariumCell, strapPlant, coiledPython,
} from './components.js';

/**
 * PLANNER representation of every catalogue type, generated at the object's LOGICAL size.
 *
 * `buildModel(mats, obj, ctx)` returns a PaintBuilder; the view merges it into ≤5 meshes. Results are
 * cached by a key of everything that influences the geometry (type, size, relevant props, wall
 * thickness), so identical objects share geometry and re-selecting / moving never rebuilds.
 */
export function modelKey(obj, t, room) {
  const p = obj.props || {};
  const s = obj.size;
  const d = t.placement === 'opening' ? room.wallThickness : s.d;
  return [obj.type, s.w.toFixed(3), s.h.toFixed(3), d.toFixed(3), p.occupied !== false ? 1 : 0, p.lighting !== false ? 1 : 0, p.animal?.species || ''].join('|');
}

export function buildModel(mats, obj, t, room) {
  const b = new PaintBuilder(mats);
  const W = obj.size.w, H = obj.size.h, D = t.placement === 'opening' ? room.wallThickness : obj.size.d;
  const occupied = obj.props?.occupied !== false;
  const lit = t.enclosure ? occupied && obj.props?.lighting !== false : true;
  const fn = MODELS[obj.type] || generic;
  fn(b, { W, H, D, occupied, lit, obj, t, mats, seed: hashStr(obj.type) });
  return b;
}

function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 997; }

const MODELS = {
  // --------------------------------------------------------------------------------- enclosures
  terrarium_arid(b, { W, H, D, occupied, lit, mats }) {
    contactShadow(b, W, D, { spread: 0.06, strength: 0.9 });
    b.include(terrariumCell(mats, { W, H, D, style: 'sliding', interior: occupied ? 'arid' : 'empty', lit, occupied, seed: 3, basking: true }));
  },
  terrarium_tropical(b, { W, H, D, occupied, lit, mats }) {
    contactShadow(b, W, D, { spread: 0.06, strength: 0.9 });
    b.include(terrariumCell(mats, { W, H, D, style: 'hinged', interior: occupied ? 'tropical' : 'empty', lit, occupied, seed: 9, vent: Math.min(0.07, H * 0.08) }));
  },
  paludarium(b, { W, H, D, occupied, lit, mats }) {
    contactShadow(b, W, D);
    const standH = Math.min(0.8, H * 0.57);
    cabinetModule(b, W, standH, D, { doors: W > 0.9 ? 2 : 1, tile: 'metal_dark', color: [2.3, 2.3, 2.4], topColor: [1.9, 1.9, 2.0] });
    b.include(terrariumCell(mats, { W, H: H - standH, D, style: 'rimless', interior: 'palu', lit, occupied, seed: 12 }), [0, standH, 0]);
    // light bar resting on the glass cover
    box(b, W - 0.1, 0.018, 0.06, 'alu', [0, H + 0.009, -D * 0.1], { color: [0.55, 0.56, 0.6], r: 0.006 });
  },
  rack_glass(b, { W, H, D, occupied, lit, mats }) {
    contactShadow(b, W, D);
    const post = 0.035, k = H / 1.9;
    const levels = [0.12, 0.76, 1.4].map((y) => y * k);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) rackRail(b, H, [sx * (W / 2 - post / 2), 0, sz * (D / 2 - post / 2)], { s: post });
    for (const y of [...levels, H - 0.03]) {
      box(b, W - 0.01, 0.02, D - 0.01, 'metal_dark', [0, y - 0.01, 0], { color: TINT.graphite, r: 0.003 });
      box(b, W - 0.07, 0.035, 0.02, 'metal_dark', [0, y - 0.03, D / 2 - 0.015], { color: TINT.graphite, r: 0.004, grad: [0.75, 1.1] });
      b.add(rbox(W - 0.08, 0.005, 0.002), 'amber', { pos: [0, y - 0.03, D / 2 - 0.004], glow: 0.35 }); // identification stripe
    }
    const bl = Math.hypot(W - 0.08, 0.5 * k);
    for (const s of [-1, 1]) box(b, bl, 0.012, 0.004, 'metal_dark', [0, 1.09 * k, -D / 2 + 0.01], { rot: [0, 0, s * Math.atan2(0.5 * k, W - 0.08)], color: TINT.graphite, r: 0.001 });
    const kinds = [['arid', 'tropical'], ['tropical', 'arid'], ['empty', 'arid']];
    const cw = (W - 0.09) / 2, ch = Math.min(0.45 * k, (levels[1] - levels[0]) - 0.19 * k), cd = D - 0.05;
    levels.forEach((y, li) => {
      for (let ci = 0; ci < 2; ci++) {
        const kind = occupied ? kinds[li][ci] : 'empty';
        const cell = terrariumCell(mats, { W: cw, H: ch, D: cd, style: 'sliding', interior: kind, lit: lit && kind !== 'empty', occupied: kind !== 'empty', seed: 300 + li * 10 + ci, rich: false });
        b.include(cell, [(ci - 0.5) * (cw + 0.035), y, 0.0]);
      }
    });
    // thermostat on the right upright
    const cx = W / 2 + 0.03, cy = 1.05 * k;
    box(b, 0.05, 0.12, 0.08, 'plastic_white', [cx, cy, D / 2 - 0.08], { color: TINT.white, r: 0.008 });
    b.add(quad(0.05, 0.03).rotateY(Math.PI / 2), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [cx + 0.026, cy + 0.025, D / 2 - 0.08], glow: 0.9 });
  },
  rack_tubs(b, { W, H, D, occupied, lit }) {
    contactShadow(b, W, D);
    const t = 0.018, rows = Math.max(3, Math.round(7 * H / 1.78)), cols = W > 0.8 ? 2 : 1;
    const c = [0.3, 0.3, 0.32];
    for (const s of [-1, 1]) box(b, t, H, D, 'plastic_black', [s * (W / 2 - t / 2), H / 2, 0], { color: c, r: 0.003, grad: [0.8, 1.05] });
    if (cols === 2) box(b, t, H - 0.08, D - 0.02, 'plastic_black', [0, H / 2 + 0.02, -0.01], { color: c });
    box(b, W, t, D, 'plastic_black', [0, H - t / 2, 0], { color: c.map((v) => v * 1.15) });
    highlight(b, W - 0.01, [0, H - 0.001, D / 2 + 0.0005], { color: [0.6, 0.6, 0.62] });
    box(b, W - 2 * t, 0.066, 0.012, 'plastic_black', [0, 0.033, D / 2 - 0.02], { color: [0.2, 0.2, 0.21] });
    box(b, W - 2 * t, H - 0.08, 0.006, 'plastic_black', [0, H / 2 + 0.03, -D / 2 + 0.003], { color: [0.12, 0.12, 0.13] });
    const rowH = (H - 0.1 - t) / rows, colW = (W - (cols + 1) * t) / cols;
    for (let r = 0; r < rows; r++) {
      const y = 0.08 + r * rowH;
      box(b, W - 2 * t, 0.012, D - 0.02, 'plastic_black', [0, y, -0.01], { color: c });
      // heat-tape glow line at the back of every shelf (painted warmth)
      if (lit !== false) b.add(rbox(W - 0.08, 0.003, 0.01), 'amber', { pos: [0, y + 0.008, -D / 2 + 0.06], glow: 0.35, color: [0.9, 0.35, 0.15] });
      for (let k = 0; k < cols; k++) {
        const x = -W / 2 + t + colW / 2 + k * (colW + t);
        const th = rowH - 0.03;
        b.add(rbox(colW - 0.02, th, 0.012, 0.004), 'tub_front', { mode: TILE_CLAMP, uv: 'keep', pos: [x, y + 0.012 + th / 2, D / 2 - 0.03], color: occupied ? [0.8, 0.8, 0.78] : [0.55, 0.55, 0.55] });
        b.add(rbox(colW - 0.03, th - 0.01, D - 0.1), 'plastic_white', { pos: [x, y + 0.012 + th / 2, -0.02], color: [0.55, 0.55, 0.52] });
      }
    }
    labelCard(b, [W / 2 - 0.1, H - 0.04, D / 2 + 0.002], { status: occupied ? 'ok' : null });
    box(b, 0.12, 0.08, 0.04, 'plastic_white', [-W / 2 + 0.12, H + 0.04, 0], { color: TINT.white, r: 0.006 });
    b.add(quad(0.07, 0.035), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [-W / 2 + 0.12, H + 0.045, 0.021], glow: 0.9 });
  },
  quarantine(b, { W, H, D, occupied, lit, mats }) {
    contactShadow(b, W, D);
    const trolleyH = Math.min(0.55, H * 0.45);
    // stainless trolley with castors
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add(cyl(0.012, 0.012, trolleyH - 0.07, 8), 'stainless', { pos: [sx * (W / 2 - 0.03), 0.07 + (trolleyH - 0.07) / 2, sz * (D / 2 - 0.03)], color: [1.02, 1.02, 1.05] });
      b.add(cyl(0.03, 0.03, 0.022, 12).rotateZ(Math.PI / 2), 'rubber', { pos: [sx * (W / 2 - 0.03), 0.03, sz * (D / 2 - 0.03)], color: TINT.black });
      box(b, 0.03, 0.02, 0.04, 'stainless', [sx * (W / 2 - 0.03), 0.06, sz * (D / 2 - 0.03)], {});
    }
    for (const y of [0.16, trolleyH - 0.015]) box(b, W, 0.03, D, 'stainless', [0, y, 0], { r: 0.004, color: [0.95, 0.96, 1.0] });
    // PVC enclosure: white shell, black front frame, sliding glass
    const eh = H - trolleyH, y0 = trolleyH;
    const c = new PaintBuilder(mats);
    box(c, W, eh, D, 'plastic_white', [0, eh / 2, -0.004], { color: TINT.white, r: 0.01, grad: [0.85, 1.05] });
    box(c, W - 0.04, eh - 0.08, 0.02, 'plastic_black', [0, eh / 2 + 0.01, D / 2 - 0.004], { color: [0.08, 0.08, 0.09] }); // dark interior seen through the glass
    const I = { x0: -W / 2 + 0.03, x1: W / 2 - 0.03, z0: -D / 2 + 0.03, z1: D / 2 - 0.03, floor: 0.05, top: eh - 0.03 };
    c.add(flat(W - 0.06, D - 0.06), 'paper', { pos: [0, 0.052, 0], uvScale: 3, color: [0.85, 0.82, 0.78], lit: true });
    box(c, 0.2, 0.07, 0.14, 'plastic_black', [W * 0.2, 0.09, -0.05], { color: TINT.black, r: 0.015, lit: true });
    if (occupied) coiledPython(c, [-W * 0.12, 0.055, 0.02], { scale: 0.9, yaw: 1.2 });
    for (const s of [-1, 1]) glassPanel(c, W / 2 - 0.02, eh - 0.1, [s * (W / 4 - 0.01), eh / 2 + 0.005, D / 2 + 0.008 - (s + 1) * 0.004]);
    box(c, W - 0.02, 0.04, 0.02, 'plastic_black', [0, 0.03, D / 2 + 0.004], { color: TINT.black });
    box(c, W - 0.02, 0.03, 0.02, 'plastic_black', [0, eh - 0.035, D / 2 + 0.004], { color: TINT.black });
    ventStrip(c, W * 0.5, 0.03, [0, eh - 0.018, D / 2 + 0.012], {});
    lightStrip(c, W - 0.14, [0, I.top - 0.02, -0.02], { temp: 'warm', lit, lampRadius: 0.75 });
    labelCard(c, [W / 2 - 0.1, 0.03, D / 2 + 0.016], { status: occupied ? 'warn' : null, w: 0.09 });
    b.include(c, [0, y0, 0]);
  },
  incubator(b, { W, H, D, occupied, lit }) {
    contactShadow(b, W, D);
    box(b, W, H - 0.05, D, 'plastic_white', [0, 0.05 + (H - 0.05) / 2, 0], { color: TINT.white, r: 0.012, grad: [0.8, 1.05] });
    box(b, W - 0.06, 0.05, D - 0.08, 'plastic_black', [0, 0.025, 0], { color: TINT.black });
    // glass door with lit interior shelves behind it
    const dh = H - 0.3, dy = 0.08 + dh / 2;
    b.add(quad(W - 0.1, dh), 'incubator_interior', { mode: TILE_CLAMP, uv: 'keep', pos: [0, dy, D / 2 - 0.012], glow: lit ? 0.55 : 0.05, color: lit ? [1.1, 1.0, 0.9] : [0.5, 0.5, 0.5] });
    glassPanel(b, W - 0.08, dh + 0.02, [0, dy, D / 2 + 0.004], { tint: [0.9, 0.95, 0.95] });
    box(b, W - 0.04, 0.03, 0.02, 'plastic_white', [0, dy + dh / 2 + 0.02, D / 2], { color: TINT.white });
    box(b, 0.02, dh * 0.4, 0.03, 'stainless', [W / 2 - 0.06, dy, D / 2 + 0.02], { r: 0.008 });
    // control panel & display
    box(b, W - 0.1, 0.13, 0.01, 'plastic_black', [0, H - 0.1, D / 2 + 0.002], { color: [0.15, 0.15, 0.16], r: 0.004 });
    b.add(quad(0.12, 0.06), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [-W / 2 + 0.14, H - 0.1, D / 2 + 0.0085], glow: 0.9 });
    for (let i = 0; i < 3; i++) b.add(cyl(0.008, 0.008, 0.008, 10).rotateX(Math.PI / 2), 'plastic_white', { pos: [0.06 + i * 0.035, H - 0.1, D / 2 + 0.01], color: [0.6, 0.6, 0.62] });
    b.add(new THREE.CircleGeometry(0.005, 10), 'amber', { pos: [W / 2 - 0.08, H - 0.1, D / 2 + 0.009], glow: 1, color: [1, 0.58, 0.18] });
    labelCard(b, [0, H - 0.2, D / 2 + 0.004], { w: 0.09, status: null, dim: !occupied });
  },

  // --------------------------------------------------------------------------------- furniture
  stand_cabinet(b, { W, H, D }) {
    contactShadow(b, W, D);
    cabinetModule(b, W, H, D, { doors: W > 0.8 ? 2 : 1, tile: 'metal_dark', color: [2.3, 2.3, 2.4], topColor: [1.9, 1.9, 2.0] });
  },
  workbench(b, { W, H, D }) {
    contactShadow(b, W, D);
    const top = Math.min(0.9, H * 0.46), tt = 0.04;
    // legs & frame
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, 0.05, top - tt, 0.05, 'metal_dark', [sx * (W / 2 - 0.04), (top - tt) / 2, sz * (D / 2 - 0.05)], { color: TINT.graphite, r: 0.004, grad: [0.75, 1] });
    box(b, W - 0.08, 0.04, D - 0.1, 'metal_dark', [0, 0.16, 0], { color: [0.45, 0.46, 0.5] });
    box(b, W - 0.12, 0.012, D - 0.14, 'wood', [0, 0.186, 0], { color: [0.7, 0.62, 0.52], uvScale: 2 });
    // storage boxes on the lower shelf
    const r = rng(4);
    for (let i = 0; i < Math.floor((W - 0.2) / 0.34); i++) box(b, 0.3, 0.14, 0.36, i % 2 ? 'bin' : 'cardboard', [-W / 2 + 0.22 + i * 0.34, 0.262, 0], { mode: i % 2 ? TILE_CLAMP : 0, uv: i % 2 ? 'box' : 'box', color: i % 2 ? [1, 1, 1] : [0.9, 0.82, 0.72], r: 0.01, uvScale: i % 2 ? 1 : 3 });
    // oak top with painted edge highlight
    box(b, W, tt, D, 'wood', [0, top - tt / 2, 0], { color: [1.05, 0.95, 0.82], r: 0.006, uvScale: 1.4 });
    highlight(b, W - 0.01, [0, top - 0.002, D / 2 + 0.001], { color: [1.2, 1.05, 0.85], tile: 'wood' });
    // pegboard back with tools + shelf + task light
    const pbH = H - top - 0.1, pbY = top + 0.06 + pbH / 2;
    box(b, W - 0.04, pbH, 0.018, 'pegboard', [0, pbY, -D / 2 + 0.02], { color: [0.7, 0.7, 0.72], uvScale: 3, r: 0.003 });
    b.add(quad(Math.min(0.9, W * 0.5), pbH * 0.6), 'tools', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [-W * 0.18, pbY - pbH * 0.08, -D / 2 + 0.031] });
    box(b, W - 0.04, 0.02, 0.22, 'metal_dark', [0, H - 0.1, -D / 2 + 0.12], { color: TINT.graphite, r: 0.003 });
    for (let i = 0; i < 4; i++) box(b, 0.14 + r() * 0.1, 0.1 + r() * 0.08, 0.16, i % 2 ? 'cardboard' : 'bin', [-W / 2 + 0.2 + i * (W - 0.3) / 4, H - 0.09 + 0.06, -D / 2 + 0.12], { color: i % 2 ? [0.9, 0.82, 0.72] : [1, 1, 1], r: 0.008, uvScale: 3 });
    lightStrip(b, W - 0.3, [0, H - 0.125, -D / 2 + 0.18], { temp: 'cool', lit: true, lampRadius: 0 });
    b.add(flat(W - 0.2, D * 0.8), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [0, top + 0.002, -0.02], color: [0.25, 0.28, 0.3], alpha: 0.6 });
    // small items on the top: scale, tubs, tablet
    box(b, 0.22, 0.03, 0.2, 'plastic_black', [W * 0.25, top + 0.015, 0.05], { color: TINT.black, r: 0.006 });
    b.add(quad(0.06, 0.025).rotateX(-1.2), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [W * 0.25, top + 0.032, 0.14], glow: 0.9 });
    box(b, 0.26, 0.012, 0.18, 'plastic_black', [-W * 0.1, top + 0.006, 0.08], { color: [0.12, 0.12, 0.13], r: 0.004 });
    b.add(flat(0.23, 0.15), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [-W * 0.1, top + 0.0125, 0.08], glow: 0.5, color: [0.5, 0.55, 0.6] });
    for (let i = 0; i < 3; i++) b.add(cyl(0.05, 0.045, 0.08, 12), 'plastic_white', { pos: [W * 0.4 - i * 0.02, top + 0.04 + i * 0.08, -0.15], color: [0.85, 0.85, 0.82] });
  },
  sink_unit(b, { W, H, D }) {
    contactShadow(b, W, D);
    box(b, W, H - 0.1, D - 0.03, 'stainless', [0, 0.1 + (H - 0.1) / 2, -0.015], { color: [0.95, 0.96, 1.0], r: 0.004, grad: [0.75, 1.05] });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cyl(0.015, 0.015, 0.1, 8), 'stainless', { pos: [sx * (W / 2 - 0.04), 0.05, sz * (D / 2 - 0.06)] });
    for (let i = 0; i < 2; i++) doorPanel(b, W / 2 - 0.01, H - 0.2, [(i - 0.5) * (W / 2), 0.1 + (H - 0.2) / 2 + 0.01, D / 2 - 0.03], { tile: 'stainless', color: [1, 1, 1.03], handle: i ? 'left' : 'right' });
    // top & basin
    box(b, W + 0.01, 0.03, D, 'stainless', [0, H - 0.015, 0], { color: [1.08, 1.08, 1.12], r: 0.004 });
    // basin: bright rim, shaded inner walls (painted depth), drain
    const bw = W * 0.5, bd = D * 0.5, bx = -W * 0.08, bz = 0.02;
    box(b, bw + 0.02, 0.006, bd + 0.02, 'stainless', [bx, H + 0.003, bz], { color: [1.2, 1.2, 1.25], r: 0.003 });
    b.add(flat(bw, bd), 'stainless', { pos: [bx, H + 0.0065, bz], color: [0.42, 0.43, 0.46], ao: (p) => 0.6 + 0.4 * Math.min(1, Math.min(bw / 2 - Math.abs(p.x - bx), bd / 2 - Math.abs(p.z - bz)) / 0.08) });
    b.add(new THREE.CircleGeometry(0.02, 12).rotateX(-Math.PI / 2), 'drain', { pos: [bx, H + 0.007, bz], color: [0.5, 0.5, 0.52] });
    // splashback tiles + tap
    box(b, W, 0.5, 0.02, 'tiles_white', [0, H + 0.25, -D / 2 + 0.01], { color: [0.9, 0.9, 0.88], uvScale: 3.3 });
    const tx = -W * 0.08, tz = -D / 2 + 0.07;
    b.add(cyl(0.015, 0.02, 0.2, 10), 'stainless', { pos: [tx, H + 0.1, tz], color: [1.15, 1.15, 1.2] });
    b.add(taperTube([[tx, H + 0.19, tz], [tx, H + 0.26, tz + 0.05], [tx, H + 0.2, tz + 0.14]], 0.011, 0.009, { radial: 8, segs: 8 }), 'stainless', { uv: 'keep', color: [1.15, 1.15, 1.2] });
    box(b, 0.02, 0.012, 0.1, 'stainless', [tx + 0.06, H + 0.14, tz + 0.02], { rot: [0.3, 0, 0] });
  },
  shelving(b, { W, H, D, seed }) {
    contactShadow(b, W, D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, 0.03, H, 0.03, 'metal_dark', [sx * (W / 2 - 0.015), H / 2, sz * (D / 2 - 0.015)], { color: TINT.graphite, r: 0.004, grad: [0.8, 1.05] });
    const levels = 5, r = rng(seed);
    for (let i = 0; i < levels; i++) {
      const y = 0.1 + i * (H - 0.15) / (levels - 1);
      box(b, W - 0.01, 0.02, D - 0.01, 'metal_dark', [0, y, 0], { color: [0.5, 0.51, 0.55], r: 0.003 });
      highlight(b, W - 0.03, [0, y + 0.009, D / 2], { color: [0.7, 0.72, 0.76] });
      if (i === levels - 1) continue;
      let x = -W / 2 + 0.04;
      while (x < W / 2 - 0.2) {
        const kind = r(), w = 0.16 + r() * 0.2, h = Math.min(0.3, 0.1 + r() * 0.22);
        if (kind < 0.35) box(b, w, h, D * 0.75, 'cardboard', [x + w / 2, y + 0.01 + h / 2, 0], { color: [0.95, 0.85, 0.72], r: 0.006, uvScale: 3 });
        else if (kind < 0.65) b.add(rbox(w, h, D * 0.7, 0.012), 'bin', { mode: TILE_CLAMP, uv: 'keep', pos: [x + w / 2, y + 0.01 + h / 2, 0] });
        else if (kind < 0.85) b.add(rbox(w, h * 1.1, D * 0.5, 0.03), 'sack', { mode: TILE_CLAMP, uv: 'keep', pos: [x + w / 2, y + 0.01 + h * 0.55, 0], color: [1.0, 0.95, 0.85] });
        else { for (let k = 0; k < 3; k++) b.add(cyl(0.035, 0.035, h * 0.8, 10), 'plastic_white', { pos: [x + 0.04 + k * 0.075, y + 0.01 + h * 0.4, 0.02], color: k === 1 ? [0.9, 0.6, 0.25] : [0.85, 0.85, 0.82] }); }
        x += w + 0.03;
      }
    }
  },
  storage_cabinet(b, { W, H, D }) {
    contactShadow(b, W, D);
    box(b, W, H - 0.04, D - 0.02, 'steel', [0, 0.04 + (H - 0.04) / 2, -0.01], { color: [0.55, 0.57, 0.62], r: 0.006, grad: [0.8, 1.05] });
    box(b, W - 0.06, 0.04, D - 0.1, 'plastic_black', [0, 0.02, -0.02], { color: TINT.black });
    for (let i = 0; i < 2; i++) {
      const dw = W / 2 - 0.012, x = (i - 0.5) * (W / 2);
      box(b, dw, H - 0.08, 0.02, 'steel', [x, 0.04 + (H - 0.04) / 2, D / 2 - 0.02], { color: [0.62, 0.64, 0.69], r: 0.004, grad: [0.85, 1.05] });
      ventStrip(b, dw * 0.6, 0.08, [x, H - 0.2, D / 2 - 0.009], { color: [0.55, 0.56, 0.6] });
      ventStrip(b, dw * 0.6, 0.08, [x, 0.25, D / 2 - 0.009], { color: [0.55, 0.56, 0.6] });
    }
    box(b, 0.02, 0.2, 0.025, 'stainless', [0.03, H * 0.52, D / 2 + 0.005], { r: 0.008, color: [1.1, 1.1, 1.14] });
    b.add(cyl(0.012, 0.012, 0.01, 12).rotateX(Math.PI / 2), 'amber', { pos: [0.03, H * 0.52 + 0.14, D / 2 + 0.005], glow: 0.2 });
    labelCard(b, [-W / 4, H - 0.08, D / 2 + 0.002], { w: 0.1, h: 0.035 });
  },

  // --------------------------------------------------------------------------------- openings
  door(b, { W, H, D }) {
    const fw = 0.06;
    // frame (reveals) in dark steel
    for (const s of [-1, 1]) box(b, fw, H, D + 0.02, 'metal_dark', [s * (W / 2 - fw / 2), H / 2, 0], { color: TINT.graphite, r: 0.004 });
    box(b, W, fw, D + 0.02, 'metal_dark', [0, H - fw / 2, 0], { color: TINT.graphite, r: 0.004 });
    // leaf
    const lw = W - 2 * fw, lh = H - fw - 0.01;
    b.add(rbox(lw, lh, 0.045, 0.004), 'door_leaf', { mode: TILE_CLAMP, uv: 'keep', pos: [0, 0.005 + lh / 2, 0], color: [0.9, 0.9, 0.92] });
    glassPanel(b, lw * 0.3, lh * 0.35, [-lw * 0.12, lh * 0.66, 0.024], { tint: [0.6, 0.7, 0.75], alpha: 1.2 });
    glassPanel(b, lw * 0.3, lh * 0.35, [-lw * 0.12, lh * 0.66, -0.024], { tint: [0.6, 0.7, 0.75], alpha: 1.2, rotY: Math.PI });
    for (const s of [-1, 1]) {
      box(b, 0.14, 0.02, 0.02, 'stainless', [lw / 2 - 0.1, 1.02, s * 0.04], { r: 0.008, color: [1.12, 1.12, 1.16] });
      box(b, 0.04, 0.12, 0.008, 'stainless', [lw / 2 - 0.05, 1.0, s * 0.026], { r: 0.003 });
    }
    box(b, lw * 0.5, 0.012, 0.03, 'metal_dark', [0, H - fw - 0.05, -0.05], { color: TINT.black });
  },
  window(b, { W, H, D, obj }) {
    const fw = 0.05;
    for (const s of [-1, 1]) box(b, fw, H, D + 0.02, 'alu', [s * (W / 2 - fw / 2), H / 2, 0], { color: [0.6, 0.6, 0.63], r: 0.004 });
    for (const y of [fw / 2, H - fw / 2]) box(b, W, fw, D + 0.02, 'alu', [0, y, 0], { color: [0.6, 0.6, 0.63], r: 0.004 });
    box(b, W + 0.06, 0.03, 0.12, 'alu', [0, -0.01, D / 2 + 0.05], { color: [0.7, 0.7, 0.72], r: 0.006 }); // sill
    box(b, 0.03, H - 2 * fw, 0.04, 'alu', [0, H / 2, 0], { color: [0.6, 0.6, 0.63] });
    // frosted glass: bright daylight painted in (emissive), blinds in front
    b.add(quad(W - 2 * fw, H - 2 * fw), 'frosted', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, -0.01], glow: 0.9, color: [1.05, 1.05, 1.08], room: true });
    b.add(quad(W - 2 * fw - 0.02, (H - 2 * fw) * 0.45), 'blinds', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H - fw - (H - 2 * fw) * 0.225, D / 2 - 0.01], color: [0.95, 0.93, 0.9] });
    box(b, W - 2 * fw, 0.04, 0.05, 'plastic_white', [0, H - fw - 0.02, D / 2 - 0.02], { color: TINT.white });
    // soft light spill on the floor below the window (painted)
    b.add(flat(W * 1.3, 1.1), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [0, -obj.elevation + 0.004, D / 2 + 0.55], color: [0.12, 0.12, 0.12], alpha: 0.5, room: true });
  },

  // --------------------------------------------------------------------------------- technical
  control_panel(b, { W, H, D }) {
    wallShadow(b, W, H, D);
    box(b, W, H, D, 'plastic_white', [0, H / 2, 0], { color: [0.82, 0.82, 0.8], r: 0.01, grad: [0.85, 1.05] });
    b.add(quad(W - 0.04, H - 0.04), 'control_face', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, D / 2 + 0.001], glow: 0.12 });
    b.add(new THREE.CircleGeometry(0.006, 10), 'amber', { pos: [W / 2 - 0.05, H - 0.05, D / 2 + 0.002], glow: 1, color: [0.3, 1.0, 0.4] });
    b.add(taperTube([[W * 0.3, 0, 0], [W * 0.3, -0.2, -D / 2 + 0.02], [W * 0.3, -0.5, -D / 2 + 0.02]], 0.012, 0.012, { radial: 6, segs: 5 }), 'plastic_black', { uv: 'keep', color: TINT.black });
  },
  ac_unit(b, { W, H, D }) {
    wallShadow(b, W, H, D, { drop: 0.05 });
    box(b, W, H, D, 'plastic_white', [0, H / 2, 0], { color: [0.9, 0.9, 0.88], r: Math.min(0.05, H * 0.2), grad: [0.8, 1.05] });
    b.add(quad(W - 0.04, H - 0.04), 'ac_face', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, D / 2 + 0.002], color: [0.95, 0.95, 0.93] });
    ventStrip(b, W - 0.08, 0.04, [0, 0.04, D / 2 - 0.03], { color: [0.5, 0.5, 0.52] });
    b.add(new THREE.CircleGeometry(0.004, 8), 'amber', { pos: [W / 2 - 0.08, H * 0.3, D / 2 + 0.003], glow: 1, color: [0.4, 0.8, 1.0] });
  },
  dehumidifier(b, { W, H, D }) {
    contactShadow(b, W, D);
    box(b, W, H - 0.03, D, 'plastic_white', [0, 0.03 + (H - 0.03) / 2, 0], { color: [0.88, 0.88, 0.86], r: 0.03, grad: [0.8, 1.05] });
    b.add(quad(W - 0.08, H * 0.35), 'grille', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H * 0.35, D / 2 + 0.001], color: [0.6, 0.6, 0.62] });
    b.add(quad(0.08, 0.03), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H - 0.07, D / 2 + 0.001], glow: 0.9 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cyl(0.018, 0.018, 0.03, 8), 'rubber', { pos: [sx * (W / 2 - 0.04), 0.015, sz * (D / 2 - 0.04)], color: TINT.black });
    box(b, W * 0.6, 0.02, 0.03, 'plastic_black', [0, H + 0.005, -D * 0.2], { color: TINT.black, r: 0.008 });
  },
  sensor(b, { W, H, D }) {
    wallShadow(b, W, H, D, { spread: 0.02, drop: 0.01 });
    box(b, W, H, D, 'plastic_white', [0, H / 2, 0], { color: [0.92, 0.92, 0.9], r: 0.01 });
    b.add(quad(W * 0.8, H * 0.55), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H * 0.58, D / 2 + 0.001], glow: 1 });
  },
  outlet(b, { W, H, D }) {
    box(b, W, H, D, 'plastic_white', [0, H / 2, 0], { color: [0.9, 0.9, 0.88], r: 0.006 });
    for (const s of [-1, 1]) {
      b.add(new THREE.CircleGeometry(Math.min(0.028, H * 0.32), 16), 'plastic_white', { pos: [s * W / 4, H / 2, D / 2 + 0.001], color: [0.72, 0.72, 0.7] });
      for (const k of [-1, 1]) b.add(new THREE.CircleGeometry(0.0035, 8), 'plastic_black', { pos: [s * W / 4 + k * 0.01, H / 2, D / 2 + 0.002], color: [0.05, 0.05, 0.05] });
    }
  },
  cable_tray(b, { W, H, D }) {
    b.add(flat(W, D), 'grille', { bucket: 'cutout', pos: [0, 0.003, 0], uvScale: [6, 6], color: [0.7, 0.7, 0.74] });
    for (const s of [-1, 1]) box(b, W, H, 0.004, 'steel', [0, H / 2, s * (D / 2 - 0.002)], { color: [0.7, 0.7, 0.74], r: 0.001 });
    for (let i = 0; i < 4; i++) b.add(cyl(0.007, 0.007, W, 6).rotateZ(Math.PI / 2), 'plastic_black', { pos: [0, 0.012, -D / 2 + 0.04 + i * 0.03], color: i === 2 ? [0.25, 0.2, 0.12] : TINT.black });
    for (let x = -W / 2 + 0.3; x < W / 2; x += 0.9) box(b, 0.02, 0.1, D, 'metal_dark', [x, 0.05, 0], { color: TINT.graphite });
    wallShadow(b, W, H, D, { spread: 0.05, drop: 0.04, strength: 0.4 });
  },
  info_board(b, { W, H, D }) {
    wallShadow(b, W, H, D, { spread: 0.05 });
    box(b, W, H, Math.max(0.012, D), 'alu', [0, H / 2, 0], { color: [0.6, 0.6, 0.63], r: 0.004 });
    b.add(quad(W - 0.03, H - 0.03), 'board', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, D / 2 + 0.002], color: [1.0, 1.0, 0.98], glow: 0.08 });
    box(b, W * 0.8, 0.02, 0.04, 'alu', [0, 0.01, D / 2 + 0.02], { color: [0.6, 0.6, 0.63] });
  },
  exit_sign(b, { W, H, D }) {
    box(b, W, H, D, 'plastic_white', [0, H / 2, 0], { color: [0.9, 0.9, 0.88], r: 0.006 });
    b.add(quad(W - 0.02, H - 0.02), 'exit_sign', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, D / 2 + 0.001], glow: 1 });
    b.add(quad(W * 1.8, H * 2.4), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, -D / 2 + 0.003], color: [0.12, 0.45, 0.25], alpha: 0.35 });
  },
  fire_extinguisher(b, { W, H, D }) {
    wallShadow(b, W * 0.8, H, D, { spread: 0.05 });
    const r = Math.min(W, D) * 0.45;
    b.add(cyl(r, r, H * 0.78, 14), 'extinguisher', { mode: TILE_REPEAT_U, uv: 'keep', uvScale: [1, 1], pos: [0, H * 0.4, 0.01], color: [1.05, 0.95, 0.95] });
    b.add(ellipsoid(r, r * 0.5, r, 12), 'extinguisher', { pos: [0, H * 0.79, 0.01], color: [1, 0.9, 0.9] });
    box(b, 0.05, 0.06, 0.03, 'plastic_black', [0, H * 0.86, 0.01], { color: TINT.black });
    b.add(taperTube([[0.02, H * 0.86, 0.02], [0.07, H * 0.7, 0.05], [0.06, H * 0.35, 0.06]], 0.008, 0.008, { radial: 5, segs: 8 }), 'plastic_black', { uv: 'keep', color: TINT.black });
    box(b, 0.06, 0.08, 0.02, 'metal_dark', [0, H * 0.6, -D / 2 + 0.01], { color: TINT.graphite });
  },

  // --------------------------------------------------------------------------------- plants
  plant_large(b, { W, H, D, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.25, ph = H * 0.3;
    potGeo(b, pr, ph);
    const r = rng(seed);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.4, hgt = ph + H * (0.25 + r() * 0.35), out = Math.min(W, D) * (0.18 + r() * 0.2);
      const tip = [Math.cos(a) * out, hgt, Math.sin(a) * out];
      b.add(taperTube([[0, ph - 0.02, 0], [tip[0] * 0.4, hgt * 0.85, tip[2] * 0.4], tip], 0.008, 0.005, { radial: 5, segs: 6 }), 'stem', { uv: 'keep', color: [0.6, 0.72, 0.45] });
      const size = H * (0.22 + r() * 0.1);
      b.add(leafCard(size, size * 0.85, { bend: 0.45, fold: 0.25, segs: 4, droop: 0.4 }), 'leaf_heart', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: tip, rot: [0.9 + r() * 0.5, -a + Math.PI / 2, 0], color: [0.85, 1.0, 0.8], jitter: 0.1 });
    }
  },
  plant_snake(b, { W, H, D, seed }) {
    contactShadow(b, W * 0.7, D * 0.7);
    const pr = Math.min(W, D) * 0.38, ph = H * 0.34;
    potGeo(b, pr, ph, { color: [0.85, 0.82, 0.78], tile: 'plastic_white' });
    strapPlant(b, [0, ph - 0.02, 0], { size: H * 0.72, leaves: 9, seed, color: [0.75, 0.95, 0.7], spread: 0.16 });
  },
  plant_fern(b, { W, H, D, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.22, ph = H * 0.42;
    potGeo(b, pr, ph, { tile: 'clay', color: [1.05, 0.8, 0.65] });
    const r = rng(seed);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3, len = Math.min(W, D) * (0.45 + r() * 0.2);
      b.add(leafCard(len, len * 0.42, { bend: 1.1, fold: 0.1, segs: 4, droop: 0.55 }), 'fern', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [0, ph - 0.01, 0], rot: [0.45 + r() * 0.4, a, 0], color: [0.9, 1.05, 0.85] });
    }
  },
};

function potGeo(b, r, h, { tile = 'plastic_black', color = [0.3, 0.3, 0.32] } = {}) {
  b.add(lathe([[0, 0], [r * 0.78, 0], [r, h * 0.94], [r * 1.05, h], [r * 0.95, h], [r * 0.92, h * 0.93], [0, h * 0.93]], 18), tile, { color, grad: [0.75, 1.05] });
  b.add(new THREE.CircleGeometry(r * 0.92, 16).rotateX(-Math.PI / 2), 'soil', { pos: [0, h * 0.9, 0], uvScale: 6, color: [0.8, 0.75, 0.7] });
}

function generic(b, { W, H, D }) {
  contactShadow(b, W, D);
  box(b, W, H, D, 'metal_dark', [0, H / 2, 0], { color: TINT.graphite, r: 0.01 });
}

export const PLANNER_TYPES = Object.keys(MODELS);
