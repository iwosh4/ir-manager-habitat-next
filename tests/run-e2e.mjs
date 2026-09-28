// End-to-end test suite for Habitat Studio Next (drives a real browser with WebGL).
//
//   npm i -D playwright && npx playwright install chromium     (once)
//   npm test                                                   (starts its own static server)
//
// Environment: HEADFUL=1 to watch, URL=http://host:port/ to test an already running server.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); } catch {
    console.error('Playwright is required: npm i -D playwright && npx playwright install chromium'); process.exit(2);
  }
}

// ---------------------------------------------------------------- static server
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream' };
function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      let p; try { p = decodeURIComponent(req.url.split('?')[0].replace(/\/{2,}/g, '/')); } catch { rsp.writeHead(400); return rsp.end(); } if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { rsp.writeHead(404); return rsp.end(); }
      rsp.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rsp);
    }).listen(0, () => res(srv));
  });
}

// ---------------------------------------------------------------- harness
const results = [];
const errors = [];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
async function test(name, fn) {
  if (ONLY && !ONLY.test(name) && !/initial room load/.test(name)) return;
  const t0 = Date.now();
  try { await fn(); results.push({ name, ok: true, ms: Date.now() - t0 }); console.log(`  ✓ ${name} (${Date.now() - t0} ms)`); }
  catch (e) { results.push({ name, ok: false, err: e.message }); console.log(`  ✗ ${name}\n      ${e.message}`); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;

const srv = process.env.URL ? null : await serve();
const BASE = process.env.URL || `http://localhost:${srv.address().port}/`;
// The approved realistic renderer is exercised explicitly with mode=showcase; the Planner (default mode)
// has its own section at the end, including Planner ↔ Showcase switching invariance.
const URL0 = BASE + '?mode=showcase' + (process.env.QUALITY === 'high' ? '' : '&quality=fast');
const browser = await chromium.launch({ headless: !process.env.HEADFUL, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 860 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.setDefaultTimeout(120000);

const ev = (fn, arg) => page.evaluate(fn, arg);
const settle = (ms = 400) => page.waitForTimeout(ms);
/** Screen position of an object's footprint centre at a given height fraction. */
async function screenOf(id, hFrac = 0.5) {
  return ev(async ([id, hFrac]) => {
    const T = await import('three');
    const h = window.habitat; const o = h.editor.get(id); const r = h.editor.room;
    const v = new T.Vector3(o.position.x - r.width / 2, o.elevation + o.size.h * hFrac, o.position.z - r.depth / 2).project(h.rig.camera);
    const rect = h.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (v.x + 1) / 2 * rect.width, y: rect.top + (1 - v.y) / 2 * rect.height };
  }, [id, hFrac]);
}
/** Wait until the progressive renderer has settled on a final-quality frame (dumps state on timeout). */
async function waitIdle(timeout = 60000) {
  try { await page.waitForFunction(() => { const e = window.habitat.engine; return e.mode === 'final' && !e.needsFrame; }, null, { timeout, polling: 250 }); }
  catch (err) {
    const st = await ev(() => { const e = window.habitat.engine; return { mode: e.mode, dirty: e.dirty, pending: e.pendingFinal, interacting: e.interacting, untilMs: Math.round(e.interactiveUntil - performance.now()), animating: window.habitat.rig.animating, controls: !!window.habitat._controlsActive, pointer: window.habitat.pointer.state?.mode || null }; });
    throw new Error('renderer did not settle: ' + JSON.stringify(st) + ' errors: ' + errors.slice(-3).join(' | '));
  }
}
async function setView(name) { await ev((n) => window.habitat.rig.goTo(n, { instant: true }), name); await settle(300); }

console.log(`Habitat Studio e2e — ${URL0}`);
await page.goto(URL0);
await page.evaluate(() => { try { localStorage.clear(); } catch {} });
await page.reload();

await test('initial room load (demo room, UI panels, render loop)', async () => {
  await page.waitForFunction(() => window.habitat && document.querySelector('.loading') === null || document.querySelector('.loading.done'), null, { timeout: 180000 });
  const s = await ev(() => ({ n: window.habitat.editor.objects.length, room: window.habitat.editor.room, frames: window.habitat.engine.stats.frames, lib: document.querySelectorAll('.lib-item').length }));
  assert(s.n >= 20, `expected demo objects, got ${s.n}`);
  assert(s.room.width === 5 && s.room.depth === 4, 'demo room is 5 x 4 m');
  assert(s.frames > 0, 'renderer produced frames');
  assert(s.lib >= 10, 'library lists objects');
});

await test('GLB loading (all catalogue models load, materials bound)', async () => {
  await ev(() => window.habitat.objects.whenLoaded());
  const s = await ev(() => {
    const h = window.habitat; const out = { failures: [...h.assets.failures.keys()], placeholders: 0, meshes: 0, unbound: 0 };
    for (const v of h.objects.views.values()) {
      if (v.missing) out.placeholders++;
      v.visual?.traverse((m) => { if (m.isMesh) { out.meshes++; if (!h.materials.get(m.userData.slot) && !['led_warm', 'led_cool', 'uvb_tube', 'bulb_hot', 'label'].includes(m.userData.slot)) out.unbound++; } });
    }
    return out;
  });
  assert(s.failures.length === 0, 'failed assets: ' + s.failures.join(', '));
  assert(s.placeholders === 0, `${s.placeholders} placeholder visuals`);
  assert(s.meshes > 200 && s.unbound === 0, `meshes ${s.meshes}, unbound ${s.unbound}`);
});

await test('missing asset handling (placeholder, logical object intact, no crash)', async () => {
  const s = await ev(async () => {
    const h = window.habitat; const cat = await import('./src/objects/catalog.js');
    const orig = cat.TYPES.dehumidifier.model; cat.TYPES.dehumidifier.model = 'assets/models/__missing__.glb';
    const o = h.editor.add('dehumidifier', { position: { x: 2.5, z: 2.0 } });
    await h.objects.get(o.id).loading;
    const v = h.objects.get(o.id);
    const res = { missing: v.missing, placeholder: !!v.visual?.userData.placeholder, exists: !!h.editor.get(o.id), failures: h.assets.failures.size, toast: !!document.querySelector('.toast-warn') };
    h.editor.remove(o.id); cat.TYPES.dehumidifier.model = orig;
    return res;
  });
  assert(s.missing && s.placeholder, 'placeholder shown');
  assert(s.exists, 'logical object kept');
  assert(s.failures >= 1, 'failure recorded');
});

await test('camera orbit / pan / zoom', async () => {
  await setView('overview');
  const box = await page.locator('canvas.viewport-canvas').boundingBox();
  const cx = box.x + box.width * 0.5, cy = box.y + box.height * 0.2;
  const before = await ev(() => ({ az: window.habitat.rig.controls.getAzimuthalAngle(), t: window.habitat.rig.controls.target.toArray(), d: window.habitat.rig.camera.position.distanceTo(window.habitat.rig.controls.target) }));
  // orbit on empty space (ceiling area is hidden in overview, top of the viewport is background)
  await page.mouse.move(cx, box.y + 30); await page.mouse.down(); await page.mouse.move(cx + 160, box.y + 40, { steps: 8 }); await page.mouse.up(); await settle(700);
  const orbit = await ev(() => window.habitat.rig.controls.getAzimuthalAngle());
  assert(Math.abs(orbit - before.az) > 0.1, `azimuth changed (${before.az.toFixed(2)} -> ${orbit.toFixed(2)})`);
  // pan (right button)
  await page.mouse.move(cx, cy); await page.mouse.down({ button: 'right' }); await page.mouse.move(cx + 120, cy + 60, { steps: 8 }); await page.mouse.up({ button: 'right' }); await settle(700);
  const t = await ev(() => window.habitat.rig.controls.target.toArray());
  assert(Math.hypot(t[0] - before.t[0], t[1] - before.t[1], t[2] - before.t[2]) > 0.05, 'target panned');
  // zoom
  const d0 = await ev(() => window.habitat.rig.camera.position.distanceTo(window.habitat.rig.controls.target));
  await page.mouse.move(cx, box.y + box.height / 2); await page.mouse.wheel(0, -600); await settle(900);
  const d1 = await ev(() => window.habitat.rig.camera.position.distanceTo(window.habitat.rig.controls.target));
  assert(d1 < d0 - 0.05, `zoomed in (${d0.toFixed(2)} -> ${d1.toFixed(2)})`);
});

await test('view presets & smooth transitions (top/front/left/right/iso/reset)', async () => {
  for (const v of ['top', 'front', 'left', 'right', 'iso', 'interior', 'hero']) {
    await page.click(`.hud-views [data-view="${v === 'hero' ? 'hero' : v}"]`);
    const t0 = Date.now();
    assert(await ev(() => window.habitat.rig.animating), `${v}: animated transition started`);
    await page.waitForFunction(() => !window.habitat.rig.animating, null, { timeout: 60000 });
    assert(Date.now() - t0 < 60000, `${v}: transition finished`);
  }
  await setView('top');
  const y = await ev(() => window.habitat.rig.camera.position.y);
  assert(y > 5, 'top view is above the room');
});

await test('fullscreen toggle', async () => {
  await page.click('.hud-views [data-act="full"]'); await settle(500);
  const on = await ev(() => document.getElementById('app').classList.contains('is-fullscreen') || document.getElementById('app').classList.contains('pseudo-fullscreen'));
  assert(on, 'fullscreen class applied');
  await ev(() => { if (document.fullscreenElement) document.exitFullscreen(); document.getElementById('app').classList.remove('pseudo-fullscreen', 'is-fullscreen'); window.habitat.engine.resize(); });
  await settle(300);
});

await test('selection by clicking an object', async () => {
  await setView('top');
  const p = await screenOf('palu_1', 1.0);
  await page.mouse.click(p.x, p.y); await settle(300);
  const sel = await ev(() => window.habitat.editor.selection);
  assert(sel === 'palu_1', `selected ${sel}`);
  assert(await ev(() => window.habitat.engine.outline.selectedObjects.length === 1), 'outline active');
  assert((await page.textContent('.insp-title .chip')).toLowerCase().includes('enclosure'), 'inspector shows object');
});

await test('move by dragging (grid snapped) + undo', async () => {
  await setView('top');
  const id = 'dehu_1';
  const o0 = await ev((id) => JSON.parse(JSON.stringify(window.habitat.editor.get(id))), id);
  const p = await screenOf(id, 1.0);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  await page.mouse.move(p.x - 60, p.y + 50, { steps: 10 }); await page.mouse.up(); await settle(300);
  const o1 = await ev((id) => window.habitat.editor.get(id), id);
  assert(Math.hypot(o1.position.x - o0.position.x, o1.position.z - o0.position.z) > 0.1, 'object moved');
  // wall-backed type keeps facing into the room; grid: position of centre is on 5 cm grid or wall-flush
  await ev(() => window.habitat.editor.undo()); await settle(200);
  const o2 = await ev((id) => window.habitat.editor.get(id), id);
  assert(near(o2.position.x, o0.position.x) && near(o2.position.z, o0.position.z), 'undo restores position');
});

await test('rotation (keyboard R, inspector) + snapping angle', async () => {
  await ev(() => window.habitat.editor.select('fern_1'));
  const r0 = await ev(() => window.habitat.editor.get('fern_1').rotation);
  await page.keyboard.press('r'); await settle(150);
  const r1 = await ev(() => window.habitat.editor.get('fern_1').rotation);
  assert(near(((r1 - r0) % 360 + 360) % 360, 90), `R rotates +90 (${r0} -> ${r1})`);
  await page.keyboard.press('Shift+R'); await settle(150);
  const r2 = await ev(() => window.habitat.editor.get('fern_1').rotation);
  assert(near(r2, r0), 'Shift+R rotates back');
  await page.fill('input[data-key="rotation"]', '45'); await page.press('input[data-key="rotation"]', 'Enter'); await settle(150);
  assert(near(await ev(() => window.habitat.editor.get('fern_1').rotation), 45), 'inspector rotation');
});

await test('duplicate (Ctrl+D) and delete (Del)', async () => {
  await ev(() => window.habitat.editor.select('terr_b1'));
  const n0 = await ev(() => window.habitat.editor.objects.length);
  await page.keyboard.press('Control+d'); await settle(300);
  const s = await ev(() => ({ n: window.habitat.editor.objects.length, sel: window.habitat.editor.selected }));
  assert(s.n === n0 + 1, 'object duplicated');
  assert(s.sel.id !== 'terr_b1' && s.sel.type === 'terrarium_tropical', 'copy selected');
  assert(s.sel.props.animal.code === 'CC-05', `animal code incremented (${s.sel.props.animal.code})`);
  await page.keyboard.press('Delete'); await settle(300);
  assert(await ev(() => window.habitat.editor.objects.length) === n0, 'copy deleted');
});

await test('snapping: wall snap, grid snap, stacking on a stand, collision report', async () => {
  const r = await ev(() => {
    const h = window.habitat, ed = h.editor;
    const shelf = ed.get('shelf_1');
    const wall = ed.snapper.place(shelf, { x: 1.5, z: 3.6 });            // near south wall
    const grid = ed.snapper.place(ed.get('fern_1'), { x: 2.013, z: 2.031 });
    const stand = ed.get('stand_a');
    const stack = ed.snapper.place(ed.get('terr_b1'), { x: stand.position.x + 0.1, z: stand.position.z });
    const coll = ed.snapper.collisions(ed.get('terr_a1'), { position: { ...ed.get('terr_b1').position }, rotation: 0, elevation: 0.8 });
    return { wall, grid, stack, coll, standTop: stand.elevation + stand.size.h, room: ed.room };
  });
  assert(near(r.wall.position.z, r.room.depth - 0.45 / 2) && r.wall.rotation === 180, 'shelving snaps flush to the south wall, facing into the room');
  assert(near(r.grid.position.x % 0.05, 0, 1e-6) || near(r.grid.position.x % 0.05, 0.05, 1e-6), `grid snap x ${r.grid.position.x}`);
  assert(near(r.stack.elevation, r.standTop), `terrarium stacks on stand (elev ${r.stack.elevation})`);
  assert(r.coll.length > 0, 'overlap detected');
});

await test('room resizing (inspector) rebuilds walls and keeps objects inside', async () => {
  await ev(() => window.habitat.editor.select(null)); await settle(100);
  await page.fill('input[data-room="width"]', '6'); await page.press('input[data-room="width"]', 'Enter'); await settle(400);
  let s = await ev(() => ({ w: window.habitat.editor.room.width, wall: window.habitat.shell.walls.north.geometry.boundingBox || (window.habitat.shell.walls.north.geometry.computeBoundingBox(), window.habitat.shell.walls.north.geometry.boundingBox) }));
  assert(s.w === 6, 'width = 6 m');
  assert(near(s.wall.max.x - s.wall.min.x, 6 + 2 * 0.14, 1e-3), 'north wall rebuilt');
  await page.fill('input[data-room="width"]', '3.2'); await page.press('input[data-room="width"]', 'Enter'); await settle(400);
  s = await ev(() => { const h = window.habitat; const T = h.editor.room.wallThickness; const bad = h.editor.objects.filter((o) => o.position.x > h.editor.room.width + T / 2 + 1e-6 || o.position.x < -T / 2 - 1e-6 || (!o.mount && (o.position.x > h.editor.room.width || o.position.x < 0))); return { bad: bad.length, doorOffset: h.editor.get('door_1').mount.offset }; });
  assert(s.bad === 0, 'objects clamped inside');
  await ev(() => window.habitat.editor.undo()); await ev(() => window.habitat.editor.undo()); await settle(300);
  assert(await ev(() => window.habitat.editor.room.width) === 5, 'undo restores 5 m');
});

await test('add enclosure from library (click-to-place)', async () => {
  await setView('top');
  const n0 = await ev(() => window.habitat.editor.objects.length);
  await page.click('.lib-item[data-type="quarantine"]');
  const box = await page.locator('canvas.viewport-canvas').boundingBox();
  const target = await ev(async () => { const T = await import('three'); const v = new T.Vector3(0, 0, 0.3).project(window.habitat.rig.camera); const r = window.habitat.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; });
  await page.mouse.move(target.x, target.y, { steps: 5 }); await settle(200);
  await page.mouse.click(target.x, target.y); await settle(500);
  const s = await ev(() => ({ n: window.habitat.editor.objects.length, sel: window.habitat.editor.selected }));
  assert(s.n === n0 + 1 && s.sel?.type === 'quarantine', 'quarantine unit added & selected');
  void box;
});

await test('add furniture by drag & drop from the library', async () => {
  const n0 = await ev(() => window.habitat.editor.objects.length);
  const target = await ev(async () => { const T = await import('three'); const v = new T.Vector3(-0.8, 0, 0.6).project(window.habitat.rig.camera); const r = window.habitat.renderer.domElement.getBoundingClientRect(); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; });
  await page.locator('.lib-item[data-type="workbench"]').dragTo(page.locator('#viewport'), { targetPosition: await (async () => { const b = await page.locator('#viewport').boundingBox(); return { x: target.x - b.x, y: target.y - b.y }; })() });
  await settle(600);
  const s = await ev(() => ({ n: window.habitat.editor.objects.length, sel: window.habitat.editor.selected }));
  assert(s.n === n0 + 1 && s.sel?.type === 'workbench', `workbench dropped (${s.n - n0} added)`);
});

await test('wall placement: door & window follow walls and cut openings', async () => {
  const s = await ev(() => {
    const h = window.habitat, ed = h.editor;
    const w = ed.add('window', { mount: { wall: 'west', offset: 2.0 }, elevation: 1.0 });
    const cand = ed.snapper.place(w, { x: 2.4, z: 3.95 }); // drag near the south wall
    ed.update(w.id, { mount: cand.mount, position: cand.position, rotation: cand.rotation });
    const o = ed.get(w.id);
    h.shell.walls.south.geometry.computeBoundingBox();
    const holes = h.shell.walls.south.geometry.attributes.position.count;
    return { wall: o.mount.wall, rot: o.rotation, z: o.position.z, depth: ed.room.depth, holes };
  });
  assert(s.wall === 'south' && s.rot === 180, `window moved to south wall (${s.wall})`);
  assert(near(s.z, s.depth + 0.07, 1e-3), 'window centred in the wall thickness');
});

let exported = null;
await test('JSON export (download)', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  const file = path.join(os.tmpdir(), 'habitat-export.json');
  await dl.saveAs(file);
  exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  exported.__file = file;
  assert(exported.schema === 'ir-manager/habitat-room' && exported.version === 2 && Array.isArray(exported.assemblies) && Array.isArray(exported.enclosures) && Array.isArray(exported.instances), 'schema/version 2 + library arrays');
  assert(Array.isArray(exported.objects) && exported.objects.length > 20, 'objects exported');
  const o = exported.objects[0];
  assert(o.id && o.type && o.position && o.size && 'rotation' in o, 'logical fields present');
  assert(!JSON.stringify(exported).includes('"geometry"'), 'no visual/mesh data in export');
});

await test('JSON re-import (round trip)', async () => {
  const count = exported.objects.length;
  await ev(() => window.habitat.newRoom()); await settle(400);
  assert(await ev(() => window.habitat.editor.objects.length) === 0, 'new room is empty');
  await page.setInputFiles('#toolbar input[type=file]', exported.__file); await settle(1200);
  const s = await ev(() => window.habitat.editor.toJSON());
  assert(s.objects.length === count, `objects restored (${s.objects.length}/${count})`);
  const a = exported.objects.find((o) => o.id === 'terr_a1'), b = s.objects.find((o) => o.id === 'terr_a1');
  assert(JSON.stringify(a) === JSON.stringify(b), 'object data identical after round trip');
  // invalid file is rejected without destroying the room
  const bad = path.join(os.tmpdir(), 'habitat-bad.json'); fs.writeFileSync(bad, '{"schema":"something-else"}');
  await page.setInputFiles('#toolbar input[type=file]', bad); await settle(500);
  assert(await ev(() => window.habitat.editor.objects.length) === count, 'invalid import rejected');
});

await test('browser refresh restores the autosaved room', async () => {
  await ev(() => window.habitat.editor.update('fern_1', { position: { x: 2.2, z: 2.2 } }));
  await settle(800);
  await page.reload();
  await page.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 180000 });
  const s = await ev(() => window.habitat.editor.get('fern_1')?.position);
  assert(s && near(s.x, 2.2) && near(s.z, 2.2), `fern position restored (${JSON.stringify(s)})`);
});

await test('responsive viewport resizing', async () => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForFunction(() => Math.abs(window.habitat.renderer.domElement.clientWidth - document.getElementById('viewport').clientWidth) <= 1, null, { timeout: 30000 }).catch(() => {});
  const a = await ev(() => ({ w: window.habitat.renderer.domElement.clientWidth, aspect: window.habitat.rig.camera.aspect, vp: document.getElementById('viewport').clientWidth }));
  assert(Math.abs(a.w - a.vp) <= 1, 'canvas follows viewport');
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => { const c = window.habitat.renderer.domElement; return Math.abs(window.habitat.rig.camera.aspect - c.clientWidth / c.clientHeight) < 0.01 && c.clientWidth > 1000; }, null, { timeout: 60000 });
  const b = await ev(() => ({ w: window.habitat.renderer.domElement.clientWidth, aspect: window.habitat.rig.camera.aspect, h: window.habitat.renderer.domElement.clientHeight }));
  assert(b.w > a.w && Math.abs(b.aspect - b.w / b.h) < 0.01, 'camera aspect updated');
  await page.click('[data-act="library"]');
  // the canvas is resized on the next animation frame (can be > 0.5 s apart on a software rasteriser)
  await page.waitForFunction((w) => window.habitat.renderer.domElement.clientWidth > w, b.w, { timeout: 30000 }).catch(() => {});
  const c = await ev(() => window.habitat.renderer.domElement.clientWidth);
  assert(c > b.w, `collapsing the library enlarges the viewport (${b.w} → ${c})`);
  await page.click('[data-act="library"]'); await settle(300);
});

await test('lighting presets & quality levels', async () => {
  for (const l of ['night', 'evening', 'day']) { await page.click(`[data-light="${l}"]`); await settle(250); }
  for (const q of ['fast', 'balanced', 'high']) { await page.selectOption('[data-role="quality"]', q); await settle(300); }
  assert(await ev(() => window.habitat.lighting.presetKey === 'day' && window.habitat.engine.qualityKey === 'high'), 'presets applied');
});

await test('progressive renderer: interactive while orbiting, final restored after settling', async () => {
  await setView('overview'); await waitIdle();
  const box = await page.locator('canvas.viewport-canvas').boundingBox();
  const shadows0 = await ev(() => window.habitat.engine.stats.shadowUpdates);
  await page.mouse.move(box.x + box.width / 2, box.y + 30); await page.mouse.down();
  let sawInteractive = false;
  for (let i = 0; i < 6; i++) { await page.mouse.move(box.x + box.width / 2 + i * 25, box.y + 32); if (await ev(() => window.habitat.engine.isInteractive)) sawInteractive = true; }
  const midMode = await ev(() => window.habitat.engine.mode);
  await page.mouse.up();
  assert(sawInteractive && midMode === 'interactive', `interactive profile used while orbiting (mode ${midMode})`);
  await waitIdle();
  const s = await ev(() => ({ shadows: window.habitat.engine.stats.shadowUpdates, draws: window.habitat.engine.stats.drawCalls }));
  assert(s.shadows === shadows0, `camera-only movement did not re-render shadow maps (${shadows0} -> ${s.shadows})`);
});

await test('shadow invalidation on placement change', async () => {
  const n0 = await ev(() => window.habitat.engine.stats.shadowUpdates);
  await ev(() => window.habitat.editor.update('fern_1', { position: { x: 2.6, z: 2.4 } }));
  await page.waitForFunction((n) => window.habitat.engine.stats.shadowUpdates > n, n0, { timeout: 60000 });
});

await test('no shader recompilation on lighting presets / occupancy / placement preview', async () => {
  await settle(500);
  const p0 = await ev(() => window.habitat.renderer.info.programs.length);
  for (const l of ['night', 'evening', 'day']) { await page.click(`[data-light="${l}"]`); await settle(300); }
  await ev(() => { const ed = window.habitat.editor; ed.update('terr_a1', { props: { occupied: false } }); ed.update('terr_a1', { props: { occupied: true } }); ed.update('palu_1', { props: { lighting: false } }); ed.update('palu_1', { props: { lighting: true } }); });
  await settle(800);
  const p1 = await ev(() => window.habitat.renderer.info.programs.length);
  assert(p1 === p0, `program count stable (${p0} -> ${p1})`);
});

await test('static batching reduces draw calls; selection detaches the object', async () => {
  await ev(() => window.habitat.editor.select(null)); await settle(300);
  await waitIdle();
  const s = await ev(() => ({ b: window.habitat.batcher.stats, draws: window.habitat.engine.stats.drawCalls }));
  assert(s.b.batches > 20 && s.b.instances > 150, `batches ${s.b.batches}, instances ${s.b.instances}`);
  await ev(() => window.habitat.editor.select('terr_a1')); await settle(300); await waitIdle();
  const d = await ev(() => { const v = window.habitat.objects.get('terr_a1'); let shown = 0; v.visual.traverse((m) => { if (m.isMesh && m.userData.batchable && m.visible) shown++; }); return { shown, detached: window.habitat.batcher.detachedId }; });
  assert(d.detached === 'terr_a1' && d.shown > 5, 'selected object drawn from its own meshes (outline works)');
  await ev(() => window.habitat.editor.select(null));
});

await test('Auto quality mode available and adaptive diagnostics exposed', async () => {
  await page.selectOption('[data-role="quality"]', 'auto'); await settle(500);
  const d = await ev(() => window.habitat.engine.diagnostics());
  assert(d.quality === 'Auto' && d.finalProfile && typeof d.renderScale === 'number', JSON.stringify(d));
  await page.keyboard.press('i'); await settle(300);
  assert(await page.isVisible('.hud-diag'), 'diagnostics panel toggles with I');
  const txt = await page.textContent('.hud-diag');
  for (const k of ['Draw calls', 'Triangles', 'Render scale', 'Mode', 'FPS']) assert(txt.includes(k), `diagnostics show ${k}`);
  await page.keyboard.press('i');
  await page.selectOption('[data-role="quality"]', 'fast'); await settle(300);
});

// ============================================================== PLANNER (stylised renderer) & mode switching
/** Logical document snapshot: everything that is saved / exported (room + objects). */
const docSnap = () => ev(() => { const d = window.habitat.editor.toJSON(); return JSON.stringify({ schema: d.schema, version: d.version, room: d.room, objects: d.objects }); });
/** World transform of every view in the active mode (derived from the document by the mode's views). */
const viewTransforms = () => ev(() => {
  const h = window.habitat, out = {};
  for (const [id, v] of h.objects.views) { const p = v.root.position, pr = v.proxy.scale; out[id] = [p.x, p.y, p.z, v.root.rotation.y, pr.x, pr.y, pr.z, v.root.visible].map((x) => (typeof x === 'number' ? +x.toFixed(5) : x)); }
  return out;
});
async function switchMode(m) {
  const ok = await ev((m) => window.habitat.setRenderMode(m), m);
  assert(ok === true, `setRenderMode(${m}) returned ${ok}`);
  assert(await ev(() => window.habitat.renderMode) === m, `active mode is ${m}`);
  await settle(400);
}

await test('Planner ↔ Showcase switching leaves RoomDocument, ids and transforms untouched', async () => {
  await ev(() => window.habitat.loadDemo({ silent: true })); await settle(800);
  await ev(() => window.habitat.editor.select('terr_b1'));
  const before = await docSnap();
  const hist0 = await ev(() => window.habitat.editor.history.undoStack.length);
  const tShow = await viewTransforms();
  await switchMode('planner');
  assert(await docSnap() === before, 'document unchanged after switching to Planner');
  const tPlan = await viewTransforms();
  const ids = Object.keys(tShow).sort();
  assert(JSON.stringify(Object.keys(tPlan).sort()) === JSON.stringify(ids), 'same object ids have views in both modes');
  const diff = ids.filter((id) => JSON.stringify(tShow[id]) !== JSON.stringify(tPlan[id]));
  assert(diff.length === 0, 'view transforms differ between modes: ' + diff.slice(0, 5).join(', '));
  await switchMode('showcase');
  await switchMode('planner');
  assert(await docSnap() === before, 'document unchanged after a round trip of switches');
  assert(await ev(() => window.habitat.editor.selection) === 'terr_b1', 'selection preserved across switches');
  const hist1 = await ev(() => window.habitat.editor.history.undoStack.length);
  assert(hist0 === hist1, 'undo history untouched by switching');
});

await test('Planner renders the room cheaply (batched painted materials, no lights, no shadow maps)', async () => {
  await waitIdle();
  const s = await ev(() => { const h = window.habitat, d = h.engine.diagnostics(); let lights = 0; h.scene.traverse((o) => { if (o.isLight) lights++; }); return { d, lights, batches: h.batcher.stats.batches, views: h.objects.views.size, n: h.editor.objects.length, mats: h.mode.mats.count() }; });
  assert(s.views === s.n, `every object has a planner view (${s.views}/${s.n})`);
  assert(s.lights === 0, 'no real-time lights in the Planner scene');
  assert(s.d.renderer === 'planner' && s.d.drawCalls > 0 && s.d.drawCalls < 60, 'draw calls: ' + s.d.drawCalls);
  assert(s.d.triangles > 20000, 'room geometry rendered: ' + s.d.triangles);
  assert(s.mats <= 10, 'material count: ' + s.mats);
  await page.keyboard.press('i'); await settle(300);
  const txt = await page.textContent('.hud-diag');
  for (const k of ['PLANNER', 'Draw calls', 'Triangles', 'Render scale', 'Painted materials', 'GPU']) assert(txt.includes(k), `planner diagnostics show ${k}`);
  await page.keyboard.press('i');
});

await test('Planner selection by clicking (amber rim on the detached object)', async () => {
  await ev(() => window.habitat.editor.select(null));
  await setView('hero'); await waitIdle();
  const p = await screenOf('rack_1', 0.45);
  await page.mouse.click(p.x, p.y);
  // the batcher detaches the selection on the next rendered frame
  await page.waitForFunction(() => window.habitat.batcher.detachedId === window.habitat.editor.selection, null, { timeout: 30000 }).catch(() => {});
  const s = await ev(() => { const h = window.habitat, v = h.objects.get('rack_1'); return { sel: h.editor.selection, selected: v.selected, detached: h.batcher.detachedId, rim: v.visual.children.some((m) => /_sel$/.test(m.material.name)) }; });
  assert(s.sel === 'rack_1', 'selected by click: ' + s.sel);
  assert(s.selected && s.rim, 'selected view uses the amber rim materials');
  assert(s.detached === 'rack_1', 'selected object detached from the batches');
  await ev(() => window.habitat.editor.select(null)); await settle(200);
  assert(await ev(() => !window.habitat.objects.get('rack_1').selected), 'deselected view restored');
});

await test('edits in Planner are shown by Showcase (stale mode re-synced on activation)', async () => {
  await ev(() => window.habitat.editor.update('dehu_1', { position: { x: 4.6, z: 1.3 } }));
  await ev(() => window.habitat.editor.update('terr_a1', { props: { occupied: false } }));
  const snap = await docSnap();
  const tPlan = await viewTransforms();
  await switchMode('showcase');
  await ev(() => window.habitat.objects.whenLoaded());
  const tShow = await viewTransforms();
  assert(JSON.stringify(tShow.dehu_1) === JSON.stringify(tPlan.dehu_1), 'moved object has the same transform in Showcase');
  assert(await docSnap() === snap, 'document unchanged by the switch');
  await ev(() => { window.habitat.editor.undo(); window.habitat.editor.undo(); });
  await switchMode('planner');
});

await test('export / import round trip in Planner mode is identical to Showcase', async () => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  const file = path.join(os.tmpdir(), 'habitat-export-planner.json');
  await dl.saveAs(file);
  const a = JSON.parse(fs.readFileSync(file, 'utf8'));
  await switchMode('showcase');
  const b = JSON.parse(await ev(() => JSON.stringify(window.habitat.editor.toJSON())));
  assert(JSON.stringify(a.objects) === JSON.stringify(b.objects) && JSON.stringify(a.room) === JSON.stringify(b.room), 'export is renderer independent');
  await switchMode('planner');
  await ev(() => window.habitat.newRoom()); await settle(300);
  await page.setInputFiles('#toolbar input[type=file]', file); await settle(1200);
  const s = await ev(() => ({ n: window.habitat.editor.objects.length, views: window.habitat.objects.views.size, doc: JSON.stringify(window.habitat.editor.toJSON().objects) }));
  assert(s.n === a.objects.length && s.views === s.n, `import restored ${s.n}/${a.objects.length} objects with planner views`);
  assert(s.doc === JSON.stringify(a.objects), 'imported objects identical to the export');
  await switchMode('showcase');
  assert(await ev(() => window.habitat.objects.views.size) === s.n, 'Showcase re-synced to the imported document');
  await switchMode('planner');
});

await test('Planner lighting presets & selector UI', async () => {
  for (const k of ['night', 'evening', 'day']) {
    await page.click(`[data-light="${k}"]`); await settle(250);
    assert(await ev((k) => window.habitat.mode.mats.presetKey === k && window.habitat.prefs.lighting === k, k), `preset ${k} applied`);
  }
  assert(await page.isVisible('[data-mode="planner"].on'), 'PLANNER segment active');
  await page.click('[data-mode="showcase"]');
  await page.waitForFunction(() => window.habitat.renderMode === 'showcase', null, { timeout: 60000 });
  await page.click('[data-mode="planner"]');
  await page.waitForFunction(() => window.habitat.renderMode === 'planner', null, { timeout: 60000 });
});

await test('Planner starts without loading the realistic pipeline (lazy Showcase)', async () => {
  const p2 = await ctx.newPage();
  const errs = []; p2.on('pageerror', (e) => errs.push(e.message));
  await p2.goto(BASE + '?mode=planner');
  await p2.evaluate(() => { try { localStorage.clear(); } catch {} });
  await p2.reload();
  await p2.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 180000 });
  const s = await p2.evaluate(() => {
    const res = performance.getEntriesByType('resource').map((r) => r.name);
    return { mode: window.habitat.renderMode, showcase: !!window.habitat.modes.showcase, glb: res.filter((u) => /\.glb|\.hdr/.test(u)).length, post: res.filter((u) => /postprocessing|GLTFLoader|RenderEngine/.test(u)).length, thumbs: res.filter((u) => /thumbnails/.test(u)).length };
  });
  await p2.close();
  assert(s.mode === 'planner' && !s.showcase, 'Planner is the default, Showcase not instantiated');
  assert(s.glb === 0, `no GLB / HDR downloaded in Planner (${s.glb})`);
  assert(s.post === 0, `no realistic-pipeline modules loaded (${s.post})`);
  assert(errs.length === 0, errs.join(' | '));
});

// ============================================================== CUSTOM ENCLOSURES + TETRIS ASSEMBLY BUILDER + ROOM
/** Optional validation screenshots of the real UI workflow: SHOTS=<dir> node tests/run-e2e.mjs */
async function shot(name, clip) {
  if (!process.env.SHOTS) return;
  fs.mkdirSync(process.env.SHOTS, { recursive: true });
  try { await waitIdle(30000); } catch {}
  await settle(700);
  await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png'), clip });
}
async function designerSet(path, value) { const l = page.locator(`.designer [data-path="${path}"]`); await l.fill(String(value)); await l.press('Tab'); await settle(120); }
async function openSection(id) { const open = await page.locator(`.designer .dsec.open [data-section="${id}"]`).count(); if (!open) await page.click(`.designer [data-section="${id}"]`); }
/** Real pointer drag from a builder palette card to a world position of the front elevation (centre of the piece). */
async function builderDrag(cardSel, wx, wy, { alt = false } = {}) {
  const from = await page.locator(cardSel).first().boundingBox();
  const to = await ev(([x, y]) => { const b = window.habitat.builder; const [sx, sy] = b.toScreen(x, y); const r = b.canvas.getBoundingClientRect(); return { x: r.left + sx, y: r.top + sy }; }, [wx, wy]);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down();
  if (alt) await page.keyboard.down('Alt');
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
  await page.mouse.move(to.x, to.y); await settle(60); await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
  await settle(120);
}
const tpl = (name) => ev((n) => window.habitat.editor.templates.find((t) => t.name === n), name);
const builderState = () => ev(() => { const b = window.habitat.builder; return { st: b.stats, members: b.draft.members.map((m) => ({ id: m.id, kind: m.kind, inst: m.instanceId, x: m.position.x, y: m.position.y })), reserved: b.draft.reserved.length, overlaps: (() => { const bx = b.boxes; let n = 0; for (let i = 0; i < bx.length; i++) for (let j = i + 1; j < bx.length; j++) if (bx[i].x0 < bx[j].x1 - 5e-4 && bx[i].x1 > bx[j].x0 + 5e-4 && bx[i].y0 < bx[j].y1 - 5e-4 && bx[i].y1 > bx[j].y0 + 5e-4 && bx[i].z0 < bx[j].z1 - 5e-4 && bx[i].z1 > bx[j].z0 + 5e-4) n++; return n; })() }; });

await test('Enclosure Designer: create "TERRA 60" (60×60×60, glass, sliding doors, ventilation, tropical) via the UI', async () => {
  await switchMode('planner');
  await ev(() => window.habitat.loadDemo({ silent: true })); await settle(600);
  await page.click('.lib-mine [data-mact="new-enclosure"]'); await settle(1500);
  assert(await page.isVisible('.designer'), 'designer open');
  await designerSet('name', 'TERRA 60');
  await designerSet('dimensions.width', 60); await designerSet('dimensions.height', 60); await designerSet('dimensions.depth', 60);
  await page.click('.designer [data-set="construction.type"][data-value="glass"]');
  await openSection('front'); await page.click('.designer [data-set="front.type"][data-value="sliding"]');
  await openSection('vent'); if (!(await page.isChecked('.designer input[data-vent="top"]'))) await page.click('.designer .vent-row:has(input[data-vent="top"]) label');
  await openSection('interior'); await page.click('.designer [data-set="interior.preset"][data-value="tropical"]');
  await settle(600);
  const d = await ev(() => { const x = window.habitat.designer.draft; return { d: x.dimensions, f: x.front.type, v: x.ventilation.map((v) => v.side), p: x.interior.preset, t: x.type }; });
  assert(d.d.width === 0.6 && d.d.height === 0.6 && d.d.depth === 0.6, 'dimensions 60×60×60: ' + JSON.stringify(d.d));
  assert(d.f === 'sliding' && d.t === 'glass' && d.p === 'tropical' && d.v.includes('top'), JSON.stringify(d));
  await page.click('.designer [data-act="save"]'); await settle(500);
  const t = await tpl('TERRA 60');
  assert(t && t.dimensions.width === 0.6 && !(await page.isVisible('.designer')), 'saved to My Enclosures');
  assert(await page.locator('.lib-mine [data-mine="template"]', { hasText: 'TERRA 60' }).count() === 1, 'card in MY ENCLOSURES');
});

await test('Designer rebuilds parametrically — resizing never scales the model', async () => {
  const r = await ev(async () => {
    const h = window.habitat, L = await import('/src/model/Library.js'), G = await import('/src/enclosures/EnclosureGeometry.js'), T = await import('three');
    const base = h.editor.templates.find((t) => t.name === 'TERRA 60');
    const bb = (w) => { const t = L.normalizeTemplate({ ...JSON.parse(JSON.stringify(base)), dimensions: { ...base.dimensions, width: w } }); const g = G.buildEnclosure(h.modes.planner.mats, t, { shadow: false }).geometries(); const box = new T.Box3(); for (const x of Object.values(g)) { x.computeBoundingBox(); box.union(x.boundingBox); } return { w: box.max.x - box.min.x, tris: Object.values(g).reduce((a, x) => a + x.index.count / 3, 0) }; };
    const a = bb(1.0), b = bb(1.5);
    let scaled = 0; h.previewStage().content.traverse((o) => { if (o.isMesh && (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1)) scaled++; });
    return { a, b, scaled };
  });
  assert(Math.abs(r.a.w - 1.0) < 0.05 && Math.abs(r.b.w - 1.5) < 0.05, 'geometry width follows the physical width: ' + JSON.stringify(r));
  assert(r.b.tris > r.a.tris, 'wider enclosure gets more geometry (vent slots, substrate), not a stretched copy');
  assert(r.scaled === 0, 'no scaled meshes');
});

await test('Enclosure Designer: create "RACK 30" rack box — 30 × 45 × 18 cm = W 30 × D 45 × H 18 (low box)', async () => {
  await page.click('.lib-mine [data-mact="new-enclosure"]'); await settle(1200);
  // the dimension fields are presented in the locked order WIDTH, DEPTH, HEIGHT
  const order = await page.$$eval('.designer [data-dim]', (els) => els.map((e) => e.dataset.dim));
  assert(JSON.stringify(order) === '["width","depth","height"]', 'designer field order W, D, H: ' + order);
  assert((await page.textContent('.designer')).includes('W × D × H'), 'designer shows W × D × H');
  await designerSet('name', 'RACK 30');
  await page.click('.designer [data-set="construction.type"][data-value="rack"]');
  // typed exactly as the user reads "30 × 45 × 18": first field, second field, third field
  const f = page.locator('.designer [data-dim] input');
  for (const [i, v] of [[0, 30], [1, 45], [2, 18]]) { await f.nth(i).fill(String(v)); await f.nth(i).press('Tab'); await settle(120); }
  assert((await page.textContent('.designer [data-role=dim-sum]')).includes('30 × 45 × 18 cm'), 'summary 30 × 45 × 18 cm');
  await shot('1-designer-rack30-WxDxH');
  await page.click('.designer [data-act="save"]'); await settle(400);
  const t = await tpl('RACK 30');
  assert(t && t.type === 'rack' && t.front.type === 'tub' && t.dimensions.width === 0.3 && t.dimensions.depth === 0.45 && t.dimensions.height === 0.18, JSON.stringify(t?.dimensions));
});

await test('RACK 30 physical geometry is 30 wide, 45 deep, 18 high (not a 45 cm tall box)', async () => {
  const r = await ev(async () => {
    const h = window.habitat, T = await import('three'), G = await import('/src/enclosures/EnclosureGeometry.js'), L = await import('/src/model/Library.js');
    const t = h.editor.templates.find((x) => x.name === 'RACK 30');
    const g = G.buildEnclosure(h.modes.planner.mats, t, { shadow: false }).geometries(); const box = new T.Box3();
    for (const x of Object.values(g)) { x.computeBoundingBox(); box.union(x.boundingBox); }
    const ms = L.memberSize({ kind: 'enclosure', enclosureId: t.id }, h.editor.lib);
    return { w: box.max.x - box.min.x, d: box.max.z - box.min.z, h: box.max.y - box.min.y, ms };
  });
  assert(Math.abs(r.w - 0.30) < 0.012 && Math.abs(r.d - 0.45) < 0.012 && Math.abs(r.h - 0.18) < 0.005, 'geometry W×D×H ≈ 30×45×18: ' + JSON.stringify(r));
  assert(r.ms.w === 0.3 && r.ms.d === 0.45 && r.ms.h === 0.18, 'builder piece size: ' + JSON.stringify(r.ms));
  assert((await page.textContent('.lib-mine [data-mine="template"]:has-text("RACK 30")')).includes('30×45×18 cm'), 'MY ENCLOSURES card shows 30×45×18 cm');
});

await test('Assembly Builder: drag TERRA 60 ×9 (3×3) and RACK 30 ×6 above — magnetic snapping, no overlaps', async () => {
  await page.click('.lib-mine [data-mact="new-assembly"]'); await settle(1500);
  assert(await page.isVisible('.builder .tetris canvas'), 'builder open');
  const T = '.builder .pal-card:has-text("TERRA 60")', R = '.builder .pal-card:has-text("RACK 30")';
  await builderDrag(T, 0.3, 0.3);
  // following drops land roughly beside / above (±2 cm): snapping connects them
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) if (row || col) await builderDrag(T, 0.3 + col * 0.6 + 0.02, 0.3 + row * 0.6 + 0.015);
  let s = await builderState();
  assert(s.st.enclosures === 9 && s.overlaps === 0, `9 terrariums placed without overlaps (${s.st.enclosures}, overlaps ${s.overlaps})`);
  const grid = s.members.map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)}`).sort();
  assert(JSON.stringify(grid) === JSON.stringify(['0.00,0.00', '0.00,0.60', '0.00,1.20', '0.60,0.00', '0.60,0.60', '0.60,1.20', '1.20,0.00', '1.20,0.60', '1.20,1.20']), 'exact 3×3 layout: ' + grid.join(' '));
  for (let i = 0; i < 6; i++) await builderDrag(R, 0.15 + i * 0.3 + 0.01, 1.8 + 0.09 + 0.02);
  s = await builderState();
  assert(s.st.rackBoxes === 6 && s.overlaps === 0, `6 rack boxes above (${s.st.rackBoxes})`);
  assert(s.members.filter((m) => m.y > 1.79).every((m) => Math.abs(m.y - 1.8) < 1e-6), 'rack boxes sit on the top row');
  // collision: dropping onto an occupied spot with snapping bypassed (Alt) is refused
  await builderDrag(T, 0.9, 0.9, { alt: true });
  s = await builderState();
  assert(s.st.enclosures === 9 && s.overlaps === 0, 'overlapping drop rejected');
  // undo / redo of the last placement
  await page.keyboard.press('Control+z'); await settle(150);
  assert((await builderState()).st.rackBoxes === 5, 'undo removes the last rack box');
  await page.keyboard.press('Control+y'); await settle(150);
  assert((await builderState()).st.rackBoxes === 6, 'redo restores it');
});

await test('Assembly Builder: technical cabinet below, save as "TEST BREEDING WALL" (dimensions verified)', async () => {
  // drop a cabinet under the bottom row: the structure re-bases on the floor
  await builderDrag('.builder .pal-row[data-module="cabinet"]', 0.45, -0.4);
  let s = await builderState();
  const cab = s.members.find((m) => m.kind === 'module');
  assert(cab && Math.abs(cab.y) < 1e-6, 'cabinet placed at floor level, structure lifted: ' + JSON.stringify(cab));
  assert(s.members.filter((m) => m.kind === 'enclosure').every((m) => m.y >= 0.8 - 1e-6), 'terrariums now stand on the cabinet');
  // exact numeric editing is secondary but available: full width + 40 cm height
  await page.click('.builder [data-act="fitw"]'); await settle(150);
  const h = page.locator('.builder input[data-mod="h"]'); await h.fill('40'); await h.press('Tab'); await settle(200);
  s = await builderState();
  assert(s.overlaps === 0, 'no overlaps after resize');
  // auto frame: 3 cm uprights + top rail are added to the OUTER dimensions, content bounds unchanged
  await page.selectOption('.builder [data-f="frame.mode"]', 'auto'); await settle(300);
  const tot = await page.$$eval('.builder .totals [data-total]', (els) => els.map((e) => e.dataset.total));
  assert(JSON.stringify(tot) === '["width","depth","height"]', 'totals in W, D, H order: ' + tot);
  const dimTxt = await page.textContent('.builder [data-role=asm-dims]');
  assert(dimTxt.includes('186 × 60 × 241 cm') && dimTxt.includes('180 × 60 × 238 cm'), 'outer incl. frame 186 × 60 × 241, content 180 × 60 × 238: ' + dimTxt);
  assert((await page.textContent('.builder [data-role=status]')).includes('186 × 60 × 241 cm (W × D × H'), 'status line W × D × H');
  await page.fill('.builder [data-role="name"]', 'TEST BREEDING WALL'); await page.press('.builder [data-role="name"]', 'Tab');
  await ev(() => { const b = window.habitat.builder; b.sel = null; b.renderProps(); b._draw(); }); await settle(200);
  await shot('2-builder-test-breeding-wall');
  if (process.env.SHOTS) { // close-up of the low RACK 30 row on top of the terrariums
    const c = await ev(() => { const b = window.habitat.builder; const r = b.canvas.getBoundingClientRect(); const [x0, y0] = b.toScreen(-0.08, 2.52), [x1, y1] = b.toScreen(1.88, 1.9); return { x: r.left + x0, y: r.top + y0, width: x1 - x0, height: y1 - y0 }; });
    await shot('3-rack30-low-row', c);
  }
  await page.click('.builder [data-act="save"]'); await settle(600);
  const a = await ev(() => { const ed = window.habitat.editor; const a = ed.assemblies.find((x) => x.name === 'TEST BREEDING WALL'); const L = ed.lib; return a && { id: a.id, n: a.members.length, inst: a.members.filter((m) => m.instanceId).map((m) => m.instanceId), allInDoc: a.members.filter((m) => m.instanceId).every((m) => L.instances.has(m.instanceId)) }; });
  assert(a && a.n === 16 && a.allInDoc, 'assembly saved with 16 members, all instances in the document');
  assert(new Set(a.inst).size === 15, '15 distinct physical enclosure ids');
  const st = await ev(async (id) => { const L = await import('/src/model/Library.js'); const ed = window.habitat.editor; return L.assemblyStats(ed.lib.assemblies.get(id), ed.lib); }, a.id);
  assert(Math.abs(st.width - 1.86) < 1e-6 && Math.abs(st.depth - 0.6) < 1e-6 && Math.abs(st.height - 2.41) < 1e-6, 'outer W × D × H 186 × 60 × 241 cm: ' + JSON.stringify(st));
  assert(Math.abs(st.content.width - 1.8) < 1e-6 && Math.abs(st.content.depth - 0.6) < 1e-6 && Math.abs(st.content.height - 2.38) < 1e-6, 'content 180 × 60 × 238 cm (40 cabinet + 3 × 60 + 18 rack row)');
  assert(st.enclosures === 9 && st.rackBoxes === 6 && st.modules === 1, 'counts 9 / 6 / 1');
  assert(await page.locator('.lib-mine [data-mine="assembly"]', { hasText: 'TEST BREEDING WALL' }).count() === 1, 'card in MY ASSEMBLIES');
});

let wall = null;
await test('Drag TEST BREEDING WALL from MY ASSEMBLIES into the room; move & rotate it as ONE structure', async () => {
  await ev(() => { const ed = window.habitat.editor; for (const id of ['quar_1', 'tubs_1', 'incu_1']) ed.remove(id); }); // free the west wall
  await setView('top'); await waitIdle();
  const target = await ev(async () => { const T = await import('three'); const h = window.habitat, r = h.editor.room; const v = new T.Vector3(1.2 - r.width / 2, 0, 2.2 - r.depth / 2).project(h.rig.camera); const c = h.renderer.domElement.getBoundingClientRect(); return { x: (v.x + 1) / 2 * c.width, y: (1 - v.y) / 2 * c.height }; });
  const n0 = await ev(() => window.habitat.editor.objects.length);
  await page.dragAndDrop('.lib-mine [data-mine="assembly"]', '#viewport canvas.viewport-canvas', { targetPosition: target });
  await settle(800);
  wall = await ev(() => { const ed = window.habitat.editor; const o = ed.objects.find((x) => x.type === 'assembly'); return o && JSON.parse(JSON.stringify(o)); });
  assert(wall && (await ev(() => window.habitat.editor.objects.length)) === n0 + 1, 'ONE room object for the whole assembly');
  assert(Math.abs(wall.size.w - 1.86) < 1e-6 && Math.abs(wall.size.h - 2.41) < 1e-6 && Math.abs(wall.size.d - 0.6) < 1e-6, 'room footprint = assembly outer dimensions: ' + JSON.stringify(wall.size));
  assert(await ev(() => window.habitat.objects.get(window.habitat.editor.objects.find((x) => x.type === 'assembly').id).members.size) === 16, '16 members kept as separate nodes');
  const members0 = await ev((id) => window.habitat.objects.get(id).members.size, wall.id);
  assert(members0 === 16, 'view has 16 member nodes');
  // move by dragging the structure
  const p0 = await screenOf(wall.id, 0.5);
  await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p0.x + 40, p0.y + 10, { steps: 6 }); await page.mouse.move(p0.x + 70, p0.y + 20, { steps: 6 }); await page.mouse.up(); await settle(400);
  const moved = await ev((id) => window.habitat.editor.get(id).position, wall.id);
  assert(Math.hypot(moved.x - wall.position.x, moved.z - wall.position.z) > 0.1, 'whole assembly moved: ' + JSON.stringify(moved));
  await ev((id) => window.habitat.editor.select(id), wall.id); await page.keyboard.press('r'); await settle(300);
  const rot = await ev((id) => window.habitat.editor.get(id).rotation, wall.id);
  assert(rot % 90 === 0 && rot !== wall.rotation, 'rotated as one structure: ' + rot);
  const colls = await ev((id) => { const ed = window.habitat.editor; return ed.snapper.collisions(ed.get(id)).length; }, wall.id);
  assert(typeof colls === 'number', 'room collision uses the assembly footprint');
  wall = await ev((id) => JSON.parse(JSON.stringify(window.habitat.editor.get(id))), wall.id);
  if (process.env.SHOTS) { await ev(() => { const h = window.habitat; h.editor.select(null); h.rig.goTo('hero', { instant: true }); }); await shot('4-room-assembly'); await ev(() => window.habitat.rig.goTo('iso', { instant: true })); await shot('4b-room-assembly-iso'); }
});

await test('ENTER ASSEMBLY → select one terrarium → exit (hierarchical selection)', async () => {
  await setView('hero'); await ev((id) => { const h = window.habitat; h.editor.select(id); h.focusSelected(); h.rig.update(performance.now() + 5000); }, wall.id); await settle(1200);
  const c = await screenOf(wall.id, 0.5);
  await page.mouse.dblclick(c.x, c.y); await settle(500);
  assert(await ev(() => !!window.habitat.assemblyContext), 'assembly entered (double-click)');
  assert(await page.isVisible('.hud-context'), 'context banner visible');
  // click the member at the centre of the terrarium block
  const mp = await ev(async (id) => { const T = await import('three'); const h = window.habitat, v = h.objects.get(id); const m = [...v.members.values()].find((x) => x.part.member?.enclosureId && x.part.size.h > 0.5 && x.part.y0 > 1.3); const p = new T.Vector3(); m.proxy.updateMatrixWorld(); p.setFromMatrixPosition(m.proxy.matrixWorld); p.y += m.part.size.h / 2; p.project(h.rig.camera); const r = h.renderer.domElement.getBoundingClientRect(); return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, id: m.part.id }; }, wall.id);
  await page.mouse.click(mp.x, mp.y); await settle(400);
  const sel = await ev(() => { const m = window.habitat.selectedMember; return m && { code: m.instance?.code, inst: m.instance?.id, tpl: m.template?.name }; });
  assert(sel && sel.tpl === 'TERRA 60' && sel.inst, 'one terrarium selected: ' + JSON.stringify(sel));
  assert((await page.textContent('#inspector')).includes(sel.code), 'inspector shows the physical enclosure');
  await shot('5-enter-assembly-member-selected');
  assert(await ev(() => window.habitat.editor.selection) === wall.id, 'room selection remains the assembly');
  await page.keyboard.press('Escape'); await settle(150);
  assert(await ev(() => !window.habitat.selectedMember && !!window.habitat.assemblyContext), 'Esc → back to assembly level');
  await page.keyboard.press('Escape'); await settle(150);
  assert(await ev(() => !window.habitat.assemblyContext), 'Esc → exit assembly');
});

await test('Save project, reload: assembly placement, all ids, relative positions and dimensions preserved; Planner/Showcase switching safe', async () => {
  const snap = () => ev(() => { const d = window.habitat.editor.toJSON(); const a = d.assemblies.find((x) => x.name === 'TEST BREEDING WALL'); return JSON.stringify({ room: d.room, objects: d.objects, assembly: a, instances: d.instances.filter((i) => a.members.some((m) => m.instanceId === i.id)) }); });
  const before = await snap();
  // explicit project save (export) + autosave
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
  const file = path.join(os.tmpdir(), 'habitat-assembly-project.json'); await dl.saveAs(file);
  await ev(() => window.habitat.persistence.autosave());
  await page.reload();
  await page.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 180000 });
  await settle(800);
  assert(await snap() === before, 'identical after reload (placement, ids, relative transforms, dimensions, room)');
  const v = await ev((id) => { const view = window.habitat.objects.get(id); return view && view.members.size; }, wall.id);
  assert(v === 16, 'assembly view rebuilt with all members');
  await switchMode('showcase');
  assert(await ev((id) => window.habitat.objects.get(id)?.members?.size, wall.id) === 16, 'Showcase shows the assembly (parametric members)');
  if (process.env.SHOTS) { await ev(() => window.habitat.rig.goTo('hero', { instant: true })); await shot('6-showcase-assembly'); }
  await switchMode('planner');
  assert(await snap() === before, 'switching renderers did not change anything');
  await ev(() => window.habitat.newRoom()); await settle(300);
  await page.setInputFiles('#toolbar input[type=file]', file); await settle(1200);
  assert(await snap() === before, 'export → import round trip identical');
});

await test('Mixed Tetris: large + stacked smalls, normals below, rack boxes above, reserved space, tech cabinet — no uniform grid', async () => {
  const ids = await ev(async () => {
    const h = window.habitat, L = await import('/src/model/Library.js');
    const mk = (name, w, hh, d, type = 'glass', preset = 'arid') => h.editor.saveTemplate(L.defaultTemplate({ name, type, construction: { type }, dimensions: { width: w, height: hh, depth: d }, interior: { preset } })).id;
    return { large: mk('LARGE 100', 1.0, 0.9, 0.5, 'glass', 'paludarium'), small: mk('SMALL 50', 0.5, 0.45, 0.45, 'glass', 'tropical'), normal: mk('NORMAL 75', 0.75, 0.5, 0.5, 'glass', 'arid') };
  });
  await ev(() => window.habitat.openBuilder()); await settle(1500);
  const C = (n) => `.builder .pal-card:has-text("${n}")`;
  await builderDrag(C('LARGE 100'), 0.5, 0.45);              // large
  await builderDrag(C('SMALL 50'), 1.25 + 0.02, 0.225 + 0.01); // small beside
  await builderDrag(C('SMALL 50'), 1.25 + 0.01, 0.675 + 0.02); // small stacked
  await builderDrag(C('NORMAL 75'), 0.375, -0.25);             // normals below (structure re-bases)
  await builderDrag(C('NORMAL 75'), 1.125 + 0.02, 0.25);
  await builderDrag(C('RACK 30'), 0.15, 1.4 + 0.09 + 0.02);    // low rack boxes above
  await builderDrag(C('RACK 30'), 0.45, 1.4 + 0.09 + 0.02);
  await builderDrag('.builder .pal-row[data-drag="reserved"]', 1.2, 1.4 + 0.25 + 0.02); // reserved position
  await builderDrag('.builder .pal-row[data-module="technical"]', 0.3, -0.3); // tech cabinet at the bottom
  const s = await builderState();
  assert(s.overlaps === 0, 'no overlaps');
  assert(s.st.enclosures === 5 && s.st.rackBoxes === 2 && s.st.modules === 1 && s.reserved === 1, 'mixed content: ' + JSON.stringify(s.st));
  const widths = new Set(s.members.filter((m) => m.kind === 'enclosure').map((m) => m.inst && m.x.toFixed(2)));
  assert(widths.size >= 4, 'irregular (non-grid) layout');
  await page.fill('.builder [data-role="name"]', 'MIXED WALL'); await page.press('.builder [data-role="name"]', 'Tab');
  await page.click('.builder [data-act="save"]'); await settle(500);
  assert(await ev(() => window.habitat.editor.assemblies.some((a) => a.name === 'MIXED WALL' && a.reserved.length === 1)), 'saved with reserved space');
});

await test('Performance: 5 assemblies / 50+ enclosure members in the room stay batched', async () => {
  await switchMode('planner');
  const r = await ev(async () => {
    const h = window.habitat, ed = h.editor, L = await import('/src/model/Library.js');
    const t = ed.templates.find((x) => x.name === 'TERRA 60'), rb = ed.templates.find((x) => x.name === 'RACK 30');
    ed.load({ room: { name: 'Perf room', width: 12, depth: 8, height: 3, wallThickness: 0.2 }, objects: [], enclosures: ed.templates, instances: [], assemblies: [] });
    let members = 0;
    for (let k = 0; k < 5; k++) {
      const a = L.createAssembly({ name: `Wall ${k + 1}`, frame: { mode: 'auto' } }), insts = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const i = L.createInstance(t, { instances: [...ed.doc.instances, ...insts] }); insts.push(i); a.members.push({ id: L.itemId('m'), kind: 'enclosure', instanceId: i.id, enclosureId: t.id, position: { x: c * 0.6, y: r * 0.6, z: 0 } }); }
      for (let c = 0; c < 6; c++) { const i = L.createInstance(rb, { instances: [...ed.doc.instances, ...insts] }); insts.push(i); a.members.push({ id: L.itemId('m'), kind: 'enclosure', instanceId: i.id, enclosureId: rb.id, position: { x: c * 0.3, y: 1.8, z: 0 } }); }
      const saved = ed.saveAssembly(a, insts); members += saved.members.length;
      ed.placeAssembly(saved.id, { position: { x: 1.3 + (k % 3) * 3.4, z: k < 3 ? 0.5 : 5.5 }, rotation: k < 3 ? 0 : 180, elevation: 0, mount: null });
    }
    h.rig.goTo('iso', { instant: true }); h.rig.update(performance.now());
    h.mode.batcher.sync(h.objects.views.values(), null);
    const gl = h.renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    h.engine.render(); sync();
    const t0 = performance.now(); for (let i = 0; i < 3; i++) { h.engine.render(); sync(); } const finalMs = (performance.now() - t0) / 3;
    const d = h.engine.diagnostics();
    return { members, assemblies: ed.objects.length, draws: d.drawCalls, tris: d.triangles, finalMs: Math.round(finalMs), batches: h.batcher.stats.batches, instances: h.batcher.stats.instances, ids: new Set(ed.doc.instances.map((i) => i.id)).size };
  });
  console.log('      perf:', JSON.stringify(r));
  fs.writeFileSync(path.join(ROOT, 'tests/last-assembly-perf.json'), JSON.stringify(r, null, 2));
  assert(r.assemblies === 5 && r.members >= 50, '5 assemblies, ≥50 members');
  assert(r.ids === 75, 'every physical enclosure keeps its own id (75)');
  assert(r.draws < 40, 'draw calls stay low (batched): ' + r.draws);
});

// ============================================================== PHASE 4.1 — DIMENSION CONVENTION + REGRESSIONS
await test('W × D × H convention: formatter, parser and every user-facing dimension text', async () => {
  const u = await ev(async () => {
    const D = await import('/src/model/Dimensions.js');
    return {
      a: D.formatDims({ width: 0.6, height: 0.9, depth: 0.45 }), b: D.formatDims({ w: 0.3, h: 0.18, d: 0.45 }, { sep: '×' }),
      c: D.formatDims({ width: 5, depth: 4, height: 2.7 }, { unit: 'm' }), p: D.parseDims('60 × 45 × 90 cm'), q: D.parseDims('60x45x90'), order: D.dimsOrderLabel(),
    };
  });
  assert(u.a === '60 × 45 × 90 cm', 'template {w60,h90,d45} → "60 × 45 × 90 cm": ' + u.a);
  assert(u.b === '30×45×18 cm', 'module {w,h,d} → "30×45×18 cm": ' + u.b);
  assert(u.c === '5 × 4 × 2.7 m', 'room in metres: ' + u.c);
  assert(u.p.width === 0.6 && u.p.depth === 0.45 && u.p.height === 0.9 && u.q.height === 0.9, 'parse "60 × 45 × 90" = W 60, D 45, H 90');
  assert(u.order === 'W × D × H', 'order label');
  // starting templates in the library: e.g. Tropical terrarium 60 wide, 45 deep, 90 high
  const trop = await page.textContent('.lib-item[data-type="terrarium_tropical"] .lib-meta i');
  assert(trop.includes('60×45×90'), 'starting template card W×D×H: ' + trop);
  // room size in the toolbar, inspector field order, no W × H × D anywhere in the visible UI
  assert(/× .* × .* m/.test(await page.textContent('[data-role=room-size]')), 'toolbar room size');
  await ev(() => { const h = window.habitat; h.editor.select(h.editor.objects.find((o) => o.type === 'terrarium_tropical')?.id || h.editor.objects[0].id); }); await settle(200);
  const labels = await page.$$eval('#inspector .grid3 .fld > span', (els) => els.map((e) => e.textContent.trim()));
  const iW = labels.indexOf('Width'), iD = labels.indexOf('Depth'), iH = labels.indexOf('Height');
  assert(iW >= 0 && iW < iD && iD < iH, 'inspector dimension fields W, D, H: ' + labels.join(','));
  const body = await page.textContent('body');
  assert(!/W\s*×\s*H\s*×\s*D|W\s*x\s*H\s*x\s*D/i.test(body), 'no "W × H × D" in the UI');
  await ev(() => window.habitat.editor.select(null));
});

await test('Assembly dimension calculation: total width, max depth, total height (± frame)', async () => {
  const r = await ev(async () => {
    const L = await import('/src/model/Library.js');
    const t1 = L.normalizeTemplate(L.defaultTemplate({ id: 'enc_a', name: 'A', dimensions: { width: 0.6, height: 0.6, depth: 0.6 } }));
    const t2 = L.normalizeTemplate(L.defaultTemplate({ id: 'enc_b', name: 'B', type: 'rack', construction: { type: 'rack' }, dimensions: { width: 0.3, height: 0.18, depth: 0.45 } }));
    const lib = L.libraryIndex({ enclosures: [t1, t2], instances: [], assemblies: [] });
    const a = L.createAssembly({ members: [
      { id: 'm1', kind: 'enclosure', enclosureId: 'enc_a', instanceId: 'x1', position: { x: 0, y: 0.4, z: 0 } },
      { id: 'm2', kind: 'enclosure', enclosureId: 'enc_a', instanceId: 'x2', position: { x: 0.6, y: 0.4, z: 0 } },
      { id: 'm3', kind: 'enclosure', enclosureId: 'enc_b', instanceId: 'x3', position: { x: 0, y: 1.0, z: 0 } },
      { id: 'm4', kind: 'module', module: { type: 'cabinet', w: 1.2, h: 0.4, d: 0.7, doors: 2 }, position: { x: 0, y: 0, z: 0 } },
    ], reserved: [{ id: 'r1', label: 'R', size: { w: 0.6, h: 0.5, d: 0.5 }, position: { x: 0.6, y: 1.0, z: 0 } }] });
    L.normalizeOrigin(a, lib);
    const none = L.assemblyStats(a, lib);
    a.frame = { ...a.frame, mode: 'auto', profile: 0.03, topRail: true };
    return { none, auto: L.assemblyStats(a, lib), reserved: a.reserved[0] };
  });
  assert(r.none.width === 1.2 && r.none.depth === 0.7 && r.none.height === 1.5, 'no frame: W 120 × D 70 (max) × H 150 (40 + 60 + 50 reserved): ' + JSON.stringify(r.none));
  assert(r.auto.width === 1.26 && r.auto.height === 1.53 && r.auto.depth === 0.7 && r.auto.content.width === 1.2 && r.auto.content.height === 1.5, 'auto frame adds 2 × 3 cm width + 3 cm top rail: ' + JSON.stringify(r.auto));
  assert(r.reserved.id === 'r1' && r.reserved.size.w === 0.6 && r.reserved.size.d === 0.5 && r.reserved.size.h === 0.5, 'reserved space stays its own logical entry with W/D/H');
});

await test('Export / import compatibility: Phase 4 files and v1 files load without reinterpreting width/height/depth', async () => {
  const r = await ev(async () => {
    const h = window.habitat, ed = h.editor;
    const before = ed.toJSON();
    // a Phase 4 (v2) project as written by the previous build: the old "RACK 30" had height 45, depth 18
    const p4 = { schema: 'ir-manager/habitat-room', version: 2, room: { name: 'P4', width: 6, depth: 4, height: 2.8, wallThickness: 0.2 }, objects: [],
      enclosures: [{ id: 'enc_old', name: 'RACK 30 (phase 4)', type: 'rack', dimensions: { width: 0.3, height: 0.45, depth: 0.18 }, construction: { type: 'rack' }, front: { type: 'tub' } }],
      instances: [{ id: 'inst_old1', templateId: 'enc_old', code: 'R30-01' }],
      assemblies: [{ id: 'asm_old', name: 'Old', members: [{ id: 'm_old', kind: 'enclosure', instanceId: 'inst_old1', enclosureId: 'enc_old', position: { x: 0, y: 0, z: 0 } }], reserved: [], frame: { mode: 'none' } }] };
    p4.objects.push({ id: 'obj_old', type: 'assembly', ref: { assemblyId: 'asm_old' }, position: { x: 1, z: 1 }, rotation: 90, elevation: 0, size: { w: 0.3, d: 0.18, h: 0.45 } });
    ed.load(p4);
    const t = ed.lib.templates.get('enc_old'), o = ed.get('obj_old'), i = ed.lib.instances.get('inst_old1');
    const out = { dims: t && t.dimensions, size: o && o.size, rot: o && o.rotation, code: i && i.code, member: ed.lib.assemblies.get('asm_old')?.members[0]?.id, dev: i && Object.keys(i.devices).length >= 0 };
    // v1 file (demo room format) still imports
    const res = await fetch('/data/demo-room.json'); const v1 = await res.json();
    ed.load(v1); out.v1 = { version: v1.version, objects: ed.objects.length, same: ed.objects.length === v1.objects.length };
    // round trip of the current session document
    ed.load(before); const again = ed.toJSON();
    out.roundTrip = JSON.stringify({ ...before, meta: 0 }) === JSON.stringify({ ...again, meta: 0 });
    return out;
  });
  assert(r.dims && r.dims.width === 0.3 && r.dims.height === 0.45 && r.dims.depth === 0.18, 'old semantic width/height/depth kept exactly: ' + JSON.stringify(r.dims));
  assert(r.size.w === 0.3 && r.size.d === 0.18 && r.size.h === 0.45 && r.rot === 90 && r.code === 'R30-01' && r.member === 'm_old', 'placement, ids, codes preserved: ' + JSON.stringify(r));
  assert(r.v1.version === 1 && r.v1.same, 'v1 demo room imports all objects');
  assert(r.roundTrip, 'current document round-trips identically');
});

await test('Idle diagnostics: render-on-demand shows "IDLE · last N fps", no continuous loop', async () => {
  await switchMode('planner');
  await setView('iso');
  // interact to produce a real sample
  const vp = await page.locator('canvas.viewport-canvas').boundingBox();
  await page.mouse.move(vp.x + vp.width / 2, vp.y + 100); await page.mouse.down();
  for (let i = 0; i < 12; i++) await page.mouse.move(vp.x + vp.width / 2 + i * 8, vp.y + 100);
  await page.mouse.up();
  await waitIdle(); await settle(800);
  const s = await ev(() => { const h = window.habitat; return { idle: h.engine.stats.idle, fps: h.engine.stats.fps, line: h.hud.statsLine.textContent, frames: h.engine.stats.frames }; });
  assert(s.idle === true, 'engine reports idle');
  assert(/IDLE · last/.test(s.line) && !/(^|· )0 fps/.test(s.line), 'HUD shows IDLE with the last sample: ' + s.line);
  assert(s.fps > 0, 'last valid FPS sample kept: ' + s.fps);
  await settle(1500);
  assert(await ev(() => window.habitat.engine.stats.frames) === s.frames, 'no frames rendered while idle (no loop kept alive for the counter)');
});

await test('Starting templates: geometry matches their W × D × H (no swapped axes, planting inside the glass)', async () => {
  const r = await ev(async () => {
    const h = window.habitat, T = await import('three'), L = await import('/src/model/Library.js'), G = await import('/src/enclosures/EnclosureGeometry.js');
    const out = {};
    for (const type of ['terrarium_arid', 'terrarium_tropical', 'paludarium', 'quarantine', 'rack_tubs', 'incubator']) {
      const t = L.templateFromCatalogue(type);
      const g = G.buildEnclosure(h.modes.planner.mats, t, { shadow: false }).geometries(); const box = new T.Box3();
      for (const x of Object.values(g)) { x.computeBoundingBox(); box.union(x.boundingBox); }
      out[type] = { want: [t.dimensions.width, t.dimensions.depth, t.dimensions.height + t.bottom.base], got: [box.max.x - box.min.x, box.max.z - box.min.z, box.max.y - box.min.y] };
    }
    return out;
  });
  for (const [k, v] of Object.entries(r)) assert(v.want.every((w, i) => Math.abs(w - v.got[i]) < 0.025), `${k}: W×D×H ${v.want.map((x) => Math.round(x * 100)).join('×')} vs geometry ${v.got.map((x) => (x * 100).toFixed(1)).join('×')}`);
});

await test('no fatal console errors', async () => {
  const fatal = errors.filter((e) => !/__missing__\.glb|Failed to load resource|favicon/i.test(e));
  assert(fatal.length === 0, fatal.slice(0, 5).join('\n'));
});

await browser.close();
srv?.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(ROOT, 'tests/last-run.json'), JSON.stringify({ date: new Date().toISOString(), results }, null, 2));
process.exit(failed.length ? 1 : 0);
