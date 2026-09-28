import * as THREE from 'three';
import { PaintedMaterials } from '../planner/PaintedMaterials.js';
import { PlannerEngine } from '../planner/PlannerEngine.js';
import { PlannerShell } from '../planner/PlannerShell.js';
import { PlannerView, plannerCacheStats } from '../planner/PlannerView.js';
import { ObjectLayer } from '../objects/ObjectLayer.js';
import { StaticBatcher } from '../renderer/StaticBatcher.js';

/**
 * PLANNER mode — stylised, hand-painted real-time renderer (default).
 *
 * Same RoomDocument, same editor, same picking/snapping; its own lightweight scene: one painted atlas,
 * five shader materials, procedurally generated parametric assets, no lights, no shadow maps, no
 * post-processing chain. Starts without downloading any realistic asset (GLB, HDRI, PBR textures).
 */
export class PlannerMode {
  constructor(app) {
    this.app = app;
    this.name = 'planner';
    this.stale = true;
  }

  async init(progress = () => {}) {
    const app = this.app;
    progress(0.1, 'Loading painted atlas');
    this.mats = await new PaintedMaterials().load('assets/planner/');
    this.engine = new PlannerEngine(app.renderer, app.viewportEl, { quality: app.prefs.quality });
    this.scene = new THREE.Scene();
    this.engine.attach(this.scene, app.rig.camera);
    this.engine.onResize = (w, h) => app.labels.setSize(w, h);
    this.shell = new PlannerShell(this.mats);
    this.scene.add(this.shell.group);
    this.objects = new ObjectLayer(app.editor, { View: PlannerView, mats: this.mats, room: () => app.editor.room });
    this.scene.add(this.objects.group);
    this.batcher = new StaticBatcher(this.scene);
    this.mats.setPreset(app.prefs.lighting);
    this.selectedId = null;
    return this;
  }

  syncDocument() {
    const ed = this.app.editor;
    const t0 = performance.now();
    this.objects.syncAll();
    this.shell.build(ed.room, ed.objects);
    this.stale = false;
    this.buildMs = Math.round(performance.now() - t0);
    this._applySelection();
    this.engine.invalidate();
  }

  onChange(c) {
    const ed = this.app.editor;
    if (c.kind === 'document' || c.kind === 'room') this.objects.syncAll();
    else if (c.kind === 'remove') for (const id of c.ids) this.objects.remove(id);
    else for (const id of c.ids || []) { const o = ed.get(id); if (o) this.objects.sync(o); }
    const rebuilt = this.shell.build(ed.room, ed.objects);
    this._applySelection();
    this.engine.invalidate();
    return rebuilt;
  }

  setSelected(id) { this.selectedId = id || null; this._applySelection(); this.engine.invalidate(); }
  _applySelection() {
    for (const v of this.objects.views.values()) { const on = v.id === this.selectedId; if (v.selected !== on) v.setSelected(on); }
  }

  updateCutaway(force = false) {
    const app = this.app, cam = app.rig.camera.position;
    const { hiddenWalls, ceilingVisible } = this.shell.updateVisibility(app.editor.room, cam);
    const dir = app.rig.controls.target.clone().sub(cam).normalize();
    const changed = this.objects.setHiddenWalls(hiddenWalls, Math.abs(dir.y) < 0.55);
    if (changed || force) this.engine.invalidate();
    return { ceilingVisible };
  }

  activate() {
    if (this.stale) this.syncDocument();
    this.scene.add(this.app.overlay.group);
    this.mats.setPreset(this.app.prefs.lighting);
    this.engine.activate();
  }
  deactivate() { this.engine.deactivate(); }

  setLighting(key) { this.mats.setPreset(key); this.engine.invalidate(); }
  setQuality(q) { this.engine.setQuality(q); }

  async precompile() {
    this.batcher.sync(this.objects.views.values(), this.app.detachedId);
    const t0 = performance.now();
    try { await this.app.renderer.compileAsync(this.scene, this.app.rig.camera); } catch (e) { console.warn('[planner] compileAsync failed', e); }
    this.engine.warmup();
    this.engine.stats.compileMs = Math.round(performance.now() - t0);
  }

  frame(now) {
    this.batcher.sync(this.objects.views.values(), this.app.detachedId);
    return this.engine.frame(now);
  }

  diagRows() {
    const b = this.batcher.stats, c = plannerCacheStats();
    let tris = 0; for (const v of this.objects.views.values()) tris += v.visual?.userData.tris || 0;
    return [
      ['Static batches', `${b.batches} batches · ${b.instances} instances · ${b.rebuilds} rebuilds`],
      ['Painted materials', `${this.mats.count()} shader materials · 1 atlas texture (${this.mats.meta.size}² · ${Object.keys(this.mats.tiles).length} tiles)`],
      ['Geometry cache', `${c.entries} unique assets · ${c.refs} views · ${(tris / 1000).toFixed(0)}k tris in scene`],
      ['Room build', this.buildMs != null ? `${this.buildMs} ms (procedural, no downloads)` : '–'],
      ['Lights / shadow maps', '0 / 0 (painted light)'],
    ];
  }
}
