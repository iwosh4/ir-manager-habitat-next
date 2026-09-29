import { icon } from './icons.js';
import { QUALITY } from '../renderer/quality.js';
import { formatDims, dimsOrderLabel } from '../model/Dimensions.js';

const btn = (id, ico, title, extra = '') => `<button class="tb-btn ${extra}" data-act="${id}" title="${title}">${icon(ico)}</button>`;

/** Compact top toolbar: file, history, snapping, lighting, quality, panels, fullscreen. */
export class Toolbar {
  constructor(app, el) {
    this.app = app; this.el = el;
    const grids = [[0.01, '1 cm'], [0.05, '5 cm'], [0.1, '10 cm'], [0.25, '25 cm']];
    el.innerHTML = `
      <div class="tb-sec tb-brand">
        ${app.bridge ? `<a class="tb-back" href="${app.bridge.backUrl().replace(/"/g, '&quot;')}" data-act="back" title="Zpět do IR Manageru (změny se uloží)">← IR MANAGER</a><span class="tb-sync" data-role="sync" role="status" aria-live="polite"></span>` : ''}
        <div class="brand"><span class="brand-mark"></span><span class="brand-name">IR MANAGER</span><span class="brand-sep"></span><span class="brand-app">Habitat Studio</span></div>
      </div>
      <div class="tb-sec seg seg-mode" data-role="render-mode" title="Render mode — same room, two renderers">
        <button class="seg-btn" data-mode="planner" title="Planner — stylised hand-painted renderer, fast on any GPU">${icon('brush')}<span>Planner</span></button>
        <button class="seg-btn" data-mode="showcase" title="Showcase — realistic renderer (loads on first use)">${icon('camera')}<span>Showcase</span></button>
        <button class="seg-btn" data-mode="techplan" title="Tech plan — water, misting, drainage, electrical and sensor networks (T)">${icon('pipe')}<span>Tech plan</span></button>
      </div>
      <div class="tb-sec">
        ${btn('new', 'file', 'New empty room')}
        ${btn('open', 'open', 'Import room JSON (Ctrl+O)')}
        ${btn('export', 'save', 'Export room JSON (Ctrl+S)')}
        ${app.bridge ? '' : btn('demo', 'demo', 'Load demonstration room')}
        <input type="file" accept="application/json,.json" hidden data-role="file">
      </div>
      <div class="tb-sec">
        ${btn('undo', 'undo', 'Undo (Ctrl+Z)')}
        ${btn('redo', 'redo', 'Redo (Ctrl+Y)')}
      </div>
      <div class="tb-sec">
        ${btn('snap', 'snap', 'Snapping on/off (G)', 'toggle')}
        <select class="tb-select" data-role="grid" title="Grid step">${grids.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        ${btn('dims', 'ruler', 'Dimensions & clearances (M)', 'toggle')}
      </div>
      <div class="tb-sec tb-room"><span class="room-name" data-role="room-name"></span><span class="room-size" data-role="room-size"></span></div>
      <div class="tb-spacer"></div>
      <div class="tb-sec seg" data-role="lighting">
        <button class="seg-btn" data-light="day" title="Daylight">${icon('sun')}<span>Day</span></button>
        <button class="seg-btn" data-light="evening" title="Evening — dimmed room light">${icon('dusk')}<span>Evening</span></button>
        <button class="seg-btn" data-light="night" title="Night — enclosure lighting only">${icon('moon')}<span>Night</span></button>
      </div>
      <div class="tb-sec">
        <label class="tb-label" title="Render quality">${icon('quality')}<select class="tb-select" data-role="quality">${Object.entries(QUALITY).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('')}</select></label>
      </div>
      <div class="tb-sec">
        ${btn('library', 'library', 'Toggle object library ([)', 'toggle')}
        ${btn('inspector', 'inspector', 'Toggle properties ( ] )', 'toggle')}
        ${btn('fullscreen', 'full', 'Fullscreen (F11)')}
      </div>`;
    this.file = el.querySelector('[data-role=file]');
    this.file.addEventListener('change', () => { const f = this.file.files[0]; if (f) app.importFile(f); this.file.value = ''; });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]'); const l = e.target.closest('[data-light]'); const md = e.target.closest('[data-mode]');
      if (l) { app.setLighting(l.dataset.light); return; }
      if (md) { app.setRenderMode(md.dataset.mode); this.updateMode(md.dataset.mode); return; }
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'back') { e.preventDefault(); const go = () => { location.href = b.getAttribute('href'); }; const p = app.bridge?.flush(); if (p?.then) p.then(go, go); else go(); return; }
      if (a === 'sync-reload') { if (confirm('Načíst verzi ze serveru? Vaše neuložené změny se zahodí (zůstanou v nouzové kopii tohoto zařízení).')) location.reload(); return; }
      if (a === 'sync-force') { if (confirm('Přepsat serverovou verzi vaší verzí místnosti?')) app.bridge.flush({ force: true }); return; }
      if (a === 'sync-retry') { app.bridge.flush(); return; }
      if (a === 'new') { if (confirm('Start a new empty room? Unsaved changes stay in undo history only.')) app.newRoom(); }
      else if (a === 'open') this.openFile();
      else if (a === 'export') app.exportJSON();
      else if (a === 'demo') { if (confirm('Replace the current room with the demonstration room?')) app.loadDemo(); }
      else if (a === 'undo') app.editor.undo();
      else if (a === 'redo') app.editor.redo();
      else if (a === 'snap') { app.editor.snap.enabled = !app.editor.snap.enabled; this.updateSnap(); }
      else if (a === 'dims') app.setDimensions(!app.prefs.dims);
      else if (a === 'library') app.setPanel('library', !app.prefs.library);
      else if (a === 'inspector') app.setPanel('inspector', !app.prefs.inspector);
      else if (a === 'fullscreen') app.toggleFullscreen();
    });
    const grid = el.querySelector('[data-role=grid]');
    grid.value = String(app.editor.snap.grid);
    grid.addEventListener('change', () => { app.editor.snap.grid = Number(grid.value); });
    const q = el.querySelector('[data-role=quality]');
    q.value = app.engine.qualityKey;
    q.addEventListener('change', () => app.setQuality(q.value));
    document.addEventListener('fullscreenchange', () => { app.root.classList.toggle('is-fullscreen', !!document.fullscreenElement); app.engine.resize(); });
    this.updateAll();
    app.editor.on('change', () => this.updateRoom());
    if (app.bridge) {
      const sync = el.querySelector('[data-role=sync]');
      const L = { idle: '', dirty: 'Neuloženo…', saving: 'Ukládám…', saved: 'Uloženo', offline: 'Offline', conflict: 'Konflikt verzí', error: 'Chyba ukládání' };
      const render = (st, detail) => {
        sync.className = 'tb-sync is-' + st; sync.title = detail || L[st] || '';
        sync.innerHTML = `<i></i><span>${L[st] || ''}</span>` + (st === 'conflict' ? `<button data-act="sync-reload">Načíst serverovou</button><button data-act="sync-force">Přepsat</button>` : st === 'error' || st === 'offline' ? `<button data-act="sync-retry">Zkusit znovu</button>` : '');
      };
      app.bridge.on(render); render(app.bridge.state, app.bridge.detail);
    }
  }

  openFile() { this.file.click(); }

  updateAll() { this.updateMode(); this.updateHistory(); this.updateSnap(); this.updateLighting(); this.updatePanels(); this.updateRoom(); this.updateSelection(); }
  updateHistory() {
    const h = this.app.editor.history;
    this.el.querySelector('[data-act=undo]').disabled = !h.canUndo();
    this.el.querySelector('[data-act=redo]').disabled = !h.canRedo();
  }
  updateSnap() {
    this.el.querySelector('[data-act=snap]').classList.toggle('on', this.app.editor.snap.enabled);
    this.el.querySelector('[data-act=dims]').classList.toggle('on', !!this.app.prefs.dims);
  }
  updateLighting() { for (const b of this.el.querySelectorAll('[data-light]')) b.classList.toggle('on', b.dataset.light === this.app.prefs.lighting); }
  updateMode(pending) {
    const want = pending || this.app.prefs.renderMode, cur = this.app.renderMode;
    for (const b of this.el.querySelectorAll('[data-mode]')) {
      b.classList.toggle('on', b.dataset.mode === want);
      b.classList.toggle('loading', b.dataset.mode === want && want !== cur);
    }
  }
  updatePanels() {
    this.el.querySelector('[data-act=library]').classList.toggle('on', !!this.app.prefs.library);
    this.el.querySelector('[data-act=inspector]').classList.toggle('on', !!this.app.prefs.inspector);
  }
  updateRoom() {
    const r = this.app.editor.room;
    this.el.querySelector('[data-role=room-name]').textContent = r.name;
    this.el.querySelector('[data-role=room-size]').textContent = formatDims(r, { unit: 'm' }); this.el.querySelector('[data-role=room-size]').title = `Room ${dimsOrderLabel()}`;
    this.updateHistory();
  }
  updateSelection() {}
}
