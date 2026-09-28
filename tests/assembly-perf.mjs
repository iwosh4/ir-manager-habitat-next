// Assembly performance: a room with 5 assemblies (75 physical enclosures: 9 terrariums + 6 rack boxes
// each, auto frames), compared with the reference demo room.
//   node tests/assembly-perf.mjs          MODES=planner,showcase (default planner)
// Reports per renderer: build time, draw calls, triangles, geometries/textures, JS heap, GPU-synced
// stationary + interactive frame, and a measured continuous orbit (real rAF loop, mouse drag).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }
const MODES = (process.env.MODES || 'planner').split(',');
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].replace(/\/{2,}/g, '/')); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  const t = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(res);
}).listen(0);
const base = `http://localhost:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] });

async function measure(page, label) {
  const r = await page.evaluate(() => {
    const h = window.habitat, gl = h.renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    h.rig.goTo('iso', { instant: true }); h.rig.update(performance.now());
    h.mode.batcher.sync(h.objects.views.values(), null);
    h.engine.render(); sync();
    const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
    const fin = []; for (let i = 0; i < 3; i++) { const t = performance.now(); h.engine.render(); sync(); fin.push(performance.now() - t); }
    const d = h.engine.diagnostics();
    const it = []; for (let i = 0; i < 3; i++) { const t = performance.now(); h.engine.renderInteractive(); sync(); it.push(performance.now() - t); }
    const mem = h.renderer.info.memory;
    return { drawCalls: d.drawCalls, triangles: d.triangles, finalMs: +med(fin).toFixed(1), interactiveMs: +med(it).toFixed(1), geometries: mem.geometries, textures: mem.textures,
      batches: h.batcher.stats.batches, batchInstances: h.batcher.stats.instances, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
  });
  const vp = await page.locator('canvas.viewport-canvas').boundingBox();
  await page.evaluate(() => { const s = window.__b = { d: [], run: true, last: performance.now() }; const tick = () => { if (!s.run) return; const n = performance.now(); s.d.push(n - s.last); s.last = n; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.mouse.move(vp.x + vp.width / 2 - 150, vp.y + 80); await page.mouse.down();
  for (let i = 0; i < 40; i++) await page.mouse.move(vp.x + vp.width / 2 - 150 + i * 6, vp.y + 80 + Math.sin(i / 5) * 8);
  await page.mouse.up();
  r.orbit = await page.evaluate(() => { const s = window.__b; s.run = false; const d = s.d.slice(2).sort((a, b) => a - b); return { medianMs: +d[Math.floor(d.length / 2)].toFixed(1), p95Ms: +d[Math.floor(d.length * 0.95)].toFixed(1), fps: +(1000 / d[Math.floor(d.length / 2)]).toFixed(1), scale: window.habitat.engine.renderScale }; });
  return { label, ...r };
}

const out = { environment: 'Chromium + SwiftShader (CPU rasteriser), 1280×720', modes: {} };
for (const mode of MODES) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.setDefaultTimeout(900000);
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('p')) { localStorage.clear(); sessionStorage.setItem('p', 1); } } catch {} });
  await page.goto(base + `?mode=${mode}&quality=auto`);
  await page.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 900000 });
  await page.evaluate(() => window.habitat.objects.whenLoaded());
  const demo = await measure(page, 'demo room (28 objects)');
  const build = await page.evaluate(async () => {
    const h = window.habitat, ed = h.editor, L = await import('/src/model/Library.js');
    const t0 = performance.now();
    const t = ed.saveTemplate(L.defaultTemplate({ name: 'TERRA 60', type: 'glass', construction: { type: 'glass' }, dimensions: { width: 0.6, height: 0.6, depth: 0.6 }, interior: { preset: 'tropical' } }));
    const rb = ed.saveTemplate(L.defaultTemplate({ name: 'RACK 30', type: 'rack', construction: { type: 'rack' }, dimensions: { width: 0.3, depth: 0.45, height: 0.18 } }));
    ed.load({ room: { name: 'Assembly perf room', width: 12, depth: 8, height: 3, wallThickness: 0.2 }, objects: [], enclosures: ed.templates, instances: [], assemblies: [] });
    for (let k = 0; k < 5; k++) {
      const a = L.createAssembly({ name: `Wall ${k + 1}`, frame: { mode: 'auto' } }), insts = [];
      const add = (tt, x, y) => { const i = L.createInstance(tt, { instances: [...ed.doc.instances, ...insts] }); insts.push(i); a.members.push({ id: L.itemId('m'), kind: 'enclosure', instanceId: i.id, enclosureId: tt.id, position: { x, y, z: 0 } }); };
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) add(t, c * 0.6, r * 0.6);
      for (let c = 0; c < 6; c++) add(rb, c * 0.3, 1.8);
      const sv = ed.saveAssembly(a, insts);
      ed.placeAssembly(sv.id, { position: { x: 1.3 + (k % 3) * 3.4, z: k < 3 ? 0.5 : 7.3 }, rotation: k < 3 ? 0 : 180, elevation: 0, mount: null });
    }
    await h.objects.whenLoaded();
    h.mode.batcher.sync(h.objects.views.values(), null);
    return { buildMs: Math.round(performance.now() - t0), assemblies: ed.objects.length, members: ed.doc.assemblies.reduce((n, a) => n + a.members.length, 0), instanceIds: new Set(ed.doc.instances.map((i) => i.id)).size };
  });
  const walls = await measure(page, '5 assemblies / 75 enclosures');
  out.modes[mode] = { demo, walls: { ...build, ...walls } };
  await page.close();
}
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(ROOT, 'tests/last-assembly-perf.json'), JSON.stringify(out, null, 2));
await browser.close(); srv.close();
