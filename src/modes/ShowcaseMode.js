import * as THREE from 'three';
import { RenderEngine } from '../renderer/RenderEngine.js';
import { EnvironmentSystem } from '../renderer/Environment.js';
import { MaterialLibrary } from '../assets/MaterialLibrary.js';
import { AssetManager } from '../assets/AssetManager.js';
import { RoomShell } from '../scene/RoomShell.js';
import { Lighting } from '../scene/Lighting.js';
import { ObjectLayer } from '../objects/ObjectLayer.js';
import { ObjectView } from '../objects/ObjectView.js';
import { PlannerView } from '../planner/PlannerView.js';
import { StaticBatcher } from '../renderer/StaticBatcher.js';
import { TYPES, getType } from '../objects/catalog.js';

/**
 * SHOWCASE mode — the approved realistic renderer (GLB + PBR + HDRI + shadows + GTAO/bloom/outline),
 * unchanged. It is loaded lazily (dynamic import + asset download) the first time the user switches to
 * Showcase, and renders the same RoomDocument as the Planner through its own ObjectLayer.
 */
export class ShowcaseMode {
  constructor(app) {
    this.app = app;
    this.name = 'showcase';
    this.stale = true;
  }

  async init(progress = () => {}) {
    const app = this.app;
    progress(0.05, 'Starting Showcase renderer');
    this.engine = new RenderEngine(app.viewportEl, { quality: app.prefs.quality, renderer: app.renderer });
    this.engine.active = false;
    this.scene = new THREE.Scene();
    this.engine.attach(this.scene, app.rig.camera);
    this.engine.onResize = (w, h) => app.labels.setSize(w, h);
    const renderer = app.renderer;
    this.materials = new MaterialLibrary(renderer, { onError: (url) => app._assetError(url, 'texture') });
    this.assets = new AssetManager(this.materials, { onError: (url, msg) => app._assetError(url, msg) });
    this.env = new EnvironmentSystem(renderer, this.scene);
    this.lighting = new Lighting(this.scene, this.engine);
    this.lighting.onApply = (p) => { this.env.build(p); this.env.setExteriorLevel(p.exterior); };
    this.shell = new RoomShell(this.materials, this.assets);
    this.shell.onPanelsReady = () => { this._registerPanelMaterial(); this.engine.markShadowsDirty(); };
    this.scene.add(this.shell.group);
    this.objects = new ObjectLayer(app.editor, {
      // user-designed enclosures / assemblies have no GLB: they are drawn from the parametric kit
      viewFor: (obj) => (getType(obj.type)?.parametric ? PlannerView : ObjectView), mats: app.modes.planner.mats, lib: () => app.editor.lib,
      View: ObjectView, assets: this.assets, materials: this.materials, lighting: this.lighting,
      room: () => app.editor.room,
      onReady: () => { if (app.mode === this) app.refreshSelection(); this.engine.markShadowsDirty(); },
    });
    this.scene.add(this.objects.group);
    this.batcher = new StaticBatcher(this.scene);

    progress(0.15, 'Loading materials & environment');
    await Promise.all([this.env.loadHDR('assets/environment/spruit_sunrise_1k.hdr'), this.materials.whenReady()]);
    progress(0.45, 'Loading 3D models');
    let loaded = 0; const urls = [...new Set(Object.values(TYPES).map((t) => t.model).filter(Boolean))].concat(['assets/models/ceiling_panel.glb', 'assets/models/animal_python.glb', 'assets/models/animal_gecko.glb', 'assets/models/animal_frog.glb', 'assets/models/ceiling_diffuser.glb']);
    await Promise.all(urls.map((u) => this.assets.load(u).then(() => progress(0.45 + 0.4 * (++loaded / urls.length), 'Loading 3D models'))));
    const frosted = this.materials.get('glass_frosted');
    this.lighting.register({ material: frosted, kind: 'window', baseEmissive: frosted.emissiveIntensity });
    this.syncDocument();
    this.lighting.setPreset(app.prefs.lighting);
    await this.objects.whenLoaded();
    progress(0.92, 'Compiling shaders');
    await this.precompile();
    progress(1, 'Ready');
    return this;
  }

  _registerPanelMaterial() {
    if (this._panelUnreg) this._panelUnreg();
    const m = this.shell.panelMaterial;
    if (m) this._panelUnreg = this.lighting.register({ material: m, kind: 'ceiling', baseEmissive: m.userData.base ??= m.emissiveIntensity });
  }

  /** Full rebuild of the views from the document (document load, or re-activation after edits elsewhere). */
  syncDocument() {
    const ed = this.app.editor;
    this.objects.syncAll();
    if (this.shell.build(ed.room, ed.objects)) this.lighting.build(ed.room, this.shell.panels);
    this.stale = false;
    this.engine.markShadowsDirty();
  }

  onChange(c) {
    const ed = this.app.editor;
    if (c.kind === 'document' || c.kind === 'room') this.objects.syncAll();
    else if (c.kind === 'remove') for (const id of c.ids) this.objects.remove(id);
    else for (const id of c.ids || []) { const o = ed.get(id); if (o) this.objects.sync(o); }
    const rebuilt = this.shell.build(ed.room, ed.objects);
    if (rebuilt) this.lighting.build(ed.room, this.shell.panels);
    this.engine.markShadowsDirty();
    return rebuilt;
  }

  setSelected(id, memberId = null) {
    const v = id && this.objects.get(id);
    const mem = memberId && v?.members?.get(memberId);
    this.engine.setSelection(mem ? [mem.node] : v ? v.outlineTargets() : []);
    if (v?.setSelected && getType(v.type)?.parametric) v.setSelected(false);
  }

  updateCutaway(force = false) {
    const app = this.app, cam = app.rig.camera.position;
    const { hiddenWalls, ceilingVisible } = this.shell.updateVisibility(app.editor.room, cam);
    const dir = app.rig.controls.target.clone().sub(cam).normalize();
    const changed = this.objects.setHiddenWalls(hiddenWalls, Math.abs(dir.y) < 0.55);
    this.env.update(cam, app.editor.room);
    if (changed || force) this.engine.invalidate();
    return { ceilingVisible };
  }

  activate() {
    if (this.stale) this.syncDocument();
    this.scene.add(this.app.overlay.group);
    this.engine.activate();
    this.lighting.setPreset(this.app.prefs.lighting);
  }
  deactivate() { this.engine.deactivate(); }

  setLighting(key) { this.lighting.setPreset(key); }
  setQuality(q) { this.engine.setQuality(q); this.lighting.apply(); }

  async precompile() {
    this.batcher.sync(this.objects.views.values(), this.app.detachedId);
    const t0 = performance.now();
    const wasActive = this.engine.active;
    try { await this.app.renderer.compileAsync(this.scene, this.app.rig.camera); } catch (e) { console.warn('[showcase] compileAsync failed', e); }
    if (wasActive) this.engine.warmup(); // post-processing chains, shadow & batching variants
    else this._needsWarmup = true;
    this.engine.stats.compileMs = Math.round(performance.now() - t0);
  }

  /** One animation frame (called only while this mode is active). */
  frame(now) {
    if (this._needsWarmup) { this._needsWarmup = false; this.engine.warmup(); }
    this.batcher.sync(this.objects.views.values(), this.app.detachedId);
    this.materials.update(now / 1000);
    return this.engine.frame(now);
  }

  diagRows() {
    const b = this.batcher.stats, pool = this.lighting.poolUsage();
    return [
      ['Static batches', `${b.batches} batches · ${b.instances} instances · ${b.rebuilds} rebuilds`],
      ['Light pool', `spot ${pool.spot} · point ${pool.point} · window ${pool.rect}`],
    ];
  }
}
