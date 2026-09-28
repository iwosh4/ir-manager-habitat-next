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
/** Amber corner brackets around the selected object's logical box (thin, drawn on top, no fill). */
class SelectionBrackets {
  constructor() {
    const pts = [];
    for (const x of [-0.5, 0.5]) for (const y of [0, 1]) for (const z of [-0.5, 0.5]) {
      const c = new THREE.Vector3(x, y, z);
      for (const [ax, dir] of [['x', -Math.sign(x)], ['y', y ? -1 : 1], ['z', -Math.sign(z)]]) { const e = c.clone(); e[ax] += dir * 0.18; pts.push(c, e); }
    }
    this.base = pts;
    this.geo = new THREE.BufferGeometry().setFromPoints(pts);
    this.object = new THREE.LineSegments(this.geo, new THREE.LineBasicMaterial({ color: 0xf0a04b, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false }));
    this.object.renderOrder = 20; this.object.visible = false; this.object.frustumCulled = false;
  }
  show(view, proxy = view?.proxy) {
    if (!view || !proxy) { this.object.visible = false; return; }
    view.root.updateMatrixWorld(true);
    const m = proxy.matrixWorld, s = proxy.scale;
    // bracket arms: 18 % of each edge, capped at 18 cm (so large racks keep slim corners)
    const k = [Math.min(1, 0.18 / Math.max(0.01, s.x * 0.18)), Math.min(1, 0.18 / Math.max(0.01, s.y * 0.18)), Math.min(1, 0.18 / Math.max(0.01, s.z * 0.18))];
    const p = this.geo.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < this.base.length; i += 2) {
      const c = this.base[i], e = this.base[i + 1];
      v.copy(c).applyMatrix4(m); p.setXYZ(i, v.x, v.y, v.z);
      v.set(c.x + (e.x - c.x) * k[0], c.y + (e.y - c.y) * k[1], c.z + (e.z - c.z) * k[2]).applyMatrix4(m); p.setXYZ(i + 1, v.x, v.y, v.z);
    }
    p.needsUpdate = true;
    this.object.visible = true;
  }
}

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
    // crisp atlas at grazing angles during camera movement (audit: anisotropy was fixed at 4)
    const atlas = this.mats.uniforms.uAtlas.value;
    atlas.anisotropy = Math.min(8, app.renderer.capabilities.getMaxAnisotropy()); atlas.needsUpdate = true;
    this.engine = new PlannerEngine(app.renderer, app.viewportEl, { quality: app.prefs.quality });
    this.scene = new THREE.Scene();
    this.engine.attach(this.scene, app.rig.camera);
    this.engine.onResize = (w, h) => app.labels.setSize(w, h);
    this.shell = new PlannerShell(this.mats);
    this.scene.add(this.shell.group);
    this.objects = new ObjectLayer(app.editor, { View: PlannerView, mats: this.mats, room: () => app.editor.room, lib: () => app.editor.lib });
    this.scene.add(this.objects.group);
    this.batcher = new StaticBatcher(this.scene);
    this.mats.setPreset(app.prefs.lighting);
    this.selectedId = null;
    this.brackets = new SelectionBrackets();
    this.scene.add(this.brackets.object);
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

  /** Hierarchical: whole object, or one member of an entered assembly (memberId). */
  setSelected(id, memberId = null) { this.selectedId = id || null; this.selectedMember = memberId; this._applySelection(); this.engine.invalidate(); }
  _applySelection() {
    for (const v of this.objects.views.values()) {
      const on = v.id === this.selectedId, mem = on ? this.selectedMember || null : null;
      if (v.selected !== on || (v.selectedMember || null) !== mem) v.setSelected(on, mem);
    }
    const sv = this.selectedId && this.objects.get(this.selectedId), mp = sv && this.selectedMember && sv.members?.get(this.selectedMember);
    if (mp) { this.brackets.show(sv.root.visible ? sv : null, mp.proxy); return; }
    const v = this.selectedId && this.objects.get(this.selectedId);
    this.brackets.show(v && v.root.visible ? v : null);
  }

  updateCutaway(force = false) {
    const app = this.app, cam = app.rig.camera.position;
    const { hiddenWalls, ceilingVisible } = this.shell.updateVisibility(app.editor.room, cam);
    const dir = app.rig.controls.target.clone().sub(cam).normalize();
    const changed = this.objects.setHiddenWalls(hiddenWalls, Math.abs(dir.y) < 0.55);
    if (changed) this._applySelection();
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
