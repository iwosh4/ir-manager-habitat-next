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
  assert(exported.schema === 'ir-manager/habitat-room' && exported.version === 1, 'schema/version');
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
