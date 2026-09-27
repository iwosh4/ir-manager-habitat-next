import { CATEGORIES, TYPES, typesByCategory } from '../objects/catalog.js';
import { icon } from './icons.js';
import { Thumbnails } from './Thumbnails.js';

const cm = (m) => Math.round(m * 100);

/** Collapsible asset browser: search, categories, real-model thumbnails, click-to-place or drag & drop. */
export class LibraryPanel {
  constructor(app, el) {
    this.app = app; this.el = el;
    this.collapsed = new Set();
    el.innerHTML = `
      <div class="panel-head"><span class="panel-title">${icon('library')} Library</span><span class="panel-count">${Object.keys(TYPES).length}</span></div>
      <div class="lib-search">${icon('search')}<input type="search" placeholder="Search objects…" spellcheck="false"></div>
      <div class="lib-list"></div>
      <div class="panel-foot">Click an item, then click in the room — or drag it into the viewport.</div>`;
    this.list = el.querySelector('.lib-list');
    this.search = el.querySelector('input');
    this.search.addEventListener('input', () => this.render());
    this.thumbs = new Thumbnails(app.assets);
    this.render();
    this.list.addEventListener('click', (e) => {
      const head = e.target.closest('.lib-cat-head');
      if (head) { const c = head.dataset.cat; this.collapsed.has(c) ? this.collapsed.delete(c) : this.collapsed.add(c); this.render(); return; }
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
    setTimeout(() => this.loadThumbs(), 600);
  }

  render() {
    const q = this.search.value.trim().toLowerCase();
    this.list.innerHTML = CATEGORIES.map((c) => {
      const items = typesByCategory(c.id).filter((t) => !q || `${t.label} ${t.sub} ${c.label}`.toLowerCase().includes(q));
      if (!items.length) return '';
      const open = q || !this.collapsed.has(c.id);
      return `<section class="lib-cat ${open ? 'open' : ''}">
        <button class="lib-cat-head" data-cat="${c.id}">${icon('chevron', 'chev')}<span>${c.label}</span><em>${items.length}</em></button>
        <div class="lib-grid">${open ? items.map((t) => `
          <div class="lib-item" draggable="true" data-type="${t.id}" title="${t.label} — ${t.sub}">
            <div class="lib-thumb">${this.thumbs.cache.has(t.id) ? '' : '<span class="thumb-spin"></span>'}<img alt="" data-thumb="${t.id}"></div>
            <div class="lib-meta"><b>${t.label}</b><span>${t.sub}</span><i>${cm(t.size.w)}×${cm(t.size.d)}×${cm(t.size.h)}</i></div>
          </div>`).join('') : ''}</div>
      </section>`;
    }).join('') || '<div class="lib-empty">No objects match your search.</div>';
    this._applyThumbs();
  }

  async loadThumbs() {
    for (const [id, t] of Object.entries(TYPES)) {
      await this.thumbs.get(id, t.model).catch(() => null);
      this._applyThumbs();
      await new Promise((r) => setTimeout(r, 16));
    }
  }

  _applyThumbs() {
    for (const img of this.list.querySelectorAll('img[data-thumb]')) {
      const p = this.thumbs.cache.get(img.dataset.thumb);
      if (!p) continue;
      p.then((url) => { if (url && img.src !== url) { img.src = url; img.parentElement.querySelector('.thumb-spin')?.remove(); } else if (!url) img.parentElement.classList.add('missing'); });
    }
  }
}
