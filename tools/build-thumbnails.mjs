// Pre-renders the library thumbnails from the real GLB assets into assets/thumbnails/<type>.png.
//   node tools/build-thumbnails.mjs      (needs Playwright; uses the app's own Thumbnails renderer)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium;
try { ({ chromium } = await import('playwright')); } catch { ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs')); }
const srv = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json' }[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
}).listen(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.setDefaultTimeout(600000);
await page.goto(`http://localhost:${srv.address().port}/index.html?thumbs=0`);
await page.waitForFunction(() => window.habitat, null, { timeout: 600000 });
const shots = await page.evaluate(async () => {
  const { TYPES } = await import('./src/objects/catalog.js');
  const { Thumbnails } = await import('./src/ui/Thumbnails.js');
  const t = new Thumbnails(window.habitat.assets, [352, 264]);
  const out = {};
  for (const [id, def] of Object.entries(TYPES)) out[id] = await t._render(def.model);
  return out;
});
const dir = path.join(ROOT, 'assets/thumbnails');
fs.mkdirSync(dir, { recursive: true });
for (const [id, url] of Object.entries(shots)) if (url) fs.writeFileSync(path.join(dir, `${id}.png`), Buffer.from(url.split(',')[1], 'base64'));
console.log(`wrote ${Object.keys(shots).length} thumbnails to assets/thumbnails/`);
await browser.close(); srv.close();
