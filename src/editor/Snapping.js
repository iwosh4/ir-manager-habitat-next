import { getType } from '../objects/catalog.js';
import { WALLS, wallFrame } from '../model/RoomDocument.js';
import { footprintExtents } from './Editor.js';

const WALL_SNAP_WALLTYPE = 0.45;  // wall-backed furniture/enclosures pull to walls from this distance
const WALL_SNAP_FREE = 0.12;
const OBJ_SNAP = 0.07;

/** 2D oriented rectangle corners of an object's footprint (plan space). */
export function footprint(o, pos = o.position, rotation = o.rotation) {
  const a = (rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const hw = o.size.w / 2, hd = o.size.d / 2;
  // local x axis in plan = (cos a, -sin a) ; local z (front) = (sin a, cos a)
  const ax = { x: c, z: -s }, az = { x: s, z: c };
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => ({ x: pos.x + ax.x * lx + az.x * lz, z: pos.z + ax.z * lx + az.z * lz }));
}

function overlapOBB(pa, pb) {
  const axes = [];
  for (const p of [pa, pb]) for (let i = 0; i < 2; i++) { const e = { x: p[i + 1].x - p[i].x, z: p[i + 1].z - p[i].z }; axes.push({ x: -e.z, z: e.x }); }
  for (const ax of axes) {
    const proj = (p) => p.map((v) => v.x * ax.x + v.z * ax.z);
    const a = proj(pa), b = proj(pb);
    const EPS = 1e-4 * Math.hypot(ax.x, ax.z);
    if (Math.max(...a) <= Math.min(...b) + EPS || Math.max(...b) <= Math.min(...a) + EPS) return false;
  }
  return true;
}

export class Snapper {
  constructor(editor) { this.editor = editor; }

  /** Collisions of object `o` (with a candidate transform) against all others in overlapping height. */
  collisions(o, cand = o) {
    const t = getType(o.type);
    const out = [];
    const fp = footprint(o, cand.position, cand.rotation);
    const y0 = cand.elevation, y1 = cand.elevation + o.size.h;
    for (const other of this.editor.objects) {
      if (other.id === o.id) continue;
      const ot = getType(other.type);
      if (!ot) continue;
      if (t.placement === 'opening' || ot.placement === 'opening') {
        if (t.placement === 'opening' && ot.placement === 'opening' && cand.mount && other.mount && cand.mount.wall === other.mount.wall) {
          if (Math.abs(cand.mount.offset - other.mount.offset) < (o.size.w + other.size.w) / 2 - 1e-3) out.push(other.id);
        }
        continue;
      }
      if (t.placement === 'mounted' || ot.placement === 'mounted') {
        if (!(cand.mount && other.mount && cand.mount.wall === other.mount.wall)) continue;
      }
      const oy0 = other.elevation, oy1 = other.elevation + other.size.h;
      if (y1 <= oy0 + 1e-3 || oy1 <= y0 + 1e-3) continue;
      if (overlapOBB(fp, footprint(other))) out.push(other.id);
    }
    return out;
  }

  /**
   * Snap a dragged free-standing object whose centre wants to be at `raw` (plan coords).
   * Returns the candidate transform + visual guides.
   */
  place(o, raw, { snap = this.editor.snap } = {}) {
    const room = this.editor.room, t = getType(o.type);
    if (t.placement === 'opening' || t.placement === 'mounted') return this.placeOnWall(o, raw, { snap });
    const guides = [];
    let rotation = o.rotation;
    let x = raw.x, z = raw.z;
    if (snap.enabled && snap.grid > 0) { x = Math.round(x / snap.grid) * snap.grid; z = Math.round(z / snap.grid) * snap.grid; }

    // --- walls ---
    if (snap.enabled && snap.walls) {
      const dist = { north: raw.z, south: room.depth - raw.z, west: raw.x, east: room.width - raw.x };
      if (t.placement === 'wall') {
        const nearest = WALLS.reduce((a, b) => (dist[a] < dist[b] ? a : b));
        if (dist[nearest] - o.size.d / 2 < WALL_SNAP_WALLTYPE) {
          rotation = wallFrame(room, nearest).rotation;
          const hd = o.size.d / 2;
          if (nearest === 'north') z = hd; if (nearest === 'south') z = room.depth - hd;
          if (nearest === 'west') x = hd; if (nearest === 'east') x = room.width - hd;
          guides.push({ kind: 'wall', wall: nearest });
        }
      }
      const e = footprintExtents({ ...o, rotation });
      if (x - e.x < WALL_SNAP_FREE) { x = e.x; guides.push({ kind: 'wall', wall: 'west' }); }
      if (room.width - (x + e.x) < WALL_SNAP_FREE) { x = room.width - e.x; guides.push({ kind: 'wall', wall: 'east' }); }
      if (z - e.z < WALL_SNAP_FREE) { z = e.z; guides.push({ kind: 'wall', wall: 'north' }); }
      if (room.depth - (z + e.z) < WALL_SNAP_FREE) { z = room.depth - e.z; guides.push({ kind: 'wall', wall: 'south' }); }
    }

    // --- stacking onto supporting furniture (terrarium on a stand) ---
    let elevation = 0, support = null;
    if (t.stackable) {
      for (const other of this.editor.objects) {
        if (other.id === o.id || !getType(other.type)?.supports) continue;
        const fp = footprint(other);
        if (pointInPoly({ x: raw.x, z: raw.z }, fp)) { support = other; break; }
      }
      if (support) {
        elevation = support.elevation + support.size.h;
        rotation = support.rotation;
        // align backs & centre on the support when close
        const a = (support.rotation * Math.PI) / 180;
        const az = { x: Math.sin(a), z: Math.cos(a) }, ax = { x: Math.cos(a), z: -Math.sin(a) };
        const rel = { x: x - support.position.x, z: z - support.position.z };
        let lx = rel.x * ax.x + rel.z * ax.z; let lz = rel.x * az.x + rel.z * az.z;
        const backZ = -support.size.d / 2 + o.size.d / 2;
        lz = backZ;
        const maxX = Math.max(0, (support.size.w - o.size.w) / 2);
        if (Math.abs(lx) < 0.06 || !snap.enabled) lx = Math.abs(lx) < 0.06 ? 0 : lx;
        lx = Math.max(-maxX, Math.min(maxX, lx));
        x = support.position.x + ax.x * lx + az.x * lz; z = support.position.z + ax.z * lx + az.z * lz;
        guides.push({ kind: 'support', id: support.id });
      }
    } else {
      elevation = t.elevation || 0;
    }

    // --- neighbour edges (axis-aligned objects only) ---
    if (snap.enabled && snap.objects && rotation % 90 === 0) {
      const e = footprintExtents({ ...o, rotation });
      let bestX = null, bestZ = null;
      for (const other of this.editor.objects) {
        if (other.id === o.id || other.rotation % 90 !== 0 || getType(other.type)?.placement === 'opening' || getType(other.type)?.placement === 'mounted') continue;
        if (support && other.id === support.id) continue;
        const oe = footprintExtents(other);
        const candX = [other.position.x - oe.x - e.x, other.position.x + oe.x + e.x, other.position.x - oe.x + e.x, other.position.x + oe.x - e.x];
        const candZ = [other.position.z - oe.z - e.z, other.position.z + oe.z + e.z, other.position.z - oe.z + e.z, other.position.z + oe.z - e.z];
        const nearZ = Math.abs(other.position.z - z) < oe.z + e.z + 0.3, nearX = Math.abs(other.position.x - x) < oe.x + e.x + 0.3;
        if (nearZ) for (const c of candX) { const d = Math.abs(c - x); if (d < OBJ_SNAP && (!bestX || d < bestX.d)) bestX = { v: c, d, id: other.id }; }
        if (nearX) for (const c of candZ) { const d = Math.abs(c - z); if (d < OBJ_SNAP && (!bestZ || d < bestZ.d)) bestZ = { v: c, d, id: other.id }; }
      }
      if (bestX) { x = bestX.v; guides.push({ kind: 'object', id: bestX.id, axis: 'x' }); }
      if (bestZ) { z = bestZ.v; guides.push({ kind: 'object', id: bestZ.id, axis: 'z' }); }
    }

    const e = footprintExtents({ ...o, rotation });
    x = Math.min(room.width - e.x, Math.max(e.x, x));
    z = Math.min(room.depth - e.z, Math.max(e.z, z));
    const cand = { position: { x, z }, rotation, elevation, mount: null };
    cand.collisions = this.collisions(o, cand);
    cand.guides = guides;
    cand.support = support?.id || null;
    return cand;
  }

  /** Wall-bound objects: project onto the nearest wall. */
  placeOnWall(o, raw, { snap = this.editor.snap } = {}) {
    const room = this.editor.room;
    const dist = { north: raw.z, south: room.depth - raw.z, west: raw.x, east: room.width - raw.x };
    const wall = WALLS.reduce((a, b) => (dist[a] < dist[b] ? a : b));
    const f = wallFrame(room, wall);
    let offset = (raw.x - f.start.x) * f.dir.x + (raw.z - f.start.z) * f.dir.z;
    if (snap.enabled && snap.grid > 0) offset = Math.round(offset / snap.grid) * snap.grid;
    const half = o.size.w / 2;
    offset = Math.min(f.length - half, Math.max(half, offset));
    const cand = { mount: { wall, offset }, rotation: f.rotation, elevation: o.elevation };
    const inset = getType(o.type).placement === 'opening' ? -room.wallThickness / 2 : o.size.d / 2;
    cand.position = { x: f.start.x + f.dir.x * offset + f.normal.x * inset, z: f.start.z + f.dir.z * offset + f.normal.z * inset };
    cand.collisions = this.collisions(o, cand);
    cand.guides = [{ kind: 'wall', wall }];
    return cand;
  }
}

function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > p.z) !== (b.z > p.z) && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
