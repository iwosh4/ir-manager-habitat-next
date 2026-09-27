import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RenderEngine } from './renderer/RenderEngine.js';
import { EnvironmentSystem } from './renderer/Environment.js';
import { MaterialLibrary } from './assets/MaterialLibrary.js';
import { AssetManager } from './assets/AssetManager.js';
import { RoomShell } from './scene/RoomShell.js';
import { Lighting, PRESETS } from './scene/Lighting.js';
import { CameraRig } from './camera/CameraRig.js';
import { Editor } from './editor/Editor.js';
import { ObjectLayer } from './objects/ObjectLayer.js';
import { SelectionOverlay } from './interaction/SelectionOverlay.js';
import { PointerController } from './interaction/PointerController.js';
import { Keyboard } from './interaction/Keyboard.js';
import { Persistence } from './serialization/Persistence.js';
import { TYPES, getType } from './objects/catalog.js';
import { Toolbar } from './ui/Toolbar.js';
import { LibraryPanel } from './ui/LibraryPanel.js';
import { Inspector } from './ui/Inspector.js';
import { Hud } from './ui/Hud.js';
import { toast } from './ui/Toast.js';

export const DEMO_URL = 'data/demo-room.json';

/** Application composition root: wires logical editor state to the 3D views and the UI. */
export class App {
  constructor(root) {
    this.root = root;
    this.viewportEl = root.querySelector('#viewport');
    this.prefs = { quality: 'high', lighting: 'day', library: true, inspector: true, dims: true, ...Persistence.prefs() };
    // URL overrides, e.g. ?quality=fast&lighting=night&view=top (useful for embedding and testing)
    const q = new URLSearchParams(location.search);
    for (const k of ['quality', 'lighting']) if (q.get(k)) this.prefs[k] = q.get(k);
    this.initialView = q.get('view');
    this.draggingType = null;
    this.errors = [];
  }

  async init(progress = () => {}) {
    progress(0.05, 'Starting renderer');
    this.engine = new RenderEngine(this.viewportEl, { quality: this.prefs.quality });
    this.renderer = this.engine.renderer;
    this.scene = new THREE.Scene();
    this.rig = new CameraRig(this.renderer.domElement, () => this.invalidate());
    this.engine.attach(this.scene, this.rig.camera);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    this.viewportEl.appendChild(this.labels.domElement);
    this.engine.onResize = (w, h) => this.labels.setSize(w, h);
    this.labels.setSize(this.viewportEl.clientWidth, this.viewportEl.clientHeight);

    this.materials = new MaterialLibrary(this.renderer, { onError: (url) => this._assetError(url, 'texture') });
    this.assets = new AssetManager(this.materials, { onError: (url, msg) => this._assetError(url, msg) });
    this.env = new EnvironmentSystem(this.renderer, this.scene);
    this.lighting = new Lighting(this.scene, this.engine);
    this.lighting.onApply = (p) => { this.env.build(p); this.env.setExteriorLevel(p.exterior); };
    this.shell = new RoomShell(this.materials, this.assets);
    this.shell.onPanelsReady = () => { this._registerPanelMaterial(); this.invalidate(); };
    this.scene.add(this.shell.group);
    this.editor = new Editor();
    this.objects = new ObjectLayer(this.editor, {
      assets: this.assets, materials: this.materials, lighting: this.lighting,
      room: () => this.editor.room,
      onReady: () => { this.refreshSelection(); this.invalidate(); },
    });
    this.scene.add(this.objects.group);
    this.overlay = new SelectionOverlay(this.scene);
    this.persistence = new Persistence(this.editor);

    progress(0.15, 'Loading materials & environment');
    await Promise.all([this.env.loadHDR('assets/environment/spruit_sunrise_1k.hdr'), this.materials.whenReady()]);

    progress(0.45, 'Loading 3D models');
    let loaded = 0; const urls = [...new Set(Object.values(TYPES).map((t) => t.model))].concat(['assets/models/ceiling_panel.glb', 'assets/models/animal_python.glb', 'assets/models/animal_gecko.glb', 'assets/models/animal_frog.glb', 'assets/models/ceiling_diffuser.glb']);
    await Promise.all(urls.map((u) => this.assets.load(u).then(() => progress(0.45 + 0.4 * (++loaded / urls.length), 'Loading 3D models'))));

    const frosted = this.materials.get('glass_frosted');
    this.lighting.register({ material: frosted, kind: 'window', baseEmissive: frosted.emissiveIntensity });
    this.editor.on('change', (c) => this._onChange(c));
    this.editor.on('selection', () => this.refreshSelection());
    this.editor.on('history', () => this.toolbar?.updateHistory());

    progress(0.88, 'Opening room');
    const restored = this.persistence.restore();
    if (!restored) await this.loadDemo({ silent: true });
    this.lighting.setPreset(this.prefs.lighting);

    this.pointer = new PointerController(this);
    this.keyboard = new Keyboard(this);
    this.toolbar = new Toolbar(this, this.root.querySelector('#toolbar'));
    this.library = new LibraryPanel(this, this.root.querySelector('#library'));
    this.inspector = new Inspector(this, this.root.querySelector('#inspector'));
    this.hud = new Hud(this, this.viewportEl);
    this.setPanel('library', this.prefs.library); this.setPanel('inspector', this.prefs.inspector);
    this.setDimensions(this.prefs.dims);

    const cam = Persistence.prefs().camera;
    if (this.initialView) this.rig.goTo(this.initialView, { instant: true });
    else if (restored && cam) this.rig.setState(cam); else this.rig.goTo('hero', { instant: true });
    this.refreshSelection();
    await this.objects.whenLoaded();
    progress(1, 'Ready');
    this._loop();
    window.addEventListener('beforeunload', () => { this.persistence.autosave(); Persistence.savePrefs({ camera: this.rig.getState() }); });
    setInterval(() => Persistence.savePrefs({ camera: this.rig.getState() }), 3000);
    if (restored) toast('Restored your last session (autosave)');
    return this;
  }

  _assetError(url, msg) {
    this.errors.push({ url, msg });
    toast(`Missing asset: ${url.split('/').pop()} — using placeholder`, 'warn');
  }

  _registerPanelMaterial() {
    if (this._panelUnreg) this._panelUnreg();
    const m = this.shell.panelMaterial;
    if (m) this._panelUnreg = this.lighting.register({ material: m, kind: 'ceiling', baseEmissive: m.userData.base ??= m.emissiveIntensity });
  }

  // ------------------------------------------------------------------ document → views
  _onChange(c) {
    const room = this.editor.room;
    if (c.kind === 'document' || c.kind === 'room') {
      this.rig.setRoom(room);
      this.overlay.setRoom(room);
      this.objects.syncAll();
    } else if (c.kind === 'remove') {
      for (const id of c.ids) this.objects.remove(id);
    } else {
      for (const id of c.ids || []) { const o = this.editor.get(id); if (o) this.objects.sync(o); }
    }
    if (this.shell.build(room, this.editor.objects)) {
      this.lighting.build(room, this.shell.panels);
      this._updateCutaway(true);
    }
    this.refreshSelection();
    this.inspector?.refresh();
    this.hud?.refresh();
    this.invalidate();
  }

  refreshSelection() {
    const o = this.editor.selected;
    const v = o && this.objects.get(o.id);
    this.engine.setSelection(v ? v.outlineTargets() : []);
    if (o && !this.pointer?.state) this.overlay.show(o, { colliding: this.editor.snapper.collisions(o).length > 0 });
    else if (!o && !this.pointer?.placing) this.overlay.hide();
    this.inspector?.refresh();
    this.toolbar?.updateSelection();
    this.invalidate();
  }

  // ------------------------------------------------------------------ render loop
  invalidate(ms = 0) { this.engine?.invalidate(ms); }

  _updateCutaway(force = false) {
    const cam = this.rig.camera.position;
    const { hiddenWalls, ceilingVisible } = this.shell.updateVisibility(this.editor.room, cam);
    const dir = this.rig.controls.target.clone().sub(cam).normalize();
    const changed = this.objects.setHiddenWalls(hiddenWalls, Math.abs(dir.y) < 0.55);
    this.env.update(cam, this.editor.room);
    this.overlay.setRoomDimsVisible(!ceilingVisible);
    if (changed || force) this.engine.invalidate();
  }

  _loop() {
    let frames = 0, t0 = performance.now();
    const tick = () => {
      requestAnimationFrame(tick);
      this.rig.update();
      if (!this.engine.needsFrame) return;
      this._updateCutaway();
      this.materials.update(performance.now() / 1000);
      this.engine.render();
      this.labels.render(this.scene, this.rig.camera);
      frames++;
      const now = performance.now();
      if (now - t0 > 1000) { this.engine.stats.fps = Math.round((frames * 1000) / (now - t0)); frames = 0; t0 = now; this.hud?.refreshStats(); }
    };
    tick();
  }

  // ------------------------------------------------------------------ actions (used by UI & keyboard)
  async loadDemo({ silent = false } = {}) {
    try {
      const res = await fetch(DEMO_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this.editor.load(await res.json(), { reason: 'demo' });
      if (!silent) { toast('Demo room loaded'); this.rig.goTo('hero'); }
    } catch (e) {
      console.warn('[demo] could not load demo room', e);
      this.editor.load({ room: this.editor.room, objects: [] }, { reason: 'empty' });
      toast('Demo room unavailable — started an empty room', 'warn');
    }
  }

  newRoom() {
    this.editor.load({ room: { name: 'New room', width: 5, depth: 4, height: 2.7, wallThickness: 0.14 }, objects: [] }, { reason: 'new' });
    this.rig.goTo('iso');
    toast('New empty room');
  }

  exportJSON() { this.persistence.exportJSON(); toast('Room exported as JSON'); }

  async importFile(file) {
    try {
      await this.persistence.importFile(file);
      const skipped = this.editor.doc.meta.skippedTypes;
      toast(`Imported “${this.editor.room.name}” — ${this.editor.objects.length} objects${skipped?.length ? `, ${skipped.length} unknown skipped` : ''}`);
      this.rig.goTo('hero');
    } catch (e) {
      toast(`Import failed: ${e.message}`, 'error');
    }
  }

  deleteSelected() { const o = this.editor.selected; if (o) { this.editor.remove(o.id); toast(`Deleted ${o.name}`); } }
  duplicateSelected() { const o = this.editor.selected; if (o) this.editor.duplicate(o.id); }
  rotateSelected(deg) { const o = this.editor.selected; if (o && !o.mount) this.editor.rotateBy(o.id, deg); }
  nudgeSelected(dx, dz) {
    const o = this.editor.selected; if (!o) return;
    if (o.mount) this.editor.update(o.id, { mount: { ...o.mount, offset: o.mount.offset + (dx || dz) } });
    else this.editor.update(o.id, { position: { x: o.position.x + dx, z: o.position.z + dz } });
  }

  focusSelected() {
    const o = this.editor.selected; const v = o && this.objects.get(o.id);
    if (!v) { this.rig.goTo('hero'); return; }
    const box = new THREE.Box3().setFromObject(v.proxy);
    const a = (o.rotation * Math.PI) / 180;
    const front = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const cur = this.rig.camera.position.clone().sub(this.rig.controls.target).setY(0).normalize();
    const dir = front.multiplyScalar(0.75).add(cur.multiplyScalar(0.25)).normalize();
    dir.y = 0.42; dir.normalize();
    this.rig.focusBox(box, { direction: dir });
  }

  setView(name) { this.rig.goTo(name); }

  setQuality(q) { this.engine.setQuality(q); this.prefs.quality = q; Persistence.savePrefs({ quality: q }); this.lighting.apply(); }
  setLighting(key) { this.lighting.setPreset(key); this.prefs.lighting = key; Persistence.savePrefs({ lighting: key }); this.toolbar?.updateLighting(); }
  setPanel(which, open) {
    this.prefs[which] = open; Persistence.savePrefs({ [which]: open });
    this.root.classList.toggle(`no-${which}`, !open);
    this.toolbar?.updatePanels();
    requestAnimationFrame(() => this.engine.resize());
  }
  setDimensions(v) { this.prefs.dims = v; this.overlay.showDimensions = v; Persistence.savePrefs({ dims: v }); this.refreshSelection(); this._updateCutaway(true); this.toolbar?.updateSnap(); }

  toggleFullscreen() {
    const el = this.root;
    if (!document.fullscreenElement) { (el.requestFullscreen?.() || Promise.reject()).catch(() => this.root.classList.toggle('pseudo-fullscreen')); this.root.classList.add('is-fullscreen'); }
    else { document.exitFullscreen?.(); this.root.classList.remove('is-fullscreen'); }
    setTimeout(() => this.engine.resize(), 120);
  }

  setStatus(text) { this.hud?.setStatus(text); }
  setHover(o) { this.hud?.setHover(o); }
  toast(msg, kind) { toast(msg, kind); }
  typeOf(o) { return getType(o.type); }
  get lightingPresets() { return PRESETS; }
}
