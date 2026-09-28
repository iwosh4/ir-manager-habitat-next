// Build-time asset generator: paints the Concept B specimen imagery (tools/art/painters.js) in Chromium and writes WebP.
//   node tools/generate-assets.mjs            (needs a static server on :8095 serving the repo root, or BASE=...)
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium; try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import('/opt/node22/lib/node_modules/playwright/index.mjs')); }
const BASE = process.env.BASE || 'http://localhost:8095/ir-manager-design-lab/';
const b = await chromium.launch({ args: ['--disable-gpu'] }); const p = await b.newPage();
await p.goto(BASE + 'tools/art/gen.html'); await p.waitForFunction(() => document.title === 'ready');
const out = (rel, dataUrl) => { const f = path.join(ROOT, 'assets/img', rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(dataUrl.split(',')[1], 'base64')); return fs.statSync(f).size; };
const job = async (rel, fn, opts, w = 480, h = 480, q = 0.8, macro = false) => { const d = await p.evaluate(([fn, o, w, h, q, m]) => window.render(fn, o, w, h, q, m), [fn, opts, w, h, q, macro]); const s = out(rel, d); console.log(rel, (s / 1024).toFixed(0) + ' KB'); };
const SPECIES = {
  'dendrobates-tinctorius-azureus': (i) => ['paintFrog', { species: 'azureus', seed: 11 + i * 7, bg: i % 2 ? 'leaf' : 'moss' }],
  'dendrobates-leucomelas': (i) => ['paintFrog', { species: 'leucomelas', seed: 21 + i * 7, bg: i % 2 ? 'moss' : 'leaf' }],
  'correlophus-ciliatus': (i) => ['paintGecko', { morph: ['harlequin', 'dalmatian', 'flame', 'olive', 'harlequin', 'flame'][i], seed: 31 + i * 5, bg: i % 3 === 2 ? 'bark' : 'cork' }],
  'furcifer-pardalis': (i) => ['paintChameleon', { locale: i % 2 ? 'nosybe' : 'ambilobe', seed: 41 + i * 3 }],
  'morelia-spilota': (i) => ['paintSnake', { species: 'spilota', seed: 51 + i * 9, bg: i % 2 ? 'bark' : 'leaf' }],
  'python-regius': (i) => ['paintSnake', { species: 'regius', seed: 61 + i * 9, bg: i % 2 ? 'leaf' : 'bark' }],
  'atheris-squamigera': (i) => ['paintSnake', { species: 'squamigera', seed: 71 + i * 9, bg: 'moss' }],
  'pantherophis-obsoletus-lindheimeri': (i) => ['paintSnake', { species: i === 2 || i === 5 ? 'leucistic' : 'lindheimeri', seed: 81 + i * 9, bg: i % 2 ? 'bark' : 'leaf' }],
};
const only = process.argv[2];
for (const [slug, f] of Object.entries(SPECIES)) {
  if (only && !slug.includes(only)) continue;
  for (let i = 0; i < 6; i++) { const [fn, o] = f(i); await job(`species/${slug}-${i + 1}.webp`, fn, o, 480, 480, 0.8); }
  const [fn, o] = f(0); await job(`species/${slug}-macro.webp`, fn, o, 960, 400, 0.78, true);
}
if (!only || only === 'banner') {
  await job('art/banner.webp', 'banner', { seed: 1 }, 1800, 520, 0.8);
}
if (!only || only === 'misc') {
  await job('kpi/clutch-python.webp', 'paintClutch', { count: 7, seed: 3, size: 0.15 }, 640, 480);
  await job('kpi/clutch-gecko.webp', 'paintClutch', { count: 2, seed: 5, size: 0.2, gecko: true }, 640, 480);
  await job('kpi/clutch-chameleon.webp', 'paintClutch', { count: 22, seed: 9, size: 0.065, tint: '#efe6cf' }, 640, 480);
  await job('kpi/clutch-macro.webp', 'paintClutch', { count: 7, seed: 3, size: 0.15 }, 960, 400, 0.78, true);
  await job('feeders/dubia.webp', 'paintDubia', { seed: 2, count: 5 }, 480, 480);
  await job('feeders/cricket.webp', 'paintCricket', { seed: 3, count: 4 }, 480, 480);
  await job('feeders/dubia-macro.webp', 'paintDubia', { seed: 2, count: 5 }, 960, 400, 0.78, true);
  await job('feeders/jar-dendrocare.webp', 'paintJar', { label: 'DENDROCARE', color: '#d9822f', sub: 'vitamin · mineral', seed: 1 }, 480, 480);
  await job('feeders/jar-calcium.webp', 'paintJar', { label: 'CALCIUM D3', color: '#2f6fb3', cap: '#e8e4dc', sub: 'calcium · vit. D3', seed: 2 }, 480, 480);
  await job('feeders/jar-multivit.webp', 'paintJar', { label: 'MULTIVIT', color: '#6b4fa3', sub: 'multivitamin', seed: 3 }, 480, 480);
  await job('feeders/jar-pollen.webp', 'paintJar', { label: 'BEE POLLEN', color: '#c9a227', cap: '#3a2a10', sub: 'natural carotenoids', seed: 4 }, 480, 480);
}
await b.close();
