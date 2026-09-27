import { Emitter } from '../core/Emitter.js';
import { History } from './History.js';
import { createDocument, createObject, normalizeDocument, normalizeObject, newId, resolveMount, wallFrame } from '../model/RoomDocument.js';
import { getType } from '../objects/catalog.js';
import { Snapper } from './Snapping.js';

/**
 * Editor state: the logical document, the selection and all mutating commands.
 * Every mutation goes through here, is recorded in history and emits `change`.
 * The 3D layer only *observes* this state — it never owns data.
 */
export class Editor extends Emitter {
  constructor() {
    super();
    this.doc = createDocument();
    this.selection = null;           // selected object id | null
    this.history = new History();
    this.snap = { enabled: true, grid: 0.05, angle: 15, walls: true, objects: true };
    this.snapper = new Snapper(this);
    this.history.reset(this.snapshot());
    this._txn = null;
  }

  snapshot() { return JSON.stringify(this.doc); }

  get room() { return this.doc.room; }
  get objects() { return this.doc.objects; }
  get(id) { return this.doc.objects.find((o) => o.id === id) || null; }
  get selected() { return this.selection ? this.get(this.selection) : null; }

  // ---------- document level ----------
  load(json, { resetHistory = true, reason = 'load' } = {}) {
    this.doc = normalizeDocument(json);
    for (const o of this.doc.objects) this._clampObject(o);
    this.selection = null;
    if (resetHistory) this.history.reset(this.snapshot());
    this.emit('change', { kind: 'document', reason });
    this.emit('selection', null);
  }

  toJSON() {
    const out = JSON.parse(this.snapshot());
    out.meta.modified = new Date().toISOString();
    return out;
  }

  // ---------- transactions & history ----------
  begin(label) { if (!this._txn) this._txn = { label }; }
  commit() {
    if (!this._txn) return;
    const label = this._txn.label; this._txn = null;
    if (this.history.push(this.snapshot(), label)) this.emit('history');
  }
  cancel() {
    if (!this._txn) return;
    this._txn = null;
    this._restore(this.history.current);
  }
  _record(label) { if (this._txn) return; if (this.history.push(this.snapshot(), label)) this.emit('history'); }
  _restore(snap) {
    const selected = this.selection;
    this.doc = JSON.parse(snap);
    this.selection = this.get(selected) ? selected : null;
    this.emit('change', { kind: 'document', reason: 'history' });
    this.emit('selection', this.selection);
  }
  undo() { const s = this.history.undo(); if (s) { this._restore(s); this.emit('history'); } }
  redo() { const s = this.history.redo(); if (s) { this._restore(s); this.emit('history'); } }

  // ---------- selection ----------
  select(id) {
    if (id && !this.get(id)) id = null;
    if (this.selection === id) return;
    this.selection = id;
    this.emit('selection', id);
  }

  // ---------- object commands ----------
  add(type, patch = {}) {
    const obj = createObject(type, patch);
    const t = getType(type);
    if ((t.placement === 'opening' || t.placement === 'mounted') && !obj.mount) {
      obj.mount = { wall: 'north', offset: this.room.width / 2 };
    }
    this._clampObject(obj);
    this.doc.objects.push(obj);
    this.emit('change', { kind: 'add', ids: [obj.id] });
    this._record(`Add ${t.label}`);
    this.select(obj.id);
    return obj;
  }

  update(id, patch, { record = true } = {}) {
    const o = this.get(id); if (!o) return null;
    const next = normalizeObject({ ...o, ...patch, position: { ...o.position, ...(patch.position || {}) }, size: { ...o.size, ...(patch.size || {}) }, props: patch.props ? { ...o.props, ...patch.props } : o.props, mount: patch.mount === undefined ? o.mount : patch.mount });
    this._clampObject(next);
    Object.assign(o, next);
    this.emit('change', { kind: 'update', ids: [id] });
    if (record) this._record('Edit');
    return o;
  }

  remove(id) {
    const i = this.doc.objects.findIndex((o) => o.id === id); if (i < 0) return;
    const [o] = this.doc.objects.splice(i, 1);
    if (this.selection === id) { this.selection = null; this.emit('selection', null); }
    this.emit('change', { kind: 'remove', ids: [id] });
    this._record(`Delete ${o.name}`);
  }

  duplicate(id) {
    const o = this.get(id); if (!o) return null;
    const copy = normalizeObject(JSON.parse(JSON.stringify(o)));
    copy.id = newId();
    copy.name = o.name.replace(/( copy( \d+)?)?$/, '') + ' copy';
    if (copy.mount) copy.mount.offset += o.size.w + 0.05;
    else {
      // place next to the original along its local x axis, then let the snapper find a free spot
      const a = (o.rotation * Math.PI) / 180;
      copy.position.x += Math.cos(a) * (o.size.w + 0.05);
      copy.position.z -= Math.sin(a) * (o.size.w + 0.05);
    }
    if (copy.props?.animal?.code) copy.props.animal.code = incrementCode(copy.props.animal.code);
    this._clampObject(copy);
    this.doc.objects.push(copy);
    this.emit('change', { kind: 'add', ids: [copy.id] });
    this._record(`Duplicate ${o.name}`);
    this.select(copy.id);
    return copy;
  }

  rotateBy(id, deg) {
    const o = this.get(id); if (!o) return;
    const t = getType(o.type);
    if (o.mount) return; // wall-bound objects follow their wall
    this.update(id, { rotation: o.rotation + deg });
    void t;
  }

  // ---------- room ----------
  setRoom(patch) {
    const r = this.doc.room;
    const next = normalizeDocument({ ...this.doc, room: { ...r, ...patch, finishes: { ...r.finishes, ...(patch.finishes || {}) } } }).room;
    next.id = r.id;
    this.doc.room = next;
    for (const o of this.doc.objects) this._clampObject(o);
    this.emit('change', { kind: 'room' });
    this._record('Room');
  }

  /** Keep objects inside the room; keep wall-bound objects on their wall. */
  _clampObject(o) {
    const room = this.doc.room;
    const t = getType(o.type);
    if (o.mount) {
      const f = wallFrame(room, o.mount.wall);
      const half = o.size.w / 2;
      o.mount.offset = Math.min(f.length - half, Math.max(half, o.mount.offset));
      const r = resolveMount(room, o);
      o.position = { x: round(r.x), z: round(r.z) };
      o.rotation = r.rotation;
      if (t?.placement === 'opening') o.elevation = Math.min(room.height - o.size.h - 0.05, Math.max(0, o.elevation));
      else o.elevation = Math.min(room.height - o.size.h, Math.max(0, o.elevation));
      return;
    }
    const e = footprintExtents(o);
    o.position.x = round(Math.min(room.width - e.x, Math.max(e.x, o.position.x)));
    o.position.z = round(Math.min(room.depth - e.z, Math.max(e.z, o.position.z)));
    o.elevation = Math.min(Math.max(0, room.height - o.size.h), Math.max(0, o.elevation));
  }
}

export function footprintExtents(o) {
  const a = (o.rotation * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  return { x: (o.size.w * c + o.size.d * s) / 2, z: (o.size.w * s + o.size.d * c) / 2 };
}
const round = (v) => Math.round(v * 10000) / 10000;
function incrementCode(code) { const m = /^(.*?)(\d+)$/.exec(code); return m ? m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0') : code + '-2'; }
