import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WALLS, wallFrame } from '../model/RoomDocument.js';
import { WALL_SURFACES, FLOOR_SURFACES, SKIRTING_COLOR, wallColor } from '../model/Surfaces.js';
import { roomOpenings, wallTopFn, wallShapeGeometry, freeSegments } from './WallGeometry.js';

/**
 * Procedural architecture: floor slab, walls with real openings, cove skirting, suspended ceiling,
 * floor drain and instanced LED ceiling panels. Rebuilt whenever room dimensions or openings change.
 *
 * World space: the room is centred on the origin; plan (x,z) maps to world (x - W/2, z - D/2).
 */
export class RoomShell {
  constructor(materials, assets) {
    this.materials = materials;
    this.assets = assets;
    this.group = new THREE.Group(); this.group.name = 'room-shell';
    this.walls = {};         // wall -> Group (body + cladding + trims), clipped by the camera-aware wall system
    this.wallAttached = {};
    this.caps = {};
    this.ceiling = null;     // 4.2: no ceiling is rendered (lights keep their panel positions)
    this.panels = [];        // light panel descriptors {x, z, w, d, y} (world) — used by Lighting only
    this.surfaceMats = new Map();
    this.key = '';
  }

  toWorld(room, x, z) { return new THREE.Vector3(x - room.width / 2, 0, z - room.depth / 2); }

  /** Physical material of a surface, cached; `clipKey` gives a per-wall clone with its own clip plane. */
  _surface(kind, spec, clipKey = null) {
    const key = `${kind}|${JSON.stringify(spec)}|${clipKey || ''}`;
    let m = this.surfaceMats.get(key);
    if (m) return m;
    const L = this.materials;
    const C = (hex) => new THREE.Color(hex);
    if (kind === 'paint') m = new THREE.MeshStandardMaterial({ ...L.set('plaster', 3.0, { normalScale: spec.finish === 'plaster' ? 0.45 : 0.1 }), color: C(spec.color), roughness: 1 });
    else if (kind === 'floor') {
      const f = FLOOR_SURFACES[spec.surface] || FLOOR_SURFACES.concrete;
      if (f.showcase) m = L.get(f.showcase);
      else if (f.tile === 'floor_tile') m = new THREE.MeshPhysicalMaterial({ ...L.set('tiles', spec.surface === 'technical' ? 0.6 : 1.2, { normalScale: 0.8 }), color: C(spec.color || f.color).multiplyScalar(1.6), roughness: 0.8, clearcoat: 0.25, clearcoatRoughness: 0.35 });
      else if (f.wood) m = new THREE.MeshStandardMaterial({ ...L.set('oak', [1.2, 0.6]), color: C(spec.color || f.color).multiplyScalar(1.7), roughness: 0.9 });
      else if (spec.surface === 'vinyl') m = new THREE.MeshStandardMaterial({ ...L.set('oak', [1.2, 0.6], { albedo: false }), color: C(spec.color || f.color), roughness: 0.7 });
      else m = new THREE.MeshStandardMaterial({ ...L.set('concrete_floor', 2.5, { normalScale: 0.6 }), color: C(spec.color || f.color).multiplyScalar(1.4), roughness: 0.95 });
    } else if (kind === 'cladding') {
      const s = WALL_SURFACES[spec.surface];
      if (s.wood) m = new THREE.MeshStandardMaterial({ ...L.set('oak', [1.2, 0.6]), color: C(s.color).multiplyScalar(1.6), roughness: 0.85 });
      else if (spec.surface === 'deco_panel') m = new THREE.MeshStandardMaterial({ ...L.set('tiles', [0.3, 0.3], { albedo: false, normalScale: 1.4 }), color: C(s.color), roughness: 0.8 });
      else m = new THREE.MeshStandardMaterial({ color: C(s.color), roughness: s.roughness ?? 0.6, metalness: spec.surface === 'tech_panel' ? 0.3 : 0 });
    } else if (kind === 'trim') m = new THREE.MeshStandardMaterial({ color: C(spec.color), roughness: spec.color === SKIRTING_COLOR.steel ? 0.35 : 0.55, metalness: spec.color === SKIRTING_COLOR.steel ? 0.8 : 0 });
    else if (kind === 'backing') m = new THREE.MeshStandardMaterial({ color: C('#1a1b1d'), roughness: 0.95 });
    if (clipKey) { m = m.clone(); m.clippingPlanes = [this._clipPlane(clipKey)]; m.clipShadows = false; }
    this.surfaceMats.set(key, m);
    return m;
  }
  _clipPlane(wall) { return ((this._planes ||= {})[wall] ||= new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6)); }

  build(room, objects) {
    const openings = roomOpenings(objects);
    const key = JSON.stringify([room.width, room.depth, room.height, room.wallThickness, room.walls, room.floor, room.details, openings.map((o) => [o.wall, o.offset, o.w, o.h, o.sill])]);
    if (key === this.key) return false;
    this.key = key;
    this.dispose();
    const W = room.width, D = room.depth, H = room.height, T = room.wallThickness;
    const M = (s) => this.materials.get(s);

    // --- floor slab & finished floor ---
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * T, 0.16, D + 2 * T), M('wall_cap'));
    slab.position.y = -0.081; slab.receiveShadow = true;
    this.group.add(slab);
    const floorGeo = new THREE.PlaneGeometry(W, D, Math.ceil(W * 4), Math.ceil(D * 4)).rotateX(-Math.PI / 2);
    metreUV(floorGeo, 'xz');
    const floor = new THREE.Mesh(floorGeo, this._surface('floor', { surface: room.floor?.surface || 'concrete', color: room.floor?.color || null }));
    floor.receiveShadow = true; floor.name = 'floor'; floor.userData.pickable = 'floor';
    this.group.add(floor);
    this.floor = floor;

    // --- walls ---
    const sk = room.details?.skirting || 'black';
    for (const wall of WALLS) {
      const f = wallFrame(room, wall);
      const isNS = wall === 'north' || wall === 'south';
      const len = isNS ? W + 2 * T : D;
      const x0 = isNS ? -T : 0;
      const ops = openings.filter((p) => p.wall === wall);
      const wd = room.walls?.[wall] || {};
      const surf = WALL_SURFACES[wd.surface] || WALL_SURFACES.paint_light_grey;
      const top = wallTopFn(room, wall, f.length);
      const g = new THREE.Group(); g.name = `wall-${wall}`;
      const start = this.toWorld(room, f.start.x, f.start.z);
      g.position.copy(start); g.rotation.y = Math.atan2(-f.dir.z, f.dir.x);
      const geo = wallShapeGeometry(x0, len, top, ops, T);
      metreUV(geo, 'xy');
      geo.translate(0, 0, -T);
      const paintCol = surf.family === 'paint' ? wallColor(wd) : (/^#/.test(wd.color || '') ? wd.color : '#e9e6df');
      const body = new THREE.Mesh(geo, [this._surface('paint', { color: paintCol, finish: wd.finish }, wall), this._capMat(wall)]);
      body.castShadow = true; body.receiveShadow = true; body.name = `wall-${wall}`;
      g.add(body);
      g.geometry = body.geometry; // 4.1 API: shell.walls[wall].geometry is the wall body (openings cut)
      if (surf.family === 'cladding') this._cladding(g, wd, surf, f.length, top, ops, wall);
      // skirting
      if (sk !== 'none') {
        const pieces = [];
        for (const [a, b] of freeSegments(f.length, ops, 0.1, 0.05)) pieces.push(coveGeometry(b - a).translate(a, 0, surf.family === 'cladding' ? 0.018 : 0));
        if (pieces.length) { const m = new THREE.Mesh(pieces.length > 1 ? mergeGeometries(pieces) : pieces[0], this._surface('trim', { color: SKIRTING_COLOR[sk] }, wall)); m.receiveShadow = true; g.add(m); }
      }
      if (room.details?.corners !== false) {
        const trims = [0, f.length].map((c) => new THREE.BoxGeometry(0.018, top(c) - 0.1, 0.018).translate(c + (c ? -0.009 : 0.009), 0.1 + (top(c) - 0.1) / 2, 0.009));
        g.add(new THREE.Mesh(mergeGeometries(trims), this._surface('trim', { color: SKIRTING_COLOR[sk === 'none' ? 'black' : sk] }, wall)));
      }
      this.group.add(g);
      this.walls[wall] = g;
      this.wallAttached[wall] = [];
      // footprint cap (moved to the clip height)
      const capGeos = freeSegments(len, ops.map((o) => ({ ...o, offset: o.offset - x0 })), 0.1, 0).map(([a, b]) => new THREE.BoxGeometry(b - a, 0.02, T + 0.004).translate(x0 + (a + b) / 2, -0.01, -T / 2));
      if (capGeos.length) {
        const cap = new THREE.Mesh(mergeGeometries(capGeos), this._surface('trim', { color: '#3b3d42' }));
        cap.position.copy(g.position); cap.rotation.y = g.rotation.y; cap.visible = false; cap.receiveShadow = true;
        this.caps[wall] = cap; this.group.add(cap);
      }
    }

    // --- no ceiling (4.2): only the light positions remain for the lighting rig ---
    const nx = Math.max(1, Math.round(W / 2.5)), nz = Math.max(1, Math.round(D / 2.2));
    this.panels = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) this.panels.push({ x: -W / 2 + (i + 0.5) * (W / nx), z: -D / 2 + (j + 0.5) * (D / nz), w: 1.2, d: 0.6, y: H });
    this.ceilingParts = [];
    return true;
  }

  _capMat(wall) { return this._surface('trim', { color: '#2a2b2e' }, wall); }

  _cladding(g, wd, surf, length, top, ops, wall) {
    const maxY = wd.coverHeight > 0 ? wd.coverHeight : Infinity;
    const mat = this._surface('cladding', { surface: wd.surface }, wall);
    if (surf.relief === 'slats') {
      const back = wallShapeGeometry(0, length, top, ops, 0.008, { maxY }); metreUV(back, 'xy');
      g.add(new THREE.Mesh(back, this._surface('backing', {}, wall)));
      const slats = [];
      for (let x = 0.035; x < length - 0.02; x += 0.07) {
        const hTop = Math.min(maxY, top(x)) - 0.005;
        const cuts = ops.filter((o) => x > o.offset - o.w / 2 - 0.03 && x < o.offset + o.w / 2 + 0.03).sort((a, b) => a.sill - b.sill);
        let y = 0.1;
        for (const o of cuts) { if (o.sill > y + 0.02) slats.push(new THREE.BoxGeometry(0.045, o.sill - y, 0.02).translate(x, y + (o.sill - y) / 2, 0.018)); y = Math.max(y, o.sill + o.h); }
        if (hTop > y + 0.02) slats.push(new THREE.BoxGeometry(0.045, hTop - y, 0.02).translate(x, y + (hTop - y) / 2, 0.018));
      }
      if (slats.length) { const merged = mergeGeometries(slats); metreUV(merged, 'xy'); const m = new THREE.Mesh(merged, mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
      return;
    }
    const geo = wallShapeGeometry(0, length, top, ops, 0.016, { maxY }); metreUV(geo, 'xy');
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; g.add(m);
  }

  /** Camera-aware walls: clip heights per wall (world metres). */
  setClips(clips, room) {
    for (const w of WALLS) {
      const g = this.walls[w]; if (!g) continue;
      const h = clips[w] ?? room.height;
      this._clipPlane(w).constant = h >= room.height - 0.004 ? 1e6 : h;
      g.visible = h > 0.004;
      const cap = this.caps[w]; if (cap) { cap.visible = h < room.height - 0.02; cap.position.y = Math.max(0.006, h); }
    }
  }

  /** 4.1 API kept for callers; the ceiling no longer exists. */
  updateVisibility() { return { hiddenWalls: new Set(), ceilingVisible: false }; }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
    this.group.clear();
    this.walls = {}; this.wallAttached = {}; this.caps = {}; this.panelGroup = null;
  }
}

/** Planar metre-based UVs. */
function metreUV(geo, plane) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    let u, v;
    if (plane === 'xz') { u = p.getX(i); v = p.getZ(i); } else {
      const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
      if (ny > 0.5) { u = p.getX(i); v = p.getZ(i); } else if (nx > 0.5) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); }
    }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** Wall outline with door notches (openings reaching the floor) + window holes. */
export function notchedWall(len, x0, H, T, ops) {
  const doors = ops.filter((o) => o.sill <= 0.0001).sort((a, b) => a.offset - b.offset);
  const shape = new THREE.Shape();
  shape.moveTo(x0, 0);
  for (const d of doors) {
    const a = d.offset - d.w / 2, b = d.offset + d.w / 2, top = Math.min(H - 0.02, d.h);
    shape.lineTo(a, 0); shape.lineTo(a, top); shape.lineTo(b, top); shape.lineTo(b, 0);
  }
  shape.lineTo(x0 + len, 0); shape.lineTo(x0 + len, H); shape.lineTo(x0, H); shape.lineTo(x0, 0);
  for (const w of ops.filter((o) => o.sill > 0.0001)) {
    const a = w.offset - w.w / 2, b = w.offset + w.w / 2, y0 = w.sill, y1 = Math.min(H - 0.02, w.sill + w.h);
    const hole = new THREE.Path(); hole.moveTo(a, y0); hole.lineTo(a, y1); hole.lineTo(b, y1); hole.lineTo(b, y0); hole.lineTo(a, y0);
    shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false, curveSegments: 1 });
}

export function splitSegments(segs, a, b) {
  for (let i = segs.length - 1; i >= 0; i--) {
    const [s, e] = segs[i];
    if (b <= s || a >= e) continue;
    const parts = [];
    if (a > s) parts.push([s, a]);
    if (b < e) parts.push([b, e]);
    segs.splice(i, 1, ...parts);
  }
}

/** Coved rubber skirting profile (10 cm) extruded along local +X, sitting on the interior face (z >= 0). */
function coveGeometry(length) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0.012, 0); s.quadraticCurveTo(0.012, 0.012, 0.004, 0.02); s.lineTo(0.004, 0.1); s.lineTo(0, 0.1); s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 4 });
  // shape x = distance from wall (-> +z), shape y = height, extrusion z = along wall (-> +x)
  g.rotateY(Math.PI / 2);   // extrusion now along +x ... shape x now along -z
  g.scale(1, 1, -1);        // flip so the profile sits in front of the wall (+z)
  const idx = g.index ? g.index.array : null;
  if (!idx) { const n = g.attributes.position.count; const arr = []; for (let i = 0; i < n; i += 3) arr.push(i, i + 2, i + 1); g.setIndex(arr); } else { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } }
  g.computeVertexNormals();
  return g;
}
