// Work furniture: workbench, sink unit, shelving, storage cabinet.
import { THREE, Builder, extrude, roundedRectShape, lathe, matrix, taperedTube } from '../lib/kit.mjs';
import { mulberry32 } from '../lib/noise.mjs';
import { mirror } from '../lib/enclosures.mjs';

const NS = { castShadow: false };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function squareTubeY(b, x, z, y0, len, s = 0.04, slotName = 'steel_graphite') {
  const g = extrude(roundedRectShape(s, s, 0.004), len); g.rotateX(-Math.PI / 2); g.translate(x, y0, z); b.add(g, slotName);
}

function tool(b, kind, x, y, z) {
  if (kind === 'tongs') {
    for (const s of [-1, 1]) b.box(0.008, 0.3, 0.003, 'stainless', [x + s * 0.006, y - 0.15, z], { rot: [0, 0, s * 0.03], r: 0.001 });
    b.box(0.02, 0.03, 0.006, 'plastic_black', [x, y - 0.012, z], { r: 0.003 });
  } else if (kind === 'hook') {
    b.cyl(0.004, 0.004, 0.45, 'stainless', [x, y - 0.225, z], { radial: 8 });
    b.cyl(0.012, 0.012, 0.12, 'plastic_black', [x, y - 0.06, z], { radial: 12 });
    const c = new THREE.CatmullRomCurve3([V(x, y - 0.45, z), V(x + 0.02, y - 0.47, z), V(x + 0.035, y - 0.45, z)]);
    b.add(new THREE.TubeGeometry(c, 10, 0.003, 6), 'stainless', { uv: 'keep' });
  } else if (kind === 'scissors') {
    for (const s of [-1, 1]) b.box(0.006, 0.1, 0.002, 'stainless', [x + s * 0.004, y - 0.1, z], { rot: [0, 0, s * 0.08], r: 0.0008 });
    for (const s of [-1, 1]) b.addM(new THREE.TorusGeometry(0.012, 0.004, 6, 16), 'accent_red', matrix([x + s * 0.014, y - 0.035, z]));
  } else if (kind === 'spray') {
    b.cyl(0.03, 0.032, 0.16, 'plastic_white', [x, y + 0.08, z], { radial: 20 });
    b.box(0.02, 0.05, 0.05, 'plastic_black', [x, y + 0.185, z + 0.01], { r: 0.006 });
    b.box(0.012, 0.04, 0.01, 'plastic_black', [x, y + 0.155, z + 0.03], { r: 0.003 });
  }
}

/** Heavy-duty workbench: steel frame, oak top, drawer pedestal, pegboard with task light. */
export function workbench() {
  const b = new Builder('workbench');
  const W = 1.8, D = 0.75, H = 0.9, topT = 0.04;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    squareTubeY(b, sx * (W / 2 - 0.05), sz * (D / 2 - 0.05), 0.012, H - topT - 0.012);
    b.cyl(0.02, 0.022, 0.012, 'rubber_black', [sx * (W / 2 - 0.05), 0.006, sz * (D / 2 - 0.05)]);
  }
  // frame rails and lower shelf
  for (const sz of [-1, 1]) { b.box(W - 0.06, 0.05, 0.03, 'steel_graphite', [0, H - topT - 0.03, sz * (D / 2 - 0.05)], { r: 0.004 }); }
  for (const sx of [-1, 1]) { b.box(0.03, 0.05, D - 0.06, 'steel_graphite', [sx * (W / 2 - 0.05), H - topT - 0.03, 0], { r: 0.004 }); b.box(0.03, 0.03, D - 0.1, 'steel_graphite', [sx * (W / 2 - 0.05), 0.16, 0], { r: 0.004 }); }
  b.box(W - 0.12, 0.02, D - 0.12, 'steel_graphite', [0, 0.18, 0], { r: 0.003 });
  // oak worktop
  b.box(W, topT, D, 'oak', [0, H - topT / 2, 0], { r: 0.004, seg: 3 });
  // drawer pedestal (right)
  const px = W / 2 - 0.32, pw = 0.5, ph = H - topT - 0.08 - 0.2;
  b.box(pw, ph, D - 0.1, 'steel_graphite', [px, 0.2 + ph / 2, 0], { r: 0.004 });
  for (let i = 0; i < 3; i++) {
    const dh = ph / 3 - 0.008, dy = 0.2 + 0.004 + dh / 2 + i * (dh + 0.008);
    b.box(pw - 0.012, dh, 0.02, 'steel_graphite', [px, dy, D / 2 - 0.05 + 0.01], { r: 0.003 });
    b.box(pw * 0.5, 0.014, 0.016, 'aluminium', [px, dy + dh * 0.28, D / 2 - 0.02], { r: 0.005 });
    b.box(0.05, 0.016, 0.001, 'label', [px - pw * 0.36, dy + dh * 0.28, D / 2 - 0.029], { r: 0 });
  }
  // pegboard back panel on uprights
  const pz = -D / 2 + 0.02, py0 = H + 0.02, py1 = 1.95;
  for (const sx of [-1, 1]) squareTubeY(b, sx * (W / 2 - 0.03), pz, H, py1 - H, 0.035);
  b.box(W - 0.02, 0.04, 0.05, 'steel_graphite', [0, py1 - 0.02, pz + 0.01], { r: 0.004 });
  b.add(new THREE.PlaneGeometry(W - 0.1, py1 - py0 - 0.06), 'pegboard', { pos: [0, (py0 + py1 - 0.06) / 2, pz], uvScale: 20 });
  // pegboard frame (the wall shows through the perforation)
  for (const s of [-1, 1]) b.box(0.025, py1 - py0 - 0.06, 0.02, 'steel_graphite', [s * (W / 2 - 0.06), (py0 + py1 - 0.06) / 2, pz - 0.006], { r: 0.003 });
  // task light under the top rail
  b.box(W - 0.16, 0.02, 0.05, 'aluminium', [0, py1 - 0.055, pz + 0.05], { r: 0.004 });
  b.add(new THREE.PlaneGeometry(W - 0.2, 0.03).rotateX(Math.PI / 2), 'led_warm', { pos: [0, py1 - 0.0655, pz + 0.05], ...NS });
  b.anchor('light_task', [0, py1 - 0.075, pz + 0.08], { light: 'rect', width: W - 0.2, height: 0.08, intensity: 5, color: 0xffe8c8, always: true });
  // shelf on pegboard with deli cups and boxes
  b.box(0.7, 0.012, 0.18, 'steel_graphite', [-0.45, 1.45, pz + 0.09], { r: 0.002 });
  for (const s of [-1, 1]) b.box(0.01, 0.1, 0.16, 'steel_graphite', [-0.45 + s * 0.33, 1.4, pz + 0.08], { r: 0.002 });
  for (let i = 0; i < 4; i++) b.addM(lathe([[0, 0], [0.045, 0], [0.055, 0.2], [0.052, 0.2], [0.043, 0.003], [0, 0.003]], 24), 'pp_translucent', matrix([-0.7 + i * 0.12, 1.456, pz + 0.09]), NS);
  b.box(0.18, 0.12, 0.14, 'cardboard', [-0.2, 1.516, pz + 0.09], { r: 0.003 });
  // hanging tools
  tool(b, 'tongs', 0.25, 1.75, pz + 0.012); tool(b, 'tongs', 0.3, 1.75, pz + 0.012);
  tool(b, 'hook', 0.42, 1.8, pz + 0.014); tool(b, 'scissors', 0.55, 1.62, pz + 0.01);
  for (const x of [0.25, 0.3, 0.42, 0.55]) b.cyl(0.002, 0.002, 0.03, 'chrome', [x, 1.76, pz + 0.015], { rot: [Math.PI / 2, 0, 0], radial: 6 });
  // on the worktop: digital scale, notebook, spray bottle, tablet
  const ty = H;
  b.box(0.22, 0.03, 0.2, 'plastic_black', [-0.55, ty + 0.015, 0.05], { r: 0.008 });
  b.box(0.2, 0.004, 0.18, 'stainless', [-0.55, ty + 0.032, 0.05], { r: 0.002 });
  b.box(0.08, 0.02, 0.004, 'display', [-0.55, ty + 0.018, 0.151], { r: 0 });
  b.box(0.21, 0.012, 0.3, 'paper', [-0.15, ty + 0.006, 0.1], { rot: [0, 0.15, 0], r: 0.002 });
  b.box(0.215, 0.004, 0.305, 'fabric_dark', [-0.15, ty + 0.0125, 0.1], { rot: [0, 0.15, 0], r: 0.001 });
  tool(b, 'spray', 0.25, ty, -0.15);
  b.box(0.26, 0.008, 0.18, 'plastic_black', [0.45, ty + 0.004, 0.08], { rot: [0, -0.2, 0], r: 0.006 });
  b.box(0.24, 0.001, 0.16, 'display', [0.45, ty + 0.0085, 0.08], { rot: [0, -0.2, 0], r: 0 });
  // power strip + cable on the rear
  b.box(0.35, 0.03, 0.05, 'plastic_white', [0.4, ty + 0.015, -D / 2 + 0.06], { r: 0.008 });
  for (let i = 0; i < 4; i++) b.cyl(0.012, 0.012, 0.002, 'plastic_grey', [0.28 + i * 0.08, ty + 0.031, -D / 2 + 0.06], { radial: 16 });
  return b.toScene({ category: 'furniture', nativeSize: [W, 1.95, D] });
}

/** Stainless sink unit with deep basin, gooseneck tap, tiled splashback and dispensers. */
export function sink_unit() {
  const b = new Builder('sink_unit');
  const W = 0.9, D = 0.6, H = 0.9;
  // cabinet
  b.box(W - 0.02, 0.08, D - 0.06, 'plastic_black', [0, 0.04, -0.02], { r: 0.003 });
  for (const s of [-1, 1]) b.box(0.02, H - 0.12, D - 0.02, 'stainless', [s * (W / 2 - 0.01), 0.08 + (H - 0.12) / 2, 0], { r: 0.003 });
  b.box(W - 0.04, H - 0.12, 0.012, 'stainless', [0, 0.08 + (H - 0.12) / 2, -D / 2 + 0.006], { r: 0.002 });
  for (const s of [-1, 1]) {
    b.box(W / 2 - 0.016, H - 0.13, 0.018, 'stainless', [s * (W / 4 - 0.002), 0.08 + (H - 0.13) / 2 + 0.003, D / 2 - 0.03], { r: 0.003 });
    b.box(0.012, 0.14, 0.012, 'stainless', [s * 0.04, H - 0.18, D / 2 - 0.01], { r: 0.005 });
  }
  // worktop with basin cut-out
  const top = new THREE.Shape(); top.moveTo(-W / 2, -D / 2); top.lineTo(W / 2, -D / 2); top.lineTo(W / 2, D / 2); top.lineTo(-W / 2, D / 2); top.lineTo(-W / 2, -D / 2);
  const bw = 0.5, bd = 0.38, bx = -0.05, bz = 0.02;
  top.holes.push(roundedRectShape(bw, bd, 0.04, bx, -bz));
  const tg = extrude(top, 0.04, { bevel: 0.003 }); tg.rotateX(-Math.PI / 2); tg.translate(0, H - 0.04, 0);
  b.add(tg, 'stainless');
  // basin: extruded rounded wall + floor
  const wall = roundedRectShape(bw, bd, 0.04); wall.holes.push(roundedRectShape(bw - 0.004, bd - 0.004, 0.038));
  const wg = extrude(wall, 0.22); wg.rotateX(-Math.PI / 2); wg.translate(bx, H - 0.26, bz); b.add(wg, 'stainless');
  const fl = new THREE.ShapeGeometry(roundedRectShape(bw, bd, 0.04), 8); fl.rotateX(-Math.PI / 2); fl.translate(bx, H - 0.255, bz); b.add(fl, 'stainless');
  b.cyl(0.03, 0.03, 0.004, 'chrome', [bx, H - 0.253, bz + 0.08], { radial: 24 });
  b.cyl(0.012, 0.012, 0.005, 'plastic_black', [bx, H - 0.252, bz + 0.08], { radial: 16 });
  // upstand + tiled splashback (0.6 m)
  b.box(W, 0.1, 0.02, 'stainless', [0, H + 0.05, -D / 2 + 0.01], { r: 0.003 });
  b.box(W, 0.6, 0.012, 'tiles', [0, H + 0.1 + 0.3, -D / 2 + 0.006], { r: 0.001 });
  // gooseneck tap
  const tx = bx, tz = -D / 2 + 0.07;
  b.cyl(0.028, 0.03, 0.05, 'chrome', [tx, H + 0.025, tz], { radial: 24 });
  const neck = new THREE.CatmullRomCurve3([V(tx, H + 0.05, tz), V(tx, H + 0.3, tz), V(tx, H + 0.37, tz + 0.08), V(tx, H + 0.3, tz + 0.2), V(tx, H + 0.24, tz + 0.21)]);
  b.add(taperedTube(neck, () => 0.013, 40, 16), 'chrome', { uv: 'keep' });
  b.box(0.012, 0.012, 0.12, 'chrome', [tx + 0.045, H + 0.12, tz], { rot: [0.5, 0, 0], r: 0.005 });
  // soap & paper towel dispensers on the tiles
  b.box(0.1, 0.18, 0.09, 'plastic_white', [0.33, H + 0.35, -D / 2 + 0.06], { r: 0.012 });
  b.box(0.06, 0.03, 0.02, 'plastic_grey', [0.33, H + 0.26, -D / 2 + 0.1], { r: 0.006 });
  b.box(0.28, 0.3, 0.12, 'stainless', [0.18, H + 0.85, -D / 2 + 0.07], { r: 0.01 });
  b.box(0.2, 0.02, 0.004, 'plastic_black', [0.18, H + 0.72, -D / 2 + 0.131], { r: 0.001 });
  // disinfectant bottle on the counter
  b.cyl(0.035, 0.035, 0.2, 'plastic_white', [0.35, H + 0.1, -0.12], { radial: 20 });
  b.cyl(0.015, 0.02, 0.03, 'accent_red', [0.35, H + 0.215, -0.12], { radial: 16 });
  b.box(0.07, 0.08, 0.001, 'label_amber', [0.35, H + 0.1, -0.085], { r: 0 });
  return b.toScene({ category: 'furniture', nativeSize: [W, H, D] });
}

/** Five-level steel shelving loaded with supplies (bins, substrate bags, boxes, deli cups). */
export function shelving() {
  const b = new Builder('shelving');
  const W = 1.2, D = 0.45, H = 1.9;
  const angle = new THREE.Shape(); angle.moveTo(0, 0); angle.lineTo(0.035, 0); angle.lineTo(0.035, 0.002); angle.lineTo(0.002, 0.002); angle.lineTo(0.002, 0.035); angle.lineTo(0, 0.035);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = extrude(angle, H); g.rotateX(-Math.PI / 2);
    mirror(g, -sx, sz);
    g.translate(sx * W / 2, 0, sz * D / 2); b.add(g, 'steel_graphite');
    // bolt heads on the uprights
    for (const y of [0.1, 0.5, 0.9, 1.3, 1.7]) b.cyl(0.004, 0.004, 0.003, 'chrome', [sx * (W / 2 + 0.001), y + 0.02, sz * (D / 2 - 0.02)], { rot: [0, 0, Math.PI / 2], radial: 8 });
  }
  const levels = [0.1, 0.5, 0.9, 1.3, 1.7];
  for (const y of levels) {
    b.box(W - 0.008, 0.012, D - 0.008, 'steel_graphite', [0, y, 0], { r: 0.002 });
    b.box(W - 0.008, 0.03, 0.004, 'steel_graphite', [0, y - 0.012, D / 2 - 0.004], { r: 0.001 });
    b.box(0.08, 0.02, 0.001, 'label', [-W / 2 + 0.1, y - 0.012, D / 2 - 0.001], { r: 0 });
  }
  const rnd = mulberry32(91);
  const bin = (x, y, w, h, d, slotName) => {
    b.box(w, 0.004, d, slotName, [x, y + 0.002, 0], { r: 0.002 });
    for (const s of [-1, 1]) b.box(0.004, h, d, slotName, [x + s * (w / 2 - 0.002), y + h / 2, 0], { r: 0.001 });
    b.box(w, h, 0.004, slotName, [x, y + h / 2, -d / 2 + 0.002], { r: 0.001 });
    b.box(w, h * 0.6, 0.004, slotName, [x, y + h * 0.3, d / 2 - 0.002], { r: 0.001 });
    b.box(w * 0.5, 0.025, 0.001, 'label', [x, y + h * 0.35, d / 2 + 0.0005], { r: 0 });
  };
  // level 1: substrate sacks (soft pillow shapes with printed labels)
  for (let i = 0; i < 3; i++) {
    const g = new THREE.BoxGeometry(0.3, 0.13, 0.36, 8, 4, 8);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k) / 0.15, y = p.getY(k) / 0.065, z = p.getZ(k) / 0.18;
      const bulge = (1 - x * x * 0.35) * (1 - z * z * 0.25);
      p.setY(k, p.getY(k) * bulge + (y < 0 ? 0 : 0.012 * (1 - x * x) * (1 - z * z)));
      p.setX(k, p.getX(k) * (1 - Math.abs(y) * 0.06)); p.setZ(k, p.getZ(k) * (1 - Math.abs(y) * 0.05));
    }
    g.computeVertexNormals();
    const x0 = -0.38 + i * 0.38;
    b.add(g, i === 1 ? 'sack' : 'cardboard', { pos: [x0, 0.106 + 0.065, 0], rot: [0, (i - 1) * 0.08, 0] });
    b.add(new THREE.PlaneGeometry(0.18, 0.09).rotateX(-Math.PI / 2), 'sack_label', { pos: [x0, 0.106 + 0.14, 0.02], rot: [0, (i - 1) * 0.08, 0], castShadow: false });
  }
  // level 2: blue-grey storage bins
  for (let i = 0; i < 3; i++) bin(-0.38 + i * 0.38, 0.506, 0.34, 0.18, 0.38, 'plastic_grey');
  // level 3: cardboard boxes, deli cup stacks
  b.box(0.36, 0.22, 0.3, 'cardboard', [-0.36, 0.906 + 0.11, 0], { r: 0.004 });
  b.box(0.3, 0.16, 0.3, 'cardboard', [0.02, 0.906 + 0.08, 0.02], { r: 0.004 });
  for (let i = 0; i < 3; i++) b.addM(lathe([[0, 0], [0.05, 0], [0.058, 0.26], [0.055, 0.26], [0.047, 0.004], [0, 0.004]], 24), 'pp_translucent', matrix([0.3 + (i % 2) * 0.12, 0.906, -0.08 + i * 0.09]), NS);
  // level 4: bins in white
  for (let i = 0; i < 2; i++) bin(-0.28 + i * 0.56, 1.306, 0.5, 0.22, 0.38, 'plastic_white');
  // level 5: paper towel rolls & spray bottles
  for (let i = 0; i < 4; i++) b.cyl(0.06, 0.06, 0.24, 'paper', [-0.45 + i * 0.13, 1.706 + 0.12, 0.02], { radial: 24 });
  for (let i = 0; i < 3; i++) tool(b, 'spray', 0.15 + i * 0.1, 1.706, 0.05 - rnd() * 0.05);
  return b.toScene({ category: 'furniture', nativeSize: [W, H, D] });
}

/** Tall two-door steel storage cabinet. */
export function storage_cabinet() {
  const b = new Builder('storage_cabinet');
  const W = 0.9, D = 0.5, H = 2.0;
  b.box(W, H - 0.05, D - 0.02, 'steel_graphite', [0, 0.05 + (H - 0.05) / 2, -0.01], { r: 0.006 });
  b.box(W - 0.02, 0.05, D - 0.06, 'plastic_black', [0, 0.025, -0.02], { r: 0.003 });
  for (const s of [-1, 1]) {
    const dx = s * (W / 4 - 0.001);
    b.box(W / 2 - 0.006, H - 0.08, 0.018, 'steel_graphite', [dx, 0.05 + (H - 0.08) / 2 + 0.015, D / 2 - 0.012], { r: 0.004 });
    // ventilation louvres top & bottom
    for (const vy of [H - 0.25, 0.25]) for (let i = 0; i < 5; i++) b.box(0.18, 0.006, 0.006, 'plastic_black', [dx, vy + i * 0.014, D / 2 - 0.002], { r: 0.002 });
    b.box(0.08, 0.035, 0.001, 'label', [dx, H - 0.4, D / 2 - 0.002], { r: 0 });
  }
  // swing handle + lock
  b.box(0.022, 0.16, 0.03, 'aluminium', [0.05, 1.05, D / 2 + 0.01], { r: 0.008 });
  b.cyl(0.01, 0.01, 0.01, 'chrome', [0.05, 1.16, D / 2 + 0.002], { rot: [Math.PI / 2, 0, 0], radial: 16 });
  // hazard/ownership stripe
  b.box(W - 0.02, 0.012, 0.001, 'steel_amber', [0, H - 0.03, D / 2 - 0.002], { r: 0 });
  return b.toScene({ category: 'furniture', nativeSize: [W, H, D] });
}
