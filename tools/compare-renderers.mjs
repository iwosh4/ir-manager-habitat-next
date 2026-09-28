// SHOWCASE vs PLANNER comparison from IDENTICAL cameras.
//   node tools/compare-renderers.mjs [outDir]        (default docs/comparison; starts its own server)
// Env: W, H (viewport, default 1280×720), URL (use a running server), VIEWS=hero,iso,…
// For every camera the app's own comparison (src/diagnostics/RendererComparison.js) renders the frame
// with both renderers on the shared WebGL context, GPU-synchronised, and returns images + metrics.
// Writes <view>_showcase.jpg, <view>_planner.jpg, <view>_compare.jpg (side by side) and report.json.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs/comparison'));
fs.mkdirSync(OUT, { recursive: true });
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }
let canvasLib = null;
try { canvasLib = await import('@napi-rs/canvas'); } catch { /* side-by-side composites are optional */ }

let srv = null, base = process.env.URL;
if (!base) {
  srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0].replace(/\/{2,}/g, '/')); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
    const t = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': t }); fs.createReadStream(f).pipe(res);
  }).listen(0);
  base = `http://localhost:${srv.address().port}/`;
}

// camera definitions: presets, or close-ups computed from an object's logical box (front-facing)
const CAMERAS = {
  hero: { preset: 'hero' }, iso: { preset: 'iso' }, top: { preset: 'top' }, front: { preset: 'front' }, interior: { preset: 'interior' },
  arid: { object: 'terr_a1', hc: 0.5, dist: 1.0, side: 0.22, lift: 0.3, fov: 42 },
  tropical: { object: 'terr_b1', hc: 0.5, dist: 1.15, side: 0.18, lift: 0.18, fov: 44 },
  paludarium: { object: 'palu_1', hc: 0.78, dist: 1.45, side: 0.28, lift: 0.32, fov: 42 },
  rack: { object: 'rack_1', hc: 0.5, dist: 2.35, side: 0.35, lift: 0.25, fov: 44 },
};
const VIEWS = (process.env.VIEWS || Object.keys(CAMERAS).join(',')).split(',');

const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.setDefaultTimeout(600000);
await page.addInitScript(() => { try { if (!sessionStorage.getItem('cmp')) { localStorage.clear(); sessionStorage.setItem('cmp', '1'); } } catch {} });
await page.goto(base + '?mode=planner&quality=' + (process.env.QUALITY || 'auto'));
await page.waitForFunction(() => window.habitat && window.habitat.engine?.stats.frames > 0, null, { timeout: 600000 });
// clean viewport: panels hidden so the canvas is the full window
await page.evaluate(() => { const h = window.habitat; h.setPanel('library', false); h.setPanel('inspector', false); h.setDimensions(false); h.editor.select(null); });
await page.waitForTimeout(800);

const report = { date: new Date().toISOString(), viewport: `${W}x${H}`, views: {} };
for (const name of VIEWS) {
  const cam = CAMERAS[name]; if (!cam) continue;
  process.stdout.write(`  ${name.padEnd(11)} `);
  const r = await page.evaluate(async (cam) => {
    const T = await import('three');
    const h = window.habitat;
    if (cam.preset) h.rig.goTo(cam.preset, { instant: true });
    else {
      const o = h.editor.get(cam.object), room = h.editor.room, a = (o.rotation * Math.PI) / 180;
      const front = new T.Vector3(Math.sin(a), 0, Math.cos(a)), side = new T.Vector3(Math.cos(a), 0, -Math.sin(a));
      const c = new T.Vector3(o.position.x - room.width / 2, o.elevation + o.size.h * cam.hc, o.position.z - room.depth / 2);
      const pos = c.clone().addScaledVector(front, cam.dist).addScaledVector(side, cam.side).add(new T.Vector3(0, cam.lift, 0));
      h.rig.animateTo(pos, c, cam.fov, 0);
    }
    h.rig.update(performance.now());
    const { compareRenderers } = await import('/src/diagnostics/RendererComparison.js');
    return compareRenderers(h, { samples: 3 });
  }, cam);
  for (const m of ['showcase', 'planner']) {
    fs.writeFileSync(path.join(OUT, `${name}_${m}.jpg`), Buffer.from(r.modes[m].image.split(',')[1], 'base64'));
    delete r.modes[m].image;
  }
  if (canvasLib) await composite(name, r);
  report.views[name] = r;
  const s = r.modes.showcase, p = r.modes.planner;
  console.log(`showcase ${s.finalMs.toFixed(0)} ms / ${s.drawCalls} draws / ${(s.triangles / 1000).toFixed(0)}k tris   planner ${p.finalMs.toFixed(0)} ms / ${p.drawCalls} draws / ${(p.triangles / 1000).toFixed(0)}k tris   (${r.ratio.final}× final, ${r.ratio.interactive}× interactive)`);
}
report.gpu = Object.values(report.views)[0]?.gpu;
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`report → ${path.relative(ROOT, OUT)}/report.json`);
await browser.close(); srv?.close();

async function composite(name, r) {
  const { createCanvas, loadImage } = canvasLib;
  const a = await loadImage(fs.readFileSync(path.join(OUT, `${name}_showcase.jpg`)));
  const b = await loadImage(fs.readFileSync(path.join(OUT, `${name}_planner.jpg`)));
  const w = a.width, h = a.height, gap = 8, bar = 34;
  const c = createCanvas(w * 2 + gap, h + bar); const x = c.getContext('2d');
  x.fillStyle = '#0d0e10'; x.fillRect(0, 0, c.width, c.height);
  x.drawImage(a, 0, bar); x.drawImage(b, w + gap, bar);
  const s = r.modes.showcase, p = r.modes.planner;
  x.font = 'bold 15px sans-serif'; x.fillStyle = '#e8913a';
  x.fillText('SHOWCASE', 12, 22); x.fillText('PLANNER', w + gap + 12, 22);
  x.font = '13px monospace'; x.fillStyle = '#b9b6af';
  x.fillText(`${s.finalMs.toFixed(0)} ms · ${s.drawCalls} draws · ${(s.triangles / 1000).toFixed(0)}k tris`, 110, 22);
  x.fillText(`${p.finalMs.toFixed(0)} ms · ${p.drawCalls} draws · ${(p.triangles / 1000).toFixed(0)}k tris`, w + gap + 100, 22);
  fs.writeFileSync(path.join(OUT, `${name}_compare.jpg`), c.toBuffer('image/jpeg', 88));
}
