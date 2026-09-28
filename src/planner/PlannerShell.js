import * as THREE from 'three';
import { getType } from '../objects/catalog.js';
import { WALLS, wallFrame } from '../model/RoomDocument.js';
import { notchedWall, splitSegments } from '../scene/RoomShell.js';
import { PaintBuilder } from './PaintBuilder.js';
import { TILE_CLAMP } from './PaintedMaterials.js';
import { rbox, flat, heightfield } from './geometry.js';

/**
 * PLANNER architecture: the same logical room as the Showcase shell (dimensions, openings, finishes),
 * drawn with the painted material family. Light is painted in: floor occlusion along the walls and
 * corners is baked into vertex colours, walls carry a vertical value gradient, ceiling panels glow.
 * Every wall is its own mesh so the cut-away can hide it; everything else is one mesh per bucket.
 */
export class PlannerShell {
  constructor(mats) {
    this.mats = mats;
    this.group = new THREE.Group(); this.group.name = 'planner-shell';
    this.walls = {}; this.ceilingParts = []; this.key = '';
  }

  build(room, objects) {
    const openings = objects.filter((o) => getType(o.type)?.placement === 'opening' && o.mount)
      .map((o) => ({ wall: o.mount.wall, offset: o.mount.offset, w: o.size.w, h: o.size.h, sill: o.elevation, type: o.type }));
    const key = JSON.stringify([room.width, room.depth, room.height, room.wallThickness, room.finishes, openings]);
    if (key === this.key) return false;
    this.key = key;
    this.dispose();
    const W = room.width, D = room.depth, H = room.height, T = room.wallThickness;
    const M = this.mats;

    // ---- floor: painted concrete with baked occlusion towards walls & corners
    const fb = new PaintBuilder(M);
    const edgeAO = (p) => {
      const dx = Math.min(p.x + W / 2, W / 2 - p.x), dz = Math.min(p.z + D / 2, D / 2 - p.z);
      const e = Math.min(dx, dz), c = Math.hypot(Math.max(0, 0.7 - dx), Math.max(0, 0.7 - dz));
      return (0.62 + 0.38 * Math.min(1, e / 0.45)) * (1 - 0.18 * Math.min(1, c / 0.7)) * (0.94 + 0.06 * Math.min(1, Math.hypot(p.x, p.z) / 2.5));
    };
    fb.add(heightfield(-W / 2, W / 2, -D / 2, D / 2, Math.ceil(W * 5), Math.ceil(D * 5), () => 0), 'floor', { uvScale: 0.9, color: [1.0, 0.98, 0.96], ao: edgeAO, jitter: 0.05 });
    // slab edge around the room (visible from outside views)
    fb.add(rbox(W + 2 * T, 0.16, D + 2 * T, 0.004), 'wall_cap', { pos: [0, -0.082, 0], color: [0.3, 0.3, 0.32] });
    // floor drain
    fb.add(rbox(0.2, 0.004, 0.2, 0.001), 'drain', { mode: TILE_CLAMP, uv: 'xz', uvScale: 5, uvOffset: [0.5, 0.5], pos: [0, 0.002, 0.35], color: [0.8, 0.8, 0.82] });
    fb.add(flat(0.5, 0.5), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [0, 0.001, 0.35], alpha: 0.5 });
    const floor = fb.build('floor');
    floor.traverse((o) => { if (o.isMesh) { o.userData.pickable = 'floor'; o.userData.batchable = false; } });
    this.floor = floor;
    this.group.add(floor);

    // ---- walls (one mesh each, cut-away aware)
    for (const wall of WALLS) {
      const f = wallFrame(room, wall);
      const isNS = wall === 'north' || wall === 'south';
      const len = isNS ? W + 2 * T : D;
      const x0 = isNS ? -T : 0;
      const ops = openings.filter((p) => p.wall === wall);
      const wb = new PaintBuilder(M);
      const geo = notchedWall(len, x0, H, T, ops);
      geo.translate(0, 0, -T);
      const accent = wall === room.finishes?.accentWall;
      const tile = accent ? 'wall_dark' : 'wall_light';
      const base = accent ? [0.7, 0.7, 0.75] : [0.82, 0.8, 0.77];
      wb.add(geo, tile, { color: base, grad: [0.55, 1.05], uvScale: 0.8, ao: (p, n) => (n.z < 0.5 ? 0.55 : 1) });
      // skirting (dark rubber), split at doors
      const segs = [[0, f.length]];
      for (const op of ops.filter((p) => p.sill < 0.1)) splitSegments(segs, op.offset - op.w / 2 - 0.05, op.offset + op.w / 2 + 0.05);
      for (const [a, c] of segs) if (c - a > 0.02) wb.add(rbox(c - a, 0.09, 0.012, 0.003), 'skirting', { pos: [(a + c) / 2, 0.045, 0.006], color: [0.35, 0.35, 0.37], grad: [0.8, 1.1] });
      // painted wall-base occlusion (soft darkening where wall meets floor)
      for (const [a, c] of segs) if (c - a > 0.02) wb.add(new THREE.PlaneGeometry(c - a, 0.5), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', uvScale: [0, 0.5], uvOffset: [0.5, 0.5], pos: [(a + c) / 2, 0.25, 0.002], alpha: 0.28 });
      const g = wb.build(`wall-${wall}`);
      g.position.copy(new THREE.Vector3(f.start.x - W / 2, 0, f.start.z - D / 2));
      g.rotation.y = Math.atan2(-f.dir.z, f.dir.x);
      g.traverse((o) => { if (o.isMesh) o.userData.batchable = false; });
      this.walls[wall] = g;
      this.group.add(g);
    }

    // ---- ceiling with glowing LED panels
    const cb = new PaintBuilder(M), fb2 = new PaintBuilder(M);
    cb.add(new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2), 'ceiling', { uv: 'xz', uvScale: 1.6, pos: [0, H, 0], color: [0.55, 0.55, 0.56] });
    const nx = Math.max(1, Math.round(W / 2.5)), nz = Math.max(1, Math.round(D / 2.2));
    this.panels = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = -W / 2 + (i + 0.5) * (W / nx), z = -D / 2 + (j + 0.5) * (D / nz);
      this.panels.push({ x, z });
      cb.add(rbox(1.24, 0.02, 0.64, 0.004), 'alu', { pos: [x, H - 0.01, z], color: [0.7, 0.7, 0.72] });
      cb.add(new THREE.PlaneGeometry(1.2, 0.6).rotateX(Math.PI / 2), 'panel_light', { mode: TILE_CLAMP, uv: 'keep', pos: [x, H - 0.021, z], glow: 1, color: [1, 1, 1], room: true });
      // painted pool of light on the floor below each panel (additive, no light source)
      fb2.add(flat(3.2, 2.4), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [x, 0.004, z], color: [0.3, 0.28, 0.25], alpha: 1, room: true });
    }
    const pools = fb2.build('floor-light');
    pools.traverse((o) => { if (o.isMesh) o.userData.batchable = false; });
    this.floorLight = pools;
    this.group.add(pools);
    const ceil = cb.build('ceiling');
    ceil.traverse((o) => { if (o.isMesh) o.userData.batchable = false; });
    this.ceiling = ceil;
    this.ceilingParts = [ceil];
    this.group.add(ceil);
    this.panelMeshes = ceil.children;
    return true;
  }

  /** Cut-away: hide walls between camera and room, and the ceiling when looking from above. */
  updateVisibility(room, cameraPos) {
    const W = room.width, D = room.depth, H = room.height;
    const outside = { north: cameraPos.z < -D / 2, south: cameraPos.z > D / 2, west: cameraPos.x < -W / 2, east: cameraPos.x > W / 2 };
    const hidden = new Set();
    for (const w of WALLS) { const vis = !outside[w]; if (this.walls[w]) this.walls[w].visible = vis; if (!vis) hidden.add(w); }
    const ceilingVisible = cameraPos.y < H;
    for (const p of this.ceilingParts) p.visible = ceilingVisible;
    return { hiddenWalls: hidden, ceilingVisible };
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.group.clear();
    this.walls = {}; this.ceilingParts = [];
  }
}
