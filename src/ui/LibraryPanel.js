import { CATEGORIES, TYPES, typesByCategory } from '../objects/catalog.js';
import { icon } from './icons.js';
import { Thumbnails } from './Thumbnails.js';
import { TEMPLATE_CATEGORY, assemblyStats } from '../model/Library.js';

const cm = (m) => Math.round(m * 100);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Collapsible asset browser: search, categories, real-model thumbnails, click-to-place or drag & drop. */
export class LibraryPanel {
  constructor(app, el) {
    this.app = app; this.el = el;
    this.collapsed = new Set();
    el.innerHTML = `
      <div class="panel-head"><span class="panel-title">${icon('library')} Library</span><span class="panel-count">${Object.keys(TYPES).length}</span></div>
      <div class="lib-search">${icon('search')}<input type="search" placeholder="Search objects…" spellcheck="false"></div>
      <div class="lib-list"><div class="lib-mine"></div><div class="lib-cats"></div></div>
      <div class="panel-foot">Click an item, then click in the room — or drag it into the viewport.</div>`;
    this.list = el.querySelector('.lib-cats');
    this.mine = el.querySelector('.lib-mine');
    this._bindMine();
    this.search = el.querySelector('input');
    this.search.addEventListener('input', () => this.render());
    this.thumbs = new Thumbnails(() => app.assets);
    this.render();
    this.list.addEventListener('click', (e) => {
      const head = e.target.closest('.lib-cat-head');
      if (head) { const c = head.dataset.cat; this.collapsed.has(c) ? this.collapsed.delete(c) : this.collapsed.add(c); this.render(); return; }
      const cz = e.target.closest('[data-customize]'); if (cz) { e.stopPropagation(); this.app.customizeCatalogue(cz.dataset.customize); return; }
      const item = e.target.closest('.lib-item'); if (!item) return;
      this.app.pointer.startPlacement(item.dataset.type);
      for (const i of this.list.querySelectorAll('.lib-item')) i.classList.toggle('active', i === item);
    });
    this.list.addEventListener('dragstart', (e) => {
      const item = e.target.closest('.lib-item'); if (!item) return;
      this.app.draggingType = item.dataset.type;
      e.dataTransfer.setData('text/plain', item.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
      const img = item.querySelector('img'); if (img?.src) e.dataTransfer.setDragImage(img, 40, 30);
    });
    this.list.addEventListener('dragend', () => { if (this.app.draggingType) { this.app.draggingType = null; this.app.pointer.cancelPlacement(); } });
    // Pre-rendered thumbnails (assets/thumbnails, built by tools/build-thumbnails.mjs). Only if one is
    // missing is it rendered live from the GLB — no second WebGL context in the normal case.
    this.list.addEventListener('error', (e) => {
      const img = e.target; if (img.tagName !== 'IMG' || img.dataset.live) return;
      img.dataset.live = '1'; img.removeAttribute('src');
      const id = img.dataset.thumb; this.thumbs.get(id, TYPES[id].model).then(() => this._applyThumbs());
    }, true);
  }

  // ------------------------------------------------------------------ MY ASSEMBLIES / MY ENCLOSURES (primary workflow)
  refreshMine() {
    const app = this.app, ed = app.editor, q = this.search.value.trim().toLowerCase();
    const match = (s) => !q || s.toLowerCase().includes(q);
    const lib = ed.lib;
    const asm = ed.assemblies.filter((a) => match(a.name));
    const tpl = ed.templates.filter((t) => match(`${t.name} ${t.type}`));
    const cmv = (m) => Math.round(m * 100);
    const card = (kind, id, name, dims, sub, badge, actions) => `
      <div class="lib-item mine" draggable="true" data-mine="${kind}" data-id="${id}" title="Click to place in the room, or drag it into the viewport">
        <div class="lib-thumb"><img alt="" data-mthumb="${kind}:${id}" draggable="false">${badge ? `<span class="badge">${badge}</span>` : ''}</div>
        <div class="lib-meta"><b>${esc(name)}</b><span>${dims}</span><i>${esc(sub)}</i></div>
        <div class="card-acts">${actions}</div>
      </div>`;
    const a1 = (act, ico, title) => `<button data-mact="${act}" title="${title}">${ico}</button>`;
    this.mine.innerHTML = `
      <section class="lib-cat open mine-sec">
        <div class="mine-head"><span>My assemblies</span><em>${ed.assemblies.length}</em><button class="add-btn" data-mact="new-assembly" title="Create assembly (Assembly Builder)">+ Create</button></div>
        <div class="lib-grid">${asm.map((a) => { const st = assemblyStats(a, lib); return card('assembly', a.id, a.name, `${cmv(st.width)}×${cmv(st.height)}×${cmv(st.depth)} cm`, `${st.enclosures} enclosures${st.rackBoxes ? ` · ${st.rackBoxes} rack boxes` : ''}${st.modules ? ` · ${st.modules} modules` : ''}`, ed.isPlaced({ assemblyId: a.id }) ? 'in room' : '', a1('edit', icon('grid'), 'Edit in Assembly Builder') + a1('dup', icon('dup'), 'Duplicate (new physical enclosures)') + a1('del', icon('trash'), 'Delete')); }).join('') || '<p class="lib-hint">Build an enclosure wall or rack from your enclosures, then drag it into the room.</p>'}</div>
      </section>
      <section class="lib-cat open mine-sec">
        <div class="mine-head"><span>My enclosures</span><em>${ed.templates.length}</em><button class="add-btn" data-mact="new-enclosure" title="Create enclosure (Enclosure Designer)">+ Create</button></div>
        <div class="lib-grid">${tpl.map((t) => { const n = ed.doc.instances.filter((i) => i.templateId === t.id).length; return card('template', t.id, t.name, `${cmv(t.dimensions.width)}×${cmv(t.dimensions.height)}×${cmv(t.dimensions.depth)} cm`, `${TEMPLATE_CATEGORY(t)} · ${t.type}${n ? ` · ${n} built` : ''}`, '', a1('edit', icon('cube'), 'Edit enclosure') + a1('place', '＋', 'Create a physical copy and place it in the room') + a1('dup', icon('dup'), 'Duplicate design') + a1('del', icon('trash'), 'Delete')); }).join('') || '<p class="lib-hint">Design your real enclosures (exact size, construction, doors, vents, interior, devices) — or customise a starting template below.</p>'}</div>
      </section>`;
    for (const img of this.mine.querySelectorAll('img[data-mthumb]')) {
      const [kind, id] = img.dataset.mthumb.split(':');
      const p = kind === 'assembly' ? app.libraryImages.assembly(lib.assemblies.get(id)) : app.libraryImages.template(lib.templates.get(id));
      p.then((u) => { if (u) img.src = u; });
    }
  }

  _bindMine() {
    const app = this.app, ed = app.editor;
    this.mine.addEventListener('click', (e) => {
      const b = e.target.closest('[data-mact]'), cardEl = e.target.closest('[data-mine]');
      const kind = cardEl?.dataset.mine, id = cardEl?.dataset.id;
      if (b) {
        e.stopPropagation();
        const a = b.dataset.mact;
        if (a === 'new-assembly') app.openBuilder();
        else if (a === 'new-enclosure') app.openDesigner();
        else if (kind === 'assembly') {
          const asm = ed.lib.assemblies.get(id);
          if (a === 'edit') app.openBuilder(asm);
          else if (a === 'dup') ed.duplicateAssembly(id);
          else if (a === 'del' && confirm(`Delete assembly “${asm.name}”${ed.isPlaced({ assemblyId: id }) ? ' (also removes it from the room)' : ''} and its enclosure instances?`)) ed.deleteAssembly(id);
        } else if (kind === 'template') {
          const t = ed.lib.templates.get(id);
          if (a === 'edit') app.openDesigner(t);
          else if (a === 'place') app.placeFromLibrary({ kind: 'template', templateId: id });
          else if (a === 'dup') ed.duplicateTemplate(id);
          else if (a === 'del') { if (!ed.deleteTemplate(id)) app.toast(`“${t.name}” is used by physical enclosures — remove them first`, 'warn'); }
        }
        return;
      }
      if (!cardEl) return;
      app.placeFromLibrary(kind === 'assembly' ? { kind: 'assembly', assemblyId: id } : { kind: 'template', templateId: id });
      for (const i of this.el.querySelectorAll('.lib-item')) i.classList.toggle('active', i === cardEl);
    });
    this.mine.addEventListener('dragstart', (e) => {
      const cardEl = e.target.closest('[data-mine]'); if (!cardEl) return;
      app.dragPayload = cardEl.dataset.mine === 'assembly' ? { kind: 'assembly', assemblyId: cardEl.dataset.id } : { kind: 'template', templateId: cardEl.dataset.id };
      e.dataTransfer.setData('text/plain', cardEl.dataset.id); e.dataTransfer.effectAllowed = 'copy';
      const img = cardEl.querySelector('img'); if (img?.src) e.dataTransfer.setDragImage(img, 40, 30);
    });
    this.mine.addEventListener('dragend', () => { if (app.dragPayload) { app.dragPayload = null; app.pointer.cancelPlacement(); } });
  }

  render() {
    this.refreshMine?.();
    const q = this.search.value.trim().toLowerCase();
    this.list.innerHTML = CATEGORIES.map((c) => {
      const items = typesByCategory(c.id).filter((t) => !q || `${t.label} ${t.sub} ${c.label}`.toLowerCase().includes(q));
      if (!items.length) return '';
      const open = q || !this.collapsed.has(c.id);
      return `<section class="lib-cat ${open ? 'open' : ''}">
        <button class="lib-cat-head" data-cat="${c.id}">${icon('chevron', 'chev')}<span>${c.label}</span><em>${items.length}</em></button>
        <div class="lib-grid">${open ? items.map((t) => `
          <div class="lib-item" draggable="true" data-type="${t.id}" title="${t.label} — ${t.sub}">
            <div class="lib-thumb"><img alt="" data-thumb="${t.id}" src="assets/thumbnails/${t.id}.png" loading="lazy" draggable="false"></div>
            <div class="lib-meta"><b>${t.label}</b><span>${t.sub}</span><i>${cm(t.size.w)}×${cm(t.size.d)}×${cm(t.size.h)}</i></div>
            ${c.id === 'enclosure' ? `<button class="customize" data-customize="${t.id}" title="Create from template: change dimensions, doors, ventilation, interior — save to My Enclosures">Customize…</button>` : ''}
          </div>`).join('') : ''}</div>
      </section>`;
    }).join('') || '<div class="lib-empty">No objects match your search.</div>';
    this._applyThumbs();
  }

  async loadThumbs() {
    for (const [id, t] of Object.entries(TYPES)) {
      if (!t.model) continue;
      await this.thumbs.get(id, t.model).catch(() => null);
      this._applyThumbs();
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  _applyThumbs() {
    for (const img of this.list.querySelectorAll('img[data-thumb][data-live]')) {
      const p = this.thumbs.cache.get(img.dataset.thumb);
      if (!p) continue;
      p.then((url) => { if (url && img.src !== url) img.src = url; else if (!url) img.parentElement.classList.add('missing'); });
    }
  }
}
