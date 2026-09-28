// Builds the CLEAN production upload package: only what the running application needs.
//   node tools/package-production.mjs [out.zip]      (default dist/HABITAT_STUDIO_NEXT_PRODUCTION.zip)
// Extract on the host so that the entry point is /habitat-studio-next/index.html. No build step.
//
// Included: index.html, .htaccess, src/ (application modules), vendor/ (three.js r186), assets/ (GLB, textures,
// HDR, painted atlas, thumbnails — ALL kept: several are loaded by dynamically built paths), data/ (demo room),
// schema/ (document schema, used by integrators), ASSET_LICENSES.md (licences must ship with the assets).
// Excluded: tests, tools, docs & screenshots, node_modules, package*.json, markdown docs, logs, caches.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'HABITAT_STUDIO_NEXT_PRODUCTION.zip'));
const RUNTIME = ['index.html', '.htaccess', 'src', 'vendor', 'assets', 'data', 'schema', 'ASSET_LICENSES.md'];
const JUNK = /(^|\/)(\.DS_Store|Thumbs\.db|desktop\.ini|\.git.*|.*\.(bak|old|orig|swp|tmp|log)|.*~)$/i;
const prefix = 'habitat-studio-next';

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.rmSync(out, { force: true });
const stage = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR || '/tmp'), 'prod-'));
const dest = path.join(stage, prefix);
fs.mkdirSync(dest);
let files = 0, bytes = 0, skipped = [];
for (const p of RUNTIME) {
  fs.cpSync(path.join(ROOT, p), path.join(dest, p), {
    recursive: true,
    filter: (src) => { const rel = path.relative(ROOT, src).split(path.sep).join('/'); if (JUNK.test(rel)) { skipped.push(rel); return false; } return true; },
  });
}
fs.writeFileSync(path.join(dest, 'DEPLOY.txt'), `Habitat Studio Next — production build
Upload the folder "habitat-studio-next" to the web root so the entry point is /habitat-studio-next/index.html.
Static files only: no build step, no server-side code. The bundled .htaccess sets MIME types
(.js/.mjs/.json/.glb/.webp/.hdr) for this folder only and does not affect the parent application.
Built ${new Date().toISOString()}.
`);
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { files++; bytes += fs.statSync(f).size; } } };
walk(dest);
// every runtime reference must resolve inside the package (static check; the smoke test checks dynamic loads)
const missing = [];
for (const m of fs.readFileSync(path.join(ROOT, 'src/objects/catalog.js'), 'utf8').matchAll(/'(assets\/[^']+)'/g)) if (!fs.existsSync(path.join(dest, m[1]))) missing.push(m[1]);
if (missing.length) { console.error('MISSING runtime files:', missing); process.exit(1); }
execFileSync('zip', ['-rq9', out, prefix], { cwd: stage });
fs.rmSync(stage, { recursive: true, force: true });
console.log(`${out}  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB · ${files} files · ${(bytes / 1048576).toFixed(1)} MB unpacked${skipped.length ? ` · skipped ${skipped.length} junk files` : ''}`);
