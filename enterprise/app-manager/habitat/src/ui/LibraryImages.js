import { templateParts, templateSize, assemblyParts, moduleParts } from '../preview/parts.js';
import { templateHash, assemblyHash } from '../model/Library.js';
import { TYPES } from '../objects/catalog.js';
import { createObject } from '../model/RoomDocument.js';
import { buildModel, modelKey } from '../planner/stylizedModels.js';

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

  /** Procedural catalogue type (4.2): same builder as the room, rendered at its default size. */
  catalogue(id, { w = 176, h = 132 } = {}) {
    const t = TYPES[id]; if (!t) return Promise.resolve(null);
    return this._job(`cat|${id}|${w}`, () => {
      const room = { width: 4, depth: 4, height: 2.7, wallThickness: 0.14 };
      const obj = createObject(id, { elevation: 0 });
      const size = { w: obj.size.w, h: obj.size.h, d: t.placement === 'opening' ? room.wallThickness : obj.size.d };
      const parts = [{ key: `thumb|${modelKey(obj, t, room)}`, name: id, make: () => buildModel(this.mats, obj, t, room) }];
      const wallish = t.placement === 'opening' || t.placement === 'mounted';
      return this.stage.thumbnail(parts, size, { w, h, dir: wallish ? [0.35, 0.18, 1] : [0.62, 0.38, 1] });
    });
  }

  assembly(a) {
    const lib = this.app.editor.lib;
    return this._job(`a|${a.id}|${assemblyHash(a, lib)}`, () => { const { parts, size } = assemblyParts(this.mats, a, lib); return this.stage.thumbnail(parts, size, { dir: [0.45, 0.3, 1] }); });
  }
}
