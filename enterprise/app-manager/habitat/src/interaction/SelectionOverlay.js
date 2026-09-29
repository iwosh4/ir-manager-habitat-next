import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { LAYER_SPECIAL } from '../renderer/layers.js';
import { getType } from '../objects/catalog.js';
import { footprint } from '../editor/Snapping.js';

const AMBER = 0xf0a04b, RED = 0xe0483a;

function label(cls = 'dim-label') {
  const el = document.createElement('div'); el.className = cls;
  const o = new CSS2DObject(el); o.center.set(0.5, 0.5);
  return o;
}
const fmtCm = (m) => `${Math.round(m * 100)} cm`;

function special(o) { o.traverse((c) => { c.layers.set(LAYER_SPECIAL); c.renderOrder = 10; }); return o; }

/**
 * Selection & editing annotations drawn in the 3D scene:
 * footprint frame, rotation ring + handle, dimension labels, wall clearance guides, snap guides,
 * and room dimensions. Everything lives on the "special" layer (no AO / outline interference).
 */
export class SelectionOverlay {
  constructor(scene) {
    this.group = new THREE.Group(); this.group.name = 'overlay';
    scene.add(this.group);
    const mat = (c, o = 0.95) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, toneMapped: false });
    this.matFrame = mat(AMBER); this.matFill = mat(AMBER, 0.1); this.matFill.depthTest = true; this.matFill.polygonOffset = true; this.matFill.polygonOffsetFactor = -2; this.matRing = mat(AMBER, 0.55); this.matHandle = mat(AMBER, 1);
    this.matGuide = new THREE.LineDashedMaterial({ color: AMBER, dashSize: 0.05, gapSize: 0.035, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false });
    this.matWall = mat(AMBER, 0.85);

    this.sel = new THREE.Group(); this.group.add(this.sel);
    this.frame = new THREE.Mesh(new THREE.BufferGeometry(), this.matFrame);
    this.fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.matFill);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96).rotateX(-Math.PI / 2), this.matRing);
    this.handle = new THREE.Mesh(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), this.matHandle);
    this.handleHit = new THREE.Mesh(new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ visible: false }));
    this.handle.userData.gizmo = 'rotate'; this.handleHit.userData.gizmo = 'rotate';
    this.arrow = new THREE.Mesh(this._arrowGeo(), this.matHandle);
    this.sel.add(this.fill, this.frame, this.ring, this.handle, this.handleHit, this.arrow);
    this.lblW = label(); this.lblD = label(); this.lblH = label('dim-label dim-h');
    this.sel.add(this.lblW, this.lblD, this.lblH);
    this.clear = new THREE.Group(); this.group.add(this.clear);
    this.clearLines = []; this.clearLabels = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]), this.matGuide);
      const lb = label('dim-label dim-clear'); this.clear.add(l, lb); this.clearLines.push(l); this.clearLabels.push(lb);
    }
    this.guides = new THREE.Group(); this.group.add(this.guides);
    this.roomDims = new THREE.Group(); this.group.add(this.roomDims);
    this.lblRoomW = label('dim-label dim-room'); this.lblRoomD = label('dim-label dim-room');
    this.roomDims.add(this.lblRoomW, this.lblRoomD);
    special(this.group);
    this.sel.visible = false; this.clear.visible = false;
    this.showDimensions = true;
  }

  _arrowGeo() {
    const s = new THREE.Shape();
    s.moveTo(-0.35, 0); s.lineTo(0, 0.55); s.lineTo(0.35, 0); s.lineTo(0.12, 0); s.lineTo(0.12, -0.3); s.lineTo(-0.12, -0.3); s.lineTo(-0.12, 0);
    return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
  }

  setRoom(room) {
    this.room = room;
    const W = room.width, D = room.depth;
    this.lblRoomW.position.set(0, 0.02, -D / 2 - room.wallThickness - 0.25);
    this.lblRoomW.element.textContent = `${W.toFixed(2)} m`;
    this.lblRoomD.position.set(-W / 2 - room.wallThickness - 0.25, 0.02, 0);
    this.lblRoomD.element.textContent = `${D.toFixed(2)} m`;
  }

  /** Update the selection annotations for a (possibly candidate) object state. */
  show(obj, { colliding = false, dragging = false } = {}) {
    if (!obj || !this.room) { this.hide(); return; }
    const room = this.room, t = getType(obj.type);
    const W = room.width, D = room.depth;
    const world = (p) => new THREE.Vector3(p.x - W / 2, 0, p.z - D / 2);
    const col = colliding ? RED : AMBER;
    this.matFrame.color.setHex(col); this.matFill.color.setHex(col); this.matHandle.color.setHex(col); this.matRing.color.setHex(col);
    const isWall = t.placement === 'opening' || t.placement === 'mounted';
    const depth = t.placement === 'opening' ? room.wallThickness + 0.04 : obj.size.d;
    const pos = world(obj.position);
    const baseY = t.placement === 'opening' || t.placement === 'mounted' ? 0.006 : Math.max(0.006, obj.elevation + 0.004);
    this.sel.position.set(pos.x, baseY, pos.z);
    this.sel.rotation.y = (obj.rotation * Math.PI) / 180;
    // footprint frame (5 cm wide corner-accented rectangle)
    const w = obj.size.w, d = depth, k = 0.012;
    const shape = new THREE.Shape(); shape.moveTo(-w / 2 - k, -d / 2 - k); shape.lineTo(w / 2 + k, -d / 2 - k); shape.lineTo(w / 2 + k, d / 2 + k); shape.lineTo(-w / 2 - k, d / 2 + k);
    const hole = new THREE.Path(); hole.moveTo(-w / 2, -d / 2); hole.lineTo(-w / 2, d / 2); hole.lineTo(w / 2, d / 2); hole.lineTo(w / 2, -d / 2); shape.holes.push(hole);
    this.frame.geometry.dispose(); this.frame.geometry = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    this.fill.scale.set(w, 1, d);
    const r = Math.hypot(w, d) / 2 + 0.14;
    this.ring.scale.set(r, 1, r); this.ring.visible = !isWall && !obj.locked;
    this.handle.scale.setScalar(0.045); this.handle.position.set(0, 0.001, r);
    this.handleHit.scale.setScalar(0.11); this.handleHit.position.set(0, 0.001, r);
    this.arrow.scale.setScalar(0.07); this.arrow.position.set(0, 0.002, d / 2 + 0.07);
    this.handle.visible = this.handleHit.visible = this.ring.visible;
    // dimension labels
    const showDims = this.showDimensions;
    this.lblW.visible = this.lblD.visible = this.lblH.visible = showDims;
    this.lblW.position.set(0, 0.01, d / 2 + 0.16); this.lblW.element.textContent = fmtCm(obj.size.w);
    this.lblD.position.set(w / 2 + 0.16, 0.01, 0); this.lblD.element.textContent = fmtCm(obj.size.d);
    this.lblH.position.set(-w / 2, obj.size.h + (isWall ? obj.elevation : 0) - baseY + 0.06, d / 2);
    this.lblH.element.textContent = `H ${fmtCm(obj.size.h)}${obj.elevation > 0.005 ? ` · +${fmtCm(obj.elevation)}` : ''}`;
    this.sel.visible = true;
    // wall clearances (axis-aligned objects on the floor)
    this._clearances(obj, isWall);
    this.dragging = dragging;
  }

  _clearances(obj, isWall) {
    const room = this.room; const W = room.width, D = room.depth;
    const show = this.showDimensions && !isWall && obj.rotation % 90 === 0;
    this.clear.visible = show;
    if (!show) return;
    const fp = footprint(obj);
    const minX = Math.min(...fp.map((p) => p.x)), maxX = Math.max(...fp.map((p) => p.x));
    const minZ = Math.min(...fp.map((p) => p.z)), maxZ = Math.max(...fp.map((p) => p.z));
    const y = 0.01, cx = obj.position.x, cz = obj.position.z;
    const segs = [
      [[0, cz], [minX, cz], minX], [[maxX, cz], [W, cz], W - maxX],
      [[cx, 0], [cx, minZ], minZ], [[cx, maxZ], [cx, D], D - maxZ],
    ];
    segs.forEach(([a, b, dist], i) => {
      const line = this.clearLines[i], lb = this.clearLabels[i];
      const vis = dist > 0.03;
      line.visible = lb.visible = vis;
      if (!vis) return;
      line.geometry.setFromPoints([new THREE.Vector3(a[0] - W / 2, y, a[1] - D / 2), new THREE.Vector3(b[0] - W / 2, y, b[1] - D / 2)]);
      line.computeLineDistances();
      lb.position.set((a[0] + b[0]) / 2 - W / 2, y, (a[1] + b[1]) / 2 - D / 2);
      lb.element.textContent = fmtCm(dist);
    });
  }

  showGuides(guides = []) {
    this.guides.clear();
    if (!this.room) return;
    const W = this.room.width, D = this.room.depth;
    for (const g of guides) {
      if (g.kind !== 'wall') continue;
      const len = g.wall === 'north' || g.wall === 'south' ? W : D;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.025).rotateX(-Math.PI / 2), this.matWall);
      if (g.wall === 'north') m.position.set(0, 0.008, -D / 2 + 0.0125);
      if (g.wall === 'south') m.position.set(0, 0.008, D / 2 - 0.0125);
      if (g.wall === 'west') { m.rotation.y = Math.PI / 2; m.position.set(-W / 2 + 0.0125, 0.008, 0); }
      if (g.wall === 'east') { m.rotation.y = Math.PI / 2; m.position.set(W / 2 - 0.0125, 0.008, 0); }
      special(m); this.guides.add(m);
    }
  }

  setRoomDimsVisible(v) { this.roomDims.visible = v && this.showDimensions; }

  hide() { this.sel.visible = false; this.clear.visible = false; this.guides.clear(); }

  /** Gizmo meshes used for picking (rotation handle). */
  pickables() { return this.sel.visible && this.handleHit.visible ? [this.handleHit, this.ring] : []; }
}
