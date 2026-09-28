// Scalability check: a generated facility with hundreds of enclosures (same RoomDocument format).
//   node tests/stress.mjs [enclosures=300]      MODES=planner,showcase (default planner)
// Reports per renderer: document build time, draw calls, triangles, GPU-synced stationary and
// interactive frame time, and measured orbit frame rate. Prints JSON.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }
const N = +(process.argv[2] || 300);
const MODES = (process.env.MODES || 'planner').split(',');

const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].replace(/\/{2,}/g, '/')); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  const t = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${srv.address().port}/`;

/** Facility: rows of 6-tank racks back to back, plus singles along the walls — ≈N enclosures. */
function facility(n) {
  const objects = [];
  const racks = Math.ceil((n * 0.8) / 6), singles = Math.max(0, n - racks * 6);
  const perRow = 12, rows = Math.ceil(racks / perRow);
  const W = perRow * 1.3 + 3, D = rows * 2.4 + 3;
  let id = 0;
  for (let i = 0; i < racks; i++) {
    const r = Math.floor(i / perRow), c = i % perRow, back = r % 2;
    objects.push({ id: `rk${id++}`, type: 'rack_glass', name: `Rack ${i + 1}`, position: { x: 1.5 + c * 1.3 + 0.6, z: 1.5 + Math.floor(r / 2) * 2.4 * 2 + (back ? 1.15 : 0.6) }, elevation: 0, rotation: back ? 0 : 180, size: { w: 1.2, d: 0.5, h: 1.9 }, mount: null, props: { occupied: true, lighting: true } });
  }
  const types = [['terrarium_arid', { w: 1, d: 0.5, h: 0.5 }], ['terrarium_tropical', { w: 0.6, d: 0.45, h: 0.9 }], ['paludarium', { w: 1.2, d: 0.5, h: 1.4 }]];
  for (let i = 0; i < singles; i++) {
    const [type, size] = types[i % 3];
    objects.push({ id: `sg${id++}`, type, name: `${type} ${i}`, position: { x: 0.8 + (i % Math.floor(W - 1)) * 1.0, z: D - 0.3 - Math.floor(i / Math.floor(W - 1)) * 0.02 }, elevation: 0, rotation: 180, size, mount: null, props: { occupied: true, lighting: true } });
  }
  return { schema: 'ir-manager/habitat-room', version: 1, room: { id: 'stress', name: `Stress ${n}`, width: +W.toFixed(2), depth: +(D + 0.6).toFixed(2), height: 3, wallThickness: 0.2, finishes: { floor: 'concrete_polished', walls: 'warm_grey', accentWall: 'north' } }, objects };
}

const doc = facility(N);
const enclosures = doc.objects.reduce((a, o) => a + (o.type === 'rack_glass' ? 6 : 1), 0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const out = { enclosures, objects: doc.objects.length, room: `${doc.room.width}×${doc.room.depth} m`, modes: {} };
for (const mode of MODES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(900000);
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(base + `?mode=${mode}&quality=auto`);
  await page.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 900000 });
  const r = await page.evaluate(async (doc) => {
    const h = window.habitat, gl = h.renderer.getContext(), px = new Uint8Array(4);
    const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t0 = performance.now();
    h.editor.load(doc, { reason: 'stress' });
    await h.objects.whenLoaded();
    h.mode.batcher.sync(h.objects.views.values(), null);
    const buildMs = performance.now() - t0;
    h.rig.goTo('iso', { instant: true }); h.rig.update(performance.now());
    h.engine.render(); sync();
    const fin = []; for (let i = 0; i < 3; i++) { const a = performance.now(); h.engine.render(); sync(); fin.push(performance.now() - a); }
    const d = h.engine.diagnostics();
    const it = []; for (let i = 0; i < 3; i++) { const a = performance.now(); h.engine.renderInteractive(); sync(); it.push(performance.now() - a); }
    const med = (a) => a.sort((x, y) => x - y)[1];
    return { buildMs: Math.round(buildMs), finalMs: +med(fin).toFixed(1), interactiveMs: +med(it).toFixed(1), drawCalls: d.drawCalls, triangles: d.triangles, views: h.objects.views.size, batches: h.batcher.stats.batches };
  }, doc);
  // measured orbit (real rAF loop, continuous drag)
  const vp = await page.locator('canvas.viewport-canvas').boundingBox();
  await page.evaluate(() => { const s = window.__b = { d: [], run: true, last: performance.now() }; const tick = () => { if (!s.run) return; const n = performance.now(); s.d.push(n - s.last); s.last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.mouse.move(vp.x + vp.width / 2 - 150, vp.y + 60); await page.mouse.down();
  for (let i = 0; i < 40; i++) await page.mouse.move(vp.x + vp.width / 2 - 150 + i * 6, vp.y + 60);
  await page.mouse.up();
  r.orbit = await page.evaluate(() => { const s = window.__b; s.run = false; const d = s.d.slice(2).sort((a, b) => a - b); return { medianMs: +d[Math.floor(d.length / 2)].toFixed(1), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(1), fps: +(1000 / d[Math.floor(d.length / 2)]).toFixed(1) }; });
  out.modes[mode] = r;
  await page.close();
}
console.log(JSON.stringify(out, null, 2));
await browser.close(); srv.close();
