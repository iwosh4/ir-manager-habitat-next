import * as THREE from 'three';
import { WALLS, wallFrame } from '../model/RoomDocument.js';
import { plannerWall, plannerFloor, SKIRTING_TINT, WALL_SURFACES, wallColor } from '../model/Surfaces.js';
import { roomOpenings, wallTopFn, wallShapeGeometry, freeSegments } from '../scene/WallGeometry.js';
import { PaintBuilder } from './PaintBuilder.js';
import { TILE_CLAMP } from './PaintedMaterials.js';
import { rbox, flat, heightfield } from './geometry.js';

/**
 * PLANNER architecture (Habitat Studio 4.2): the logical room drawn with the painted material family.
 *
 *  · NO ceiling — the camera always has clean access from above (room light stays painted: pools on the floor)
 *  · every wall has its own surface: paint (colour, smooth / fine plaster) or a cladding (black laminate, oak,
 *    light oak, dark wood, walnut, wood slats, decorative panel, black technical panel), full height or as a
 *    wainscot, plus skirting and corner trims
 *  · wall PROFILE (full · low · sloped top) for attic rooms
 *  · camera-aware walls: one clipped material set (per-wall heights in a vec4); `setClips()` lowers a wall and
 *    shows a capped top edge (the wall footprint line), without rebuilding geometry
 */
export class PlannerShell {
  constructor(mats) {
    this.mats = mats;
    this.group = new THREE.Group(); this.group.name = 'planner-shell';
    this.walls = {}; this.caps = {}; this.ceilingParts = []; this.key = '';
  }

  build(room, objects) {
    const openings = roomOpenings(objects);
    const key = JSON.stringify([room.width, room.depth, room.height, room.wallThickness, room.walls, room.floor, room.details, openings.map((o) => [o.wall, o.offset, o.w, o.h, o.sill])]);
    if (key === this.key) return false;
    this.key = key;
    this.dispose();
    const W = room.width, D = room.depth, T = room.wallThickness;
    const M = this.mats;

    // ---- floor: selected surface with baked occlusion towards walls & corners
    const fl = plannerFloor(room.floor);
    const fb = new PaintBuilder(M);
    const edgeAO = (p) => {
      const dx = Math.min(p.x + W / 2, W / 2 - p.x), dz = Math.min(p.z + D / 2, D / 2 - p.z);
      const e = Math.min(dx, dz), c = Math.hypot(Math.max(0, 0.7 - dx), Math.max(0, 0.7 - dz));
      return (0.62 + 0.38 * Math.min(1, e / 0.45)) * (1 - 0.18 * Math.min(1, c / 0.7)) * (0.94 + 0.06 * Math.min(1, Math.hypot(p.x, p.z) / 2.5));
    };
    fb.add(heightfield(-W / 2, W / 2, -D / 2, D / 2, Math.ceil(W * 5), Math.ceil(D * 5), () => 0), fl.tile, { uvScale: fl.uvScale, uvOffset: [W / 2 * fl.uvScale, D / 2 * fl.uvScale], color: fl.tint, ao: edgeAO, jitter: fl.tile === 'floor' ? 0.05 : 0.02 });
    fb.add(rbox(W + 2 * T, 0.16, D + 2 * T, 0.004), 'wall_cap', { pos: [0, -0.082, 0], color: [0.3, 0.3, 0.32] });
    const floor = fb.build('floor');
    floor.traverse((o) => { if (o.isMesh) { o.userData.pickable = 'floor'; o.userData.batchable = false; } });
    this.floor = floor;
    this.group.add(floor);

    // ---- walls (one mesh group each; shared clipped material set)
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
      const wb = new PaintBuilder(M);
      // wall body: paint (claddings sit on top as a relief layer; the body shows the paint colour above a wainscot)
      const bodyPaint = surf.family === 'paint' ? plannerWall(wd) : plannerWall({ surface: 'paint_custom', color: /^#/.test(wd.color || '') ? wd.color : '#e9e6df', finish: wd.finish });
      const geo = wallShapeGeometry(x0, len, top, ops, T);
      geo.translate(0, 0, -T);
      wb.add(geo, bodyPaint.tile, { color: bodyPaint.tint, grad: [0.72, 1.04], uvScale: bodyPaint.uvScale, jitter: bodyPaint.jitter, ao: (p, n) => (n.z < 0.5 ? 0.55 : 1) });
      if (surf.family === 'cladding') this._cladding(wb, wd, surf, f.length, top, ops);
      // skirting, split at doors
      const segs = freeSegments(f.length, ops, 0.1, 0.05);
      if (sk !== 'none') for (const [a, c] of segs) wb.add(rbox(c - a, 0.09, 0.012, 0.003), sk === 'wood' ? 'planks' : sk === 'steel' ? 'stainless' : 'skirting', { pos: [(a + c) / 2, 0.045, surf.family === 'cladding' ? 0.024 : 0.006], color: SKIRTING_TINT[sk], grad: [0.8, 1.1] });
      // painted wall-base occlusion
      for (const [a, c] of segs) wb.add(new THREE.PlaneGeometry(c - a, 0.5), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', uvScale: [0, 0.5], uvOffset: [0.5, 0.5], pos: [(a + c) / 2, 0.25, surf.family === 'cladding' ? 0.02 : 0.002], alpha: 0.28 });
      // corner trims (inner vertical corners)
      if (room.details?.corners !== false) for (const c of [0, f.length]) wb.add(rbox(0.018, top(c) - 0.1, 0.018, 0.004), 'metal_dark', { pos: [c + (c ? -0.009 : 0.009), 0.1 + (top(c) - 0.1) / 2, 0.009], color: SKIRTING_TINT[sk === 'none' ? 'black' : sk].map((v) => v * 0.9) });
      const g = wb.build(`wall-${wall}`);
      const clipSet = M.clipped();
      g.traverse((o) => { if (o.isMesh) { o.userData.batchable = false; o.material = clipSet[o.userData.bucket] || o.material; } });
      g.position.set(f.start.x - W / 2, 0, f.start.z - D / 2);
      g.rotation.y = Math.atan2(-f.dir.z, f.dir.x);
      g.userData.clip = { get value() { return clipSet.clip4.value.getComponent(WALLS.indexOf(wall)); } }; // 4.1-style accessor (N,E,S,W)
      this.walls[wall] = g;
      this.group.add(g);

      // footprint cap (unit height strip, moved to the clip height; split at doors)
      const cb = new PaintBuilder(M);
      for (const [a, c] of freeSegments(len, ops.map((o) => ({ ...o, offset: o.offset - x0 })), 0.1, 0)) {
        cb.add(rbox(c - a, 0.02, T + 0.004, 0.002), 'wall_cap', { pos: [x0 + (a + c) / 2, -0.01, -T / 2], color: [1.4, 1.38, 1.36] });
        cb.add(rbox(c - a, 0.004, 0.006, 0.001), 'amber', { pos: [x0 + (a + c) / 2, 0.001, 0.004], glow: 0.35, color: [0.9, 0.6, 0.3] });
      }
      const cap = cb.build(`wall-cap-${wall}`);
      cap.traverse((o) => { if (o.isMesh) o.userData.batchable = false; });
      cap.position.copy(g.position); cap.rotation.y = g.rotation.y; cap.visible = false;
      this.caps[wall] = cap;
      this.group.add(cap);
    }

    // ---- painted room light: soft pools on the floor (no ceiling, no fixtures)
    const pb = new PaintBuilder(M);
    const nx = Math.max(1, Math.round(W / 2.5)), nz = Math.max(1, Math.round(D / 2.2));
    this.panels = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = -W / 2 + (i + 0.5) * (W / nx), z = -D / 2 + (j + 0.5) * (D / nz);
      this.panels.push({ x, z });
      pb.add(flat(3.2, 2.4), 'glow', { bucket: 'glow', mode: TILE_CLAMP, uv: 'keep', pos: [x, 0.004, z], color: [0.24, 0.22, 0.2], alpha: 1, room: true });
    }
    const pools = pb.build('floor-light');
    pools.traverse((o) => { if (o.isMesh) o.userData.batchable = false; });
    this.floorLight = pools;
    this.group.add(pools);
    this.ceilingParts = [];
    return true;
  }

  /** Cladding relief in front of the wall body (openings respected), full height or wainscot. */
  _cladding(wb, wd, surf, length, top, ops) {
    const pw = plannerWall(wd);
    const maxY = wd.coverHeight > 0 ? wd.coverHeight : Infinity;
    const t = 0.016;
    if (surf.relief === 'slats') {
      // dark acoustic backing + individual lamellas (7 cm pitch, 4.5 cm wide, 2 cm deep)
      const back = wallShapeGeometry(0, length, top, ops, 0.008, { maxY });
      wb.add(back, 'laminate', { color: [0.55, 0.55, 0.58], uvScale: 1 });
      const pitch = 0.07;
      for (let x = pitch / 2; x < length - 0.02; x += pitch) {
        const hTop = Math.min(maxY, top(x)) - 0.005;
        // skip / split around openings
        const cuts = ops.filter((o) => x > o.offset - o.w / 2 - 0.03 && x < o.offset + o.w / 2 + 0.03).sort((a, b) => a.sill - b.sill);
        let y = 0.1;
        for (const o of cuts) { if (o.sill > y + 0.02) wb.add(rbox(0.045, o.sill - y, 0.02, 0.003), 'planks', { pos: [x, y + (o.sill - y) / 2, 0.018], color: pw.tint, uvScale: 1.3 }); y = Math.max(y, o.sill + o.h); }
        if (hTop > y + 0.02) wb.add(rbox(0.045, hTop - y, 0.02, 0.003), 'planks', { pos: [x, y + (hTop - y) / 2, 0.018], color: pw.tint, uvScale: 1.3, grad: [0.85, 1.05] });
      }
      return;
    }
    const geo = wallShapeGeometry(0, length, top, ops, t, { maxY });
    wb.add(geo, pw.tile, { color: pw.tint, uvScale: pw.uvScale, grad: [0.8, 1.05] });
    if (pw.seams) for (let x = pw.seams; x < length - 0.05; x += pw.seams) { // panel joints
      const hTop = Math.min(maxY, top(x)) - 0.01;
      if (!ops.some((o) => x > o.offset - o.w / 2 && x < o.offset + o.w / 2)) wb.add(rbox(0.004, hTop, 0.003, 0.001), 'plastic_black', { pos: [x, hTop / 2, t + 0.001], color: [0.05, 0.05, 0.06] });
    }
    if (maxY !== Infinity) wb.add(rbox(length, 0.018, 0.022, 0.003), pw.tile, { pos: [length / 2, maxY + 0.009, 0.011], color: pw.tint.map((v) => v * 1.15) }); // wainscot cap rail
  }

  /**
   * Camera-aware walls: clip every wall at its height (metres). Lowered walls show their cap strip;
   * walls clipped at ~0 remain as a footprint line on the floor.
   */
  setClips(clips, room) {
    const set = this.mats.clipped();
    set.half.value.set(room.width / 2, room.depth / 2);
    for (const w of WALLS) {
      const g = this.walls[w], cap = this.caps[w]; if (!g) continue;
      const h = clips[w] ?? room.height;
      set.clip4.value.setComponent(WALLS.indexOf(w), h >= room.height - 0.004 ? 1e6 : h);
      g.visible = h > 0.004;
      if (cap) { cap.visible = h < room.height - 0.02; cap.position.y = Math.max(0.006, h); }
    }
  }

  /** 4.1 API (kept for callers): no ceiling any more; walls are handled by setClips. */
  updateVisibility() { return { hiddenWalls: new Set(), ceilingVisible: false }; }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.group.clear();
    this.walls = {}; this.caps = {}; this.ceilingParts = [];
  }
}

export { wallColor };
