// Organic geometry for enclosure interiors: rocks, wood, cork, substrate, backgrounds, plants, animals.
import { THREE, Builder, taperedTube, lathe, matrix, boxUV } from './kit.mjs';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { fbm3, noise3, mulberry32 } from './noise.mjs';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------- Rocks ----------------
export function rockGeo({ r = 0.08, sx = 1, sy = 0.6, sz = 0.8, seed = 1, detail = 3, rough = 0.35 } = {}) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = V(p.getX(i), p.getY(i), p.getZ(i));
    let d = 1 + fbm3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6, 4, seed) * rough;
    // flat-ish facets
    d += Math.abs(noise3(v.x * 3 + seed, v.y * 3, v.z * 3, seed + 3)) * -0.12;
    v.multiplyScalar(d);
    if (v.y < -0.35) v.y = -0.35 - (v.y + 0.35) * 0.15; // flattened bottom so it sits
    p.setXYZ(i, v.x * r * sx, v.y * r * sy, v.z * r * sz);
  }
  g.computeVertexNormals();
  boxUV(g, 1);
  return g;
}

// ---------------- Wood / branches ----------------
export function branchGeo({ points, r0 = 0.025, r1 = 0.008, seed = 1, tubular = 40, radial = 10 }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)), false, 'catmullrom', 0.4);
  return taperedTube(curve, (t) => THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.8)), tubular, radial, false,
    (t, a) => fbm3(t * 8 + seed, Math.cos(a) * 1.5, Math.sin(a) * 1.5, 3, seed) * 0.35);
}

export function branchWithTwigs(b, slotName, { points, r0, r1, seed = 1, twigs = 2 }) {
  b.add(branchGeo({ points, r0, r1, seed }), slotName, { uv: 'keep' });
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
  const rnd = mulberry32(seed * 91);
  for (let i = 0; i < twigs; i++) {
    const t = 0.35 + rnd() * 0.4; const p0 = curve.getPointAt(t);
    const dir = V(rnd() - 0.5, 0.6 + rnd() * 0.4, rnd() - 0.5).normalize();
    const len = 0.08 + rnd() * 0.12;
    const p1 = p0.clone().addScaledVector(dir, len * 0.5).add(V(0, 0.01, 0));
    const p2 = p0.clone().addScaledVector(dir, len);
    const rr = THREE.MathUtils.lerp(r0, r1, t) * 0.5;
    b.add(branchGeo({ points: [p0.toArray(), p1.toArray(), p2.toArray()], r0: rr, r1: rr * 0.3, seed: seed + i + 5, tubular: 12, radial: 6 }), slotName, { uv: 'keep' });
  }
}

/** Hollow cork tube lying along X, used as a hide. */
export function corkTube(b, { len = 0.3, r = 0.065, seed = 3, pos = [0, 0, 0], rotY = 0 }) {
  const m = matrix(pos, [0, rotY, 0]);
  const curve = new THREE.LineCurve3(V(-len / 2, r * 0.85, 0), V(len / 2, r * 0.85, 0));
  const outer = taperedTube(curve, () => r, 24, 20, false, (t, a) => {
    const ridges = Math.abs(noise3(t * 6 + seed, Math.cos(a) * 3, Math.sin(a) * 3, seed)) * 0.25;
    return ridges + fbm3(t * 3, Math.cos(a), Math.sin(a) + seed, 3, seed) * 0.15;
  });
  b.addM(outer, 'cork', m, { uv: 'keep' });
  const inner = taperedTube(curve, () => r * 0.72, 12, 16, false);
  const idx = inner.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i]; idx[i] = idx[i + 1]; idx[i + 1] = t; }
  const n = inner.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
  b.addM(inner, 'bark', m, { uv: 'keep' });
  for (const s of [-1, 1]) {
    const ring = new THREE.RingGeometry(r * 0.72, r * 1.08, 20, 1);
    ring.rotateY(s * Math.PI / 2); ring.translate(s * len / 2, r * 0.85, 0);
    b.addM(ring, 'bark', m);
  }
}

// ---------------- Substrate ----------------
/**
 * Heightfield substrate filling a rectangle [x0,x1]x[z0,z1] with visible cross-section skirts.
 * layers: [{slot, top}] bottom-up (top = absolute y of layer top, or function(x,z)) ; last layer uses surface.
 */
export function substrate(b, { x0, x1, z0, z1, y0, surface, layers = [], topSlot = 'soil', res = 40, skirtSlot }) {
  const w = x1 - x0, d = z1 - z0;
  const nx = res, nz = Math.max(4, Math.round(res * d / w));
  const top = new THREE.PlaneGeometry(w, d, nx, nz); top.rotateX(-Math.PI / 2); top.translate(x0 + w / 2, 0, z0 + d / 2);
  const p = top.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, surface(p.getX(i), p.getZ(i)));
  top.computeVertexNormals();
  b.add(top, topSlot, { castShadow: false });
  // Skirts (front, back, left, right) split into layer bands
  const edges = [
    { a: [x0, z1], b: [x1, z1] }, { a: [x1, z0], b: [x0, z0] }, { a: [x0, z0], b: [x0, z1] }, { a: [x1, z1], b: [x1, z0] },
  ];
  const bands = [...layers, { slot: skirtSlot || topSlot, top: null }];
  for (const e of edges) {
    const segs = 40;
    let prevTop = () => y0;
    for (const band of bands) {
      const pos = [], idx = [];
      for (let i = 0; i <= segs; i++) {
        const t = i / segs, x = THREE.MathUtils.lerp(e.a[0], e.b[0], t), z = THREE.MathUtils.lerp(e.a[1], e.b[1], t);
        const sy = surface(x, z);
        const lo = Math.min(prevTop(x, z), sy);
        const hi = band.top === null ? sy : Math.min(typeof band.top === 'function' ? band.top(x, z) : band.top, sy);
        pos.push(x, lo, z, x, Math.max(hi, lo), z);
      }
      for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      b.add(g, band.slot, { castShadow: false });
      const bt = band.top; prevTop = bt === null ? prevTop : (typeof bt === 'function' ? bt : () => bt);
    }
  }
}

/** Visible drainage layer: clay pebbles pressed against the glass along given edges. */
export function clayPebbles(b, { x0, x1, z0, z1, y0, y1, seed = 5 }) {
  const rnd = mulberry32(seed);
  const pebble = new THREE.IcosahedronGeometry(1, 0);
  const place = (x, z) => {
    for (let y = y0 + 0.006; y < y1 - 0.004; y += 0.011 + rnd() * 0.002) {
      const r = 0.0055 + rnd() * 0.002;
      b.addM(pebble, 'clay_pebble', matrix([x + (rnd() - 0.5) * 0.003, y, z + (rnd() - 0.5) * 0.003], [rnd() * 3, rnd() * 3, 0], [r, r * 0.9, r]), { castShadow: false });
    }
  };
  for (let x = x0 + 0.006; x < x1; x += 0.012 + rnd() * 0.002) { place(x, z1 - 0.006); place(x, z0 + 0.006); }
  for (let z = z0 + 0.018; z < z1 - 0.012; z += 0.012 + rnd() * 0.002) { place(x0 + 0.006, z); place(x1 - 0.006, z); }
}

// ---------------- Backgrounds ----------------
/** Sculpted background panel on the back glass (faces +Z). */
export function backgroundPanel(b, { w, h, x = 0, y0 = 0, z = 0, depth = 0.04, slotName = 'rock', seed = 7, ledges = true, res = 48 }) {
  const g = new THREE.PlaneGeometry(w, h, res, Math.round(res * h / w));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const px = p.getX(i), py = p.getY(i);
    const u = px / w + 0.5, v = py / h + 0.5;
    let dz = (fbm3(px * 6 + seed, py * 6, seed, 5, seed) * 0.5 + 0.5) * depth;
    dz += Math.abs(noise3(px * 14, py * 3 + seed, 1, seed + 2)) * depth * 0.35;
    if (ledges) { const band = Math.sin(v * Math.PI * 5 + fbm3(px * 3, 0, seed, 2, 1) * 2); dz += Math.max(0, band - 0.6) * depth * 0.9; }
    const edge = Math.min(u, 1 - u, v * 3, 1 - v) * 8; // taper to glass at borders
    dz *= Math.min(1, Math.max(0.15, edge));
    p.setZ(i, dz);
  }
  g.computeVertexNormals();
  g.translate(x, y0 + h / 2, z);
  b.add(g, slotName, { castShadow: false });
}

// ---------------- Plants ----------------
// Atlas quadrant uv rects for assets/textures/foliage/albedo.png (flipY = true at runtime).
const ATLAS = {
  heart: { u0: 0, v0: 0.5, baseTop: true },
  strap: { u0: 0.5, v0: 0.5 },
  fern: { u0: 0, v0: 0 },
  oval: { u0: 0.5, v0: 0 },
};

/** A bent leaf card with its base at the origin, pointing along +Y then arching over +Z. */
export function leafCard(kind, length, width, { bend = 0.4, fold = 0.25, segs = 6, twist = 0 } = {}) {
  const g = new THREE.PlaneGeometry(width, length, 2, segs);
  g.translate(0, length / 2, 0);
  const p = g.attributes.position, uv = g.attributes.uv, q = ATLAS[kind];
  const pad = 0.012;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const t = y / length, s = x / width; // s in [-0.5,0.5]
    // arch: rotate progressively around X
    const ang = bend * t * t * Math.PI * 0.6;
    const r = y;
    let ny = Math.cos(ang) * r * (1 - 0.1 * t), nz = Math.sin(ang) * r;
    nz += Math.abs(s) * width * fold * (1 - t * 0.5); // V-fold along midrib
    const tw = twist * t; const nx = x * Math.cos(tw); nz += x * Math.sin(tw);
    p.setXYZ(i, nx, ny, nz);
    const u = q.u0 + pad + (s + 0.5) * (0.5 - pad * 2);
    const v = q.baseTop ? q.v0 + 0.5 - pad - t * (0.5 - pad * 2) : q.v0 + pad + t * (0.5 - pad * 2);
    uv.setXY(i, u, v);
  }
  g.computeVertexNormals();
  return g;
}

function placeLeaf(b, geo, pos, yaw, tilt, slotName = 'leaf') {
  // tilt: lean away from vertical (around local X after yaw)
  const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, 0, 'YXZ')), V(1, 1, 1));
  b.addM(geo, slotName, m, { uv: 'keep' });
}

export function bromeliad(b, { pos, size = 0.2, seed = 1, leaves = 14 }) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < leaves; i++) {
    const L = size * (0.7 + rnd() * 0.4), W = size * 0.18;
    const g = leafCard('strap', L, W, { bend: 0.7 + rnd() * 0.5, fold: 0.35 });
    placeLeaf(b, g, pos, i * 2.39996 + rnd() * 0.2, 0.25 + (i / leaves) * 0.7);
  }
}

export function fern(b, { pos, size = 0.25, seed = 2, fronds = 9 }) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < fronds; i++) {
    const L = size * (0.75 + rnd() * 0.35);
    const g = leafCard('fern', L, L * 0.6, { bend: 0.9 + rnd() * 0.4, fold: 0.1, segs: 8 });
    placeLeaf(b, g, pos, i * 2.39996 + rnd() * 0.3, 0.3 + rnd() * 0.5);
  }
}

export function sansevieria(b, { pos, size = 0.3, seed = 3, leaves = 7 }) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < leaves; i++) {
    const L = size * (0.6 + rnd() * 0.5), W = size * 0.2;
    const g = leafCard('strap', L, W, { bend: 0.08 + rnd() * 0.1, fold: 0.5, twist: (rnd() - 0.5) * 0.8 });
    placeLeaf(b, g, [pos[0] + (rnd() - 0.5) * 0.03, pos[1], pos[2] + (rnd() - 0.5) * 0.03], rnd() * 6.28, 0.05 + rnd() * 0.25);
  }
}

/** Pothos / philodendron vine along a curve with heart leaves. */
export function vine(b, { points, leafSize = 0.06, seed = 4, every = 0.045 }) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => V(...p)));
  b.add(taperedTube(curve, () => 0.003, 40, 5), 'plant_stem', { uv: 'keep' });
  const rnd = mulberry32(seed); const len = curve.getLength();
  for (let s = 0.02; s < len; s += every * (0.8 + rnd() * 0.4)) {
    const t = s / len; const p = curve.getPointAt(t);
    const sz = leafSize * (0.6 + 0.6 * (1 - t) * rnd() + 0.3);
    const g = leafCard('heart', sz, sz * 0.8, { bend: 0.6, fold: 0.2 });
    placeLeaf(b, g, p.toArray(), rnd() * 6.28, 0.9 + rnd() * 0.6);
  }
}

/** Ground cover: small oval leaves in a mound. */
export function groundCover(b, { pos, radius = 0.06, seed = 5, count = 26, size = 0.03 }) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * radius;
    const sz = size * (0.7 + rnd() * 0.5);
    const g = leafCard('oval', sz, sz * 0.8, { bend: 0.8, fold: 0.15, segs: 3 });
    placeLeaf(b, g, [pos[0] + Math.cos(a) * r, pos[1] + (1 - r / radius) * 0.02, pos[2] + Math.sin(a) * r], rnd() * 6.28, 0.5 + rnd() * 0.9);
  }
}

/** Big-leaf room plant (monstera/philodendron-like) with stems from pot centre. */
export function bigLeafPlant(b, { pos, height = 1.0, seed = 6, leaves = 11, leafSize = 0.32 }) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < leaves; i++) {
    const yaw = i * 2.39996 + rnd() * 0.3, h = height * (0.45 + rnd() * 0.55), lean = 0.12 + rnd() * 0.35;
    const tip = V(Math.sin(yaw) * lean * h, h, Math.cos(yaw) * lean * h);
    const mid = V(tip.x * 0.4, h * 0.55, tip.z * 0.4);
    const curve = new THREE.CatmullRomCurve3([V(...pos), V(pos[0] + mid.x, pos[1] + mid.y, pos[2] + mid.z), V(pos[0] + tip.x, pos[1] + tip.y, pos[2] + tip.z)]);
    b.add(taperedTube(curve, (t) => 0.007 - t * 0.003, 16, 6), 'plant_stem', { uv: 'keep' });
    const sz = leafSize * (0.7 + rnd() * 0.45);
    const g = leafCard('heart', sz, sz * 0.85, { bend: 0.5, fold: 0.15, segs: 6 });
    const end = curve.getPointAt(1);
    placeLeaf(b, g, end.toArray(), yaw + (rnd() - 0.5) * 0.4, 1.0 + rnd() * 0.5);
  }
}

/** Echeveria-style succulent rosette (solid geometry leaves). */
export function succulent(b, { pos, size = 0.05, seed = 7, leaves = 22, slotName = 'succulent' }) {
  const rnd = mulberry32(seed);
  const leaf = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI);
  for (let i = 0; i < leaves; i++) {
    const t = i / leaves; const L = size * (0.35 + t * 0.65);
    const m = new THREE.Matrix4().compose(V(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 + t * 1.1, i * 2.39996, 0, 'YXZ')), V(1, 1, 1));
    const local = new THREE.Matrix4().compose(V(0, L * 0.9, 0), new THREE.Quaternion(), V(L * 0.38, L, L * 0.16));
    b.addM(leaf, slotName, m.multiply(local), { castShadow: true });
    void rnd;
  }
}

/** Dry grass tuft (solid thin blades). */
export function grassTuft(b, { pos, height = 0.12, seed = 8, blades = 18, slotName = 'grass_dry' }) {
  const rnd = mulberry32(seed);
  for (let i = 0; i < blades; i++) {
    const h = height * (0.5 + rnd() * 0.6), w = 0.004;
    const g = new THREE.BufferGeometry();
    const segs = 4, pos3 = [], idx = [];
    const lean = 0.3 + rnd() * 0.6;
    for (let s = 0; s <= segs; s++) { const t = s / segs, ww = w * (1 - t); const z = Math.pow(t, 2) * h * lean; pos3.push(-ww, t * h, z, ww, t * h, z); }
    for (let s = 0; s < segs; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos3, 3)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.Matrix4().compose(V(pos[0] + (rnd() - 0.5) * 0.02, pos[1], pos[2] + (rnd() - 0.5) * 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)), V(1, 1, 1));
    b.addM(g, slotName, m);
  }
}

// ---------------- Vessels ----------------
export function waterBowl(b, { pos, r = 0.07, slotName = 'ceramic_dark' }) {
  const prof = [[0, 0], [r * 0.8, 0], [r, 0.004], [r * 1.02, r * 0.35], [r * 0.93, r * 0.37], [r * 0.82, r * 0.08], [0, r * 0.06]];
  b.addM(lathe(prof, 36), slotName, matrix(pos));
  b.addM(new THREE.CircleGeometry(r * 0.9, 32).rotateX(-Math.PI / 2), 'water', matrix([pos[0], pos[1] + r * 0.27, pos[2]]), { castShadow: false });
}

export function pot(b, { pos, r = 0.16, h = 0.3, slotName = 'ceramic_dark', soil = true }) {
  const prof = [[0, 0.004], [r * 0.78, 0], [r * 0.8, 0.01], [r, h - 0.01], [r * 1.02, h], [r * 0.95, h], [r * 0.93, h * 0.2], [0, h * 0.2]];
  b.addM(lathe(prof, 40), slotName, matrix(pos));
  if (soil) b.addM(new THREE.CircleGeometry(r * 0.94, 32).rotateX(-Math.PI / 2), 'soil', matrix([pos[0], pos[1] + h - 0.03, pos[2]]), { castShadow: false });
}

// ---------------- Animals ----------------
/** Coiled ball python resting on the substrate. */
export function coiledSnake(b, { pos, scale = 1, seed = 9 }) {
  const pts = [];
  const loops = 2.6, turns = 90;
  for (let i = 0; i <= turns; i++) {
    const t = i / turns, a = t * loops * Math.PI * 2;
    const r = (0.1 - t * 0.055) * scale;
    const y = (0.022 + (t > 0.62 ? (t - 0.62) * 0.09 : 0)) * scale;
    pts.push(V(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  // neck rises over the coil, head rests on top
  const last = pts[pts.length - 1];
  pts.push(V(last.x * 0.4, last.y + 0.03 * scale, last.z * 0.4 + 0.01));
  pts.push(V(0.02 * scale, last.y + 0.032 * scale, 0.05 * scale));
  const curve = new THREE.CatmullRomCurve3(pts);
  curve.points.reverse(); // t=0 tail, t=1 head
  const radius = (t) => {
    const body = 0.024 * scale;
    if (t < 0.12) return THREE.MathUtils.lerp(0.003 * scale, body * 0.6, t / 0.12);
    if (t < 0.25) return THREE.MathUtils.lerp(body * 0.6, body, (t - 0.12) / 0.13);
    if (t < 0.93) return body * (1 - Math.max(0, t - 0.8) * 1.6);
    return body * 0.72;
  };
  const tube = taperedTube(curve, radius, 220, 14, false);
  // normalise V around the body for the skin atlas
  const uv = tube.attributes.uv;
  for (let i = 0; i < uv.count; i++) { const j = i % 15; uv.setY(i, j / 14); uv.setX(i, uv.getX(i) * 4.0); }
  const m = matrix(pos);
  b.addM(tube, 'snake', m, { uv: 'keep' });
  // head
  const end = curve.getPointAt(1), tan = curve.getTangentAt(1).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), V(tan.x, 0, tan.z).normalize());
  const head = new THREE.SphereGeometry(1, 18, 12);
  const hp = head.attributes.position;
  for (let i = 0; i < hp.count; i++) { const z = hp.getZ(i); const f = z > 0 ? 1 - z * 0.35 : 1; hp.setXYZ(i, hp.getX(i) * f, hp.getY(i) * f * (hp.getY(i) < 0 ? 0.7 : 1), z); }
  head.computeVertexNormals();
  const hs = 0.024 * scale;
  const hm = new THREE.Matrix4().compose(end.clone().addScaledVector(tan, hs * 0.9), q, V(hs * 0.95, hs * 0.62, hs * 1.55));
  const hu = head.clone(); hu.applyMatrix4(hm);
  const huv = new Float32Array(hu.attributes.position.count * 2).fill(0.5); hu.setAttribute('uv', new THREE.BufferAttribute(huv, 2));
  b.addM(hu, 'snake', m, { uv: 'keep' });
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(hs * 0.16, 10, 8);
    const ep = V(s * hs * 0.62, hs * 0.22, hs * 0.55).applyQuaternion(q).add(end.clone().addScaledVector(tan, hs * 0.9));
    b.addM(eye, 'eye', matrix(ep.toArray()).premultiply(m));
  }
}

/** Small lizard (leopard gecko style) — body/tail tube, head, four legs. */
export function gecko(b, { pos, yaw = 0, scale = 1 }) {
  const s = scale;
  const spine = new THREE.CatmullRomCurve3([V(-0.11 * s, 0.012 * s, 0.02 * s), V(-0.07 * s, 0.013 * s, 0.0), V(-0.03 * s, 0.016 * s, 0), V(0.02 * s, 0.018 * s, 0), V(0.06 * s, 0.017 * s, 0), V(0.085 * s, 0.017 * s, 0)]);
  const r = (t) => {
    if (t < 0.4) return (0.004 + t * 0.03) * s;                      // tail (fat gecko tail)
    if (t < 0.46) return 0.016 * s;
    if (t < 0.85) return (0.016 + Math.sin((t - 0.46) / 0.39 * Math.PI) * 0.003) * s;
    return (0.012 - (t - 0.85) * 0.03) * s;
  };
  const m = matrix(pos, [0, yaw, 0]);
  const body = taperedTube(spine, r, 60, 12);
  const uv = body.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, (i % 13) / 12);
  b.addM(body, 'gecko', m, { uv: 'keep' });
  const head = new THREE.SphereGeometry(1, 16, 10);
  b.addM(head, 'gecko', m.clone().multiply(matrix([0.095 * s, 0.018 * s, 0], [0, 0, 0], [0.024 * s, 0.011 * s, 0.017 * s])), {});
  for (const sd of [-1, 1]) b.addM(new THREE.SphereGeometry(0.0035 * s, 8, 6), 'eye', m.clone().multiply(matrix([0.1 * s, 0.022 * s, sd * 0.012 * s])));
  const leg = (x, sd) => {
    const c = new THREE.CatmullRomCurve3([V(x, 0.014 * s, sd * 0.012 * s), V(x + 0.004 * s, 0.01 * s, sd * 0.028 * s), V(x + 0.012 * s, 0.002 * s, sd * 0.034 * s)]);
    b.addM(taperedTube(c, (t) => (0.0045 - t * 0.002) * s, 8, 6), 'gecko', m, { uv: 'keep' });
  };
  for (const sd of [-1, 1]) { leg(0.055 * s, sd); leg(-0.01 * s, sd); }
}
