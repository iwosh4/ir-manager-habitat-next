import { getType, CATEGORIES, propsOf } from '../objects/catalog.js';
import { WALL_SURFACES, FLOOR_SURFACES, PAINT_FINISHES, SKIRTINGS, WALL_PROFILES, WALL_MODES, wallColor } from '../model/Surfaces.js';
import { ROUTE_KINDS, PORT_KINDS } from '../tech/Network.js';
import { WALLS } from '../model/RoomDocument.js';
import { assemblyStats, TECH_KINDS, TEMPLATE_CATEGORY } from '../model/Library.js';
import { icon } from './icons.js';
import { formatDims, dimLabel, dimsOrderLabel } from '../model/Dimensions.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;
const cm = (m) => Math.round(m * 1000) / 10;

function num(label, key, value, { unit = '', step = 1, min, max, disabled = false } = {}) {
  return `<label class="fld"><span>${label}</span><div class="num"><input type="number" data-key="${key}" value="${value}" step="${step}" ${min !== undefined ? `min="${min}"` : ''} ${max !== undefined ? `max="${max}"` : ''} ${disabled ? 'disabled' : ''}><em>${unit}</em></div></label>`;
}
function text(label, key, value, ph = '') { return `<label class="fld fld-wide"><span>${label}</span><input type="text" data-key="${key}" value="${esc(value)}" placeholder="${esc(ph)}" spellcheck="false"></label>`; }
function toggle(label, key, on, hint = '') { return `<label class="tgl"><input type="checkbox" data-key="${key}" ${on ? 'checked' : ''}><i></i><span>${label}</span>${hint ? `<em>${hint}</em>` : ''}</label>`; }

const titleCase = (w) => w[0].toUpperCase() + w.slice(1);
function select(label, attr, value, choices, { wide = false } = {}) {
  return `<label class="fld ${wide ? 'fld-wide' : ''}"><span>${label}</span><select ${attr}>${Object.entries(choices).map(([k, v]) => `<option value="${esc(k)}" ${String(value) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>`;
}
/** One entry of a type's `options` schema → form control (bound through data-key / data-opt). */
function optionHTML(opt, i, p, o, t) {
  const v = opt.key.split('.').slice(1).reduce((a, k) => a?.[k], p);
  const attr = `data-key="${opt.key}" data-opt="${i}"`;
  if (opt.type === 'select') return select(opt.label, attr, opt.sizes ? p.plantSize || 'medium' : v, opt.choices);
  if (opt.type === 'toggle') return `<label class="tgl"><input type="checkbox" ${attr} ${v ? 'checked' : ''}><i></i><span>${opt.label}</span>${opt.hint ? `<em>${opt.hint}</em>` : ''}</label>`;
  if (opt.type === 'range') return `<label class="fld fld-wide rng"><span>${opt.label} <b>${Math.round(v ?? 0)}${opt.unit || ''}</b></span><input type="range" ${attr} min="${opt.min}" max="${opt.max}" step="${opt.step || 1}" value="${v ?? 0}"></label>`;
  if (opt.type === 'num') return `<label class="fld"><span>${opt.label}</span><div class="num"><input type="number" ${attr} value="${Math.round((v ?? 0) * (opt.scale || 1) * 10) / 10}" step="${opt.step || 1}" min="${opt.min ?? ''}" max="${opt.max ?? ''}"><em>${opt.unit || ''}</em></div></label>`;
  if (opt.type === 'color') return `<label class="fld"><span>${opt.label}</span><input type="color" ${attr} value="${esc(v || '#888888')}"></label>`;
  return '';
}

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
    h += `<section class="grp"><h4>Dimensions <em class="unit" data-role="dim-order">${dimsOrderLabel()}</em> <button class="link" data-act="resetsize">reset</button></h4><div class="grid3">`;
    h += num(dimLabel('width'), 'size.w', cm(o.size.w), { unit: 'cm', step: 5, min: 2, disabled: !t.resizable });
    h += num(t.placement === 'opening' ? 'Wall' : dimLabel('depth'), 'size.d', cm(t.placement === 'opening' ? room.wallThickness : o.size.d), { unit: 'cm', step: 5, min: 1, disabled: !t.resizable || t.placement === 'opening' });
    h += num(dimLabel('height'), 'size.h', cm(o.size.h), { unit: 'cm', step: 5, min: 2, disabled: !t.resizable });
    h += `</div></section>`;
    const lib = ed.lib;
    if (o.type === 'assembly') {
      const a = lib.assemblies.get(o.ref?.assemblyId), st = a ? assemblyStats(a, lib) : null;
      if (a) h += `<section class="grp"><h4>Assembly</h4>
        <p class="meta dims" data-role="asm-dims">Outer (incl. frame) <b>${formatDims(st)}</b>${a.frame.mode !== 'none' ? `<br>Enclosure content ${formatDims(st.content)}` : ''} <em class="unit">${dimsOrderLabel()}</em></p>
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
    if (t.options?.length) {
      const p = propsOf(o);
      const rows = t.options.map((opt, i) => (!opt.when || opt.when(p) ? optionHTML(opt, i, p, o, t) : '')).join('');
      h += `<section class="grp"><h4>${t.category === 'windows' ? 'Window · glass · blinds' : t.category === 'doors' ? 'Door' : 'Variant · material'}</h4><div class="grid2 opts">${rows}</div></section>`;
    }
    if (o.tech) h += this.portsHTML(o, t);
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

  /** Technical ports of a device: catalogue ports + user ports; stable deviceId / portId (Home-Assistant-ready). */
  portsHTML(o, t) {
    const ports = [...Object.entries(t.ports || {}).map(([id, pp]) => ({ id, ...pp, fixed: true })), ...(o.tech.ports || [])];
    const used = new Set(this.app.editor.network.routes.flatMap((r) => [r.from, r.to]).filter((e) => e?.owner === o.id).map((e) => e.port));
    return `<section class="grp ports"><h4>Technical ports <em class="unit">device ${esc(o.tech.deviceId)}</em></h4>
      <div class="port-list">${ports.map((pp) => `<div class="port ${used.has(pp.id) ? 'used' : ''}"><i style="background:${ROUTE_KINDS[pp.kind]?.color}"></i><b>${esc(pp.id)}</b><span>${esc(pp.label || '')} · ${pp.dir}</span>${pp.fixed ? '' : `<button class="link" data-act="port-del" data-port="${esc(pp.id)}" title="Remove port">×</button>`}</div>`).join('') || '<p class="hint">No ports yet.</p>'}</div>
      <div class="port-add"><select data-port-kind>${PORT_KINDS.map((k) => `<option value="${k}">${ROUTE_KINDS[k].label}</option>`).join('')}</select><select data-port-dir><option value="in">in</option><option value="out">out</option><option value="both">both</option></select><input type="text" data-port-name placeholder="PORT_NAME" spellcheck="false"><button data-act="port-add">+ Port</button></div>
      <p class="hint">portId = <code>${esc(o.tech.deviceId)}:PORT</code> — stable for IR Manager / Home Assistant bindings.</p></section>`;
  }

  /** Per-wall surface editor (paint · cladding · profile) + floor + details. */
  surfacesHTML(r) {
    const w = this.wallTab || 'north', wd = r.walls?.[w] || {};
    const surf = WALL_SURFACES[wd.surface] || WALL_SURFACES.paint_light_grey;
    const groups = (fam) => Object.entries(WALL_SURFACES).filter(([, v]) => v.family === fam).map(([k, v]) => `<option value="${k}" ${wd.surface === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    const prof = wd.profile || { mode: 'full', hStart: r.height, hEnd: r.height };
    const fl = r.floor || {};
    return `<section class="grp surfaces"><h4>Walls <em class="unit">per wall</em></h4>
      <div class="seg wall-tabs">${WALLS.map((x) => `<button data-wall-tab="${x}" class="${x === w ? 'on' : ''}"><i style="background:${wallColor(r.walls?.[x])}"></i>${titleCase(x)}</button>`).join('')}</div>
      <label class="fld fld-wide"><span>Surface</span><select data-room="walls.${w}.surface"><optgroup label="Paint">${groups('paint')}</optgroup><optgroup label="Cladding · decor">${groups('cladding')}</optgroup></select></label>
      <div class="grid2">
        ${surf.family === 'paint' ? select('Finish', `data-room="walls.${w}.finish"`, wd.finish || 'smooth', PAINT_FINISHES) : `<label class="fld"><span>Cladding height</span><div class="num"><input type="number" data-room="walls.${w}.coverHeight" value="${cm(wd.coverHeight || 0)}" step="5" min="0" max="${cm(r.height)}"><em>cm</em></div></label>`}
        <label class="fld"><span>${surf.family === 'paint' ? 'Colour' : 'Wall colour above'}</span><input type="color" data-room="walls.${w}.color" value="${esc(/^#/.test(wd.color || '') ? wd.color : wallColor(wd))}"></label>
      </div>
      ${surf.family === 'cladding' ? '<p class="hint">Cladding height 0 = full height; e.g. 120 cm = wainscot with painted wall above.</p>' : ''}
      ${select('Wall profile', `data-room="walls.${w}.profile.mode"`, prof.mode, WALL_PROFILES, { wide: true })}
      <div class="grid2">
        ${prof.mode !== 'full' ? `<label class="fld"><span>${prof.mode === 'low' ? 'Height' : 'Start'}</span><div class="num"><input type="number" data-room="walls.${w}.profile.hStart" value="${cm(prof.hStart)}" step="5" min="60"><em>cm</em></div></label>` : ''}
        ${prof.mode === 'sloped' ? `<label class="fld"><span>End</span><div class="num"><input type="number" data-room="walls.${w}.profile.hEnd" value="${cm(prof.hEnd)}" step="5" min="60"><em>cm</em></div></label>` : ''}
      </div>
      <div class="btn-row"><button data-room-act="wall-all">Apply to all walls</button><button data-room-act="wall-accent">Accent wall (black laminate)</button></div>
    </section>
    <section class="grp"><h4>Floor</h4><div class="grid2">
      ${select('Surface', 'data-room="floor.surface"', fl.surface || 'concrete', Object.fromEntries(Object.entries(FLOOR_SURFACES).map(([k, v]) => [k, v.label])))}
      <label class="fld"><span>Tint</span><input type="color" data-room="floor.color" value="${esc(/^#/.test(fl.color || '') ? fl.color : FLOOR_SURFACES[fl.surface || 'concrete']?.color || '#5b5751')}"></label>
    </div></section>
    <section class="grp"><h4>Details</h4><div class="grid2">
      ${select('Skirting', 'data-room="details.skirting"', r.details?.skirting || 'black', SKIRTINGS)}
      ${select('Walls in view', 'data-wallmode="1"', this.app.walls?.mode || 'auto', WALL_MODES)}
    </div>${toggle('Corner trims', 'room-corners', r.details?.corners !== false, 'inner room corners')}</section>`;
  }

  /** Physical enclosure fields (instance): code, occupancy, lighting, animal, devices with stable ids. */
  instanceHTML(inst, tpl) {
    const occ = inst.props.occupied;
    return `<section class="grp"><h4>Physical enclosure <span class="code">${esc(inst.code)}</span></h4>
      <p class="meta">${esc(tpl.name)} · ${formatDims(tpl.dimensions)} · ${esc(TEMPLATE_CATEGORY(tpl))}<br><code>${esc(inst.id)}</code></p>
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
    if (tpl) h += `<label class="fld fld-wide"><span>Replace with</span><select data-replace="1"><option value="">— choose enclosure —</option>${this.app.editor.templates.filter((x) => x.id !== tpl.id).map((x) => `<option value="${x.id}">${esc(x.name)} (${formatDims(x.dimensions, { sep: '×' })})</option>`).join('')}</select></label>`;
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
    return `<div class="insp-title"><span class="chip">Room</span><input class="name" type="text" data-room="name" value="${esc(r.name)}" spellcheck="false"><span class="insp-sub">Nothing selected — room properties</span></div>
      <section class="grp"><h4>Room dimensions</h4><div class="grid2">
        <label class="fld"><span>Width</span><div class="num"><input type="number" data-room="width" value="${r.width}" step="0.1" min="1.5" max="30"><em>m</em></div></label>
        <label class="fld"><span>Depth</span><div class="num"><input type="number" data-room="depth" value="${r.depth}" step="0.1" min="1.5" max="30"><em>m</em></div></label>
        <label class="fld"><span>Height</span><div class="num"><input type="number" data-room="height" value="${r.height}" step="0.05" min="2.1" max="6"><em>m</em></div></label>
        <label class="fld"><span>Walls</span><div class="num"><input type="number" data-room="wallThickness" value="${cm(r.wallThickness)}" step="1" min="6" max="60"><em>cm</em></div></label>
      </div></section>
      ${this.surfacesHTML(r)}
      <section class="grp"><h4>Summary</h4>
        <div class="stats"><div><b>${ed.objects.length}</b><span>objects</span></div><div><b>${enc.length}</b><span>enclosures</span></div><div><b>${occ.length}</b><span>occupied</span></div><div><b>${(r.width * r.depth).toFixed(1)}</b><span>m² floor</span></div></div>
      </section>
      <section class="grp keys"><h4>Shortcuts</h4>
        <dl><dt>Orbit / pan / zoom</dt><dd>LMB · RMB · wheel</dd><dt>Move</dt><dd>drag object · arrows</dd><dt>Rotate</dt><dd>ring handle · R / Shift+R</dd>
        <dt>Duplicate · delete</dt><dd>Ctrl+D · Del</dd><dt>Focus</dt><dd>F · double-click</dd><dt>Views</dt><dd>1 top · 2 front · 3/4 sides · 5 iso · 6 interior · 7/8 corners · 9 fit room · 0 reset</dd>
        <dt>Camera</dt><dd>WASD pan · Q/E orbit · wheel zoom</dd><dt>Walls · Tech plan</dt><dd>V cycle wall mode · T tech plan</dd>
        <dt>Snapping</dt><dd>G toggle · Alt bypass</dd><dt>Undo · redo</dt><dd>Ctrl+Z · Ctrl+Y</dd></dl>
      </section>`;
  }

  onField(e) {
    const el = e.target, ed = this.app.editor;
    if (el.dataset.wallmode) { this.app.setWallMode(el.value); return; }
    if (el.dataset.key === 'room-corners') { ed.setRoom({ details: { corners: el.checked } }); return; }
    if (el.dataset.room?.startsWith('walls.') || el.dataset.room?.startsWith('floor.') || el.dataset.room?.startsWith('details.')) {
      const path = el.dataset.room.split('.'); let v = el.type === 'number' ? Number(el.value) : el.value;
      if (el.type === 'number' && !Number.isFinite(v)) { this.refresh(); return; }
      if (/coverHeight|hStart|hEnd/.test(path.at(-1))) v = v / 100;
      if (path[0] === 'walls') {
        const [, w, k, k2] = path;
        const patch = k === 'profile' ? { profile: { [k2]: v } } : { [k]: v };
        if (k === 'color' && WALL_SURFACES[ed.room.walls[w]?.surface]?.family === 'paint') patch.surface = 'paint_custom';
        if (k === 'profile' && k2 === 'mode' && v !== 'full' && ed.room.walls[w].profile.hStart >= ed.room.height - 0.01) Object.assign(patch.profile, { hStart: 1.5, hEnd: ed.room.height }); // attic default 150 → full
        ed.setRoom({ walls: { [w]: patch } });
      } else ed.setRoom({ [path[0]]: { [path[1]]: v } });
      this._pending = false; this.refresh();
      return;
    }
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
    if (el.dataset.opt !== undefined) {
      const t = getType(o.type), opt = t.options[+el.dataset.opt];
      if (el.type === 'range') v = Number(el.value);
      if (opt.scale) v = v / opt.scale;
      const path = opt.key.split('.').slice(1);
      if (opt.sizes) { // plant size preset → logical size follows
        const f = opt.sizes[v] || 1;
        ed.update(o.id, { props: { plantSize: v }, size: { w: t.size.w * f, d: t.size.d * f, h: t.size.h * f } });
      } else ed.update(o.id, { props: { [path[0]]: v } });
      this._pending = false; this.refresh();
      return;
    }
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
    const tab = e.target.closest('[data-wall-tab]'); if (tab) { this.wallTab = tab.dataset.wallTab; this.refresh(); return; }
    const ra = e.target.closest('[data-room-act]');
    if (ra) {
      const ed = this.app.editor, w = this.wallTab || 'north', src = ed.room.walls[w];
      if (ra.dataset.roomAct === 'wall-all') ed.setRoom({ walls: Object.fromEntries(WALLS.map((x) => [x, { surface: src.surface, color: src.color, finish: src.finish, coverHeight: src.coverHeight }])) });
      if (ra.dataset.roomAct === 'wall-accent') ed.setRoom({ walls: { [w]: { surface: 'laminate_black' } } });
      this.refresh(); return;
    }
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'port-add' || b.dataset.act === 'port-del') {
      const o = this.app.editor.selected; if (!o?.tech) return;
      const ports = [...(o.tech.ports || [])];
      if (b.dataset.act === 'port-del') this.app.editor.setDevicePorts(o.id, ports.filter((pp) => pp.id !== b.dataset.port));
      else {
        const box = b.closest('.port-add'), kind = box.querySelector('[data-port-kind]').value;
        const name = (box.querySelector('[data-port-name]').value.trim() || `${kind.toUpperCase()}_${ports.length + 1}`).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
        ports.push({ id: name, kind, dir: box.querySelector('[data-port-dir]').value, label: name });
        this.app.editor.setDevicePorts(o.id, ports);
      }
      this.refresh(); return;
    }
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
