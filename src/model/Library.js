import { newId } from './RoomDocument.js';

/**
 * Project library: user-designed ENCLOSURE TEMPLATES, physical ENCLOSURE INSTANCES and ASSEMBLIES.
 * Pure data (no three.js). Everything is stored in the room document (schema v2) so it travels with
 * export / import and autosave. Units: metres (UI shows cm). See DATA_MODEL.md.
 *
 *   EnclosureTemplate  construction definition ("Dendrobates 50×50×70")         doc.enclosures[]
 *   EnclosureInstance  one physical enclosure built from a template ("D03")     doc.instances[]
 *   Assembly           physical structure: members → instances + modules       doc.assemblies[]
 *   Room object        { type: 'assembly', ref: { assemblyId } }                 doc.objects[]
 *                      { type: 'custom_enclosure', ref: { instanceId } }
 */

const clone = (o) => JSON.parse(JSON.stringify(o));
const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
const str = (v, d = '', max = 120) => (typeof v === 'string' ? v.slice(0, max) : d);
const r4 = (v) => Math.round(v * 10000) / 10000;

// ------------------------------------------------------------------------------------ vocabularies
export const CONSTRUCTIONS = {
  glass: { label: 'Glass terrarium', frame: 'profile', frameColor: 'black', panels: { left: 'glass', right: 'glass', rear: 'glass' }, top: 'mesh', front: 'sliding' },
  pvc: { label: 'PVC enclosure', frame: 'box', frameColor: 'white', panels: { left: 'pvc', right: 'pvc', rear: 'pvc' }, top: 'solid', front: 'sliding' },
  wood: { label: 'Wood / board', frame: 'box', frameColor: 'wood', panels: { left: 'wood', right: 'wood', rear: 'wood' }, top: 'solid', front: 'sliding' },
  rack: { label: 'Rack box / tub', frame: 'box', frameColor: 'black', panels: { left: 'pvc', right: 'pvc', rear: 'pvc' }, top: 'solid', front: 'tub' },
  mesh: { label: 'Mesh enclosure', frame: 'profile', frameColor: 'alu', panels: { left: 'mesh', right: 'mesh', rear: 'mesh' }, top: 'mesh', front: 'mesh' },
  custom: { label: 'Mixed / custom', frame: 'profile', frameColor: 'black', panels: { left: 'glass', right: 'pvc', rear: 'wood' }, top: 'mesh', front: 'hinged-double' },
};
export const PANEL_TYPES = ['glass', 'pvc', 'wood', 'mesh', 'open'];
export const TOP_TYPES = ['mesh', 'glass', 'solid', 'open'];
export const FRAME_STYLES = ['profile', 'box'];
export const FRAME_COLORS = ['black', 'alu', 'white', 'wood', 'graphite'];
export const FRONT_TYPES = { sliding: 'Sliding glass doors', fixed: 'Fixed glass front', 'hinged-single': 'Single hinged door', 'hinged-double': 'Double hinged doors', mesh: 'Mesh door', tub: 'Tub / drawer', open: 'Open / custom' };
export const VENT_SIDES = { top: 'Top', 'front-top': 'Front (top strip)', 'front-bottom': 'Front (bottom strip)', left: 'Left side', right: 'Right side', rear: 'Rear' };
export const BACKGROUNDS = { none: 'None', sandstone: 'Sandstone relief', cork: 'Cork', basalt: 'Dark rock', foam: 'Plain foam' };
export const INTERIOR_PRESETS = { none: 'Empty (paper & hide)', arid: 'Arid', tropical: 'Tropical', paludarium: 'Paludarium', custom: 'Custom (items only)' };
export const SUBSTRATES = { sand: 'Sand', soil: 'Bioactive soil', gravel: 'Gravel', paper: 'Paper', none: 'None' };
export const INTERIOR_ITEMS = {
  cork: 'Cork tube', branch: 'Branch', rock: 'Rock', hide: 'Hide', bowl: 'Water bowl',
  bromeliad: 'Bromeliad', fern: 'Fern', grass: 'Grass tuft', succulent: 'Succulent', moss: 'Moss cushion',
};
export const TECH_KINDS = {
  led: { label: 'LED / light strip', mount: 'ceiling', lamp: true },
  uvb: { label: 'UVB fixture', mount: 'ceiling', lamp: true },
  basking: { label: 'Basking lamp', mount: 'ceiling', lamp: true },
  heat_panel: { label: 'Heat panel', mount: 'ceiling' },
  heat_cable: { label: 'Heat cable', mount: 'floor' },
  mist: { label: 'Misting nozzle', mount: 'ceiling' },
  fan: { label: 'Fan', mount: 'rear' },
  temp_sensor: { label: 'Temperature sensor', mount: 'rear' },
  humidity_sensor: { label: 'Humidity sensor', mount: 'rear' },
  probe: { label: 'Thermostat probe', mount: 'rear' },
  cable_entry: { label: 'Cable / service entry', mount: 'rear' },
};
export const MODULE_TYPES = {
  cabinet: { label: 'Cabinet', size: { w: 0.9, h: 0.8, d: 0.5 } },
  shelf: { label: 'Shelf', size: { w: 0.9, h: 0.04, d: 0.5 } },
  technical: { label: 'Technical compartment', size: { w: 0.6, h: 0.6, d: 0.5 } },
};
/** Default reserved space (semantic w / h / d, metres). */
export const RESERVED_DEFAULT = { w: 0.6, h: 0.5, d: 0.5 };
export const TEMPLATE_CATEGORY = (t) => (t?.construction?.type === 'rack' ? 'rack box' : 'enclosure');

// ------------------------------------------------------------------------------------ templates
export function defaultTemplate(patch = {}) {
  const type = patch.construction?.type || patch.type || 'glass';
  const c = CONSTRUCTIONS[type] || CONSTRUCTIONS.glass;
  return normalizeTemplate({
    id: newId('enc'), name: 'New enclosure', type,
    dimensions: { width: 0.6, height: 0.6, depth: 0.45 },
    construction: { type, frame: { style: c.frame, color: c.frameColor, profile: 0.018 }, panels: { ...c.panels } },
    front: { type: c.front, lock: true },
    ventilation: type === 'glass' ? [{ id: 'v1', side: 'front-top', coverage: 0.9 }] : [{ id: 'v1', side: 'left', coverage: 0.5 }, { id: 'v2', side: 'right', coverage: 0.5 }],
    top: { type: c.top },
    bottom: { type: 'solid', base: 0 },
    background: { type: type === 'glass' ? 'cork' : 'none' },
    interior: { preset: type === 'rack' ? 'none' : 'tropical', substrate: { type: type === 'rack' ? 'paper' : 'soil', depth: 0.05 }, water: { enabled: false, fraction: 0.45, level: 0.3 }, items: [] },
    technology: type === 'rack' ? [{ id: 'heat', kind: 'heat_cable', x: 0.5, y: 0, z: 0.7 }] : [{ id: 'light', kind: 'led', x: 0.5, y: 1, z: 0.35 }, { id: 'tsens', kind: 'temp_sensor', x: 0.85, y: 0.6, z: 0 }],
    visualStyle: { accent: 'amber' },
    metadata: { code: '', source: 'custom' },
    ...patch,
  });
}

let itemSeq = 0;
export const itemId = (p = 'it') => `${p}${Date.now().toString(36).slice(-4)}${(++itemSeq).toString(36)}`;

export function normalizeTemplate(t) {
  t = t || {};
  const type = pick(t.construction?.type || t.type, Object.keys(CONSTRUCTIONS), 'glass');
  const c = CONSTRUCTIONS[type];
  const d = t.dimensions || {};
  const panels = t.construction?.panels || c.panels;
  const out = {
    id: str(t.id) || newId('enc'),
    name: str(t.name, 'Enclosure') || 'Enclosure',
    type,
    dimensions: { width: r4(num(d.width, 0.6, 0.15, 3)), height: r4(num(d.height, 0.6, 0.08, 2.5)), depth: r4(num(d.depth, 0.45, 0.1, 1.5)) },
    construction: {
      type,
      frame: { style: pick(t.construction?.frame?.style, FRAME_STYLES, c.frame), color: pick(t.construction?.frame?.color, FRAME_COLORS, c.frameColor), profile: num(t.construction?.frame?.profile, 0.018, 0.008, 0.05) },
      panels: { left: pick(panels.left, PANEL_TYPES, c.panels.left), right: pick(panels.right, PANEL_TYPES, c.panels.right), rear: pick(panels.rear, PANEL_TYPES, c.panels.rear) },
    },
    front: { type: pick(t.front?.type, Object.keys(FRONT_TYPES), c.front), lock: t.front?.lock !== false },
    ventilation: (Array.isArray(t.ventilation) ? t.ventilation : []).filter((v) => v && VENT_SIDES[v.side]).slice(0, 12)
      .map((v) => ({ id: str(v.id) || itemId('v'), side: v.side, coverage: num(v.coverage, 0.8, 0.1, 1) })),
    top: { type: pick(t.top?.type, TOP_TYPES, c.top) },
    bottom: { type: 'solid', base: num(t.bottom?.base, 0, 0, 1.2) },
    background: { type: pick(t.background?.type, Object.keys(BACKGROUNDS), 'none') },
    interior: {
      preset: pick(t.interior?.preset, Object.keys(INTERIOR_PRESETS), 'none'),
      substrate: { type: pick(t.interior?.substrate?.type, Object.keys(SUBSTRATES), 'soil'), depth: num(t.interior?.substrate?.depth, 0.05, 0, 0.3) },
      water: { enabled: !!t.interior?.water?.enabled, fraction: num(t.interior?.water?.fraction, 0.45, 0.1, 0.9), level: num(t.interior?.water?.level, 0.3, 0.05, 0.8) },
      items: (Array.isArray(t.interior?.items) ? t.interior.items : []).filter((i) => i && INTERIOR_ITEMS[i.kind]).slice(0, 60)
        .map((i) => ({ id: str(i.id) || itemId('i'), kind: i.kind, x: num(i.x, 0.5, 0, 1), z: num(i.z, 0.5, 0, 1), s: num(i.s, 1, 0.3, 3), r: num(i.r, 0, -7, 7) })),
    },
    technology: (Array.isArray(t.technology) ? t.technology : []).filter((i) => i && TECH_KINDS[i.kind]).slice(0, 40)
      .map((i) => ({ id: str(i.id) || itemId('t'), kind: i.kind, label: str(i.label, ''), x: num(i.x, 0.5, 0, 1), y: num(i.y, 1, 0, 1), z: num(i.z, 0.5, 0, 1) })),
    visualStyle: { accent: str(t.visualStyle?.accent, 'amber') },
    metadata: { code: str(t.metadata?.code, '', 12), source: str(t.metadata?.source, 'custom'), created: str(t.metadata?.created) || new Date().toISOString(), modified: str(t.metadata?.modified) || new Date().toISOString(), notes: str(t.metadata?.notes, '', 500) },
  };
  // technology slot ids are stable keys inside a template: keep them unique
  const seen = new Set();
  for (const i of out.technology) { if (seen.has(i.id)) i.id = itemId('t'); seen.add(i.id); }
  return out;
}

/** Short instance code prefix, e.g. "TERRA 60" → "T60", "Dendrobates 50×50×70" → "D50". */
export function codePrefix(t) {
  if (t.metadata?.code) return t.metadata.code;
  const words = t.name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  const letters = words.filter((w) => /^\p{L}/u.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 2) || 'E';
  const n = words.find((w) => /^\d+$/.test(w)) || '';
  return (letters + n).slice(0, 6);
}

/** Stable identity of a template's *geometry* (anything that changes the visual). */
export function templateHash(t) {
  const s = JSON.stringify([t.dimensions, t.construction, t.front, t.ventilation, t.top, t.bottom, t.background, t.interior, t.technology]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// ------------------------------------------------------------------------------------ instances
/**
 * A physical enclosure. Its technology devices get stable ids (instanceId + template slot id) that
 * IR Manager / Home Assistant can later bind real entities to.
 */
export function createInstance(template, doc, patch = {}) {
  const id = patch.id || newId('inst');
  const prefix = codePrefix(template);
  const used = new Set((doc.instances || []).map((i) => i.code));
  let n = 1; while (used.has(`${prefix}-${String(n).padStart(2, '0')}`)) n++;
  return normalizeInstance({
    id, templateId: template.id, code: `${prefix}-${String(n).padStart(2, '0')}`,
    props: { occupied: template.interior.preset !== 'none', lighting: true, animal: { species: '', code: '' }, notes: '' },
    devices: {},
    ...patch,
  }, template);
}

export function normalizeInstance(i, template = null) {
  const out = {
    id: str(i.id) || newId('inst'),
    templateId: str(i.templateId),
    code: str(i.code, '', 24),
    props: {
      occupied: i.props?.occupied !== false, lighting: i.props?.lighting !== false,
      animal: { species: str(i.props?.animal?.species, '', 80), code: str(i.props?.animal?.code, '', 24) },
      notes: str(i.props?.notes, '', 1000),
    },
    devices: {},
    metadata: { created: str(i.metadata?.created) || new Date().toISOString(), externalId: i.metadata?.externalId ?? null },
  };
  // device map: template slot id → { deviceId (stable), entity (future binding) }
  for (const [slot, dv] of Object.entries(i.devices || {})) out.devices[slot] = { deviceId: str(dv?.deviceId) || `${out.id}:${slot}`, entity: dv?.entity ?? null };
  if (template) for (const tech of template.technology) if (!out.devices[tech.id]) out.devices[tech.id] = { deviceId: `${out.id}:${tech.id}`, entity: null };
  return out;
}

// ------------------------------------------------------------------------------------ assemblies
export function createAssembly(patch = {}) {
  return normalizeAssembly({ id: newId('asm'), name: 'New assembly', members: [], reserved: [], frame: { mode: 'none' }, alignment: 'front', ...patch });
}

/**
 * Member: { id, kind: 'enclosure'|'module', instanceId?, enclosureId?, module?: {type,w,h,d}, position: {x,y,z}, rotation }
 *  position = lower-left-front corner in the assembly's front elevation (x right, y up, z back), metres.
 * Reserved: { id, label, size: {w,h,d}, position }
 */
export function normalizeAssembly(a) {
  const members = (Array.isArray(a.members) ? a.members : []).map((m) => ({
    id: str(m.id) || itemId('m'),
    kind: pick(m.kind, ['enclosure', 'module'], 'enclosure'),
    instanceId: m.kind === 'module' ? null : str(m.instanceId) || null,
    enclosureId: m.kind === 'module' ? null : str(m.enclosureId) || null,
    module: m.kind === 'module' ? { type: pick(m.module?.type, Object.keys(MODULE_TYPES), 'cabinet'), w: num(m.module?.w, 0.9, 0.1, 4), h: num(m.module?.h, 0.8, 0.02, 3), d: num(m.module?.d, 0.5, 0.1, 1.5), doors: num(m.module?.doors, 2, 0, 6) } : null,
    position: { x: r4(num(m.position?.x, 0)), y: r4(num(m.position?.y, 0, 0)), z: r4(num(m.position?.z, 0, 0, 2)) },
    rotation: 0,
  }));
  const reserved = (Array.isArray(a.reserved) ? a.reserved : []).map((r) => ({
    id: str(r.id) || itemId('r'), label: str(r.label, 'Reserved', 40),
    size: { w: num(r.size?.w, 0.6, 0.05, 4), h: num(r.size?.h, 0.5, 0.05, 3), d: num(r.size?.d, 0.5, 0.05, 1.5) },
    position: { x: r4(num(r.position?.x, 0)), y: r4(num(r.position?.y, 0, 0)), z: r4(num(r.position?.z, 0, 0, 2)) },
  }));
  const f = a.frame || {};
  return {
    id: str(a.id) || newId('asm'),
    name: str(a.name, 'Assembly') || 'Assembly',
    members, reserved,
    frame: { mode: pick(f.mode, ['none', 'auto', 'custom'], 'none'), profile: num(f.profile, 0.03, 0.015, 0.08), color: pick(f.color, FRAME_COLORS, 'graphite'), shelves: f.shelves !== false, feet: f.feet !== false, topRail: f.topRail !== false },
    alignment: pick(a.alignment, ['front', 'back'], 'front'),
    limit: a.limit && Number.isFinite(+a.limit.w) ? { w: num(a.limit.w, 3, 0.2, 30), h: num(a.limit.h, 2.4, 0.2, 6) } : null,
    metadata: { created: str(a.metadata?.created) || new Date().toISOString(), modified: str(a.metadata?.modified) || new Date().toISOString(), notes: str(a.metadata?.notes, '', 1000) },
  };
}

/** Physical size of a member (w, h, d) from its template / module definition. */
export function memberSize(m, lib) {
  if (m.kind === 'module') return { w: m.module.w, h: m.module.h, d: m.module.d };
  const t = lib.templates.get(m.enclosureId);
  return t ? { w: t.dimensions.width, h: t.dimensions.height, d: t.dimensions.depth } : { w: 0.3, h: 0.3, d: 0.3 };
}

/** Axis-aligned boxes of all parts (members + reserved) in assembly space; z measured from the front. */
export function assemblyBoxes(a, lib) {
  const maxD = assemblyMaxDepth(a, lib);
  const boxes = [];
  const place = (id, kind, size, p, extra = {}) => {
    const z0 = a.alignment === 'back' ? maxD - size.d - p.z : p.z;
    boxes.push({ id, kind, x0: p.x, x1: p.x + size.w, y0: p.y, y1: p.y + size.h, z0, z1: z0 + size.d, size, ...extra });
  };
  for (const m of a.members) place(m.id, m.kind, memberSize(m, lib), m.position, { member: m });
  for (const r of a.reserved) place(r.id, 'reserved', r.size, r.position, { reserved: r });
  return boxes;
}

export function assemblyMaxDepth(a, lib) {
  let d = 0;
  for (const m of a.members) d = Math.max(d, memberSize(m, lib).d + m.position.z);
  for (const r of a.reserved) d = Math.max(d, r.size.d + r.position.z);
  return d || 0.3;
}

/** Overall dimensions + counts (continuously displayed while building, stored on the room object). */
export function assemblyStats(a, lib) {
  const b = assemblyBoxes(a, lib);
  if (!b.length) return { width: 0, height: 0, depth: 0, content: { width: 0, height: 0, depth: 0 }, x0: 0, y0: 0, enclosures: 0, rackBoxes: 0, modules: 0, reserved: 0, members: 0 };
  const x0 = Math.min(...b.map((q) => q.x0)), x1 = Math.max(...b.map((q) => q.x1)), y1 = Math.max(...b.map((q) => q.y1));
  const frame = a.frame.mode === 'none' ? 0 : a.frame.profile;
  let enclosures = 0, rackBoxes = 0;
  for (const m of a.members) if (m.kind === 'enclosure') { if (TEMPLATE_CATEGORY(lib.templates.get(m.enclosureId)) === 'rack box') rackBoxes++; else enclosures++; }
  // outer dimensions include the structural frame (uprights left/right, top rail); `content` = the pieces only
  const depth = r4(assemblyMaxDepth(a, lib));
  return {
    width: r4(x1 - x0 + 2 * frame), height: r4(y1 + (frame && a.frame.topRail ? frame : 0)), depth, x0,
    content: { width: r4(x1 - x0), height: r4(y1), depth },
    enclosures, rackBoxes, modules: a.members.filter((m) => m.kind === 'module').length, reserved: a.reserved.length, members: a.members.length,
  };
}

/** Overlap test on physical boxes (touching faces are allowed). */
export function boxesOverlap(a, b, eps = 0.0005) {
  return a.x0 < b.x1 - eps && a.x1 > b.x0 + eps && a.y0 < b.y1 - eps && a.y1 > b.y0 + eps && a.z0 < b.z1 - eps && a.z1 > b.z0 + eps;
}

/** Shift so the structure starts at x = 0 and stands on y = 0 (keeps relative layout). */
export function normalizeOrigin(a, lib) {
  const b = assemblyBoxes(a, lib); if (!b.length) return a;
  const x0 = Math.min(...b.map((q) => q.x0)), y0 = Math.min(...b.map((q) => q.y0));
  if (Math.abs(x0) < 1e-6 && Math.abs(y0) < 1e-6) return a;
  for (const m of [...a.members, ...a.reserved]) { m.position.x = r4(m.position.x - x0); m.position.y = r4(m.position.y - y0); }
  return a;
}

export function assemblyHash(a, lib) {
  const parts = a.members.map((m) => (m.kind === 'module' ? JSON.stringify(m.module) : templateHash(lib.templates.get(m.enclosureId) || {})) + JSON.stringify(m.position));
  const s = JSON.stringify([parts, a.reserved, a.frame, a.alignment]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Index helper over a document: { templates: Map, instances: Map, assemblies: Map }. */
export function libraryIndex(doc) {
  return {
    templates: new Map((doc.enclosures || []).map((t) => [t.id, t])),
    instances: new Map((doc.instances || []).map((i) => [i.id, i])),
    assemblies: new Map((doc.assemblies || []).map((a) => [a.id, a])),
  };
}

// ------------------------------------------------------------------------------------ starting templates
/** Catalogue types that can seed a custom enclosure ("CREATE FROM TEMPLATE"). */
export function templateFromCatalogue(type) {
  const P = {
    terrarium_arid: { name: 'Glass terrarium 100', type: 'glass', dimensions: { width: 1.0, height: 0.5, depth: 0.5 }, front: { type: 'sliding' }, background: { type: 'sandstone' }, interior: { preset: 'arid', substrate: { type: 'sand' } }, technology: [{ id: 'light', kind: 'led', x: 0.5, y: 1, z: 0.35 }, { id: 'bask', kind: 'basking', x: 0.22, y: 1, z: 0.45 }, { id: 'tsens', kind: 'temp_sensor', x: 0.9, y: 0.6, z: 0 }] },
    terrarium_tropical: { name: 'Tropical 60', type: 'glass', dimensions: { width: 0.6, height: 0.9, depth: 0.45 }, front: { type: 'hinged-double' }, background: { type: 'cork' }, interior: { preset: 'tropical', substrate: { type: 'soil' } }, technology: [{ id: 'light', kind: 'led', x: 0.5, y: 1, z: 0.35 }, { id: 'mist', kind: 'mist', x: 0.85, y: 1, z: 0.2 }, { id: 'hsens', kind: 'humidity_sensor', x: 0.9, y: 0.7, z: 0 }] },
    paludarium: { name: 'Paludarium 120', type: 'glass', dimensions: { width: 1.2, height: 0.6, depth: 0.5 }, bottom: { base: 0.8 }, front: { type: 'fixed' }, top: { type: 'glass' }, background: { type: 'basalt' }, interior: { preset: 'paludarium', substrate: { type: 'soil' } }, technology: [{ id: 'light', kind: 'led', x: 0.5, y: 1, z: 0.35 }] },
    quarantine: { name: 'Quarantine 90', type: 'pvc', dimensions: { width: 0.9, height: 0.6, depth: 0.5 }, front: { type: 'sliding' }, interior: { preset: 'none', substrate: { type: 'paper' } }, technology: [{ id: 'light', kind: 'led', x: 0.5, y: 1, z: 0.35 }, { id: 'tsens', kind: 'temp_sensor', x: 0.9, y: 0.6, z: 0 }] },
    rack_tubs: { name: 'Rack box 60', type: 'rack', dimensions: { width: 0.58, height: 0.22, depth: 0.6 }, front: { type: 'tub' }, interior: { preset: 'none', substrate: { type: 'paper' } }, technology: [{ id: 'heat', kind: 'heat_cable', x: 0.5, y: 0, z: 0.7 }, { id: 'probe', kind: 'probe', x: 0.8, y: 0.2, z: 0 }] },
    incubator: { name: 'Incubator box', type: 'pvc', dimensions: { width: 0.6, height: 0.6, depth: 0.55 }, front: { type: 'hinged-single' }, interior: { preset: 'none', substrate: { type: 'none' } }, technology: [{ id: 'heat', kind: 'heat_panel', x: 0.5, y: 1, z: 0.5 }, { id: 'tsens', kind: 'temp_sensor', x: 0.9, y: 0.6, z: 0 }, { id: 'fan', kind: 'fan', x: 0.5, y: 0.7, z: 0 }] },
  }[type];
  if (!P) return null;
  return defaultTemplate({ ...P, construction: { type: P.type }, metadata: { source: `catalogue:${type}` } });
}

/** The six-tank enclosure rack as a starting ASSEMBLY (3 levels × 2 glass terrariums + auto frame). */
export function rackAssemblyFromCatalogue() {
  const t = defaultTemplate({ name: 'Rack terrarium 55', type: 'glass', dimensions: { width: 0.55, height: 0.45, depth: 0.45 }, front: { type: 'sliding' }, background: { type: 'sandstone' }, interior: { preset: 'arid', substrate: { type: 'sand' } }, metadata: { source: 'catalogue:rack_glass' } });
  return { template: t, layout: [0, 1, 2].flatMap((row) => [0, 1].map((col) => ({ x: col * 0.585, y: 0.1 + row * 0.64 }))) };
}

export { clone as cloneData };
