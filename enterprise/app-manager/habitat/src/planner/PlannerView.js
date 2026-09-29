import * as THREE from 'three';
import { getType } from '../objects/catalog.js';
import { buildModel, modelKey } from './stylizedModels.js';
import { PaintBuilder } from './PaintBuilder.js';
import { buildEnclosureInto, buildModuleInto } from '../enclosures/EnclosureGeometry.js';
import { templateHash, assemblyHash } from '../model/Library.js';
import { assemblyLayout, buildFrameInto, buildReservedInto, assemblyFloorShadow } from '../assembly/AssemblyLayout.js';

const DEG = Math.PI / 180;

/**
 * Geometry cache shared by all planner views (and the builder previews): identical visual definitions
 * — same catalogue type & size, same enclosure template & state, same module, same frame — share one
 * set of merged geometries. Entries are reference-counted and released when unused.
 */
const CACHE = new Map(); // key -> { geos: {bucket: BufferGeometry}, refs, tris }
export const plannerCacheStats = () => ({ entries: CACHE.size, refs: [...CACHE.values()].reduce((a, e) => a + e.refs, 0) });

export function acquireGeometry(key, make) {
  let e = CACHE.get(key);
  if (!e) {
    const b = make();
    e = { geos: b.geometries(), refs: 0, tris: b.tris };
    CACHE.set(key, e);
  }
  e.refs++;
  return e;
}
export function releaseGeometry(key) {
  const e = CACHE.get(key); if (!e) return;
  if (--e.refs <= 0) { for (const g of Object.values(e.geos)) g.dispose(); CACHE.delete(key); }
}

const ORDER = { glass: 2, glow: 3, decal: 4 };
/** Meshes for a cached geometry set (shared geometry + shared materials → batchable). */
export function meshesFor(entry, mats, name = '') {
  const g = new THREE.Group();
  for (const [bucket, geo] of Object.entries(entry.geos)) {
    const m = new THREE.Mesh(geo, mats.materials[bucket]);
    m.name = `${name}:${bucket}`;
    m.userData.bucket = bucket; m.userData.batchable = true; m.userData.baseMaterial = m.material;
    m.renderOrder = ORDER[bucket] || 0;
    g.add(m);
  }
  return g;
}

export const enclosureGeoKey = (t, st) => `tpl|${t.id}|${templateHash(t)}|${st.occupied ? 1 : 0}${st.lighting ? 1 : 0}`;

/**
 * PLANNER visual binding of ONE logical object — same contract as ObjectView (root / proxy / visual /
 * update / setHidden / dispose / version), so ObjectLayer, the editor, picking, snapping and the
 * batcher work unchanged. Catalogue types are generated at their logical size; `custom_enclosure`
 * from its template; `assembly` as a group of per-member visuals (each member keeps its own node,
 * id and pick proxy — the batcher folds them into shared draw calls).
 */
export class PlannerView {
  constructor(obj, ctx) {
    this.ctx = ctx; // { mats, room(), lib() }
    this.id = obj.id;
    this.type = obj.type;
    this.root = new THREE.Group(); this.root.name = `object:${obj.id}`; this.root.userData.objectId = obj.id;
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.geometry.translate(0, 0.5, 0);
    this.proxy.userData.objectId = obj.id; this.proxy.name = 'proxy';
    this.root.add(this.proxy);
    this.visual = null; this.key = null; this.keys = []; this.missing = false; this.selected = false; this.selectedMember = null;
    this.members = new Map(); // memberId -> { node, proxy, box }
    this.loading = Promise.resolve();
    this.update(obj, true);
  }

  update(obj, force = false) {
    const room = this.ctx.room();
    const t = getType(obj.type);
    this.root.position.set(obj.position.x - room.width / 2, obj.elevation, obj.position.z - room.depth / 2);
    this.root.rotation.y = obj.rotation * DEG;
    const d = t.placement === 'opening' ? room.wallThickness : obj.size.d;
    this.proxy.scale.set(obj.size.w, obj.size.h, d);
    const key = this._key(obj, t, room);
    if (force || key !== this.key) this._rebuild(obj, t, room, key);
    this.version = (this.version || 0) + 1;
  }

  _key(obj, t, room) {
    const lib = this.ctx.lib?.();
    if (obj.type === 'custom_enclosure' && lib) {
      const { tpl, st } = this._enc(obj, lib);
      return tpl ? `ce|${templateHash(tpl)}|${st.occupied ? 1 : 0}${st.lighting ? 1 : 0}` : 'missing';
    }
    if (obj.type === 'assembly' && lib) {
      const a = lib.assemblies.get(obj.ref?.assemblyId);
      if (!a) return 'missing';
      const states = a.members.map((m) => { const i = lib.instances.get(m.instanceId); return i ? `${i.props.occupied ? 1 : 0}${i.props.lighting ? 1 : 0}` : ''; }).join('');
      return `asm|${a.id}|${assemblyHash(a, lib)}|${states}`;
    }
    return modelKey(obj, t, room);
  }

  /** Template + state of a custom enclosure (instance ref; template ref for placement previews). */
  _enc(obj, lib) {
    const inst = lib.instances.get(obj.ref?.instanceId);
    const tpl = inst ? lib.templates.get(inst.templateId) : lib.templates.get(obj.ref?.templateId);
    return { tpl, st: { occupied: inst ? inst.props.occupied : tpl?.interior.preset !== 'none', lighting: inst ? inst.props.lighting : true } };
  }

  _releaseAll() { for (const k of this.keys) releaseGeometry(k); this.keys = []; }

  _rebuild(obj, t, room, key) {
    const oldKeys = this.keys; this.keys = [];
    if (this.visual) this.visual.removeFromParent();
    this.members.clear();
    const mats = this.ctx.mats, lib = this.ctx.lib?.();
    const use = (k, make, name) => { this.keys.push(k); return meshesFor(acquireGeometry(k, make), mats, name); };
    let g;
    if (obj.type === 'custom_enclosure' && lib) {
      const { tpl, st } = this._enc(obj, lib);
      g = new THREE.Group();
      if (tpl) {
        g.add(use(`ce|${enclosureGeoKey(tpl, st)}`, () => { const b = new PaintBuilder(mats); buildEnclosureInto(b, tpl, { ...st, shadow: true }); return b; }, tpl.name));
      } else this.missing = true;
    } else if (obj.type === 'assembly' && lib) {
      g = this._buildAssembly(obj, lib, use);
    } else {
      g = use(key, () => buildModel(mats, obj, t, room), obj.type);
    }
    g.name = 'visual';
    let tris = 0; g.traverse((m) => { if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
    g.userData.tris = tris;
    for (const k of oldKeys) releaseGeometry(k);
    this.key = key;
    this.visual = g;
    this.root.add(g);
    if (this.selected) this.setSelected(true, this.selectedMember);
  }

  _buildAssembly(obj, lib, use) {
    const a = lib.assemblies.get(obj.ref?.assemblyId);
    const g = new THREE.Group();
    if (!a) { this.missing = true; return g; }
    const mats = this.ctx.mats;
    const L = assemblyLayout(a, lib);
    const hash = assemblyHash(a, lib);
    g.add(use(`asmframe|${hash}`, () => { const b = new PaintBuilder(mats); assemblyFloorShadow(b, L); buildFrameInto(b, a, L); return b; }, 'frame'));
    for (const p of L.parts) {
      let node;
      if (p.kind === 'reserved') node = use(`res|${p.size.w}|${p.size.h}|${p.size.d}`, () => { const b = new PaintBuilder(mats); buildReservedInto(b, p.size); return b; }, 'reserved');
      else if (p.kind === 'module') node = use(`mod|${JSON.stringify(p.member.module)}`, () => { const b = new PaintBuilder(mats); buildModuleInto(b, p.member.module); return b; }, 'module');
      else {
        const tpl = lib.templates.get(p.member.enclosureId), inst = lib.instances.get(p.member.instanceId);
        if (!tpl) continue;
        const st = { occupied: inst ? inst.props.occupied : true, lighting: inst ? inst.props.lighting : true };
        node = use(enclosureGeoKey(tpl, st), () => { const b = new PaintBuilder(mats); buildEnclosureInto(b, tpl, { ...st, shadow: false }); return b; }, tpl.name);
      }
      node.position.set(p.local.x, p.local.y, p.local.z);
      node.name = `member:${p.id}`;
      node.userData.memberId = p.id;
      // pick proxy for ENTER ASSEMBLY (member level); not pickable at room level
      const px = new THREE.Mesh(this.proxy.geometry, this.proxy.material);
      px.scale.set(p.size.w, p.size.h, p.size.d); px.position.copy(node.position);
      px.userData.memberId = p.id; px.userData.objectId = obj.id; px.name = 'member-proxy';
      g.add(node, px);
      this.members.set(p.id, { node, proxy: px, part: p });
    }
    return g;
  }

  /** Pick proxies of the members (used only while the assembly is entered). */
  memberProxies() { return [...this.members.values()].map((m) => m.proxy); }

  /** Selected object (drawn detached from the batches) gets the amber rim; inside an entered assembly only the selected member. */
  setSelected(on, memberId = null) {
    this.selected = on; this.selectedMember = memberId;
    if (!this.visual) return;
    const sel = this.ctx.mats.selected;
    const apply = (root, rim) => root.traverse((m) => { if (m.isMesh && m.userData.bucket) m.material = rim && sel[m.userData.bucket] ? sel[m.userData.bucket] : m.userData.baseMaterial; });
    if (memberId && this.members.size) {
      apply(this.visual, false);
      const mem = this.members.get(memberId); if (mem) apply(mem.node, on);
    } else apply(this.visual, on);
  }

  setHidden(hidden) { this.root.visible = !hidden; }
  outlineTargets() { return this.visual ? [this.visual] : []; }

  dispose() {
    this.disposed = true;
    this._releaseAll();
    this.key = null;
    this.proxy.geometry.dispose();
    this.root.removeFromParent();
  }
}
