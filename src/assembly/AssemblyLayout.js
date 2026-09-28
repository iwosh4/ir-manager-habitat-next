import { PaintBuilder } from '../planner/PaintBuilder.js';
import { TILE_CLAMP } from '../planner/PaintedMaterials.js';
import { rbox, flat } from '../planner/geometry.js';
import { TINT, box, contactShadow, rackRail } from '../planner/components.js';
import { assemblyBoxes, assemblyStats } from '../model/Library.js';

/**
 * Assembly → local 3D layout (shared by the room view, the builder preview and tests).
 *
 * Local frame of a placed assembly = the room object's frame: origin at the footprint centre on the
 * floor, front = +Z. Every member keeps its own transform (and its own logical id); the visual layer
 * only instances cached template geometry at those transforms.
 */
export function assemblyLayout(a, lib) {
  const st = assemblyStats(a, lib);
  const f = a.frame.mode === 'none' ? 0 : a.frame.profile;
  const W = st.width, D = st.depth;
  const parts = assemblyBoxes(a, lib).map((q) => ({
    ...q,
    // centre of the part's bottom face in assembly-local coordinates
    local: { x: q.x0 - st.x0 + f - W / 2 + q.size.w / 2, y: q.y0, z: D / 2 - q.z0 - q.size.d / 2 },
  }));
  return { stats: st, W, D, H: st.height, frame: f, parts };
}

/**
 * Structural frame: uprights at the outer ends (front + back), continuous shelf rails under every
 * run of members that share a level (adjacent spans merged → few pieces), top rails, levelling feet.
 * All in ONE geometry set per assembly (cached by the assembly hash).
 */
export function buildFrameInto(b, a, layout) {
  const { W, D, H, frame: f, parts } = layout;
  if (!f) return;
  const col = a.frame.color === 'alu' ? [0.78, 0.78, 0.8] : a.frame.color === 'black' ? TINT.frame : TINT.graphite;
  const tile = a.frame.color === 'alu' ? 'alu' : 'metal_dark';
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) rackRail(b, H, [sx * (W / 2 - f / 2), 0, sz * (D / 2 - f / 2)], { s: f, color: col });
  if (a.frame.shelves) {
    // merge contiguous bottoms per level into long rails
    const levels = new Map();
    for (const p of parts) {
      if (p.kind === 'reserved' || p.y0 < 0.001) continue;
      const k = p.y0.toFixed(3);
      if (!levels.has(k)) levels.set(k, []);
      levels.get(k).push([p.local.x - p.size.w / 2, p.local.x + p.size.w / 2]);
    }
    for (const [k, spans] of levels) {
      spans.sort((x, y) => x[0] - y[0]);
      const merged = [];
      for (const s of spans) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1] + 0.02) last[1] = Math.max(last[1], s[1]); else merged.push([...s]); }
      const y = +k;
      for (const [x0, x1] of merged) {
        const x0e = Math.max(-W / 2 + f, x0), x1e = Math.min(W / 2 - f, x1), len = x1e - x0e; if (len < 0.02) continue;
        for (const sz of [-1, 1]) box(b, len, Math.min(0.03, f), f * 0.6, tile, [(x0e + x1e) / 2, y - Math.min(0.03, f) / 2, sz * (D / 2 - f * 0.3)], { color: col, r: 0.003, grad: [0.75, 1.1] });
        b.add(rbox(len, 0.003, 0.002), 'amber', { pos: [(x0e + x1e) / 2, y - Math.min(0.03, f) / 2, D / 2 + 0.0005], glow: 0.3 }); // identification stripe
      }
    }
  }
  if (a.frame.topRail) for (const sz of [-1, 1]) box(b, W - 2 * f, f, f * 0.6, tile, [0, H - f / 2, sz * (D / 2 - f * 0.3)], { color: col, r: 0.003 });
  if (a.frame.feet) for (const sx of [-1, 1]) box(b, f * 0.8, 0.012, D - f, tile, [sx * (W / 2 - f / 2), 0.006, 0], { color: col.map((c) => c * 0.8) });
}

/** Reserved space: a subtle construction placeholder (thin amber-grey outline + faint floor tint). */
export function buildReservedInto(b, size) {
  const { w, h, d } = size, t = 0.004;
  const c = [0.55, 0.5, 0.42];
  const edges = [
    [w, t, t, 0, 0, d / 2], [w, t, t, 0, h, d / 2], [w, t, t, 0, 0, -d / 2], [w, t, t, 0, h, -d / 2],
    [t, h, t, -w / 2, h / 2, d / 2], [t, h, t, w / 2, h / 2, d / 2], [t, h, t, -w / 2, h / 2, -d / 2], [t, h, t, w / 2, h / 2, -d / 2],
    [t, t, d, -w / 2, 0, 0], [t, t, d, w / 2, 0, 0], [t, t, d, -w / 2, h, 0], [t, t, d, w / 2, h, 0],
  ];
  for (const [ew, eh, ed, x, y, z] of edges) b.add(rbox(ew, eh, ed), 'metal_dark', { pos: [x, y, z], color: c.map((v) => v * 3) });
  b.add(flat(w - 0.01, d - 0.01), 'shadow', { bucket: 'decal', mode: TILE_CLAMP, uv: 'keep', pos: [0, 0.003, 0], alpha: 0.25 });
  b.add(rbox(w - 0.02, h - 0.02, 0.002), 'glass', { bucket: 'glass', mode: TILE_CLAMP, uv: 'keep', pos: [0, h / 2, d / 2], color: [1.0, 0.8, 0.5], alpha: 0.25 });
}

export function assemblyFloorShadow(b, layout) { contactShadow(b, layout.W, layout.D, { spread: 0.12 }); }

export { PaintBuilder };
