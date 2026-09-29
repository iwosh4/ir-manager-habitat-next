import { boxesOverlap } from '../model/Library.js';

/**
 * Pure placement logic of the Assembly Builder's front-elevation ("Tetris") workspace.
 * No DOM, no three.js: unit-testable and shared by pointer drags, keyboard nudges and duplicates.
 *
 * Coordinates: metres; x to the right, y up (floor of the current structure at 0 — pieces may be
 * dropped below it: the structure is re-based after the drop), z from the front (depth).
 */

/** Physical box of a candidate rectangle, respecting the assembly's depth alignment. */
export function candidateBox(x, y, size, alignment, maxD, dz = 0) {
  const z0 = alignment === 'back' ? Math.max(maxD, size.d) - size.d - dz : dz;
  return { x0: x, x1: x + size.w, y0: y, y1: y + size.h, z0, z1: z0 + size.d };
}

export function collisions(box, boxes, ignoreId = null) {
  return boxes.filter((b) => b.id !== ignoreId && boxesOverlap(box, b));
}

/** Outside the optional physical boundary (limit {w,h} measured from the structure's origin)? */
export function outOfLimit(box, limit, extent) {
  if (!limit) return false;
  const x0 = Math.min(extent.x0, box.x0), x1 = Math.max(extent.x1, box.x1), y1 = Math.max(extent.y1, box.y1), y0 = Math.min(0, box.y0);
  return x1 - x0 > limit.w + 1e-6 || y1 - y0 > limit.h + 1e-6;
}

/**
 * Magnetic snapping. Candidate x positions: my left/right edge onto every other piece's left/right edge
 * and centre; y: onto tops/bottoms/centres and the floor line. Snaps within `threshold` (metres); the
 * best combination that does not collide wins — so dropping a piece "next to / above" an occupied
 * spot slides it into the free neighbouring slot, like Tetris. Falls back to the grid.
 */
export function snapPlacement(raw, size, boxes, { grid = 0.01, threshold = 0.05, alignment = 'front', maxD = 0.5, ignoreId = null, dz = 0, limit = null } = {}) {
  const others = boxes.filter((b) => b.id !== ignoreId);
  const gx = Math.round(raw.x / grid) * grid, gy = Math.round(raw.y / grid) * grid;
  const xs = [{ v: gx, d: Math.abs(gx - raw.x) + threshold * 0.999, g: null }];
  const ys = [{ v: gy, d: Math.abs(gy - raw.y) + threshold * 0.999, g: null }];
  const addX = (v, g) => { const d = Math.abs(v - raw.x); if (d <= threshold) xs.push({ v, d, g }); };
  const addY = (v, g) => { const d = Math.abs(v - raw.y); if (d <= threshold) ys.push({ v, d, g }); };
  addY(0, { axis: 'y', v: 0, floor: true });
  for (const o of others) {
    const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
    addX(o.x1, { axis: 'x', v: o.x1, o }); addX(o.x0 - size.w, { axis: 'x', v: o.x0, o });
    addX(o.x0, { axis: 'x', v: o.x0, o }); addX(o.x1 - size.w, { axis: 'x', v: o.x1, o });
    addX(cx - size.w / 2, { axis: 'x', v: cx, o, center: true });
    addY(o.y1, { axis: 'y', v: o.y1, o }); addY(o.y0 - size.h, { axis: 'y', v: o.y0, o });
    addY(o.y0, { axis: 'y', v: o.y0, o }); addY(o.y1 - size.h, { axis: 'y', v: o.y1, o });
    addY(cy - size.h / 2, { axis: 'y', v: cy, o, center: true });
  }
  xs.sort((a, b) => a.d - b.d); ys.sort((a, b) => a.d - b.d);
  const extent = boxesExtent(others);
  const combos = [];
  for (const x of xs.slice(0, 10)) for (const y of ys.slice(0, 10)) combos.push({ x, y, d: x.d + y.d });
  combos.sort((a, b) => a.d - b.d);
  let best = null;
  for (const c of combos) {
    const box = candidateBox(round(c.x.v), round(c.y.v), size, alignment, maxD, dz);
    const hit = collisions(box, others);
    const over = outOfLimit(box, limit, extent);
    const cand = { x: box.x0, y: box.y0, box, collisions: hit, outOfLimit: over, guides: [c.x.g, c.y.g].filter(Boolean), valid: !hit.length && !over };
    if (!best) best = cand;
    if (cand.valid) return cand;
  }
  return best;
}

export function boxesExtent(boxes) {
  if (!boxes.length) return { x0: 0, x1: 0, y0: 0, y1: 0 };
  return { x0: Math.min(...boxes.map((b) => b.x0)), x1: Math.max(...boxes.map((b) => b.x1)), y0: Math.min(...boxes.map((b) => b.y0)), y1: Math.max(...boxes.map((b) => b.y1)) };
}

/** First free slot for a duplicate: right, above, left, below of the source, then scanning right. */
export function freeSlotNear(src, size, boxes, opts = {}) {
  const tries = [[src.x1, src.y0], [src.x0, src.y1], [src.x0 - size.w, src.y0], [src.x0, src.y0 - size.h]];
  for (const [x, y] of tries) {
    const b = candidateBox(round(x), round(y), size, opts.alignment, opts.maxD);
    if (!collisions(b, boxes).length && !outOfLimit(b, opts.limit, boxesExtent(boxes))) return { x: b.x0, y: b.y0 };
  }
  const ext = boxesExtent(boxes);
  for (let x = ext.x1; x < ext.x1 + 20; x += 0.05) { const b = candidateBox(round(x), 0, size, opts.alignment, opts.maxD); if (!collisions(b, boxes).length) return { x: b.x0, y: 0 }; }
  return null;
}

const round = (v) => Math.round(v * 10000) / 10000;
