import * as THREE from 'three';
import { History } from '../editor/History.js';
import {
  defaultTemplate, normalizeTemplate, cloneData, itemId, codePrefix, CONSTRUCTIONS, PANEL_TYPES, TOP_TYPES, FRAME_COLORS, FRAME_STYLES,
  FRONT_TYPES, VENT_SIDES, BACKGROUNDS, INTERIOR_PRESETS, SUBSTRATES, INTERIOR_ITEMS, TECH_KINDS,
} from '../model/Library.js';
import { interiorBounds, devicePosition } from './EnclosureGeometry.js';
import { templateParts, templateSize } from '../preview/parts.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/Toast.js';
import { formatDims, dimLabel, dimShort, dimsOrderLabel, DIM_ORDER } from '../model/Dimensions.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cm = (m) => Math.round(m * 1000) / 10;
const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function set(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]] ??= {}; a[ks[ks.length - 1]] = v; }

/**
 * ENCLOSURE DESIGNER — create / edit an EnclosureTemplate with a live 3D preview.
 *
 *   LEFT    construction & component options (chips, toggles)
 *   CENTER  live painted 3D preview (orbit; drag interior items and devices directly)
 *   RIGHT   name, exact dimensions (cm), selected item / device, ids
 *
 * Works on a draft copy with its own undo history; SAVE commits one undoable document change.
 */
export class EnclosureDesigner {
  constructor(app) { this.app = app; this.el = null; }

  get isOpen() { return !!this.el; }

  open(template = null, { onSave, onClose, instanceId = null, title = null } = {}) {
    if (this.el) this.close();
    this.onClose = onClose;
    this.saved = null;
    this.draft = normalizeTemplate(cloneData(template || defaultTemplate()));
    this.isNew = !template || !this.app.editor.lib.templates.has(this.draft.id);
    this.onSave = onSave; this.instanceId = instanceId;
    this.hist = new History(80); this.hist.reset(JSON.stringify(this.draft));
    this.sel = null; // { type: 'item'|'device', id }
    this.section = 'construction';
    const el = document.createElement('div');
    el.className = 'studio-modal designer';
    el.innerHTML = `
      <header class="sm-head">
        <span class="sm-kicker">${icon('cube')} ENCLOSURE DESIGNER</span>
        <span class="sm-title" data-role="title">${esc(title || (this.isNew ? 'New enclosure' : this.draft.name))}</span>
        <span class="sm-spacer"></span>
        <button class="sm-btn" data-act="undo" title="Undo (Ctrl+Z)">${icon('undo')}</button>
        <button class="sm-btn" data-act="redo" title="Redo (Ctrl+Y)">${icon('redo')}</button>
        <button class="sm-btn text" data-act="cancel">Cancel</button>
        <button class="sm-btn primary" data-act="save">${icon('save')} Save to My Enclosures</button>
      </header>
      <div class="sm-body">
        <aside class="sm-left" data-role="left"></aside>
        <main class="sm-center">
          <div class="stage-host" data-role="stage"></div>
          <div class="stage-bar">
            <button data-view="front">Front</button><button data-view="iso">3/4</button><button data-view="top">Top</button><button data-view="side">Side</button>
            <span class="stage-dims" data-role="dims"></span>
          </div>
          <div class="stage-hint">Orbit: drag · Zoom: wheel · Drag interior items and devices directly in 3D</div>
        </main>
        <aside class="sm-right" data-role="right"></aside>
      </div>`;
    this.app.root.appendChild(el);
    this.el = el;
    this._prevModal = this.app.modal; this.app.modal = this;
    this.left = el.querySelector('[data-role=left]'); this.right = el.querySelector('[data-role=right]');
    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('change', (e) => this._onField(e, true));
    el.addEventListener('input', (e) => this._onField(e, false));
    this._key = (e) => this._onKey(e);
    window.addEventListener('keydown', this._key, true);
    this.stage = this.app.previewStage();
    this.stage.mount(el.querySelector('[data-role=stage]'));
    this._pointer();
    this.renderPanels();
    this._rebuild(true);
    return this;
  }

  close() {
    if (!this.el) return;
    window.removeEventListener('keydown', this._key, true);
    this._unpointer?.();
    this.stage.overlay.clear();
    this.stage.setParts([]);
    this.stage.unmount();
    this.el.remove(); this.el = null;
    if (this.app.modal === this) this.app.modal = this._prevModal || null;
    const cb = this.onClose; this.onClose = null; cb?.(this.saved || null);
  }

  // ------------------------------------------------------------------ state
  commit(label = '') {
    this.draft = normalizeTemplate(this.draft);
    if (this.hist.push(JSON.stringify(this.draft), label)) this._rebuild();
    this.renderPanels();
  }
  undo() { const s = this.hist.undo(); if (s) { this.draft = JSON.parse(s); this.sel = null; this.renderPanels(); this._rebuild(); } }
  redo() { const s = this.hist.redo(); if (s) { this.draft = JSON.parse(s); this.sel = null; this.renderPanels(); this._rebuild(); } }

  _rebuild(fit = false) {
    clearTimeout(this._rt);
    this._rt = setTimeout(() => {
      const t = normalizeTemplate(this.draft);
      this.stage.setParts(templateParts(this.app.modes.planner.mats, t));
      const size = templateSize(t);
      if (fit || !this._framed) { this.stage.frame(size, { dir: [0.5, 0.35, 1] }); this._framed = true; }
      this._handles();
      const sum = this.el?.querySelector('[data-role=dim-sum] b'); if (sum) sum.textContent = formatDims(t.dimensions);
      this.el?.querySelector('[data-role=dims]') && (this.el.querySelector('[data-role=dims]').textContent = `${dimsOrderLabel()}  ${formatDims(t.dimensions)}${t.bottom.base ? ` · on ${cm(t.bottom.base)} cm cabinet` : ''}`);
    }, fit ? 0 : 40);
  }

  // ------------------------------------------------------------------ panels
  renderPanels() {
    if (!this.el) return;
    const d = this.draft;
    const chips = (path, options, cur) => `<div class="chips">${Object.entries(options).map(([k, v]) => `<button class="chip-btn ${cur === k ? 'on' : ''}" data-set="${path}" data-value="${k}">${esc(typeof v === 'string' ? v : v.label)}</button>`).join('')}</div>`;
    const sel = (path, list, cur) => `<select data-path="${path}">${list.map((k) => `<option value="${k}" ${cur === k ? 'selected' : ''}>${k}</option>`).join('')}</select>`;
    const sec = (id, title, body) => `<section class="dsec ${this.section === id ? 'open' : ''}"><button class="dsec-head" data-section="${id}">${icon('chevron', 'chev')}<span>${title}</span></button><div class="dsec-body">${body}</div></section>`;
    const vents = Object.entries(VENT_SIDES).map(([side, label]) => {
      const v = d.ventilation.find((x) => x.side === side);
      return `<div class="vent-row"><label class="tgl"><input type="checkbox" data-vent="${side}" ${v ? 'checked' : ''}><i></i><span>${label}</span></label>${v ? `<input type="range" min="0.1" max="1" step="0.05" value="${v.coverage}" data-ventcov="${side}" title="Coverage of the available length">` : ''}</div>`;
    }).join('');
    this.left.innerHTML = [
      sec('construction', 'Construction', `${chips('construction.type', Object.fromEntries(Object.entries(CONSTRUCTIONS).map(([k, v]) => [k, v.label])), d.construction.type)}
        <div class="grid2">
          <label class="fld"><span>Frame</span>${sel('construction.frame.style', FRAME_STYLES, d.construction.frame.style)}</label>
          <label class="fld"><span>Frame colour</span>${sel('construction.frame.color', FRAME_COLORS, d.construction.frame.color)}</label>
          <label class="fld"><span>Left panel</span>${sel('construction.panels.left', PANEL_TYPES, d.construction.panels.left)}</label>
          <label class="fld"><span>Right panel</span>${sel('construction.panels.right', PANEL_TYPES, d.construction.panels.right)}</label>
          <label class="fld"><span>Rear panel</span>${sel('construction.panels.rear', PANEL_TYPES, d.construction.panels.rear)}</label>
          <label class="fld"><span>Top</span>${sel('top.type', TOP_TYPES, d.top.type)}</label>
          <label class="fld"><span>Profile</span><div class="num"><input type="number" data-path="construction.frame.profile" data-scale="0.001" value="${Math.round(d.construction.frame.profile * 1000)}" step="1" min="8" max="50"><em>mm</em></div></label>
          <label class="fld"><span>Base cabinet</span><div class="num"><input type="number" data-path="bottom.base" data-scale="0.01" value="${cm(d.bottom.base)}" step="5" min="0" max="120"><em>cm</em></div></label>
        </div>`),
      sec('front', 'Front / doors', `${chips('front.type', FRONT_TYPES, d.front.type)}<label class="tgl"><input type="checkbox" data-path="front.lock" ${d.front.lock ? 'checked' : ''}><i></i><span>Lock / latch</span></label>`),
      sec('vent', 'Ventilation', `<div class="vents">${vents}</div><p class="hint">Slot pitch is physical: a longer strip gets more slots.</p>`),
      sec('interior', 'Interior', `${chips('interior.preset', INTERIOR_PRESETS, d.interior.preset)}
        ${d.interior.preset === 'custom' ? `${chips('background.type', BACKGROUNDS, d.background.type)}
          <div class="grid2"><label class="fld"><span>Substrate</span>${sel('interior.substrate.type', Object.keys(SUBSTRATES), d.interior.substrate.type)}</label>
          <label class="fld"><span>Layer thickness</span><div class="num"><input type="number" data-path="interior.substrate.depth" data-scale="0.01" value="${cm(d.interior.substrate.depth)}" step="1" min="0" max="30"><em>cm</em></div></label></div>
          <label class="tgl"><input type="checkbox" data-path="interior.water.enabled" ${d.interior.water.enabled ? 'checked' : ''}><i></i><span>Water section</span></label>
          ${d.interior.water.enabled ? `<label class="fld fld-wide"><span>Water width</span><input type="range" min="0.1" max="0.9" step="0.05" data-path="interior.water.fraction" value="${d.interior.water.fraction}"></label>` : ''}` : ''}
        <h5>Add component</h5><div class="chips add">${Object.entries(INTERIOR_ITEMS).map(([k, v]) => `<button class="chip-btn" data-additem="${k}">+ ${v}</button>`).join('')}</div>
        <div class="list">${d.interior.items.map((i) => `<div class="li ${this.sel?.id === i.id ? 'on' : ''}" data-selitem="${i.id}"><span>${esc(INTERIOR_ITEMS[i.kind])}</span><em>${Math.round(i.x * 100)} / ${Math.round(i.z * 100)}</em><button data-delitem="${i.id}" title="Remove">✕</button></div>`).join('') || '<p class="hint">No extra components — the preset diorama is used.</p>'}</div>`),
      sec('tech', 'Technology', `<div class="chips add">${Object.entries(TECH_KINDS).map(([k, v]) => `<button class="chip-btn" data-adddev="${k}">+ ${v.label}</button>`).join('')}</div>
        <div class="list">${d.technology.map((t) => `<div class="li ${this.sel?.id === t.id ? 'on' : ''}" data-seldev="${t.id}"><span>${esc(TECH_KINDS[t.kind].label)}</span><em title="Stable slot id (devices of physical enclosures are &lt;instance&gt;:${esc(t.id)})">${esc(t.id)}</em><button data-deldev="${t.id}" title="Remove">✕</button></div>`).join('') || '<p class="hint">No devices.</p>'}</div>
        <p class="hint">Every device slot has a stable id. Physical enclosures get stable device ids (instance:slot) for later IR Manager / Home Assistant binding.</p>`),
    ].join('');

    const t = d, s = this.sel;
    const it = s?.type === 'item' ? t.interior.items.find((i) => i.id === s.id) : null;
    const dv = s?.type === 'device' ? t.technology.find((i) => i.id === s.id) : null;
    const instances = this.app.editor.doc.instances.filter((i) => i.templateId === t.id);
    const dimRow = (label, key) => `<label class="fld" data-dim="${key}"><span>${label} <em class="ax">${dimShort(key)}</em></span><div class="num big"><input type="number" data-path="dimensions.${key}" data-scale="0.01" value="${cm(t.dimensions[key])}" step="1" min="8" max="300"><em>cm</em></div></label>`;
    this.right.innerHTML = `
      <section class="grp first"><h4>Enclosure</h4>
        <label class="fld fld-wide"><span>Name</span><input type="text" data-path="name" value="${esc(t.name)}" spellcheck="false"></label>
        <label class="fld fld-wide"><span>Instance code prefix</span><input type="text" data-path="metadata.code" value="${esc(t.metadata.code)}" placeholder="${esc(codePrefix({ ...t, metadata: { code: '' } }))}" maxlength="12" spellcheck="false"></label>
      </section>
      <section class="grp"><h4>Dimensions <em class="unit">outer, cm · ${dimsOrderLabel()}</em></h4><div class="grid3">${DIM_ORDER.map((k) => dimRow(dimLabel(k), k)).join('')}</div>
        <p class="dim-sum" data-role="dim-sum">${dimsOrderLabel()} = <b>${formatDims(t.dimensions)}</b></p>
        <p class="hint">Rebuilt parametrically — profiles, glass, vents and substrate follow; handles, locks and labels keep their size.</p></section>
      ${it ? `<section class="grp sel"><h4>${esc(INTERIOR_ITEMS[it.kind])} <button class="link" data-delitem="${it.id}">remove</button></h4>
        <label class="fld fld-wide"><span>Left ↔ right</span><input type="range" min="0" max="1" step="0.01" data-item="${it.id}.x" value="${it.x}"></label>
        <label class="fld fld-wide"><span>Back ↔ front</span><input type="range" min="0" max="1" step="0.01" data-item="${it.id}.z" value="${it.z}"></label>
        <label class="fld fld-wide"><span>Size</span><input type="range" min="0.4" max="2.5" step="0.05" data-item="${it.id}.s" value="${it.s}"></label>
        <label class="fld fld-wide"><span>Rotation</span><input type="range" min="-3.14" max="3.14" step="0.05" data-item="${it.id}.r" value="${it.r}"></label></section>` : ''}
      ${dv ? `<section class="grp sel"><h4>${esc(TECH_KINDS[dv.kind].label)} <button class="link" data-deldev="${dv.id}">remove</button></h4>
        <label class="fld fld-wide"><span>Slot id</span><input type="text" value="${esc(dv.id)}" disabled></label>
        <label class="fld fld-wide"><span>Label</span><input type="text" data-dev="${dv.id}.label" value="${esc(dv.label)}" placeholder="e.g. Basking spot"></label>
        <label class="fld fld-wide"><span>Left ↔ right</span><input type="range" min="0" max="1" step="0.01" data-dev="${dv.id}.x" value="${dv.x}"></label>
        ${TECH_KINDS[dv.kind].mount === 'rear' ? `<label class="fld fld-wide"><span>Height</span><input type="range" min="0" max="1" step="0.01" data-dev="${dv.id}.y" value="${dv.y}"></label>` : `<label class="fld fld-wide"><span>Back ↔ front</span><input type="range" min="0" max="1" step="0.01" data-dev="${dv.id}.z" value="${dv.z}"></label>`}</section>` : ''}
      <section class="grp"><h4>Physical enclosures</h4>${instances.length ? `<div class="codes">${instances.map((i) => `<span class="code ${i.id === this.instanceId ? 'on' : ''}">${esc(i.code)}</span>`).join('')}</div>` : '<p class="hint">None yet — drag this enclosure into an assembly or the room to create physical enclosures (each gets its own id).</p>'}</section>
      <section class="grp"><h4>Notes</h4><textarea class="notes" data-path="metadata.notes" rows="3" placeholder="Construction notes…">${esc(t.metadata.notes)}</textarea></section>`;
    this.el.querySelector('[data-role=title]').textContent = t.name;
    this.el.querySelector('[data-act=undo]').disabled = !this.hist.canUndo();
    this.el.querySelector('[data-act=redo]').disabled = !this.hist.canRedo();
  }

  _onClick(e) {
    const q = (sel) => e.target.closest(sel);
    let b;
    if ((b = q('[data-act]'))) {
      const a = b.dataset.act;
      if (a === 'undo') this.undo(); else if (a === 'redo') this.redo();
      else if (a === 'cancel') this.close();
      else if (a === 'save') this.save();
      return;
    }
    if ((b = q('[data-section]'))) { this.section = this.section === b.dataset.section ? '' : b.dataset.section; this.renderPanels(); return; }
    if ((b = q('[data-view]'))) { this._view(b.dataset.view); return; }
    if ((b = q('[data-set]'))) {
      const path = b.dataset.set, v = b.dataset.value;
      if (path === 'construction.type') this._applyConstruction(v); else set(this.draft, path, v);
      this.commit(path); return;
    }
    if ((b = q('[data-additem]'))) { const it = { id: itemId('i'), kind: b.dataset.additem, x: 0.3 + Math.random() * 0.4, z: 0.55, s: 1, r: 0 }; this.draft.interior.items.push(it); this.sel = { type: 'item', id: it.id }; this.commit('Add item'); return; }
    if ((b = q('[data-delitem]'))) { this.draft.interior.items = this.draft.interior.items.filter((i) => i.id !== b.dataset.delitem); this.sel = null; this.commit('Remove item'); return; }
    if ((b = q('[data-adddev]'))) {
      const kind = b.dataset.adddev, base = kind.replace(/_.*/, '');
      let id = base, n = 2; while (this.draft.technology.some((t) => t.id === id)) id = `${base}${n++}`;
      const mount = TECH_KINDS[kind].mount;
      const dv = { id, kind, label: '', x: 0.5, y: mount === 'rear' ? 0.6 : 1, z: mount === 'floor' ? 0.7 : 0.35 };
      this.draft.technology.push(dv); this.sel = { type: 'device', id }; this.commit('Add device'); return;
    }
    if ((b = q('[data-deldev]'))) { this.draft.technology = this.draft.technology.filter((i) => i.id !== b.dataset.deldev); this.sel = null; this.commit('Remove device'); return; }
    if ((b = q('[data-selitem]'))) { this.sel = { type: 'item', id: b.dataset.selitem }; this.renderPanels(); this._handles(); return; }
    if ((b = q('[data-seldev]'))) { this.sel = { type: 'device', id: b.dataset.seldev }; this.renderPanels(); this._handles(); return; }
  }

  _applyConstruction(type) {
    const c = CONSTRUCTIONS[type], d = this.draft;
    d.type = type; d.construction.type = type;
    d.construction.frame.style = c.frame; d.construction.frame.color = c.frameColor;
    d.construction.panels = { ...c.panels }; d.top.type = c.top; d.front.type = c.front;
    if (type === 'rack') { d.interior.preset = 'none'; d.interior.substrate.type = 'paper'; }
  }

  _onField(e, final) {
    const el = e.target;
    if (el.dataset.path) {
      let v = el.type === 'checkbox' ? el.checked : el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value;
      if (el.type === 'number' && !Number.isFinite(v)) return;
      if (el.dataset.scale) v *= Number(el.dataset.scale);
      if (el.type === 'number' || el.type === 'text' || el.tagName === 'TEXTAREA') { if (!final) return; }
      set(this.draft, el.dataset.path, v);
      if (final || el.type === 'range') { if (final) this.commit(el.dataset.path); else this._rebuild(); }
      if (el.dataset.path === 'name') this.el.querySelector('[data-role=title]').textContent = v;
      return;
    }
    if (el.dataset.vent !== undefined && final) {
      const side = el.dataset.vent;
      if (el.checked) this.draft.ventilation.push({ id: itemId('v'), side, coverage: 0.8 }); else this.draft.ventilation = this.draft.ventilation.filter((v) => v.side !== side);
      this.commit('Ventilation'); return;
    }
    if (el.dataset.ventcov !== undefined) { const v = this.draft.ventilation.find((x) => x.side === el.dataset.ventcov); if (v) v.coverage = Number(el.value); if (final) this.commit('Ventilation'); else this._rebuild(); return; }
    const itemKey = el.dataset.item || el.dataset.dev;
    if (itemKey) {
      const [id, k] = itemKey.split('.');
      const list = el.dataset.item ? this.draft.interior.items : this.draft.technology;
      const o = list.find((i) => i.id === id); if (!o) return;
      o[k] = el.type === 'range' ? Number(el.value) : el.value;
      if (final) this.commit('Move'); else this._rebuild();
    }
  }

  _onKey(e) {
    if (!this.el || this.app.modal !== this) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' && e.target.type !== 'range' || tag === 'textarea' || tag === 'select';
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (k === 'escape') { if (typing) e.target.blur(); else if (this.sel) { this.sel = null; this.renderPanels(); this._handles(); } else this.close(); e.stopPropagation(); e.preventDefault(); return; }
    if (typing) { e.stopPropagation(); return; }
    if (ctrl && k === 'z' && !e.shiftKey) this.undo();
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) this.redo();
    else if ((k === 'delete' || k === 'backspace') && this.sel) {
      if (this.sel.type === 'item') this.draft.interior.items = this.draft.interior.items.filter((i) => i.id !== this.sel.id);
      else this.draft.technology = this.draft.technology.filter((i) => i.id !== this.sel.id);
      this.sel = null; this.commit('Remove');
    } else if (ctrl && k === 's') this.save();
    else { e.stopPropagation(); return; }
    e.preventDefault(); e.stopPropagation();
  }

  save() {
    const t = normalizeTemplate(this.draft);
    if (this.onSave) this.onSave(t); else { this.app.editor.saveTemplate(t); toast(`Saved “${t.name}” to My Enclosures`); }
    this.saved = t;
    this.close();
  }

  // ------------------------------------------------------------------ preview: views & direct manipulation
  _view(v) {
    const size = templateSize(normalizeTemplate(this.draft));
    const dir = { front: [0, 0.05, 1], iso: [0.5, 0.35, 1], top: [0, 1, 0.02], side: [1, 0.12, 0.05] }[v];
    this.stage.frame(size, { dir });
  }

  /** Handles for interior items / devices: invisible pick boxes + an amber marker on the selection. */
  _handles() {
    const st = this.stage, t = normalizeTemplate(this.draft), I = interiorBounds(t), base = t.bottom.base;
    st.overlay.clear();
    this._pick = [];
    const mk = (id, type, x, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ visible: false }));
      m.position.set(x, y + base, z); m.userData = { id, type };
      st.overlay.add(m); this._pick.push(m);
      if (this.sel?.id === id) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.045, 0.055, 32).rotateX(type === 'device' && TECH_KINDS[t.technology.find((d) => d.id === id)?.kind]?.mount === 'rear' ? 0 : -Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0a04b, depthTest: false, transparent: true, opacity: 0.95 }));
        ring.position.copy(m.position); ring.renderOrder = 30; st.overlay.add(ring);
      }
    };
    for (const it of t.interior.items) mk(it.id, 'item', I.x0 + (I.x1 - I.x0) * it.x, I.floor + Math.min(0.05, t.interior.substrate.depth), I.z0 + (I.z1 - I.z0) * it.z);
    for (const dv of t.technology) { const p = devicePosition(t, dv, I); mk(dv.id, 'device', p.x, p.y, p.z); }
    st.invalidate();
  }

  _pointer() {
    const canvas = this.stage.renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    const setRay = (e) => { const r = canvas.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, this.stage.camera); };
    let drag = null;
    const down = (e) => {
      if (e.button !== 0) return;
      setRay(e);
      const hit = ray.intersectObjects(this._pick || [], false)[0];
      if (!hit) return;
      const { id, type } = hit.object.userData;
      this.sel = { type, id };
      const t = normalizeTemplate(this.draft), I = interiorBounds(t), base = t.bottom.base;
      const dv = type === 'device' ? t.technology.find((d) => d.id === id) : null;
      const rear = dv && TECH_KINDS[dv.kind].mount === 'rear';
      const plane = rear ? new THREE.Plane(new THREE.Vector3(0, 0, 1), -(I.z0 + 0.012)) : new THREE.Plane(new THREE.Vector3(0, 1, 0), -hit.object.position.y);
      drag = { id, type, I, base, plane, rear };
      this.stage.controls.enabled = false;
      canvas.setPointerCapture(e.pointerId);
      this.renderPanels(); this._handles();
      e.stopPropagation();
    };
    const move = (e) => {
      if (!drag) { setRay(e); canvas.style.cursor = ray.intersectObjects(this._pick || [], false).length ? 'grab' : ''; return; }
      setRay(e);
      const p = new THREE.Vector3(); if (!ray.ray.intersectPlane(drag.plane, p)) return;
      const { I } = drag, fx = THREE.MathUtils.clamp((p.x - I.x0) / (I.x1 - I.x0), 0, 1);
      const list = drag.type === 'item' ? this.draft.interior.items : this.draft.technology;
      const o = list.find((i) => i.id === drag.id); if (!o) return;
      o.x = +fx.toFixed(3);
      if (drag.rear) o.y = +THREE.MathUtils.clamp((p.y - drag.base - I.floor) / (I.top - I.floor), 0, 1).toFixed(3);
      else o.z = +THREE.MathUtils.clamp((p.z - I.z0) / (I.z1 - I.z0), 0, 1).toFixed(3);
      drag.moved = true;
      const now = performance.now();
      if (!drag.t || now - drag.t > 90) { drag.t = now; this._rebuild(); }
    };
    const up = () => {
      if (!drag) return;
      this.stage.controls.enabled = true;
      const moved = drag.moved; drag = null;
      if (moved) this.commit('Move component'); else this.renderPanels();
    };
    canvas.addEventListener('pointerdown', down, true);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this._unpointer = () => { canvas.removeEventListener('pointerdown', down, true); canvas.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }
}
