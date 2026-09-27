import * as THREE from 'three';
import { getType } from '../objects/catalog.js';
import { WALLS, wallFrame } from '../model/RoomDocument.js';

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
    this.walls = {};         // wall -> Mesh
    this.wallAttached = {};  // wall -> [Object3D] (skirting pieces) hidden with the wall
    this.ceiling = null;
    this.panels = [];        // panel descriptors {x, z, w, d} (world)
    this.key = '';
  }

  toWorld(room, x, z) { return new THREE.Vector3(x - room.width / 2, 0, z - room.depth / 2); }

  build(room, objects) {
    const openings = objects.filter((o) => getType(o.type)?.placement === 'opening' && o.mount)
      .map((o) => ({ wall: o.mount.wall, offset: o.mount.offset, w: o.size.w, h: o.size.h, sill: o.elevation, type: o.type }));
    const key = JSON.stringify([room.width, room.depth, room.height, room.wallThickness, room.finishes, openings]);
    if (key === this.key) return false;
    this.key = key;
    this.dispose();
    const W = room.width, D = room.depth, H = room.height, T = room.wallThickness;
    const M = (s) => this.materials.get(s);

    // --- floor slab & finished floor ---
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * T, 0.16, D + 2 * T), M('wall_cap'));
    slab.position.y = -0.081; slab.receiveShadow = true; // top face 2 mm below the finished floor (no z-fighting)
    this.group.add(slab);
    // subdivided: avoids huge near-plane-clipped triangles (precision issues on some software/mobile rasterizers)
    const floorGeo = new THREE.PlaneGeometry(W, D, Math.ceil(W * 4), Math.ceil(D * 4)).rotateX(-Math.PI / 2);
    metreUV(floorGeo, 'xz');
    const floor = new THREE.Mesh(floorGeo, M('floor_concrete'));
    floor.receiveShadow = true; floor.name = 'floor'; floor.userData.pickable = 'floor';
    this.group.add(floor);
    this.floor = floor;
    // floor drain (stainless grate) in the centre
    const drain = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.004, 0.2), M('drain')); rim.position.y = 0.002;
    drain.add(rim);
    const slotGeo = new THREE.BoxGeometry(0.15, 0.0045, 0.008);
    const slots = new THREE.InstancedMesh(slotGeo, M('rubber_black'), 7);
    for (let i = 0; i < 7; i++) slots.setMatrixAt(i, new THREE.Matrix4().makeTranslation(0, 0.0025, -0.06 + i * 0.02));
    drain.add(slots);
    drain.position.set(0, 0, 0.35);
    drain.children.forEach((c) => (c.receiveShadow = true));
    this.group.add(drain);

    // --- walls ---
    for (const wall of WALLS) {
      const f = wallFrame(room, wall);
      const isNS = wall === 'north' || wall === 'south';
      const len = isNS ? W + 2 * T : D;
      const x0 = isNS ? -T : 0; // shape starts T before the interior corner for N/S walls (covers corners)
      const geo = notchedWall(len, x0, H, T, openings.filter((p) => p.wall === wall));
      metreUV(geo, 'xy');
      // local frame: x along wall, y up, extrusion -> +z ; interior face must be at z = T facing +z? we want interior face at local z=0 facing +z
      geo.translate(0, 0, -T);
      const mesh = new THREE.Mesh(geo, [wall === room.finishes.accentWall ? M('wall_accent') : M('wall_paint'), M('wall_cap')]);
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `wall-${wall}`;
      // place: wall start at plan f.start, x axis along f.dir, local +z = inward normal
      const start = this.toWorld(room, f.start.x, f.start.z);
      mesh.position.copy(start);
      mesh.rotation.y = Math.atan2(-f.dir.z, f.dir.x);
      this.group.add(mesh);
      this.walls[wall] = mesh;
      this.wallAttached[wall] = [];

      // cove skirting along the interior face, interrupted at door openings
      const segs = [[0, f.length]];
      for (const op of openings.filter((p) => p.wall === wall && p.sill < 0.1)) splitSegments(segs, op.offset - op.w / 2 - 0.05, op.offset + op.w / 2 + 0.05);
      for (const [a, b] of segs) {
        if (b - a < 0.02) continue;
        const sk = new THREE.Mesh(coveGeometry(b - a), M('skirting'));
        sk.position.copy(start); sk.rotation.y = mesh.rotation.y;
        sk.translateX(a);
        sk.receiveShadow = true;
        this.group.add(sk);
        this.wallAttached[wall].push(sk);
      }
    }

    // --- suspended ceiling with perimeter trim ---
    const ceilGeo = new THREE.PlaneGeometry(W, D, Math.ceil(W * 2), Math.ceil(D * 2)).rotateX(Math.PI / 2);
    metreUV(ceilGeo, 'xz');
    const ceiling = new THREE.Mesh(ceilGeo, M('ceiling'));
    ceiling.position.y = H; ceiling.receiveShadow = true; ceiling.name = 'ceiling';
    this.group.add(ceiling);
    this.ceiling = ceiling;
    this.ceilingParts = [ceiling];

    // --- LED panels (instanced) ---
    const nx = Math.max(1, Math.round(W / 2.5)), nz = Math.max(1, Math.round(D / 2.2));
    this.panels = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      this.panels.push({ x: -W / 2 + (i + 0.5) * (W / nx), z: -D / 2 + (j + 0.5) * (D / nz), w: 1.2, d: 0.6, y: H });
    }
    this._buildPanels(H);
    return true;
  }

  async _buildPanels(H) {
    const res = await this.assets.load('assets/models/ceiling_panel.glb');
    if (!res) return;
    const panels = this.panels;
    const group = new THREE.Group(); group.name = 'ceiling-panels';
    res.scene.traverse((o) => {
      if (!o.isMesh) return;
      const inst = new THREE.InstancedMesh(o.geometry, o.material, panels.length);
      panels.forEach((p, i) => inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(p.x, H, p.z)));
      inst.castShadow = false; inst.receiveShadow = false;
      if (o.material.name === 'panel_led') { inst.material = o.material.clone(); this.panelMaterial = inst.material; }
      group.add(inst);
    });
    if (this.panelGroup) this.group.remove(this.panelGroup);
    this.panelGroup = group;
    this.group.add(group);
    this.ceilingParts.push(group);
    this.onPanelsReady && this.onPanelsReady();
  }

  /** Cut-away: hide walls whose exterior side faces the camera and the ceiling when looking from above. */
  updateVisibility(room, cameraPos) {
    const W = room.width, D = room.depth, H = room.height;
    const outside = { north: cameraPos.z < -D / 2, south: cameraPos.z > D / 2, west: cameraPos.x < -W / 2, east: cameraPos.x > W / 2 };
    const hidden = new Set();
    for (const w of WALLS) {
      const vis = !outside[w];
      if (this.walls[w]) this.walls[w].visible = vis;
      for (const o of this.wallAttached[w] || []) o.visible = vis;
      if (!vis) hidden.add(w);
    }
    const ceilingVisible = cameraPos.y < H;
    for (const p of this.ceilingParts || []) p.visible = ceilingVisible;
    return { hiddenWalls: hidden, ceilingVisible };
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh && o.geometry && !o.isInstancedMesh) o.geometry.dispose(); });
    this.group.clear();
    this.walls = {}; this.wallAttached = {}; this.panelGroup = null;
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
function notchedWall(len, x0, H, T, ops) {
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

function splitSegments(segs, a, b) {
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
