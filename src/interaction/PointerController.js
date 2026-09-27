import * as THREE from 'three';
import { getType } from '../objects/catalog.js';
import { createObject } from '../model/RoomDocument.js';
import { LAYER_SPECIAL } from '../assets/AssetManager.js';

const DRAG_THRESHOLD = 4; // px

/**
 * Viewport pointer handling: select, drag-move with live snapping, rotate via ring handle,
 * placement of new objects from the library (click-to-place and HTML drag & drop), hover feedback.
 * Registered in the capture phase so it can disable orbiting before OrbitControls sees the event.
 */
export class PointerController {
  constructor(app) {
    this.app = app;
    const el = app.viewportEl;
    this.el = el;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enableAll();
    this.ndc = new THREE.Vector2();
    this.state = null;      // {mode: 'pending'|'move'|'rotate', ...}
    this.placing = null;    // {type, view, cand}
    el.addEventListener('pointerdown', (e) => this.onDown(e), { capture: true });
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('dblclick', (e) => this.onDouble(e));
    el.addEventListener('dragover', (e) => this.onDragOver(e));
    el.addEventListener('dragleave', () => this._ghostVisible(false));
    el.addEventListener('drop', (e) => this.onDrop(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get editor() { return this.app.editor; }
  get camera() { return this.app.rig.camera; }

  _setRay(e) {
    const r = this.el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  pickObject(e) {
    this._setRay(e);
    const hits = this.raycaster.intersectObjects(this.app.objects.proxies(), false);
    if (!hits.length) return null;
    // prefer the smallest volume under the cursor among near-equal hits (terrarium on stand)
    const first = hits[0].distance;
    const close = hits.filter((h) => h.distance < first + 0.25);
    close.sort((a, b) => volume(a.object) - volume(b.object));
    return close[0].object.userData.objectId;
  }

  pickGizmo(e) {
    this._setRay(e);
    const hits = this.raycaster.intersectObjects(this.app.overlay.pickables(), false);
    return hits.length ? hits[0].object : null;
  }

  /** Intersect the pointer ray with a horizontal plane (world y) and return plan coordinates. */
  planPoint(e, y = 0) {
    this._setRay(e);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), p)) return null;
    const room = this.editor.room;
    return { x: p.x + room.width / 2, z: p.z + room.depth / 2 };
  }

  // ---------------------------------------------------------------- pointer events
  onDown(e) {
    if (e.button !== 0) return;
    this.app.rig.cancelAnimation();
    if (this.placing) { e.stopPropagation(); this.app.rig.controls.enabled = false; this.state = { mode: 'place-click', x: e.clientX, y: e.clientY }; return; }
    const g = this.pickGizmo(e);
    const sel = this.editor.selected;
    if (g && sel && !sel.mount && !sel.locked) {
      this.app.rig.controls.enabled = false;
      const c = this._objCenterWorld(sel);
      this.state = { mode: 'rotate', id: sel.id, center: c, start: this._angleAt(e, c), rot0: sel.rotation, pointerId: e.pointerId };
      this.editor.begin('Rotate');
      return;
    }
    const id = this.pickObject(e);
    if (id) {
      const o = this.editor.get(id);
      this.app.rig.controls.enabled = false;
      const y = this._dragPlaneY(o);
      const p = this.planPoint(e, y);
      this.state = { mode: 'pending', id, x: e.clientX, y: e.clientY, grab: p ? { x: p.x - o.position.x, z: p.z - o.position.z } : { x: 0, z: 0 }, planeY: y, wasSelected: this.editor.selection === id };
      this.editor.select(id);
    } else {
      this.state = { mode: 'orbit', x: e.clientX, y: e.clientY };
    }
  }

  onMove(e) {
    if (this.placing && !this.state) { this._updateGhost(e); return; }
    if (!this.state) { this._hover(e); return; }
    const s = this.state;
    if (s.mode === 'pending') {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD) return;
      const o = this.editor.get(s.id);
      if (!o || o.locked) { s.mode = 'none'; return; }
      s.mode = 'move';
      this.editor.begin('Move');
      this.app.setStatus('Moving — snapping to grid, walls & neighbours (hold Alt to disable)');
      this.el.classList.add('is-dragging');
    }
    if (s.mode === 'move') {
      const o = this.editor.get(s.id);
      const p = this.planPoint(e, s.planeY);
      if (!p || !o) return;
      const raw = { x: p.x - s.grab.x, z: p.z - s.grab.z };
      const snap = e.altKey ? { ...this.editor.snap, enabled: false } : this.editor.snap;
      const cand = this.editor.snapper.place(o, raw, { snap });
      this.editor.update(s.id, { position: cand.position, rotation: cand.rotation, elevation: cand.elevation, mount: cand.mount }, { record: false });
      s.cand = cand;
      this.app.overlay.showGuides(cand.guides);
      this.app.overlay.show(this.editor.get(s.id), { colliding: cand.collisions.length > 0, dragging: true });
      this.app.invalidate();
    } else if (s.mode === 'rotate') {
      const a = this._angleAt(e, s.center);
      let deg = s.rot0 + ((a - s.start) * 180) / Math.PI;
      const step = e.shiftKey ? 1 : this.editor.snap.enabled ? this.editor.snap.angle : 1;
      deg = Math.round(deg / step) * step;
      this.editor.update(s.id, { rotation: deg }, { record: false });
      const o = this.editor.get(s.id);
      this.app.overlay.show(o, { colliding: this.editor.snapper.collisions(o).length > 0, dragging: true });
      this.app.setStatus(`Rotation ${Math.round(o.rotation)}°  (Shift = free)`);
      this.app.invalidate();
    }
  }

  onUp(e) {
    const s = this.state;
    this.app.rig.controls.enabled = true;
    this.el.classList.remove('is-dragging');
    if (!s) return;
    this.state = null;
    if (s.mode === 'place-click') { this._commitPlacement(); return; }
    if (s.mode === 'move' || s.mode === 'rotate') {
      this.editor.commit();
      this.app.overlay.showGuides([]);
      this.app.refreshSelection();
      this.app.setStatus('');
      return;
    }
    if (s.mode === 'orbit' && Math.hypot(e.clientX - s.x, e.clientY - s.y) < DRAG_THRESHOLD && e.button === 0) {
      this.editor.select(null);
    }
  }

  onDouble(e) {
    const id = this.pickObject(e);
    if (id) { this.editor.select(id); this.app.focusSelected(); }
  }

  _hover(e) {
    if (e.target !== this.app.renderer.domElement && !this.el.contains(e.target)) return;
    if (this._hoverT && performance.now() - this._hoverT < 40) return;
    this._hoverT = performance.now();
    const g = this.pickGizmo(e);
    const id = g ? null : this.pickObject(e);
    this.el.style.cursor = g ? 'grab' : id ? 'pointer' : '';
    const o = id && this.editor.get(id);
    this.app.setHover(o || null);
  }

  _dragPlaneY(o) {
    const t = getType(o.type);
    if (t.placement === 'mounted' || t.placement === 'opening') return o.elevation + o.size.h / 2;
    return o.elevation;
  }

  _objCenterWorld(o) {
    const room = this.editor.room;
    return new THREE.Vector3(o.position.x - room.width / 2, o.elevation, o.position.z - room.depth / 2);
  }

  _angleAt(e, center) {
    this._setRay(e);
    const p = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -center.y), p);
    // rotation.y positive turns +z towards +x  => angle = atan2(dx, dz)
    return Math.atan2(p.x - center.x, p.z - center.z);
  }

  // ---------------------------------------------------------------- placement from the library
  startPlacement(type) {
    this.cancelPlacement();
    const obj = createObject(type, { id: '__ghost__' });
    const t = getType(type);
    if (t.placement === 'opening' || t.placement === 'mounted') obj.mount = { wall: 'north', offset: this.editor.room.width / 2 };
    const view = this.app.objects.createGhost(obj);
    this.placing = { type, obj, view };
    this.el.classList.add('is-placing');
    this.app.setStatus(`Placing ${t.label} — click to place, R to rotate, Esc to cancel`);
    this._ghostVisible(false);
  }

  cancelPlacement() {
    if (!this.placing) return;
    this.app.objects.removeGhost();
    this.placing = null;
    this.el.classList.remove('is-placing');
    this.app.overlay.hide();
    this.app.setStatus('');
    this.app.invalidate();
  }

  rotatePlacement(deg) { if (this.placing && !this.placing.obj.mount) { this.placing.obj.rotation = (this.placing.obj.rotation + deg + 360) % 360; if (this._lastEvt) this._updateGhost(this._lastEvt); } }

  _ghostVisible(v) { if (this.placing?.view) { this.placing.view.root.visible = v; this.app.invalidate(); } }

  _updateGhost(e) {
    const pl = this.placing; if (!pl) return;
    this._lastEvt = { clientX: e.clientX, clientY: e.clientY, altKey: e.altKey };
    const t = getType(pl.type);
    const y = t.placement === 'mounted' || t.placement === 'opening' ? pl.obj.elevation + pl.obj.size.h / 2 : 0;
    const p = this.planPoint(e, y);
    if (!p) return;
    const room = this.editor.room;
    const inside = p.x > -0.5 && p.z > -0.5 && p.x < room.width + 0.5 && p.z < room.depth + 0.5;
    this._ghostVisible(inside);
    if (!inside) { this.app.overlay.hide(); return; }
    const snap = e.altKey ? { ...this.editor.snap, enabled: false } : this.editor.snap;
    const cand = this.editor.snapper.place(pl.obj, p, { snap });
    Object.assign(pl.obj, { position: cand.position, rotation: cand.rotation, elevation: cand.elevation, mount: cand.mount });
    pl.cand = cand;
    pl.view.update(JSON.parse(JSON.stringify(pl.obj)));
    this.app.overlay.show(pl.obj, { colliding: cand.collisions.length > 0 });
    this.app.overlay.showGuides(cand.guides);
    this.app.invalidate();
  }

  _commitPlacement() {
    const pl = this.placing; if (!pl || !pl.cand) return;
    const { position, rotation, elevation, mount } = pl.obj;
    const type = pl.type;
    this.cancelPlacement();
    const o = this.editor.add(type, { position, rotation, elevation, mount });
    this.app.toast(`${getType(type).label} added`);
    return o;
  }

  onDragOver(e) {
    const type = this.app.draggingType;
    if (!type) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
    if (!this.placing || this.placing.type !== type) this.startPlacement(type);
    this._updateGhost(e);
  }

  onDrop(e) {
    e.preventDefault();
    if (!this.placing) return;
    this._updateGhost(e);
    this._commitPlacement();
    this.app.draggingType = null;
  }
}

function volume(m) { return m.scale.x * m.scale.y * m.scale.z; }
export { LAYER_SPECIAL };
