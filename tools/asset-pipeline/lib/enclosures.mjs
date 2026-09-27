// Construction of glass enclosures: frames, panes, sliding/hinged doors, tracks, vents, lids, lighting.
import { THREE, Builder, extrude, roundedRectShape, lProfileShape, trackShape, bar, lathe, matrix } from './kit.mjs';

const GLASS_T = 0.005;

/** Mirror geometry in X/Z and fix triangle winding when the determinant is negative. */
export function mirror(g, sx, sz) {
  g.scale(sx, 1, sz);
  if (sx * sz < 0) {
    if (!g.index) { const n = g.attributes.position.count; g.setIndex([...Array(n).keys()]); }
    const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
    g.index.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}
const NS = { castShadow: false };

function labelCard(b, { x, y, z, w = 0.07, h = 0.03 }) {
  b.box(w + 0.006, h + 0.006, 0.002, 'plastic_black', [x, y, z - 0.001], { r: 0.001 });
  const g = new THREE.PlaneGeometry(w, h); // UV 0..1 keeps the runtime label texture undistorted
  b.add(g, 'label', { uv: 'keep', pos: [x, y, z + 0.0005] });
}

function ledBar(b, { w, y, z, temp = 'warm', depth = 0.04 }) {
  const housing = extrude(roundedRectShape(depth, 0.014, 0.005), w, { bevel: 0.001 });
  housing.rotateY(Math.PI / 2); housing.translate(-w / 2, y + 0.007, z);
  b.add(housing, 'aluminium');
  for (const s of [-1, 1]) b.box(0.006, 0.016, depth + 0.004, 'plastic_black', [s * (w / 2 + 0.003), y + 0.008, z], { r: 0.002 });
  // diffuser underside
  b.add(new THREE.PlaneGeometry(w - 0.01, depth * 0.7).rotateX(Math.PI / 2), temp === 'warm' ? 'led_warm' : 'led_cool', { pos: [0, y - 0.0003, z], ...NS });
  // power cable leaving at the back
  const c = new THREE.CatmullRomCurve3([new THREE.Vector3(w / 2 - 0.02, y + 0.014, z), new THREE.Vector3(w / 2 - 0.03, y + 0.02, z - 0.1), new THREE.Vector3(w / 2 - 0.05, y + 0.005, z - 0.25)]);
  b.add(new THREE.TubeGeometry(c, 20, 0.0025, 6), 'cable_black', { uv: 'keep' });
}

function baskingLamp(b, { x, y, z }) {
  // Dome reflector sitting on the mesh, bulb visible from below.
  const prof = [[0.004, 0.11], [0.03, 0.105], [0.065, 0.075], [0.082, 0.03], [0.086, 0.0], [0.083, 0.0], [0.079, 0.03], [0.062, 0.072], [0.028, 0.1], [0.004, 0.104]];
  b.addM(lathe(prof, 36), 'steel_graphite', matrix([x, y, z]));
  b.addM(lathe([[0, 0.12], [0.012, 0.118], [0.014, 0.105], [0.004, 0.1]], 16), 'plastic_black', matrix([x, y, z]));
  b.addM(new THREE.SphereGeometry(0.03, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.7), 'bulb_hot', matrix([x, y + 0.045, z], [Math.PI, 0, 0]), NS);
}

function uvbFixture(b, { w, y, z }) {
  const shape = new THREE.Shape(); // reflector housing profile
  shape.moveTo(-0.022, 0); shape.lineTo(-0.018, 0.022); shape.lineTo(0.018, 0.022); shape.lineTo(0.022, 0); shape.lineTo(0.019, 0); shape.lineTo(0.016, 0.019); shape.lineTo(-0.016, 0.019); shape.lineTo(-0.019, 0);
  const h = extrude(shape, w); h.rotateY(Math.PI / 2); h.translate(-w / 2, y, z);
  b.add(h, 'aluminium');
  const tube = new THREE.CylinderGeometry(0.008, 0.008, w - 0.03, 16); tube.rotateZ(Math.PI / 2); tube.translate(0, y + 0.01, z);
  b.add(tube, 'uvb_tube', NS);
  for (const s of [-1, 1]) b.box(0.012, 0.024, 0.046, 'plastic_black', [s * (w / 2 - 0.004), y + 0.012, z], { r: 0.002 });
}

/**
 * Framed glass terrarium shell.
 * Origin: centre of footprint at the underside. Front faces +Z.
 * Returns interior bounds for decoration.
 */
export function glassTerrarium(b, { W, D, H, style = 'sliding', light = 'warm', basking = false, uvb = false, frontVent = 0.05, frame = 'frame_black' }) {
  const baseH = 0.03, topH = 0.022, a = 0.016, pt = 0.0018;
  const rimless = style === 'rimless';
  // --- base tray ---
  if (!rimless) {
    b.box(W, baseH, D, 'plastic_black', [0, baseH / 2, 0], { r: 0.004 });
    b.box(W - 0.02, 0.003, 0.002, 'aluminium', [0, baseH * 0.55, D / 2 + 0.0005], { r: 0.0008 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.012, 0.014, 0.006, 'rubber_black', [sx * (W / 2 - 0.04), -0.002, sz * (D / 2 - 0.04)]);
  }
  const y0 = rimless ? 0 : baseH;
  const glassH = H - y0 - (rimless ? 0 : topH * 0.5);
  // --- corner profiles (L-angle) ---
  if (!rimless) {
    const L = lProfileShape(a, pt, 0.001);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const g = extrude(L, H - y0 - topH);
      g.rotateX(-Math.PI / 2);            // legs now along +X and -Z, length along +Y
      mirror(g, -sx, sz);                 // point both legs into the enclosure
      g.translate(sx * W / 2, y0, sz * D / 2);
      b.add(g, frame);
    }
  } else {
    // black silicone corner seams
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.006, H - 0.004, 0.006, 'silicone_black', [sx * (W / 2 - GLASS_T - 0.002), H / 2, sz * (D / 2 - GLASS_T - 0.002)], { r: 0.002 });
    b.box(W - 0.01, 0.004, 0.004, 'silicone_black', [0, 0.004, D / 2 - GLASS_T - 0.002], { r: 0.0015 });
    b.box(W, 0.012, D, 'glass', [0, 0.006, 0], { r: 0.0015, ...NS });
    // black frit band at the bottom front hides the substrate edge
  }
  // --- glass panes (back + sides) ---
  b.box(W - 0.004, glassH, GLASS_T, 'glass', [0, y0 + glassH / 2, -D / 2 + GLASS_T / 2 + 0.001], { r: 0.001, ...NS });
  for (const s of [-1, 1]) b.box(GLASS_T, glassH, D - 0.004, 'glass', [s * (W / 2 - GLASS_T / 2 - 0.001), y0 + glassH / 2, 0], { r: 0.001, ...NS });
  // --- top frame ---
  const topY = H - topH;
  if (!rimless) {
    const rail = roundedRectShape(0.02, topH, 0.003);
    for (const s of [-1, 1]) {
      const gx = extrude(rail, W - 0.002); gx.rotateY(Math.PI / 2); gx.translate(-W / 2 + 0.001, topY + topH / 2, s * (D / 2 - 0.01)); b.add(gx, frame);
      const gz = extrude(rail, D - 0.04); gz.translate(s * (W / 2 - 0.01), topY + topH / 2, -D / 2 + 0.02); b.add(gz, frame);
    }
    // centre cross bar + insect mesh screen
    b.box(0.018, 0.012, D - 0.03, frame, [0, H - 0.008, 0], { r: 0.003 });
    const mesh = new THREE.PlaneGeometry(W - 0.036, D - 0.036).rotateX(-Math.PI / 2);
    b.add(mesh, 'mesh_screen', { pos: [0, H - 0.004, 0], uvScale: 4, ...NS });
    for (const s of [-1, 1]) b.box(0.012, 0.006, 0.04, 'plastic_black', [s * W * 0.3, H + 0.002, D / 2 - 0.012], { r: 0.002 }); // lid clips
  } else {
    // glass lids on clip holders + ventilation strip at the back
    for (const s of [-1, 1]) b.box(W / 2 - 0.012, GLASS_T, D * 0.72, 'glass', [s * (W / 4 - 0.002), H + 0.004, D * 0.1], { r: 0.001, ...NS });
    for (const s of [-1, 0, 1]) b.box(0.03, 0.01, 0.012, 'plastic_black', [s * (W / 2 - 0.03), H - 0.002, D / 2 - 0.008], { r: 0.002 });
    const vent = new THREE.PlaneGeometry(W - 0.02, D * 0.2).rotateX(-Math.PI / 2);
    b.add(vent, 'mesh_screen', { pos: [0, H - 0.002, -D / 2 + D * 0.11], uvScale: 4, ...NS });
  }

  // --- front ---
  const frontZ = D / 2;
  let doorY0 = y0, doorY1 = topY;
  if (frontVent > 0 && !rimless) {
    // lower ventilation strip: perforated sheet between rails
    b.box(W - 0.004, 0.004, 0.012, frame, [0, y0 + 0.002, frontZ - 0.006], { r: 0.0015 });
    b.add(new THREE.PlaneGeometry(W - 0.03, frontVent - 0.006), 'perforated', { pos: [0, y0 + frontVent / 2, frontZ - 0.004], uvScale: 12, ...NS });
    doorY0 = y0 + frontVent;
  }
  if (style === 'sliding') {
    const tr = trackShape(0.02, 0.012, 2);
    const bt = extrude(tr, W - 0.004); bt.rotateY(Math.PI / 2); bt.translate(-W / 2 + 0.002, doorY0, frontZ - 0.01); b.add(bt, 'aluminium');
    const tt = extrude(tr, W - 0.004); tt.rotateY(Math.PI / 2); tt.rotateX(Math.PI); tt.translate(-W / 2 + 0.002, doorY1, frontZ - 0.01); b.add(tt, 'aluminium');
    const dh = doorY1 - doorY0 - 0.012, dw = W / 2 + 0.02;
    const zs = [frontZ - 0.0045, frontZ - 0.0135];
    for (const [i, s] of [[0, -1], [1, 1]]) {
      const cx = s * (W / 4 - 0.008);
      b.box(dw - 0.02, dh, GLASS_T, 'glass', [cx, doorY0 + 0.009 + dh / 2, zs[i]], { r: 0.0015, ...NS });
      // vertical rubber edge + finger pull near the meeting edge
      const inner = cx - s * (dw / 2 - 0.012);
      b.box(0.004, dh, GLASS_T + 0.003, 'silicone_black', [cx + s * (dw / 2 - 0.012), doorY0 + 0.009 + dh / 2, zs[i]], { r: 0.0012 });
      b.box(0.009, Math.min(0.08, dh * 0.2), 0.006, 'plastic_black', [inner + s * 0.025, doorY0 + dh * 0.5, zs[i] + GLASS_T / 2 + 0.003], { r: 0.003 });
    }
    // lock cylinder on the overlap
    b.cyl(0.007, 0.007, 0.012, 'chrome', [0.004, doorY0 + 0.03, frontZ + 0.002], { rot: [Math.PI / 2, 0, 0], radial: 20 });
    b.box(0.0015, 0.006, 0.002, 'plastic_black', [0.004, doorY0 + 0.03, frontZ + 0.0085], { r: 0 });
  } else if (style === 'hinged') {
    const dh = doorY1 - doorY0 - 0.006, dw = W / 2 - 0.004;
    for (const s of [-1, 1]) {
      const cx = s * (W / 4);
      b.box(dw - 0.004, dh, GLASS_T, 'glass', [cx, doorY0 + dh / 2 + 0.003, frontZ - 0.004], { r: 0.0015, ...NS });
      // hinge blocks top/bottom at the outer edge
      for (const hy of [doorY0 + 0.012, doorY0 + dh - 0.008]) b.box(0.035, 0.016, 0.018, 'plastic_black', [s * (W / 2 - 0.02), hy, frontZ - 0.004], { r: 0.003 });
      // door edge trims
      b.box(0.006, dh, GLASS_T + 0.004, 'plastic_black', [s * 0.004, doorY0 + dh / 2 + 0.003, frontZ - 0.004], { r: 0.002 });
    }
    // central lock latch
    b.box(0.03, 0.05, 0.02, 'plastic_black', [0, doorY0 + dh * 0.55, frontZ + 0.006], { r: 0.005 });
    b.cyl(0.006, 0.006, 0.01, 'chrome', [0, doorY0 + dh * 0.55 + 0.008, frontZ + 0.016], { rot: [Math.PI / 2, 0, 0] });
  } else if (rimless) {
    // front pane with black frit band at bottom and a sliding front vent at top
    const fh = H - 0.08;
    b.box(W - 0.004, fh, GLASS_T, 'glass', [0, fh / 2, frontZ - GLASS_T / 2 - 0.001], { r: 0.001, ...NS });
    b.box(W - 0.006, 0.05, 0.0008, 'silicone_black', [0, 0.025, frontZ - 0.0005], { r: 0 });
    b.add(new THREE.PlaneGeometry(W - 0.03, 0.06), 'perforated', { pos: [0, fh + 0.04, frontZ - 0.004], uvScale: 12, ...NS });
    b.box(W - 0.004, 0.01, 0.01, 'aluminium', [0, fh + 0.005, frontZ - 0.006], { r: 0.002 });
    b.box(W - 0.004, 0.01, 0.01, 'aluminium', [0, H - 0.005, frontZ - 0.006], { r: 0.002 });
  }

  // --- lighting on top ---
  const yTop = H + (rimless ? 0.008 : 0.001);
  if (rimless) {
    // suspended LED fixture on aluminium legs
    const fy = H + 0.14;
    for (const s of [-1, 1]) {
      b.box(0.008, fy - H, 0.008, 'aluminium', [s * (W / 2 - 0.05), H + (fy - H) / 2, 0], { r: 0.002 });
      b.box(0.03, 0.006, D * 0.9, 'aluminium', [s * (W / 2 - 0.05), H + 0.006, 0], { r: 0.002 });
    }
    ledBar(b, { w: W - 0.06, y: fy, z: 0, temp: light, depth: 0.09 });
  } else {
    ledBar(b, { w: W - 0.08, y: yTop, z: D * 0.18, temp: light, depth: style === 'hinged' ? 0.07 : 0.045 });
    if (uvb) uvbFixture(b, { w: W * 0.6, y: yTop, z: -D * 0.12 });
    if (basking) baskingLamp(b, { x: -W * 0.28, y: yTop, z: -D * 0.05 });
  }
  labelCard(b, { x: W / 2 - 0.06, y: rimless ? 0.025 : baseH * 0.5, z: frontZ + (rimless ? 0.0015 : 0.001), w: 0.07, h: rimless ? 0.03 : 0.018 });

  const lightY = rimless ? H + 0.13 : H - 0.012;
  b.anchor('light_main', [0, lightY, rimless ? 0 : D * 0.1], { light: 'rect', width: W - 0.1, height: D * 0.55, intensity: rimless ? 7 : 7, drop: lightY - y0 - 0.06, color: light === 'warm' ? 0xffe2bc : 0xe6f0ff });
  if (basking) b.anchor('light_basking', [-W * 0.28, H - 0.03, -D * 0.05], { light: 'point', intensity: 0.25, distance: 0.6, color: 0xffa04a });

  return {
    x0: -W / 2 + GLASS_T + 0.003, x1: W / 2 - GLASS_T - 0.003,
    z0: -D / 2 + GLASS_T + 0.003, z1: frontZ - 0.024,
    floor: y0 + (rimless ? 0.012 : 0.002), top: topY,
  };
}

/** Cabinet stand with doors, handles and plinth (graphite laminate by default). */
export function cabinetStand(b, { W, D, H, slotName = 'laminate_grey', doors = 2, y = 0 }) {
  const plinth = 0.06, top = 0.025;
  b.box(W - 0.02, plinth, D - 0.05, 'plastic_black', [0, y + plinth / 2, -0.01], { r: 0.003 });
  b.box(W, top, D, slotName, [0, y + H - top / 2, 0], { r: 0.004 });
  for (const s of [-1, 1]) b.box(0.018, H - top - plinth, D, slotName, [s * (W / 2 - 0.009), y + plinth + (H - top - plinth) / 2, 0], { r: 0.002 });
  b.box(W - 0.036, H - top - plinth, 0.012, slotName, [0, y + plinth + (H - top - plinth) / 2, -D / 2 + 0.006], { r: 0.002 });
  const dh = H - top - plinth - 0.006, dw = (W - 0.006 * (doors + 1)) / doors;
  for (let i = 0; i < doors; i++) {
    const cx = -W / 2 + 0.006 + dw / 2 + i * (dw + 0.006);
    b.box(dw, dh, 0.018, slotName, [cx, y + plinth + 0.003 + dh / 2, D / 2 - 0.009], { r: 0.0025 });
    const hx = cx + (i % 2 === 0 ? dw / 2 - 0.035 : -dw / 2 + 0.035);
    // bar handle with standoffs
    b.box(0.01, 0.16, 0.01, 'aluminium', [hx, y + plinth + dh - 0.14, D / 2 + 0.022], { r: 0.004 });
    for (const oy of [-0.065, 0.065]) b.cyl(0.004, 0.004, 0.018, 'aluminium', [hx, y + plinth + dh - 0.14 + oy, D / 2 + 0.01], { rot: [Math.PI / 2, 0, 0], radial: 12 });
  }
}
