import { getType, CATEGORIES } from '../objects/catalog.js';
import { WALLS } from '../model/RoomDocument.js';
import { icon } from './icons.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;
const cm = (m) => Math.round(m * 1000) / 10;

function num(label, key, value, { unit = '', step = 1, min, max, disabled = false } = {}) {
  return `<label class="fld"><span>${label}</span><div class="num"><input type="number" data-key="${key}" value="${value}" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} ${disabled ? 'disabled' : ''}><em>${unit}</em></div></label>`;
}
function text(label, key, value, ph = '') { return `<label class="fld fld-wide"><span>${label}</span><input type="text" data-key="${key}" value="${esc(value)}" placeholder="${esc(ph)}" spellcheck="false"></label>`; }
function toggle(label, key, on, hint = '') { return `<label class="tgl"><input type="checkbox" data-key="${key}" ${on ? 'checked' : ''}><i></i><span>${label}</span>${hint ? `<em>${hint}</em>` : ''}</label>`; }

/** Collapsible properties inspector: object properties when selected, room properties otherwise. */
export class Inspector {
  constructor(app, el) {
    this.app = app; this.el = el;
    el.innerHTML = `<div class="panel-head"><span class="panel-title">${icon('inspector')} Properties</span></div><div class="insp-body"></div>`;
    this.body = el.querySelector('.insp-body');
    this.body.addEventListener('change', (e) => this.onField(e));
    this.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input[type=number],input[type=text]')) e.target.blur(); });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.refresh();
  }

  refresh() {
    if (this.body.contains(document.activeElement) && document.activeElement.matches('input,textarea,select') && this._lastSel === this.app.editor.selection) {
      this._pending = true; return; // do not rebuild while the user is typing
    }
    this._lastSel = this.app.editor.selection;
    const o = this.app.editor.selected;
    this.body.innerHTML = o ? this.objectHTML(o) : this.roomHTML();
  }

  objectHTML(o) {
    const t = getType(o.type), ed = this.app.editor, room = ed.room;
    const view = this.app.objects.get(o.id);
    const coll = ed.snapper.collisions(o);
    const cat = CATEGORIES.find((c) => c.id === t.category)?.label;
    const wallBound = t.placement === 'opening' || t.placement === 'mounted';
    let h = `<div class="insp-title"><span class="chip">${esc(cat)}</span><input class="name" type="text" data-key="name" value="${esc(o.name)}" spellcheck="false"><span class="insp-sub">${esc(t.label)} · ${esc(t.sub)}</span></div>`;
    if (view?.missing) h += `<div class="alert warn">${icon('warn')} 3D model unavailable — showing placeholder. Logical data is unaffected.</div>`;
    if (coll.length) h += `<div class="alert err">${icon('warn')} Overlaps ${coll.map((id) => esc(ed.get(id)?.name)).join(', ')}</div>`;
    h += `<div class="insp-actions">
      <button data-act="focus" title="Focus (F)">${icon('focus')}</button>
      <button data-act="rotl" title="Rotate −90° (Shift+R)" ${wallBound ? 'disabled' : ''}>${icon('rotl')}</button>
      <button data-act="rotr" title="Rotate +90° (R)" ${wallBound ? 'disabled' : ''}>${icon('rotr')}</button>
      <button data-act="dup" title="Duplicate (Ctrl+D)">${icon('dup')}</button>
      <button data-act="lock" class="${o.locked ? 'on' : ''}" title="Lock position">${icon('lock')}</button>
      <button data-act="del" class="danger" title="Delete (Del)">${icon('trash')}</button></div>`;
    h += `<section class="grp"><h4>Position</h4><div class="grid2">`;
    if (wallBound) {
      h += `<label class="fld"><span>Wall</span><select data-key="mount.wall">${WALLS.map((w) => `<option ${o.mount?.wall === w ? 'selected' : ''} value="${w}">${w[0].toUpperCase() + w.slice(1)}</option>`).join('')}</select></label>`;
      h += num('Offset', 'mount.offset', r2(o.mount?.offset ?? 0), { unit: 'm', step: 0.05, min: 0 });
      h += num(t.placement === 'opening' ? 'Sill' : 'Height', 'elevation', cm(o.elevation), { unit: 'cm', step: 5, min: 0 });
    } else {
      h += num('X', 'position.x', r2(o.position.x), { unit: 'm', step: 0.05 });
      h += num('Z', 'position.z', r2(o.position.z), { unit: 'm', step: 0.05 });
      h += num('Elevation', 'elevation', cm(o.elevation), { unit: 'cm', step: 1, min: 0 });
      h += num('Rotation', 'rotation', Math.round(o.rotation * 10) / 10, { unit: '°', step: 15 });
    }
    h += `</div></section>`;
    h += `<section class="grp"><h4>Dimensions <button class="link" data-act="resetsize">reset</button></h4><div class="grid3">`;
    h += num('Width', 'size.w', cm(o.size.w), { unit: 'cm', step: 5, min: 2, disabled: !t.resizable });
    h += num(t.placement === 'opening' ? 'Wall' : 'Depth', 'size.d', cm(t.placement === 'opening' ? room.wallThickness : o.size.d), { unit: 'cm', step: 5, min: 1, disabled: !t.resizable || t.placement === 'opening' });
    h += num('Height', 'size.h', cm(o.size.h), { unit: 'cm', step: 5, min: 2, disabled: !t.resizable });
    h += `</div></section>`;
    if (t.enclosure) {
      const occ = o.props.occupied !== false;
      h += `<section class="grp"><h4>Enclosure</h4>
        ${toggle('Occupied', 'props.occupied', occ, occ ? 'animal present' : 'empty · dimmed')}
        ${toggle('Lighting', 'props.lighting', o.props.lighting !== false, 'LED / UV fixtures')}
        ${text('Species', 'props.animal.species', o.props.animal?.species, 'e.g. Python regius')}
        ${text('Animal / ID', 'props.animal.code', o.props.animal?.code, 'e.g. PR-01')}
        <label class="fld fld-wide"><span>Notes</span><textarea data-key="props.notes" rows="2" placeholder="Husbandry notes…">${esc(o.props.notes || '')}</textarea></label>
      </section>`;
    }
    h += `<details class="grp raw"><summary>Logical record (exported JSON)</summary><pre>${esc(JSON.stringify(o, null, 2))}</pre></details>`;
    return h;
  }

  roomHTML() {
    const ed = this.app.editor, r = ed.room;
    const enc = ed.objects.filter((o) => getType(o.type)?.enclosure);
    const occ = enc.filter((o) => o.props.occupied !== false);
    const walls = ['none', ...WALLS];
    return `<div class="insp-title"><span class="chip">Room</span><input class="name" type="text" data-room="name" value="${esc(r.name)}" spellcheck="false"><span class="insp-sub">Nothing selected — room properties</span></div>
      <section class="grp"><h4>Room dimensions</h4><div class="grid2">
        <label class="fld"><span>Width</span><div class="num"><input type="number" data-room="width" value="${r.width}" step="0.1" min="1.5" max="30"><em>m</em></div></label>
        <label class="fld"><span>Depth</span><div class="num"><input type="number" data-room="depth" value="${r.depth}" step="0.1" min="1.5" max="30"><em>m</em></div></label>
        <label class="fld"><span>Height</span><div class="num"><input type="number" data-room="height" value="${r.height}" step="0.05" min="2.1" max="6"><em>m</em></div></label>
        <label class="fld"><span>Walls</span><div class="num"><input type="number" data-room="wallThickness" value="${cm(r.wallThickness)}" step="1" min="6" max="60"><em>cm</em></div></label>
      </div></section>
      <section class="grp"><h4>Finishes</h4>
        <label class="fld fld-wide"><span>Feature wall (graphite)</span><select data-room="finishes.accentWall">${walls.map((w) => `<option value="${w}" ${r.finishes.accentWall === w ? 'selected' : ''}>${w[0].toUpperCase() + w.slice(1)}</option>`).join('')}</select></label>
      </section>
      <section class="grp"><h4>Summary</h4>
        <div class="stats"><div><b>${ed.objects.length}</b><span>objects</span></div><div><b>${enc.length}</b><span>enclosures</span></div><div><b>${occ.length}</b><span>occupied</span></div><div><b>${(r.width * r.depth).toFixed(1)}</b><span>m² floor</span></div></div>
      </section>
      <section class="grp keys"><h4>Shortcuts</h4>
        <dl><dt>Orbit / pan / zoom</dt><dd>LMB · RMB · wheel</dd><dt>Move</dt><dd>drag object · arrows</dd><dt>Rotate</dt><dd>ring handle · R / Shift+R</dd>
        <dt>Duplicate · delete</dt><dd>Ctrl+D · Del</dd><dt>Focus</dt><dd>F · double-click</dd><dt>Views</dt><dd>1 top · 2 front · 3/4 sides · 5 iso · 6 interior · 0 reset</dd>
        <dt>Snapping</dt><dd>G toggle · Alt bypass</dd><dt>Undo · redo</dt><dd>Ctrl+Z · Ctrl+Y</dd></dl>
      </section>`;
  }

  onField(e) {
    const el = e.target, ed = this.app.editor;
    if (el.dataset.room) {
      const k = el.dataset.room; let v = el.type === 'number' ? Number(el.value) : el.value;
      if (k === 'wallThickness') v = v / 100;
      if (k.startsWith('finishes.')) ed.setRoom({ finishes: { [k.split('.')[1]]: v } });
      else ed.setRoom({ [k]: v });
      this._pending = false; this.refresh();
      return;
    }
    const o = ed.selected; if (!o || !el.dataset.key) return;
    const k = el.dataset.key;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if (el.type === 'number' && !Number.isFinite(v)) { this.refresh(); return; }
    const patch = {};
    if (k === 'name') patch.name = v;
    else if (k === 'rotation') patch.rotation = v;
    else if (k === 'elevation') patch.elevation = v / 100;
    else if (k.startsWith('position.')) patch.position = { [k.split('.')[1]]: v };
    else if (k.startsWith('size.')) patch.size = { [k.split('.')[1]]: v / 100 };
    else if (k.startsWith('mount.')) patch.mount = { ...o.mount, [k.split('.')[1]]: v };
    else if (k.startsWith('props.animal.')) patch.props = { animal: { ...(o.props.animal || {}), [k.split('.')[2]]: v } };
    else if (k.startsWith('props.')) patch.props = { [k.split('.')[1]]: v };
    ed.update(o.id, patch);
    this._pending = false;
    if (el.type === 'checkbox' || el.tagName === 'SELECT') this.refresh();
  }

  onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const app = this.app, o = app.editor.selected; if (!o) return;
    const a = b.dataset.act;
    if (a === 'focus') app.focusSelected();
    else if (a === 'rotl') app.rotateSelected(-90);
    else if (a === 'rotr') app.rotateSelected(90);
    else if (a === 'dup') app.duplicateSelected();
    else if (a === 'del') app.deleteSelected();
    else if (a === 'lock') { app.editor.update(o.id, { locked: !o.locked }); if (!o.locked) delete o.locked; this.refresh(); }
    else if (a === 'resetsize') app.editor.update(o.id, { size: { ...getType(o.type).size } });
  }
}
