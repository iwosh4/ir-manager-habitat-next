import { History } from '../editor/History.js';
import {
  createAssembly, normalizeAssembly, normalizeOrigin, assemblyBoxes, assemblyStats, assemblyMaxDepth, memberSize, createInstance, normalizeInstance,
  libraryIndex, cloneData, itemId, MODULE_TYPES, FRAME_COLORS, TEMPLATE_CATEGORY,
} from '../model/Library.js';
import { snapPlacement, candidateBox, collisions, freeSlotNear, boxesExtent, outOfLimit } from './Tetris.js';
import { assemblyParts } from '../preview/parts.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/Toast.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cm = (m) => Math.round(m * 1000) / 10;
const AMBER = '#f0a04b', GREEN = '#6fcf8e', RED = '#e0533f';
const SNAP_PX = 14;

/**
 * ASSEMBLY BUILDER — build a physical enclosure wall / rack like Tetris.
 *
 *   LEFT    MY ENCLOSURES (drag), modules (cabinet, shelf, technical), reserved space
 *   CENTER  front elevation workspace: drag, magnetic snapping, collision feedback, pan / zoom
 *   RIGHT   live 3D preview (Planner look) + assembly totals, frame, alignment, selected piece
 *
 * The draft is an Assembly (members → physical instances). Physical enclosures created while building
 * get their own ids immediately; SAVE commits assembly + new instances as ONE undoable change.
 */
export class AssemblyBuilder {
  constructor(app) { this.app = app; this.el = null; }
  get isOpen() { return !!this.el; }

  open(assembly = null, { onSave, newInstances = [] } = {}) {
    if (this.el) this.close();
    const ed = this.app.editor;
    this.draft = normalizeAssembly(cloneData(assembly || createAssembly({ name: 'New assembly', frame: { mode: 'none' } })));
    this.isNew = !assembly || !ed.lib.assemblies.has(this.draft.id);
    this.newInstances = [...newInstances];
    this.onSave = onSave;
    this.grid = [0.01, 0.02, 0.05, 0.1].includes(ed.snap.grid) ? ed.snap.grid : 0.01;
    this.snapOn = true;
    this.hist = new History(150); this.hist.reset(this._snap());
    this.sel = null;
    this.view = { scale: 160, ox: 0, oy: 0, fitted: false };
    this.images = new Map();
    const el = document.createElement('div');
    el.className = 'studio-modal builder';
    el.innerHTML = `
      <header class="sm-head">
        <span class="sm-kicker">${icon('grid')} ASSEMBLY BUILDER</span>
        <input class="sm-name" data-role="name" value="${esc(this.draft.name)}" spellcheck="false" title="Assembly name">
        <span class="sm-spacer"></span>
        <button class="sm-btn" data-act="undo" title="Undo (Ctrl+Z)">${icon('undo')}</button>
        <button class="sm-btn" data-act="redo" title="Redo (Ctrl+Y)">${icon('redo')}</button>
        <label class="sm-label" title="Snapping increment">${icon('snap')}<select data-role="grid">${[0.01, 0.02, 0.05, 0.1].map((g) => `<option value="${g}" ${g === this.grid ? 'selected' : ''}>${g * 100} cm</option>`).join('')}</select></label>
        <button class="sm-btn toggle on" data-act="snap" title="Magnetic snapping (G) — hold Alt to place freely">Snap</button>
        <button class="sm-btn" data-act="fit" title="Fit workspace">${icon('focus')}</button>
        <button class="sm-btn text" data-act="cancel">Cancel</button>
        <button class="sm-btn primary" data-act="save">${icon('save')} Save to My Assemblies</button>
      </header>
      <div class="sm-body">
        <aside class="sm-left" data-role="left"></aside>
        <main class="sm-center tetris" data-role="center">
          <canvas data-role="canvas"></canvas>
          <div class="tetris-hint" data-role="hint">Drag enclosures from the left into the workspace — they snap to each other like building blocks</div>
          <div class="tetris-status" data-role="status"></div>
        </main>
        <aside class="sm-right">
          <div class="mini-stage" data-role="stage"></div>
          <div class="sm-props" data-role="props"></div>
        </aside>
      </div>
      <div class="drag-ghost" data-role="ghost" hidden></div>`;
    this.app.root.appendChild(el);
    this.el = el;
    this._prevModal = this.app.modal; this.app.modal = this;
    this.canvas = el.querySelector('[data-role=canvas]');
    this.ctx2d = this.canvas.getContext('2d');
    this.left = el.querySelector('[data-role=left]'); this.props = el.querySelector('[data-role=props]');
    this.ghostEl = el.querySelector('[data-role=ghost]');
    el.addEventListener('click', (e) => this._onClick(e));
    el.addEventListener('change', (e) => this._onField(e));
    el.querySelector('[data-role=name]').addEventListener('input', (e) => { this.draft.name = e.target.value; });
    el.querySelector('[data-role=name]').addEventListener('change', () => this.commit('Rename'));
    el.querySelector('[data-role=grid]').addEventListener('change', (e) => { this.grid = Number(e.target.value); });
    this._key = (e) => this._onKey(e);
    window.addEventListener('keydown', this._key, true);
    this._bindPointer();
    this._ro = new ResizeObserver(() => this._resize()); this._ro.observe(this.canvas.parentElement);
    this.stage = this.app.previewStage();
    this.stage.mount(el.querySelector('[data-role=stage]'));
    this.renderLeft(); this.renderProps(); this._resize(); this._preview(true);
    return this;
  }

  close() {
    if (!this.el) return;
    window.removeEventListener('keydown', this._key, true);
    window.removeEventListener('pointermove', this._pm); window.removeEventListener('pointerup', this._pu);
    this._ro.disconnect();
    this.stage.setParts([]); this.stage.unmount();
    this.el.remove(); this.el = null;
    if (this.app.modal === this) this.app.modal = this._prevModal || null;
  }

  // ------------------------------------------------------------------ library index incl. draft instances
  get lib() {
    const doc = this.app.editor.doc;
    return libraryIndex({ enclosures: doc.enclosures, instances: [...doc.instances, ...this.newInstances], assemblies: doc.assemblies });
  }
  get boxes() { return assemblyBoxes(this.draft, this.lib); }
  get stats() { return assemblyStats(this.draft, this.lib); }

  _snap() { return JSON.stringify({ a: this.draft, n: this.newInstances }); }
  commit(label) {
    // pieces dropped below / left of the structure re-base it; the view compensates so nothing jumps
    const ext = boxesExtent(this.boxes);
    normalizeOrigin(this.draft, this.lib);
    if (ext.x0 || ext.y0) { this.view.ox += ext.x0 * this.view.scale; this.view.oy -= ext.y0 * this.view.scale; }
    if (this.hist.push(this._snap(), label)) { this._preview(); }
    this._autoFrame();
    this.renderProps(); this._draw();
  }

  /** Keep free working space around the growing structure (≈ 60 cm above and beside it). */
  _autoFrame() {
    const ext = boxesExtent(this.boxes); if (!this.boxes.length) return;
    const [x0, yTop] = this.toScreen(ext.x0 - 0.35, ext.y1 + 0.65), [x1] = this.toScreen(ext.x1 + 0.35, 0);
    const [, yBelow] = this.toScreen(0, -0.45);
    if (x0 >= 0 && x1 <= this.cw && yTop >= 0 && yBelow <= this.ch) return;
    const w = ext.x1 - ext.x0 + 0.9, h = ext.y1 + 0.9 + 0.6;
    const scale = Math.min(this.view.scale, (this.cw - 60) / w, (this.ch - 80) / h);
    this.view.scale = scale;
    this.view.ox = (this.cw - (ext.x1 - ext.x0) * scale) / 2 - ext.x0 * scale;
    this.view.oy = this.ch - Math.max(90, 0.6 * scale);
  }
  _restore(s) { const o = JSON.parse(s); this.draft = o.a; this.newInstances = o.n; if (this.sel && !this._piece(this.sel)) this.sel = null; this.renderProps(); this._draw(); this._preview(); this.el.querySelector('[data-role=name]').value = this.draft.name; }
  undo() { const s = this.hist.undo(); if (s) this._restore(s); }
  redo() { const s = this.hist.redo(); if (s) this._restore(s); }
  _piece(id) { return this.draft.members.find((m) => m.id === id) || this.draft.reserved.find((r) => r.id === id) || null; }

  // ------------------------------------------------------------------ left: palette
  renderLeft() {
    const ed = this.app.editor;
    const tpls = ed.templates;
    this.left.innerHTML = `
      <div class="pal-head"><span>My enclosures</span><button class="link" data-act="newtpl">+ Create enclosure</button></div>
      <div class="pal-grid">${tpls.map((t) => `
        <div class="pal-card" data-drag="enclosure" data-tpl="${t.id}" title="Drag into the workspace">
          <div class="pal-thumb"><img data-thumb="${t.id}" alt=""></div>
          <b>${esc(t.name)}</b><span>${cm(t.dimensions.width)}×${cm(t.dimensions.height)}×${cm(t.dimensions.depth)}</span><i>${esc(TEMPLATE_CATEGORY(t))} · ${esc(t.type)}</i>
        </div>`).join('') || '<p class="hint">No enclosures yet — create one first (or customise a starting template in the main library).</p>'}</div>
      <div class="pal-head"><span>Modules</span></div>
      <div class="pal-list">${Object.entries(MODULE_TYPES).map(([k, v]) => `<div class="pal-row" data-drag="module" data-module="${k}"><span class="sw sw-${k}"></span><b>${v.label}</b><em>${cm(v.size.w)}×${cm(v.size.h)}×${cm(v.size.d)}</em></div>`).join('')}
        <div class="pal-row" data-drag="reserved"><span class="sw sw-reserved"></span><b>Reserved space</b><em>60×50×50</em></div></div>
      <p class="hint">Sizes of modules and reserved spaces can be edited after placing.</p>`;
    for (const img of this.left.querySelectorAll('img[data-thumb]')) {
      const t = ed.lib.templates.get(img.dataset.thumb);
      this.app.libraryImages.template(t).then((u) => { if (u) img.src = u; });
    }
  }

  // ------------------------------------------------------------------ right: properties
  renderProps() {
    if (!this.el) return;
    const st = this.stats, a = this.draft, lib = this.lib;
    const p = this.sel && this._piece(this.sel);
    let h = `<section class="grp first"><h4>Assembly</h4>
      <div class="totals">
        <div><b>${cm(st.width)}</b><span>width cm</span></div><div><b>${cm(st.height)}</b><span>height cm</span></div><div><b>${cm(st.depth)}</b><span>max depth cm</span></div>
        <div><b>${st.enclosures}</b><span>enclosures</span></div><div><b>${st.rackBoxes}</b><span>rack boxes</span></div><div><b>${st.modules}</b><span>modules</span></div><div><b>${st.reserved}</b><span>reserved</span></div>
      </div>
      <div class="grid2">
        <label class="fld"><span>Depth alignment</span><select data-f="alignment"><option value="front" ${a.alignment === 'front' ? 'selected' : ''}>Front aligned</option><option value="back" ${a.alignment === 'back' ? 'selected' : ''}>Back aligned</option></select></label>
        <label class="fld"><span>Structure</span><select data-f="frame.mode"><option value="none" ${a.frame.mode === 'none' ? 'selected' : ''}>None</option><option value="auto" ${a.frame.mode === 'auto' ? 'selected' : ''}>Auto frame</option><option value="custom" ${a.frame.mode === 'custom' ? 'selected' : ''}>Custom frame</option></select></label>
      </div>
      ${a.frame.mode === 'custom' ? `<div class="grid2">
        <label class="fld"><span>Profile</span><div class="num"><input type="number" data-f="frame.profile" data-scale="0.001" value="${Math.round(a.frame.profile * 1000)}" min="15" max="80" step="5"><em>mm</em></div></label>
        <label class="fld"><span>Colour</span><select data-f="frame.color">${FRAME_COLORS.map((c) => `<option ${a.frame.color === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label></div>
        <label class="tgl"><input type="checkbox" data-f="frame.shelves" ${a.frame.shelves ? 'checked' : ''}><i></i><span>Shelf rails under pieces</span></label>
        <label class="tgl"><input type="checkbox" data-f="frame.topRail" ${a.frame.topRail ? 'checked' : ''}><i></i><span>Top rail</span></label>
        <label class="tgl"><input type="checkbox" data-f="frame.feet" ${a.frame.feet ? 'checked' : ''}><i></i><span>Feet</span></label>` : ''}
      <label class="tgl"><input type="checkbox" data-f="limit.on" ${a.limit ? 'checked' : ''}><i></i><span>Maximum physical size</span></label>
      ${a.limit ? `<div class="grid2"><label class="fld"><span>Max width</span><div class="num"><input type="number" data-f="limit.w" data-scale="0.01" value="${cm(a.limit.w)}" step="5"><em>cm</em></div></label><label class="fld"><span>Max height</span><div class="num"><input type="number" data-f="limit.h" data-scale="0.01" value="${cm(a.limit.h)}" step="5"><em>cm</em></div></label></div>` : ''}
    </section>`;
    if (p) {
      if (p.kind === 'enclosure') {
        const t = lib.templates.get(p.enclosureId), inst = lib.instances.get(p.instanceId);
        h += `<section class="grp sel"><h4>${esc(t?.name || 'Enclosure')} <span class="code">${esc(inst?.code || '')}</span></h4>
          <p class="meta">${t ? `${cm(t.dimensions.width)} × ${cm(t.dimensions.height)} × ${cm(t.dimensions.depth)} cm · ${esc(t.type)}` : ''}<br>instance <code>${esc(p.instanceId)}</code></p>
          <label class="fld fld-wide"><span>Enclosure code</span><input type="text" data-inst="code" value="${esc(inst?.code || '')}" spellcheck="false"></label>
          ${this._posFields(p)}
          <label class="fld fld-wide"><span>Replace with</span><select data-act-sel="replace"><option value="">— choose enclosure —</option>${this.app.editor.templates.filter((x) => x.id !== p.enclosureId).map((x) => `<option value="${x.id}">${esc(x.name)} (${cm(x.dimensions.width)}×${cm(x.dimensions.height)})</option>`).join('')}</select></label>
          <div class="btn-row"><button data-act="open">${icon('cube')} Open enclosure</button><button data-act="dup">${icon('dup')} Duplicate</button><button data-act="del" class="danger">${icon('trash')} Remove</button></div></section>`;
      } else if (p.kind === 'module') {
        h += `<section class="grp sel"><h4>${esc(MODULE_TYPES[p.module.type].label)}</h4>
          <div class="grid3"><label class="fld"><span>W</span><div class="num"><input type="number" data-mod="w" value="${cm(p.module.w)}" step="1"><em>cm</em></div></label><label class="fld"><span>H</span><div class="num"><input type="number" data-mod="h" value="${cm(p.module.h)}" step="1"><em>cm</em></div></label><label class="fld"><span>D</span><div class="num"><input type="number" data-mod="d" value="${cm(p.module.d)}" step="1"><em>cm</em></div></label></div>
          ${p.module.type === 'cabinet' ? `<label class="fld fld-wide"><span>Doors</span><input type="number" data-mod="doors" value="${p.module.doors}" min="0" max="6" step="1"></label>` : ''}
          ${this._posFields(p)}
          <div class="btn-row"><button data-act="fitw" title="Match the width of the structure">↔ Full width</button><button data-act="dup">${icon('dup')} Duplicate</button><button data-act="del" class="danger">${icon('trash')} Remove</button></div></section>`;
      } else {
        h += `<section class="grp sel"><h4>Reserved space</h4>
          <label class="fld fld-wide"><span>Label</span><input type="text" data-res="label" value="${esc(p.label)}"></label>
          <div class="grid3"><label class="fld"><span>W</span><div class="num"><input type="number" data-res="w" value="${cm(p.size.w)}" step="1"><em>cm</em></div></label><label class="fld"><span>H</span><div class="num"><input type="number" data-res="h" value="${cm(p.size.h)}" step="1"><em>cm</em></div></label><label class="fld"><span>D</span><div class="num"><input type="number" data-res="d" value="${cm(p.size.d)}" step="1"><em>cm</em></div></label></div>
          ${this._posFields(p)}
          <div class="btn-row"><button data-act="dup">${icon('dup')} Duplicate</button><button data-act="del" class="danger">${icon('trash')} Remove</button></div></section>`;
      }
    } else h += `<section class="grp"><h4>Keys</h4><dl class="keys"><dt>Place</dt><dd>drag from the left</dd><dt>Move</dt><dd>drag · arrows (Shift ×10)</dd><dt>Duplicate</dt><dd>Ctrl+D</dd><dt>Remove</dt><dd>Delete</dd><dt>Free placement</dt><dd>hold Alt</dd><dt>Pan · zoom</dt><dd>right-drag · wheel</dd><dt>Undo · redo</dt><dd>Ctrl+Z · Ctrl+Y</dd></dl></section>`;
    this.props.innerHTML = h;
    this.el.querySelector('[data-act=undo]').disabled = !this.hist.canUndo();
    this.el.querySelector('[data-act=redo]').disabled = !this.hist.canRedo();
  }

  _posFields(p) {
    return `<div class="grid3"><label class="fld"><span>X</span><div class="num"><input type="number" data-pos="x" value="${cm(p.position.x)}" step="1"><em>cm</em></div></label><label class="fld"><span>Y</span><div class="num"><input type="number" data-pos="y" value="${cm(p.position.y)}" step="1"><em>cm</em></div></label><label class="fld"><span>Depth offset</span><div class="num"><input type="number" data-pos="z" value="${cm(p.position.z)}" step="1" min="0"><em>cm</em></div></label></div>`;
  }

  _onField(e) {
    const el = e.target, a = this.draft, p = this.sel && this._piece(this.sel);
    const val = () => Number(el.value) * (el.dataset.scale ? Number(el.dataset.scale) : 1);
    if (el.dataset.f) {
      const f = el.dataset.f;
      if (f === 'alignment') a.alignment = el.value;
      else if (f === 'frame.mode') { a.frame.mode = el.value; if (el.value === 'auto') Object.assign(a.frame, { profile: 0.03, shelves: true, topRail: true, feet: true, color: 'graphite' }); }
      else if (f === 'limit.on') a.limit = el.checked ? { w: Math.max(1, this.stats.width), h: Math.max(1, this.stats.height) } : null;
      else if (f.startsWith('limit.')) a.limit[f.split('.')[1]] = val();
      else if (el.type === 'checkbox') a.frame[f.split('.')[1]] = el.checked;
      else if (f === 'frame.color') a.frame.color = el.value;
      else a.frame[f.split('.')[1]] = val();
      this.commit('Assembly settings'); return;
    }
    if (!p) return;
    if (el.dataset.pos) { this._tryMove(p, { ...p.position, [el.dataset.pos]: Number(el.value) / 100 }, 'Move'); return; }
    if (el.dataset.inst) { const inst = this.newInstances.find((i) => i.id === p.instanceId) || null; if (inst) inst.code = el.value; else this._pendingCodes = { ...(this._pendingCodes || {}), [p.instanceId]: el.value }; this.commit('Code'); return; }
    if (el.dataset.mod) { const next = { ...p.module, [el.dataset.mod]: el.dataset.mod === 'doors' ? Number(el.value) : Number(el.value) / 100 }; this._tryResize(p, () => { p.module = next; }, 'Resize module'); return; }
    if (el.dataset.res) { if (el.dataset.res === 'label') { p.label = el.value; this.commit('Label'); return; } const next = { ...p.size, [el.dataset.res]: Number(el.value) / 100 }; this._tryResize(p, () => { p.size = next; }, 'Resize reserved'); return; }
    if (el.dataset.actSel === 'replace' && el.value) this.replace(p, el.value);
  }

  /** Pieces resting on `id` — directly or through other pieces (horizontal overlap, touching faces). */
  _stackAbove(id) {
    const boxes = this.boxes, start = boxes.find((b) => b.id === id); if (!start) return [];
    const out = new Set(), queue = [start];
    while (queue.length) {
      const b = queue.shift();
      for (const o of boxes) if (!out.has(o.id) && o.id !== id && Math.abs(o.y0 - b.y1) < 1e-4 && o.x0 < b.x1 - 1e-4 && o.x1 > b.x0 + 1e-4) { out.add(o.id); queue.push(o); }
    }
    return [...out].map((x) => this._piece(x)).filter(Boolean);
  }

  /** Apply a change only if it keeps the structure collision free. A height change carries the stack above along. */
  _tryResize(p, mutate, label) {
    const before = cloneData(p), h0 = this._size(p).h;
    const stack = this._stackAbove(p.id), stackBefore = stack.map((q) => ({ q, y: q.position.y }));
    mutate();
    const dh = this._size(p).h - h0;
    if (Math.abs(dh) > 1e-6) for (const q of stack) q.position = { ...q.position, y: +(q.position.y + dh).toFixed(4) };
    const me = this.boxes.find((b) => b.id === p.id);
    const hit = collisions(me, this.boxes, p.id);
    const anyHit = hit.length || stack.some((q) => collisions(this.boxes.find((b) => b.id === q.id), this.boxes, q.id).length);
    if (anyHit) { Object.assign(p, before); for (const { q, y } of stackBefore) q.position = { ...q.position, y }; toast('That size would overlap a neighbour', 'warn'); this.renderProps(); this._draw(); return; }
    this.commit(label);
  }

  _tryMove(p, pos, label) {
    const size = this._size(p);
    const box = candidateBox(pos.x, pos.y, size, this.draft.alignment, assemblyMaxDepth(this.draft, this.lib), pos.z || 0);
    if (collisions(box, this.boxes, p.id).length) { toast('Position occupied', 'warn'); this.renderProps(); return false; }
    p.position = { x: pos.x, y: pos.y, z: pos.z || 0 };
    this.commit(label); return true;
  }

  _size(p) { return p.kind === 'reserved' || p.size ? p.size : memberSize(p, this.lib); }

  // ------------------------------------------------------------------ piece operations
  _makePiece(src) {
    if (src.kind === 'enclosure') {
      const t = this.app.editor.lib.templates.get(src.tpl);
      const inst = createInstance(t, { instances: [...this.app.editor.doc.instances, ...this.newInstances] });
      return { piece: { id: itemId('m'), kind: 'enclosure', instanceId: inst.id, enclosureId: t.id, module: null, position: { x: 0, y: 0, z: 0 }, rotation: 0 }, instance: inst, size: { w: t.dimensions.width, h: t.dimensions.height + t.bottom.base, d: t.dimensions.depth }, label: t.name };
    }
    if (src.kind === 'module') { const m = MODULE_TYPES[src.module]; return { piece: { id: itemId('m'), kind: 'module', instanceId: null, enclosureId: null, module: { type: src.module, ...m.size, doors: src.module === 'cabinet' ? 2 : 0 }, position: { x: 0, y: 0, z: 0 }, rotation: 0 }, size: m.size, label: m.label }; }
    return { piece: { id: itemId('r'), label: 'Reserved', size: { w: 0.6, h: 0.5, d: 0.5 }, position: { x: 0, y: 0, z: 0 } }, reserved: true, size: { w: 0.6, h: 0.5, d: 0.5 }, label: 'Reserved space' };
  }

  _insert(made, pos) {
    made.piece.position = { x: pos.x, y: pos.y, z: 0 };
    if (made.reserved) this.draft.reserved.push(made.piece); else this.draft.members.push(made.piece);
    if (made.instance) this.newInstances.push(made.instance);
    this.sel = made.piece.id;
    this.commit(`Add ${made.label}`);
  }

  remove(id) {
    const p = this._piece(id); if (!p) return;
    this.draft.members = this.draft.members.filter((m) => m.id !== id);
    this.draft.reserved = this.draft.reserved.filter((r) => r.id !== id);
    if (p.instanceId) this.newInstances = this.newInstances.filter((i) => i.id !== p.instanceId);
    if (this.sel === id) this.sel = null;
    this.commit('Remove');
  }

  duplicate(id) {
    const p = this._piece(id); if (!p) return;
    const size = this._size(p), me = this.boxes.find((b) => b.id === id);
    const slot = freeSlotNear(me, size, this.boxes, { alignment: this.draft.alignment, maxD: assemblyMaxDepth(this.draft, this.lib), limit: this.draft.limit });
    if (!slot) { toast('No free position next to it', 'warn'); return; }
    const made = p.kind === 'enclosure' ? this._makePiece({ kind: 'enclosure', tpl: p.enclosureId }) : p.kind === 'module' ? { piece: { ...cloneData(p), id: itemId('m') }, size, label: 'module' } : { piece: { ...cloneData(p), id: itemId('r') }, reserved: true, size, label: 'reserved space' };
    this._insert(made, slot);
  }

  replace(p, templateId) {
    const t = this.app.editor.lib.templates.get(templateId); if (!t) return;
    const size = { w: t.dimensions.width, h: t.dimensions.height + t.bottom.base, d: t.dimensions.depth };
    const box = candidateBox(p.position.x, p.position.y, size, this.draft.alignment, assemblyMaxDepth(this.draft, this.lib), p.position.z);
    if (collisions(box, this.boxes, p.id).length) { toast(`${t.name} does not fit in that position`, 'warn'); this.renderProps(); return; }
    const inst = createInstance(t, { instances: [...this.app.editor.doc.instances, ...this.newInstances] });
    this.newInstances = this.newInstances.filter((i) => i.id !== p.instanceId);
    this.newInstances.push(inst);
    p.enclosureId = t.id; p.instanceId = inst.id;
    this.commit(`Replace with ${t.name}`);
  }

  nudge(id, dx, dy) {
    const p = this._piece(id); if (!p) return;
    this._tryMove(p, { x: +(p.position.x + dx).toFixed(4), y: +(p.position.y + dy).toFixed(4), z: p.position.z }, 'Nudge');
  }

  openEnclosure(p) {
    const t = this.app.editor.lib.templates.get(p.enclosureId); if (!t) return;
    this.app.openDesigner(t, { instanceId: p.instanceId, onClose: () => { this._remountStage(); this.renderLeft(); this.commit('Enclosure edited'); } });
  }

  _remountStage() { if (!this.el) return; this.stage.mount(this.el.querySelector('[data-role=stage]')); this._preview(true); }

  save() {
    const lib = this.lib;
    const a = normalizeAssembly(normalizeOrigin(cloneData(this.draft), lib));
    if (!a.members.length && !a.reserved.length) { toast('The assembly is empty', 'warn'); return; }
    for (const i of this.newInstances) { if (this._pendingCodes?.[i.id]) i.code = this._pendingCodes[i.id]; }
    const insts = this.newInstances.filter((i) => a.members.some((m) => m.instanceId === i.id)).map((i) => normalizeInstance(i, lib.templates.get(i.templateId)));
    if (this._pendingCodes) for (const [id, code] of Object.entries(this._pendingCodes)) { const i = this.app.editor.doc.instances.find((x) => x.id === id); if (i) i.code = code; }
    const saved = this.onSave ? this.onSave(a, insts) : this.app.editor.saveAssembly(a, insts);
    toast(`Saved “${a.name}” to My Assemblies — ${cm(this.stats.width)} × ${cm(this.stats.depth)} × ${cm(this.stats.height)} cm`);
    this.saved = saved || a;
    this.close();
  }

  // ------------------------------------------------------------------ preview
  _preview(fit = false) {
    clearTimeout(this._pt);
    this._pt = setTimeout(() => {
      if (!this.el) return;
      const lib = this.lib;
      const { parts, size } = assemblyParts(this.app.modes.planner.mats, this.draft, lib, { instanceState: (m) => { const i = lib.instances.get(m.instanceId); return { occupied: i ? i.props.occupied : true, lighting: i ? i.props.lighting : true }; } });
      this.stage.setParts(parts);
      const key = `${size.w.toFixed(2)}|${size.h.toFixed(2)}`;
      if (fit || this._fitKey !== key) { this.stage.frame(size, { dir: [0.45, 0.22, 1], margin: 1.05 }); this._fitKey = key; }
    }, fit ? 0 : 120);
  }

  // ------------------------------------------------------------------ elevation canvas
  _resize() {
    const host = this.canvas.parentElement, dpr = window.devicePixelRatio || 1;
    this.cw = host.clientWidth; this.ch = host.clientHeight;
    this.canvas.width = Math.round(this.cw * dpr); this.canvas.height = Math.round(this.ch * dpr);
    this.canvas.style.width = this.cw + 'px'; this.canvas.style.height = this.ch + 'px';
    this.dpr = dpr;
    if (!this.view.fitted) this.fit();
    this._draw();
  }

  fit() {
    const st = this.stats;
    const w = Math.max(1.8, st.width + 0.8), h = Math.max(1.6, st.height + 0.6);
    this.view.scale = Math.min((this.cw - 80) / w, (this.ch - 90) / (h + 0.6));
    this.view.ox = (this.cw - st.width * this.view.scale) / 2;
    this.view.oy = this.ch - Math.max(90, 0.6 * this.view.scale); // room below the floor: drop there to insert under the structure
    this.view.fitted = true;
    this._draw();
  }

  toScreen(x, y) { return [this.view.ox + x * this.view.scale, this.view.oy - y * this.view.scale]; }
  toWorld(px, py) { return [(px - this.view.ox) / this.view.scale, (this.view.oy - py) / this.view.scale]; }

  _img(key, make) {
    let e = this.images.get(key);
    if (!e) { e = { img: null }; this.images.set(key, e); make().then((url) => { if (!url) return; const im = new Image(); im.onload = () => { e.img = im; this._draw(); }; im.src = url; }); }
    return e.img;
  }

  _draw() {
    if (!this.el || this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._paint(); });
  }

  _paint() {
    const g = this.ctx2d, v = this.view, dpr = this.dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#101113'; g.fillRect(0, 0, this.cw, this.ch);
    // grid: 10 cm minor, 1 m major
    const [wx0, wy1] = this.toWorld(0, 0), [wx1, wy0] = this.toWorld(this.cw, this.ch);
    const minor = v.scale > 90 ? 0.1 : 0.5;
    g.lineWidth = 1;
    for (let x = Math.floor(wx0 / minor) * minor; x <= wx1; x += minor) { const [sx] = this.toScreen(x, 0); g.strokeStyle = Math.abs(x - Math.round(x)) < 1e-6 ? '#24262a' : '#18191c'; g.beginPath(); g.moveTo(Math.round(sx) + 0.5, 0); g.lineTo(Math.round(sx) + 0.5, this.ch); g.stroke(); }
    for (let y = Math.floor(wy0 / minor) * minor; y <= wy1; y += minor) { const [, sy] = this.toScreen(0, y); g.strokeStyle = Math.abs(y - Math.round(y)) < 1e-6 ? '#24262a' : '#18191c'; g.beginPath(); g.moveTo(0, Math.round(sy) + 0.5); g.lineTo(this.cw, Math.round(sy) + 0.5); g.stroke(); }
    // floor line
    const [, fy] = this.toScreen(0, 0);
    g.fillStyle = '#16171a'; g.fillRect(0, fy, this.cw, this.ch - fy);
    g.strokeStyle = '#4a4c52'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, fy); g.lineTo(this.cw, fy); g.stroke();
    g.fillStyle = '#5d5a55'; g.font = '10px var(--mono), monospace'; g.fillText('FLOOR — drop below it to insert under the structure', 8, fy + 14);

    const lib = this.lib, boxes = this.boxes, st = this.stats;
    const drag = this.drag;
    // optional physical boundary
    if (this.draft.limit) { const ext = boxesExtent(boxes); const [lx, ly] = this.toScreen(ext.x0, this.draft.limit.h); g.setLineDash([6, 4]); g.strokeStyle = '#8a6a3a'; g.strokeRect(lx, ly, this.draft.limit.w * v.scale, this.draft.limit.h * v.scale); g.setLineDash([]); }
    // structural frame
    if (this.draft.frame.mode !== 'none' && boxes.length) this._paintFrame(g, boxes);
    for (const b of boxes) {
      const moving = drag?.pieceId === b.id;
      if (moving) continue;
      this._paintPiece(g, b, lib, { selected: this.sel === b.id });
    }
    // dimension lines (overall)
    if (boxes.length) {
      const ext = boxesExtent(boxes);
      const [ax, ay] = this.toScreen(ext.x0, 0), [bx] = this.toScreen(ext.x1, 0), [, ty] = this.toScreen(0, ext.y1);
      g.strokeStyle = '#8b877f'; g.fillStyle = '#b9b5ad'; g.lineWidth = 1; g.font = '11px var(--mono), monospace';
      g.beginPath(); g.moveTo(ax, ay + 26); g.lineTo(bx, ay + 26); g.moveTo(ax, ay + 20); g.lineTo(ax, ay + 32); g.moveTo(bx, ay + 20); g.lineTo(bx, ay + 32); g.stroke();
      const wl = `${cm(st.width)} cm`; g.fillText(wl, (ax + bx) / 2 - g.measureText(wl).width / 2, ay + 44);
      g.beginPath(); g.moveTo(ax - 26, ay); g.lineTo(ax - 26, ty); g.moveTo(ax - 32, ay); g.lineTo(ax - 20, ay); g.moveTo(ax - 32, ty); g.lineTo(ax - 20, ty); g.stroke();
      g.save(); g.translate(ax - 32, (ay + ty) / 2); g.rotate(-Math.PI / 2); const hl = `${cm(st.height)} cm`; g.fillText(hl, -g.measureText(hl).width / 2, -4); g.restore();
    }
    // candidate (dragged piece)
    if (drag?.cand) {
      const c = drag.cand, box = { ...c.box, id: '__cand', kind: drag.kind, member: drag.piece, reserved: drag.reserved ? drag.piece : null, size: drag.size };
      g.globalAlpha = 0.92; this._paintPiece(g, box, lib, { ghost: true }); g.globalAlpha = 1;
      const [x, y] = this.toScreen(c.box.x0, c.box.y1);
      g.lineWidth = 2.5; g.strokeStyle = c.valid ? GREEN : RED; g.strokeRect(x, y, drag.size.w * v.scale, drag.size.h * v.scale);
      if (!c.valid) { g.fillStyle = 'rgba(224,83,63,0.18)'; g.fillRect(x, y, drag.size.w * v.scale, drag.size.h * v.scale); for (const o of c.collisions) { const [ox, oy] = this.toScreen(o.x0, o.y1); g.strokeStyle = RED; g.lineWidth = 1.5; g.strokeRect(ox, oy, (o.x1 - o.x0) * v.scale, (o.y1 - o.y0) * v.scale); } }
      // magnetic guides
      g.setLineDash([5, 4]); g.strokeStyle = AMBER; g.lineWidth = 1.2;
      for (const gd of c.guides) {
        if (gd.axis === 'x') { const [sx] = this.toScreen(gd.v, 0); const ys = [c.box.y0, c.box.y1, gd.o?.y0 ?? 0, gd.o?.y1 ?? 0]; const [, s0] = this.toScreen(0, Math.max(...ys) + 0.08), [, s1] = this.toScreen(0, Math.min(...ys) - 0.08); g.beginPath(); g.moveTo(sx, s0); g.lineTo(sx, s1); g.stroke(); }
        else { const [, sy] = this.toScreen(0, gd.v); const xs = [c.box.x0, c.box.x1, gd.o?.x0 ?? c.box.x0, gd.o?.x1 ?? c.box.x1]; const [s0] = this.toScreen(Math.min(...xs) - 0.08, 0), [s1] = this.toScreen(Math.max(...xs) + 0.08, 0); g.beginPath(); g.moveTo(s0, sy); g.lineTo(s1, sy); g.stroke(); }
      }
      g.setLineDash([]);
      const lbl = `${cm(c.box.x0 - (boxesExtent(this.boxes.filter((b) => b.id !== drag.pieceId)).x0 || 0))} , ${cm(c.box.y0)} cm${c.valid ? '' : c.outOfLimit ? ' · outside limit' : ' · overlaps'}`;
      g.font = '11px var(--mono), monospace'; const tw = g.measureText(lbl).width;
      g.fillStyle = 'rgba(10,11,12,.85)'; g.fillRect(x, y - 22, tw + 12, 18); g.fillStyle = c.valid ? '#cfe9d6' : '#f3b3a8'; g.fillText(lbl, x + 6, y - 9);
    }
    this.el.querySelector('[data-role=hint]').hidden = boxes.length > 0 || !!drag;
    this.el.querySelector('[data-role=status]').textContent = `${st.enclosures} enclosures · ${st.rackBoxes} rack boxes · ${st.modules} modules · ${st.reserved} reserved   ${cm(st.width)} × ${cm(st.height)} × ${cm(st.depth)} cm (W × H × max D)`;
  }

  _paintFrame(g, boxes) {
    const ext = boxesExtent(boxes), f = this.draft.frame.profile, s = this.view.scale;
    g.fillStyle = this.draft.frame.color === 'alu' ? '#8e8d88' : '#3a3c41';
    const [x0, yTop] = this.toScreen(ext.x0 - f, ext.y1 + (this.draft.frame.topRail ? f : 0)), [x1, yb] = this.toScreen(ext.x1 + f, 0);
    g.fillRect(x0, yTop, f * s, yb - yTop); g.fillRect(x1 - f * s, yTop, f * s, yb - yTop);
    if (this.draft.frame.topRail) g.fillRect(x0, yTop, x1 - x0, f * s);
    if (this.draft.frame.shelves) for (const b of boxes) if (b.kind !== 'reserved' && b.y0 > 0.001) { const [bx, by] = this.toScreen(b.x0, b.y0); g.fillRect(bx, by, (b.x1 - b.x0) * s, Math.max(2, Math.min(0.03, f) * s)); g.fillStyle = '#b8742e'; g.fillRect(bx, by + 1, (b.x1 - b.x0) * s, 1); g.fillStyle = this.draft.frame.color === 'alu' ? '#8e8d88' : '#3a3c41'; }
  }

  _paintPiece(g, b, lib, { selected = false, ghost = false } = {}) {
    const s = this.view.scale;
    const [x, y] = this.toScreen(b.x0, b.y1), w = (b.x1 - b.x0) * s, h = (b.y1 - b.y0) * s;
    if (b.kind === 'reserved') {
      g.fillStyle = 'rgba(232,145,58,0.05)'; g.fillRect(x, y, w, h);
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = 'rgba(232,145,58,0.18)'; g.lineWidth = 1;
      for (let k = -h; k < w; k += 10) { g.beginPath(); g.moveTo(x + k, y + h); g.lineTo(x + k + h, y); g.stroke(); } g.restore();
      g.setLineDash([6, 4]); g.strokeStyle = '#a8773f'; g.lineWidth = 1.2; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); g.setLineDash([]);
      this._label(g, x, y, w, h, (b.reserved || b.member)?.label || 'Reserved', `${cm(b.size.w)}×${cm(b.size.h)}`, '#c9a57a');
    } else {
      const m = b.member;
      let img = null, title = '', sub = '';
      if (m.kind === 'module') { img = this._img(`mf|${JSON.stringify(m.module)}`, () => this.app.libraryImages.moduleFront(m.module)); title = MODULE_TYPES[m.module.type].label; sub = `${cm(m.module.w)}×${cm(m.module.h)}`; }
      else {
        const t = lib.templates.get(m.enclosureId), inst = lib.instances.get(m.instanceId);
        if (t) img = this._img(`tf|${t.id}|${t.metadata.modified}|${JSON.stringify(t.dimensions)}`, () => this.app.libraryImages.templateFront(t));
        title = inst?.code || t?.name || ''; sub = t ? `${cm(t.dimensions.width)}×${cm(t.dimensions.height)}` : '';
      }
      if (img) g.drawImage(img, x, y, w, h);
      else { g.fillStyle = '#23252a'; g.fillRect(x, y, w, h); g.strokeStyle = '#3a3d43'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      if (!ghost) this._label(g, x, y, w, h, title, sub, '#e7e4de');
    }
    if (selected) {
      g.strokeStyle = AMBER; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      const k = Math.min(14, w / 4, h / 4); g.lineWidth = 3;
      for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { g.beginPath(); g.moveTo(cx + sx * k, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * k); g.stroke(); }
    }
  }

  _label(g, x, y, w, h, title, sub, color) {
    if (w < 40 || h < 22) return;
    g.font = `600 ${Math.max(9, Math.min(12, w / 9))}px var(--font), sans-serif`;
    const tw = Math.min(w - 8, g.measureText(title).width + 10);
    g.fillStyle = 'rgba(10,11,12,0.72)'; g.fillRect(x + 4, y + 4, tw, 16);
    g.fillStyle = color; g.fillText(title, x + 9, y + 16, w - 16);
    if (h > 44 && w > 60) { g.font = '10px var(--mono), monospace'; g.fillStyle = 'rgba(10,11,12,0.6)'; const sw = g.measureText(sub).width + 8; g.fillRect(x + 4, y + h - 18, sw, 14); g.fillStyle = '#b9b5ad'; g.fillText(sub, x + 8, y + h - 8); }
  }

  // ------------------------------------------------------------------ pointer: palette drag, piece drag, pan, zoom
  _hit(px, py) {
    const [wx, wy] = this.toWorld(px, py);
    const hits = this.boxes.filter((b) => wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1);
    hits.sort((a, b) => (a.x1 - a.x0) * (a.y1 - a.y0) - (b.x1 - b.x0) * (b.y1 - b.y0));
    return hits[0] || null;
  }

  _local(e) { const r = this.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom }; }

  _bindPointer() {
    // palette → workspace (pointer based: reliable across browsers, no HTML5 DnD quirks)
    this.left.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('[data-drag]'); if (!card || e.button !== 0) return;
      e.preventDefault();
      const src = { kind: card.dataset.drag, tpl: card.dataset.tpl, module: card.dataset.module };
      const made = this._makePiece(src);
      this.drag = { from: 'palette', kind: made.reserved ? 'reserved' : made.piece.kind, piece: made.piece, made, size: made.size, reserved: made.reserved, grab: { x: made.size.w / 2, y: made.size.h / 2 }, cand: null };
      this.ghostEl.innerHTML = card.querySelector('.pal-thumb')?.outerHTML || `<b>${esc(made.label)}</b>`;
      this.ghostEl.hidden = false; this._ghostAt(e);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      const l = this._local(e);
      if (e.button === 2 || e.button === 1) { this.pan = { x: e.clientX, y: e.clientY, ox: this.view.ox, oy: this.view.oy }; e.preventDefault(); return; }
      if (e.button !== 0) return;
      const b = this._hit(l.x, l.y);
      if (!b) { this.sel = null; this.renderProps(); this._draw(); return; }
      this.sel = b.id; this.renderProps();
      const [wx, wy] = this.toWorld(l.x, l.y);
      const p = this._piece(b.id);
      this.drag = { from: 'piece', pieceId: b.id, kind: b.kind, piece: p, size: b.size, reserved: b.kind === 'reserved', grab: { x: wx - b.x0, y: wy - b.y0 }, start: { x: l.x, y: l.y }, moved: false, cand: null };
      this._draw();
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const l = this._local(e), [wx, wy] = this.toWorld(l.x, l.y);
      const k = Math.exp(-e.deltaY * 0.0015);
      this.view.scale = Math.min(900, Math.max(30, this.view.scale * k));
      this.view.ox = l.x - wx * this.view.scale; this.view.oy = l.y + wy * this.view.scale;
      this._draw();
    }, { passive: false });
    this.canvas.addEventListener('dblclick', (e) => { const l = this._local(e); const b = this._hit(l.x, l.y); if (b?.member?.kind === 'enclosure') this.openEnclosure(b.member); });
    this._pm = (e) => this._move(e);
    this._pu = (e) => this._up(e);
    window.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
  }

  _ghostAt(e) { this.ghostEl.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 12}px)`; }

  _move(e) {
    if (this.pan) { this.view.ox = this.pan.ox + (e.clientX - this.pan.x); this.view.oy = this.pan.oy + (e.clientY - this.pan.y); this._draw(); return; }
    const d = this.drag; if (!d) { if (this.el && e.target === this.canvas) { const l = this._local(e); this.canvas.style.cursor = this._hit(l.x, l.y) ? 'grab' : ''; } return; }
    const l = this._local(e);
    if (d.from === 'palette') { this._ghostAt(e); this.ghostEl.hidden = l.inside; if (!l.inside) { d.cand = null; this._draw(); return; } }
    if (d.from === 'piece' && !d.moved) { if (Math.hypot(l.x - d.start.x, l.y - d.start.y) < 4) return; d.moved = true; this.canvas.style.cursor = 'grabbing'; }
    const [wx, wy] = this.toWorld(l.x, l.y);
    const raw = { x: wx - d.grab.x, y: wy - d.grab.y };
    const lib = this.lib;
    const opts = { grid: this.grid, threshold: (this.snapOn && !e.altKey) ? SNAP_PX / this.view.scale : 0, alignment: this.draft.alignment, maxD: Math.max(assemblyMaxDepth(this.draft, lib), d.size.d), ignoreId: d.pieceId || null, dz: d.piece?.position?.z || 0, limit: this.draft.limit };
    d.cand = snapPlacement(raw, d.size, this.boxes, opts);
    this._draw();
  }

  _up(e) {
    if (this.pan) { this.pan = null; return; }
    const d = this.drag; if (!d) return;
    this.drag = null; this.ghostEl.hidden = true; this.canvas.style.cursor = '';
    if (d.from === 'palette') {
      if (d.cand && this._local(e).inside) {
        if (d.cand.valid) this._insert(d.made, { x: d.cand.x, y: d.cand.y });
        else { toast(d.cand.outOfLimit ? 'Outside the maximum size of the assembly' : `Overlaps ${d.cand.collisions.length} piece(s) — not placed`, 'warn'); this._draw(); }
      } else this._draw();
      return;
    }
    if (!d.moved) { this._draw(); return; }
    if (d.cand?.valid) { d.piece.position = { x: d.cand.x, y: d.cand.y, z: d.piece.position.z || 0 }; this.commit('Move'); }
    else { toast('Overlaps — moved back', 'warn'); this._draw(); }
  }

  _onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = b.dataset.act, p = this.sel && this._piece(this.sel);
    if (a === 'undo') this.undo(); else if (a === 'redo') this.redo();
    else if (a === 'save') this.save();
    else if (a === 'cancel') { if (this.hist.canUndo() && !confirm('Discard the changes to this assembly?')) return; this.close(); }
    else if (a === 'fit') this.fit();
    else if (a === 'snap') { this.snapOn = !this.snapOn; b.classList.toggle('on', this.snapOn); }
    else if (a === 'newtpl') this.app.openDesigner(null, { onClose: () => { this._remountStage(); this.renderLeft(); } });
    else if (a === 'del' && p) this.remove(p.id);
    else if (a === 'dup' && p) this.duplicate(p.id);
    else if (a === 'open' && p) this.openEnclosure(p);
    else if (a === 'fitw' && p?.kind === 'module') { const ext = boxesExtent(this.boxes.filter((x) => x.id !== p.id)); this._tryResize(p, () => { p.module = { ...p.module, w: +(ext.x1 - ext.x0).toFixed(4) }; p.position = { ...p.position, x: ext.x0 }; }, 'Full width'); }
  }

  _onKey(e) {
    if (!this.el || this.app.modal !== this) return;
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = (tag === 'input' && !['checkbox', 'range'].includes(e.target.type)) || tag === 'textarea' || tag === 'select';
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (typing) { if (k === 'escape') e.target.blur(); e.stopPropagation(); return; }
    const step = e.shiftKey ? this.grid * 10 : this.grid;
    let handled = true;
    if (ctrl && k === 'z' && !e.shiftKey) this.undo();
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) this.redo();
    else if (ctrl && k === 'd') { if (this.sel) this.duplicate(this.sel); }
    else if (ctrl && k === 's') this.save();
    else if ((k === 'delete' || k === 'backspace') && this.sel) this.remove(this.sel);
    else if (k === 'arrowleft' && this.sel) this.nudge(this.sel, -step, 0);
    else if (k === 'arrowright' && this.sel) this.nudge(this.sel, step, 0);
    else if (k === 'arrowup' && this.sel) this.nudge(this.sel, 0, step);
    else if (k === 'arrowdown' && this.sel) this.nudge(this.sel, 0, -step);
    else if (k === 'g') { this.snapOn = !this.snapOn; this.el.querySelector('[data-act=snap]').classList.toggle('on', this.snapOn); }
    else if (k === 'escape') { if (this.drag) { this.drag = null; this.ghostEl.hidden = true; this._draw(); } else if (this.sel) { this.sel = null; this.renderProps(); this._draw(); } }
    else handled = false;
    e.stopPropagation();
    if (handled) e.preventDefault();
  }
}

export { outOfLimit };
