// Model authoring kit: builds detailed meshes with three.js in Node and exports them as GLB.
// Materials are exported as *named slots* with sensible fallback PBR values; the runtime
// MaterialLibrary binds each slot name to a shared, fully textured physical material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export { THREE };

// Fallback values (used when a GLB is viewed outside the app). Keys are the slot names.
export const SLOTS = {
  frame_black: { color: 0x151515, metalness: 0.7, roughness: 0.35 },
  aluminium: { color: 0xb8bbbf, metalness: 1, roughness: 0.32 },
  stainless: { color: 0xc9ccd0, metalness: 1, roughness: 0.25 },
  chrome: { color: 0xffffff, metalness: 1, roughness: 0.08 },
  steel_graphite: { color: 0x2c2e31, metalness: 0.5, roughness: 0.5 },
  steel_white: { color: 0xe6e6e2, metalness: 0.2, roughness: 0.45 },
  steel_amber: { color: 0xd9822b, metalness: 0.3, roughness: 0.45 },
  glass: { color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.2 },
  glass_frosted: { color: 0xf2f4f4, metalness: 0, roughness: 0.4, transparent: true, opacity: 0.6 },
  acrylic_smoke: { color: 0x303436, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.5 },
  silicone_black: { color: 0x0b0b0b, metalness: 0, roughness: 0.6 },
  rubber_black: { color: 0x121212, metalness: 0, roughness: 0.8 },
  plastic_black: { color: 0x161616, metalness: 0, roughness: 0.45 },
  plastic_grey: { color: 0x55585c, metalness: 0, roughness: 0.5 },
  plastic_white: { color: 0xecebe7, metalness: 0, roughness: 0.4 },
  pvc_white: { color: 0xf1f0ec, metalness: 0, roughness: 0.35 },
  pvc_black: { color: 0x1b1c1d, metalness: 0, roughness: 0.4 },
  pp_translucent: { color: 0xe8ecec, metalness: 0, roughness: 0.35, transparent: true, opacity: 0.8 },
  led_warm: { color: 0xffffff, emissive: 0xffd6a0, emissiveIntensity: 4 },
  led_cool: { color: 0xffffff, emissive: 0xe4f0ff, emissiveIntensity: 4 },
  uvb_tube: { color: 0xffffff, emissive: 0xeef2ff, emissiveIntensity: 3 },
  bulb_hot: { color: 0xffffff, emissive: 0xffb060, emissiveIntensity: 6 },
  display: { color: 0x050505, emissive: 0xff9a2e, emissiveIntensity: 2 },
  display_green: { color: 0x050505, emissive: 0x6dff9a, emissiveIntensity: 1.5 },
  panel_led: { color: 0xffffff, emissive: 0xfff4e6, emissiveIntensity: 3 },
  oak: { color: 0xb08a5c, metalness: 0, roughness: 0.45 },
  mdf_black: { color: 0x1c1c1c, metalness: 0, roughness: 0.55 },
  laminate_grey: { color: 0x4b4d50, metalness: 0, roughness: 0.5 },
  laminate_white: { color: 0xe9e7e2, metalness: 0, roughness: 0.4 },
  sand: { color: 0xc9a473, roughness: 0.95 },
  soil: { color: 0x3a2a1c, roughness: 0.95 },
  rock: { color: 0x9c8670, roughness: 0.85 },
  rock_dark: { color: 0x4d4843, roughness: 0.85 },
  cork: { color: 0x5e4630, roughness: 0.9 },
  bark: { color: 0x6b5a48, roughness: 0.85 },
  driftwood: { color: 0x8a7a68, roughness: 0.8 },
  moss: { color: 0x4d7a2a, roughness: 0.95 },
  leaf: { color: 0xffffff, roughness: 0.55, side: THREE.DoubleSide, alphaTest: 0.5 },
  succulent: { color: 0x7fa08c, roughness: 0.45 },
  grass_dry: { color: 0xb59a62, roughness: 0.8, side: THREE.DoubleSide },
  plant_stem: { color: 0x4a6a2a, roughness: 0.7 },
  water: { color: 0x9fc6c0, roughness: 0.03, transparent: true, opacity: 0.4 },
  vermiculite: { color: 0xb8904f, roughness: 0.7 },
  gravel_wet: { color: 0x6b5a45, roughness: 0.4 },
  water_fall: { color: 0xe8f2f0, roughness: 0.2, transparent: true, opacity: 0.6 },
  sack: { color: 0x3c4a3a, roughness: 0.85 },
  sack_label: { color: 0xe8e2d0, roughness: 0.7 },
  egg: { color: 0xf2ecdf, roughness: 0.6 },
  clay_pebble: { color: 0x9a4f2e, roughness: 0.9 },
  ceramic_white: { color: 0xf4f3ef, roughness: 0.12 },
  ceramic_dark: { color: 0x2a2826, roughness: 0.35 },
  terracotta: { color: 0xa4583a, roughness: 0.85 },
  tiles: { color: 0xeeeeea, roughness: 0.15 },
  paper: { color: 0xf3f1ea, roughness: 0.9 },
  cardboard: { color: 0xa98460, roughness: 0.85 },
  label: { color: 0xf6f3ea, roughness: 0.6 },
  label_amber: { color: 0xe08a2c, roughness: 0.5 },
  mesh_screen: { color: 0x151515, metalness: 0.4, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5 },
  perforated: { color: 0x1a1a1a, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide, alphaTest: 0.5 },
  pegboard: { color: 0x2a2c2f, metalness: 0.4, roughness: 0.5, side: THREE.DoubleSide, alphaTest: 0.5 },
  snake: { color: 0x8a6a40, roughness: 0.45 },
  gecko: { color: 0xd9b25a, roughness: 0.6 },
  eye: { color: 0x050505, roughness: 0.05 },
  fabric_dark: { color: 0x2b2b2b, roughness: 0.9 },
  copper: { color: 0xc07a4a, metalness: 1, roughness: 0.3 },
  cable_black: { color: 0x0e0e0e, roughness: 0.55 },
  cable_grey: { color: 0x8a8d90, roughness: 0.55 },
  door_leaf: { color: 0x3a3c3f, roughness: 0.45 },
  accent_red: { color: 0xa82a22, roughness: 0.5 },
};

const materialCache = new Map();
export function slot(name) {
  if (!SLOTS[name]) throw new Error('Unknown material slot ' + name);
  if (!materialCache.has(name)) {
    const m = new THREE.MeshStandardMaterial({ name, ...SLOTS[name] });
    if (SLOTS[name].emissive !== undefined) m.emissive = new THREE.Color(SLOTS[name].emissive);
    materialCache.set(name, m);
  }
  return materialCache.get(name);
}

// ---------- UV helpers ----------
/** Box-projected UVs in metres (1 UV unit = 1 m) in the geometry's current space. */
export function boxUV(geo, scale = 1) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; } else if (nx >= nz) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// ---------- Builder ----------
export class Builder {
  constructor(name) {
    this.name = name;
    this.parts = []; // {geo, slot, uv: 'box'|'keep'}
    this.anchors = [];
    this.meta = {};
  }
  /** Add a geometry (already positioned) with a material slot. */
  add(geo, slotName, { uv = 'box', uvScale = 1, pos, rot, scale, castShadow = true } = {}) {
    geo = geo.clone();
    if (scale) geo.scale(...(Array.isArray(scale) ? scale : [scale, scale, scale]));
    if (rot) { const e = new THREE.Euler(...rot); geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(e)); }
    if (pos) geo.translate(...pos);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (uv === 'box' || !geo.attributes.uv) boxUV(geo, uvScale);
    this.parts.push({ geo, slot: slotName, castShadow });
    return this;
  }
  /** Add geometry transformed by a Matrix4. */
  addM(geo, slotName, matrix, opts = {}) {
    const g = geo.clone().applyMatrix4(matrix);
    return this.add(g, slotName, opts);
  }
  box(w, h, d, slotName, pos, opts = {}) {
    const r = opts.r ?? Math.min(0.003, Math.min(w, h, d) * 0.3);
    const g = r > 0 ? new RoundedBoxGeometry(w, h, d, opts.seg ?? (r >= 0.004 ? 2 : 1), r) : new THREE.BoxGeometry(w, h, d);
    return this.add(g, slotName, { ...opts, pos });
  }
  cyl(rt, rb, h, slotName, pos, opts = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, opts.radial ?? 24, 1, opts.open ?? false);
    return this.add(g, slotName, { ...opts, pos });
  }
  anchor(name, position, data = {}) { this.anchors.push({ name, position, data }); return this; }
  /** Drop organic parts (leaf cards, stems, grass) that poke outside an interior box (e.g. through glass). */
  cull(box, slots = ['leaf', 'plant_stem', 'grass_dry', 'succulent'], from = 0) {
    const bb = new THREE.Box3();
    this.parts = this.parts.filter((p, i) => {
      if (i < from || !slots.includes(p.slot)) return true;
      p.geo.computeBoundingBox(); bb.copy(p.geo.boundingBox);
      return box.containsBox(bb);
    });
    return this;
  }
  /** Merge child builder parts with a transform. */
  include(other, matrix = new THREE.Matrix4()) {
    for (const p of other.parts) this.parts.push({ geo: p.geo.clone().applyMatrix4(matrix), slot: p.slot, castShadow: p.castShadow });
    for (const a of other.anchors) {
      const v = new THREE.Vector3(...a.position).applyMatrix4(matrix);
      const data = { ...a.data };
      if (data.direction) { const d = new THREE.Vector3(...data.direction).transformDirection(matrix); data.direction = d.toArray(); }
      this.anchors.push({ name: a.name, position: v.toArray(), data });
    }
    return this;
  }
  /** Interior decoration of enclosures is fully enclosed: it receives but does not cast shadows. */
  interiorNoShadow(slots = ['gravel_wet', 'water_fall', 'sand', 'soil', 'rock', 'rock_dark', 'cork', 'bark', 'driftwood', 'moss', 'leaf', 'succulent', 'grass_dry', 'plant_stem', 'clay_pebble', 'water', 'vermiculite', 'egg', 'paper', 'fabric_dark', 'ceramic_dark', 'ceramic_white', 'stainless', 'pp_translucent', 'label', 'cable_black']) {
    for (const p of this.parts) if (slots.includes(p.slot)) p.castShadow = false;
    return this;
  }
  /** Build the final Three scene: one mesh per material slot (+ shadow flag). */
  toScene({ nativeSize, category, extras = {} } = {}) {
    const groups = new Map();
    for (const p of this.parts) {
      const key = p.slot + (p.castShadow ? '' : '|ns');
      if (!groups.has(key)) groups.set(key, []);
      let g = p.geo;
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.index) g = mergeVertices(g, 1e-6);
      groups.get(key).push(g);
    }
    const root = new THREE.Group(); root.name = this.name;
    let tris = 0;
    for (const [key, geos] of groups) {
      const [slotName, ns] = key.split('|');
      const merged = mergeGeometries(geos, false);
      if (!merged) throw new Error('merge failed for ' + key);
      merged.computeBoundingBox();
      tris += merged.index.count / 3;
      const mesh = new THREE.Mesh(merged, slot(slotName));
      mesh.name = `${this.name}__${slotName}${ns ? '__noshadow' : ''}`;
      mesh.userData = { slot: slotName, castShadow: !ns };
      root.add(mesh);
    }
    for (const a of this.anchors) {
      const o = new THREE.Object3D(); o.name = a.name; o.position.set(...a.position); o.userData = { anchor: true, ...a.data };
      root.add(o);
    }
    const box = new THREE.Box3().setFromObject(root);
    root.userData = {
      habitat: {
        id: this.name, category, triangles: tris,
        nativeSize: nativeSize || [box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z],
        bounds: { min: box.min.toArray(), max: box.max.toArray() },
        ...extras,
      },
    };
    return { root, tris };
  }
}

// ---------- Geometry primitives beyond boxes ----------
/** Extrude a 2D shape (in XY, metres) along +Z by `length`, optional bevel. */
export function extrude(shape, length, { bevel = 0, segs = 1, curveSegments = 6 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: length - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: segs, curveSegments,
  });
  g.translate(0, 0, bevel);
  return g;
}

export function roundedRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape(), x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Aluminium L-angle profile cross-section (leg a, thickness t, rounded heel). */
export function lProfileShape(a, t, r = 0.002) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(a, 0); s.lineTo(a, t); s.lineTo(t + r, t); s.quadraticCurveTo(t, t, t, t + r); s.lineTo(t, a); s.lineTo(0, a); s.lineTo(0, 0);
  return s;
}

/** U-channel (track) cross-section with `n` grooves, width w, height h. */
export function trackShape(w, h, grooves = 2, grooveW = 0.006, wall = 0.0015) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, h);
  const pitch = (w - wall) / grooves;
  for (let i = grooves - 1; i >= 0; i--) {
    const x1 = -w / 2 + wall + pitch * (i + 1) - wall, x0 = x1 - grooveW;
    s.lineTo(x1 + 0.0005, h); s.lineTo(x1, h * 0.3); s.lineTo(x0, h * 0.3); s.lineTo(x0 - 0.0005, h);
    if (i > 0) s.lineTo(x0 - 0.0005 - (pitch - grooveW - wall), h);
  }
  s.lineTo(-w / 2, h); s.lineTo(-w / 2, 0);
  return s;
}

/** A bar made from a shape extruded along an axis: returns geometry positioned from p0 along axis. */
export function bar(shape, length, axis = 'x', opts = {}) {
  const g = extrude(shape, length, opts);
  if (axis === 'x') g.rotateY(Math.PI / 2);          // z -> x
  else if (axis === 'y') g.rotateX(-Math.PI / 2);    // z -> y
  return g;
}

/** Lathe from [r,y] pairs. */
export function lathe(points, segs = 32) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

/** Tapered tube along a curve with radius function r(t) and optional noise bumps. */
export function taperedTube(curve, radiusFn, tubular = 48, radial = 10, closed = false, bump = null) {
  const frames = curve.computeFrenetFrames(tubular, closed);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  let len = curve.getLength();
  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular; curve.getPointAt(t, P);
    const r0 = radiusFn(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2; const s = Math.sin(a), c = -Math.cos(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      const r = r0 * (bump ? 1 + bump(t, a) : 1);
      pos.push(P.x + r * N.x, P.y + r * N.y, P.z + r * N.z); nor.push(N.x, N.y, N.z);
      uv.push(t * len, (j / radial) * Math.max(r0, 0.01) * Math.PI * 2);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (bump) g.computeVertexNormals();
  return g;
}

/** Simple end cap disc for tubes. */
export function disc(r, segs = 16) { return new THREE.CircleGeometry(r, segs); }

export function matrix(pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  return new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...(Array.isArray(scl) ? scl : [scl, scl, scl])));
}
