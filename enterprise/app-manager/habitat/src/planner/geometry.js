import * as THREE from 'three';

/**
 * Low-level geometry generators for the PLANNER renderer. All are cheap, deterministic and built at
 * runtime (no GLB download). Components compose them into assets, the PaintBuilder bakes & merges.
 */

export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function noise2(x, y) {
  const s = (a, b) => { const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return v - Math.floor(v); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return (s(xi, yi) * (1 - u) + s(xi + 1, yi) * u) * (1 - v) + (s(xi, yi + 1) * (1 - u) + s(xi + 1, yi + 1) * u) * v;
}
export function fbm(x, y, oct = 3) { let a = 0, f = 1, amp = 0.5; for (let i = 0; i < oct; i++) { a += noise2(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; } return a / (1 - Math.pow(0.5, oct)); }

/**
 * Chamfered box (flat faces + 45° bevel strips + corner facets), centred on the origin; r = 0 → box.
 * The bevels carry their own normals, so the painted key light draws a crisp highlight along every
 * edge — the "illustrated" edge definition — for 96 vertices.
 */
export function rbox(w, h, d, r = 0) {
  if (r <= 0.0005) return new THREE.BoxGeometry(w, h, d);
  const c = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const H = [w / 2, h / 2, d / 2];
  const pos = [], nor = [], uv = [], idx = [];
  const poly = (pts, n) => {
    const i0 = pos.length / 3;
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    for (const p of pts) {
      pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
      const fx = (p[0] + H[0]) / w, fy = (p[1] + H[1]) / h, fz = (p[2] + H[2]) / d; // per-face 0..1 (decals, faces)
      if (az >= ax && az >= ay) uv.push(n[2] > 0 ? fx : 1 - fx, fy); else if (ax >= ay) uv.push(n[0] > 0 ? 1 - fz : fz, fy); else uv.push(fx, n[1] > 0 ? 1 - fz : fz);
    }
    for (let k = 1; k < pts.length - 1; k++) {
      const a = pts[0], b = pts[k], e = pts[k + 1];
      const cx = (b[1] - a[1]) * (e[2] - a[2]) - (b[2] - a[2]) * (e[1] - a[1]);
      const cy = (b[2] - a[2]) * (e[0] - a[0]) - (b[0] - a[0]) * (e[2] - a[2]);
      const cz = (b[0] - a[0]) * (e[1] - a[1]) - (b[1] - a[1]) * (e[0] - a[0]);
      if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) idx.push(i0, i0 + k, i0 + k + 1); else idx.push(i0, i0 + k + 1, i0 + k);
    }
  };
  const P = (a, va, b, vb, e, ve) => { const p = [0, 0, 0]; p[a] = va; p[b] = vb; p[e] = ve; return p; };
  for (let a = 0; a < 3; a++) for (const s of [-1, 1]) { // faces
    const u = (a + 1) % 3, v = (a + 2) % 3, n = [0, 0, 0]; n[a] = s;
    const U = H[u] - c, V = H[v] - c;
    poly([P(a, s * H[a], u, -U, v, -V), P(a, s * H[a], u, U, v, -V), P(a, s * H[a], u, U, v, V), P(a, s * H[a], u, -U, v, V)], n);
  }
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) for (const sa of [-1, 1]) for (const sb of [-1, 1]) { // bevels
    const e = 3 - a - b, E = H[e] - c, n = [0, 0, 0]; n[a] = sa * Math.SQRT1_2; n[b] = sb * Math.SQRT1_2;
    poly([P(a, sa * H[a], b, sb * (H[b] - c), e, -E), P(a, sa * H[a], b, sb * (H[b] - c), e, E), P(a, sa * (H[a] - c), b, sb * H[b], e, E), P(a, sa * (H[a] - c), b, sb * H[b], e, -E)], n);
  }
  const k = 1 / Math.sqrt(3);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) { // corner facets
    poly([[sx * H[0], sy * (H[1] - c), sz * (H[2] - c)], [sx * (H[0] - c), sy * H[1], sz * (H[2] - c)], [sx * (H[0] - c), sy * (H[1] - c), sz * H[2]]], [sx * k, sy * k, sz * k]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function cyl(rTop, rBot, h, radial = 12, open = false) { return new THREE.CylinderGeometry(rTop, rBot, h, radial, 1, open); }

/** Revolved profile [[r, y], ...] around Y. */
export function lathe(profile, seg = 16) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

/** Height field over a rectangle; uv in metres. */
export function heightfield(x0, x1, z0, z1, resX, resZ, fn) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, resX, resZ).rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, fn(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  return g;
}

/** Vertical ribbon under a curve y = top(x) (substrate cross-section seen through the front glass). */
export function skirt(x0, x1, z, yBottom, top, res = 24) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= res; i++) {
    const x = x0 + ((x1 - x0) * i) / res, y1 = top(x);
    pos.push(x, yBottom, z, x, y1, z);
    uv.push(x * 3, 0, x * 3, 1);
    if (i < res) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Tapered tube along a curve; uv.x around (0..1), uv.y along in metres × vScale. */
export function taperTube(points, r0, r1, { radial = 7, segs = 16, vScale = 4, jag = 0, seed = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
  const frames = curve.computeFrenetFrames(segs, false);
  const len = curve.getLength();
  const pos = [], nor = [], uv = [], idx = [];
  const r = rng(seed);
  const jit = Array.from({ length: segs + 1 }, () => 1 + (r() - 0.5) * jag);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, c = curve.getPointAt(t);
    const N = frames.normals[i], B = frames.binormals[i];
    const rad = (r0 + (r1 - r0) * t) * jit[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a);
      const nx = cs * N.x + sn * B.x, ny = cs * N.y + sn * B.y, nz = cs * N.z + sn * B.z;
      pos.push(c.x + nx * rad, c.y + ny * rad, c.z + nz * rad); nor.push(nx, ny, nz);
      uv.push(j / radial, t * len * vScale);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  // end caps (flat, small)
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.userData.curve = curve;
  return g;
}

/** Faceted stone: displaced icosahedron with flat normals (reads as painted planes). */
export function rock(r = 0.1, { sx = 1, sy = 0.6, sz = 0.85, seed = 1, detail = 1, rough = 0.28, flatBase = true } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail); // non-indexed → flat facets
  const p = g.attributes.position, v = new THREE.Vector3();
  const o = seed * 3.17;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 1 + (fbm(v.x * 1.6 + o, v.z * 1.6 + v.y * 1.3 - o, 3) - 0.5) * 2 * rough;
    v.multiplyScalar(k * r); v.x *= sx; v.y *= sy; v.z *= sz;
    if (flatBase && v.y < -r * sy * 0.35) v.y = -r * sy * 0.35 + (v.y + r * sy * 0.35) * 0.15;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Leaf card: a quad of `len` × `width` along +Y, bent along its length (and slightly folded across
 * the midrib). uv 0..1 (the leaf sprite fills the cell). Normal faces +Z before transform.
 */
export function leafCard(len, width, { bend = 0.35, fold = 0.2, segs = 4, droop = 0 } = {}) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = len * t * (1 - droop * t * 0.5);
    const z = bend * len * t * t - droop * len * t * t * t;
    for (let j = 0; j <= 2; j++) {
      const s = j - 1;
      pos.push(s * width / 2, y, z - Math.abs(s) * fold * width * 0.5);
      uv.push(j / 2, t);
    }
    if (i < segs) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  // bias normals towards the sky: foliage reads lit & soft (painted look) instead of flat-shaded cards
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) { const x = n.getX(i) * 0.6, y = n.getY(i) * 0.6 + 0.55, z = n.getZ(i) * 0.6; const l = Math.hypot(x, y, z); n.setXYZ(i, x / l, y / l, z / l); }
  return g;
}

/** Quad facing +Z (w × h) centred on origin, uv 0..1. */
export function quad(w, h) { return new THREE.PlaneGeometry(w, h); }
/** Horizontal quad facing +Y. */
export function flat(w, d) { return new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); }

/** Relief panel (background, rock walls): displaced grid facing +Z, uv in metres. */
export function relief(w, h, depth, { resX = 14, resY = 12, seed = 1, ledges = [] } = {}) {
  const g = new THREE.PlaneGeometry(w, h, resX, resY);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const edge = Math.min(1, (w / 2 - Math.abs(x)) / 0.03, (h / 2 - Math.abs(y)) / 0.03);
    let z = (fbm(x * 7 + seed, y * 7 - seed, 3) * 0.75 + fbm(x * 21, y * 21 + seed, 2) * 0.25) * depth;
    for (const L of ledges) { const d = Math.hypot((x - L.x) / L.w, (y - L.y) / L.h); if (d < 1) z += (1 - d * d) * L.d; }
    p.setZ(i, z * Math.max(0.15, edge));
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getY(i));
  return g;
}

/** Squashed dome (moss mounds, cushions). */
export function dome(r, sy = 0.4, seg = 10) { const g = new THREE.SphereGeometry(r, seg, Math.max(3, seg / 2), 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, sy, 1); return g; }

export function ellipsoid(rx, ry, rz, seg = 10) { const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg * 0.7 | 0)); g.scale(rx, ry, rz); return g; }

/** Rounded-rectangle profile extruded along Z (frame profiles, rails). */
export function profileBar(w, h, len, r = 0.003) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2; r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, curveSegments: 2 });
  g.translate(0, 0, -len / 2);
  return g;
}
