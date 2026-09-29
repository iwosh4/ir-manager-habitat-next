import * as THREE from 'three';
import { getType } from '../objects/catalog.js';
import { assemblyLayout } from '../assembly/AssemblyLayout.js';
import { collectPorts, autoRoute, snapWaypoint, enclosureEndpoints, routePath, pathLength, ROUTE_KINDS, TECH_LAYERS } from './Network.js';
import { TechLayer } from './TechLayer.js';

/** Which TECH PLAN layer a room object belongs to. */
const CAT_LAYER = { water: 'water', misting: 'misting', drainage: 'drainage', electrical: 'electrical', sensors: 'sensors', enclosures: 'enclosures', breeding: 'enclosures' };
export function objectLayer(o) {
  if (o.type === 'assembly' || o.type === 'custom_enclosure') return 'enclosures';
  return CAT_LAYER[getType(o.type)?.category] || 'room';
}

/**
 * TECH PLAN (Habitat Studio 4.2): a third view of the SAME document — the Planner renderer with the room
 * subdued (`uTech` grade) and the technical network on top. Owns the TechLayer, the layer toggles, the
 * route editor (pick source port → pick destination port → auto path → drag / add / delete waypoints with
 * wall + axis snapping) and circuit helpers. Routes also show in PLANNER / SHOWCASE when mode = visible.
 */
export class TechController {
  constructor(app) {
    this.app = app;
    this.layer = new TechLayer();
    this.active = false;
    this.layers = new Set(Object.keys(TECH_LAYERS));
    this.selectedRoute = null;
    this.pick = null;         // { step: 'from' | 'to', kind, mode, from }
    this.drag = null;
    this.dirty = true;
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    app.editor.on('change', () => { this.dirty = true; });
  }

  // ------------------------------------------------------------------ data
  ports() {
    const ed = this.app.editor;
    return collectPorts(ed.doc, { getType, lib: ed.lib, layout: assemblyLayout });
  }

  attach(scene) { if (scene && this.layer.group.parent !== scene) scene.add(this.layer.group); this.dirty = true; }

  /** Rebuild visuals if the document changed (called by the app loop before a frame). */
  update(force = false) {
    if (!this.dirty && !force) return false;
    this.dirty = false;
    const ed = this.app.editor;
    this.layer.techPlan = this.active;
    this.layer.layers = this.layers;
    this.layer.selectedRoute = this.selectedRoute;
    this.layer.highlightPorts = this.pick ? new Set([...this.ports()].filter(([, p]) => p.kind === this.pick.kind && (this.pick.step === 'from' ? p.dir !== 'in' : p.dir !== 'out')).map(([k]) => k)) : null;
    this.layer.visibleOwner = (objectId) => { const o = ed.get(objectId); return !o || this.layers.has(objectLayer(o)) || this.layers.has(portLayerOfObject(o)); };
    this.layer.build({ room: ed.room, network: ed.network, ports: this.ports() });
    this.app.invalidate?.();
    return true;
  }

  // ------------------------------------------------------------------ mode
  setActive(on) {
    this.active = !!on;
    const pm = this.app.modes.planner;
    pm.mats.setTech(on ? 1 : 0);
    this._applyFilter();
    this.app.root.dataset.techPlan = on ? '1' : '';
    if (!on) { this.pick = null; this.selectedRoute = null; }
    this.dirty = true;
    this.app.techPanel?.setVisible(on);
    this.app.invalidate();
  }

  setLayer(id, on) {
    on ? this.layers.add(id) : this.layers.delete(id);
    this._applyFilter();
    this.dirty = true; this.app.techPanel?.refresh(); this.app.invalidate();
  }

  _applyFilter() {
    const on = this.active;
    for (const m of Object.values(this.app.modes)) {
      m.objects?.setFilter(on ? (o) => this.layers.has(objectLayer(o)) : null);
      if (m.shell?.group) m.shell.group.visible = !on || this.layers.has('room');
    }
  }

  // ------------------------------------------------------------------ route / circuit operations (UI + tests)
  selectRoute(id) { this.selectedRoute = id; this.layer.activeHandle = -1; this.dirty = true; this.app.techPanel?.refresh(); this.app.invalidate(); }

  /** New route between two ports ({owner, port}); waypoints generated along the walls. */
  createRoute({ kind, from, to, mode = 'visible', name = '', circuitId = null, note = '' }) {
    const ports = this.ports();
    const a = ports.get(`${from.owner}:${from.port}`), b = ports.get(`${to.owner}:${to.port}`);
    const ed = this.app.editor;
    const points = a && b ? autoRoute(ed.room, a.pos, b.pos, { kind, mode }) : [];
    const r = ed.addRoute({ kind, from, to, mode, points, name: name || `${a?.ownerName || from.owner} → ${b?.ownerName || to.owner}`, circuitId, note });
    this.selectRoute(r.id);
    return r;
  }

  reroute(id) {
    const ed = this.app.editor, r = ed.getRoute(id); if (!r) return null;
    const ports = this.ports();
    const a = r.from && ports.get(`${r.from.owner}:${r.from.port}`), b = r.to && ports.get(`${r.to.owner}:${r.to.port}`);
    if (!a || !b) return r;
    return ed.updateRoute(id, { points: autoRoute(ed.room, a.pos, b.pos, { kind: r.kind, mode: r.mode }) });
  }

  /** Insert a waypoint in the middle of the leg nearest to `plan` (or the longest leg). */
  addWaypoint(id, plan = null) {
    const ed = this.app.editor, r = ed.getRoute(id); if (!r) return;
    const path = routePath(r, this.ports());
    const hasFrom = !!(r.from && path.length > r.points.length);
    let best = -1, bestD = Infinity;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1], b = path[i];
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
      const d = plan ? Math.hypot(m.x - plan.x, m.z - plan.z) : -Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0) return;
    const a = path[best - 1], b = path[best];
    const p = plan ? { x: plan.x, y: (a.y + b.y) / 2, z: plan.z } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const idx = Math.max(0, Math.min(r.points.length, best - (hasFrom ? 1 : 0)));
    const pts = [...r.points]; pts.splice(idx, 0, p);
    ed.updateRoute(id, { points: pts });
    this.layer.activeHandle = idx;
  }

  deleteWaypoint(id, i) {
    const ed = this.app.editor, r = ed.getRoute(id); if (!r || i < 0 || i >= r.points.length) return;
    ed.updateRoute(id, { points: r.points.filter((_, k) => k !== i) });
    this.layer.activeHandle = -1;
  }

  setWaypoint(id, i, p, { snap = true, record = true } = {}) {
    const ed = this.app.editor, r = ed.getRoute(id); if (!r) return;
    const path = routePath(r, this.ports()), off = r.from && path.length > r.points.length ? 1 : 0;
    const prev = path[i + off - 1], next = path[i + off + 1];
    const q = snap ? snapWaypoint(ed.room, p, prev, next, { inWall: r.mode === 'in_wall' }) : p;
    const pts = r.points.map((x, k) => (k === i ? q : x));
    ed.updateRoute(id, { points: pts }, { record });
  }

  /** Routes source → each destination enclosure of a circuit (existing ones are kept). */
  generateCircuitRoutes(circuitId, { mode = 'visible' } = {}) {
    const ed = this.app.editor, c = ed.getCircuit(circuitId); if (!c?.source) return [];
    const ports = this.ports();
    const destPort = c.kind === 'mist' ? 'MIST_IN' : c.kind === 'water' ? 'WATER_IN' : c.kind === 'drain' ? 'DRAIN_OUT' : c.kind === 'power' ? 'POWER' : 'TEMP_SENSOR';
    const made = [];
    for (const d of c.destinations) {
      if (ed.network.routes.some((r) => r.circuitId === c.id && (r.to?.owner === d || r.from?.owner === d))) continue;
      const dp = { owner: d, port: destPort };
      if (!ports.has(`${d}:${destPort}`)) continue;
      const drain = c.kind === 'drain'; // drainage flows FROM the enclosure TO the source (drain point)
      made.push(this.createRoute({ kind: c.kind, from: drain ? dp : c.source, to: drain ? c.source : dp, mode, circuitId: c.id }));
    }
    return made;
  }

  /** Summary rows for the panel / tests. */
  routeInfo(r, ports = this.ports()) {
    const path = routePath(r, ports);
    const a = r.from && ports.get(`${r.from.owner}:${r.from.port}`), b = r.to && ports.get(`${r.to.owner}:${r.to.port}`);
    return { id: r.id, kind: r.kind, mode: r.mode, name: r.name, from: a ? `${a.ownerName} · ${r.from.port}` : '—', to: b ? `${b.ownerName} · ${r.to.port}` : '—', length: pathLength(path), connected: !!(a && b), fromPortId: a?.portId, toPortId: b?.portId };
  }

  // ------------------------------------------------------------------ pointer (route editor in the viewport)
  _setRay(e) {
    const el = this.app.renderer.domElement, r = el.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.app.rig.camera);
  }

  /** @returns true when the event was consumed (port pick, waypoint drag) */
  onPointerDown(e) {
    if (!this.active || e.button !== 0) return false;
    this._setRay(e);
    if (this.layer.handleMeshes.length) {
      const h = this.raycaster.intersectObjects(this.layer.handleMeshes, false)[0];
      if (h) {
        const i = h.object.userData.waypoint;
        this.layer.activeHandle = i;
        this.drag = { i, y: h.object.position.y, vertical: e.shiftKey, x0: e.clientY, route: this.selectedRoute };
        this.app.editor.begin('Move waypoint');
        this.app.rig.controls.enabled = false;
        this.dirty = true; this.app.techPanel?.refresh();
        return true;
      }
    }
    if (this.pick) {
      const hit = this.raycaster.intersectObjects(this.layer.portPick, false)[0];
      if (hit) { this.pickPort(hit.object.userData.portKeys[hit.instanceId]); return true; }
      return false;
    }
    const rh = this.raycaster.intersectObjects(this.layer.routeMeshes, false)[0];
    if (rh) { this.selectRoute(rh.object.userData.routeId); return true; }
    return false;
  }

  onPointerMove(e) {
    if (!this.drag) return false;
    this._setRay(e);
    const room = this.app.editor.room, r = this.app.editor.getRoute(this.drag.route); if (!r) return true;
    const cur = r.points[this.drag.i];
    let p;
    if (this.drag.vertical) { // Shift: move vertically (camera-facing plane through the waypoint)
      const w = TechLayer.world(room, cur);
      const n = this.app.rig.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      const hit = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane().setFromNormalAndCoplanarPoint(n, w), hit)) return true;
      p = { x: cur.x, y: Math.max(0, Math.min(room.height, hit.y)), z: cur.z };
    } else {
      const hit = new THREE.Vector3();
      if (!this.raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.drag.y), hit)) return true;
      p = { x: hit.x + room.width / 2, y: cur.y, z: hit.z + room.depth / 2 };
    }
    this.setWaypoint(this.drag.route, this.drag.i, p, { snap: !e.altKey, record: false });
    return true;
  }

  onPointerUp() {
    if (!this.drag) return false;
    this.drag = null;
    this.app.editor.commit();
    this.app.rig.controls.enabled = true;
    return true;
  }

  onDouble(e) {
    if (!this.active || !this.selectedRoute) return false;
    this._setRay(e);
    const rh = this.raycaster.intersectObjects(this.layer.routeMeshes.filter((m) => m.userData.routeId === this.selectedRoute), false)[0];
    if (!rh) return false;
    const room = this.app.editor.room;
    this.addWaypoint(this.selectedRoute, { x: rh.point.x + room.width / 2, z: rh.point.z + room.depth / 2 });
    return true;
  }

  onKey(e) {
    if (!this.active) return false;
    const k = e.key.toLowerCase();
    if ((k === 'delete' || k === 'backspace') && this.selectedRoute && this.layer.activeHandle >= 0) { this.deleteWaypoint(this.selectedRoute, this.layer.activeHandle); return true; }
    if (k === 'escape' && (this.pick || this.selectedRoute)) { this.pick = null; this.selectRoute(null); return true; }
    return false;
  }

  // ------------------------------------------------------------------ add-route workflow
  startRoute(kind, mode = 'visible') { this.pick = { step: 'from', kind, mode }; this.selectedRoute = null; this.dirty = true; this.app.techPanel?.refresh(); this.app.setStatus?.(`New ${ROUTE_KINDS[kind].label} route — click the SOURCE port (or choose it in the panel)`); }
  cancelPick() { this.pick = null; this.dirty = true; this.app.techPanel?.refresh(); }
  pickPort(key) {
    if (!this.pick || !key) return;
    const [owner, ...rest] = key.split(':'), ref = { owner, port: rest.join(':') };
    if (this.pick.step === 'from') { this.pick = { ...this.pick, step: 'to', from: ref }; this.app.setStatus?.('Now click the DESTINATION port'); }
    else { const { kind, mode, from } = this.pick; this.pick = null; this.createRoute({ kind, from, to: ref, mode }); this.app.setStatus?.('Route created — drag the white waypoints, double-click the route to add one'); }
    this.dirty = true; this.app.techPanel?.refresh();
  }

  endpoints() { return enclosureEndpoints(this.ports()); }

  // ------------------------------------------------------------------ demo network
  /**
   * Adds a complete example: RO tank → misting pump → filter → pressure regulator → manifold → solenoid →
   * misting circuit to the enclosures; drains of the enclosures to a drain point (in wall); power from the
   * electrical panel; a temperature sensor to the controller. Uses the enclosures already in the room.
   */
  loadDemoNetwork() {
    const ed = this.app.editor, room = ed.room;
    ed.begin('Technical demo');
    try {
      const W = room.width;
      const add = (type, patch) => ed.add(type, patch);
      const ro = add('ro_tank', { position: { x: W - 0.35, z: room.depth - 0.4 } });
      const pump = add('misting_pump', { position: { x: W - 0.85, z: room.depth - 0.3 } });
      const filt = add('mist_filter', { position: { x: W - 1.15, z: room.depth - 0.25 } });
      const man = add('manifold', { mount: { wall: 'east', offset: room.depth - 1.0 }, elevation: 1.9 });
      const sol = add('solenoid_valve', { mount: { wall: 'east', offset: room.depth - 1.4 }, elevation: 1.9 });
      const drain = add('drain_point', { mount: { wall: 'south', offset: 0.6 }, elevation: 0.25 });
      const ctrl = add('controller', { mount: { wall: 'east', offset: room.depth - 2.0 }, elevation: 1.3 });
      const probe = add('temp_probe', { position: { x: W / 2, z: room.depth / 2 } });
      ed.select(null);
      const R = (kind, from, to, mode = 'visible') => this.createRoute({ kind, from, to, mode });
      R('water', { owner: ro.id, port: 'WATER_OUT' }, { owner: pump.id, port: 'WATER_IN' });
      R('mist', { owner: pump.id, port: 'MIST_OUT' }, { owner: filt.id, port: 'IN' });
      R('mist', { owner: filt.id, port: 'OUT' }, { owner: man.id, port: 'IN' }, 'in_wall');
      R('mist', { owner: man.id, port: 'OUT_1' }, { owner: sol.id, port: 'IN' });
      R('power', { owner: ctrl.id, port: 'POWER_OUT_3' }, { owner: sol.id, port: 'POWER' }, 'in_wall');
      R('power', { owner: ctrl.id, port: 'POWER_OUT_4' }, { owner: pump.id, port: 'POWER' }, 'in_wall');
      R('signal', { owner: probe.id, port: 'SIGNAL_OUT' }, { owner: ctrl.id, port: 'SENSOR_1' }, 'hidden');
      const encs = this.endpoints().slice(0, 4).map((x) => x.owner);
      const mist = ed.addCircuit({ name: 'Misting circuit 1', kind: 'mist', source: { owner: sol.id, port: 'OUT' }, destinations: encs, note: 'RO → pump → filter → manifold → solenoid → enclosures' });
      this.generateCircuitRoutes(mist.id);
      const dr = ed.addCircuit({ name: 'Drainage 1', kind: 'drain', source: { owner: drain.id, port: 'DRAIN_IN' }, destinations: encs.slice(0, 3), note: 'Branches along the walls to the drain point' });
      this.generateCircuitRoutes(dr.id, { mode: 'in_wall' });
      this.selectRoute(null);
    } finally { ed.commit(); }
  }
}

function portLayerOfObject(o) { const t = getType(o.type); const k = t?.ports && Object.values(t.ports)[0]?.kind; return k ? ROUTE_KINDS[k].layer : 'room'; }
