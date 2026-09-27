// Architectural and technical fixtures: door, window, lights, electrical & HVAC equipment, plants.
import { THREE, Builder, extrude, roundedRectShape, lathe, matrix, taperedTube } from '../lib/kit.mjs';
import { bigLeafPlant, sansevieria, pot, fern } from '../lib/nature.mjs';

const NS = { castShadow: false };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Steel door set: frame (fits a wall opening, depth = wall thickness), leaf with vision panel,
 * lever handle, kick plate, overhead closer. Origin: opening centre at floor, wall centre plane (z = 0).
 */
export function door() {
  const b = new Builder('door');
  const W = 1.0, H = 2.1, T = 0.14, f = 0.05;
  // frame (architrave on both faces + jambs)
  for (const s of [-1, 1]) {
    b.box(f, H + f, T + 0.02, 'steel_graphite', [s * (W / 2 - f / 2 + 0.0), (H + f) / 2, 0], { r: 0.004 });
    b.box(0.07, H + 0.07, 0.012, 'steel_graphite', [s * (W / 2 + 0.03), (H + 0.07) / 2, T / 2 + 0.006], { r: 0.003 });
    b.box(0.07, H + 0.07, 0.012, 'steel_graphite', [s * (W / 2 + 0.03), (H + 0.07) / 2, -T / 2 - 0.006], { r: 0.003 });
  }
  b.box(W, f, T + 0.02, 'steel_graphite', [0, H + f / 2, 0], { r: 0.004 });
  for (const s of [-1, 1]) b.box(W + 0.13, 0.07, 0.012, 'steel_graphite', [0, H + 0.035, s * (T / 2 + 0.006)], { r: 0.003 });
  // leaf with vision panel (cut-out filled with glass)
  const lw = W - 2 * f - 0.006, lh = H - 0.012, lt = 0.045;
  const leaf = new THREE.Shape(); leaf.moveTo(-lw / 2, 0); leaf.lineTo(lw / 2, 0); leaf.lineTo(lw / 2, lh); leaf.lineTo(-lw / 2, lh); leaf.lineTo(-lw / 2, 0);
  leaf.holes.push(roundedRectShape(0.18, 0.7, 0.01, lw / 2 - 0.2, 1.4));
  const lg = extrude(leaf, lt, { bevel: 0.002 }); lg.translate(0, 0.006, T / 2 - lt - 0.005); b.add(lg, 'door_leaf');
  b.box(0.19, 0.71, 0.008, 'acrylic_smoke', [lw / 2 - 0.2, 0.006 + 1.4, T / 2 - lt / 2 - 0.005], { r: 0.001, ...NS });
  for (const z of [T / 2 - 0.004, T / 2 - lt - 0.006]) {
    const bead = roundedRectShape(0.2, 0.72, 0.012); bead.holes.push(roundedRectShape(0.18, 0.7, 0.01));
    const bg = extrude(bead, 0.004); bg.translate(lw / 2 - 0.2, 0.006 + 1.4, z - 0.002); b.add(bg, 'plastic_black');
  }
  // kick plates
  b.box(lw - 0.02, 0.25, 0.002, 'stainless', [0, 0.14, T / 2 - 0.004], { r: 0.0005 });
  // lever handles both sides
  for (const s of [-1, 1]) {
    const hz = s > 0 ? T / 2 - 0.004 : T / 2 - lt - 0.006;
    b.box(0.04, 0.2, 0.01, 'stainless', [-lw / 2 + 0.07, 1.05, hz + s * 0.005], { r: 0.004 });
    b.cyl(0.011, 0.011, 0.05, 'stainless', [-lw / 2 + 0.07, 1.08, hz + s * 0.03], { rot: [Math.PI / 2, 0, 0], radial: 16 });
    b.box(0.13, 0.02, 0.022, 'stainless', [-lw / 2 + 0.13, 1.08, hz + s * 0.055], { r: 0.009 });
    b.cyl(0.009, 0.009, 0.01, 'chrome', [-lw / 2 + 0.07, 0.98, hz + s * 0.008], { rot: [Math.PI / 2, 0, 0], radial: 16 });
  }
  // closer on the inside face (+Z = room side)
  b.box(0.3, 0.06, 0.06, 'aluminium', [0.1, H - 0.08, T / 2 + 0.03], { r: 0.01 });
  b.box(0.25, 0.015, 0.02, 'aluminium', [0.05, H + 0.04, T / 2 + 0.05], { rot: [0, 0.3, 0], r: 0.005 });
  // hinges
  for (const hy of [0.25, 1.05, 1.85]) b.cyl(0.009, 0.009, 0.1, 'stainless', [lw / 2 + 0.003, hy, T / 2 - 0.004], { radial: 12 });
  // signage
  b.add(new THREE.PlaneGeometry(0.2, 0.08), 'label', { uv: 'keep', pos: [0, 1.62, T / 2 - 0.0035] });
  return b.toScene({ category: 'opening', nativeSize: [W, H, T] });
}

/**
 * Aluminium window with frosted lower glazing, clear upper light, interior sill and venetian blinds.
 * Origin: opening centre at sill level (y = 0), wall centre plane.
 */
export function window_unit() {
  const b = new Builder('window');
  const W = 1.4, H = 1.2, T = 0.14, f = 0.06;
  const prof = roundedRectShape(f, 0.08, 0.004);
  const bars = [[-W / 2 + f / 2, H / 2, 'v'], [W / 2 - f / 2, H / 2, 'v'], [0, f / 2, 'h'], [0, H - f / 2, 'h'], [0, H * 0.62, 'h'], [0, H * 0.31, 'v']];
  for (const [x, y, o] of bars) {
    if (o === 'v' && x === 0) continue;
    if (o === 'v') b.box(f, H, 0.08, 'aluminium', [x, y, -0.01], { r: 0.004 });
    else b.box(W, f * (y === H * 0.62 ? 0.7 : 1), 0.08, 'aluminium', [0, y, -0.01], { r: 0.004 });
  }
  void prof;
  b.box(W - 2 * f, H * 0.62 - f * 1.35, 0.024, 'glass_frosted', [0, f + (H * 0.62 - f * 1.35) / 2, -0.01], { r: 0.001, ...NS });
  b.box(W - 2 * f, H * 0.38 - f * 1.35, 0.024, 'glass', [0, H * 0.62 + f * 0.35 + (H * 0.38 - f * 1.35) / 2, -0.01], { r: 0.001, ...NS });
  // window handle
  b.box(0.03, 0.06, 0.02, 'aluminium', [W / 2 - f - 0.04, H * 0.8, 0.04], { r: 0.006 });
  b.box(0.02, 0.12, 0.018, 'aluminium', [W / 2 - f - 0.04, H * 0.8 - 0.06, 0.055], { r: 0.008 });
  // reveals (lining the wall opening)
  for (const s of [-1, 1]) b.box(0.012, H + 0.02, T, 'plastic_white', [s * (W / 2 + 0.006), H / 2, 0], { r: 0.001 });
  b.box(W + 0.024, 0.012, T, 'plastic_white', [0, H + 0.006, 0], { r: 0.001 });
  // interior sill & exterior drip sill
  b.box(W + 0.12, 0.025, 0.2, 'laminate_white', [0, -0.0125, T / 2 + 0.03], { r: 0.004 });
  b.box(W + 0.06, 0.012, 0.14, 'aluminium', [0, -0.03, -T / 2 - 0.04], { rot: [0.15, 0, 0], r: 0.002 });
  // venetian blinds (partially lowered)
  const blindTop = H - 0.03, slats = 26, pitch = 0.025, bz = T / 2 + 0.035;
  b.box(W - 0.02, 0.035, 0.035, 'plastic_white', [0, blindTop, bz], { r: 0.006 });
  const slat = new THREE.BoxGeometry(W - 0.04, 0.0012, 0.025);
  for (let i = 0; i < slats; i++) b.add(slat, 'steel_white', { pos: [0, blindTop - 0.03 - i * pitch, bz], rot: [0.9, 0, 0], castShadow: true });
  b.box(W - 0.03, 0.012, 0.03, 'plastic_white', [0, blindTop - 0.035 - slats * pitch, bz], { r: 0.004 });
  for (const x of [-W * 0.35, 0, W * 0.35]) b.cyl(0.0008, 0.0008, slats * pitch + 0.02, 'plastic_white', [x, blindTop - 0.02 - slats * pitch / 2, bz], { radial: 4 });
  b.cyl(0.002, 0.002, 0.5, 'plastic_white', [W / 2 - 0.03, blindTop - 0.3, bz + 0.02], { radial: 6 });
  b.anchor('daylight', [0, H * 0.55, -0.2], { light: 'window', width: W - 0.12, height: H - 0.12 });
  return b.toScene({ category: 'opening', nativeSize: [W, H, T] });
}

/** Recessed LED ceiling panel 120 x 60 cm. Origin: centre of the visible face at ceiling level, facing down. */
export function ceiling_panel() {
  const b = new Builder('ceiling_panel');
  const W = 1.2, D = 0.6;
  const ring = roundedRectShape(W + 0.03, D + 0.03, 0.004); ring.holes.push(roundedRectShape(W - 0.01, D - 0.01, 0.002));
  const fr = extrude(ring, 0.012, { bevel: 0.002 }); fr.rotateX(Math.PI / 2); fr.translate(0, 0.002, 0); b.add(fr, 'aluminium');
  b.add(new THREE.PlaneGeometry(W - 0.01, D - 0.01).rotateX(Math.PI / 2), 'panel_led', { pos: [0, -0.004, 0], ...NS });
  return b.toScene({ category: 'fixture' });
}

/** Double wall socket (origin: wall face centre, +Z out of the wall). */
export function outlet() {
  const b = new Builder('outlet');
  b.box(0.16, 0.085, 0.012, 'plastic_white', [0, 0, 0.006], { r: 0.006 });
  for (const s of [-1, 1]) {
    b.cyl(0.024, 0.024, 0.003, 'plastic_white', [s * 0.04, 0, 0.0125], { rot: [Math.PI / 2, 0, 0], radial: 24 });
    for (const h of [-1, 1]) b.cyl(0.0025, 0.0025, 0.004, 'plastic_black', [s * 0.04 + h * 0.01, 0, 0.013], { rot: [Math.PI / 2, 0, 0], radial: 8 });
  }
  return b.toScene({ category: 'technical' });
}

/** Electrical sub-distribution board with conduit runs and a controller display. */
export function control_panel() {
  const b = new Builder('control_panel');
  const W = 0.5, H = 0.6, D = 0.14;
  b.box(W, H, D, 'steel_white', [0, H / 2, D / 2], { r: 0.008 });
  b.box(W - 0.04, H - 0.04, 0.012, 'steel_white', [0, H / 2, D + 0.004], { r: 0.004 });
  b.box(0.2, 0.26, 0.004, 'acrylic_smoke', [-0.08, H * 0.6, D + 0.011], { r: 0.002 });
  for (let i = 0; i < 8; i++) b.box(0.017, 0.05, 0.02, i % 3 === 0 ? 'accent_red' : 'plastic_white', [-0.165 + i * 0.024, H * 0.64, D + 0.004], { r: 0.002 });
  b.box(0.12, 0.08, 0.004, 'plastic_black', [0.14, H * 0.7, D + 0.011], { r: 0.004 });
  b.box(0.09, 0.035, 0.002, 'display', [0.14, H * 0.71, D + 0.0135], { r: 0 });
  b.box(0.05, 0.012, 0.002, 'display_green', [0.14, H * 0.66, D + 0.0135], { r: 0 });
  b.cyl(0.01, 0.01, 0.01, 'chrome', [W / 2 - 0.05, H / 2, D + 0.012], { rot: [Math.PI / 2, 0, 0] });
  b.box(0.1, 0.04, 0.001, 'label_amber', [-0.14, 0.1, D + 0.0105], { r: 0 });
  // conduits up to the ceiling and down
  for (const x of [-0.15, -0.05, 0.08, 0.18]) {
    b.cyl(0.012, 0.012, 1.2, 'plastic_grey', [x, H + 0.6, 0.02], { radial: 12 });
    for (const y of [H + 0.3, H + 0.9]) b.box(0.03, 0.02, 0.02, 'plastic_grey', [x, y, 0.012], { r: 0.004 });
  }
  b.cyl(0.012, 0.012, 0.8, 'plastic_grey', [0.0, -0.4, 0.02], { radial: 12 });
  return b.toScene({ category: 'technical', nativeSize: [W, H, 0.16] });
}

/** Wall-mounted split air-conditioning unit (origin: bottom centre on the wall face). */
export function ac_unit() {
  const b = new Builder('ac_unit');
  const W = 0.9, H = 0.3, D = 0.22;
  const prof = new THREE.Shape(); prof.moveTo(0, 0); prof.lineTo(0.2, 0); prof.quadraticCurveTo(D, 0.02, D, 0.12); prof.lineTo(D - 0.01, H - 0.02); prof.quadraticCurveTo(D - 0.02, H, D - 0.06, H); prof.lineTo(0, H); prof.lineTo(0, 0);
  const g = extrude(prof, W, { bevel: 0.006, curveSegments: 10 }); g.rotateY(-Math.PI / 2); g.translate(W / 2, 0, 0);
  b.add(g, 'plastic_white');
  b.box(W - 0.06, 0.03, 0.12, 'plastic_grey', [0, 0.02, 0.13], { rot: [0.5, 0, 0], r: 0.006 });
  b.box(0.05, 0.012, 0.002, 'display', [W / 2 - 0.1, 0.1, D + 0.001], { r: 0 });
  b.cyl(0.02, 0.02, 1.2, 'plastic_white', [W / 2 - 0.03, H + 0.6, 0.03], { radial: 12 });
  return b.toScene({ category: 'technical', nativeSize: [W, H, D] });
}

/** Floor-standing dehumidifier: rounded two-tone housing, louvred outlet, control panel, water tank. */
export function dehumidifier() {
  const b = new Builder('dehumidifier');
  const W = 0.4, D = 0.3, H = 0.62;
  b.box(W, H - 0.035, D, 'plastic_white', [0, 0.035 + (H - 0.035) / 2, 0], { r: 0.035, seg: 4 });
  // darker lower tank section with finger recess and level window
  b.box(W + 0.002, 0.2, D * 0.62, 'plastic_grey', [0, 0.035 + 0.1, D * 0.2], { r: 0.03, seg: 3 });
  b.box(0.12, 0.018, 0.01, 'plastic_black', [0, 0.2, D / 2 + 0.002], { r: 0.006 });
  b.box(0.012, 0.09, 0.004, 'acrylic_smoke', [W / 2 - 0.05, 0.12, D / 2 + 0.001], { r: 0.003 });
  // top: angled control panel & louvred air outlet
  b.box(0.2, 0.012, 0.09, 'plastic_black', [0.05, H - 0.004, D / 2 - 0.06], { r: 0.004 });
  b.box(0.05, 0.002, 0.022, 'display_green', [0.1, H + 0.003, D / 2 - 0.06], { r: 0 });
  for (let i = 0; i < 3; i++) b.cyl(0.008, 0.008, 0.004, 'plastic_grey', [0.0 + i * 0.03 - 0.03, H + 0.003, D / 2 - 0.06], { radial: 12 });
  for (let i = 0; i < 9; i++) b.box(W - 0.1, 0.004, 0.012, 'plastic_grey', [0, H - 0.002, -D / 2 + 0.05 + i * 0.016], { rot: [0.5, 0, 0], r: 0.001 });
  // rear intake grille & side handles
  b.add(new THREE.PlaneGeometry(W - 0.08, 0.26).rotateY(Math.PI), 'perforated', { pos: [0, 0.38, -D / 2 - 0.001], uvScale: 20, castShadow: false });
  for (const s of [-1, 1]) b.box(0.006, 0.03, 0.12, 'plastic_black', [s * (W / 2 + 0.001), H - 0.08, 0], { r: 0.003 });
  // castors & power cable
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.018, 0.018, 0.022, 'rubber_black', [sx * (W / 2 - 0.05), 0.018, sz * (D / 2 - 0.05)], { rot: [0, 0, Math.PI / 2] });
  const cable = new THREE.CatmullRomCurve3([new THREE.Vector3(0.12, 0.3, -D / 2), new THREE.Vector3(0.14, 0.12, -D / 2 - 0.04), new THREE.Vector3(0.2, 0.004, -D / 2 - 0.1), new THREE.Vector3(0.3, 0.004, -D / 2 - 0.12)]);
  b.add(new THREE.TubeGeometry(cable, 24, 0.003, 6), 'cable_black', { uv: 'keep' });
  return b.toScene({ category: 'technical', nativeSize: [W, H, D] });
}

/** Wall thermo-hygrometer / environment sensor (origin wall face). */
export function sensor() {
  const b = new Builder('sensor');
  b.box(0.1, 0.1, 0.025, 'plastic_white', [0, 0, 0.0125], { r: 0.01 });
  b.box(0.07, 0.045, 0.002, 'display', [0, 0.012, 0.026], { r: 0 });
  b.box(0.05, 0.012, 0.002, 'display_green', [0, -0.025, 0.026], { r: 0 });
  return b.toScene({ category: 'technical' });
}

/** Room plant: large-leaf philodendron in a dark ceramic planter. */
export function plant_large() {
  const b = new Builder('plant_large');
  pot(b, { pos: [0, 0, 0], r: 0.2, h: 0.42, slotName: 'ceramic_dark' });
  bigLeafPlant(b, { pos: [0, 0.38, 0], height: 0.95, leaves: 12, leafSize: 0.34, seed: 6 });
  return b.toScene({ category: 'plant' });
}

/** Snake plant in a tall white planter. */
export function plant_snake() {
  const b = new Builder('plant_snake');
  pot(b, { pos: [0, 0, 0], r: 0.14, h: 0.36, slotName: 'ceramic_white' });
  sansevieria(b, { pos: [0, 0.33, 0], size: 0.75, leaves: 11, seed: 12 });
  return b.toScene({ category: 'plant' });
}

/** Fern / palm style plant in a terracotta pot. */
export function plant_fern() {
  const b = new Builder('plant_fern');
  pot(b, { pos: [0, 0, 0], r: 0.15, h: 0.28, slotName: 'terracotta' });
  fern(b, { pos: [0, 0.27, 0], size: 0.55, fronds: 14, seed: 17 });
  return b.toScene({ category: 'plant' });
}

/** Perforated steel cable tray on wall brackets with cable bundle and drops (origin: wall face, bottom centre). */
export function cable_tray() {
  const b = new Builder('cable_tray');
  const W = 3.8, D = 0.15, H = 0.06;
  b.box(W, 0.002, D, 'steel_graphite', [0, 0.001, D / 2 + 0.03], { r: 0 });
  for (const s of [-1, 1]) b.box(W, H, 0.002, 'steel_graphite', [0, H / 2, D / 2 + 0.03 + s * D / 2], { r: 0 });
  b.add(new THREE.PlaneGeometry(W, H - 0.01), 'perforated', { pos: [0, H / 2, D + 0.032], uvScale: 30, castShadow: false });
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 0.15 + i * ((W - 0.3) / 6);
    b.box(0.012, 0.012, D + 0.04, 'steel_graphite', [x, -0.007, (D + 0.03) / 2], { r: 0.002 });
    b.box(0.03, 0.09, 0.004, 'steel_graphite', [x, -0.02, 0.002], { r: 0.001 });
    b.box(0.012, 0.06, 0.012, 'steel_graphite', [x, -0.035, 0.02], { rot: [-0.9, 0, 0], r: 0.002 });
  }
  // cable bundle along the tray
  for (let c = 0; c < 6; c++) {
    const z = 0.06 + (c % 3) * 0.035, y = 0.012 + Math.floor(c / 3) * 0.012;
    b.cyl(0.005, 0.005, W - 0.02, c % 2 ? 'cable_grey' : 'cable_black', [0, y, z], { rot: [0, 0, Math.PI / 2], radial: 8 });
  }
  // drops towards the enclosures below
  for (const x of [-1.55, -0.95, -0.2, 0.55, 1.4]) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(x, 0.02, 0.1), new THREE.Vector3(x + 0.02, -0.05, 0.13), new THREE.Vector3(x + 0.03, -0.35, 0.05), new THREE.Vector3(x + 0.03, -0.8, 0.02)]);
    b.add(new THREE.TubeGeometry(c, 20, 0.004, 6), 'cable_black', { uv: 'keep' });
  }
  return b.toScene({ category: 'technical', nativeSize: [W, H, D + 0.03] });
}

/** Husbandry schedule board: aluminium-framed whiteboard with printed sheets and magnets. */
export function info_board() {
  const b = new Builder('info_board');
  const W = 1.2, H = 0.8, D = 0.02;
  b.box(W, H, D, 'aluminium', [0, H / 2, D / 2], { r: 0.006 });
  b.box(W - 0.03, H - 0.03, 0.004, 'ceramic_white', [0, H / 2, D + 0.001], { r: 0.001 });
  const sheets = [[-0.38, 0.52, 0.21, 0.297], [-0.13, 0.5, 0.21, 0.297], [0.3, 0.55, 0.297, 0.21]];
  for (const [x, y, w, h] of sheets) {
    b.add(new THREE.PlaneGeometry(w, h), 'label', { uv: 'keep', pos: [x, y, D + 0.0035] });
    b.cyl(0.008, 0.008, 0.006, 'accent_red', [x, y + h / 2 - 0.015, D + 0.005], { rot: [Math.PI / 2, 0, 0], radial: 12 });
  }
  for (let i = 0; i < 5; i++) b.box(0.28, 0.006, 0.001, 'plastic_black', [0.28, 0.32 - i * 0.035, D + 0.0035], { r: 0 });
  b.box(0.4, 0.02, 0.04, 'aluminium', [0.25, 0.02, D + 0.02], { r: 0.004 });
  b.cyl(0.006, 0.006, 0.12, 'plastic_black', [0.2, 0.04, D + 0.025], { rot: [0, 0, Math.PI / 2], radial: 10 });
  b.cyl(0.006, 0.006, 0.12, 'accent_red', [0.34, 0.04, D + 0.025], { rot: [0, 0, Math.PI / 2], radial: 10 });
  return b.toScene({ category: 'technical', nativeSize: [W, H, D] });
}

/** Illuminated emergency exit sign (origin: wall face, bottom centre). */
export function exit_sign() {
  const b = new Builder('exit_sign');
  b.box(0.36, 0.16, 0.05, 'plastic_white', [0, 0.08, 0.025], { r: 0.008 });
  b.box(0.32, 0.12, 0.002, 'display_green', [0, 0.08, 0.051], { r: 0 });
  return b.toScene({ category: 'technical', nativeSize: [0.36, 0.16, 0.05] });
}

/** Wall-mounted fire extinguisher on a bracket (origin: wall face, bottom). */
export function fire_extinguisher() {
  const b = new Builder('fire_extinguisher');
  const prof = [[0, 0], [0.07, 0], [0.078, 0.02], [0.078, 0.44], [0.06, 0.5], [0.025, 0.52], [0, 0.52]];
  b.addM(lathe(prof, 32), 'accent_red', matrix([0, 0, 0.1]));
  b.cyl(0.016, 0.02, 0.06, 'chrome', [0, 0.55, 0.1], { radial: 16 });
  b.box(0.12, 0.015, 0.03, 'plastic_black', [0.02, 0.585, 0.1], { rot: [0, 0, -0.2], r: 0.005 });
  const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0.02, 0.56, 0.12), new THREE.Vector3(0.1, 0.45, 0.16), new THREE.Vector3(0.09, 0.2, 0.17), new THREE.Vector3(0.07, 0.1, 0.16)]);
  b.add(new THREE.TubeGeometry(hose, 20, 0.008, 8), 'rubber_black', { uv: 'keep' });
  b.box(0.1, 0.12, 0.002, 'label', [0, 0.28, 0.179], { r: 0 });
  b.box(0.06, 0.3, 0.02, 'steel_graphite', [0, 0.35, 0.01], { r: 0.004 });
  return b.toScene({ category: 'technical', nativeSize: [0.16, 0.6, 0.18] });
}

/** Square ceiling air diffuser (60 x 60) with concentric louvres. Origin: centre, ceiling plane, facing down. */
export function ceiling_diffuser() {
  const b = new Builder('ceiling_diffuser');
  for (let i = 0; i < 4; i++) {
    const s = 0.58 - i * 0.12, t = 0.035;
    const ring = roundedRectShape(s, s, 0.004); ring.holes.push(roundedRectShape(s - t * 2, s - t * 2, 0.003));
    const g = extrude(ring, 0.01 + i * 0.012); g.rotateX(Math.PI / 2); g.translate(0, 0.002, 0);
    b.add(g, 'steel_white');
  }
  b.box(0.12, 0.004, 0.12, 'steel_white', [0, -0.05, 0], { r: 0.002 });
  b.box(0.52, 0.002, 0.52, 'plastic_black', [0, 0.012, 0], { r: 0 });
  return b.toScene({ category: 'fixture' });
}
