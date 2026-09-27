import * as THREE from 'three';
import { getType } from './catalog.js';
import { LAYER_SPECIAL } from '../assets/AssetManager.js';

const DEG = Math.PI / 180;
const SWITCHABLE = new Set(['led_warm', 'led_cool', 'uvb_tube', 'bulb_hot']);
const ANIMALS = { python: 'assets/models/animal_python.glb', gecko: 'assets/models/animal_gecko.glb', frog: 'assets/models/animal_frog.glb' };

/**
 * Visual binding of ONE logical object.
 *
 *  root (placed from logical position / rotation / elevation)
 *   ├─ proxy   invisible unit box scaled to the logical size — picking & collision volume
 *   ├─ visual  GLB clone fitted into the logical box (never read back into data)
 *   └─ extras  lights created from model anchors, animal models, placeholders
 */
export class ObjectView {
  constructor(obj, ctx) {
    this.ctx = ctx; // { assets, materials, lighting, room(), onReady(view) }
    this.id = obj.id;
    this.type = obj.type;
    this.root = new THREE.Group(); this.root.name = `object:${obj.id}`; this.root.userData.objectId = obj.id;
    this.proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.proxy.geometry.translate(0, 0.5, 0);
    this.proxy.userData.objectId = obj.id; this.proxy.name = 'proxy';
    this.root.add(this.proxy);
    this.visual = null; this.info = null; this.missing = false;
    this.extras = new THREE.Group(); this.extras.name = 'extras'; this.root.add(this.extras);
    this.unregister = [];
    this.obj = null;
    this.loading = this._load(obj);
  }

  async _load(obj) {
    const t = getType(obj.type);
    const res = await this.ctx.assets.instantiate(t.model);
    if (this.disposed) return;
    if (!res) { this.missing = true; this._placeholder(); }
    else {
      this.visual = res.root; this.info = res.info; this.visual.name = 'visual';
      this.root.add(this.visual);
      this._prepareMaterials();
    }
    const o = this.obj || obj; this.obj = null;
    this.update(o, true);
    this.ctx.onReady && this.ctx.onReady(this);
  }

  _prepareMaterials() {
    this.switchable = [];
    this.labels = [];
    this.visual.traverse((m) => {
      if (!m.isMesh) return;
      const slot = m.userData.slot;
      if (SWITCHABLE.has(slot)) { m.material = m.material.clone(); this.switchable.push(m.material); }
      if (slot === 'label') { m.material = m.material.clone(); this.labels.push(m.material); }
    });
  }

  _placeholder() {
    const g = new THREE.Group(); g.name = 'visual';
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const fill = new THREE.Mesh(box, this.ctx.materials.get('ghost'));
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0xe8913a }));
    const cross = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5), new THREE.Vector3(0.5, 0, -0.5), new THREE.Vector3(-0.5, 1, 0.5),
    ]), new THREE.LineBasicMaterial({ color: 0xe8913a }));
    g.add(fill, edges, cross);
    g.userData.placeholder = true;
    this.visual = g; this.root.add(g);
  }

  /** Apply logical state. Cheap for transform-only changes; refits lights/anchors on size or prop changes. */
  update(obj, force = false) {
    if (!this.visual) { this.obj = obj; return; }
    const room = this.ctx.room();
    const prev = this.last;
    this.last = JSON.parse(JSON.stringify(obj));
    const t = getType(obj.type);
    // transform
    this.root.position.set(obj.position.x - room.width / 2, obj.elevation, obj.position.z - room.depth / 2);
    this.root.rotation.y = obj.rotation * DEG;
    const w = obj.size.w, d = t.placement === 'opening' ? room.wallThickness : obj.size.d, h = obj.size.h;
    this.proxy.scale.set(w, h, d);
    const sizeChanged = force || !prev || prev.size.w !== obj.size.w || prev.size.d !== obj.size.d || prev.size.h !== obj.size.h || this._lastT !== room.wallThickness;
    this._lastT = room.wallThickness;
    if (sizeChanged) this._fit(obj, t, w, h, d);
    const propsChanged = force || sizeChanged || JSON.stringify(prev?.props) !== JSON.stringify(obj.props) || prev?.name !== obj.name;
    if (propsChanged) this._applyState(obj, t);
  }

  _fit(obj, t, w, h, d) {
    if (this.visual.userData.placeholder) { this.visual.scale.set(w, h, d); this.scale = new THREE.Vector3(w, h, d); return; }
    const n = this.info.nativeSize || [w, h, d];
    let s;
    if (t.fit === 'uniform') { const k = h / n[1]; s = new THREE.Vector3(k, k, k); } else s = new THREE.Vector3(w / n[0], h / n[1], d / n[2]);
    this.visual.scale.copy(s);
    this.scale = s;
  }

  /** Lights, emissives, labels and animals depend on props (occupied / lighting / animal). */
  _applyState(obj, t) {
    for (const u of this.unregister) u();
    this.unregister = [];
    this.extras.clear();
    if (!this.visual || this.visual.userData.placeholder) return;
    const occupied = obj.props?.occupied !== false;
    const lit = t.enclosure ? occupied && obj.props?.lighting !== false : true;
    const s = this.scale;
    const anchors = [];
    this.visual.traverse((o) => { if (o.userData?.anchor) anchors.push(o); });
    for (const a of anchors) {
      const d = a.userData; const pos = a.position.clone().multiply(s);
      if (d.light === 'rect') {
        // Enclosure / task lighting: range-limited spot lights (a RectAreaLight cannot be occluded and
        // would leak through cabinets onto the floor). Wide fixtures get two spots.
        const kind = d.always ? 'task' : 'enclosure';
        const width = (d.width ?? 0.5) * s.x, depth = (d.height ?? 0.3) * s.z;
        const drop = Math.max(0.2, (d.drop ?? 0.4) * s.y); // light -> lit surface (enclosure floor)
        const reach = d.reach ?? (d.always ? 1.4 : drop * 1.7);
        const n = width > 0.75 ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const l = new THREE.SpotLight(d.color ?? 0xffffff, 0, reach, Math.min(1.2, Math.atan2(Math.max(width / n, depth) * 0.75, drop * 0.55)), 0.9, 1.0);
          const x = n === 1 ? 0 : (i - 0.5) * width * 0.5;
          l.position.set(pos.x + x, pos.y, pos.z);
          l.target.position.set(pos.x + x, pos.y - 1, pos.z);
          this.extras.add(l, l.target);
          // constant target illuminance on the enclosure floor: I = E * d^2
          const base = d.always ? (d.intensity ?? 5) * 0.9 : ((d.intensity ?? 7) / 7) * 18 * drop * drop / Math.sqrt(n);
          this.unregister.push(this.ctx.lighting.register({ light: l, kind, base, enabled: kind === 'task' ? true : lit }));
        }
      } else if (d.light === 'point') {
        const l = new THREE.PointLight(d.color ?? 0xffa050, d.intensity ?? 0.3, d.distance ?? 0.6, 2);
        l.position.copy(pos); this.extras.add(l);
        this.unregister.push(this.ctx.lighting.register({ light: l, kind: 'enclosure', base: d.intensity ?? 0.3, enabled: lit }));
      } else if (d.light === 'window') {
        const l = new THREE.RectAreaLight(0xe4ecff, 7, (d.width ?? 1) * s.x, (d.height ?? 1) * s.y);
        l.position.set(pos.x, pos.y, 0.02); l.rotation.y = Math.PI;
        this.extras.add(l);
        this.unregister.push(this.ctx.lighting.register({ light: l, kind: 'window', base: 7 }));
      } else if (a.name.startsWith('animal_spot') && occupied && d.animal && ANIMALS[d.animal]) {
        this._addAnimal(d, pos);
      }
    }
    for (const m of this.switchable || []) this.unregister.push(this.ctx.lighting.register({ material: m, kind: 'enclosure', baseEmissive: m.emissiveIntensity > 0 ? (m.userData.base ??= m.emissiveIntensity) : (m.userData.base ?? 6), enabled: lit }));
    this._drawLabels(obj, t);
  }

  async _addAnimal(d, pos) {
    const res = await this.ctx.assets.instantiate(ANIMALS[d.animal]);
    if (!res || this.disposed) return;
    const a = res.root; a.position.copy(pos); a.rotation.y = d.yaw ?? (pos.x * 7) % 6.28;
    if (d.onBranch) a.rotation.z = 0.35;
    this.extras.add(a);
    this.ctx.onReady && this.ctx.onReady(this, true);
  }

  _drawLabels(obj, t) {
    if (!this.labels?.length) return;
    const c = document.createElement('canvas'); c.width = 256; c.height = 96;
    const g = c.getContext('2d');
    const quarantine = t.enclosure === 'quarantine';
    const occupied = obj.props?.occupied !== false;
    g.fillStyle = '#f3f0e8'; g.fillRect(0, 0, 256, 96);
    g.fillStyle = quarantine ? '#c2410c' : occupied ? '#e08a2c' : '#8a8f96'; g.fillRect(0, 0, 18, 96);
    g.fillStyle = '#16171a'; g.font = 'bold 34px "Segoe UI", Roboto, Arial, sans-serif';
    g.fillText(occupied ? (obj.props?.animal?.code || obj.name).slice(0, 12) : 'EMPTY', 30, 44);
    g.font = 'italic 20px "Segoe UI", Roboto, Arial, sans-serif'; g.fillStyle = '#4a4c50';
    g.fillText((quarantine ? 'QUARANTINE · ' : '') + (occupied ? (obj.props?.animal?.species || t.label) : t.label).slice(0, 24), 30, 76);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    for (const m of this.labels) { m.map?.dispose(); m.map = tex; m.color.set(0xffffff); m.needsUpdate = true; }
  }

  setHidden(hidden) { this.root.visible = !hidden; }

  /** Meshes used for the selection outline (skip light helpers and extras). */
  outlineTargets() { return this.visual ? [this.visual] : []; }

  dispose() {
    this.disposed = true;
    for (const u of this.unregister) u();
    this.unregister = [];
    this.proxy.geometry.dispose();
    for (const m of [...(this.switchable || []), ...(this.labels || [])]) { m.map?.dispose?.(); m.dispose(); }
    this.root.removeFromParent();
  }
}

export { LAYER_SPECIAL };
