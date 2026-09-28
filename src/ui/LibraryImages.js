import { templateParts, templateSize, assemblyParts, moduleParts } from '../preview/parts.js';
import { templateHash, assemblyHash } from '../model/Library.js';

/**
 * Library imagery rendered with the preview stage (same painted pipeline as the Planner):
 *   thumbnails   3/4 views for MY ENCLOSURES / MY ASSEMBLIES cards
 *   front images exact orthographic front elevations for the Assembly Builder's Tetris pieces
 * Cached by definition hash; rendered sequentially (never blocks a frame for long).
 */
export class LibraryImages {
  constructor(app) { this.app = app; this.cache = new Map(); this.chain = Promise.resolve(); }

  _job(key, fn) {
    if (this.cache.has(key)) return this.cache.get(key);
    const p = (this.chain = this.chain.then(() => new Promise((res) => setTimeout(() => { try { res(fn()); } catch (e) { console.warn('[thumb]', e); res(null); } }, 0))));
    this.cache.set(key, p);
    return p;
  }

  get stage() { return this.app.previewStage(); }
  get mats() { return this.app.modes.planner.mats; }

  template(t) { return this._job(`t|${t.id}|${templateHash(t)}`, () => this.stage.thumbnail(templateParts(this.mats, t), templateSize(t))); }

  templateFront(t) {
    const size = templateSize(t);
    return this._job(`tf|${t.id}|${templateHash(t)}`, () => this.stage.frontImage(templateParts(this.mats, t, undefined, { shadow: false }), size));
  }

  moduleFront(mod) { return this._job(`mf|${JSON.stringify(mod)}`, () => this.stage.frontImage(moduleParts(this.mats, mod), { w: mod.w, h: mod.h, d: mod.d })); }

  assembly(a) {
    const lib = this.app.editor.lib;
    return this._job(`a|${a.id}|${assemblyHash(a, lib)}`, () => { const { parts, size } = assemblyParts(this.mats, a, lib); return this.stage.thumbnail(parts, size, { dir: [0.45, 0.3, 1] }); });
  }
}
