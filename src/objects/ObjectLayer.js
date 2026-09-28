import * as THREE from 'three';
import { getType } from './catalog.js';
import { WALLS, wallFrame } from '../model/RoomDocument.js';

/**
 * Keeps the 3D object views in sync with the editor's logical document.
 * `ctx.View` is the view class (ObjectView = Showcase GLB views, PlannerView = painted views); the layer
 * itself imports neither, so the Planner never loads the GLB pipeline.
 */
export class ObjectLayer {
  constructor(editor, ctx) {
    this.editor = editor;
    this.ctx = ctx;
    this.group = new THREE.Group(); this.group.name = 'objects';
    this.views = new Map();
    this.hiddenWalls = new Set();
  }

  syncAll() {
    const ids = new Set(this.editor.objects.map((o) => o.id));
    for (const [id, v] of this.views) if (!ids.has(id)) { v.dispose(); this.views.delete(id); }
    for (const o of this.editor.objects) this.sync(o);
  }

  sync(obj) {
    let v = this.views.get(obj.id);
    if (v && v.type !== obj.type) { v.dispose(); this.views.delete(obj.id); v = null; }
    if (!v) {
      v = new this.ctx.View(obj, this.ctx);
      this.views.set(obj.id, v);
      this.group.add(v.root);
    }
    v.update(obj);
    this._applyWallVisibility(v, obj);
    return v;
  }

  remove(id) { const v = this.views.get(id); if (v) { v.dispose(); this.views.delete(id); } }

  get(id) { return this.views.get(id) || null; }

  proxies() { const out = []; for (const v of this.views.values()) if (v.root.visible) out.push(v.proxy); return out; }

  /**
   * Cut-away support. Wall-bound items on hidden walls are always hidden; in low elevation views
   * (`hideBacked`) furniture standing with its back against a hidden wall is hidden as well so that
   * front/side elevations show the opposite wall unobstructed.
   */
  setHiddenWalls(set, hideBacked = false) {
    const key = [...set].sort().join() + (hideBacked ? '|b' : '');
    if (key === this._hwKey) return false;
    this._hwKey = key; this.hiddenWalls = set; this.hideBacked = hideBacked;
    for (const o of this.editor.objects) { const v = this.views.get(o.id); if (v) this._applyWallVisibility(v, o); }
    return true;
  }

  _applyWallVisibility(v, obj) {
    const t = getType(obj.type);
    const wallBound = obj.mount && (t.placement === 'mounted' || t.placement === 'opening');
    let hidden = !!(wallBound && this.hiddenWalls.has(obj.mount.wall));
    if (!hidden && this.hideBacked && !wallBound) { const w = backedWall(this.editor.room, obj); hidden = !!(w && this.hiddenWalls.has(w)); }
    v.setHidden(hidden);
  }

  /** Placement preview: a real (non-document) view following the cursor. */
  createGhost(obj) {
    this.removeGhost();
    const v = new this.ctx.View(obj, this.ctx);
    v.root.userData.ghost = true;
    this.ghost = v; this.group.add(v.root);
    v.update(obj);
    return v;
  }

  removeGhost() { if (this.ghost) { this.ghost.dispose(); this.ghost = null; } }

  whenLoaded() { return Promise.all([...this.views.values()].map((v) => v.loading)); }
}

/** The wall a free-standing object has its back against (same orientation, back face within 12 cm). */
export function backedWall(room, o) {
  for (const w of WALLS) {
    const f = wallFrame(room, w);
    if (((o.rotation - f.rotation) % 360 + 360) % 360 > 1) continue;
    const dist = w === 'north' ? o.position.z : w === 'south' ? room.depth - o.position.z : w === 'west' ? o.position.x : room.width - o.position.x;
    if (Math.abs(dist - o.size.d / 2) < 0.12) return w;
  }
  return null;
}
