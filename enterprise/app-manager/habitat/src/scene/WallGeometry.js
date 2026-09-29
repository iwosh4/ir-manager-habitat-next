import * as THREE from 'three';
import { getType, propsOf } from '../objects/catalog.js';
import { wallTopAt } from '../model/Surfaces.js';

/**
 * Shared wall geometry for both renderers (Habitat Studio 4.2).
 *
 * Local frame of a wall: x along the wall (from its start corner), y up, extrusion +z = thickness.
 * The top edge follows the wall PROFILE (full height, low knee wall, or sloped from hStart to hEnd), door
 * notches reach the floor, windows are holes. The same shape (with a different thickness) is used for
 * wall claddings, so a clad wall has exactly the same openings.
 */
export function roomOpenings(objects) {
  return objects.filter((o) => getType(o.type)?.placement === 'opening' && o.mount)
    .map((o) => ({ wall: o.mount.wall, offset: o.mount.offset, w: o.size.w, h: o.size.h, sill: o.elevation, type: o.type, id: o.id, sliding: propsOf(o).style === 'sliding' }));
}

/** Top height function of a wall in its local x (shape x may start before 0 for corner overlap). */
export function wallTopFn(room, wall, length) {
  return (x) => wallTopAt(room, wall, Math.min(length, Math.max(0, x)), length);
}

/**
 * Wall outline (profiled top) with door notches and window holes, extruded by `depth`.
 * `from`/`to` limit the shape along the wall (claddings / wainscots); `maxY` caps its height.
 */
export function wallShapeGeometry(x0, len, top, ops, depth, { maxY = Infinity, minY = 0 } = {}) {
  const x1 = x0 + len;
  const topY = (x) => Math.max(minY + 0.02, Math.min(maxY, top(x)));
  const doors = ops.filter((o) => o.sill <= 0.0001).sort((a, b) => a.offset - b.offset);
  const shape = new THREE.Shape();
  shape.moveTo(x0, minY);
  for (const d of doors) {
    const a = Math.max(x0, d.offset - d.w / 2), b = Math.min(x1, d.offset + d.w / 2);
    if (b <= a) continue;
    const h = Math.min(d.h, topY(a) - 0.02, topY(b) - 0.02);
    if (h <= minY + 0.01) continue;
    shape.lineTo(a, minY); shape.lineTo(a, h); shape.lineTo(b, h); shape.lineTo(b, minY);
  }
  shape.lineTo(x1, minY);
  // profiled top edge (sampled so a slope with notches stays planar)
  const steps = top(x0) === top(x1) && top((x0 + x1) / 2) === top(x0) ? 1 : 8;
  for (let i = steps; i >= 0; i--) { const x = x0 + (len * i) / steps; shape.lineTo(x, topY(x)); }
  shape.lineTo(x0, minY);
  for (const w of ops.filter((o) => o.sill > 0.0001)) {
    const a = Math.max(x0 + 0.01, w.offset - w.w / 2), b = Math.min(x1 - 0.01, w.offset + w.w / 2);
    const y0 = Math.max(minY + 0.01, w.sill), y1 = Math.min(Math.min(topY(a), topY(b)) - 0.03, w.sill + w.h);
    if (b <= a || y1 <= y0 + 0.02) continue;
    const hole = new THREE.Path(); hole.moveTo(a, y0); hole.lineTo(a, y1); hole.lineTo(b, y1); hole.lineTo(b, y0); hole.lineTo(a, y0);
    shape.holes.push(hole);
  }
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
}

/** [start, end] runs along a wall that are not interrupted by openings reaching below `y`. */
export function freeSegments(length, ops, y = 0.1, pad = 0.03) {
  const segs = [[0, length]];
  for (const op of ops) if (op.sill < y) split(segs, op.offset - op.w / 2 - pad, op.offset + op.w / 2 + pad);
  return segs.filter(([a, b]) => b - a > 0.02);
}
function split(segs, a, b) {
  for (let i = segs.length - 1; i >= 0; i--) {
    const [s, e] = segs[i];
    if (b <= s || a >= e) continue;
    const parts = [];
    if (a > s) parts.push([s, a]);
    if (b < e) parts.push([b, e]);
    segs.splice(i, 1, ...parts);
  }
}

/** Is x inside any opening (door or window) at height y? */
export function inOpening(ops, x, y, pad = 0.02) {
  return ops.some((o) => x > o.offset - o.w / 2 - pad && x < o.offset + o.w / 2 + pad && y > o.sill - pad && y < o.sill + o.h + pad);
}
