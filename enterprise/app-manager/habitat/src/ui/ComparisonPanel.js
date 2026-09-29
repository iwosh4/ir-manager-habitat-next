import { icon } from './icons.js';
import { compareRenderers } from '../diagnostics/RendererComparison.js';

const ROWS = [
  ['Stationary frame (GPU-synced)', 'finalMs', (v) => `${v.toFixed(1)} ms`],
  ['Interactive frame (GPU-synced)', 'interactiveMs', (v) => `${v.toFixed(1)} ms`],
  ['Draw calls', 'drawCalls', (v) => v],
  ['Draw calls while interacting', 'drawCallsInteractive', (v) => v],
  ['Triangles', 'triangles', (v) => v.toLocaleString()],
  ['Materials in scene', 'materials', (v) => v],
  ['Textures in scene', 'textures', (v) => v],
  ['Real-time lights / shadow casters', 'lights', (v, m) => `${v} / ${m.shadowCasters}`],
  ['Pixel ratio · interactive scale', 'pixelRatio', (v, m) => `${v} · ${Math.round(m.interactiveScale * 100)}%`],
  ['Profile', 'profile', (v) => v],
];

/** Modal: SHOWCASE vs PLANNER, same camera, side by side with measured metrics. */
export class ComparisonPanel {
  constructor(app, host) {
    this.app = app;
    const el = document.createElement('div'); el.className = 'compare'; el.hidden = true;
    el.innerHTML = `<div class="compare-card">
      <div class="compare-head"><b>Renderer comparison</b><span>same camera · same RoomDocument</span>
        <button data-act="json" title="Download report (JSON)">${icon('save')}</button><button data-act="close" title="Close (Esc)">✕</button></div>
      <div class="compare-body"></div></div>`;
    host.appendChild(el);
    this.el = el; this.body = el.querySelector('.compare-body');
    el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'close' || e.target === el) this.close();
      if (a === 'json' && this.report) this._download();
    });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) this.close(); });
  }

  close() { this.el.hidden = true; }

  async open() {
    this.el.hidden = false;
    this.body.innerHTML = '<div class="compare-wait">Rendering both renderers from this camera…</div>';
    try {
      this.report = await compareRenderers(this.app, { onProgress: (p, m) => this.app.hud?.showLoading(m, p) });
    } catch (e) { this.body.innerHTML = `<div class="compare-wait">Comparison failed: ${e.message}</div>`; return; }
    finally { this.app.hud?.hideLoading(); }
    const { showcase: s, planner: p } = this.report.modes, R = this.report.ratio;
    this.body.innerHTML = `
      <div class="compare-shots">
        <figure><img src="${s.image}" alt="Showcase"><figcaption>SHOWCASE <em>realistic</em></figcaption></figure>
        <figure><img src="${p.image}" alt="Planner"><figcaption>PLANNER <em>stylised</em></figcaption></figure>
      </div>
      <table class="compare-table"><thead><tr><th></th><th>Showcase</th><th>Planner</th><th>ratio</th></tr></thead><tbody>
      ${ROWS.map(([label, k, f]) => `<tr><td>${label}</td><td>${f(s[k], s)}</td><td>${f(p[k], p)}</td><td>${typeof s[k] === 'number' && p[k] ? `${(s[k] / p[k]).toFixed(1)}×` : ''}</td></tr>`).join('')}
      </tbody></table>
      <div class="compare-foot">GPU: ${this.report.gpu || 'n/a'} · viewport ${this.report.viewport.join('×')} · Planner is ${R.final}× faster stationary, ${R.interactive}× while interacting</div>`;
  }

  _download() {
    const rep = JSON.parse(JSON.stringify(this.report));
    for (const m of Object.values(rep.modes)) delete m.image;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(rep, null, 2)], { type: 'application/json' }));
    a.download = 'habitat-renderer-comparison.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
