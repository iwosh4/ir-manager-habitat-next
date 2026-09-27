// Enclosure models: the most important visual assets of the facility.
import { THREE, Builder, extrude, roundedRectShape, lathe, matrix, taperedTube } from '../lib/kit.mjs';
import { glassTerrarium, cabinetStand } from '../lib/enclosures.mjs';
import { mulberry32, fbm3 } from '../lib/noise.mjs';
import {
  rockGeo, branchWithTwigs, corkTube, substrate, clayPebbles, backgroundPanel, bromeliad, fern, sansevieria, vine,
  groundCover, succulent, grassTuft, waterBowl, gecko,
} from '../lib/nature.mjs';

const NS = { castShadow: false };

/** Glass terrarium, arid/savanna (python / monitor style). 100 x 50 x 50 cm, sliding doors. */
export function terrarium_arid() {
  const b = new Builder('terrarium_arid');
  const W = 1.0, D = 0.5, H = 0.5;
  const I = glassTerrarium(b, { W, D, H, style: 'sliding', light: 'warm', basking: true, uvb: true });
  backgroundPanel(b, { w: I.x1 - I.x0, h: I.top - I.floor - 0.01, y0: I.floor, z: I.z0, depth: 0.055, slotName: 'rock', seed: 3 });
  for (const s of [-1, 1]) {
    const g = new THREE.PlaneGeometry(D * 0.55, I.top - I.floor - 0.02, 12, 16);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, (fbm3(p.getX(i) * 8, p.getY(i) * 8, s, 4, 5) * 0.5 + 0.5) * 0.03 * Math.min(1, (p.getX(i) / (D * 0.275) + 1) * 2));
    g.computeVertexNormals(); g.rotateY(s * -Math.PI / 2); g.translate(s * I.x1 * 0.995, I.floor + (I.top - I.floor) / 2 - 0.005, I.z0 + D * 0.27);
    b.add(g, 'rock', NS);
  }
  const surf = (x, z) => I.floor + 0.045 + (1 - (z - I.z0) / (I.z1 - I.z0)) * 0.05 + fbm3(x * 5, 0, z * 5, 3, 2) * 0.02;
  substrate(b, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.01, z1: I.z1 + 0.018, y0: I.floor, surface: surf, topSlot: 'sand', res: 60 });
  // basking stack of sandstone slabs under the lamp
  const bx = -W * 0.28, bz = -D * 0.08;
  b.add(rockGeo({ r: 0.12, sx: 1.1, sy: 0.35, sz: 0.8, seed: 11 }), 'rock', { pos: [bx, surf(bx, bz) + 0.015, bz] });
  b.add(rockGeo({ r: 0.09, sx: 1, sy: 0.3, sz: 0.9, seed: 12 }), 'rock', { pos: [bx + 0.02, surf(bx, bz) + 0.05, bz + 0.01], rot: [0, 0.6, 0.05] });
  b.add(rockGeo({ r: 0.05, sx: 1, sy: 0.6, sz: 0.9, seed: 13 }), 'rock', { pos: [bx + 0.14, surf(bx + 0.14, bz + 0.1) + 0.01, bz + 0.1] });
  b.add(rockGeo({ r: 0.035, sx: 1, sy: 0.6, sz: 1, seed: 14 }), 'rock', { pos: [0.3, surf(0.3, 0.12) + 0.008, 0.12] });
  // branch climbing from front right to back left
  branchWithTwigs(b, 'bark', { points: [[0.42, surf(0.42, 0.08), 0.08], [0.25, 0.14, 0.0], [0.05, 0.25, -0.08], [-0.12, 0.33, -0.14]], r0: 0.022, r1: 0.01, seed: 4, twigs: 2 });
  corkTube(b, { len: 0.28, r: 0.07, pos: [0.22, surf(0.22, -0.1) - 0.012, -0.1], rotY: 0.25 });
  waterBowl(b, { pos: [-0.3, surf(-0.3, 0.14) - 0.008, 0.14], r: 0.075, slotName: 'ceramic_dark' });
  sansevieria(b, { pos: [0.4, surf(0.4, -0.15) - 0.005, -0.15], size: 0.28, leaves: 6, seed: 21 });
  succulent(b, { pos: [0.02, surf(0.02, 0.15) - 0.004, 0.15], size: 0.05, seed: 22 });
  succulent(b, { pos: [0.1, surf(0.1, 0.17) - 0.004, 0.17], size: 0.035, seed: 23 });
  succulent(b, { pos: [-0.44, surf(-0.44, -0.12) - 0.004, -0.12], size: 0.045, seed: 24 });
  for (const [x, z, s] of [[-0.12, 0.05, 31], [0.36, 0.16, 32], [-0.4, 0.05, 33], [0.05, -0.16, 34]]) grassTuft(b, { pos: [x, surf(x, z) - 0.003, z], height: 0.1, seed: s });
  for (let i = 0; i < 14; i++) { const r = mulberry32(40 + i); const x = (r() - 0.5) * 0.8, z = (r() - 0.3) * 0.35; b.add(rockGeo({ r: 0.008 + r() * 0.012, seed: 50 + i, detail: 1 }), 'rock', { pos: [x, surf(x, z), z] }); }
  b.anchor('animal_spot', [-0.02, surf(-0.02, 0.02), 0.02], { animal: 'python' });
  b.cull(new THREE.Box3(new THREE.Vector3(I.x0, I.floor, I.z0), new THREE.Vector3(I.x1, I.top, I.z1 + 0.02)));
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, H, D] });
}

/** Tall tropical terrarium, front-opening hinged doors. 60 x 45 x 90 cm. */
export function terrarium_tropical() {
  const b = new Builder('terrarium_tropical');
  const W = 0.6, D = 0.45, H = 0.9;
  const I = glassTerrarium(b, { W, D, H, style: 'hinged', light: 'cool', frontVent: 0.07 });
  backgroundPanel(b, { w: I.x1 - I.x0, h: I.top - I.floor - 0.01, y0: I.floor, z: I.z0, depth: 0.06, slotName: 'cork', seed: 9, ledges: false });
  const drainTop = I.floor + 0.045;
  const surf = (x, z) => drainTop + 0.05 + (1 - (z - I.z0) / (I.z1 - I.z0)) * 0.04 + fbm3(x * 7, 1, z * 7, 3, 7) * 0.015;
  substrate(b, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.012, z1: I.z1 + 0.02, y0: I.floor, surface: surf, layers: [{ slot: 'clay_pebble', top: drainTop }, { slot: 'fabric_dark', top: drainTop + 0.004 }], topSlot: 'soil', res: 40 });
  clayPebbles(b, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.012, z1: I.z1 + 0.02, y0: I.floor, y1: drainTop, seed: 5 });
  // moss mounds on the ground
  for (const [x, z, s] of [[-0.18, 0.1, 1], [0.15, 0.05, 1.3], [0.0, -0.1, 0.8]]) {
    const g = new THREE.SphereGeometry(0.05 * s, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1.3, 0.35, 1);
    b.add(g, 'moss', { pos: [x, surf(x, z) - 0.004, z] });
  }
  branchWithTwigs(b, 'bark', { points: [[-0.2, surf(-0.2, 0.05), 0.05], [-0.1, 0.35, -0.02], [0.05, 0.55, -0.08], [0.2, 0.74, -0.12]], r0: 0.02, r1: 0.009, seed: 8, twigs: 3 });
  branchWithTwigs(b, 'bark', { points: [[0.24, surf(0.24, 0.1), 0.1], [0.15, 0.3, 0.02], [0.02, 0.42, -0.06]], r0: 0.014, r1: 0.007, seed: 9, twigs: 1 });
  bromeliad(b, { pos: [0.05, 0.56, -0.08], size: 0.13, seed: 3, leaves: 12 });
  bromeliad(b, { pos: [-0.17, 0.42, I.z0 + 0.05], size: 0.11, seed: 4, leaves: 11 });
  bromeliad(b, { pos: [0.17, surf(0.17, -0.1), -0.1], size: 0.16, seed: 5, leaves: 14 });
  fern(b, { pos: [-0.2, surf(-0.2, -0.12), -0.12], size: 0.22, seed: 6, fronds: 9 });
  vine(b, { points: [[0.2, surf(0.2, -0.14), -0.14], [0.22, 0.3, I.z0 + 0.05], [0.12, 0.5, I.z0 + 0.06], [-0.05, 0.62, I.z0 + 0.05], [-0.2, 0.75, I.z0 + 0.06]], leafSize: 0.055, seed: 7 });
  vine(b, { points: [[-0.24, 0.8, I.z0 + 0.05], [-0.22, 0.62, I.z0 + 0.07], [-0.24, 0.45, I.z0 + 0.06]], leafSize: 0.05, seed: 8 });
  groundCover(b, { pos: [0.02, surf(0.02, 0.1), 0.1], radius: 0.09, seed: 9, count: 34 });
  groundCover(b, { pos: [-0.12, surf(-0.12, 0.13), 0.13], radius: 0.05, seed: 10, count: 16 });
  // mist nozzle and dripper
  b.cyl(0.006, 0.008, 0.02, 'plastic_black', [0.2, I.top - 0.01, -0.12]);
  b.cyl(0.003, 0.003, 0.012, 'chrome', [0.2, I.top - 0.025, -0.12]);
  b.anchor('animal_spot', [-0.1, surf(-0.1, 0.12) + 0.004, 0.12], { animal: 'gecko', yaw: 0.6 });
  b.cull(new THREE.Box3(new THREE.Vector3(I.x0, I.floor, I.z0), new THREE.Vector3(I.x1, I.top, I.z1 + 0.02)));
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, H, D] });
}

/** Rimless paludarium on an integrated cabinet: water section, land section, waterfall. 120 x 50 x (80 + 60). */
export function paludarium() {
  const b = new Builder('paludarium');
  const W = 1.2, D = 0.5, standH = 0.8, H = 0.6;
  cabinetStand(b, { W, D, H: standH, slotName: 'laminate_grey', doors: 2 });
  const tank = new Builder('tank');
  const I = glassTerrarium(tank, { W, D, H, style: 'rimless', light: 'cool' });
  backgroundPanel(tank, { w: I.x1 - I.x0, h: H - 0.04, y0: I.floor, z: I.z0, depth: 0.07, slotName: 'rock_dark', seed: 12 });
  const waterY = I.floor + 0.2;
  const landX = 0.05;
  const surf = (x, z) => {
    const t = THREE.MathUtils.smoothstep(x, landX - 0.12, landX + 0.12);
    return I.floor + 0.04 + t * 0.2 + (1 - (z - I.z0) / (I.z1 - I.z0)) * 0.03 + fbm3(x * 6, 2, z * 6, 3, 9) * 0.012;
  };
  substrate(tank, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.02, z1: I.z1 + 0.02, y0: I.floor, surface: surf, layers: [{ slot: 'clay_pebble', top: (x) => (x > landX ? I.floor + 0.06 : I.floor + 0.015) }], topSlot: 'soil', skirtSlot: 'soil', res: 64 });
  // aquatic gravel overlay in the water part
  const grav = new THREE.PlaneGeometry(landX - I.x0 + 0.05, I.z1 - I.z0, 30, 12); grav.rotateX(-Math.PI / 2);
  const gp = grav.attributes.position; for (let i = 0; i < gp.count; i++) { const x = gp.getX(i) + (I.x0 + landX) / 2, z = gp.getZ(i); gp.setY(i, surf(x, z) + 0.002); }
  grav.computeVertexNormals(); grav.translate((I.x0 + landX) / 2, 0, (I.z0 + I.z1) / 2 + 0.01); tank.add(grav, 'gravel_wet', { uvScale: 1.5, ...NS });
  // retaining rock wall between land and water
  for (let i = 0; i < 6; i++) { const z = I.z0 + 0.06 + i * 0.065; tank.add(rockGeo({ r: 0.07 + (i % 2) * 0.02, sx: 0.9, sy: 1.3, sz: 0.9, seed: 60 + i }), 'rock_dark', { pos: [landX + 0.02, I.floor + 0.08, z] }); }
  for (let i = 0; i < 5; i++) { const r = mulberry32(70 + i); const x = I.x0 + 0.08 + r() * 0.4, z = I.z0 + 0.1 + r() * 0.3; tank.add(rockGeo({ r: 0.03 + r() * 0.04, sy: 0.7, seed: 80 + i }), 'rock_dark', { pos: [x, surf(x, z) + 0.01, z] }); }
  // water body
  const wx0 = I.x0 + 0.002, wx1 = landX + 0.06;
  tank.box(wx1 - wx0, waterY - I.floor - 0.02, I.z1 - I.z0 + 0.018, 'water', [(wx0 + wx1) / 2, I.floor + 0.02 + (waterY - I.floor - 0.02) / 2, (I.z0 + I.z1 + 0.018) / 2], { r: 0.002, ...NS });
  // waterfall sheet down the background
  const fall = new THREE.PlaneGeometry(0.05, waterY + 0.25 - waterY, 2, 16);
  const fp = fall.attributes.position; for (let i = 0; i < fp.count; i++) { const t = fp.getY(i) / 0.25 + 0.5; fp.setZ(i, 0.07 * (1 - t) * (1 - t) + 0.02); }
  fall.computeVertexNormals(); tank.add(fall, 'water_fall', { pos: [-0.28, waterY + 0.125, I.z0 + 0.03], ...NS });
  // foam ring where the waterfall meets the surface
  tank.add(new THREE.RingGeometry(0.01, 0.06, 24).rotateX(-Math.PI / 2), 'water_fall', { pos: [-0.28, waterY + 0.002, I.z0 + 0.1], ...NS });
  tank.add(rockGeo({ r: 0.06, sx: 1.2, sy: 0.5, sz: 0.8, seed: 90 }), 'rock_dark', { pos: [-0.28, waterY + 0.25, I.z0 + 0.06] });
  // driftwood spanning land & water
  branchWithTwigs(tank, 'driftwood', { points: [[-0.35, I.floor + 0.05, 0.1], [-0.15, waterY + 0.05, 0.02], [0.15, waterY + 0.18, -0.05], [0.4, waterY + 0.3, -0.12]], r0: 0.03, r1: 0.012, seed: 21, twigs: 3 });
  // planting
  bromeliad(tank, { pos: [0.18, waterY + 0.13, -0.06], size: 0.12, seed: 31 });
  bromeliad(tank, { pos: [0.45, surf(0.45, -0.1), -0.1], size: 0.16, seed: 32 });
  fern(tank, { pos: [0.3, surf(0.3, -0.14), -0.14], size: 0.2, seed: 33 });
  fern(tank, { pos: [-0.45, waterY + 0.15, I.z0 + 0.05], size: 0.14, seed: 34, fronds: 7 });
  groundCover(tank, { pos: [0.3, surf(0.3, 0.1), 0.1], radius: 0.1, count: 36, seed: 35 });
  groundCover(tank, { pos: [0.5, surf(0.5, 0.12), 0.12], radius: 0.06, count: 18, seed: 36 });
  vine(tank, { points: [[0.52, surf(0.52, -0.16), -0.16], [0.5, 0.35, I.z0 + 0.06], [0.3, 0.48, I.z0 + 0.07], [0.0, 0.52, I.z0 + 0.07]], leafSize: 0.05, seed: 37 });
  for (const [x, z, s] of [[0.2, 0.0, 1], [0.42, 0.02, 0.8]]) { const g = new THREE.SphereGeometry(0.05 * s, 14, 8, 0, 6.3, 0, 1.57); g.scale(1.4, 0.3, 1); tank.add(g, 'moss', { pos: [x, surf(x, z) - 0.003, z] }); }
  // aquatic plants (strap leaves under water)
  for (let i = 0; i < 4; i++) sansevieria(tank, { pos: [-0.5 + i * 0.1, surf(-0.5 + i * 0.1, -0.12), -0.12], size: 0.15, leaves: 5, seed: 40 + i });
  // pump + heater
  tank.box(0.05, 0.08, 0.04, 'plastic_black', [-0.52, I.floor + 0.08, I.z0 + 0.03], { r: 0.008 });
  tank.add(taperedTube(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.52, I.floor + 0.12, I.z0 + 0.03), new THREE.Vector3(-0.45, waterY + 0.15, I.z0 + 0.02), new THREE.Vector3(-0.3, waterY + 0.26, I.z0 + 0.03)]), () => 0.005, 24, 6), 'pvc_black', { uv: 'keep' });
  tank.cyl(0.009, 0.009, 0.16, 'glass', [-0.4, I.floor + 0.12, I.z0 + 0.03], { ...NS });
  tank.anchor('animal_spot', [0.35, surf(0.35, 0.05), 0.05], { animal: 'frog' });
  tank.cull(new THREE.Box3(new THREE.Vector3(I.x0, I.floor, I.z0), new THREE.Vector3(I.x1, H + 0.005, I.z1 + 0.02)));
  b.include(tank, matrix([0, standH, 0]));
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, standH + H, D] });
}

function smallInterior(b, I, kind, seed) {
  const r = mulberry32(seed);
  if (kind === 'arid') {
    backgroundPanel(b, { w: I.x1 - I.x0, h: I.top - I.floor - 0.01, y0: I.floor, z: I.z0, depth: 0.04, slotName: 'rock', seed });
    const surf = (x, z) => I.floor + 0.03 + fbm3(x * 8, seed, z * 8, 3, 3) * 0.01 + (1 - (z - I.z0) / (I.z1 - I.z0)) * 0.02;
    substrate(b, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.01, z1: I.z1 + 0.018, y0: I.floor, surface: surf, topSlot: 'sand', res: 30 });
    corkTube(b, { len: 0.18, r: 0.045, pos: [0.1, surf(0.1, -0.05) - 0.008, -0.05], rotY: -0.3 });
    b.add(rockGeo({ r: 0.07, sx: 1.2, sy: 0.35, sz: 0.8, seed: seed + 1 }), 'rock', { pos: [-0.12, surf(-0.12, -0.02) + 0.01, -0.02] });
    waterBowl(b, { pos: [-0.12, surf(-0.12, 0.1) - 0.005, 0.1], r: 0.045 });
    succulent(b, { pos: [0.18, surf(0.18, 0.1), 0.1], size: 0.03, seed: seed + 3 });
    return { spot: [0.02, surf(0.02, 0.06), 0.06], animal: 'gecko' };
  }
  if (kind === 'tropical') {
    backgroundPanel(b, { w: I.x1 - I.x0, h: I.top - I.floor - 0.01, y0: I.floor, z: I.z0, depth: 0.04, slotName: 'cork', seed, ledges: false });
    const surf = (x, z) => I.floor + 0.05 + fbm3(x * 8, seed, z * 8, 3, 3) * 0.01;
    substrate(b, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.01, z1: I.z1 + 0.018, y0: I.floor, surface: surf, layers: [{ slot: 'clay_pebble', top: I.floor + 0.025 }], topSlot: 'soil', res: 30 });
    clayPebbles(b, { x0: I.x0, x1: I.x1, z0: I.z0 + 0.01, z1: I.z1 + 0.018, y0: I.floor, y1: I.floor + 0.025, seed });
    fern(b, { pos: [-0.15, surf(-0.15, -0.08), -0.08], size: 0.15, seed: seed + 1, fronds: 7 });
    bromeliad(b, { pos: [0.14, surf(0.14, -0.06), -0.06], size: 0.1, seed: seed + 2 });
    groundCover(b, { pos: [0.02, surf(0.02, 0.08), 0.08], radius: 0.07, seed: seed + 3, count: 22 });
    branchWithTwigs(b, 'bark', { points: [[-0.2, surf(-0.2, 0.1), 0.1], [-0.05, 0.2, 0.0], [0.15, 0.3, -0.08]], r0: 0.012, r1: 0.006, seed: seed + 4, twigs: 1 });
    vine(b, { points: [[0.2, surf(0.2, -0.12), -0.12], [0.18, 0.25, I.z0 + 0.04], [0.0, 0.33, I.z0 + 0.05]], leafSize: 0.04, seed: seed + 5 });
    return { spot: [-0.05, 0.2, 0.0], animal: 'gecko' };
  }
  // empty / prepared enclosure: paper substrate + hide only
  b.add(new THREE.PlaneGeometry(I.x1 - I.x0 - 0.01, I.z1 - I.z0).rotateX(-Math.PI / 2), 'paper', { pos: [0, I.floor + 0.002, (I.z0 + I.z1) / 2], ...NS });
  b.box(0.14, 0.06, 0.1, 'plastic_black', [0.1, I.floor + 0.03, -0.05], { r: 0.01 });
  waterBowl(b, { pos: [-0.12, I.floor + 0.002, 0.06], r: 0.04, slotName: 'stainless' });
  return null;
}

/** Powder-coated steel rack holding six 55x45x45 glass terrariums on three levels. */
export function rack_glass() {
  const b = new Builder('rack_glass');
  const W = 1.2, D = 0.5, H = 1.9, post = 0.035;
  const levels = [0.12, 0.76, 1.4];
  // uprights (rounded square tube) with levelling feet
  const tube = roundedRectShape(post, post, 0.004);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const g = extrude(tube, H - 0.02); g.rotateX(-Math.PI / 2); g.translate(sx * (W / 2 - post / 2), 0.02, sz * (D / 2 - post / 2)); b.add(g, 'steel_graphite');
    b.cyl(0.018, 0.02, 0.012, 'rubber_black', [sx * (W / 2 - post / 2), 0.006, sz * (D / 2 - post / 2)]);
    b.cyl(0.005, 0.005, 0.02, 'stainless', [sx * (W / 2 - post / 2), 0.018, sz * (D / 2 - post / 2)], { radial: 10 });
    b.box(post + 0.002, 0.004, post + 0.002, 'plastic_black', [sx * (W / 2 - post / 2), H - 0.002, sz * (D / 2 - post / 2)], { r: 0.0015 });
  }
  // shelves: folded steel sheet with front lip and side rails
  for (const y of [...levels, 1.87]) {
    b.box(W - 0.01, 0.02, D - 0.01, 'steel_graphite', [0, y - 0.01, 0], { r: 0.003 });
    b.box(W - 0.07, 0.035, 0.02, 'steel_graphite', [0, y - 0.03, D / 2 - 0.015], { r: 0.003 });
    b.box(W - 0.06, 0.004, 0.0015, 'steel_amber', [0, y - 0.03, D / 2 - 0.004], { r: 0 }); // amber identification stripe
  }
  // back cross bracing
  for (const s of [-1, 1]) {
    const len = Math.hypot(W - 0.08, 0.5);
    b.box(len, 0.012, 0.004, 'steel_graphite', [0, 1.09 + s * 0.0, -D / 2 + 0.01], { rot: [0, 0, s * Math.atan2(0.5, W - 0.08)], r: 0.001 });
  }
  const kinds = [['arid', 'tropical'], ['tropical', 'arid'], ['empty', 'arid']];
  levels.forEach((y, li) => {
    for (let ci = 0; ci < 2; ci++) {
      const t = new Builder('t');
      const I = glassTerrarium(t, { W: 0.55, D: 0.45, H: 0.45, style: 'sliding', light: kinds[li][ci] === 'tropical' ? 'cool' : 'warm', frontVent: 0.035 });
      const spot = smallInterior(t, I, kinds[li][ci], 300 + li * 10 + ci);
      t.cull(new THREE.Box3(new THREE.Vector3(I.x0, I.floor, I.z0), new THREE.Vector3(I.x1, I.top, I.z1 + 0.02)));
      // per-level lighting: only the main anchor of each small tank is kept as an LED, a single rect light per level added below
      t.anchors = t.anchors.filter((a) => a.name !== 'light_main');
      if (spot) t.anchor(`animal_spot_${li}_${ci}`, spot.spot, { animal: spot.animal });
      b.include(t, matrix([(ci - 0.5) * 0.585, y, 0.0]));
    }
    b.anchor(`light_level_${li}`, [0, y + 0.43, 0.02], { light: 'rect', width: 1.05, height: 0.3, intensity: 5, drop: 0.38, color: li === 1 ? 0xe6f0ff : 0xffe2bc });
  });
  // thermostat controller on the right upright
  const cx = W / 2 + 0.035, cy = 1.05;
  b.box(0.05, 0.12, 0.08, 'plastic_white', [cx, cy, D / 2 - 0.08], { r: 0.006 });
  b.box(0.002, 0.03, 0.05, 'display', [cx + 0.026, cy + 0.025, D / 2 - 0.08], { r: 0 });
  for (const dy of [-0.02, -0.035]) b.cyl(0.004, 0.004, 0.004, 'plastic_grey', [cx + 0.026, cy + dy, D / 2 - 0.08], { rot: [0, 0, Math.PI / 2], radial: 10 });
  for (let i = 0; i < 3; i++) {
    const c = new THREE.CatmullRomCurve3([new THREE.Vector3(cx, cy - 0.06, D / 2 - 0.09 + i * 0.01), new THREE.Vector3(cx - 0.01, cy - 0.2, D / 2 - 0.12 - i * 0.02), new THREE.Vector3(W / 2 - 0.02, levels[i] + 0.1, -D / 2 + 0.03)]);
    b.add(new THREE.TubeGeometry(c, 30, 0.0025, 6), 'cable_black', { uv: 'keep' });
  }
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, H, D] });
}

/** Professional breeding rack with 2 x 7 translucent tubs, heat-tape shelves and thermostat. */
export function rack_tubs() {
  const b = new Builder('rack_tubs');
  const W = 1.22, D = 0.62, H = 1.78, t = 0.018, rows = 7, cols = 2;
  const slot = 'pvc_black';
  // carcass
  for (const s of [-1, 1]) b.box(t, H, D, slot, [s * (W / 2 - t / 2), H / 2, 0], { r: 0.003 });
  b.box(t, H - 0.08, D - 0.02, slot, [0, H / 2 + 0.02, -0.01], { r: 0.002 });
  b.box(W, t, D, slot, [0, H - t / 2, 0], { r: 0.003 });
  b.box(W - 2 * t, 0.06, 0.012, slot, [0, 0.03, D / 2 - 0.02], { r: 0.002 });
  b.box(W, 0.012, D, slot, [0, 0.066, 0], { r: 0.002 });
  b.box(W - 2 * t, H - 0.08, 0.006, slot, [0, H / 2 + 0.03, -D / 2 + 0.003], { r: 0 });
  const rowH = (H - 0.1 - t) / rows;
  const tubW = (W - 3 * t) / cols - 0.012, tubH = rowH - 0.03, tubD = D - 0.06;
  for (let r = 0; r < rows; r++) {
    const y = 0.072 + r * rowH;
    if (r > 0) b.box(W - 2 * t, 0.012, D - 0.01, slot, [0, y, 0], { r: 0.002 });
    // heat tape strip visible at the back of each shelf
    for (let c = 0; c < cols; c++) {
      const cx = -W / 2 + t + (c + 0.5) * ((W - 3 * t) / cols) + c * t;
      b.box(tubW * 0.9, 0.0015, 0.08, 'copper', [cx, y + 0.0068, -D / 2 + 0.07], { r: 0 });
      // tub: open box shell in translucent PP with rolled rim & front handle
      const ty = y + 0.008;
      const shellTop = ty + tubH;
      b.box(tubW, 0.004, tubD, 'pp_translucent', [cx, ty + 0.002, 0.02], { r: 0.0015, castShadow: false });
      for (const s of [-1, 1]) b.box(0.003, tubH, tubD, 'pp_translucent', [cx + s * (tubW / 2 - 0.0015), ty + tubH / 2, 0.02], { r: 0.001, castShadow: false });
      b.box(tubW, tubH, 0.003, 'pp_translucent', [cx, ty + tubH / 2, 0.02 - tubD / 2], { r: 0.001, castShadow: false });
      b.box(tubW, tubH, 0.003, 'pp_translucent', [cx, ty + tubH / 2, 0.02 + tubD / 2], { r: 0.001, castShadow: false });
      b.box(tubW + 0.008, 0.008, tubD + 0.008, 'pp_translucent', [cx, shellTop - 0.004, 0.02], { r: 0.003, castShadow: false });
      b.box(tubW * 0.35, 0.018, 0.02, 'pp_translucent', [cx, shellTop - 0.02, 0.02 + tubD / 2 + 0.008], { r: 0.006, castShadow: false });
      // contents: paper, hide, water bowl
      b.box(tubW - 0.01, 0.002, tubD - 0.01, 'paper', [cx, ty + 0.005, 0.02], { r: 0, castShadow: false });
      b.box(0.12, 0.05, 0.1, 'plastic_black', [cx - tubW * 0.25, ty + 0.03, -0.08], { r: 0.012 });
      waterDish(b, cx + tubW * 0.25, ty + 0.006, 0.12);
      // tub label
      b.add(new THREE.PlaneGeometry(0.07, 0.022), 'label', { uv: 'keep', pos: [cx + tubW * 0.3, ty + tubH * 0.55, 0.02 + tubD / 2 + 0.0025] });
    }
  }
  // thermostat on top
  b.box(0.16, 0.1, 0.1, 'plastic_white', [W / 2 - 0.12, H + 0.05, 0.1], { r: 0.008 });
  b.box(0.07, 0.03, 0.002, 'display', [W / 2 - 0.12, H + 0.065, 0.151], { r: 0 });
  b.box(0.03, 0.012, 0.002, 'display_green', [W / 2 - 0.16, H + 0.03, 0.151], { r: 0 });
  const cab = new THREE.CatmullRomCurve3([new THREE.Vector3(W / 2 - 0.12, H + 0.02, 0.05), new THREE.Vector3(W / 2 - 0.1, H + 0.005, -0.15), new THREE.Vector3(W / 2 - 0.05, H - 0.01, -D / 2 - 0.01)]);
  b.add(new THREE.TubeGeometry(cab, 20, 0.003, 6), 'cable_black', { uv: 'keep' });
  // castors
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.02, 0.02, 0.018, 'rubber_black', [sx * (W / 2 - 0.05), 0.02, sz * (D / 2 - 0.06)], { rot: [0, 0, Math.PI / 2] });
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, H, D] });

  function waterDish(bb, x, y, z) {
    bb.addM(lathe([[0, 0], [0.04, 0], [0.045, 0.025], [0.04, 0.025], [0.036, 0.004], [0, 0.004]], 20), 'plastic_white', matrix([x, y, z]));
  }
}

/** White PVC quarantine enclosure on a stainless trolley. Clinical, easy to disinfect. */
export function quarantine() {
  const b = new Builder('quarantine');
  const W = 0.9, D = 0.5, tH = 0.72, eH = 0.42, t = 0.012;
  // stainless trolley
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.cyl(0.013, 0.013, tH - 0.07, 'stainless', [sx * (W / 2 - 0.03), 0.07 + (tH - 0.07) / 2, sz * (D / 2 - 0.03)], { radial: 16 });
    b.cyl(0.028, 0.028, 0.022, 'rubber_black', [sx * (W / 2 - 0.03), 0.028, sz * (D / 2 - 0.03)], { rot: [0, 0, Math.PI / 2] });
    b.box(0.03, 0.02, 0.04, 'stainless', [sx * (W / 2 - 0.03), 0.058, sz * (D / 2 - 0.03)], { r: 0.004 });
  }
  b.box(W, 0.03, D, 'stainless', [0, tH - 0.015, 0], { r: 0.004 });
  b.box(W - 0.04, 0.025, D - 0.04, 'stainless', [0, 0.2, 0], { r: 0.004 });
  // supplies on lower shelf
  b.box(0.25, 0.12, 0.22, 'plastic_white', [-0.2, 0.275, 0], { r: 0.01 });
  b.cyl(0.055, 0.055, 0.22, 'paper', [0.15, 0.27, 0.02], { rot: [0, 0, Math.PI / 2], radial: 24 });
  b.cyl(0.035, 0.03, 0.16, 'plastic_white', [0.33, 0.3, -0.1]);
  // PVC enclosure body
  const y0 = tH;
  b.box(W, t, D, 'pvc_white', [0, y0 + t / 2, 0], { r: 0.004 });
  b.box(W, t, D, 'pvc_white', [0, y0 + eH - t / 2, 0], { r: 0.004 });
  for (const s of [-1, 1]) b.box(t, eH, D, 'pvc_white', [s * (W / 2 - t / 2), y0 + eH / 2, 0], { r: 0.004 });
  b.box(W - 2 * t, eH - 2 * t, t, 'pvc_white', [0, y0 + eH / 2, -D / 2 + t / 2], { r: 0.002 });
  // round vents on both sides
  for (const s of [-1, 1]) for (const vz of [-0.12, 0.12]) {
    const ring = new THREE.RingGeometry(0.03, 0.036, 28); ring.rotateY(s * Math.PI / 2);
    b.add(ring, 'plastic_grey', { pos: [s * (W / 2 + 0.0008), y0 + eH * 0.6, vz] });
    b.add(new THREE.CircleGeometry(0.03, 28).rotateY(s * Math.PI / 2), 'perforated', { pos: [s * (W / 2 + 0.0004), y0 + eH * 0.6, vz], uvScale: 20, ...NS });
  }
  // front: aluminium track + two sliding glass panes + finger pulls
  b.box(W - 0.02, 0.012, 0.02, 'aluminium', [0, y0 + t + 0.006, D / 2 - 0.012], { r: 0.002 });
  b.box(W - 0.02, 0.012, 0.02, 'aluminium', [0, y0 + eH - t - 0.006, D / 2 - 0.012], { r: 0.002 });
  const gh = eH - 2 * t - 0.02;
  b.box(W / 2 + 0.01, gh, 0.005, 'glass', [-W / 4 + 0.01, y0 + eH / 2, D / 2 - 0.007], { r: 0.001, ...NS });
  b.box(W / 2 + 0.01, gh, 0.005, 'glass', [W / 4 - 0.01, y0 + eH / 2, D / 2 - 0.016], { r: 0.001, ...NS });
  for (const [x, z] of [[-0.02, D / 2 - 0.003], [0.02, D / 2 - 0.012]]) b.box(0.01, 0.07, 0.008, 'plastic_grey', [x, y0 + eH / 2, z], { r: 0.003 });
  // quarantine band & label
  b.box(W - 0.02, 0.028, 0.002, 'label_amber', [0, y0 + eH - 0.022, D / 2 + 0.001], { r: 0 });
  b.add(new THREE.PlaneGeometry(0.1, 0.035), 'label', { uv: 'keep', pos: [W / 2 - 0.09, y0 + 0.028, D / 2 + 0.002] });
  // interior: paper, hide, stainless bowl, thermometer probe
  b.add(new THREE.PlaneGeometry(W - 0.04, D - 0.05).rotateX(-Math.PI / 2), 'paper', { pos: [0, y0 + t + 0.001, 0], ...NS });
  b.box(0.16, 0.08, 0.12, 'plastic_black', [0.22, y0 + t + 0.04, -0.08], { r: 0.015 });
  b.addM(lathe([[0, 0], [0.05, 0], [0.058, 0.035], [0.054, 0.035], [0.046, 0.004], [0, 0.004]], 28), 'stainless', matrix([-0.22, y0 + t, 0.05]));
  b.add(new THREE.CircleGeometry(0.046, 24).rotateX(-Math.PI / 2), 'water', { pos: [-0.22, y0 + t + 0.025, 0.05], ...NS });
  b.box(0.05, 0.03, 0.012, 'plastic_white', [0.3, y0 + eH - 0.07, -D / 2 + t + 0.006], { r: 0.004 });
  b.box(0.03, 0.012, 0.001, 'display_green', [0.3, y0 + eH - 0.07, -D / 2 + t + 0.0125], { r: 0 });
  // LED strip under the roof
  b.add(new THREE.PlaneGeometry(W - 0.1, 0.02).rotateX(Math.PI / 2), 'led_cool', { pos: [0, y0 + eH - t - 0.001, 0.05], ...NS });
  // clipboard on the side
  b.box(0.004, 0.3, 0.22, 'plastic_grey', [W / 2 + 0.003, y0 + 0.18, 0.05], { r: 0.002 });
  b.box(0.002, 0.26, 0.2, 'paper', [W / 2 + 0.006, y0 + 0.17, 0.05], { r: 0 });
  b.box(0.008, 0.02, 0.07, 'aluminium', [W / 2 + 0.008, y0 + 0.31, 0.05], { r: 0.003 });
  b.anchor('light_main', [0, y0 + eH - t - 0.004, 0.05], { light: 'rect', width: W - 0.1, height: 0.25, intensity: 4, drop: eH - 2 * t, color: 0xeef4ff });
  b.anchor('animal_spot', [-0.02, y0 + t + 0.002, 0.03], { animal: 'python' });
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, tH + eH, D] });
}

/** Cabinet incubator with glass door, wire shelves and egg boxes in vermiculite. */
export function incubator() {
  const b = new Builder('incubator');
  const W = 0.62, D = 0.6, H = 1.25, t = 0.03;
  const slot = 'steel_white';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(0.02, 0.02, 0.04, 'rubber_black', [sx * (W / 2 - 0.05), 0.02, sz * (D / 2 - 0.05)]);
  const y0 = 0.04;
  b.box(W, t, D, slot, [0, y0 + t / 2, 0], { r: 0.006 });
  b.box(W, 0.12, D, slot, [0, H - 0.06, 0], { r: 0.008 });
  for (const s of [-1, 1]) b.box(t, H - y0 - 0.12, D, slot, [s * (W / 2 - t / 2), y0 + (H - y0 - 0.12) / 2, 0], { r: 0.006 });
  b.box(W - 2 * t, H - y0 - 0.12, t, slot, [0, y0 + (H - y0 - 0.12) / 2, -D / 2 + t / 2], { r: 0.004 });
  // interior liner (stainless) & shelves with egg boxes
  const iy0 = y0 + t, iy1 = H - 0.12;
  b.box(W - 2 * t - 0.002, iy1 - iy0, 0.002, 'stainless', [0, (iy0 + iy1) / 2, -D / 2 + t + 0.001], { r: 0 });
  const shelves = [iy0 + 0.1, iy0 + 0.36, iy0 + 0.62, iy0 + 0.88];
  const rnd = mulberry32(77);
  const egg = new THREE.SphereGeometry(1, 14, 10);
  for (const y of shelves) {
    // wire shelf: frame + rods
    b.box(W - 2 * t - 0.01, 0.006, 0.006, 'chrome', [0, y, D / 2 - 0.08], { r: 0.002 });
    b.box(W - 2 * t - 0.01, 0.006, 0.006, 'chrome', [0, y, -D / 2 + t + 0.02], { r: 0.002 });
    for (let i = 0; i < 12; i++) b.cyl(0.002, 0.002, D - t - 0.1, 'chrome', [-W / 2 + t + 0.02 + i * ((W - 2 * t - 0.04) / 11), y, (D / 2 - 0.08 + -D / 2 + t + 0.02) / 2], { rot: [Math.PI / 2, 0, 0], radial: 6 });
    // two egg boxes per shelf
    for (const ex of [-0.13, 0.13]) {
      const bw = 0.22, bd = 0.16, bh = 0.07, by = y + 0.004;
      const ez = -0.02;
      b.box(bw, 0.003, bd, 'pp_translucent', [ex, by + 0.0015, ez], { r: 0.001, castShadow: false });
      for (const s of [-1, 1]) b.box(0.003, bh, bd, 'pp_translucent', [ex + s * bw / 2, by + bh / 2, ez], { r: 0.001, castShadow: false });
      for (const s of [-1, 1]) b.box(bw, bh, 0.003, 'pp_translucent', [ex, by + bh / 2, ez + s * bd / 2], { r: 0.001, castShadow: false });
      b.add(new THREE.PlaneGeometry(bw - 0.006, bd - 0.006, 8, 6).rotateX(-Math.PI / 2), 'vermiculite', { pos: [ex, by + 0.035, ez], ...NS });
      for (let i = 0; i < 6; i++) {
        const gx = ex - 0.07 + (i % 3) * 0.07, gz = ez - 0.035 + Math.floor(i / 3) * 0.07;
        b.addM(egg, 'egg', matrix([gx + (rnd() - 0.5) * 0.01, by + 0.04, gz + (rnd() - 0.5) * 0.01], [rnd() * 0.3, rnd() * 3, Math.PI / 2 + (rnd() - 0.5) * 0.3], [0.017, 0.026, 0.017]));
      }
      b.add(new THREE.PlaneGeometry(0.05, 0.02), 'label', { uv: 'keep', pos: [ex, by + bh * 0.6, ez + bd / 2 + 0.002] });
    }
  }
  // interior light
  b.add(new THREE.PlaneGeometry(W - 2 * t - 0.06, 0.02).rotateX(Math.PI / 2), 'led_warm', { pos: [0, iy1 - 0.004, 0.05], ...NS });
  // glass door with thick frame, gasket, handle
  const dz = D / 2 + 0.012, dw = W - 0.004, dh = H - y0 - 0.125;
  b.box(dw, 0.05, 0.03, slot, [0, y0 + 0.025, dz], { r: 0.006 });
  b.box(dw, 0.05, 0.03, slot, [0, y0 + dh - 0.025, dz], { r: 0.006 });
  for (const s of [-1, 1]) b.box(0.05, dh, 0.03, slot, [s * (dw / 2 - 0.025), y0 + dh / 2, dz], { r: 0.006 });
  b.box(dw - 0.09, dh - 0.09, 0.01, 'glass', [0, y0 + dh / 2, dz], { r: 0.002, ...NS });
  const gasket = roundedRectShape(dw - 0.07, dh - 0.07, 0.01); gasket.holes.push(roundedRectShape(dw - 0.1, dh - 0.1, 0.008));
  const gg = extrude(gasket, 0.008); gg.translate(0, y0 + dh / 2, dz - 0.016); b.add(gg, 'rubber_black');
  b.box(0.018, 0.3, 0.02, 'aluminium', [dw / 2 - 0.06, y0 + dh / 2, dz + 0.03], { r: 0.008 });
  for (const s of [-1, 1]) b.box(0.012, 0.012, 0.02, 'aluminium', [dw / 2 - 0.06, y0 + dh / 2 + s * 0.13, dz + 0.017], { r: 0.003 });
  // control panel
  b.box(W - 0.06, 0.08, 0.004, 'plastic_black', [0, H - 0.06, D / 2 + 0.002], { r: 0.001 });
  b.box(0.12, 0.035, 0.002, 'display', [-0.12, H - 0.055, D / 2 + 0.005], { r: 0 });
  b.box(0.05, 0.02, 0.002, 'display_green', [0.03, H - 0.055, D / 2 + 0.005], { r: 0 });
  for (let i = 0; i < 4; i++) b.cyl(0.007, 0.007, 0.004, 'plastic_grey', [0.12 + i * 0.03, H - 0.06, D / 2 + 0.005], { rot: [Math.PI / 2, 0, 0], radial: 16 });
  // top vent & cable
  b.add(new THREE.PlaneGeometry(0.2, 0.08).rotateX(-Math.PI / 2), 'perforated', { pos: [0, H + 0.001, -0.1], uvScale: 16, ...NS });
  b.anchor('light_main', [0, iy1 - 0.01, 0.05], { light: 'rect', width: W - 0.12, height: 0.3, intensity: 7, drop: 0.35, reach: 1.25, color: 0xffd9a8 });
  return b.interiorNoShadow().toScene({ category: 'enclosure', nativeSize: [W, H, D] });
}

/** Terrarium stand cabinet (scaled to the logical footprint at runtime). */
export function stand_cabinet() {
  const b = new Builder('stand_cabinet');
  cabinetStand(b, { W: 1.0, D: 0.5, H: 0.8, slotName: 'laminate_grey', doors: 2 });
  return b.toScene({ category: 'furniture', nativeSize: [1.0, 0.8, 0.5] });
}

/** Animal models (attached to enclosure anchors when occupied). */
export function animal_python() {
  const b = new Builder('animal_python');
  coiledSnakeWrap(b);
  return b.toScene({ category: 'animal' });
}
import { coiledSnake } from '../lib/nature.mjs';
function coiledSnakeWrap(b) { coiledSnake(b, { pos: [0, 0, 0], scale: 1.0 }); }

export function animal_gecko() {
  const b = new Builder('animal_gecko');
  gecko(b, { pos: [0, 0, 0], scale: 1 });
  return b.toScene({ category: 'animal' });
}

export function animal_frog() {
  const b = new Builder('animal_frog');
  const body = new THREE.SphereGeometry(1, 18, 12);
  b.addM(body, 'gecko', matrix([0, 0.012, 0], [0.3, 0, 0], [0.014, 0.01, 0.02]));
  b.addM(new THREE.SphereGeometry(1, 14, 10), 'gecko', matrix([0, 0.018, 0.016], [0, 0, 0], [0.011, 0.008, 0.01]));
  for (const s of [-1, 1]) {
    b.addM(new THREE.SphereGeometry(0.0035, 10, 8), 'eye', matrix([s * 0.008, 0.024, 0.02]));
    b.addM(new THREE.SphereGeometry(1, 10, 8), 'gecko', matrix([s * 0.013, 0.006, -0.008], [0, 0, 0], [0.006, 0.006, 0.013]));
  }
  return b.toScene({ category: 'animal' });
}
