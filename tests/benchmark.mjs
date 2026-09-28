// Performance benchmark: static final-frame cost + continuous mouse orbit / pan / zoom / drag.
//   node tests/benchmark.mjs [url] [quality]      (default: own server, quality=balanced)
//   MODE=planner|showcase (default showcase) selects the renderer.
// Prints JSON; used to produce the before/after tables in PERFORMANCE.md.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }

const [urlArg, quality = 'balanced'] = process.argv.slice(2);
let srv = null, base = urlArg;
if (!base) {
  srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0].replace(/\/{2,}/g, '/')); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    const t = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  base = `http://localhost:${srv.address().port}/`;
}
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.addInitScript((q) => { try { localStorage.clear(); localStorage.setItem('irm.habitat-studio.prefs.v1', JSON.stringify({ quality: q, library: true, inspector: true })); } catch {} }, quality);
page.setDefaultTimeout(300000);
const MODE = process.env.MODE || 'showcase';
await page.goto(base + `?mode=${MODE}&quality=${quality}`);
await page.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 300000 });
await page.evaluate(() => window.habitat.objects.whenLoaded());
await page.waitForTimeout(3000);

// ---- static final frame (forced, synchronous: render + gl.finish)
const stat = await page.evaluate(async () => {
  const h = window.habitat, gl = h.renderer.getContext();
  const out = [];
  for (let i = 0; i < 3; i++) {
    h.engine.dirty = true; h.engine.shadowsDirty = true;
    const t0 = performance.now();
    if (h.engine.renderFinal) h.engine.renderFinal(); else h.engine.render();
    gl.finish();
    out.push(performance.now() - t0);
  }
  const info = h.renderer.info;
  return { finalFrameMs: Math.min(...out), drawCalls: info.render.calls, triangles: info.render.triangles, programs: info.programs?.length, geometries: info.memory.geometries, textures: info.memory.textures };
});

// ---- interaction: continuous left-drag orbit for a fixed wall-clock period
async function measure(label, fn) {
  await page.evaluate(() => { const s = window.__bench = { deltas: [], frames0: window.habitat.engine.stats.frames, run: true, last: performance.now(), draws: [] };
    const tick = () => { if (!s.run) return; const n = performance.now(); s.deltas.push(n - s.last); s.last = n; s.draws.push(window.habitat.renderer.info.render.calls); requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const t0 = Date.now();
  await fn();
  const secs = (Date.now() - t0) / 1000;
  const r = await page.evaluate(() => { const s = window.__bench; s.run = false; const d = s.deltas.slice(2).sort((a, b) => a - b);
    return { series: s.deltas.slice(2).map((x) => Math.round(x)), frames: window.habitat.engine.stats.frames - s.frames0, medianMs: d[Math.floor(d.length / 2)], p95Ms: d[Math.floor(d.length * 0.95)], maxMs: d[d.length - 1], drawCallsInteractive: Math.round(s.draws.slice(2).reduce((a, b) => a + b, 0) / Math.max(1, s.draws.length - 2)) }; });
  return { label, seconds: +secs.toFixed(1), fps: +(r.frames / secs).toFixed(2), ...r };
}
const vp = await page.locator('canvas.viewport-canvas').boundingBox();
const cx = vp.x + vp.width / 2, cy = vp.y + 40;
const orbit = await measure('orbit', async () => {
  await page.mouse.move(cx - 150, cy); await page.mouse.down();
  for (let i = 0; i < 60; i++) await page.mouse.move(cx - 150 + i * 5, cy + Math.sin(i / 6) * 10);
  await page.mouse.up();
});
await page.waitForTimeout(1500);
const zoom = await measure('zoom', async () => { await page.mouse.move(cx, vp.y + vp.height / 2); for (let i = 0; i < 20; i++) await page.mouse.wheel(0, i < 10 ? -120 : 120); });
await page.waitForTimeout(1500);
const fs2 = await measure('pan', async () => {
  await page.mouse.move(cx, cy + 200); await page.mouse.down({ button: 'right' });
  for (let i = 0; i < 40; i++) await page.mouse.move(cx + i * 4, cy + 200 + i * 2);
  await page.mouse.up({ button: 'right' });
});
await page.waitForTimeout(2000);
const settled = await page.evaluate(() => ({ drawCalls: window.habitat.renderer.info.render.calls, mode: window.habitat.engine.mode || 'final', scale: window.habitat.engine.renderScale ?? 1 }));
console.log(JSON.stringify({ url: base, mode: MODE, quality, viewport: `${W}x${H}`, static: stat, orbit, zoom, pan: fs2, settled }, null, 2));
await browser.close(); srv?.close();
