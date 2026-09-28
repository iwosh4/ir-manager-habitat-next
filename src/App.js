import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { createRenderer } from './renderer/quality.js';
import { CameraRig } from './camera/CameraRig.js';
import { Editor } from './editor/Editor.js';
import { SelectionOverlay } from './interaction/SelectionOverlay.js';
import { PointerController } from './interaction/PointerController.js';
import { Keyboard } from './interaction/Keyboard.js';
import { Persistence } from './serialization/Persistence.js';
import { getType } from './objects/catalog.js';
import { Toolbar } from './ui/Toolbar.js';
import { LibraryPanel } from './ui/LibraryPanel.js';
import { Inspector } from './ui/Inspector.js';
import { Hud } from './ui/Hud.js';
import { toast } from './ui/Toast.js';
import { PlannerMode } from './modes/PlannerMode.js';
import { ComparisonPanel } from './ui/ComparisonPanel.js';

export const DEMO_URL = 'data/demo-room.json';
export const RENDER_MODES = { planner: 'Planner', showcase: 'Showcase' };
export const PRESETS = { day: { label: 'Day' }, evening: { label: 'Evening' }, night: { label: 'Night' } };

/**
 * Application composition root: wires logical editor state to the 3D views and the UI.
 *
 * Two render modes share ONE RoomDocument, one editor, one camera and one WebGL canvas:
 *   PLANNER  (default) stylised hand-painted renderer — src/planner, src/modes/PlannerMode.js
 *   SHOWCASE approved realistic renderer — src/modes/ShowcaseMode.js, imported and loaded on first use
 * Each mode owns its own scene & views; the inactive one is marked stale and re-synced when shown.
 * `engine`, `scene`, `objects`, `batcher`, `shell` resolve to the active mode.
 */
export class App {
  constructor(root) {
    this.root = root;
    this.viewportEl = root.querySelector('#viewport');
    this.prefs = { quality: 'auto', lighting: 'day', library: true, inspector: true, dims: true, ...Persistence.prefs() };
    if (!this.prefs.qualityV2) { this.prefs.quality = 'auto'; Persistence.savePrefs({ quality: 'auto', qualityV2: true }); } // Auto becomes the default
    // URL overrides, e.g. ?quality=fast&lighting=night&view=top (useful for embedding and testing)
    const q = new URLSearchParams(location.search);
    for (const k of ['quality', 'lighting']) if (q.get(k)) this.prefs[k] = q.get(k);
    if (q.get('mode') in RENDER_MODES) this.prefs.renderMode = q.get('mode');
    if (!(this.prefs.renderMode in RENDER_MODES)) this.prefs.renderMode = 'planner';
    this.initialView = q.get('view');
    this.draggingType = null;
    this.errors = [];
    this.modes = {};
    this.mode = null;
  }

  // active-mode accessors (UI, picking and tests go through these)
  get engine() { return this.mode?.engine; }
  get scene() { return this.mode?.scene; }
  get objects() { return this.mode?.objects; }
  get batcher() { return this.mode?.batcher; }
  get shell() { return this.mode?.shell; }
  get renderMode() { return this.mode?.name; }
  get lighting() { return this.modes.showcase?.lighting || null; }
  get materials() { return this.modes.showcase?.materials || null; }
  get assets() { return this.modes.showcase?.assets || null; }
  get env() { return this.modes.showcase?.env || null; }

  async init(progress = () => {}) {
    progress(0.05, 'Starting renderer');
    this.renderer = createRenderer(this.viewportEl);
    this.rig = new CameraRig(this.renderer.domElement, () => this.engine?.interact());
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'label-layer';
    this.viewportEl.appendChild(this.labels.domElement);
    this.labels.setSize(this.viewportEl.clientWidth, this.viewportEl.clientHeight);
    this.editor = new Editor();
    // camera gestures drive the interactive render profile
    this.rig.controls.addEventListener('start', () => { this._controlsActive = true; });
    this.rig.controls.addEventListener('end', () => { this._controlsActive = false; this.engine?.interact(); });
    this.overlay = new SelectionOverlay(new THREE.Scene());
    this.persistence = new Persistence(this.editor);

    // the Planner is always available (tiny download); the Showcase is loaded only when requested
    const planner = new PlannerMode(this);
    await planner.init((p, m) => progress(0.05 + p * 0.3, m));
    this.modes.planner = planner;
    this.editor.on('change', (c) => this._onChange(c));
    this.editor.on('selection', () => this.refreshSelection());
    this.editor.on('history', () => this.toolbar?.updateHistory());

    progress(0.4, 'Opening room');
    const restored = this.persistence.restore();
    if (!restored) await this.loadDemo({ silent: true });
    this.rig.setRoom(this.editor.room); this.overlay.setRoom(this.editor.room);
    if (this.prefs.renderMode === 'showcase') {
      const sc = await this._loadShowcase((p, m) => progress(0.45 + p * 0.5, m));
      this._activate(sc || planner);
    } else this._activate(planner);

    this.pointer = new PointerController(this);
    this.keyboard = new Keyboard(this);
    this.toolbar = new Toolbar(this, this.root.querySelector('#toolbar'));
    this.library = new LibraryPanel(this, this.root.querySelector('#library'));
    this.inspector = new Inspector(this, this.root.querySelector('#inspector'));
    this.hud = new Hud(this, this.viewportEl);
    this.comparison = new ComparisonPanel(this, this.viewportEl);
    this.setPanel('library', this.prefs.library); this.setPanel('inspector', this.prefs.inspector);
    this.setDimensions(this.prefs.dims);

    const cam = Persistence.prefs().camera;
    if (this.initialView) this.rig.goTo(this.initialView, { instant: true });
    else if (restored && cam) this.rig.setState(cam); else this.rig.goTo('hero', { instant: true });
    this.refreshSelection();
    progress(0.96, 'Compiling shaders');
    await this.mode.precompile();
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

  // ------------------------------------------------------------------ document → views
  _onChange(c) {
    const room = this.editor.room;
    if (c.kind === 'document' || c.kind === 'room') { this.rig.setRoom(room); this.overlay.setRoom(room); }
    for (const m of Object.values(this.modes)) if (m !== this.mode) m.stale = true; // re-synced on activation
    if (!this.mode) return; // still starting: the first activation performs a full sync
    if (this.mode.onChange(c)) this._updateCutaway(true);
    this.refreshSelection();
    this.inspector?.refresh();
    this.hud?.refresh();
    if (this.pointer?.state || this.inspector?.typing) this.engine.interact();
  }

  refreshSelection() {
    const o = this.editor.selected;
    this.mode?.setSelected(o?.id || null);
    if (o && !this.pointer?.state) this.overlay.show(o, { colliding: this.editor.snapper.collisions(o).length > 0 });
    else if (!o && !this.pointer?.placing) this.overlay.hide();
    this.inspector?.refresh();
    this.toolbar?.updateSelection();
    this.invalidate();
  }

  // ------------------------------------------------------------------ render loop
  invalidate(ms = 0) { this.engine?.invalidate(ms); }

  _updateCutaway(force = false) {
    const { ceilingVisible } = this.mode.updateCutaway(force);
    this.overlay.setRoomDimsVisible(!ceilingVisible);
  }

  /** The selected object (or the one being dragged / edited) is drawn from its own meshes. */
  get detachedId() { return this.pointer?.state?.id || this.editor.selection || null; }

  // ------------------------------------------------------------------ render modes
  async _loadShowcase(progress = () => {}) {
    if (this.modes.showcase) return this.modes.showcase;
    this._showcaseLoading ||= (async () => {
      try {
        const { ShowcaseMode } = await import('./modes/ShowcaseMode.js');
        const sc = new ShowcaseMode(this);
        await sc.init(progress);
        sc.stale = true; // edits made while it was loading are picked up on activation
        this.modes.showcase = sc;
        return sc;
      } catch (e) {
        console.error('[showcase] failed to load', e);
        toast(`Showcase renderer unavailable: ${e.message}`, 'error');
        return null;
      } finally { this._showcaseLoading = null; }
    })();
    return this._showcaseLoading;
  }

  _activate(m) {
    if (this.mode === m) return;
    this.mode?.deactivate();
    this.mode = m;
    m.activate();
    this.overlay.setRoom(this.editor.room);
    this.root.dataset.renderMode = m.name;
    this._updateCutaway(true);
    this.refreshSelection();
    this.engine.invalidate();
  }

  /**
   * Switch between PLANNER and SHOWCASE. Pure view change: the RoomDocument, object ids, transforms,
   * selection, undo history and camera are untouched.
   */
  async setRenderMode(name) {
    if (!(name in RENDER_MODES)) return false;
    this.prefs.renderMode = name; Persistence.savePrefs({ renderMode: name });
    if (this.mode?.name === name) { this.toolbar?.updateMode(); return true; }
    let m = this.modes[name];
    if (!m && name === 'showcase') {
      this.hud?.showLoading('Loading Showcase renderer…', 0);
      m = await this._loadShowcase((p, msg) => this.hud?.showLoading(msg, p));
      this.hud?.hideLoading();
      if (!m) { this.prefs.renderMode = this.mode.name; this.toolbar?.updateMode(); return false; }
    }
    if (this.prefs.renderMode !== name) return false; // user switched again while loading
    this._activate(m);
    this.toolbar?.updateMode();
    this.toolbar?.updateLighting();
    this.hud?.refreshStats();
    return true;
  }

  _loop() {
    let frames = 0, t0 = performance.now();
    const tick = (now) => {
      requestAnimationFrame(tick);
      this.rig.update(now);
      const drag = this.pointer?.state?.mode;
      this.engine.interacting = !!this._controlsActive || this.rig.animating || drag === 'move' || drag === 'rotate';
      if (!this.engine.needsFrame) { this.hud?.tick(now); return; }
      this._updateCutaway();
      if (this.mode.frame(now)) {
        this.labels.render(this.scene, this.rig.camera);
        frames++;
      }
      if (now - t0 > 500) { this.engine.stats.fps = Math.round((frames * 1000) / (now - t0)); frames = 0; t0 = now; this.hud?.refreshStats(); }
    };
    requestAnimationFrame(tick);
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

  setQuality(q) { for (const m of Object.values(this.modes)) m.setQuality(q); this.prefs.quality = q; Persistence.savePrefs({ quality: q }); }
  setLighting(key) {
    if (!(key in PRESETS)) return;
    this.prefs.lighting = key; Persistence.savePrefs({ lighting: key });
    for (const m of Object.values(this.modes)) m.setLighting(key);
    this.toolbar?.updateLighting();
  }
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

  /** SHOWCASE vs PLANNER for the current camera (diagnostics panel → "Compare"). */
  openComparison() { return this.comparison.open(); }

  setStatus(text) { this.hud?.setStatus(text); }
  setHover(o) { this.hud?.setHover(o); }
  toast(msg, kind) { toast(msg, kind); }
  typeOf(o) { return getType(o.type); }
  get lightingPresets() { return PRESETS; }
}
