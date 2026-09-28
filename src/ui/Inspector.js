import { getType, CATEGORIES } from '../objects/catalog.js';
import { WALLS } from '../model/RoomDocument.js';
import { assemblyStats, TECH_KINDS, TEMPLATE_CATEGORY } from '../model/Library.js';
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
    const m = this.app.selectedMember;
    this.body.innerHTML = m ? this.memberHTML(m) : o ? this.objectHTML(o) : this.roomHTML();
  }

  objectHTML(o) {
    const t = getType(o.type), ed = this.app.editor, room = ed.room;
    const view = this.app.objects.get(o.id);
    const coll = ed.snapper.collisions(o);
    const c = CATEGORIES.find((c) => c.id === t.category), cat = t.category === 'assembly' || o.type === 'assembly' ? 'Assembly' : c?.chip || c?.label;
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
    const lib = ed.lib;
    if (o.type === 'assembly') {
      const a = lib.assemblies.get(o.ref?.assemblyId), st = a ? assemblyStats(a, lib) : null;
      if (a) h += `<section class="grp"><h4>Assembly</h4>
        <div class="stats"><div><b>${st.enclosures}</b><span>enclosures</span></div><div><b>${st.rackBoxes}</b><span>rack boxes</span></div><div><b>${st.modules}</b><span>modules</span></div><div><b>${st.reserved}</b><span>reserved</span></div></div>
        <div class="codes">${a.members.filter((mm) => mm.instanceId).map((mm) => `<span class="code">${esc(lib.instances.get(mm.instanceId)?.code)}</span>`).join('')}</div>
        <div class="btn-col"><button class="primary" data-act="enter">${icon('focus')} Enter assembly</button><button data-act="builder">${icon('grid')} Edit in Assembly Builder</button></div>
        <p class="hint">In the room the assembly moves, rotates and collides as ONE structure. Enter it (double-click / Enter) to select individual enclosures.</p></section>`;
      h += `<details class="grp raw"><summary>Logical record (exported JSON)</summary><pre>${esc(JSON.stringify({ placement: o, assembly: a }, null, 2))}</pre></details>`;
      return h;
    }
    if (o.type === 'custom_enclosure') {
      const inst = lib.instances.get(o.ref?.instanceId), tpl = inst && lib.templates.get(inst.templateId);
      if (inst && tpl) h += this.instanceHTML(inst, tpl) + `<div class="btn-col"><button data-act="design">${icon('cube')} Open enclosure design</button></div>`;
      h += `<details class="grp raw"><summary>Logical record (exported JSON)</summary><pre>${esc(JSON.stringify({ placement: o, instance: inst }, null, 2))}</pre></details>`;
      return h;
    }
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

  /** Physical enclosure fields (instance): code, occupancy, lighting, animal, devices with stable ids. */
  instanceHTML(inst, tpl) {
    const occ = inst.props.occupied;
    return `<section class="grp"><h4>Physical enclosure <span class="code">${esc(inst.code)}</span></h4>
      <p class="meta">${esc(tpl.name)} · ${cm(tpl.dimensions.width)} × ${cm(tpl.dimensions.height)} × ${cm(tpl.dimensions.depth)} cm · ${esc(TEMPLATE_CATEGORY(tpl))}<br><code>${esc(inst.id)}</code></p>
      ${text('Enclosure code', 'inst.code', inst.code)}
      ${toggle('Occupied', 'inst.props.occupied', occ, occ ? 'animal present' : 'empty · dimmed')}
      ${toggle('Lighting', 'inst.props.lighting', inst.props.lighting, 'LED / UV fixtures')}
      ${text('Species', 'inst.props.animal.species', inst.props.animal.species, 'e.g. Dendrobates tinctorius')}
      ${text('Animal / ID', 'inst.props.animal.code', inst.props.animal.code, 'e.g. DT-02')}
      <label class="fld fld-wide"><span>Notes</span><textarea data-key="inst.props.notes" rows="2" placeholder="Husbandry notes…">${esc(inst.props.notes || '')}</textarea></label>
    </section>
    <section class="grp"><h4>Devices <em class="unit">stable ids</em></h4>${tpl.technology.length ? `<div class="devices">${tpl.technology.map((d) => `<div class="dev"><span>${esc(d.label || TECH_KINDS[d.kind].label)}</span><code>${esc(inst.devices[d.id]?.deviceId || '')}</code></div>`).join('')}</div>` : '<p class="hint">No technology in this design.</p>'}</section>`;
  }

  /** ENTERED assembly → one member selected. */
  memberHTML(m) {
    const inst = m.instance, tpl = m.template, a = m.assembly;
    let h = `<div class="insp-title"><span class="chip">${esc(a.name)} › ${m.reserved ? 'reserved' : m.member.kind === 'module' ? 'module' : 'enclosure'}</span><div class="name ro">${esc(inst?.code || tpl?.name || m.reserved?.label || m.member.module?.type)}</div><span class="insp-sub">Member of an assembly — ids are independent of the structure</span></div>`;
    h += `<div class="btn-col">`;
    if (tpl) h += `<button data-act="design">${icon('cube')} Open enclosure</button>`;
    h += `<button data-act="member-del" class="danger">${icon('trash')} Remove from assembly</button><button data-act="exit">${icon('rotl')} Back to assembly</button></div>`;
    if (tpl) h += `<label class="fld fld-wide"><span>Replace with</span><select data-replace="1"><option value="">— choose enclosure —</option>${this.app.editor.templates.filter((x) => x.id !== tpl.id).map((x) => `<option value="${x.id}">${esc(x.name)} (${cm(x.dimensions.width)}×${cm(x.dimensions.height)})</option>`).join('')}</select></label>`;
    if (inst && tpl) h += this.instanceHTML(inst, tpl);
    return h;
  }

  roomHTML() {
    const ed = this.app.editor, r = ed.room;
    // count physical enclosures: catalogue enclosures, placed custom enclosures and assembly members
    const lib = ed.lib, enc = [], occ = [];
    for (const o of ed.objects) {
      if (o.type === 'assembly') { const a = lib.assemblies.get(o.ref?.assemblyId); for (const m of a?.members || []) if (m.instanceId) { const i = lib.instances.get(m.instanceId); enc.push(i); if (i?.props.occupied) occ.push(i); } }
      else if (o.type === 'custom_enclosure') { const i = lib.instances.get(o.ref?.instanceId); enc.push(i); if (i?.props.occupied) occ.push(i); }
      else if (getType(o.type)?.enclosure) { enc.push(o); if (o.props.occupied !== false) occ.push(o); }
    }
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
    if (el.dataset.replace && el.value) {
      const m = this.app.selectedMember;
      if (m && !ed.replaceMember(m.assembly.id, m.member.id, el.value)) this.app.toast('That enclosure does not fit in this position', 'warn');
      this.refresh(); return;
    }
    const o = ed.selected; if (!o || !el.dataset.key) return;
    const k = el.dataset.key;
    let v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    if (k.startsWith('inst.')) {
      const inst = this.app.selectedMember?.instance || (o.type === 'custom_enclosure' ? ed.lib.instances.get(o.ref?.instanceId) : null);
      if (!inst) return;
      const path = k.slice(5).split('.');
      const patch = path.length === 1 ? { [path[0]]: v } : path.length === 2 ? { props: { [path[1]]: v } } : { props: { animal: { [path[2]]: v } } };
      ed.updateInstance(inst.id, patch);
      if (o.type === 'custom_enclosure' && path[0] === 'code') { const t = ed.lib.templates.get(inst.templateId); ed.update(o.id, { name: `${t.name} · ${v}` }); }
      this._pending = false;
      if (el.type === 'checkbox') this.refresh();
      return;
    }
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
    const lib = app.editor.lib;
    if (a === 'enter') { app.enterAssembly(o.id); return; }
    if (a === 'builder') { app.openBuilder(lib.assemblies.get(o.ref?.assemblyId)); return; }
    if (a === 'exit') { app.selectMember(null); return; }
    if (a === 'member-del') { app.deleteSelected(); return; }
    if (a === 'design') {
      const m = app.selectedMember;
      const inst = m?.instance || lib.instances.get(o.ref?.instanceId);
      const t = m?.template || (inst && lib.templates.get(inst.templateId));
      if (t) app.openDesigner(t, { instanceId: inst?.id });
      return;
    }
    if (a === 'focus') app.focusSelected();
    else if (a === 'rotl') app.rotateSelected(-90);
    else if (a === 'rotr') app.rotateSelected(90);
    else if (a === 'dup') app.duplicateSelected();
    else if (a === 'del') app.deleteSelected();
    else if (a === 'lock') { app.editor.update(o.id, { locked: !o.locked }); if (!o.locked) delete o.locked; this.refresh(); }
    else if (a === 'resetsize') app.editor.update(o.id, { size: { ...getType(o.type).size } });
  }
}
