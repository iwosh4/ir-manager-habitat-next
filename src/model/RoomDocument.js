import { TYPES, getType } from '../objects/catalog.js';

/**
 * Logical room document — the single source of truth, serialised 1:1 to JSON.
 *
 * Coordinates are *plan coordinates* in metres, measured from the interior north-west corner:
 *   x: 0 … room.width  (west → east)      z: 0 … room.depth (north → south)      y: up
 * rotation is in degrees around the vertical axis; 0 means the object's front faces south (+z).
 * size {w,d,h} is the logical collision / footprint box in metres (independent of the 3D model).
 */
export const SCHEMA = 'ir-manager/habitat-room';
export const VERSION = 1;
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
  return { schema: SCHEMA, version: VERSION, room, objects, meta: { created: new Date().toISOString(), modified: new Date().toISOString(), generator: 'Habitat Studio Next' } };
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
  const doc = createDocument(room, objects);
  doc.meta = { ...doc.meta, ...(json.meta || {}), modified: new Date().toISOString() };
  if (unknown.length) doc.meta.skippedTypes = unknown;
  return doc;
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
