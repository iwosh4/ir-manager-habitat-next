import { PaintBuilder } from '../planner/PaintBuilder.js';
import { buildEnclosureInto, buildModuleInto } from '../enclosures/EnclosureGeometry.js';
import { enclosureGeoKey } from '../planner/PlannerView.js';
import { assemblyLayout, buildFrameInto, buildReservedInto, assemblyFloorShadow } from '../assembly/AssemblyLayout.js';
import { assemblyHash, templateHash } from '../model/Library.js';

/**
 * Cached-geometry "parts" for the preview stage. Keys are the same as the room views use, so a
 * template edited in the designer and shown in the room shares one generated geometry set.
 */
export function templateParts(mats, t, state = { occupied: true, lighting: true }, { shadow = true } = {}) {
  const key = shadow ? `ce|${enclosureGeoKey(t, state)}` : enclosureGeoKey(t, state); // same keys as PlannerView
  return [{ key, name: t.name, make: () => { const b = new PaintBuilder(mats); buildEnclosureInto(b, t, { ...state, shadow }); return b; } }];
}
export function templateSize(t) { return { w: t.dimensions.width, h: t.dimensions.height + t.bottom.base, d: t.dimensions.depth }; }

export function moduleParts(mats, mod) {
  return [{ key: `mod|${JSON.stringify(mod)}`, name: mod.type, make: () => { const b = new PaintBuilder(mats); buildModuleInto(b, mod); return b; } }];
}

/** Whole assembly (frame + members + reserved) with the member transforms of the room view. */
export function assemblyParts(mats, a, lib, { instanceState } = {}) {
  const L = assemblyLayout(a, lib);
  const hash = assemblyHash(a, lib);
  const parts = [{ key: `asmframe|${hash}`, name: 'frame', make: () => { const b = new PaintBuilder(mats); assemblyFloorShadow(b, L); buildFrameInto(b, a, L); return b; } }];
  for (const p of L.parts) {
    const pos = [p.local.x, p.local.y, p.local.z];
    if (p.kind === 'reserved') parts.push({ key: `res|${p.size.w}|${p.size.h}|${p.size.d}`, position: pos, userData: { memberId: p.id }, make: () => { const b = new PaintBuilder(mats); buildReservedInto(b, p.size); return b; } });
    else if (p.kind === 'module') parts.push({ ...moduleParts(mats, p.member.module)[0], position: pos, userData: { memberId: p.id } });
    else {
      const t = lib.templates.get(p.member.enclosureId); if (!t) continue;
      const st = instanceState?.(p.member) || { occupied: true, lighting: true };
      parts.push({ key: enclosureGeoKey(t, st), position: pos, userData: { memberId: p.id }, make: () => { const b = new PaintBuilder(mats); buildEnclosureInto(b, t, { ...st, shadow: false }); return b; } });
    }
  }
  return { parts, size: { w: L.W || 0.5, h: L.H || 0.5, d: L.D || 0.5 }, layout: L };
}

export { templateHash, assemblyHash };
