import { icon } from './icons.js';
import { getType } from '../objects/catalog.js';

/** In-viewport overlays: view controls, compass, status/hover line, render stats, loading. */
export class Hud {
  constructor(app, viewport) {
    this.app = app;
    const el = document.createElement('div'); el.className = 'hud';
    el.innerHTML = `
      <div class="hud-views">
        <button data-view="hero" title="Reset view (0)">${icon('home')}</button>
        <span class="hud-sep"></span>
        <button data-view="top" title="Top (1)">${icon('top')}</button>
        <button data-view="front" title="Front (2)">${icon('front')}</button>
        <button data-view="left" title="Left (3)">${icon('left')}</button>
        <button data-view="right" title="Right (4)">${icon('right')}</button>
        <button data-view="iso" title="Isometric (5)">${icon('cube')}</button>
        <button data-view="interior" title="Eye level, inside the room (6)">${icon('interior')}</button>
        <span class="hud-sep"></span>
        <button data-act="focus" title="Focus selection (F)">${icon('focus')}</button>
        <button data-act="full" title="Fullscreen (F11)">${icon('full')}</button>
      </div>
      <div class="hud-compass" title="North"><div class="needle"><span>N</span></div></div>
      <div class="hud-status"><span class="st-main"></span><span class="st-hover"></span></div>
      <div class="hud-stats"></div>`;
    viewport.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]'); if (v) { app.setView(v.dataset.view); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'focus') app.focusSelected();
      if (a.dataset.act === 'full') app.toggleFullscreen();
    });
    this.needle = el.querySelector('.needle');
    this.main = el.querySelector('.st-main'); this.hover = el.querySelector('.st-hover'); this.stats = el.querySelector('.hud-stats');
    app.rig.controls.addEventListener('change', () => this.updateCompass());
    this.updateCompass();
    this.refresh();
  }

  updateCompass() {
    const az = this.app.rig.controls.getAzimuthalAngle();
    this.needle.style.transform = `rotate(${az}rad)`;
  }

  setStatus(t) { this.statusText = t; this.refresh(); }
  setHover(o) {
    if (o === this.hovered) return; this.hovered = o;
    this.hover.textContent = o ? `${o.name} · ${getType(o.type).label}` : '';
  }
  refresh() {
    const sel = this.app.editor.selected;
    this.main.textContent = this.statusText || (sel ? `${sel.name} selected — drag to move, ring to rotate, Del to delete` : 'Click an object to select · drag empty space to orbit · right-drag to pan · wheel to zoom');
  }
  refreshStats() {
    const s = this.app.engine.stats;
    this.stats.textContent = `${s.fps} fps · ${s.drawCalls} draws · ${(s.triangles / 1000).toFixed(0)}k tris · ${this.app.engine.quality.label}`;
  }
}
