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
      <div class="hud-stats" title="Renderer diagnostics — click (or press I) for details"><span class="mode-dot"></span><span class="stats-line"></span></div>
      <div class="hud-diag" hidden></div>`;
    viewport.appendChild(el);
    this.el = el;
    el.addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]'); if (v) { app.setView(v.dataset.view); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'focus') app.focusSelected();
      if (a.dataset.act === 'full') app.toggleFullscreen();
    });
    this.needle = el.querySelector('.needle');
    this.main = el.querySelector('.st-main'); this.hover = el.querySelector('.st-hover');
    this.stats = el.querySelector('.hud-stats'); this.statsLine = el.querySelector('.stats-line'); this.diag = el.querySelector('.hud-diag');
    this.stats.addEventListener('click', () => this.toggleDiag());
    window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'i' && !/input|textarea|select/i.test(e.target.tagName)) this.toggleDiag(); });
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
  toggleDiag() { this.diag.hidden = !this.diag.hidden; this.refreshStats(); }

  /** Called every animation frame while idle: flip the mode badge back to "final" once settled. */
  tick() { if (this.stats.dataset.mode !== 'final') this.refreshStats(); }

  refreshStats() {
    const app = this.app, d = app.engine.diagnostics();
    const mode = app.engine.isInteractive ? 'interactive' : 'final';
    this.stats.dataset.mode = mode;
    const q = d.quality === 'Auto' ? `AUTO→${d.finalProfile}` : d.quality;
    this.statsLine.textContent = `${mode === 'interactive' ? 'INTERACTIVE' : 'FINAL'} · ${q} · ${d.fps} fps · ${d.frameMs ? d.frameMs.toFixed(1) : '–'} ms · ${d.drawCalls} draws · ${(d.triangles / 1000).toFixed(0)}k tris · scale ${Math.round(d.renderScale * 100)}%`;
    if (this.diag.hidden) return;
    const b = app.batcher.stats, pool = app.lighting.poolUsage(), r = app.renderer.info;
    const rows = [
      ['Mode', mode === 'interactive' ? 'Interactive (reduced resolution, no AO/bloom/MSAA)' : 'Final (full quality)'],
      ['Quality', d.quality === 'Auto' ? `Auto — final profile ${d.finalProfile}` : d.quality],
      ['FPS / frame', `${d.fps} fps · ${d.frameMs ? d.frameMs.toFixed(1) : '–'} ms (interactive EMA)`],
      ['Last final frame', d.finalMs ? `${d.finalMs.toFixed(0)} ms` : '–'],
      ['CPU submit', `${d.cpuMs.toFixed(1)} ms`],
      ['Draw calls', d.drawCalls], ['Triangles', d.triangles.toLocaleString()],
      ['Render scale', `${Math.round(d.renderScale * 100)}% (interactive) · pixel ratio ${d.pixelRatio}`],
      ['Shadow map updates', d.shadowUpdates],
      ['Static batches', `${b.batches} batches · ${b.instances} instances · ${b.rebuilds} rebuilds`],
      ['Light pool', `spot ${pool.spot} · point ${pool.point} · window ${pool.rect}`],
      ['Programs / geometries / textures', `${d.programs} / ${r.memory.geometries} / ${r.memory.textures}`],
      ['Shader pre-compile', app.engine.stats.compileMs != null ? `${app.engine.stats.compileMs} ms` : '–'],
      ['GPU', d.gpu || 'n/a'],
    ];
    this.diag.innerHTML = `<div class="diag-head">Renderer diagnostics <em>I</em></div>` + rows.map(([k, v]) => `<div class="diag-row"><span>${k}</span><b>${v}</b></div>`).join('');
  }
}
