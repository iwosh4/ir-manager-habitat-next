import * as THREE from 'three';
import { PaintBuilder } from '../planner/PaintBuilder.js';
import { TILE_CLAMP, TILE_REPEAT_U } from '../planner/PaintedMaterials.js';
import { rbox, cyl, lathe, quad, flat, ellipsoid, taperTube, rng, fbm } from '../planner/geometry.js';
import {
  TINT, box, contactShadow, highlight, glassPanel, ventStrip, lightStrip, labelCard, cabinetModule, interiorAO,
  backgroundPanel, substrateVolume, stone, branch, corkTube, waterBowl, bromeliad, fernClump, grassTuft, succulent, mossMound,
  aridInterior, tropicalInterior, paludariumInterior, emptyInterior, gecko,
} from '../planner/components.js';
import { TECH_KINDS } from '../model/Library.js';

/**
 * EnclosureTemplate → painted parametric geometry (Planner kit).
 *
 * Everything is generated from real dimensions: frame profiles are extruded to the new lengths, glass
 * and panels re-cut, vent strips keep their slot pitch (more slots when longer), substrate and
 * backgrounds re-generated for the interior; hardware (handles, locks, hinges, labels, sensors) keeps
 * its physical size. Nothing is ever scaled. Local frame: origin at the footprint centre on the
 * floor (under the optional base cabinet), front = +Z, up = +Y.
 */

const FRAME = {
  black: { tile: 'metal_dark', color: TINT.frame },
  graphite: { tile: 'metal_dark', color: TINT.graphite },
  alu: { tile: 'alu', color: [0.78, 0.78, 0.8] },
  white: { tile: 'plastic_white', color: [0.86, 0.85, 0.82] },
  wood: { tile: 'wood', color: [0.85, 0.72, 0.58] },
};
const PANEL = {
  pvc: { tile: 'plastic_black', color: [0.9, 0.9, 0.95], t: 0.01 },
  pvcWhite: { tile: 'plastic_white', color: [0.8, 0.79, 0.76], t: 0.01 },
  wood: { tile: 'wood', color: [0.78, 0.66, 0.52], t: 0.018 },
};
const RAIL = { sliding: 0.05, 'hinged-single': 0.04, 'hinged-double': 0.04, mesh: 0.032, fixed: 0.014, tub: 0.0, open: 0.018 };
const BG_TILE = { sandstone: ['rock_warm', [1.05, 0.95, 0.85]], cork: ['cork', [0.95, 0.9, 0.85]], basalt: ['rock_dark', [0.9, 0.95, 0.95]], foam: ['wall_dark', [1.3, 1.3, 1.35]] };
const SUB_TILE = { sand: ['sand', 'section_arid', TINT.sand], soil: ['soil', 'section_tropical', [1, 1, 1]], gravel: ['gravel', 'section_palu', [1, 1, 1]], paper: ['paper', 'paper', [0.8, 0.78, 0.74]] };

export function panelLook(t, kind) {
  if (kind === 'wood') return PANEL.wood;
  if (kind === 'pvc') return t.construction.frame.color === 'white' ? PANEL.pvcWhite : PANEL.pvc;
  return null;
}

/** Interior bounds of a template (enclosure-local, above the base) — used by the geometry and the designer. */
export function interiorBounds(t) {
  const { width: W, height: H, depth: D } = t.dimensions;
  const box = t.construction.frame.style === 'box';
  const f = box ? (panelLook(t, t.construction.panels.left)?.t || 0.01) : t.construction.frame.profile;
  const rail = box ? 0.012 : RAIL[t.front.type] ?? 0.04;
  const topT = t.top.type === 'open' ? 0.004 : box ? 0.012 : 0.026;
  return { x0: -W / 2 + f + 0.003, x1: W / 2 - f - 0.003, z0: -D / 2 + f + 0.006, z1: D / 2 - f - 0.014, floor: Math.max(0.012, box ? 0.012 : 0.012), top: H - topT - 0.004, rail };
}

/**
 * @param mats   PaintedMaterials (for tile lookup)
 * @param t      normalized EnclosureTemplate
 * @param state  { occupied, lighting, code, seed }
 */
export function buildEnclosure(mats, t, state = {}) {
  const b = new PaintBuilder(mats);
  buildEnclosureInto(b, t, state);
  return b;
}

export function buildEnclosureInto(b, t, { occupied = true, lighting = true, code = '', seed = 7, shadow = true } = {}) {
  const { width: W, height: H, depth: D } = t.dimensions;
  const base = t.bottom.base || 0;
  const lit = lighting && occupied;
  if (shadow) contactShadow(b, W, D, { spread: 0.08 });
  if (base > 0.02) cabinetModule(b, W, base, D, { doors: W > 0.9 ? 2 : 1, tile: 'metal_dark', color: [2.3, 2.3, 2.4], topColor: [1.9, 1.9, 2.0] });
  b.push([0, base, 0]);
  const I = shell(b, t, { lit, occupied, code });
  if (t.front.type !== 'tub') interior(b, t, I, { occupied, lit, seed });
  else tubInterior(b, t, I, { occupied });
  technology(b, t, I, { lit });
  b.pop();
  return b;
}

// ------------------------------------------------------------------------------------------ shell
function shell(b, t, { lit, occupied, code }) {
  const { width: W, height: H, depth: D } = t.dimensions;
  const I = interiorBounds(t);
  const fr = FRAME[t.construction.frame.color] || FRAME.black;
  const P = t.construction.panels;
  const boxStyle = t.construction.frame.style === 'box';
  const f = t.construction.frame.profile;
  const rail = I.rail, topRail = t.top.type === 'open' && !boxStyle ? 0.012 : 0.026;
  const vents = t.ventilation;
  const hasVent = (side) => vents.find((v) => v.side === side);
  const fv = hasVent('front-top') ? 0.04 : 0, bv = hasVent('front-bottom') ? 0.035 : 0;

  // base plate
  box(b, W - 0.004, 0.012, D - 0.004, 'plastic_black', [0, 0.006, 0], { color: [0.25, 0.25, 0.27], r: 0.002 });

  if (boxStyle) {
    // ---- solid carcass (PVC / wood / rack box): panels of real thickness, open front framed by lips
    const look = (k) => panelLook(t, k) || panelLook(t, t.construction.type === 'wood' ? 'wood' : 'pvc');
    const side = (k, sx) => {
      if (k === 'open') return;
      if (k === 'glass' || k === 'mesh') { panelSide(b, k, D - 0.02, H - 0.02, [sx * (W / 2 - 0.004), H / 2, 0], sx); return; }
      const L = look(k); box(b, L.t, H, D, L.tile, [sx * (W / 2 - L.t / 2), H / 2, 0], { color: L.color, r: 0.003, grad: [0.78, 1.05] });
    };
    side(P.left, -1); side(P.right, 1);
    const top = look(t.construction.type === 'wood' ? 'wood' : 'pvc');
    if (t.top.type === 'solid') box(b, W, top.t, D, top.tile, [0, H - top.t / 2, 0], { color: top.color.map((c) => c * 1.08), r: 0.003 });
    else topPanel(b, t, W - 0.02, D - 0.02, H - 0.006);
    box(b, W, top.t, D, top.tile, [0, top.t / 2, 0], { color: top.color, r: 0.003 });
    if (P.rear === 'glass' || P.rear === 'mesh') panelSide(b, P.rear, W - 0.02, H - 0.02, [0, H / 2, -D / 2 + 0.004], 0);
    else if (P.rear !== 'open') { const L = look(P.rear); box(b, W - 0.01, H - 0.01, L.t, L.tile, [0, H / 2, -D / 2 + L.t / 2], { color: L.color.map((c) => c * 0.85) }); }
    // front lips (the opening frame)
    box(b, W, 0.022 + bv, 0.014, top.tile, [0, (0.022 + bv) / 2, D / 2 - 0.007], { color: top.color.map((c) => c * 1.05), r: 0.003 });
    box(b, W, 0.022 + fv, 0.014, top.tile, [0, H - (0.022 + fv) / 2, D / 2 - 0.007], { color: top.color.map((c) => c * 1.05), r: 0.003 });
    highlight(b, W - 0.01, [0, H - 0.001, D / 2 + 0.0005], { color: [0.9, 0.9, 0.92] });
  } else {
    // ---- profile frame: bottom rail (door track), top rail, four uprights, panels
    box(b, W, Math.max(rail, 0.014), f, fr.tile, [0, Math.max(rail, 0.014) / 2, D / 2 - f / 2], { color: fr.color, r: 0.003, grad: [0.7, 1.05] });
    if (t.front.type === 'sliding') for (const dz of [-0.006, -0.013]) box(b, W - 0.02, 0.003, 0.003, 'metal_dark', [0, rail + 0.0015, D / 2 + dz], { color: [0.12, 0.12, 0.13] }); // door tracks
    highlight(b, W - 0.01, [0, Math.max(rail, 0.014) - 0.001, D / 2 + 0.0005]);
    box(b, W, 0.022, f, fr.tile, [0, 0.011, -D / 2 + f / 2], { color: fr.color });
    for (const s of [-1, 1]) box(b, f, 0.022, D, fr.tile, [s * (W / 2 - f / 2), 0.011, 0], { color: fr.color });
    box(b, W, topRail, f, fr.tile, [0, H - topRail / 2, D / 2 - f / 2], { color: fr.color, grad: [0.85, 1.1] });
    highlight(b, W - 0.01, [0, H - 0.001, D / 2 + 0.0005], { color: [0.95, 0.95, 0.95] });
    box(b, W, topRail, f, fr.tile, [0, H - topRail / 2, -D / 2 + f / 2], { color: fr.color });
    for (const s of [-1, 1]) box(b, f, topRail, D, fr.tile, [s * (W / 2 - f / 2), H - topRail / 2, 0], { color: fr.color });
    const uh = H - Math.max(rail, 0.014) - topRail;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, f, uh + 0.002, f, fr.tile, [sx * (W / 2 - f / 2), Math.max(rail, 0.014) + uh / 2, sz * (D / 2 - f / 2)], { color: fr.color, r: 0.003 });
    for (const sx of [-1, 1]) highlight(b, uh, [sx * (W / 2 - 0.001), Math.max(rail, 0.014) + uh / 2, D / 2 + 0.0005], { axis: 'y', color: [0.7, 0.72, 0.75] });
    // construction joints: small corner gussets where rails meet uprights (readability)
    for (const sx of [-1, 1]) for (const y of [Math.max(rail, 0.014), H - topRail]) box(b, 0.012, 0.012, 0.004, 'metal_dark', [sx * (W / 2 - f - 0.006), y + (y > H / 2 ? -0.006 : 0.006), D / 2 - 0.001], { color: [0.2, 0.2, 0.22], r: 0.002 });
    const ph = uh;
    for (const [k, sx] of [[P.left, -1], [P.right, 1]]) {
      if (k === 'open') continue;
      if (k === 'glass' || k === 'mesh') panelSide(b, k, D - 2 * f, ph, [sx * (W / 2 - f / 2), Math.max(rail, 0.014) + ph / 2, 0], sx);
      else { const L = panelLook(t, k); box(b, L.t, ph, D - 2 * f, L.tile, [sx * (W / 2 - f / 2), Math.max(rail, 0.014) + ph / 2, 0], { color: L.color }); }
    }
    if (P.rear === 'glass' || P.rear === 'mesh') { if (t.background.type === 'none' || P.rear === 'mesh') panelSide(b, P.rear, W - 2 * f, ph, [0, Math.max(rail, 0.014) + ph / 2, -D / 2 + f / 2], 0); }
    else if (P.rear !== 'open') { const L = panelLook(t, P.rear); box(b, W - 2 * f, ph, L.t, L.tile, [0, Math.max(rail, 0.014) + ph / 2, -D / 2 + L.t / 2], { color: L.color.map((c) => c * 0.85) }); }
    topPanel(b, t, W - 2 * f, D - 2 * f, H - 0.004);
  }

  // ---- ventilation (fixed slot pitch: longer strip → more slots)
  for (const v of vents) {
    if (v.side === 'front-top') ventStrip(b, (W - 0.05) * v.coverage, fv - 0.006, [0, H - (boxStyle ? 0.022 : topRail) - fv / 2, D / 2 - 0.005], { slotsPerM: 9 });
    else if (v.side === 'front-bottom') ventStrip(b, (W - 0.05) * v.coverage, bv - 0.006, [0, (boxStyle ? 0.022 : rail) + bv / 2, D / 2 - 0.005], { slotsPerM: 9 });
    else if (v.side === 'left' || v.side === 'right') { const sx = v.side === 'left' ? -1 : 1; b.push([sx * (W / 2 + 0.0015), H * 0.78, 0], sx * Math.PI / 2); ventStrip(b, (D - 0.06) * v.coverage, 0.045, [0, 0, 0], { slotsPerM: 9 }); b.pop(); }
    else if (v.side === 'rear') { b.push([0, H * 0.8, -D / 2 - 0.0015], Math.PI); ventStrip(b, (W - 0.06) * v.coverage, 0.045, [0, 0, 0], { slotsPerM: 9 }); b.pop(); }
    else if (v.side === 'top' && t.top.type === 'solid') { b.push([0, H + 0.0015, 0], 0, [-Math.PI / 2, 0, 0]); ventStrip(b, (W - 0.08) * v.coverage, Math.min(0.12, D * 0.3), [0, 0, 0], { slotsPerM: 9 }); b.pop(); }
  }

  // ---- front
  const y0 = (boxStyle ? 0.022 : Math.max(rail, 0.014)) + bv, y1 = H - (boxStyle ? 0.022 : topRail) - fv;
  const fh = y1 - y0, fw = boxStyle ? W - 0.02 : W - 2 * f, fy = y0 + fh / 2, fz = D / 2 - 0.008;
  const hw = t.front.lock;
  switch (t.front.type) {
    case 'sliding': {
      const pw = fw / 2 + 0.02;
      glassPanel(b, pw, fh, [-(fw / 4) + 0.01, fy, D / 2 - 0.006]);
      glassPanel(b, pw, fh, [(fw / 4) - 0.01, fy, D / 2 - 0.013]);
      box(b, 0.01, Math.min(0.055, fh * 0.4), 0.008, 'plastic_black', [0.007, y0 + fh * 0.45, D / 2], { color: TINT.black, r: 0.003 });
      box(b, 0.01, Math.min(0.055, fh * 0.4), 0.008, 'plastic_black', [-0.007, y0 + fh * 0.45, D / 2 - 0.018], { color: TINT.black, r: 0.003 });
      if (hw) b.add(cyl(0.006, 0.006, 0.006, 10).rotateX(Math.PI / 2), 'stainless', { pos: [0.03, y0 + 0.012, D / 2 + 0.003] });
      break;
    }
    case 'hinged-single': {
      glassPanel(b, fw - 0.004, fh, [0, fy, fz]);
      b.add(cyl(0.008, 0.008, 0.012, 12).rotateX(Math.PI / 2), 'stainless', { pos: [fw / 2 - 0.03, fy, D / 2 + 0.002], color: [1.05, 1.05, 1.08] });
      for (const hy of [0.18, 0.82]) box(b, 0.008, 0.03, 0.006, 'plastic_black', [-fw / 2 + 0.004, y0 + fh * hy, D / 2 - 0.002], { color: TINT.black, r: 0.002 });
      break;
    }
    case 'hinged-double': {
      const pw = fw / 2;
      glassPanel(b, pw - 0.004, fh, [-fw / 4, fy, fz]); glassPanel(b, pw - 0.004, fh, [fw / 4, fy, fz]);
      box(b, 0.014, fh, 0.014, fr.tile, [0, fy, fz], { color: fr.color, r: 0.003 });
      for (const s of [-1, 1]) {
        b.add(cyl(0.008, 0.008, 0.012, 12).rotateX(Math.PI / 2), 'stainless', { pos: [s * 0.022, fy, D / 2 + 0.002], color: [1.05, 1.05, 1.08] });
        for (const hy of [0.18, 0.82]) box(b, 0.008, 0.03, 0.006, 'plastic_black', [s * (fw / 2 - 0.004), y0 + fh * hy, D / 2 - 0.002], { color: TINT.black, r: 0.002 });
      }
      break;
    }
    case 'fixed': glassPanel(b, fw, fh, [0, fy, D / 2 - 0.004], { tint: [0.92, 1.0, 0.98] }); break;
    case 'mesh': {
      const bw = 0.016;
      for (const [w, h, x, y] of [[fw, bw, 0, y0 + bw / 2], [fw, bw, 0, y1 - bw / 2], [bw, fh, -fw / 2 + bw / 2, fy], [bw, fh, fw / 2 - bw / 2, fy]]) box(b, w, h, 0.012, fr.tile, [x, y, fz], { color: fr.color, r: 0.003 });
      b.add(quad(fw - 2 * bw, fh - 2 * bw), 'mesh', { bucket: 'glass', pos: [0, fy, fz], uvScale: 1, uv: 'xy', color: [0.6, 0.6, 0.62], alpha: 1 });
      box(b, 0.012, Math.min(0.12, fh * 0.35), 0.014, 'stainless', [fw / 2 - 0.04, fy, D / 2 + 0.006], { r: 0.005 });
      break;
    }
    case 'tub': {
      // translucent tub drawer: milky front, lip, recessed grip, label
      const th = H - 0.05, tw = W - 0.03;
      box(b, tw, th, 0.014, 'plastic_white', [0, 0.025 + th / 2, D / 2 - 0.01], { color: occupied ? [0.78, 0.78, 0.74] : [0.6, 0.6, 0.58], r: 0.006, grad: [0.72, 1.05] });
      box(b, tw + 0.006, 0.012, 0.022, 'plastic_white', [0, 0.025 + th - 0.004, D / 2 - 0.006], { color: [0.86, 0.86, 0.83], r: 0.004 });
      box(b, Math.min(0.14, tw * 0.3), Math.min(0.026, th * 0.3), 0.01, 'plastic_black', [-tw * 0.18, 0.025 + th * 0.55, D / 2 - 0.002], { color: [0.35, 0.35, 0.37], r: 0.008 });
      b.add(quad(Math.min(0.1, tw * 0.22), Math.min(0.045, th * 0.4)), 'label', { mode: TILE_CLAMP, uv: 'keep', pos: [tw * 0.24, 0.025 + th * 0.5, D / 2 - 0.0025], color: occupied ? [1, 1, 1] : [0.6, 0.6, 0.6] });
      break;
    }
    default: break; // open front
  }
  if (t.front.type !== 'tub') labelCard(b, [W / 2 - 0.07, (boxStyle ? 0.011 : Math.max(rail, 0.014) / 2), D / 2 + 0.002], { status: occupied ? 'ok' : null, dim: !occupied, h: Math.min(0.028, Math.max(rail, 0.02) * 0.8) });
  return I;
}

function panelSide(b, kind, len, h, pos, sx) {
  const rot = sx ? sx * Math.PI / 2 : 0;
  if (kind === 'glass') glassPanel(b, len, h, pos, { rotY: rot, edge: false });
  else { b.push(pos, rot); b.add(quad(len, h), 'mesh', { bucket: 'glass', uv: 'xy', uvScale: 1, color: [0.6, 0.6, 0.62], alpha: 1 }); b.pop(); }
}

function topPanel(b, t, w, d, y) {
  if (t.top.type === 'mesh') b.add(flat(w, d), 'mesh', { bucket: 'decal', pos: [0, y, 0], uvScale: 7, color: [0.55, 0.55, 0.58], alpha: 0.5 });
  else if (t.top.type === 'glass') b.add(flat(w, d), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [0, y, 0], alpha: 0.6 });
  else if (t.top.type === 'solid') box(b, w, 0.008, d, 'metal_dark', [0, y, 0], { color: TINT.frame });
}

// ------------------------------------------------------------------------------------------ interior
function interior(b, t, I, { occupied, lit, seed }) {
  const p = t.interior.preset;
  const W = t.dimensions.width;
  let surf = null;
  if (p === 'arid') surf = aridInterior(b, I, { seed, occupied, rich: W >= 0.5, animal: W > 0.8 ? 'python' : 'gecko' });
  else if (p === 'tropical') surf = tropicalInterior(b, I, { seed, occupied, rich: W >= 0.5 });
  else if (p === 'paludarium') surf = paludariumInterior(b, I, { seed, occupied, lit });
  else if (p === 'none') { emptyInterior(b, I); surf = () => I.floor + 0.003; }
  else surf = customInterior(b, t, I, { occupied });
  for (const it of t.interior.items) interiorItem(b, it, I, surf, seed);
}

function customInterior(b, t, I, { occupied }) {
  const bg = BG_TILE[t.background.type];
  if (bg) backgroundPanel(b, I, { tile: bg[0], color: bg[1], depth: Math.min(0.06, (I.z1 - I.z0) * 0.14), seed: 5, ledges: t.background.type !== 'foam', uvScale: 2 });
  const s = t.interior.substrate, d = I.z1 - I.z0;
  const depth = s.type === 'none' ? 0 : Math.min(s.depth, (I.top - I.floor) * 0.4);
  const water = t.interior.water;
  const landX = I.x0 + (I.x1 - I.x0) * water.fraction;
  const base = (x, z) => I.floor + depth + (1 - (z - I.z0) / d) * Math.min(0.03, depth * 0.5) + (fbm(x * 6, z * 6, 2) - 0.5) * Math.min(0.012, depth * 0.3);
  const surf = water.enabled ? (x, z) => { const k = THREE.MathUtils.smoothstep(x, landX - 0.06, landX + 0.08); return I.floor + 0.02 + k * (base(x, z) - I.floor - 0.02); } : base;
  if (s.type === 'paper') b.add(flat(I.x1 - I.x0 - 0.01, d), 'paper', { pos: [(I.x0 + I.x1) / 2, I.floor + 0.002, (I.z0 + I.z1) / 2], uvScale: 3, color: [0.8, 0.78, 0.74], ao: interiorAO(I) });
  else if (depth > 0.004) { const S = SUB_TILE[s.type]; substrateVolume(b, I, surf, { top: S[0], section: S[1], color: S[2], uvScale: 5 }); }
  if (water.enabled) {
    const wy = I.floor + (I.top - I.floor) * water.level * 0.6, wx1 = landX + 0.04;
    b.add(flat(wx1 - I.x0, d + 0.01), 'water', { bucket: 'glass', pos: [(I.x0 + wx1) / 2, wy, (I.z0 + I.z1) / 2 + 0.005], uvScale: 5, alpha: 0.6, color: [0.75, 1.0, 0.95] });
    b.add(quad(wx1 - I.x0, wy - I.floor - 0.01), 'water_side', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [(I.x0 + wx1) / 2, (I.floor + wy) / 2, I.z1 + 0.008], alpha: 0.55, color: [0.7, 1.0, 0.95] });
  }
  if (occupied && t.interior.items.length === 0) gecko(b, [(I.x0 + I.x1) / 2 + 0.03, surf(0, (I.z0 + I.z1) / 2) + 0.002, (I.z0 + I.z1) / 2 + 0.04], { yaw: 0.7 });
  return surf;
}

/** One user-placed interior component (fractions of the interior → metres; y follows the substrate). */
function interiorItem(b, it, I, surf, seed) {
  const x = I.x0 + (I.x1 - I.x0) * it.x, z = I.z0 + (I.z1 - I.z0) * it.z, y = surf(x, z);
  const s = it.s, hIn = I.top - I.floor, r = rng(seed + it.id.length * 7 + Math.round(it.x * 100));
  const ao = interiorAO(I);
  switch (it.kind) {
    case 'cork': corkTube(b, [x, y - 0.01, z], { len: Math.min(0.28, (I.x1 - I.x0) * 0.4) * s, r: Math.min(0.06, hIn * 0.15) * s, rotY: it.r }); break;
    case 'branch': branch(b, [[x, y, z], [x + 0.08 * s, y + hIn * 0.3 * s, z - 0.04], [x + 0.18 * s, y + hIn * 0.55 * s, z - 0.08]].map((p) => rotateAround(p, x, z, it.r)), { r0: 0.016 * s, r1: 0.007 * s, seed: seed + 3, twigs: 2, tile: 'driftwood', color: [1.1, 1.0, 0.9] }); break;
    case 'rock': stone(b, [x, y + 0.01 * s, z], 0.05 * s, { seed: seed + Math.round(it.x * 97), sx: 1.2, sy: 0.5, rotY: it.r, ao }); break;
    case 'hide': {
      b.push([x, y, z], it.r);
      box(b, 0.14 * s, 0.06 * s, 0.1 * s, 'plastic_black', [0, 0.03 * s, 0], { color: [0.45, 0.4, 0.36], r: 0.02 * s, lit: true });
      b.add(new THREE.CircleGeometry(0.022 * s, 12), 'shadow', { pos: [0, 0.028 * s, 0.0505 * s], color: [0.05, 0.04, 0.04] });
      b.pop(); break;
    }
    case 'bowl': waterBowl(b, [x, y - 0.006, z], { r: 0.05 * s }); break;
    case 'bromeliad': bromeliad(b, [x, y, z], { size: 0.12 * s, seed: seed + Math.round(r() * 100), leaves: 11 }); break;
    case 'fern': fernClump(b, [x, y, z], { size: 0.18 * s, seed: seed + Math.round(r() * 100) }); break;
    case 'grass': grassTuft(b, [x, y, z], { h: 0.1 * s, seed: seed + 9 }); break;
    case 'succulent': succulent(b, [x, y, z], { size: 0.05 * s, seed: seed + 11 }); break;
    case 'moss': mossMound(b, [x, y - 0.004, z], 0.045 * s, { sy: 0.45, seed: seed + 13 }); break;
    default: break;
  }
}

function rotateAround(p, cx, cz, a) {
  const dx = p[0] - cx, dz = p[2] - cz, c = Math.cos(a), s = Math.sin(a);
  return [cx + dx * c + dz * s, p[1], cz - dx * s + dz * c];
}

function tubInterior(b, t, I, { occupied }) {
  // tubs are translucent: a dim silhouette of paper + hide reads through the front
  b.add(flat(I.x1 - I.x0, I.z1 - I.z0), 'paper', { pos: [0, I.floor + 0.002, 0], uvScale: 3, color: [0.4, 0.38, 0.35] });
  if (occupied) b.add(flat((I.x1 - I.x0) * 0.8, (I.z1 - I.z0) * 0.6), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [0, I.floor + 0.004, -0.02], alpha: 0.35 });
}

// ------------------------------------------------------------------------------------------ technology
/** Device position (enclosure-local) of a technology slot; same mapping for geometry and the designer. */
export function devicePosition(t, dev, I = interiorBounds(t)) {
  const mount = TECH_KINDS[dev.kind]?.mount || 'rear';
  const x = I.x0 + (I.x1 - I.x0) * dev.x;
  if (mount === 'ceiling') return { x, y: I.top - 0.018, z: I.z0 + (I.z1 - I.z0) * dev.z, mount };
  if (mount === 'floor') return { x, y: I.floor + 0.004, z: I.z0 + (I.z1 - I.z0) * dev.z, mount };
  return { x, y: I.floor + (I.top - I.floor) * dev.y, z: I.z0 + 0.012, mount };
}

function technology(b, t, I, { lit }) {
  for (const dev of t.technology) {
    const p = devicePosition(t, dev, I);
    const w = I.x1 - I.x0;
    switch (dev.kind) {
      case 'led': lightStrip(b, Math.max(0.12, Math.min(w - 0.06, 1.2)), [p.x, p.y, p.z], { temp: t.interior.preset === 'arid' ? 'warm' : 'cool', lit, lampRadius: Math.max(0.5, Math.hypot(w * 0.7, I.top - I.floor)), lampDrop: Math.min(0.12, (I.top - I.floor) * 0.2) }); break;
      case 'uvb': {
        const len = Math.max(0.12, Math.min(w - 0.1, 0.9));
        box(b, len, 0.022, 0.04, 'alu', [p.x, p.y + 0.004, p.z], { color: [0.78, 0.78, 0.8], r: 0.006 });
        b.add(cyl(0.008, 0.008, len - 0.03, 10).rotateZ(Math.PI / 2), 'led_cool', { pos: [p.x, p.y - 0.01, p.z], glow: lit ? 1 : 0, color: lit ? [0.85, 0.95, 1.2] : [0.35, 0.35, 0.37] });
        if (lit) b.lamp([p.x, p.y - 0.05, p.z], { radius: 0.4, color: 0xd8e8ff, intensity: 0.5 });
        break;
      }
      case 'basking': {
        b.add(lathe([[0.004, 0.08], [0.025, 0.076], [0.05, 0.053], [0.06, 0.016], [0.062, 0], [0.058, 0], [0.046, 0.048], [0.022, 0.072]], 16), 'metal_dark', { pos: [p.x, p.y - 0.064, p.z], color: [0.55, 0.56, 0.6] });
        b.add(ellipsoid(0.022, 0.017, 0.022, 10), 'led_warm', { pos: [p.x, p.y - 0.06, p.z], glow: lit ? 1 : 0, color: lit ? [1.2, 0.9, 0.6] : [0.4, 0.38, 0.36] });
        if (lit) b.lamp([p.x, p.y - 0.1, p.z], { radius: 0.32, color: 0xffa860, intensity: 1.2 });
        break;
      }
      case 'heat_panel': {
        const pw = Math.min(0.35, w * 0.5), pd = Math.min(0.3, (I.z1 - I.z0) * 0.6);
        box(b, pw, 0.012, pd, 'metal_dark', [p.x, p.y + 0.006, p.z], { color: [0.9, 0.9, 0.95], r: 0.004 });
        b.add(new THREE.CircleGeometry(0.004, 8).rotateX(Math.PI / 2), 'amber', { pos: [p.x + pw / 2 - 0.02, p.y - 0.001, p.z + pd / 2 - 0.02], glow: 1, color: [1, 0.4, 0.15] });
        break;
      }
      case 'heat_cable': {
        const pts = []; const n = 5, len = Math.min(w - 0.04, 0.8);
        for (let i = 0; i <= n * 4; i++) { const u = i / (n * 4); pts.push([p.x - len / 2 + len * u, I.floor + 0.004, p.z + Math.sin(u * n * Math.PI * 2) * 0.03]); }
        b.add(taperTube(pts, 0.0025, 0.0025, { radial: 4, segs: 40, vScale: 20 }), 'amber', { uv: 'keep', color: [0.55, 0.18, 0.1], glow: lit ? 0.4 : 0 });
        break;
      }
      case 'mist': b.add(cyl(0.007, 0.009, 0.022, 10), 'plastic_black', { pos: [p.x, p.y + 0.004, p.z], color: TINT.black }); b.add(cyl(0.003, 0.003, 0.012, 8), 'stainless', { pos: [p.x, p.y - 0.012, p.z] }); break;
      case 'fan': {
        const r = Math.min(0.05, (I.top - I.floor) * 0.2);
        b.add(cyl(r + 0.006, r + 0.006, 0.012, 20).rotateX(Math.PI / 2), 'plastic_black', { pos: [p.x, p.y, p.z], color: TINT.black });
        b.add(new THREE.CircleGeometry(r, 20), 'grille', { mode: TILE_CLAMP, uv: 'keep', pos: [p.x, p.y, p.z + 0.0065], color: [0.5, 0.5, 0.52] });
        break;
      }
      case 'temp_sensor': case 'humidity_sensor': {
        box(b, 0.05, 0.05, 0.016, 'plastic_white', [p.x, p.y, p.z], { color: [0.85, 0.85, 0.82], r: 0.006 });
        b.add(quad(0.038, 0.024), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [p.x, p.y + 0.006, p.z + 0.0085], glow: 1 });
        b.add(new THREE.CircleGeometry(0.003, 8), 'amber', { pos: [p.x + 0.016, p.y - 0.016, p.z + 0.0085], glow: 1, color: dev.kind === 'humidity_sensor' ? [0.3, 0.6, 1.1] : [1, 0.55, 0.15] });
        break;
      }
      case 'probe': {
        b.add(taperTube([[p.x, I.top - 0.01, p.z + 0.01], [p.x + 0.01, (I.top + p.y) / 2, p.z + 0.02], [p.x, p.y, p.z + 0.03]], 0.002, 0.002, { radial: 4, segs: 8 }), 'plastic_black', { uv: 'keep', color: TINT.black });
        b.add(cyl(0.004, 0.004, 0.03, 8), 'stainless', { pos: [p.x, p.y - 0.012, p.z + 0.03] });
        break;
      }
      case 'cable_entry': b.add(cyl(0.014, 0.014, 0.01, 14).rotateX(Math.PI / 2), 'rubber', { pos: [p.x, p.y, p.z - 0.008], color: TINT.black }); b.add(new THREE.CircleGeometry(0.007, 12), 'shadow', { pos: [p.x, p.y, p.z - 0.002], color: [0.03, 0.03, 0.03] }); break;
      default: break;
    }
  }
}

/** Physical module members of assemblies (cabinet / shelf / technical compartment). */
export function buildModuleInto(b, mod) {
  const { w: W, h: H, d: D } = mod;
  if (mod.type === 'cabinet') cabinetModule(b, W, H, D, { doors: mod.doors ?? (W > 0.8 ? 2 : 1), tile: 'metal_dark', color: [2.3, 2.3, 2.4], topColor: [1.9, 1.9, 2.0], plinth: Math.min(0.06, H * 0.1) });
  else if (mod.type === 'shelf') { box(b, W, H, D, 'metal_dark', [0, H / 2, 0], { color: TINT.graphite, r: 0.003 }); highlight(b, W - 0.01, [0, H - 0.001, D / 2 + 0.001], { color: [0.7, 0.72, 0.76] }); }
  else {
    // technical compartment: steel box, louvred door, controller display, cable entries
    box(b, W, H, D - 0.02, 'metal_dark', [0, H / 2, -0.01], { color: [2.1, 2.1, 2.2], r: 0.004, grad: [0.7, 1.05] });
    box(b, W - 0.03, H - 0.03, 0.014, 'metal_dark', [0, H / 2, D / 2 - 0.012], { color: [2.4, 2.4, 2.5], r: 0.004, grad: [0.65, 1.08] });
    ventStrip(b, (W - 0.1) * 0.8, Math.min(0.08, H * 0.2), [0, H * 0.2, D / 2 - 0.004], { slotsPerM: 9 });
    b.add(quad(Math.min(0.12, W * 0.3), Math.min(0.06, H * 0.15)), 'display', { mode: TILE_CLAMP, uv: 'keep', pos: [0, H * 0.72, D / 2 - 0.004], glow: 1 });
    box(b, 0.012, Math.min(0.14, H * 0.3), 0.016, 'stainless', [W / 2 - 0.05, H * 0.5, D / 2 + 0.004], { r: 0.005 });
    labelCard(b, [-W / 4, H - 0.05, D / 2 - 0.004], { w: 0.08, h: 0.03 });
  }
}
