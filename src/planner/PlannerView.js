import * as THREE from 'three';
import { getType } from '../objects/catalog.js';
import { buildModel, modelKey } from './stylizedModels.js';

const DEG = Math.PI / 180;

/**
 * Geometry cache shared by all planner views: identical logical objects (same type, size and visual
 * props) share one set of merged geometries. Entries are reference-counted and released when unused.
 */
const CACHE = new Map(); // key -> { geos: {bucket: BufferGeometry}, refs, tris }
export const plannerCacheStats = () => ({ entries: CACHE.size, refs: [...CACHE.values()].reduce((a, e) => a + e.refs, 0) });

function acquire(key, make) {
  let e = CACHE.get(key);
  if (!e) {
    const b = make();
    e = { geos: b.geometries(), refs: 0, tris: b.tris };
    CACHE.set(key, e);
  }
  e.refs++;
  return e;
}
function release(key) {
  const e = CACHE.get(key); if (!e) return;
  if (--e.refs <= 0) { for (const g of Object.values(e.geos)) g.dispose(); CACHE.delete(key); }
}

/**
 * PLANNER visual binding of ONE logical object — same contract as ObjectView (root / proxy / visual /
 * update / setHidden / dispose / version), so ObjectLayer, the editor, picking, snapping and the
 * batcher work unchanged. The visual is generated procedurally at the logical size (no GLB, no
 * stretching), merged into ≤5 meshes and cached.
 */
export class PlannerView {
  constructor(obj, ctx) {
    this.ctx = ctx; // { mats, room() }
    this.id = obj.id;
    this.type = obj.type;
    this.root = new THREE.Group(); this.root.name = `object:${obj.id}`; this.root.userData.objectId = obj.id;
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.geometry.translate(0, 0.5, 0);
    this.proxy.userData.objectId = obj.id; this.proxy.name = 'proxy';
    this.root.add(this.proxy);
    this.visual = null; this.key = null; this.missing = false; this.selected = false;
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
    const key = modelKey(obj, t, room);
    if (force || key !== this.key) this._rebuild(obj, t, room, key);
    this.version = (this.version || 0) + 1;
  }

  _rebuild(obj, t, room, key) {
    const old = this.key;
    const entry = acquire(key, () => buildModel(this.ctx.mats, obj, t, room));
    if (this.visual) { this.visual.removeFromParent(); }
    if (old) release(old);
    this.key = key;
    const g = new THREE.Group(); g.name = 'visual';
    for (const [bucket, geo] of Object.entries(entry.geos)) {
      const m = new THREE.Mesh(geo, this.ctx.mats.materials[bucket]);
      m.name = `${obj.type}:${bucket}`;
      m.userData.bucket = bucket;
      m.userData.batchable = true;
      m.userData.baseMaterial = m.material;
      m.renderOrder = bucket === 'glass' ? 2 : bucket === 'glow' ? 3 : bucket === 'decal' ? 4 : 0;
      g.add(m);
    }
    g.userData.tris = entry.tris;
    this.visual = g;
    this.root.add(g);
    if (this.selected) this.setSelected(true);
  }

  /** Selected object (drawn detached from the batches) gets the amber rim variants of its materials. */
  setSelected(on) {
    this.selected = on;
    if (!this.visual) return;
    const sel = this.ctx.mats.selected;
    for (const m of this.visual.children) {
      const b = m.userData.bucket;
      m.material = on && sel[b] ? sel[b] : m.userData.baseMaterial;
    }
  }

  setHidden(hidden) { this.root.visible = !hidden; }
  outlineTargets() { return this.visual ? [this.visual] : []; }

  dispose() {
    this.disposed = true;
    if (this.key) release(this.key);
    this.key = null;
    this.proxy.geometry.dispose();
    this.root.removeFromParent();
  }
}
