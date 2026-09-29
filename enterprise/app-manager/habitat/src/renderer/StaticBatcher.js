import * as THREE from 'three';

/**
 * Runtime draw-call reduction.
 *
 * Every object view is a GLB clone whose meshes use *shared* library materials. The batcher folds the
 * meshes of all objects into one THREE.BatchedMesh per (material, shadow flag, layer) — rendered with
 * WEBGL_multi_draw as a single draw call — instead of one draw call per mesh per object.
 *
 *  - transforms / cut-away visibility are updated per instance (setMatrixAt / setVisibleAt): no rebuild
 *    when objects move, rotate, resize or hide;
 *  - the batches are rebuilt only when the set of objects changes (add / remove / model loaded);
 *  - one object can be *detached* (the selected / dragged one): its own meshes are shown instead so the
 *    selection outline and live dragging work exactly as before;
 *  - per-object materials (switchable LED emitters, printed labels) and animals are never batched.
 * The logical model is untouched: batching is purely a rendering concern.
 */
export class StaticBatcher {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'static-batches';
    scene.add(this.group);
    this.batches = new Map();     // key -> BatchedMesh
    this.entries = new Map();     // viewId -> [{ mesh, batch, instanceId }]
    this.versions = new Map();    // viewId -> view.version at last matrix sync
    this.structureKey = '';
    this.detachedId = null;
    this.enabled = true;
    this.stats = { batches: 0, instances: 0, rebuilds: 0 };
  }

  static batchableMeshes(view) {
    const out = [];
    if (!view.visual || view.visual.userData.placeholder) return out;
    view.visual.traverse((m) => { if (m.isMesh && m.userData.batchable) out.push(m); });
    return out;
  }

  /** Bring batches up to date with the views. Cheap when nothing structural changed. */
  sync(views, detachedId = null) {
    if (!this.enabled) return;
    const list = [...views].filter((v) => v.visual && !v.visual.userData.placeholder && !v.disposed);
    const key = list.map((v) => `${v.id}:${v.visual.uuid}`).sort().join('|');
    if (key !== this.structureKey) { this._rebuild(list); this.structureKey = key; this.versions.clear(); }
    const detachChanged = detachedId !== this.detachedId;
    this.detachedId = detachedId;
    for (const v of list) {
      const entries = this.entries.get(v.id); if (!entries) continue;
      const detached = v.id === detachedId;
      if (detachChanged || this.versions.get(v.id) !== v.version) {
        v.root.updateMatrixWorld(true);
        for (const e of entries) e.batch.setMatrixAt(e.instanceId, e.mesh.matrixWorld);
        this.versions.set(v.id, v.version);
      }
      const show = v.root.visible && !detached;
      for (const e of entries) {
        if (e.shown !== show) { e.batch.setVisibleAt(e.instanceId, show); e.shown = show; }
        e.mesh.visible = detached; // the object's own meshes are only drawn while detached
      }
    }
  }

  _rebuild(views) {
    for (const b of this.batches.values()) { b.dispose(); b.removeFromParent(); }
    this.batches.clear(); this.entries.clear();
    // group meshes by render state
    const groups = new Map();
    for (const v of views) {
      for (const m of StaticBatcher.batchableMeshes(v)) {
        const mat = m.userData.baseMaterial || m.material; // selection variants never leak into a batch
        const k = `${mat.uuid}|${m.castShadow ? 1 : 0}|${m.layers.mask}`;
        if (!groups.has(k)) groups.set(k, { material: mat, castShadow: m.castShadow, layers: m.layers.mask, items: [] });
        groups.get(k).items.push({ view: v, mesh: m });
      }
    }
    let instances = 0;
    for (const [k, g] of groups) {
      const geos = new Map();
      for (const it of g.items) geos.set(it.mesh.geometry.uuid, it.mesh.geometry);
      let verts = 0, idx = 0;
      for (const geo of geos.values()) { verts += geo.attributes.position.count; idx += geo.index ? geo.index.count : geo.attributes.position.count; }
      const batch = new THREE.BatchedMesh(g.items.length, verts, idx, g.material);
      batch.name = `batch:${g.material.name}`;
      batch.castShadow = g.castShadow; batch.receiveShadow = true;
      batch.layers.mask = g.layers;
      batch.frustumCulled = false;            // per-instance culling is still active
      batch.perObjectFrustumCulled = true;
      const blended = !!g.material.transparent || g.material.transmission > 0;
      batch.sortObjects = blended;
      if (blended) batch.setCustomSort(backToFront); // same order as individual meshes would get
      if (g.material.transmission > 0 && g.material.name === 'glass') batch.renderOrder = 1; // panes last
      if (g.items[0].mesh.renderOrder) batch.renderOrder = g.items[0].mesh.renderOrder; // planner buckets
      const ids = new Map();
      for (const [uuid, geo] of geos) ids.set(uuid, batch.addGeometry(geo));
      for (const it of g.items) {
        const instanceId = batch.addInstance(ids.get(it.mesh.geometry.uuid));
        const arr = this.entries.get(it.view.id) || [];
        arr.push({ mesh: it.mesh, batch, instanceId, shown: true });
        this.entries.set(it.view.id, arr);
        instances++;
      }
      this.group.add(batch);
      this.batches.set(k, batch);
    }
    this.stats = { batches: this.batches.size, instances, rebuilds: this.stats.rebuilds + 1 };
  }

  setEnabled(on, views) {
    this.enabled = on;
    this.group.visible = on;
    if (!on) for (const v of views) for (const m of StaticBatcher.batchableMeshes(v)) m.visible = true;
    else { this.structureKey = ''; this.versions.clear(); }
  }
}

/** Far-to-near ordering of the instances of a blended / transmissive batch. */
function backToFront(list) { list.sort((a, b) => b.z - a.z); }
