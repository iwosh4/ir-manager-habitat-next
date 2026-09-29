import { ROUTE_KINDS, ROUTE_MODES, TECH_LAYERS, PORT_KINDS, circuitSummary } from '../tech/Network.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const opts = (o, v) => Object.entries(o).map(([k, l]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(l)}</option>`).join('');
const LAYER_COLOR = { room: '#8a8f98', enclosures: '#e8913a', water: ROUTE_KINDS.water.color, misting: ROUTE_KINDS.mist.color, drainage: ROUTE_KINDS.drain.color, electrical: ROUTE_KINDS.power.color, sensors: ROUTE_KINDS.signal.color };

/**
 * TECH PLAN side panel (floating in the viewport while the Tech Plan is active):
 * layers · add route (type → source port → destination port → auto path) · routes with waypoint editor ·
 * circuits (name, id, source, destinations, note, enabled, generate routes).
 */
export class TechPanel {
  constructor(app, viewport) {
    this.app = app;
    const el = document.createElement('div'); el.className = 'tech-panel'; el.hidden = true;
    viewport.appendChild(el);
    this.el = el;
    this.circuit = null;
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onChange(e));
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    app.editor.on('change', () => this.refresh());
  }

  get tech() { return this.app.tech; }
  setVisible(v) { this.el.hidden = !v; if (v) this.refresh(); }

  refresh() {
    if (this.el.hidden) return;
    if (this.el.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=number],textarea')) return;
    const t = this.tech, ed = this.app.editor, net = ed.network, ports = t.ports();
    const portOptions = (kind, dirNot, sel) => {
      const groups = new Map();
      for (const [k, p] of ports) { if (p.kind !== kind || p.dir === dirNot) continue; if (!groups.has(p.ownerName)) groups.set(p.ownerName, []); groups.get(p.ownerName).push([k, p]); }
      return `<option value="">— port —</option>${[...groups].map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(([k, p]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(p.port)} · ${esc(p.label)}</option>`).join('')}</optgroup>`).join('')}`;
    };
    const layers = Object.entries(TECH_LAYERS).map(([id, l]) => `<button class="layer ${t.layers.has(id) ? 'on' : ''}" data-layer="${id}"><i style="background:${LAYER_COLOR[id]}"></i>${esc(l)}</button>`).join('');
    const pick = t.pick;
    const newRoute = pick ? `<div class="tp-pick"><b>${pick.step === 'from' ? '1 · Source port' : '2 · Destination port'}</b> <span>${ROUTE_KINDS[pick.kind].label} · ${ROUTE_MODES[pick.mode]}</span>
        <select data-pickport="1">${portOptions(pick.kind, pick.step === 'from' ? 'in' : 'out')}</select>
        <p class="hint">Click a glowing port in the room, or choose it here.</p><button data-tp="cancel-pick">Cancel</button></div>`
      : `<div class="tp-row"><select data-new="kind">${opts(Object.fromEntries(PORT_KINDS.map((k) => [k, ROUTE_KINDS[k].label])), this.newKind || 'mist')}</select><select data-new="mode">${opts(ROUTE_MODES, this.newMode || 'visible')}</select><button class="primary" data-tp="new-route">+ Route</button></div>`;
    const routes = net.routes.filter((r) => t.layers.has(ROUTE_KINDS[r.kind].layer));
    const routeRows = routes.map((r) => {
      const info = t.routeInfo(r, ports), sel = r.id === t.selectedRoute;
      let row = `<div class="tp-route ${sel ? 'sel' : ''} ${r.enabled ? '' : 'off'}" data-route="${r.id}"><i style="background:${ROUTE_KINDS[r.kind].color}"></i><b>${esc(r.name || r.id)}</b><em>${ROUTE_MODES[r.mode]} · ${info.length.toFixed(2)} m${info.connected ? '' : ' · ⚠ open end'}</em></div>`;
      if (sel) row += this.routeEditor(r, info, portOptions);
      return row;
    }).join('') || '<p class="hint">No routes on the active layers.</p>';
    const circuits = net.circuits.map((c) => {
      const s = circuitSummary(c, ports, net.routes), sel = c.id === this.circuit;
      let row = `<div class="tp-circuit ${sel ? 'sel' : ''} ${c.enabled ? '' : 'off'}" data-circuit="${c.id}"><span class="code">${esc(c.code)}</span><b>${esc(c.name)}</b><em>${esc(s.source)} → ${s.destinations.length} enclosures · ${s.routes} routes</em></div>`;
      if (sel) row += this.circuitEditor(c, s, portOptions);
      return row;
    }).join('') || '<p class="hint">No circuits yet.</p>';
    this.el.innerHTML = `
      <div class="tp-head">${icon('pipe')}<span>Tech plan</span><em>${net.routes.length} routes · ${net.circuits.length} circuits</em></div>
      <section><h5>Layers</h5><div class="tp-layers">${layers}</div></section>
      <section><h5>New route</h5>${newRoute}</section>
      <section class="tp-list"><h5>Routes</h5>${routeRows}</section>
      <section class="tp-list"><h5>Circuits <button class="link" data-tp="new-circuit">+ circuit</button></h5>${circuits}</section>
      <div class="tp-foot"><button data-tp="demo" title="Adds RO tank → misting pump → filter → manifold → solenoid → misting circuit, drainage to a drain point, power and a sensor">Load example network</button></div>`;
  }

  routeEditor(r, info, portOptions) {
    const wp = r.points.map((p, i) => `<div class="wp ${i === this.tech.layer.activeHandle ? 'on' : ''}"><span>${i + 1}</span>${['x', 'y', 'z'].map((a) => `<input type="number" step="0.05" data-wp="${i}" data-axis="${a}" value="${p[a].toFixed(2)}">`).join('')}<button class="link" data-tp="wp-del" data-i="${i}" title="Delete waypoint">×</button></div>`).join('');
    const circuits = { '': '— none —', ...Object.fromEntries(this.app.editor.network.circuits.map((c) => [c.id, `${c.code} · ${c.name}`])) };
    return `<div class="tp-edit">
      <label class="fld fld-wide"><span>Name</span><input type="text" data-r="name" value="${esc(r.name)}"></label>
      <div class="grid2"><label class="fld"><span>Type</span><select data-r="kind">${opts(Object.fromEntries(PORT_KINDS.map((k) => [k, ROUTE_KINDS[k].label])), r.kind)}</select></label>
      <label class="fld"><span>Route mode</span><select data-r="mode">${opts(ROUTE_MODES, r.mode)}</select></label></div>
      <label class="fld fld-wide"><span>From</span><select data-r="from">${portOptions(r.kind, 'in', r.from ? `${r.from.owner}:${r.from.port}` : '')}</select></label>
      <label class="fld fld-wide"><span>To</span><select data-r="to">${portOptions(r.kind, 'out', r.to ? `${r.to.owner}:${r.to.port}` : '')}</select></label>
      <p class="meta"><code>${esc(info.fromPortId || '—')}</code> → <code>${esc(info.toPortId || '—')}</code></p>
      <label class="fld fld-wide"><span>Circuit</span><select data-r="circuitId">${opts(circuits, r.circuitId || '')}</select></label>
      <label class="tgl"><input type="checkbox" data-r="enabled" ${r.enabled ? 'checked' : ''}><i></i><span>Enabled</span></label>
      <h6>Waypoints <em>x · y · z (m)</em></h6><div class="wps">${wp || '<p class="hint">Straight connection.</p>'}</div>
      <div class="btn-row"><button data-tp="wp-add">+ Waypoint</button><button data-tp="reroute">Auto route</button><button class="danger" data-tp="route-del">Delete route</button></div>
      <label class="fld fld-wide"><span>Note</span><textarea data-r="note" rows="2">${esc(r.note)}</textarea></label>
      <p class="hint">Drag white waypoints in the room (Shift = vertical, Alt = no snapping); double-click the route to add one; Del removes the active one.</p></div>`;
  }

  circuitEditor(c, s, portOptions) {
    const encs = this.tech.endpoints();
    return `<div class="tp-edit">
      <div class="grid2"><label class="fld"><span>ID</span><input type="text" data-c="code" value="${esc(c.code)}"></label>
      <label class="fld"><span>Type</span><select data-c="kind">${opts(Object.fromEntries(PORT_KINDS.map((k) => [k, ROUTE_KINDS[k].label])), c.kind)}</select></label></div>
      <label class="fld fld-wide"><span>Name</span><input type="text" data-c="name" value="${esc(c.name)}"></label>
      <label class="fld fld-wide"><span>Source</span><select data-c="source">${portOptions(c.kind, c.kind === 'drain' ? 'out' : 'in', c.source ? `${c.source.owner}:${c.source.port}` : '')}</select></label>
      <h6>Destinations <em>${c.destinations.length} of ${encs.length} enclosures</em></h6>
      <div class="dests">${encs.map((e) => `<label><input type="checkbox" data-dest="${esc(e.owner)}" ${c.destinations.includes(e.owner) ? 'checked' : ''}> ${esc(e.name)}</label>`).join('') || '<p class="hint">No enclosures in the room.</p>'}</div>
      <label class="tgl"><input type="checkbox" data-c="enabled" ${c.enabled ? 'checked' : ''}><i></i><span>Enabled</span></label>
      <label class="fld fld-wide"><span>Note</span><textarea data-c="note" rows="2">${esc(c.note)}</textarea></label>
      <div class="btn-row"><button data-tp="gen" title="Create a route from the source to every destination not yet connected">Generate routes</button><button class="danger" data-tp="circuit-del">Delete</button></div></div>`;
  }

  onClick(e) {
    const t = this.tech, ed = this.app.editor;
    const layer = e.target.closest('[data-layer]'); if (layer) { t.setLayer(layer.dataset.layer, !t.layers.has(layer.dataset.layer)); return; }
    const b = e.target.closest('[data-tp]');
    if (b) {
      const a = b.dataset.tp;
      if (a === 'new-route') t.startRoute(this.el.querySelector('[data-new=kind]').value, this.el.querySelector('[data-new=mode]').value);
      else if (a === 'cancel-pick') t.cancelPick();
      else if (a === 'wp-add') t.addWaypoint(t.selectedRoute);
      else if (a === 'wp-del') t.deleteWaypoint(t.selectedRoute, +b.dataset.i);
      else if (a === 'reroute') t.reroute(t.selectedRoute);
      else if (a === 'route-del') { ed.removeRoute(t.selectedRoute); t.selectRoute(null); }
      else if (a === 'new-circuit') { const c = ed.addCircuit({ kind: this.newKind || 'mist' }); this.circuit = c.id; }
      else if (a === 'gen') t.generateCircuitRoutes(this.circuit);
      else if (a === 'circuit-del') { ed.removeCircuit(this.circuit); this.circuit = null; }
      else if (a === 'demo') t.loadDemoNetwork();
      this.refresh(); return;
    }
    if (e.target.closest('.tp-edit')) return;
    const r = e.target.closest('[data-route]'); if (r) { t.selectRoute(r.dataset.route === t.selectedRoute ? null : r.dataset.route); return; }
    const c = e.target.closest('[data-circuit]'); if (c) { this.circuit = c.dataset.circuit === this.circuit ? null : c.dataset.circuit; this.refresh(); }
  }

  onChange(e) {
    const t = this.tech, ed = this.app.editor, el = e.target;
    const ref = (v) => { if (!v) return null; const [owner, ...p] = v.split(':'); return { owner, port: p.join(':') }; };
    if (el.dataset.new) { if (el.dataset.new === 'kind') this.newKind = el.value; else this.newMode = el.value; return; }
    if (el.dataset.pickport) { t.pickPort(el.value); return; }
    if (el.dataset.wp !== undefined) {
      const r = ed.getRoute(t.selectedRoute), i = +el.dataset.wp; if (!r) return;
      t.setWaypoint(r.id, i, { ...r.points[i], [el.dataset.axis]: Number(el.value) }, { snap: false });
      t.layer.activeHandle = i; this.refresh(); return;
    }
    if (el.dataset.r) {
      const k = el.dataset.r, id = t.selectedRoute;
      const v = el.type === 'checkbox' ? el.checked : k === 'from' || k === 'to' ? ref(el.value) : k === 'circuitId' ? el.value || null : el.value;
      ed.updateRoute(id, { [k]: v });
      if (k === 'mode' || k === 'from' || k === 'to') t.reroute(id);
      this.refresh(); return;
    }
    if (el.dataset.c) {
      const k = el.dataset.c, v = el.type === 'checkbox' ? el.checked : k === 'source' ? ref(el.value) : el.value;
      ed.updateCircuit(this.circuit, { [k]: v }); this.refresh(); return;
    }
    if (el.dataset.dest) {
      const c = ed.getCircuit(this.circuit); if (!c) return;
      const d = new Set(c.destinations); el.checked ? d.add(el.dataset.dest) : d.delete(el.dataset.dest);
      ed.updateCircuit(c.id, { destinations: [...d] }); this.refresh();
    }
  }
}
