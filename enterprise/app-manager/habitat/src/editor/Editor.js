import { Emitter } from '../core/Emitter.js';
import { History } from './History.js';
import { createDocument, createObject, normalizeDocument, normalizeObject, newId, resolveMount, wallFrame, syncReferencedSizes } from '../model/RoomDocument.js';
import { libraryIndex, normalizeTemplate, normalizeAssembly, normalizeInstance, createInstance, normalizeOrigin, cloneData, assemblyBoxes, boxesOverlap, assemblyStats } from '../model/Library.js';
import { getType } from '../objects/catalog.js';
import { Snapper } from './Snapping.js';
import { normalizeRoute, normalizeCircuit, normalizeTech, netId } from '../tech/Network.js';

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
    if (copy.tech) copy.tech.deviceId = `dev_${copy.id}`; // a copy is a new physical device
    // a copy of a physical structure is a NEW physical structure: new assembly / instance ids
    if (o.type === 'assembly') { const a = this._cloneAssemblyData(o.ref.assemblyId); if (!a) return null; copy.ref = { assemblyId: a.id }; copy.name = a.name; }
    if (o.type === 'custom_enclosure') { const inst = this.lib.instances.get(o.ref.instanceId); const t = inst && this.lib.templates.get(inst.templateId); if (!t) return null; const ni = createInstance(t, this.doc, { props: cloneData(inst.props) }); this.doc.instances.push(ni); copy.ref = { instanceId: ni.id }; copy.name = `${t.name} · ${ni.code}`; }
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

  // ---------- project library (enclosure templates, instances, assemblies) ----------
  get lib() { return libraryIndex(this.doc); }
  get templates() { return this.doc.enclosures; }
  get assemblies() { return this.doc.assemblies; }

  /** Room objects that visually depend on a template / assembly / instance. */
  dependents({ templateId, assemblyId, instanceId } = {}) {
    const lib = this.lib;
    return this.doc.objects.filter((o) => {
      if (o.type === 'assembly') {
        const a = lib.assemblies.get(o.ref?.assemblyId); if (!a) return false;
        if (assemblyId && a.id === assemblyId) return true;
        return a.members.some((m) => (templateId && m.enclosureId === templateId) || (instanceId && m.instanceId === instanceId));
      }
      if (o.type === 'custom_enclosure') { const i = lib.instances.get(o.ref?.instanceId); return !!i && ((templateId && i.templateId === templateId) || (instanceId && i.id === instanceId)); }
      return false;
    }).map((o) => o.id);
  }

  _libraryChanged(ids, label) {
    const resized = syncReferencedSizes(this.doc);
    for (const id of resized) { const o = this.get(id); if (o) this._clampObject(o); }
    this.emit('change', { kind: 'library', ids: [...new Set([...ids, ...resized])] });
    this._record(label);
  }

  saveTemplate(t) {
    const n = normalizeTemplate({ ...t, metadata: { ...(t.metadata || {}), modified: new Date().toISOString() } });
    const i = this.doc.enclosures.findIndex((x) => x.id === n.id);
    if (i >= 0) this.doc.enclosures[i] = n; else this.doc.enclosures.push(n);
    // every physical instance gets a stable device id for new technology slots
    for (const inst of this.doc.instances) if (inst.templateId === n.id) Object.assign(inst, normalizeInstance(inst, n));
    this._libraryChanged(this.dependents({ templateId: n.id }), i >= 0 ? `Edit enclosure ${n.name}` : `Create enclosure ${n.name}`);
    return n;
  }

  deleteTemplate(id) {
    if (this.doc.instances.some((i) => i.templateId === id)) return false; // physical enclosures still use it
    this.doc.enclosures = this.doc.enclosures.filter((t) => t.id !== id);
    this._libraryChanged([], 'Delete enclosure');
    return true;
  }

  duplicateTemplate(id) {
    const t = this.lib.templates.get(id); if (!t) return null;
    const c = cloneData(t); c.id = newId('enc'); c.name = t.name.replace(/( copy( \d+)?)?$/, '') + ' copy'; c.metadata.code = ''; c.metadata.created = new Date().toISOString();
    return this.saveTemplate(c);
  }

  /** New physical enclosure of a template (not placed yet). Does not record by itself. */
  newInstance(templateId, patch = {}) {
    const t = this.lib.templates.get(templateId); if (!t) return null;
    const inst = createInstance(t, this.doc, patch);
    this.doc.instances.push(inst);
    return inst;
  }

  updateInstance(id, patch) {
    const inst = this.doc.instances.find((i) => i.id === id); if (!inst) return null;
    const t = this.lib.templates.get(inst.templateId);
    Object.assign(inst, normalizeInstance({ ...inst, ...patch, props: { ...inst.props, ...(patch.props || {}), animal: { ...inst.props.animal, ...(patch.props?.animal || {}) } } }, t));
    this._libraryChanged(this.dependents({ instanceId: id }), 'Edit enclosure instance');
    return inst;
  }

  /**
   * Save an assembly definition coming from the Assembly Builder. `newInstances` are the physical
   * enclosures created while building (committed together with the assembly as one undo step).
   * Instances no longer referenced by the assembly are removed with it.
   */
  saveAssembly(a, newInstances = []) {
    const lib0 = this.lib;
    const prev = lib0.assemblies.get(a.id);
    for (const inst of newInstances) if (!lib0.instances.has(inst.id)) this.doc.instances.push(normalizeInstance(inst, lib0.templates.get(inst.templateId)));
    const lib = this.lib;
    const n = normalizeOrigin(normalizeAssembly({ ...a, metadata: { ...(a.metadata || {}), modified: new Date().toISOString() } }), lib);
    const i = this.doc.assemblies.findIndex((x) => x.id === n.id);
    if (i >= 0) this.doc.assemblies[i] = n; else this.doc.assemblies.push(n);
    if (prev) {
      const keep = new Set(n.members.map((m) => m.instanceId));
      const dropped = prev.members.filter((m) => m.instanceId && !keep.has(m.instanceId)).map((m) => m.instanceId);
      this.doc.instances = this.doc.instances.filter((x) => !dropped.includes(x.id) || this.doc.objects.some((o) => o.ref?.instanceId === x.id));
    }
    this._libraryChanged(this.dependents({ assemblyId: n.id }), i >= 0 ? `Edit assembly ${n.name}` : `Create assembly ${n.name}`);
    return n;
  }

  deleteAssembly(id) {
    const a = this.lib.assemblies.get(id); if (!a) return;
    const placed = this.doc.objects.filter((o) => o.ref?.assemblyId === id).map((o) => o.id);
    this.doc.objects = this.doc.objects.filter((o) => o.ref?.assemblyId !== id);
    const inst = new Set(a.members.map((m) => m.instanceId).filter(Boolean));
    this.doc.instances = this.doc.instances.filter((i) => !inst.has(i.id));
    this.doc.assemblies = this.doc.assemblies.filter((x) => x.id !== id);
    if (placed.includes(this.selection)) { this.selection = null; this.emit('selection', null); }
    if (placed.length) this.emit('change', { kind: 'remove', ids: placed });
    this._libraryChanged([], `Delete assembly ${a.name}`);
  }

  _cloneAssemblyData(id) {
    const a = this.lib.assemblies.get(id); if (!a) return null;
    const c = cloneData(a); c.id = newId('asm');
    c.name = a.name.replace(/( copy( \d+)?)?$/, '') + ' copy';
    const lib = this.lib;
    for (const m of c.members) {
      if (m.kind !== 'enclosure') continue;
      const old = lib.instances.get(m.instanceId), t = lib.templates.get(m.enclosureId);
      const ni = createInstance(t, this.doc, { props: cloneData(old?.props || {}) });
      this.doc.instances.push(ni); m.instanceId = ni.id;
    }
    this.doc.assemblies.push(normalizeAssembly(c));
    return this.doc.assemblies[this.doc.assemblies.length - 1];
  }

  /** Library duplicate (new physical instances). */
  duplicateAssembly(id) { const c = this._cloneAssemblyData(id); if (c) this._libraryChanged([], `Duplicate assembly ${c.name}`); return c; }

  /** In-room member edits (ENTER ASSEMBLY): remove / replace keep all other ids untouched. */
  removeMember(assemblyId, memberId) {
    const a = cloneData(this.lib.assemblies.get(assemblyId)); if (!a) return;
    a.members = a.members.filter((m) => m.id !== memberId);
    a.reserved = a.reserved.filter((r) => r.id !== memberId);
    this.saveAssembly(a);
  }

  /** Library → room: a template placement creates a NEW physical enclosure (one undo step). */
  placeTemplate(templateId, placement) {
    const t = this.lib.templates.get(templateId); if (!t) return null;
    // IR Manager: a Manager enclosure IS a physical enclosure — place it if it is not placed anywhere yet;
    // only further placements create new physical enclosures (which then become new Manager enclosures)
    let inst = this.reuseUnplacedInstances ? this.doc.instances.find((i) => i.templateId === templateId && !this.isPlaced({ instanceId: i.id })) : null;
    if (!inst) { inst = createInstance(t, this.doc); this.doc.instances.push(inst); }
    return this.add('custom_enclosure', { ...placement, name: `${t.name} · ${inst.code}`, ref: { instanceId: inst.id }, size: { w: t.dimensions.width, h: t.dimensions.height + t.bottom.base, d: t.dimensions.depth } });
  }

  /** Library → room: an assembly is one physical structure; placing it again places a physical COPY. */
  placeAssembly(assemblyId, placement) {
    let a = this.lib.assemblies.get(assemblyId); if (!a) return null;
    if (this.isPlaced({ assemblyId })) a = this._cloneAssemblyData(assemblyId);
    const o = { type: 'assembly', ref: { assemblyId: a.id }, size: { w: 1, h: 1, d: 1 }, position: { x: 0, z: 0 }, rotation: 0 };
    const tmp = { ...this.doc, objects: [o] }; syncReferencedSizes(tmp);
    return this.add('assembly', { ...placement, name: a.name, ref: { assemblyId: a.id }, size: o.size });
  }

  /** In-room REPLACE: swap one member for another enclosure design (new physical id), if it fits. */
  replaceMember(assemblyId, memberId, templateId) {
    const lib = this.lib, a = cloneData(lib.assemblies.get(assemblyId)), t = lib.templates.get(templateId);
    const m = a?.members.find((x) => x.id === memberId); if (!m || !t) return false;
    const old = { ...m };
    const inst = createInstance(t, this.doc);
    m.enclosureId = t.id; m.instanceId = inst.id;
    const tmp = libraryIndex({ ...this.doc, instances: [...this.doc.instances, inst], assemblies: [a] });
    const boxes = assemblyBoxes(a, tmp), me = boxes.find((b) => b.id === memberId);
    if (boxes.some((b) => b.id !== memberId && boxesOverlap(b, me))) { Object.assign(m, old); return false; }
    this.saveAssembly(a, [inst]);
    return true;
  }

  /** Is an assembly / instance already placed in the room? */
  isPlaced({ assemblyId, instanceId }) {
    if (assemblyId) return this.doc.objects.some((o) => o.ref?.assemblyId === assemblyId);
    if (instanceId) return this.doc.objects.some((o) => o.ref?.instanceId === instanceId) || this.doc.assemblies.some((a) => a.members.some((m) => m.instanceId === instanceId));
    return false;
  }

  // ---------- technical network (routes, circuits, device ports) ----------
  get network() { return (this.doc.network ||= { routes: [], circuits: [] }); }
  getRoute(id) { return this.network.routes.find((r) => r.id === id) || null; }
  getCircuit(id) { return this.network.circuits.find((c) => c.id === id) || null; }
  _netChanged(label, record = true) { this.emit('change', { kind: 'network', ids: [] }); if (record) this._record(label); }

  addRoute(r) {
    const n = normalizeRoute({ ...r, id: r.id || netId('rt') });
    this.network.routes.push(n);
    this._netChanged(`Add ${n.kind} route`);
    return n;
  }
  updateRoute(id, patch, { record = true } = {}) {
    const i = this.network.routes.findIndex((r) => r.id === id); if (i < 0) return null;
    const n = normalizeRoute({ ...this.network.routes[i], ...patch, id });
    const cids = new Set(this.network.circuits.map((c) => c.id));
    if (n.circuitId && !cids.has(n.circuitId)) n.circuitId = null;
    this.network.routes[i] = n;
    this._netChanged('Edit route', record);
    return n;
  }
  removeRoute(id) {
    const n = this.network.routes.length;
    this.network.routes = this.network.routes.filter((r) => r.id !== id);
    if (this.network.routes.length !== n) this._netChanged('Delete route');
  }
  addCircuit(c) {
    const used = new Set(this.network.circuits.map((x) => x.code));
    let k = this.network.circuits.length + 1; while (used.has(`C${k}`)) k++;
    const n = normalizeCircuit({ code: `C${k}`, name: `Circuit ${k}`, ...c, id: c.id || netId('cir') });
    this.network.circuits.push(n);
    this._netChanged(`Add circuit ${n.code}`);
    return n;
  }
  updateCircuit(id, patch, { record = true } = {}) {
    const i = this.network.circuits.findIndex((c) => c.id === id); if (i < 0) return null;
    const n = normalizeCircuit({ ...this.network.circuits[i], ...patch, id });
    this.network.circuits[i] = n;
    this._netChanged('Edit circuit', record);
    return n;
  }
  /** Delete a circuit; its routes stay (unassigned) unless `withRoutes`. */
  removeCircuit(id, { withRoutes = false } = {}) {
    this.network.circuits = this.network.circuits.filter((c) => c.id !== id);
    this.network.routes = withRoutes ? this.network.routes.filter((r) => r.circuitId !== id) : this.network.routes.map((r) => (r.circuitId === id ? { ...r, circuitId: null } : r));
    this._netChanged('Delete circuit');
  }
  /** Replace a technical object's user-defined ports (catalogue ports are fixed by its type). */
  setDevicePorts(objectId, ports) {
    const o = this.get(objectId); if (!o) return null;
    o.tech = normalizeTech({ ...(o.tech || {}), ports }, o.id);
    this.emit('change', { kind: 'update', ids: [o.id] });
    this._netChanged('Edit device ports');
    return o.tech;
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
    const walls = { ...r.walls };
    for (const [w, v] of Object.entries(patch.walls || {})) walls[w] = { ...r.walls?.[w], ...v, profile: { ...r.walls?.[w]?.profile, ...(v.profile || {}) } };
    const next = normalizeDocument({ ...this.doc, room: { ...r, ...patch, walls, floor: { ...r.floor, ...(patch.floor || {}) }, details: { ...r.details, ...(patch.details || {}) }, finishes: { ...r.finishes, ...(patch.finishes || {}) } } }).room;
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
