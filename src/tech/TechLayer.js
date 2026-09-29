import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { ROUTE_KINDS, routePath } from './Network.js';

/**
 * 3D representation of the technical network (Habitat Studio 4.2). One-way: network data → visuals.
 *
 *  TECH PLAN   every enabled route of an active layer: coloured tubes with flow arrows (direction from →
 *              to), IN-WALL routes drawn through the wall (no depth test, bright), HIDDEN routes faint;
 *              port markers on every device / enclosure, labels, waypoint handles of the edited route
 *  PLANNER /   only VISIBLE routes, as calm neutral pipes (no arrows, no markers) — IN-WALL and HIDDEN
 *  SHOWCASE    routes never distract the normal views
 *
 * Geometry per route is merged into one mesh (tube legs + joints + arrows); materials are shared per kind.
 */
const KIND_LAYER = Object.fromEntries(Object.entries(ROUTE_KINDS).map(([k, v]) => [k, v.layer]));
const UP = new THREE.Vector3(0, 1, 0);

export class TechLayer {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'tech-layer';
    this.routesGroup = new THREE.Group(); this.portsGroup = new THREE.Group(); this.handlesGroup = new THREE.Group(); this.labelsGroup = new THREE.Group();
    this.group.add(this.routesGroup, this.portsGroup, this.handlesGroup, this.labelsGroup);
    this.mats = new Map();
    this.techPlan = false;
    this.layers = new Set(['room', 'enclosures', 'water', 'misting', 'drainage', 'electrical', 'sensors']);
    this.portPick = [];         // instanced meshes of port markers (pickable)
    this.handleMeshes = [];     // waypoint handles of the selected route
    this.routeMeshes = [];
    this.selectedRoute = null; this.activeHandle = -1; this.highlightPorts = null;
  }

  _mat(kind, variant) {
    const key = `${kind}|${variant}`;
    let m = this.mats.get(key);
    if (m) return m;
    const col = new THREE.Color(ROUTE_KINDS[kind]?.color || '#ffffff');
    if (variant === 'neutral') m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#9da1a8').lerp(col, 0.18) });
    else if (variant === 'inwall') m = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color('#ffffff'), 0.25), depthTest: false, transparent: true, opacity: 0.95 });
    else if (variant === 'hidden') m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false });
    else if (variant === 'selected') m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb057'), depthTest: false, transparent: true });
    else if (variant === 'disabled') m = new THREE.MeshBasicMaterial({ color: new THREE.Color('#5a5c60'), transparent: true, opacity: 0.6 });
    else m = new THREE.MeshBasicMaterial({ color: col });
    this.mats.set(key, m);
    return m;
  }

  /** World position of a plan point. */
  static world(room, p) { return new THREE.Vector3(p.x - room.width / 2, p.y, p.z - room.depth / 2); }

  /**
   * Rebuild from the network.
   * @param ctx { room, network, ports (collectPorts map), techPlan, layers, selectedRoute, visibleOwner(fn) }
   */
  build({ room, network, ports }) {
    this._clear();
    this.room = room; this.ports = ports; this.network = network;
    const tp = this.techPlan;
    for (const r of network.routes) {
      const layer = KIND_LAYER[r.kind];
      if (tp && !this.layers.has(layer)) continue;
      if (!tp && (r.mode !== 'visible' || !r.enabled)) continue;
      const pts = routePath(r, ports).map((p) => TechLayer.world(room, p));
      if (pts.length < 2) continue;
      const sel = tp && r.id === this.selectedRoute;
      const radius = (ROUTE_KINDS[r.kind]?.radius || 0.01) * (tp ? 1.25 : 1) * (sel ? 1.4 : 1);
      const geo = routeGeometry(pts, radius, { arrows: tp && r.enabled, arrowStep: 0.35 });
      const variant = !tp ? 'neutral' : sel ? 'selected' : !r.enabled ? 'disabled' : r.mode === 'in_wall' ? 'inwall' : r.mode === 'hidden' ? 'hidden' : 'normal';
      const mesh = new THREE.Mesh(geo, this._mat(r.kind, variant));
      mesh.renderOrder = variant === 'inwall' || variant === 'selected' ? 20 : 5;
      mesh.userData.routeId = r.id; mesh.name = `route:${r.id}`;
      this.routesGroup.add(mesh); this.routeMeshes.push(mesh);
      if (tp && r.mode === 'in_wall') { // in-wall highlight: a soft halo so it reads as "inside the wall"
        const halo = new THREE.Mesh(routeGeometry(pts, radius * 2.4, { arrows: false }), this._halo(r.kind));
        halo.renderOrder = 19; this.routesGroup.add(halo);
      }
    }
    if (tp) { this._buildPorts(); this._buildHandles(); this._buildLabels(); }
  }

  _halo(kind) {
    const key = `${kind}|halo`;
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(ROUTE_KINDS[kind].color), transparent: true, opacity: 0.18, depthTest: false, depthWrite: false }));
    return this.mats.get(key);
  }

  _buildPorts() {
    const byKind = new Map();
    const connected = new Set();
    for (const r of this.network.routes) for (const e of [r.from, r.to]) if (e) connected.add(`${e.owner}:${e.port}`);
    for (const [key, p] of this.ports) {
      if (!this.layers.has(KIND_LAYER[p.kind])) continue;
      if (p.ownerKind === 'enclosure' && !this.layers.has('enclosures')) continue;
      if (this.visibleOwner && !this.visibleOwner(p.objectId)) continue;
      if (!byKind.has(p.kind)) byKind.set(p.kind, []);
      byKind.get(p.kind).push({ key, p, on: connected.has(key) });
    }
    const geo = new THREE.SphereGeometry(1, 10, 8);
    const m4 = new THREE.Matrix4();
    for (const [kind, list] of byKind) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(ROUTE_KINDS[kind].color), depthTest: false, transparent: true, opacity: 0.95 });
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.renderOrder = 30;
      list.forEach(({ p, on, key }, i) => {
        const hi = this.highlightPorts?.has(key);
        const s = hi ? 0.035 : on ? 0.022 : 0.015;
        m4.compose(TechLayer.world(this.room, p.pos), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
        im.setMatrixAt(i, m4);
      });
      im.userData.portKeys = list.map((x) => x.key);
      im.name = `ports:${kind}`;
      this.portsGroup.add(im); this.portPick.push(im);
    }
  }

  _buildHandles() {
    const r = this.selectedRoute && this.network.routes.find((x) => x.id === this.selectedRoute);
    if (!r) return;
    const geo = new THREE.SphereGeometry(0.03, 12, 10);
    r.points.forEach((p, i) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: i === this.activeHandle ? '#ffb057' : '#ffffff', depthTest: false, transparent: true }));
      m.position.copy(TechLayer.world(this.room, p)); m.renderOrder = 40;
      m.userData.waypoint = i; m.name = `wp:${i}`;
      this.handlesGroup.add(m); this.handleMeshes.push(m);
    });
  }

  _buildLabels() {
    // one label per device / enclosure that takes part in a route (keeps the plan readable)
    const owners = new Map();
    for (const r of this.network.routes) {
      if (!this.layers.has(KIND_LAYER[r.kind])) continue;
      for (const e of [r.from, r.to]) {
        const p = e && this.ports.get(`${e.owner}:${e.port}`); if (!p || owners.has(e.owner)) continue;
        owners.set(e.owner, p);
      }
    }
    for (const [, p] of owners) {
      const el = document.createElement('div'); el.className = `tech-label ${p.ownerKind}`;
      el.textContent = p.ownerName;
      const o = new CSS2DObject(el); o.center.set(0.5, 1.6);
      o.position.copy(TechLayer.world(this.room, p.pos));
      this.labelsGroup.add(o);
    }
  }

  setVisible(v) { this.group.visible = v; for (const o of this.labelsGroup.children) o.element.style.display = v ? '' : 'none'; }

  _clear() {
    for (const g of [this.routesGroup, this.portsGroup, this.handlesGroup]) {
      g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (g !== this.routesGroup) o.material.dispose(); } });
      g.clear();
    }
    for (const o of this.labelsGroup.children) o.element.remove();
    this.labelsGroup.clear();
    this.portPick = []; this.handleMeshes = []; this.routeMeshes = [];
  }

  stats() { return { routes: this.routeMeshes.length, ports: this.portPick.reduce((a, m) => a + m.count, 0), handles: this.handleMeshes.length }; }
}

/** Tube legs + joint spheres (+ flow arrows) along a polyline, merged into one geometry. */
export function routeGeometry(pts, r, { arrows = false, arrowStep = 0.35 } = {}) {
  const parts = [];
  const q = new THREE.Quaternion();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = b.clone().sub(a), len = d.length(); if (len < 1e-4) continue;
    const g = new THREE.CylinderGeometry(r, r, len, 8, 1, true);
    q.setFromUnitVectors(UP, d.clone().normalize());
    g.applyQuaternion(q); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts.push(g);
    if (arrows) {
      const n = Math.max(1, Math.floor(len / arrowStep));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const c = new THREE.ConeGeometry(r * 2.4, r * 5, 8);
        c.applyQuaternion(q);
        const p = a.clone().lerp(b, t);
        c.translate(p.x, p.y, p.z);
        parts.push(c);
      }
    }
  }
  for (const p of pts) { const s = new THREE.SphereGeometry(r * 1.15, 8, 6); s.translate(p.x, p.y, p.z); parts.push(s); }
  // normalise attributes (cone / cylinder / sphere all have position, normal, uv)
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  for (const g of parts) g.dispose();
  return geo || new THREE.BufferGeometry();
}
