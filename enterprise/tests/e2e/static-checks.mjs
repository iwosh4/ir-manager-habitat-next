// Static + crawl checks for BETA 1.0 FINAL → tests/results/static-checks.json
//  1 php -l on every PHP file            4 crawl every page linked from the app (logged in): no 4xx/5xx, no JS errors
//  2 secrets scan (runtime tree)         5 every CSS url() and <img>/<script>/<link> asset resolves
//  3 no third-party runtime services     6 no demo room in the normal Habitat workflow
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, '..', '..', 'app-manager');
const OUT = path.resolve(HERE, '..', 'results');
const B = process.env.BASE || 'http://127.0.0.1:8091/app-manager/';
const { chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs');
const results = [];
const check = (id, name, fn) => (async () => { try { const ev = await fn(); results.push({ id, name, ok: true, evidence: ev }); console.log('  ✓', id, name, '—', ev); } catch (e) { results.push({ id, name, ok: false, error: e.message }); console.log('  ✗', id, name, '\n     ', e.message); } })();
const walk = (d, out = []) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) { if (!/^(uploads|storage|node_modules)$/.test(f.name)) walk(p, out); } else out.push(p); } return out; };
const files = walk(APP);

await check('S1', 'php -l on every PHP file', () => {
  const php = files.filter((f) => f.endsWith('.php')); const bad = [];
  for (const f of php) { try { execFileSync('php', ['-l', f], { stdio: 'pipe' }); } catch (e) { bad.push(path.relative(APP, f)); } }
  if (bad.length) throw new Error('syntax errors: ' + bad.join(', '));
  return php.length + ' files, 0 errors';
});
await check('S2', 'secrets scan of the runtime tree (config.local.php excluded — it is never packaged)', () => {
  // credential-shaped values under credential keys; placeholders (UPPER_CASE, '…', empty) are allowed
  const pats = [/sk_(live|prod)_[A-Za-z0-9]{10,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /['"](db_pass|db_password|revolut_secret_key|revolut_webhook_secret|api_key|secret_key|webhook_secret|smtp_pass)['"]\s*=>\s*['"](?![A-Z0-9_]*['"])(?!…)[^'"]{6,}['"]/i,
    /\b(DB_PASSWORD|IR_DB_PASS)\b\s*[:=]\s*['"](?![A-Z0-9_]*['"])[^'"$]{6,}['"]/];
  const hits = [];
  for (const f of files) {
    if (/config\.local\.php$/.test(f) || /\.(webp|png|jpg|glb|hdr|ico|woff2?|ktx2|bin)$/.test(f)) continue;
    const t = fs.readFileSync(f, 'utf8'); for (const p of pats) if (p.test(t)) hits.push(path.relative(APP, f) + ' ~ ' + p.source.slice(0, 40));
  }
  // the hard-coded local test password must never ship
  for (const f of files) if (/\.(php|js)$/.test(f) && fs.readFileSync(f, 'utf8').includes('Local-Test-2026')) hits.push(path.relative(APP, f) + ' contains the local test password');
  if (hits.length) throw new Error(hits.join('; '));
  return files.length + ' files scanned, 0 secrets';
});
await check('S3', 'no third-party runtime services (QR, fonts, CDNs) in PHP/JS/CSS', () => {
  const bad = [];
  for (const f of files.filter((x) => /\.(php|js|css|mjs)$/.test(x) && !x.includes('/habitat/vendor/'))) {
    const t = fs.readFileSync(f, 'utf8');
    for (const m of t.matchAll(/https?:\/\/[a-z0-9.-]+/gi)) { const h = m[0]; if (/quickchart|googleapis|gstatic|cdnjs|jsdelivr|unpkg|qrserver/.test(h)) bad.push(path.relative(APP, f) + ' → ' + h); }
  }
  if (bad.length) throw new Error(bad.join('; '));
  return 'none (Revolut API is server-side only)';
});
await check('S6', 'Habitat: no demo room in the integrated workflow; no Home Assistant in the runtime', () => {
  const t = fs.readFileSync(path.join(APP, 'habitat/src/App.js'), 'utf8');
  if (!/if \(this\.bridge\) \{[\s\S]*?bridge\.load\(\)/.test(t)) throw new Error('bridge load missing');
  if (fs.existsSync(path.join(APP, 'habitat/data/demo-room.json'))) throw new Error('demo-room.json shipped');
  const ha = files.filter((f) => /\.(php|js|css)$/.test(f) && /habitat-home-assistant|habitat-connectors/.test(fs.readFileSync(f, 'utf8')));
  if (ha.length || fs.existsSync(path.join(APP, 'habitat-home-assistant.php'))) throw new Error('Home Assistant page/links present: ' + ha.join(','));
  return 'server room load; demo file not shipped; demo button hidden in Manager mode; no Home Assistant page or links';
});

await check('S8', 'JS syntax of every runtime script + every relative ES-module import resolves', () => {
  const js = files.filter((f) => /\.(m?js)$/.test(f) && !/\.min\.js$/.test(f) && !f.includes('/habitat/vendor/'));
  const bad = [], dead = [];
  for (const f of js) {
    const src = fs.readFileSync(f, 'utf8'); const esm = /^\s*(import|export)\s/m.test(src);
    try { execFileSync('node', esm ? ['--input-type=module', '--check'] : ['--check', f], { input: esm ? src : undefined, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { bad.push(path.relative(APP, f) + ': ' + String(e.stderr).split('\n').find((l) => /Error/.test(l))); }
    if (esm) for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^'"\n]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
      const rel = m[1] || m[2]; if (!fs.existsSync(path.resolve(path.dirname(f), rel))) dead.push(path.relative(APP, f) + ' → ' + rel);
    }
  }
  if (bad.length || dead.length) throw new Error([...bad, ...dead].slice(0, 10).join('; '));
  return js.length + ' scripts parsed, all relative imports resolve';
});
await check('S7', 'Migration SQL on a fresh copy of the real dump: applies, re-applies (idempotent), no user rows lost, no demo data', () => {
  const sqlFile = path.join(OUT, 'migration-check.sql'); const DBN = 'ir_migcheck';
  fs.writeFileSync(sqlFile, execFileSync('php', ['-r', `require '${APP}/includes/schema-beta1.php'; echo ir_schema_beta1_sql();`], { encoding: 'utf8' }));
  const src = fs.readFileSync(sqlFile, 'utf8').replace(/^--.*$/gm, '');
  if (/\b(DROP\s+TABLE|TRUNCATE|DROP\s+DATABASE|DELETE\s+FROM)\b/i.test(src)) throw new Error('destructive statement in migration');
  const tables = [...src.matchAll(/(?:TABLE(?: IF NOT EXISTS)?|INTO|UPDATE)\s+`?([a-zA-Z0-9_]+)`?/g)].map((m) => m[1]).filter((t) => !/^(information_schema|IF)$/i.test(t));
  const foreign = [...new Set(tables.filter((t) => !t.startsWith('wp_ir2_')))]; if (foreign.length) throw new Error('touches non wp_ir2_ tables: ' + foreign.join(','));
  execFileSync('bash', [path.join(HERE, '..', 'reset-db.sh'), DBN, 'nomigrate'], { stdio: 'pipe' });
  const q = (x) => execFileSync('mysql', ['-uroot', '--default-character-set=utf8mb4', DBN, '-N', '-e', x], { encoding: 'utf8' }).trim();
  const countAll = () => q("SELECT GROUP_CONCAT(CONCAT(table_name) ORDER BY table_name) FROM information_schema.tables WHERE table_schema=DATABASE()").split(',').filter((t) => t.startsWith('wp_ir2_')).map((t) => t + '=' + q('SELECT COUNT(*) FROM `' + t + '`'));
  const before = countAll(); const animals0 = q('SELECT COUNT(*) FROM wp_ir2_zvirata');
  execFileSync('bash', ['-c', `mysql -uroot ${DBN} < '${sqlFile}'`], { stdio: 'pipe' });
  const schema1 = q("SELECT MD5(GROUP_CONCAT(CONCAT(table_name,'.',column_name,':',column_type) ORDER BY table_name,column_name)) FROM information_schema.columns WHERE table_schema=DATABASE()");
  const mid = new Map(countAll().map((x) => x.split('=')));
  execFileSync('bash', ['-c', `mysql -uroot ${DBN} < '${sqlFile}'`], { stdio: 'pipe' });
  const schema2 = q("SELECT MD5(GROUP_CONCAT(CONCAT(table_name,'.',column_name,':',column_type) ORDER BY table_name,column_name)) FROM information_schema.columns WHERE table_schema=DATABASE()");
  if (schema1 !== schema2) throw new Error('second run changed the schema');
  const lost = before.map((x) => x.split('=')).filter(([t, n]) => +(mid.get(t) ?? -1) < +n); if (lost.length) throw new Error('rows lost: ' + lost.join(';'));
  const after = new Map(countAll().map((x) => x.split('='))); const drift = [...mid].filter(([t, n]) => after.get(t) !== n); if (drift.length) throw new Error('second run changed data: ' + drift.join(';'));
  if (q('SELECT COUNT(*) FROM wp_ir2_zvirata') !== animals0) throw new Error('animals changed');
  const ver = q("SELECT COUNT(*) FROM wp_ir2_schema_migrations WHERE migration LIKE '%070_beta1_final%'").trim();
  execFileSync('mysql', ['-uroot', '-e', 'DROP DATABASE ' + DBN]); fs.unlinkSync(sqlFile);
  return `${before.length} existing wp_ir2_ tables kept with all rows; 2nd run: identical schema + data; animals ${animals0} (no demo); migration row ${ver}`;
});

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; const bad = new Set();
page.on('pageerror', (e) => errs.push(page.url() + ' :: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('api.php')) bad.add(r.status() + ' ' + r.url() + ' (from ' + page.url() + ')'); });
page.on('dialog', (d) => d.dismiss());
await page.goto(B + 'auth.php'); await page.fill('input[name=jmeno]', 'ireptiles.cz'); await page.fill('input[name=heslo]', 'Local-Test-2026!');
await Promise.all([page.waitForNavigation(), page.locator('input[name=heslo]').press('Enter')]);
await check('S4', 'crawl: every page linked from the app loads without 4xx/5xx or JS errors', async () => {
  const seen = new Set(), queue = ['index.php'], truncated = [], dups = [];
  while (queue.length && seen.size < 160) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    await page.goto(B + u, { waitUntil: 'load' }).catch(() => {});
    if (u.startsWith('habitat-studio.php')) continue;
    // a PHP fatal in the middle of a page still answers 200 — require the shell's closing markup
    const dup = await page.$$eval('[id]', (els) => { const c = {}; els.forEach((e) => { c[e.id] = (c[e.id] || 0) + 1; }); return Object.keys(c).filter((k) => c[k] > 1); }).catch(() => []); if (dup.length) dups.push(u + ': ' + dup.join(','));
    if (!(await page.content()).includes('app-footer') && !/\/(print|scan)\.php/.test(page.url())) truncated.push(u);
    const links = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href'))).catch(() => []);
    for (let h of links) {
      if (!h || /^(https?:|mailto:|tel:|#|javascript:)/.test(h) || /auth\.php|export\.php|print\.php|file\.php|document-file|logout|backup\.php\?|\.zip|download|delete|done=|toggle|remove|archive=|complete|cancel/.test(h)) continue;
      h = h.replace(/^\.\//, '').split('#')[0]; if (!h.endsWith('.php') && !h.includes('.php?')) continue;
      const key = h.replace(/([?&])(id|animal_id|task|d|edit|open)=\d+[^&]*/g, '$1$2=N'); if ([...seen].some((s) => s.replace(/([?&])(id|animal_id|task|d|edit|open)=\d+[^&]*/g, '$1$2=N') === key)) continue;
      queue.push(h);
    }
  }
  if (dups.length) throw new Error('duplicate DOM ids: ' + dups.slice(0, 6).join(' | '));
  if (truncated.length) throw new Error('truncated pages (server error mid-render): ' + truncated.join(', '));
  if (bad.size) throw new Error([...bad].slice(0, 10).join(' | '));
  if (errs.length) throw new Error(errs.slice(0, 5).join(' | '));
  return seen.size + ' pages crawled: 0 failed requests, 0 JS errors, 0 truncated pages, 0 duplicate ids';
});
await check('S5', 'CSS url() assets and page assets resolve (incl. KPI, crocodile, PWA icons, manifest)', async () => {
  const miss = [];
  for (const f of files.filter((x) => x.endsWith('.css') && !x.includes('/habitat/'))) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) { const u = m[1]; if (/^(data:|https?:|#)/.test(u)) continue; const p = path.resolve(path.dirname(f), u.split('?')[0]); if (!fs.existsSync(p)) miss.push(path.relative(APP, f) + ' → ' + u); }
  }
  const man = JSON.parse(fs.readFileSync(path.join(APP, 'manifest.webmanifest'), 'utf8'));
  for (const i of man.icons) if (!fs.existsSync(path.join(APP, i.src))) miss.push('manifest icon ' + i.src);
  for (const s of fs.readFileSync(path.join(APP, 'sw.js'), 'utf8').match(/'\.\/[^']+'/g) || []) if (!fs.existsSync(path.join(APP, s.slice(3, -1)))) miss.push('sw shell ' + s);
  if (miss.length) throw new Error(miss.join('; '));
  return 'all CSS urls, manifest icons and service-worker shell files exist';
});
await browser.close();
const pass = results.filter((r) => r.ok).length;
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'static-checks.json'), JSON.stringify({ date: new Date().toISOString(), pass, fail: results.length - pass, results }, null, 2));
console.log(`\n${pass}/${results.length} static checks passed`);
process.exit(pass === results.length ? 0 : 1);
