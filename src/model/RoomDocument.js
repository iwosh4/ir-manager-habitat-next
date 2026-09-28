import { TYPES, getType } from '../objects/catalog.js';
import { normalizeTemplate, normalizeInstance, normalizeAssembly, libraryIndex, assemblyStats } from './Library.js';

/**
 * Logical room document — the single source of truth, serialised 1:1 to JSON.
 *
 * Coordinates are *plan coordinates* in metres, measured from the interior north-west corner:
 *   x: 0 … room.width  (west → east)      z: 0 … room.depth (north → south)      y: up
 * rotation is in degrees around the vertical axis; 0 means the object's front faces south (+z).
 * size {w,d,h} is the logical collision / footprint box in metres (independent of the 3D model).
 *
 * Version 2 adds the project library (see Library.js / DATA_MODEL.md): enclosures (templates),
 * instances (physical enclosures) and assemblies. Room objects of type 'custom_enclosure' / 'assembly'
 * reference them through `ref`. Version 1 files load unchanged (empty library).
 */
export const SCHEMA = 'ir-manager/habitat-room';
export const VERSION = 2;
export const WALLS = ['north', 'east', 'south', 'west'];

let seq = 0;
export function newId(prefix = 'obj') {
  seq = (seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${seq.toString(36)}`;
}

export function defaultRoom() {
  return {
    id: newId('room'), name: 'Reptile room A', width: 5.0, depth: 4.0, height: 2.7, wallThickness: 0.14,
    finishes: { floor: 'concrete_polished', walls: 'warm_grey', accentWall: 'north' },
  };
}

export function createDocument(room = defaultRoom(), objects = []) {
  return { schema: SCHEMA, version: VERSION, room, objects, enclosures: [], instances: [], assemblies: [], meta: { created: new Date().toISOString(), modified: new Date().toISOString(), generator: 'Habitat Studio Next' } };
}

const num = (v, d, lo = -Infinity, hi = Infinity) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const deepClone = (o) => JSON.parse(JSON.stringify(o));

/** Create a new logical object of a catalogue type with sensible defaults. */
export function createObject(type, patch = {}) {
  const t = getType(type);
  if (!t) throw new Error(`Unknown object type "${type}"`);
  return normalizeObject({
    id: newId(), type, name: t.label, position: { x: 1, z: 1 }, elevation: t.elevation || (t.opening ? t.opening.sill : 0), rotation: 0,
    size: { ...t.size }, mount: null, props: deepClone(t.props || {}), ...patch,
  });
}

export function normalizeObject(o) {
  const t = getType(o.type);
  const size = o.size || t?.size || { w: 0.5, d: 0.5, h: 0.5 };
  const out = {
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    type: String(o.type),
    name: typeof o.name === 'string' ? o.name.slice(0, 120) : (t?.label || o.type),
    position: { x: num(o.position?.x, 0), z: num(o.position?.z, 0) },
    elevation: num(o.elevation, 0, 0, 10),
    rotation: ((num(o.rotation, 0) % 360) + 360) % 360,
    size: { w: num(size.w, 0.5, 0.02, 20), d: num(size.d, 0.5, 0.005, 20), h: num(size.h, 0.5, 0.02, 10) },
    mount: o.mount && WALLS.includes(o.mount.wall) ? { wall: o.mount.wall, offset: num(o.mount.offset, 0, 0, 100) } : null,
    props: o.props && typeof o.props === 'object' ? deepClone(o.props) : {},
  };
  if (o.locked) out.locked = true;
  if (o.ref && typeof o.ref === 'object') {
    const ref = {};
    if (typeof o.ref.assemblyId === 'string') ref.assemblyId = o.ref.assemblyId;
    if (typeof o.ref.instanceId === 'string') ref.instanceId = o.ref.instanceId;
    if (typeof o.ref.templateId === 'string' && !ref.instanceId) ref.templateId = o.ref.templateId; // placement preview only
    if (Object.keys(ref).length) out.ref = ref;
  }
  return out;
}

/** Validate & migrate any incoming JSON (import, autosave). Throws with a readable message. */
export function normalizeDocument(json) {
  if (!json || typeof json !== 'object') throw new Error('File does not contain a JSON object.');
  if (json.schema && json.schema !== SCHEMA) throw new Error(`Unsupported schema "${json.schema}".`);
  if ((json.version || 1) > VERSION) throw new Error(`File version ${json.version} is newer than this editor (${VERSION}).`);
  const r = json.room || {};
  const d = defaultRoom();
  const room = {
    id: typeof r.id === 'string' ? r.id : d.id,
    name: typeof r.name === 'string' ? r.name : d.name,
    width: num(r.width, d.width, 1.5, 30), depth: num(r.depth, d.depth, 1.5, 30), height: num(r.height, d.height, 2.1, 6),
    wallThickness: num(r.wallThickness, d.wallThickness, 0.06, 0.6),
    finishes: { ...d.finishes, ...(r.finishes || {}) },
  };
  const unknown = [];
  const objects = (Array.isArray(json.objects) ? json.objects : []).filter((o) => {
    if (!o || !TYPES[o.type]) { unknown.push(o?.type); return false; }
    return true;
  }).map(normalizeObject);
  const ids = new Set();
  for (const o of objects) { if (ids.has(o.id)) o.id = newId(); ids.add(o.id); }
  // ---- project library (v2)
  const uniq = (arr) => { const seen = new Set(); return arr.filter((x) => { if (seen.has(x.id)) return false; seen.add(x.id); return true; }); };
  const enclosures = uniq((Array.isArray(json.enclosures) ? json.enclosures : []).map(normalizeTemplate));
  const tIndex = new Map(enclosures.map((t) => [t.id, t]));
  const instances = uniq((Array.isArray(json.instances) ? json.instances : []).map((i) => normalizeInstance(i, tIndex.get(i.templateId))).filter((i) => tIndex.has(i.templateId)));
  const iIndex = new Map(instances.map((i) => [i.id, i]));
  const assemblies = uniq((Array.isArray(json.assemblies) ? json.assemblies : []).map(normalizeAssembly));
  for (const a of assemblies) {
    // members must reference an existing instance of an existing template (ids are never rewritten)
    a.members = a.members.filter((m) => m.kind === 'module' || (iIndex.has(m.instanceId) && tIndex.has(m.enclosureId)));
  }
  const aIndex = new Map(assemblies.map((a) => [a.id, a]));
  const dangling = [];
  const placed = objects.filter((o) => {
    if (o.type === 'assembly') { if (!aIndex.has(o.ref?.assemblyId)) { dangling.push(o.id); return false; } }
    if (o.type === 'custom_enclosure') { if (!iIndex.has(o.ref?.instanceId)) { dangling.push(o.id); return false; } }
    return true;
  });
  const doc = createDocument(room, placed);
  doc.enclosures = enclosures; doc.instances = instances; doc.assemblies = assemblies;
  syncReferencedSizes(doc);
  doc.meta = { ...doc.meta, ...(json.meta || {}), modified: new Date().toISOString() };
  if (unknown.length) doc.meta.skippedTypes = unknown;
  if (dangling.length) doc.meta.droppedReferences = dangling;
  return doc;
}

/**
 * Room objects that reference library definitions take their logical size from them (an assembly's
 * footprint is its overall width × max depth × height). Called after every library change.
 * Returns the ids of objects whose size changed.
 */
export function syncReferencedSizes(doc) {
  const lib = libraryIndex(doc), changed = [];
  for (const o of doc.objects) {
    let size = null;
    if (o.type === 'assembly') { const a = lib.assemblies.get(o.ref?.assemblyId); if (a) { const st = assemblyStats(a, lib); size = { w: Math.max(0.1, st.width), h: Math.max(0.05, st.height), d: Math.max(0.1, st.depth) }; } }
    if (o.type === 'custom_enclosure') { const i = lib.instances.get(o.ref?.instanceId), t = i && lib.templates.get(i.templateId); if (t) size = { w: t.dimensions.width, h: t.dimensions.height + t.bottom.base, d: t.dimensions.depth }; }
    if (size && (Math.abs(size.w - o.size.w) > 1e-5 || Math.abs(size.h - o.size.h) > 1e-5 || Math.abs(size.d - o.size.d) > 1e-5)) { o.size = size; changed.push(o.id); }
  }
  return changed;
}

/** Wall geometry helpers in plan space. Each wall runs along its interior face. */
export function wallFrame(room, wall) {
  const W = room.width, D = room.depth;
  switch (wall) {
    // start point, unit direction along the wall, inward normal, length
    case 'north': return { start: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, normal: { x: 0, z: 1 }, length: W, rotation: 0 };
    case 'south': return { start: { x: W, z: D }, dir: { x: -1, z: 0 }, normal: { x: 0, z: -1 }, length: W, rotation: 180 };
    case 'west': return { start: { x: 0, z: D }, dir: { x: 0, z: -1 }, normal: { x: 1, z: 0 }, length: D, rotation: 90 };
    case 'east': return { start: { x: W, z: 0 }, dir: { x: 0, z: 1 }, normal: { x: -1, z: 0 }, length: D, rotation: 270 };
    default: throw new Error('bad wall ' + wall);
  }
}

/**
 * For wall-bound objects (openings & mounted items) derive plan position/rotation from wall + offset.
 * offset is the distance along the wall (from its start) to the object's centre.
 * Openings are centred in the wall thickness, mounted items sit on the interior face.
 */
export function resolveMount(room, obj) {
  if (!obj.mount) return { x: obj.position.x, z: obj.position.z, rotation: obj.rotation };
  const f = wallFrame(room, obj.mount.wall);
  const t = getType(obj.type);
  const along = Math.min(f.length, Math.max(0, obj.mount.offset));
  const inset = t?.placement === 'opening' ? -room.wallThickness / 2 : obj.size.d / 2;
  return {
    x: f.start.x + f.dir.x * along + f.normal.x * inset,
    z: f.start.z + f.dir.z * along + f.normal.z * inset,
    rotation: f.rotation,
  };
}
