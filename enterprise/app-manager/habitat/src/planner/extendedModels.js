import * as THREE from 'three';
import { TILE_CLAMP, TILE_REPEAT_U } from './PaintedMaterials.js';
import { rng, rbox, cyl, lathe, quad, flat, leafCard, taperTube, ellipsoid } from './geometry.js';
import { TINT, box, contactShadow, wallShadow, glassPanel, doorPanel, ventStrip, labelCard, strapPlant } from './components.js';

/**
 * Habitat Studio 4.2 — procedural models of the extended catalogue.
 *
 * Every builder receives the logical box (W × D × H, metres) and the object's props merged over the type
 * defaults (`p`). The same builder feeds the Planner AND the Showcase (parametric types), so a property
 * — blinds NONE, a black incubator, an open door — looks the same in both modes.
 *
 * Local frame: x = width (left → right seen from the room), y = up from the object's elevation,
 * z = depth with +z facing the room (for openings z spans the wall, +z = room side).
 */

// ------------------------------------------------------------------ decors → painted tile + tint
export const DECOR_PAINT = {
  black: ['plastic_black', [0.95, 0.95, 1.0]],
  white: ['plastic_white', [0.9, 0.89, 0.86]],
  anthracite: ['metal_dark', [1.3, 1.32, 1.4]],
  grey: ['plastic_white', [0.58, 0.58, 0.6]],
  oak: ['wood', [1.05, 0.95, 0.82]],
  light_oak: ['wood', [1.3, 1.2, 1.05]],
  dark_wood: ['wood', [0.52, 0.42, 0.35]],
  walnut: ['wood', [0.74, 0.56, 0.43]],
  wood: ['wood', [0.95, 0.82, 0.68]],
  steel: ['stainless', [1.0, 1.0, 1.04]],
  blue: ['plastic_white', [0.3, 0.5, 1.0]],
  terracotta: ['clay', [1.05, 0.8, 0.65]],
};
const dp = (k, fallback = 'black') => DECOR_PAINT[k] || DECOR_PAINT[fallback];
/** box in a decor */
const dbox = (b, w, h, d, decor, pos, o = {}) => { const [tile, color] = dp(decor); return box(b, w, h, d, tile, pos, { color: o.mul ? color.map((v) => v * o.mul) : color, uvScale: tile === 'wood' ? 1.4 : 1, ...o }); };
const handleColor = (decor) => (decor === 'black' || decor === 'anthracite' ? [1.1, 1.1, 1.14] : [0.3, 0.3, 0.32]);
const handleTile = (decor) => (decor === 'black' || decor === 'anthracite' ? 'stainless' : 'plastic_black');

// =================================================================================== openings
/** Door: casing both faces, leaf by style, hinge side, open / closed, sliding on a surface rail. */
function door(b, { W, H, D, p }) {
  const style = p.style || 'interior', decor = p.decor || 'white', frame = p.frame || 'white';
  const fw = 0.065, ct = 0.012; // casing width, casing projection
  const lw = W - 2 * fw + 0.01, lh = H - fw + 0.005, lt = 0.042;
  const hingeRight = p.hinge === 'right';
  const sliding = style === 'sliding';
  // reveals (jambs through the wall) + casings on both faces
  const [ft, fc] = dp(frame === 'wood' ? 'oak' : frame, 'white');
  for (const s of [-1, 1]) b.add(rbox(0.02, H, D + 0.004, 0.002), ft, { pos: [s * (W / 2 - 0.01), H / 2, 0], color: fc.map((v) => v * 0.92) });
  b.add(rbox(W, 0.02, D + 0.004, 0.002), ft, { pos: [0, H - 0.01, 0], color: fc.map((v) => v * 0.92) });
  for (const z of [D / 2 + ct / 2, -D / 2 - ct / 2]) {
    for (const s of [-1, 1]) b.add(rbox(fw, H + fw * 0.5, ct, 0.003), ft, { pos: [s * (W / 2 + fw / 2 - 0.02), (H + fw * 0.5) / 2, z], color: fc });
    b.add(rbox(W + 2 * fw - 0.04, fw, ct, 0.003), ft, { pos: [0, H + fw * 0.25, z], color: fc });
  }
  const leaf = (lb) => {
    // leaf built centred at x = 0, bottom at y = 0, faces ±lt/2
    if (style === 'glazed') {
      const st = 0.09;
      for (const s of [-1, 1]) dbox(lb, st, lh, lt, decor, [s * (lw / 2 - st / 2), lh / 2, 0], { r: 0.004 });
      dbox(lb, lw, st, lt, decor, [0, lh - st / 2, 0], { r: 0.004 }); dbox(lb, lw, st * 1.6, lt, decor, [0, st * 0.8, 0], { r: 0.004 });
      glassPanel(lb, lw - 2 * st, lh - st * 2.6, [0, st * 1.6 + (lh - st * 2.6) / 2, 0.004], { tint: [0.82, 0.92, 0.95], alpha: 1.1 });
      glassPanel(lb, lw - 2 * st, lh - st * 2.6, [0, st * 1.6 + (lh - st * 2.6) / 2, -0.004], { tint: [0.82, 0.92, 0.95], alpha: 1.1, rotY: Math.PI, edge: false });
    } else if (style === 'steel') {
      lb.add(rbox(lw, lh, lt, 0.004), 'door_leaf', { mode: TILE_CLAMP, uv: 'keep', pos: [0, lh / 2, 0], color: dp(decor, 'grey')[1].map((v) => v * 1.4) });
      for (const z of [1, -1]) glassPanel(lb, lw * 0.3, lh * 0.35, [-lw * 0.12, lh * 0.66, z * (lt / 2 + 0.002)], { tint: [0.6, 0.7, 0.75], alpha: 1.2, rotY: z < 0 ? Math.PI : 0 });
    } else {
      dbox(lb, lw, lh, lt, decor, [0, lh / 2, 0], { r: 0.004, grad: [0.85, 1.05] });
      if (style === 'interior' || sliding) {
        // two recessed panels (shadow lines) on both faces
        for (const z of [1, -1]) for (const [y0, y1] of [[0.12, lh * 0.45], [lh * 0.52, lh - 0.12]]) {
          const pw = lw - 0.2, ph = y1 - y0, zz = z * (lt / 2 + 0.0008);
          for (const s of [-1, 1]) lb.add(rbox(0.006, ph, 0.002), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', uvScale: [0, 0.5], uvOffset: [0.5, 0.5], pos: [s * pw / 2, y0 + ph / 2, zz], alpha: 0.4 });
          for (const y of [y0, y1]) lb.add(rbox(pw, 0.006, 0.002), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', uvScale: [0, 0.5], uvOffset: [0.5, 0.5], pos: [0, y, zz], alpha: 0.4 });
        }
      }
      if (style === 'solid') for (const z of [1, -1]) box(lb, lw - 0.04, 0.22, 0.003, 'stainless', [0, 0.14, z * (lt / 2 + 0.0015)], { color: [1.05, 1.05, 1.1], r: 0.001 }); // kick plates
    }
    // handles (lever) on the latch side, both faces — sliding doors get a flush pull
    const hx = hingeRight ? -lw / 2 + 0.07 : lw / 2 - 0.07;
    for (const z of [1, -1]) {
      if (sliding) { box(lb, 0.03, 0.26, 0.012, handleTile(decor), [hx, 1.0, z * (lt / 2 + 0.006)], { color: handleColor(decor), r: 0.005 }); continue; }
      box(lb, 0.05, 0.14, 0.008, handleTile(decor), [hx, 1.0, z * (lt / 2 + 0.004)], { color: handleColor(decor), r: 0.003 });
      box(lb, 0.13, 0.02, 0.02, handleTile(decor), [hx + (hingeRight ? 0.05 : -0.05), 1.03, z * (lt / 2 + 0.03)], { color: handleColor(decor), r: 0.008 });
    }
  };
  if (sliding) {
    // surface-mounted barn door on the room face: rail over the opening, leaf slides away from the hinge side
    const slide = p.open ? (hingeRight ? -1 : 1) * (lw - 0.08) : 0;
    box(b, 2 * W + 0.1, 0.05, 0.03, 'metal_dark', [slide / 2, H + 0.08, D / 2 + ct + 0.03], { color: [0.4, 0.4, 0.43], r: 0.006 });
    b.push([slide, 0, D / 2 + ct + 0.035]); leaf(b); b.pop();
    return;
  }
  // hinged leaf: pivot at the hinge edge, opens into the room (+z)
  const px = hingeRight ? lw / 2 : -lw / 2;
  const ang = p.open ? (hingeRight ? 1 : -1) * 1.45 : 0;
  b.push([px, 0.004, D / 2 - lt / 2 - 0.004], ang);
  b.push([-px, 0, 0]); leaf(b); b.pop();
  b.pop();
  // hinges
  for (const y of [0.25, lh - 0.25]) b.add(cyl(0.008, 0.008, 0.1, 8), 'stainless', { pos: [px + (hingeRight ? 0.004 : -0.004), y, D / 2 - 0.005], color: [0.9, 0.9, 0.94] });
}

/** Window: frame colour, glass clear / frosted / tinted, blinds none / venetian / roller (inside / outside). */
function windowModel(b, { W, H, D, p, obj }) {
  const [ft, fc] = dp(p.frame === 'wood' ? 'oak' : p.frame || 'white', 'white');
  const fw = 0.06, iw = W - 2 * fw, ih = H - 2 * fw;
  // frame ring through the wall
  for (const s of [-1, 1]) b.add(rbox(fw, H, 0.08, 0.004), ft, { pos: [s * (W / 2 - fw / 2), H / 2, -0.01], color: fc });
  for (const y of [fw / 2, H - fw / 2]) b.add(rbox(W, fw, 0.08, 0.004), ft, { pos: [0, y, -0.01], color: fc });
  if (W > 1.05) b.add(rbox(0.05, ih, 0.07, 0.003), ft, { pos: [0, H / 2, -0.01], color: fc });
  // reveals (light plaster) and interior sill board
  for (const s of [-1, 1]) b.add(rbox(0.004, H, D / 2 - 0.03), 'plastic_white', { pos: [s * (W / 2 - 0.002), H / 2, D / 4 + 0.015], color: [0.78, 0.77, 0.74] });
  b.add(rbox(W + 0.08, 0.025, D / 2 + 0.07, 0.004), p.frame === 'wood' ? 'wood' : 'plastic_white', { pos: [0, -0.0125, D / 4 + 0.035], color: p.frame === 'wood' ? [1.0, 0.9, 0.78] : [0.95, 0.94, 0.91] });
  box(b, W + 0.06, 0.02, 0.06, 'alu', [0, -0.01, -D / 2 - 0.02], { color: [0.55, 0.55, 0.58], r: 0.004 }); // exterior sill
  // glass + what is behind it (daylight painted in — the wall hole otherwise shows the void)
  const glass = p.glass || 'clear';
  if (glass === 'frosted') b.add(quad(iw, ih), 'frosted', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, -0.012], glow: 0.9, color: [1.05, 1.05, 1.08], room: true });
  else {
    b.add(quad(iw, ih), 'frosted', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, -D / 2 - 0.06], glow: glass === 'tinted' ? 0.35 : 0.8, color: glass === 'tinted' ? [0.35, 0.4, 0.45] : [0.72, 0.84, 1.0], room: true });
    glassPanel(b, iw, ih, [0, H / 2, -0.01], { tint: glass === 'tinted' ? [0.45, 0.5, 0.55] : [0.9, 0.96, 1.0], alpha: glass === 'tinted' ? 1.6 : 0.8 });
  }
  // blinds — only when a type is chosen AND enabled (NONE never draws anything)
  const kind = p.blinds || 'none';
  const covered = kind !== 'none' && p.blindsEnabled !== false ? ih * (1 - Math.min(100, Math.max(0, p.blindsOpen ?? 50)) / 100) : 0;
  const outside = p.blindsMount === 'outside';
  const bz = outside ? -D / 2 - 0.035 : D / 2 + 0.035;
  const top = p.blindsPos !== 'bottom';
  if (kind === 'venetian' && p.blindsEnabled !== false) {
    const bw = iw + (outside ? 0.06 : 0.04);
    box(b, bw + 0.02, 0.045, 0.05, outside ? 'alu' : 'plastic_white', [0, H - fw - 0.0225 + (outside ? fw : 0), bz], { color: outside ? [0.6, 0.6, 0.62] : [0.92, 0.91, 0.88], r: 0.006 });
    const pitch = 0.024, n = Math.max(0, Math.floor(covered / pitch));
    const ang = ((p.blindsAngle ?? 0) * Math.PI) / 180;
    const y0 = top ? H - fw - 0.05 : fw + 0.02 + covered;
    for (let i = 0; i < n; i++) {
      const y = top ? y0 - i * pitch : y0 - i * pitch;
      b.add(rbox(bw, 0.0015, 0.025, 0.0006).rotateX(ang), 'plastic_white', { pos: [0, y, bz], color: outside ? [0.62, 0.62, 0.64] : [0.95, 0.94, 0.9] });
    }
    if (n) box(b, bw, 0.012, 0.028, 'alu', [0, (top ? y0 - n * pitch : y0 - n * pitch), bz], { color: [0.75, 0.75, 0.77], r: 0.003 });
    for (const s of [-1, 1]) if (n) b.add(rbox(0.003, n * pitch, 0.003), 'plastic_white', { pos: [s * bw * 0.35, y0 - (n * pitch) / 2, bz + 0.014], color: [0.8, 0.79, 0.76] });
  } else if (kind === 'roller' && p.blindsEnabled !== false) {
    const bw = iw + 0.04;
    b.add(cyl(0.035, 0.035, bw + 0.04, 14).rotateZ(Math.PI / 2), 'plastic_white', { pos: [0, top ? H - fw - 0.035 + (outside ? fw : 0) : fw + 0.035, bz], color: outside ? [0.55, 0.55, 0.57] : [0.9, 0.89, 0.86] });
    if (covered > 0.01) {
      const yc = top ? H - fw - 0.035 - covered / 2 : fw + 0.035 + covered / 2;
      b.add(quad(bw, covered), 'paper', { pos: [0, yc, bz + (outside ? -0.03 : 0.03)], color: outside ? [0.3, 0.3, 0.32] : [0.78, 0.76, 0.72], uvScale: 2, rot: outside ? [0, Math.PI, 0] : undefined });
      b.add(quad(bw, covered), 'paper', { pos: [0, yc, bz + (outside ? -0.029 : 0.029)], color: [0.5, 0.5, 0.5], uvScale: 2, rot: outside ? undefined : [0, Math.PI, 0] });
      box(b, bw, 0.02, 0.012, 'alu', [0, top ? H - fw - 0.035 - covered : fw + 0.035 + covered, bz + (outside ? -0.03 : 0.03)], { color: [0.6, 0.6, 0.62], r: 0.004 });
    }
  }
  // daylight spill on the floor (fades with closed blinds / tinted glass)
  const light = (1 - covered / Math.max(0.01, ih) * 0.8) * (glass === 'tinted' ? 0.4 : 1);
  if (light > 0.1) b.add(flat(W * 1.3, 1.1), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [0, -obj.elevation + 0.004, D / 2 + 0.55], color: [0.12 * light, 0.12 * light, 0.12 * light], alpha: 0.5, room: true });
}

// =================================================================================== furniture
function legs(b, pts, h, frame, { s = 0.045, round = false } = {}) {
  const [tile, color] = dp(frame, 'black');
  for (const [x, z] of pts) {
    if (round) b.add(cyl(s / 2, s / 2, h, 10), tile, { pos: [x, h / 2, z], color });
    else box(b, s, h, s, tile, [x, h / 2, z], { color, r: 0.004, grad: [0.75, 1.05] });
  }
}
function table(b, { W, H, D, p }) {
  contactShadow(b, W, D, { spread: 0.08, strength: 0.6 });
  const tt = 0.03, frame = p.frame || 'black', tech = p.shelf || W >= 1.55 && H >= 0.85;
  const lx = W / 2 - 0.05, lz = D / 2 - 0.05;
  const pts = [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]];
  if (W > 2.0) pts.push([0, -lz], [0, lz]);
  legs(b, pts, H - tt, frame, { s: tech ? 0.05 : 0.04 });
  const [ftile, fcol] = dp(frame, 'black');
  box(b, W - 0.1, 0.06, 0.02, ftile, [0, H - tt - 0.03, -lz], { color: fcol, r: 0.003 }); // apron
  for (const s of [-1, 1]) box(b, 0.02, 0.06, D - 0.1, ftile, [s * lx, H - tt - 0.03, 0], { color: fcol, r: 0.003 });
  if (p.shelf) dbox(b, W - 0.12, 0.02, D - 0.12, p.decor, [0, 0.16, 0], { mul: 0.85 });
  dbox(b, W, tt, D, p.decor || 'oak', [0, H - tt / 2, 0], { r: 0.005 });
  b.add(rbox(W - 0.01, 0.002, 0.002), 'alu', { pos: [0, H - 0.001, D / 2], color: p.decor === 'black' ? [0.35, 0.35, 0.37] : [1.2, 1.15, 1.05] });
}
/** Corner (L) table: arm A runs along the width at the back (depth armA), arm B along the depth on the left (width armB). */
function tableCorner(b, { W, H, D, p }) {
  const a = Math.min(D - 0.1, Math.max(0.3, p.armA ?? 0.7)), c = Math.min(W - 0.1, Math.max(0.3, p.armB ?? 0.6));
  const tt = 0.03, frame = p.frame || 'black';
  b.add(flat(W, a), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [0, 0.003, -D / 2 + a / 2], alpha: 0.5 });
  b.add(flat(c, D - a), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [-W / 2 + c / 2, 0.003, a / 2], alpha: 0.5 });
  const x0 = -W / 2 + 0.05, x1 = W / 2 - 0.05, z0 = -D / 2 + 0.05;
  legs(b, [[x0, z0], [x1, z0], [x1, -D / 2 + a - 0.05], [x0, D / 2 - 0.05], [-W / 2 + c - 0.05, D / 2 - 0.05]], H - tt, frame, { s: 0.045 });
  dbox(b, W, tt, a, p.decor || 'oak', [0, H - tt / 2, -D / 2 + a / 2], { r: 0.005 });
  dbox(b, c, tt, D - a + 0.001, p.decor || 'oak', [-W / 2 + c / 2, H - tt / 2, a / 2], { r: 0.005 });
  const [ftile, fcol] = dp(frame, 'black');
  box(b, W - 0.1, 0.06, 0.02, ftile, [0, H - tt - 0.03, z0], { color: fcol, r: 0.003 });
  box(b, 0.02, 0.06, D - 0.1, ftile, [x0, H - tt - 0.03, 0], { color: fcol, r: 0.003 });
}
function desk(b, { W, H, D, p }) {
  contactShadow(b, W, D, { spread: 0.08, strength: 0.6 });
  const tt = 0.03, cw = Math.min(0.45, W * 0.35), side = p.side === 'left' ? -1 : 1;
  const cx = side * (W / 2 - cw / 2);
  // pedestal with 3 drawers
  dbox(b, cw, H - tt, D - 0.03, p.decor || 'white', [cx, (H - tt) / 2, -0.015], { r: 0.004, grad: [0.8, 1.05] });
  for (let i = 0; i < 3; i++) {
    const dh = (H - tt - 0.08) / 3, y = 0.05 + dh * i + dh / 2;
    dbox(b, cw - 0.02, dh - 0.01, 0.018, p.decor || 'white', [cx, y, D / 2 - 0.02], { r: 0.003, mul: 1.05 });
    box(b, 0.12, 0.012, 0.02, handleTile(p.decor), [cx, y + dh * 0.28, D / 2 + 0.002], { color: handleColor(p.decor), r: 0.005 });
  }
  legs(b, [[-side * (W / 2 - 0.04), -D / 2 + 0.05], [-side * (W / 2 - 0.04), D / 2 - 0.05]], H - tt, p.frame || p.decor || 'white', { s: 0.04 });
  dbox(b, W, tt, D, p.decor || 'white', [0, H - tt / 2, 0], { r: 0.005 });
  dbox(b, W - cw - 0.04, 0.3, 0.015, p.decor || 'white', [-side * cw / 2, H - tt - 0.2, -D / 2 + 0.05], { mul: 0.9 }); // modesty panel
}
function shelf(b, { W, H, D, p }) {
  const n = Math.max(1, Math.round(p.tiers || 1)), bt = Math.min(0.03, Math.max(0.018, H / Math.max(1, n) * 0.2));
  wallShadow(b, W, Math.max(H, 0.1), D, { spread: 0.05, strength: 0.45 });
  const gap = n > 1 ? (H - bt) / (n - 1) : 0;
  const br = p.brackets || 'black';
  if (n > 2 || (n === 2 && H > 0.3)) { // vertical wall rails
    for (const s of [-1, 1]) box(b, 0.02, H + 0.04, 0.012, br === 'hidden' ? 'metal_dark' : dp(br)[0], [s * (W / 2 - 0.12), H / 2, -D / 2 + 0.006], { color: br === 'hidden' ? [0.9, 0.9, 0.95] : dp(br)[1], r: 0.003 });
  }
  for (let i = 0; i < n; i++) {
    const y = i * gap;
    dbox(b, W, bt, D, p.decor || 'oak', [0, y + bt / 2, 0], { r: 0.003 });
    if (br !== 'hidden') for (const s of [-1, 1]) {
      const [tile, color] = dp(br);
      box(b, 0.012, 0.012, D * 0.8, tile, [s * (W / 2 - 0.12), y - 0.006, -D / 2 + D * 0.4], { color, r: 0.002 });
      box(b, 0.012, Math.min(0.14, D * 0.6), 0.012, tile, [s * (W / 2 - 0.12), y - Math.min(0.14, D * 0.6) / 2, -D / 2 + 0.006], { color, r: 0.002 });
    }
  }
  if (p.led) {
    b.add(rbox(W - 0.1, 0.006, 0.012), 'amber', { pos: [0, -0.004, D / 2 - 0.04], glow: 0.9, color: [1, 0.85, 0.6] });
    b.add(flat(W * 0.95, D * 1.6), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [0, -0.5, D * 0.3], color: [0.22, 0.2, 0.16], alpha: 0.6, room: true });
  }
}
function cabinet(b, { W, H, D, p, t }) {
  const mounted = t.placement === 'mounted';
  if (mounted) wallShadow(b, W, H, D, { spread: 0.06 }); else contactShadow(b, W, D);
  const decor = p.decor || 'white', plinth = mounted ? 0 : 0.06;
  if (plinth) box(b, W - 0.04, plinth, D - 0.06, 'plastic_black', [0, plinth / 2, -0.02], { color: [0.4, 0.4, 0.42] });
  dbox(b, W, H - plinth, D - 0.02, decor, [0, plinth + (H - plinth) / 2, -0.01], { r: 0.005, grad: [0.8, 1.05] });
  const n = Math.max(1, Math.min(4, p.doors || (W > 0.7 ? 2 : 1))), dw = (W - 0.01) / n - 0.004;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.005 + dw / 2 + i * (dw + 0.004);
    const [tile, color] = dp(decor);
    doorPanel(b, dw, H - plinth - 0.01, [x, plinth + (H - plinth) / 2, D / 2 - 0.01], { tile, color: color.map((v) => v * 1.04), handle: i % 2 ? 'left' : 'right', handleLen: Math.min(0.3, H * 0.25) });
    if (p.vented) { ventStrip(b, dw * 0.6, 0.08, [x, H - 0.15, D / 2 + 0.002], {}); ventStrip(b, dw * 0.6, 0.08, [x, plinth + 0.15, D / 2 + 0.002], {}); }
  }
  if (p.vented) labelCard(b, [W / 2 - 0.08, H - 0.05, D / 2 + 0.004], { w: 0.08 });
}
function picture(b, { W, H, D, p }) {
  wallShadow(b, W, H, D, { spread: 0.03, drop: 0.015, strength: 0.4 });
  dbox(b, W, H, D, p.decor || 'black', [0, H / 2, 0], { r: 0.003 });
  b.add(quad(W - 0.1, H - 0.1), 'rock_warm', { pos: [0, H / 2, D / 2 + 0.001], color: [1.0, 0.95, 0.85], uvScale: 1.5 });
  b.add(quad(W * 0.5, H * 0.5), 'leaf_monstera', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, D / 2 + 0.002], color: [0.8, 0.95, 0.75] });
}
function clock(b, { W, H, D, p }) {
  const r = Math.min(W, H) / 2;
  b.add(cyl(r, r, D, 28).rotateX(Math.PI / 2), dp(p.decor)[0], { pos: [0, H / 2, 0], color: dp(p.decor)[1] });
  b.add(new THREE.CircleGeometry(r * 0.9, 28), 'plastic_white', { pos: [0, H / 2, D / 2 + 0.001], color: p.decor === 'white' ? [0.95, 0.95, 0.93] : [0.12, 0.12, 0.13] });
  const hand = p.decor === 'white' ? [0.1, 0.1, 0.1] : [1.1, 1.1, 1.1];
  box(b, 0.008, r * 0.55, 0.003, 'plastic_black', [0, H / 2 + r * 0.27, D / 2 + 0.003], { color: hand, r: 0.001 });
  const a = 2.1; // minute hand (10:10 look)
  b.add(rbox(0.006, r * 0.75, 0.003).rotateZ(-a), 'plastic_black', { pos: [Math.sin(a) * r * 0.37, H / 2 + Math.cos(a) * r * 0.37, D / 2 + 0.004], color: [1, 0.55, 0.2] });
}

// =================================================================================== plants
const POT = { black: ['plastic_black', [0.45, 0.45, 0.48]], anthracite: ['metal_dark', [1.2, 1.22, 1.3]], white: ['plastic_white', [0.95, 0.94, 0.9]], terracotta: ['clay', [1.05, 0.8, 0.65]] };
function pot(b, r, h, color = 'black', { hanging = false } = {}) {
  const [tile, c] = POT[color] || POT.black;
  b.add(lathe([[0, 0], [r * 0.78, 0], [r, h * 0.94], [r * 1.05, h], [r * 0.95, h], [r * 0.92, h * 0.93], [0, h * 0.93]], 20), tile, { color: c, grad: [0.72, 1.05] });
  b.add(new THREE.CircleGeometry(r * 0.92, 16).rotateX(-Math.PI / 2), 'soil', { pos: [0, h * 0.9, 0], uvScale: 6, color: [0.8, 0.75, 0.7] });
  if (hanging) for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; b.add(taperTube([[Math.cos(a) * r, h, Math.sin(a) * r], [0, h + r * 3, 0]], 0.002, 0.002, { radial: 3, segs: 2 }), 'plastic_black', { uv: 'keep', color: [0.3, 0.3, 0.3] }); }
}
function leaves(b, n, seed, base, { minH, maxH, out, size, tile = 'leaf_heart', color = [0.85, 1.0, 0.8], bend = 0.45, droop = 0.4, stem = true, aspect = 0.85, tilt = 0.9 }) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, hgt = base + minH + r() * (maxH - minH), o = out * (0.5 + r() * 0.6);
    const tip = [Math.cos(a) * o, hgt, Math.sin(a) * o];
    if (stem) b.add(taperTube([[0, base - 0.01, 0], [tip[0] * 0.35, hgt * 0.8, tip[2] * 0.35], tip], 0.007, 0.004, { radial: 5, segs: 5 }), 'stem', { uv: 'keep', color: [0.6, 0.72, 0.45] });
    const s = size * (0.75 + r() * 0.5);
    b.add(leafCard(s, s * aspect, { bend, fold: 0.2, segs: 4, droop }), tile, { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: tip, rot: [tilt + r() * 0.5, -a + Math.PI / 2, 0], color, jitter: 0.1 });
  }
}
const PLANTS = {
  plant_monstera(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.24, ph = H * 0.28; pot(b, pr, ph, p.pot);
    leaves(b, 9, seed, ph, { minH: H * 0.25, maxH: H * 0.68, out: Math.min(W, D) * 0.42, size: H * 0.36, tile: 'leaf_monstera', color: [0.85, 1.0, 0.82], aspect: 0.9 });
  },
  plant_pothos(b, { W, H, D, p, seed }) {
    const pr = Math.min(W, D) * 0.28, ph = H * 0.42; pot(b, pr, ph, p.pot);
    contactShadow(b, W * 0.5, D * 0.5);
    const r = rng(seed);
    for (let i = 0; i < 7; i++) { // trailing vines over the rim
      const a = (i / 7) * Math.PI * 2 + r() * 0.4, len = H * (0.35 + r() * 0.4);
      const pts = []; for (let k = 0; k <= 5; k++) { const t = k / 5; pts.push([Math.cos(a) * (pr + t * 0.12), ph + 0.02 - t * t * len, Math.sin(a) * (pr + t * 0.12)]); }
      b.add(taperTube(pts, 0.004, 0.003, { radial: 4, segs: 8 }), 'stem', { uv: 'keep', color: [0.55, 0.7, 0.4] });
      for (let k = 1; k <= 5; k++) b.add(leafCard(0.07, 0.06, { bend: 0.3, fold: 0.2, segs: 3 }), 'leaf_heart', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: pts[k], rot: [1.2, -a + Math.PI / 2 + (k % 2 ? 0.6 : -0.6), 0], color: [0.95, 1.1, 0.7] });
    }
    leaves(b, 8, seed + 3, ph, { minH: 0.02, maxH: H * 0.3, out: pr * 0.9, size: H * 0.16, color: [0.95, 1.1, 0.7] });
  },
  plant_philodendron(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.25, ph = H * 0.32; pot(b, pr, ph, p.pot);
    leaves(b, 11, seed, ph, { minH: H * 0.2, maxH: H * 0.6, out: Math.min(W, D) * 0.38, size: H * 0.28 });
  },
  plant_ficus(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.5, D * 0.5);
    const pr = Math.min(W, D) * 0.22, ph = H * 0.2; pot(b, pr, ph, p.pot);
    b.add(taperTube([[0, ph - 0.02, 0], [0.02, H * 0.45, 0.01], [-0.01, H * 0.7, 0]], 0.025, 0.012, { radial: 7, segs: 6 }), 'bark', { uv: 'keep', color: [0.8, 0.7, 0.6] });
    const r = rng(seed);
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, y = H * (0.45 + r() * 0.5), o = Math.min(W, D) * (0.1 + r() * 0.35) * (1 - (y / H - 0.45));
      b.add(leafCard(H * 0.12, H * 0.09, { bend: 0.3, fold: 0.25, segs: 3, droop: 0.2 }), 'leaf_oval', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [Math.cos(a) * o, y, Math.sin(a) * o], rot: [0.5 + r() * 0.8, -a + Math.PI / 2, 0], color: [0.75, 0.95, 0.7], jitter: 0.1 });
    }
  },
  plant_palm(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.5, D * 0.5);
    const pr = Math.min(W, D) * 0.2, ph = H * 0.22; pot(b, pr, ph, p.pot);
    const r = rng(seed);
    for (let s = 0; s < 3; s++) {
      const sx = (r() - 0.5) * 0.08, sz = (r() - 0.5) * 0.08, top = H * (0.55 + r() * 0.2);
      b.add(taperTube([[sx, ph - 0.02, sz], [sx * 2, top, sz * 2]], 0.012, 0.008, { radial: 5, segs: 4 }), 'stem', { uv: 'keep', color: [0.7, 0.72, 0.5] });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + s, len = H * (0.3 + r() * 0.12);
        b.add(leafCard(len, len * 0.5, { bend: 1.0, fold: 0.1, segs: 5, droop: 0.7 }), 'leaf_palm', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [sx * 2, top, sz * 2], rot: [0.3 + r() * 0.3, a, 0], color: [0.85, 1.0, 0.75] });
      }
    }
  },
  plant_fern_small(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.25, ph = H * 0.42; pot(b, pr, ph, p.pot);
    const r = rng(seed);
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + r() * 0.3, len = Math.min(W, D) * (0.45 + r() * 0.2);
      b.add(leafCard(len, len * 0.4, { bend: 1.1, fold: 0.1, segs: 4, droop: 0.6 }), 'fern', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [0, ph - 0.01, 0], rot: [0.4 + r() * 0.4, a, 0], color: [0.9, 1.05, 0.85] });
    }
  },
  plant_sansevieria(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.7, D * 0.7);
    const pr = Math.min(W, D) * 0.4, ph = H * 0.34; pot(b, pr, ph, p.pot);
    strapPlant(b, [0, ph - 0.02, 0], { size: H * 0.7, leaves: 9, seed, color: [0.75, 0.95, 0.7], spread: 0.14 });
  },
  plant_table(b, { W, H, D, p, seed }) {
    const pr = Math.min(W, D) * 0.4, ph = H * 0.45; pot(b, pr, ph, p.pot);
    contactShadow(b, W * 0.8, D * 0.8, { spread: 0.02 });
    leaves(b, 8, seed, ph, { minH: 0.02, maxH: H * 0.45, out: pr * 0.9, size: H * 0.35, tile: 'leaf_oval', color: [0.8, 1.0, 0.75], droop: 0.2 });
  },
  // 4.1 plant types — now procedural with pot colour (props.pot)
  plant_large(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.25, ph = H * 0.3; pot(b, pr, ph, p.pot || 'black');
    leaves(b, 11, seed, ph, { minH: H * 0.25, maxH: H * 0.6, out: Math.min(W, D) * 0.38, size: H * 0.27 });
  },
  plant_snake(b, ctx) { PLANTS.plant_sansevieria(b, { ...ctx, p: { pot: 'white', ...ctx.p } }); },
  plant_fern(b, { W, H, D, p, seed }) {
    contactShadow(b, W * 0.6, D * 0.6);
    const pr = Math.min(W, D) * 0.22, ph = H * 0.42; pot(b, pr, ph, p.pot || 'terracotta');
    const r = rng(seed);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + r() * 0.3, len = Math.min(W, D) * (0.45 + r() * 0.2);
      b.add(leafCard(len, len * 0.42, { bend: 1.1, fold: 0.1, segs: 4, droop: 0.55 }), 'fern', { bucket: 'cutout', mode: TILE_CLAMP, uv: 'keep', pos: [0, ph - 0.01, 0], rot: [0.45 + r() * 0.4, a, 0], color: [0.9, 1.05, 0.85] });
    }
  },
};

// =================================================================================== breeding
function appliance(b, W, H, D, color) {
  const black = color === 'black', steel = color === 'steel';
  const tile = black ? 'plastic_black' : steel ? 'stainless' : 'plastic_white';
  const c = black ? [0.55, 0.55, 0.58] : steel ? [0.95, 0.96, 1.0] : [0.9, 0.9, 0.88];
  box(b, W, H - 0.04, D, tile, [0, 0.04 + (H - 0.04) / 2, 0], { color: c, r: 0.012, grad: [0.78, 1.05] });
  box(b, W - 0.06, 0.04, D - 0.08, 'plastic_black', [0, 0.02, 0], { color: [0.3, 0.3, 0.32] });
  return { tile, c, black };
}
function incubator(b, { W, H, D, p, obj, occupied, lit }) {
  contactShadow(b, W, D);
  const { tile, c, black } = appliance(b, W, H, D, p.color || 'white');
  const dh = H - 0.3, dy = 0.08 + dh / 2;
  b.add(quad(W - 0.1, dh), 'incubator_interior', { mode: TILE_CLAMP, uv: 'keep', pos: [0, dy, D / 2 - 0.012], glow: lit ? 0.55 : 0.05, color: lit ? [1.1, 1.0, 0.9] : [0.5, 0.5, 0.5] });
  glassPanel(b, W - 0.08, dh + 0.02, [0, dy, D / 2 + 0.004], { tint: black ? [0.7, 0.75, 0.78] : [0.9, 0.95, 0.95], alpha: black ? 1.3 : 1 });
  box(b, W - 0.04, 0.03, 0.02, tile, [0, dy + dh / 2 + 0.02, D / 2], { color: c });
  box(b, 0.02, dh * 0.4, 0.03, black ? 'stainless' : 'stainless', [W / 2 - 0.06, dy, D / 2 + 0.02], { r: 0.008, color: black ? [1.2, 1.1, 0.9] : [1, 1, 1] });
  box(b, W - 0.1, 0.13, 0.01, 'plastic_black', [0, H - 0.1, D / 2 + 0.002], { color: [0.12, 0.12, 0.13], r: 0.004 });
  b.add(quad(0.12, 0.06), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [-W / 2 + 0.14, H - 0.1, D / 2 + 0.0085], glow: 0.9 });
  b.add(new THREE.CircleGeometry(0.005, 10), 'amber', { pos: [W / 2 - 0.08, H - 0.1, D / 2 + 0.009], glow: 1, color: [1, 0.58, 0.18] });
  if (black) b.add(rbox(W - 0.02, 0.004, 0.003), 'amber', { pos: [0, H - 0.03, D / 2 + 0.002], glow: 0.6, color: [1, 0.6, 0.25] }); // premium accent line
  labelCard(b, [0, H - 0.2, D / 2 + 0.004], { w: 0.09, status: null, dim: !occupied });
}
function wintering(b, { W, H, D, p }) {
  contactShadow(b, W, D);
  const { tile, c, black } = appliance(b, W, H, D, p.color || 'black');
  const dh = H - 0.26, dy = 0.08 + dh / 2;
  if (p.glass !== false) {
    b.add(quad(W - 0.1, dh), 'incubator_interior', { mode: TILE_CLAMP, uv: 'keep', pos: [0, dy, D / 2 - 0.012], glow: 0.18, color: [0.55, 0.62, 0.75] }); // cool, dim interior
    glassPanel(b, W - 0.08, dh + 0.02, [0, dy, D / 2 + 0.004], { tint: [0.6, 0.66, 0.72], alpha: 1.4 });
  } else doorPanel(b, W - 0.04, dh + 0.02, [0, dy, D / 2 - 0.005], { tile, color: c.map((v) => v * 1.05), handle: 'right', handleLen: 0.4 });
  box(b, 0.022, dh * 0.5, 0.03, 'stainless', [W / 2 - 0.06, dy, D / 2 + 0.022], { r: 0.008, color: black ? [1.2, 1.1, 0.9] : [1, 1, 1] });
  box(b, W - 0.08, 0.12, 0.01, 'plastic_black', [0, H - 0.09, D / 2 + 0.002], { color: [0.1, 0.1, 0.11], r: 0.004 });
  b.add(quad(0.14, 0.05), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H - 0.09, D / 2 + 0.008], glow: 0.9, color: [0.6, 0.85, 1.1] });
  if (black) b.add(rbox(W - 0.02, 0.004, 0.003), 'amber', { pos: [0, H - 0.025, D / 2 + 0.002], glow: 0.6, color: [0.6, 0.8, 1.0] });
  ventStrip(b, W * 0.6, 0.05, [0, 0.07, D / 2 + 0.003], { color: [0.4, 0.4, 0.42] });
}
function fridge(b, { W, H, D, p }) {
  contactShadow(b, W, D);
  const { tile, c, black } = appliance(b, W, H, D, p.color || 'white');
  const split = p.freezer ? H * 0.38 : 0;
  const doors = p.freezer ? [[0.06, split - 0.02], [split + 0.01, H - split - 0.03]] : [[0.06, H - 0.08]];
  for (const [y, h] of doors) {
    box(b, W - 0.01, h, 0.03, tile, [0, y + h / 2, D / 2 - 0.005], { color: c.map((v) => v * 1.05), r: 0.01, grad: [0.85, 1.05] });
    box(b, 0.02, Math.min(0.35, h * 0.5), 0.03, black ? 'stainless' : 'plastic_black', [W / 2 - 0.05, y + h - Math.min(0.35, h * 0.5) / 2 - 0.05, D / 2 + 0.025], { r: 0.008, color: black ? [1.1, 1.1, 1.14] : [0.3, 0.3, 0.32] });
  }
  b.add(quad(0.08, 0.03), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H - 0.06, D / 2 + 0.012], glow: 0.9, color: [0.6, 0.85, 1.1] });
}

// =================================================================================== technical devices
const HOUSING = { white: ['plastic_white', [0.9, 0.9, 0.88]], black: ['plastic_black', [0.5, 0.5, 0.53]], anthracite: ['metal_dark', [1.2, 1.22, 1.3]], grey: ['plastic_white', [0.55, 0.56, 0.58]], blue: ['plastic_white', [0.3, 0.5, 1.0]] };
const hs = (c, d = 'white') => HOUSING[c] || HOUSING[d];
const pipeStub = (b, pos, axis = 'x', r = 0.012, len = 0.04, color = [0.85, 0.85, 0.82]) => {
  const g = cyl(r, r, len, 10); if (axis === 'x') g.rotateZ(Math.PI / 2); if (axis === 'z') g.rotateX(Math.PI / 2);
  b.add(g, 'plastic_white', { pos, color });
};
function tank(b, { W, H, D, p }) {
  contactShadow(b, W, D, { spread: 0.05 });
  const [tile, c] = hs(p.color, p.shape === 'barrel' ? 'blue' : 'white');
  if (p.shape === 'box') {
    box(b, W, H, D, tile, [0, H / 2, 0], { color: c, r: 0.03, grad: [0.75, 1.05] });
    box(b, W * 0.3, 0.02, D * 0.3, tile, [W * 0.2, H + 0.01, 0], { color: c.map((v) => v * 1.2), r: 0.008 });
    b.add(rbox(0.02, H * 0.8, 0.004), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [-W / 2 + 0.06, H * 0.45, D / 2 + 0.002], color: [0.6, 0.8, 1.0], alpha: 1.5 }); // level window
  } else {
    const r = Math.min(W, D) / 2;
    const prof = p.shape === 'barrel' ? [[0, 0], [r * 0.9, 0], [r, 0.05], [r, H * 0.3], [r * 0.97, H * 0.35], [r, H * 0.4], [r, H * 0.95], [r * 0.9, H], [0, H]] : [[0, 0], [r * 0.95, 0], [r, 0.04], [r, H - r * 0.4], [r * 0.6, H - 0.02], [0, H]];
    b.add(lathe(prof, 22), tile, { color: c, grad: [0.72, 1.05] });
    b.add(cyl(0.03, 0.03, 0.03, 12), tile, { pos: [0, H + 0.01, 0], color: c.map((v) => v * 0.8) });
  }
  pipeStub(b, [W * 0.3, 0.06, D / 2], 'z', 0.012, 0.05);
  labelCard(b, [0, H * 0.7, Math.min(W, D) / 2 + 0.003], { w: 0.07 });
}
function pump(b, { W, H, D, p }) {
  contactShadow(b, W, D, { spread: 0.04 });
  const [tile, c] = hs(p.color, 'black');
  box(b, W * 0.9, 0.02, D, 'metal_dark', [0, 0.01, 0], { color: [1.1, 1.1, 1.15], r: 0.004 });
  b.add(cyl(H * 0.36, H * 0.36, W * 0.55, 18).rotateZ(Math.PI / 2), tile, { pos: [-W * 0.12, H * 0.48, 0], color: c, grad: [0.75, 1.05] });
  for (let i = 0; i < 5; i++) b.add(cyl(H * 0.37, H * 0.37, 0.004, 18).rotateZ(Math.PI / 2), 'metal_dark', { pos: [-W * 0.35 + i * 0.03, H * 0.48, 0], color: [0.8, 0.8, 0.85] });
  box(b, W * 0.3, H * 0.7, D * 0.8, p.misting ? 'stainless' : 'plastic_white', [W * 0.3, H * 0.4, 0], { color: p.misting ? [1, 1, 1.03] : [0.4, 0.55, 0.9], r: 0.01 });
  pipeStub(b, [-W / 2, H * 0.35, 0], 'x'); pipeStub(b, [W / 2, H * 0.6, 0], 'x', 0.008);
  if (p.misting) { b.add(cyl(0.025, 0.025, 0.012, 16).rotateX(Math.PI / 2), 'plastic_white', { pos: [W * 0.3, H * 0.95, D * 0.2], color: [0.95, 0.95, 0.93] }); }
}
function filter(b, { W, H, D }) {
  const r = Math.min(W, D) / 2;
  box(b, W * 1.1, 0.04, D * 0.8, 'plastic_white', [0, H - 0.02, 0], { color: [0.9, 0.9, 0.9], r: 0.006 });
  b.add(cyl(r * 0.85, r * 0.8, H - 0.05, 16), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [0, (H - 0.05) / 2, 0], color: [0.85, 0.95, 1.0], alpha: 1.1 });
  b.add(cyl(r * 0.45, r * 0.45, H - 0.1, 12), 'paper', { pos: [0, (H - 0.05) / 2, 0], color: [0.95, 0.92, 0.85] });
  pipeStub(b, [-W / 2, H - 0.02, 0], 'x', 0.008); pipeStub(b, [W / 2, H - 0.02, 0], 'x', 0.008);
}
function regulator(b, { W, H, D }) {
  b.add(cyl(0.012, 0.012, W, 10).rotateZ(Math.PI / 2), 'stainless', { pos: [0, H * 0.3, 0], color: [1.1, 1.05, 0.8] });
  box(b, W * 0.4, H * 0.45, D * 0.6, 'stainless', [0, H * 0.3, 0], { color: [1.1, 1.05, 0.8], r: 0.008 });
  b.add(cyl(H * 0.28, H * 0.28, 0.02, 18).rotateX(Math.PI / 2), 'stainless', { pos: [0, H * 0.72, D * 0.1], color: [1, 1, 1.04] });
  b.add(new THREE.CircleGeometry(H * 0.24, 18), 'plastic_white', { pos: [0, H * 0.72, D * 0.1 + 0.011], color: [0.95, 0.95, 0.93] });
  box(b, 0.003, H * 0.18, 0.002, 'plastic_black', [0.02, H * 0.76, D * 0.1 + 0.012], { color: [0.8, 0.1, 0.1], r: 0.001, rot: [0, 0, -0.7] });
}
function inline(b, { W, H, D }) {
  b.add(cyl(Math.min(H, D) * 0.25, Math.min(H, D) * 0.25, W, 10).rotateZ(Math.PI / 2), 'plastic_white', { pos: [0, H / 2, 0], color: [0.85, 0.85, 0.82] });
  box(b, W * 0.45, H * 0.8, D * 0.9, 'plastic_black', [0, H / 2, 0], { color: [0.4, 0.4, 0.43], r: 0.006 });
}
function manifold(b, { W, H, D }) {
  wallShadow(b, W, H, D, { spread: 0.03, strength: 0.4 });
  box(b, W, H * 0.6, D * 0.7, 'stainless', [0, H * 0.55, 0], { color: [1.1, 1.05, 0.82], r: 0.006 }); // brass bar
  for (let i = 0; i < 4; i++) {
    const x = -W * 0.3 + i * W * 0.2;
    b.add(cyl(0.006, 0.006, H * 0.35, 8), 'stainless', { pos: [x, H * 0.12, D * 0.2], color: [1.1, 1.05, 0.82] });
    b.add(cyl(0.012, 0.012, 0.012, 8), 'plastic_black', { pos: [x, H * 0.02, D * 0.2], color: [0.2, 0.6, 0.9] });
  }
  pipeStub(b, [-W / 2, H * 0.55, 0], 'x', 0.008);
}
function solenoid(b, { W, H, D }) {
  wallShadow(b, W, H, D, { spread: 0.02, strength: 0.4 });
  box(b, W, H * 0.38, D, 'stainless', [0, H * 0.2, 0], { color: [1.1, 1.05, 0.82], r: 0.005 });
  b.add(cyl(D * 0.42, D * 0.42, H * 0.55, 12), 'plastic_black', { pos: [0, H * 0.66, 0], color: [0.25, 0.25, 0.27] });
  box(b, 0.02, 0.015, 0.012, 'plastic_black', [0, H * 0.96, 0], { color: [0.1, 0.1, 0.1] });
  b.add(new THREE.CircleGeometry(0.004, 8), 'amber', { pos: [0, H * 0.8, D * 0.43], glow: 1, color: [1, 0.3, 0.2] });
}
function nozzle(b, { W, H }) {
  b.add(cyl(W * 0.3, W * 0.45, H * 0.6, 10), 'stainless', { pos: [0, H * 0.3, 0], color: [1.1, 1.1, 1.14] });
  b.add(cyl(W * 0.12, W * 0.12, H * 0.4, 8), 'plastic_black', { pos: [0, H * 0.8, 0], color: [0.2, 0.2, 0.22] });
}
function drainPoint(b, { W, H, D }) {
  wallShadow(b, W, H, D, { spread: 0.02, strength: 0.35 });
  box(b, W, H, 0.01, 'plastic_white', [0, H / 2, -D / 2 + 0.005], { color: [0.85, 0.85, 0.83], r: 0.003 });
  b.add(cyl(0.028, 0.028, D, 14).rotateX(Math.PI / 2), 'plastic_white', { pos: [0, H / 2, 0], color: [0.55, 0.57, 0.6] });
  b.add(new THREE.CircleGeometry(0.022, 14), 'drain', { pos: [0, H / 2, D / 2 + 0.001], color: [0.2, 0.2, 0.2] });
}
function pipe(b, { W, H, D }) {
  const r = Math.min(H, D) * 0.45;
  b.add(cyl(r, r, W, 12).rotateZ(Math.PI / 2), 'plastic_white', { pos: [0, H / 2, 0], color: [0.55, 0.57, 0.6] });
  for (let x = -W / 2 + 0.1; x < W / 2; x += 0.5) box(b, 0.02, H * 1.1, D * 1.1, 'metal_dark', [x, H / 2, 0], { color: [0.9, 0.9, 0.95], r: 0.003 });
}
function trap(b, { W, H, D }) {
  const r = Math.min(W, D) * 0.18;
  b.add(taperTube([[-W / 2, H * 0.85, 0], [-W * 0.15, H * 0.85, 0], [-W * 0.15, H * 0.2, 0], [W * 0.15, H * 0.1, 0], [W * 0.15, H * 0.6, 0], [W / 2, H * 0.6, 0]], r, r, { radial: 10, segs: 20 }), 'plastic_white', { uv: 'keep', color: [0.85, 0.85, 0.83] });
}
function floorDrain(b, { W, D }) {
  b.add(rbox(W, 0.004, D, 0.002), 'stainless', { pos: [0, 0.002, 0], color: [1.05, 1.05, 1.08] });
  b.add(flat(W * 0.8, D * 0.8), 'grille', { pos: [0, 0.0045, 0], uvScale: [2, 2], color: [0.5, 0.5, 0.52] });
}
function strip(b, { W, H, D, p }) {
  const [tile, c] = hs(p.color, 'black');
  box(b, W, H, D, tile, [0, H / 2, 0], { color: c, r: 0.01 });
  for (let i = 0; i < 5; i++) b.add(new THREE.CircleGeometry(Math.min(D, W / 6) * 0.35, 14).rotateX(-Math.PI / 2), tile, { pos: [-W * 0.32 + i * W * 0.14, H + 0.001, 0], color: c.map((v) => v * 0.6) });
  box(b, 0.025, 0.01, 0.015, 'amber', [W / 2 - 0.03, H + 0.004, 0], { glow: 0.8, color: [1, 0.3, 0.2] });
  b.add(taperTube([[-W / 2, H / 2, 0], [-W / 2 - 0.2, 0.01, 0.05], [-W / 2 - 0.5, 0.01, 0.1]], 0.004, 0.004, { radial: 5, segs: 6 }), 'plastic_black', { uv: 'keep', color: [0.25, 0.25, 0.27] });
}
function boxDevice(b, { W, H, D, p }) {
  wallShadow(b, W, H, D, { spread: 0.03, strength: 0.45 });
  const [tile, c] = hs(p.color, 'black');
  if (p.board) { // bare automation board in a case: green PCB peeking out
    box(b, W, H, D, tile, [0, H / 2, 0], { color: c, r: 0.006 });
    b.add(quad(W * 0.8, H * 0.7), 'control_face', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H / 2, D / 2 + 0.001], color: [0.3, 0.8, 0.45], glow: 0.08 });
    b.add(new THREE.CircleGeometry(0.003, 8), 'amber', { pos: [W / 2 - 0.012, H - 0.012, D / 2 + 0.002], glow: 1, color: [1, 0.2, 0.2] });
    return;
  }
  box(b, W, H, D, tile, [0, H / 2, 0], { color: c, r: 0.008, grad: [0.85, 1.05] });
  if (p.screen) b.add(quad(W * 0.7, Math.min(H * 0.35, W * 0.45)), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H * 0.66, D / 2 + 0.001], glow: 0.95 });
  else for (let i = 0; i < 4; i++) box(b, W * 0.16, H * 0.3, 0.004, 'plastic_white', [-W * 0.3 + i * W * 0.2, H * 0.55, D / 2 + 0.002], { color: [0.3, 0.45, 0.8], r: 0.002 });
  for (let i = 0; i < 3; i++) b.add(new THREE.CircleGeometry(0.003, 8), 'amber', { pos: [-W * 0.3 + i * 0.015, H * 0.2, D / 2 + 0.002], glow: 1, color: i ? [0.3, 1, 0.4] : [1, 0.6, 0.2] });
}
function probe(b, { W, H, D, p }) {
  if (p.float) { box(b, W, H * 0.3, D, 'plastic_white', [0, H * 0.85, 0], { color: [0.9, 0.9, 0.88], r: 0.004 }); b.add(cyl(W * 0.35, W * 0.35, H * 0.35, 12), 'plastic_black', { pos: [0, H * 0.35, 0], color: [0.3, 0.3, 0.32] }); b.add(cyl(W * 0.08, W * 0.08, H * 0.7, 6), 'stainless', { pos: [0, H * 0.45, 0] }); return; }
  b.add(cyl(W * 0.2, W * 0.2, H * 0.6, 10), 'stainless', { pos: [0, H * 0.3, 0], color: [1.1, 1.1, 1.14] });
  b.add(cyl(W * 0.3, W * 0.3, H * 0.25, 10), p.hum ? 'plastic_white' : 'plastic_black', { pos: [0, H * 0.72, 0], color: p.hum ? [0.9, 0.9, 0.88] : [0.25, 0.25, 0.27] });
  b.add(taperTube([[0, H * 0.85, 0], [0, H * 1.1, 0.03], [0.05, H * 1.2, 0.08]], 0.002, 0.002, { radial: 4, segs: 4 }), 'plastic_black', { uv: 'keep', color: [0.25, 0.25, 0.27] });
}
function puck(b, { W, H }) {
  b.add(cyl(W / 2, W / 2, H, 18), 'plastic_white', { pos: [0, H / 2, 0], color: [0.92, 0.92, 0.9] });
  b.add(new THREE.CircleGeometry(0.004, 8).rotateX(-Math.PI / 2), 'amber', { pos: [0, H + 0.001, 0], glow: 1, color: [0.3, 0.6, 1] });
}

/** builder id → function(b, ctx) — merged into the Planner model table. */
export const EXTENDED_MODELS = {
  door, window: windowModel, table, table_corner: tableCorner, desk, shelf, cabinet, picture, clock,
  incubator, wintering, fridge,
  tank, pump, filter, regulator, inline, manifold, solenoid, nozzle,
  drain_point: drainPoint, pipe, trap, floor_drain: floorDrain,
  strip, box_device: boxDevice, probe, puck,
  ...PLANTS,
};
