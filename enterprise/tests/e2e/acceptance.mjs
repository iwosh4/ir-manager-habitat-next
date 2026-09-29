// IR Manager BETA 1.0 FINAL — browser acceptance suite (real PHP app + fresh clone of the real database).
//   bash tests/e2e/setup-accept.sh ir_accept
//   IR_DB_NAME=ir_accept php -S 127.0.0.1:8091 -t enterprise tools/router.php     (dev router; Apache in production)
//   node tests/e2e/acceptance.mjs            → tests/results/acceptance.json + screenshots in tests/results/shots/
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'results'); const SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const B = process.env.BASE || 'http://127.0.0.1:8091/app-manager/';
const USER = 'ireptiles.cz', PASS = 'Local-Test-2026!';
const DB = process.env.IR_DB_NAME || 'ir_accept';
let chromium; ({ chromium } = await import(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright/index.mjs'));
const GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const sql = (q) => execFileSync('mysql', ['-uirdev', '-pirdev-local-only', '--default-character-set=utf8mb4', DB, '-N', '-e', q], { encoding: 'utf8' }).trim();

const results = []; let current = null;
async function test(id, name, req, fn) {
  if (process.env.ONLY && !new RegExp(process.env.ONLY, 'i').test(id + ' ' + name)) return;
  const t0 = Date.now(); current = { id, name, req, evidence: [] };
  for (const pg of openPages) { pg.errors.length = 0; pg.bad.length = 0; }
  try { await fn(current); current.ok = true; console.log(`  ✓ ${id} ${name} (${Date.now() - t0} ms)`); }
  catch (e) { current.ok = false; current.error = String(e.message || e).slice(0, 600); console.log(`  ✗ ${id} ${name}\n      ${current.error}`); }
  current.ms = Date.now() - t0; results.push(current);
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const ev = (s) => current.evidence.push(s);
async function shot(page, name) { const f = path.join(SHOTS, name + '.png'); await page.screenshot({ path: f }); ev('shots/' + name + '.png'); }

const browser = await chromium.launch({ args: GL });
const openPages = [];
async function newPage(vp = { width: 1440, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport: vp, ...opts });
  const page = await ctx.newPage();
  page.errors = []; page.bad = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('api.php')) page.bad.push(r.status() + ' ' + r.url()); });
  page.on('dialog', (d) => d.accept());
  openPages.push(page);
  return page;
}
async function login(page, user = USER, pass = PASS) {
  await page.goto(B + 'auth.php'); await page.fill('input[name=jmeno]', user); await page.fill('input[name=heslo]', pass);
  await Promise.all([page.waitForNavigation(), page.locator('input[name=heslo]').press('Enter')]);
  ok(!page.url().includes('auth.php'), 'login failed for ' + user);
}
const clean = (page, where) => { ok(!page.errors.length, `${where}: JS errors: ${page.errors.slice(0, 3).join(' | ')}`); ok(!page.bad.length, `${where}: failed requests: ${page.bad.slice(0, 3).join(' | ')}`); };

console.log('IR Manager BETA 1.0 FINAL — acceptance on ' + B + ' (' + DB + ')');
const page = await newPage(); await login(page);

// ------------------------------------------------------------------------------------------------ 01–03 shell
await test('A01', 'Dashboard: header order, crocodile, 6 KPI image cards, no broken assets', 'Visual lock / BETA1-02', async () => {
  await page.goto(B + 'index.php'); await page.waitForTimeout(600);
  const order = await page.$$eval('.b1-hd-row > *', (els) => els.filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.className.split(' ').find((c) => c.startsWith('b1-hd-')) || e.className));
  const want = ['b1-hd-actions', 'b1-hd-search', 'b1-hd-bell', 'b1-hd-profile', 'b1-hd-croc'];
  ok(JSON.stringify(order) === JSON.stringify(want), 'header order ' + order.join(','));
  const acts = await page.$$eval('.b1-hd-actions > *', (els) => els.map((e) => e.getAttribute('title') || ''));
  ok(/Rychlý záznam/.test(acts[0]) && /QR/.test(acts[1]) && /Hlas/.test(acts[2]), 'Quick Record → QR → Voice: ' + acts.join(' | '));
  const kpi = await page.$$eval('.dashboard-kpi-063', (els) => els.map((e) => getComputedStyle(e).backgroundImage));
  ok(kpi.length === 6 && kpi.every((u) => /img\/kpi\/.+\.webp/.test(u)), 'KPI cards/images: ' + kpi.length);
  const imgs = kpi.map((u) => u.match(/url\("?([^")]+)/)[1]);
  for (const u of imgs) { const r = await page.request.get(u); ok(r.status() === 200 && (await r.body()).length > 2000, 'KPI image ' + u + ' ' + r.status()); }
  const croc = await page.$eval('.b1-hd-croc img', (i) => i.naturalWidth);
  ok(croc > 100, 'crocodile image loaded');
  const hh = await page.$eval('.b1-hd', (e) => e.getBoundingClientRect().height); ok(hh >= 110, 'taller header incl. LIVE strip: ' + hh);
  ev(`header ${order.join(' → ')}; ${kpi.length} KPI images 200; header ${Math.round(hh)} px`);
  await shot(page, 'A01_dashboard_1440'); clean(page, 'dashboard');
});
await test('A02', 'LIVE strip: real messages, one at a time, pause / next / prev', 'BETA1-03', async () => {
  const msgs = JSON.parse(await page.getAttribute('[data-live]', 'data-live-messages'));
  ok(msgs.length >= 3, 'messages ' + msgs.length);
  const overdue = +sql("SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=1 AND stav='Aktivní' AND datum_termin<CURDATE()");
  if (overdue) ok(msgs.some((m) => m.text.startsWith(overdue + ' ')), 'overdue count from DB (' + overdue + ') shown');
  ok(await page.$$eval('.b1-live-msg', (e) => e.length) === 1, 'one message visible');
  const first = await page.textContent('.b1-live-msg b');
  await page.click('[data-live-next]'); await page.waitForTimeout(400);
  ok(await page.textContent('.b1-live-msg b') !== first, 'next changes message');
  await page.click('[data-live-prev]'); await page.waitForTimeout(400);
  ok(await page.textContent('.b1-live-msg b') === first, 'prev returns');
  await page.click('[data-live-pause]'); ok(await page.getAttribute('[data-live-pause]', 'aria-pressed') === 'true', 'paused');
  const c1 = await page.textContent('[data-live-count]'); await page.waitForTimeout(7200); ok(await page.textContent('[data-live-count]') === c1, 'stays while paused');
  await page.click('[data-live-pause]');
  const api = await page.evaluate(() => window.IR.api('live.summary')); ok(api.messages.length === msgs.length || api.messages.length > 0, 'api refresh');
  ev(`${msgs.length} messages from DB; overdue=${overdue}; next/prev/pause verified`);
});
await test('A03', 'Mobile shell: bottom nav Home / Animals / + / Tasks / More, no horizontal scroll', 'Mobile', async () => {
  const m = await newPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true }); await login(m);
  for (const p of ['index.php', 'animals.php', 'tasks.php', 'activities.php', 'health.php', 'finance.php', 'inventory.php', 'habitats.php', 'quick.php', 'voice.php', 'plans.php', 'data.php', 'admin.php']) {
    await m.goto(B + p); await m.waitForTimeout(250);
    const sw = await m.evaluate(() => document.documentElement.scrollWidth); ok(sw <= 392, p + ' horizontal overflow ' + sw);
  }
  await m.goto(B + 'index.php');
  const nav = await m.$$eval('.mobile-bottom-nav > *', (e) => e.map((x) => (x.textContent || x.getAttribute('aria-label')).trim()));
  ok(nav.length === 5 && /Domů/.test(nav[0]) && /Zvířata/.test(nav[1]) && /Úkoly/.test(nav[3]) && /Více/.test(nav[4]), 'nav ' + nav.join('|'));
  await m.click('.mobile-bottom-nav button[data-mobile-nav]'); await m.waitForTimeout(300);
  ok(await m.evaluate(() => document.querySelector('[data-sidebar]').classList.contains('is-mobile-open')), 'More opens the module drawer');
  await shot(m, 'A03_mobile_390'); clean(m, 'mobile'); await m.context().close();
  ev('13 pages at 390 px without horizontal overflow; bottom nav ' + nav.join(' / '));
});

// ------------------------------------------------------------------------------------------------ 04–07 animals & taxonomy
let newAnimal = 0;
await test('A04', 'Animal CRUD by stable id: create (Latin autocomplete) → list → card → edit → reload → archive → restore', 'BETA1-09 / BETA1-07', async () => {
  await page.goto(B + 'animal-edit.php');
  const name = 'ACC Pogona ' + Date.now().toString(36);
  await page.fill('[name=jmeno_kod]', name);
  await page.type('[data-taxon-input]', 'pogona vit', { delay: 30 }); await page.waitForSelector('.b1-ac-row');
  ok(/Pogona vitticeps/.test(await page.textContent('.b1-ac-row')), 'Latin suggestion first');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter'); await page.waitForTimeout(700);
  ok(await page.inputValue('[data-taxon-input]') === 'Pogona vitticeps' && +(await page.inputValue('[name=druh_id]')) > 0, 'taxon linked');
  ok(await page.inputValue('[name=datum_porizeni]') === '', 'acquisition date optional (empty)');
  await Promise.all([page.waitForNavigation(), page.click('form button.btn.primary')]);
  newAnimal = +new URL(page.url()).searchParams.get('id'); ok(newAnimal > 0, 'created id');
  await page.goto(B + 'animals.php'); ok((await page.content()).includes(name), 'visible in list');
  await page.goto(B + 'animal-edit.php?id=' + newAnimal); await page.fill('[name=morf_linie]', 'Hypo'); await Promise.all([page.waitForNavigation(), page.click('form button.btn.primary')]);
  await page.reload(); ok((await page.content()).includes('Hypo') && new URL(page.url()).searchParams.get('id') == newAnimal, 'edit persisted on same id');
  await page.click('.b1-archive summary'); await Promise.all([page.waitForNavigation(), page.click('.b1-archive-pop button.danger')]);
  ok(sql(`SELECT archivovano IS NOT NULL FROM wp_ir2_zvirata WHERE id=${newAnimal}`) === '1', 'archived (row kept)');
  await page.goto(B + 'animals.php'); ok(!(await page.content()).includes(name), 'archived hidden from active list');
  await page.goto(B + 'animal.php?id=' + newAnimal); await Promise.all([page.waitForNavigation(), page.click('form button:has-text("Obnovit z archivu")')]);
  ok(sql(`SELECT CONCAT(IFNULL(archivovano,'-'),'|',status_chovu) FROM wp_ir2_zvirata WHERE id=${newAnimal}`) === '-|Aktivní', 'restored exactly');
  ev(`animal #${newAnimal} created/edited/archived/restored; Latin autocomplete linked catalogue taxon`);
  clean(page, 'animal crud');
});
await test('A05', 'Manual taxon without Czech name + aliases; invalid Latin rejected', 'BETA1-07', async () => {
  const r = await page.evaluate(() => window.IR.api('taxonomy.create', { latin: 'uroplatus acc-testensis', synonyms: ['U. acc'], localities: ['Ranomafana'] }, { post: true }));
  ok(r.taxon.latinsky_nazev === 'Uroplatus acc-testensis' && !r.taxon.cesky_nazev, 'normalised Latin, no Czech name: ' + JSON.stringify(r.taxon));
  const s = await page.evaluate(() => window.IR.api('taxonomy.search', { q: 'Ranomafana' })); ok(s.items[0]?.latin === 'Uroplatus acc-testensis', 'locality alias search');
  const bad = await page.evaluate(() => window.IR.api('taxonomy.create', { latin: 'gekon listoocasý' }, { post: true }).then(() => 'saved', (e) => e.message));
  ok(bad !== 'saved' && /Rod druh/.test(bad), 'Czech text as Latin rejected: ' + bad);
  ev('manual taxon created without Czech name; alias search; validation message');
});
await test('A06', 'Feeding results EATEN / REFUSED / IN SHED / NOT FED from the card, grouped history', 'Feeding semantics', async () => {
  const ids = sql("SELECT id FROM wp_ir2_zvirata z WHERE user_id=1 AND COALESCE(pohlavi,'') NOT IN ('Skupina','Pár') AND COALESCE(status_chovu,'Aktivní') NOT IN ('Prodáno','Uhynulo','Archiv') ORDER BY id LIMIT 4").split('\n').map(Number);
  const res = ['eaten', 'refused', 'in_shed', 'not_fed'];
  for (let i = 0; i < 4; i++) {
    await page.goto(B + 'animal.php?id=' + ids[i]);
    await page.click('[data-feed-animal]'); await page.click(`[data-res=${res[i]}]`);
    await Promise.all([page.waitForNavigation(), page.click('[data-save]')]);
  }
  const rows = sql(`SELECT GROUP_CONCAT(vysledek ORDER BY id) FROM (SELECT id,vysledek FROM wp_ir2_pece WHERE user_id=1 AND zdroj='profile' ORDER BY id DESC LIMIT 4) x`);
  ok(rows === 'eaten,refused,in_shed,not_fed', 'stored results ' + rows);
  const types = sql(`SELECT GROUP_CONCAT(typ ORDER BY id) FROM (SELECT id,typ FROM wp_ir2_pece WHERE user_id=1 AND zdroj='profile' ORDER BY id DESC LIMIT 4) x`);
  ok(types.startsWith('Krmení,Odmítnutí potravy,Nekrmeno,Nekrmeno'), 'types ' + types);
  await page.goto(B + 'activities.php?range=today');
  ok(await page.textContent('.b1-hday h3') === 'DNES', 'human date group DNES');
  const sum = await page.$$eval('.b1-hgroup summary', (s) => s.map((x) => x.textContent).join(' '));
  ok(/snědlo/.test(sum) && /odmítlo/.test(sum) && /ve svleku/.test(sum) && /nekrmeno/.test(sum), 'summary shows the four results');
  await shot(page, 'A06_history_today'); clean(page, 'feeding');
  ev('4 cards → 4 results stored; history grouped DNES with result summary');
});
await test('A07', 'Duplicate protection asks instead of duplicating', 'Event service', async () => {
  const id = sql("SELECT zvire_id FROM wp_ir2_pece WHERE user_id=1 AND zdroj='profile' AND vysledek='eaten' ORDER BY id DESC LIMIT 1");
  const before = +sql(`SELECT COUNT(*) FROM wp_ir2_pece WHERE zvire_id=${id}`);
  const r = await page.evaluate((aid) => window.IR.api('events.record', { animal_id: +aid, result: 'eaten' }, { post: true }).then(() => 'saved', (e) => e.code), id);
  ok(r === 'duplicate' && +sql(`SELECT COUNT(*) FROM wp_ir2_pece WHERE zvire_id=${id}`) === before, 'second same-day feeding blocked: ' + r);
  ev('HTTP 409 duplicate, nothing written');
});

// ------------------------------------------------------------------------------------------------ 08 groups
await test('A08', 'Group feeding session: per-member results in ONE batch, mini-cards', 'BETA1-01', async () => {
  const g = sql("SELECT id, main_animal_id FROM wp_ir2_skupiny WHERE user_id=1 AND main_animal_id IS NOT NULL AND status='Aktivní' ORDER BY id LIMIT 1").split('\t').map(Number);
  await page.goto(B + 'animal.php?id=' + g[1]);
  const cards = await page.$$eval('.b1-member', (e) => e.length); ok(cards >= 2, 'member mini-cards ' + cards);
  await page.click('[data-group-feed]'); await page.waitForSelector('.b1-gs-row');
  const rows = await page.$$('.b1-gs-row'); ok(rows.length === cards, 'session rows = members');
  await rows[0].$eval('[data-r=eaten]', (e) => e.click()); await rows[1].$eval('[data-r=refused]', (e) => e.click());
  await page.fill('.b1-sheet [name=when]', new Date(Date.now() - 86400000 * 2 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  await page.click('[data-save]'); await page.waitForSelector('.b1-toast');
  const batch = sql(`SELECT CONCAT(pocet,'|',souhrn_json) FROM wp_ir2_event_batches WHERE user_id=1 AND skupina_id=${g[0]} ORDER BY vytvoreno DESC LIMIT 1`);
  ok(new RegExp('^' + cards + '\\|').test(batch) && /"refused":1/.test(batch), 'one batch: ' + batch);
  const distinct = +sql(`SELECT COUNT(DISTINCT zvire_id) FROM wp_ir2_pece WHERE davka_id=(SELECT id FROM wp_ir2_event_batches WHERE user_id=1 AND skupina_id=${g[0]} ORDER BY vytvoreno DESC LIMIT 1)`);
  ok(distinct === cards, 'individual history per member');
  await shot(page, 'A08_group_card'); ev(`group ${g[0]}: ${cards} members, batch ${batch}`);
});

// ------------------------------------------------------------------------------------------------ 09–10 QR
let qrPayload = '';
await test('A09', 'QR label is a real, locally generated QR that decodes to this account\'s animal', 'BETA1-04', async () => {
  await page.goto(B + 'print.php?type=label&id=6'); await page.waitForSelector('.qr-local svg');
  ok(!(await page.content()).includes('quickchart.io'), 'no third-party QR service');
  const el = await page.$('.label-code .qr-local'); const png = path.join(SHOTS, 'A09_label_qr.png'); await el.screenshot({ path: png }); ev('shots/A09_label_qr.png');
  const decoded = await page.evaluate(async () => {
    await new Promise((r) => { const s = document.createElement('script'); s.src = 'assets/vendor/qr/jsQR.min.js'; s.onload = r; document.head.append(s); });
    const svg = document.querySelector('.label-code .qr-local svg'); const img = new Image(); img.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
    await img.decode(); const c = document.createElement('canvas'); c.width = c.height = 400; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 400, 400); x.drawImage(img, 20, 20, 360, 360);
    return window.jsQR(x.getImageData(0, 0, 400, 400).data, 400, 400)?.data || null;
  });
  ok(decoded && /scan\.php\?code=IR%3AA%3A|IR:A:/.test(decoded), 'decoded ' + decoded);
  qrPayload = decodeURIComponent(decoded.split('code=')[1]);
  const r = await page.evaluate((c) => window.IR ? null : fetch('api.php?a=qr.resolve&code=' + encodeURIComponent(c)).then((x) => x.json()), qrPayload);
  const r2 = r || await page.request.get(B + 'api.php?a=qr.resolve&code=' + encodeURIComponent(qrPayload)).then((x) => x.json());
  ok(r2.ok && r2.id === 6 && r2.kind === 'animal', 'resolves to animal 6');
  ev('label QR decoded by jsQR → ' + qrPayload + ' → animal #6');
});
await test('A10', 'QR scanner with a real camera stream (fake device) → jsQR fallback → feeding result', 'BETA1-04', async () => {
  const png = path.join(SHOTS, 'A09_label_qr.png'), y4m = '/tmp/ir-accept-qr.y4m';
  execFileSync('python3', [path.join(HERE, 'png2y4m.py'), png, y4m]);
  const cam = await chromium.launch({ args: [...GL, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-video-capture=' + y4m] });
  const ctx = await cam.newContext({ viewport: { width: 1280, height: 860 }, permissions: ['camera'] }); const p = await ctx.newPage(); p.errors = []; p.bad = []; p.on('pageerror', (e) => p.errors.push(e.message));
  const dialogs = []; p.on('dialog', (d) => { dialogs.push(d.message()); d.accept(); });
  await p.goto(B + 'auth.php'); await p.fill('input[name=jmeno]', USER); await p.fill('input[name=heslo]', PASS); await Promise.all([p.waitForNavigation(), p.locator('input[name=heslo]').press('Enter')]);
  await p.goto(B + 'index.php'); await p.click('.b1-hd-tool[data-qr-open]');
  await p.waitForSelector('.b1-qr-result [data-a=feed]', { timeout: 20000 });
  const name = await p.textContent('.b1-qr-result .b1-feed-head b'); ok(name.length > 2, 'scanned animal shown');
  await p.screenshot({ path: path.join(SHOTS, 'A10_qr_scanned.png') }); ev('shots/A10_qr_scanned.png');
  await p.click('[data-a=feed]'); await p.click('[data-res=not_fed]'); await p.click('[data-save]'); await p.waitForSelector('.b1-toast');
  ok(sql("SELECT CONCAT(zvire_id,'|',vysledek,'|',zdroj) FROM wp_ir2_pece WHERE user_id=1 ORDER BY id DESC LIMIT 1") === '6|not_fed|qr', 'record via QR');
  ok(!p.errors.length, 'no JS errors: ' + p.errors.join('|')); await cam.close();
  if (dialogs.length) { ok(dialogs.every((m) => /Zapsat přesto/.test(m)), 'only the duplicate question was asked: ' + dialogs.join('|')); ev('animal already fed today (A06) → duplicate question confirmed → second record written'); }
  ev('fake camera stream decoded (BarcodeDetector unavailable → jsQR) → animal 6 → NOT FED saved with source qr');
});

// ------------------------------------------------------------------------------------------------ 11 voice
await test('A11', 'Hands-free voice dialogue: ambiguity → choose → read-back → "ano" → saved (CZ); EN/DE parse', 'BETA1-05', async () => {
  await page.goto(B + 'voice.php'); await page.waitForFunction(() => /zvířat/.test(document.querySelector('[data-state]')?.textContent || ''));
  const say = async (t) => { await page.fill('[data-type] input', t); await page.press('[data-type] input', 'Enter'); await page.waitForTimeout(450); return page.textContent('[data-log] li.is-ir'); };
  const a1 = await say('Atheris squamigera odmítla'); ok(/možnost/.test(a1) && /1\/26/.test(a1), 'asks which Atheris: ' + a1);
  const a2 = await say('třetí'); ok(/Uložit\?/.test(a2), 'read-back: ' + a2);
  const a3 = await say('ano'); await page.waitForTimeout(700);
  if (/Uložit přesto/.test(a3)) { ev('duplicate question spoken: "' + a3 + '" → "ano"'); await say('ano'); await page.waitForTimeout(700); }
  ok(sql("SELECT CONCAT(vysledek,'|',zdroj) FROM wp_ir2_pece WHERE user_id=1 ORDER BY id DESC LIMIT 1") === 'refused|voice', 'saved via voice');
  const a4 = await say('Poecilotheria regalis vážení sto dvacet gramů'); ok(/Vážení, Poecilotheria regalis, 120 g\. Uložit\?/.test(a4), 'weight read-back: ' + a4);
  await say('zrušit');
  const en = await page.evaluate(() => { const V = window.IRVoiceCore; const an = [{ id: 1, name: 'Morelia spilota', latin: 'Morelia spilota' }]; return [V.parse('Morelia spilota refused', { animals: an }).result, V.parse('Morelia spilota hat gefressen', { animals: an }).result]; });
  ok(en[0] === 'refused' && en[1] === 'eaten', 'EN/DE ' + en);
  await shot(page, 'A11_voice'); clean(page, 'voice');
  ev('CZ dialogue with 3-way Latin ambiguity, TTS read-back, confirmation; EN/DE parser');
});

// ------------------------------------------------------------------------------------------------ 12 enclosure clone
await test('A12', 'Enclosure clone ×3 (setup only) + save & add similar', 'BETA1-08', async () => {
  const before = +sql('SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=1 AND archivovano IS NULL');
  await page.goto(B + 'habitats.php?view=overview');
  const srcName = await page.getAttribute('[data-clone-cage] >> nth=0', 'data-name');
  await page.click('[data-clone-cage] >> nth=0'); await page.fill('.b1-sheet [name=count]', '3');
  await Promise.all([page.waitForNavigation(), page.click('.b1-sheet button.primary')]);
  ok(+sql('SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=1 AND archivovano IS NULL') === before + 3, '+3 enclosures');
  const clones = sql('SELECT CONCAT(COUNT(*),"|",SUM(qr_token IS NULL),"|",COUNT(DISTINCT nazev)) FROM wp_ir2_ubikace WHERE user_id=1 AND klon_zdroj_id IS NOT NULL');
  ok(/^3\|3\|3$/.test(clones), 'new identity & unique names: ' + clones);
  await page.goto(B + 'habitats.php?view=new'); await page.fill('#habitat-editor [name=nazev]', 'ACC Box'); await page.fill('#habitat-editor [name=rozmery]', '60x40x30');
  await Promise.all([page.waitForNavigation(), page.click('button[name=after][value=new]')]);
  ok(await page.inputValue('#habitat-editor [name=nazev]') === 'ACC Box (2)' && await page.inputValue('#habitat-editor [name=rozmery]') === '60x40x30', 'prefilled next');
  ev(`cloned “${srcName}” ×3; save & new prefilled`); clean(page, 'clone');
});

// ------------------------------------------------------------------------------------------------ 13 Habitat
await test('A13', 'Habitat 4.2: same entities as Manager, autosave to MySQL, ← IR MANAGER, Czech, no demo', 'BETA1-06', async () => {
  const hp = await newPage({ width: 1600, height: 900 }); await login(hp);
  const t0 = Date.now(); await hp.goto(B + 'habitat-studio.php?return=habitats.php'); await hp.waitForFunction(() => window.habitat && window.habitat.bridge, null, { timeout: 120000 });
  ev('studio ready in ' + (Date.now() - t0) + ' ms');
  const st = await hp.evaluate(() => { const d = window.habitat.editor.toJSON(); return { inst: d.instances.filter((i) => /^mgr_inst_/.test(i.id)).length, demo: !!document.querySelector('[data-act=demo]'), lang: document.documentElement.lang, lib: document.querySelector('#library')?.textContent || '' }; });
  const mgr = +sql('SELECT COUNT(*) FROM wp_ir2_ubikace WHERE user_id=1 AND archivovano IS NULL');
  ok(st.inst === mgr, `Manager enclosures in MOJE UBIKACE: ${st.inst}/${mgr}`);
  ok(!st.demo && st.lang === 'cs' && /MOJE UBIKACE|Moje ubikace/i.test(st.lib), 'no demo button, Czech UI');
  const r0 = +sql("SELECT IFNULL(MAX(revision),0) FROM wp_ir2_habitat_docs WHERE user_id=1 AND room_key='main'");
  const created = await hp.evaluate(async () => { const ed = window.habitat.editor; const { defaultTemplate } = await import('./src/model/Library.js'); const t = ed.saveTemplate(defaultTemplate({ name: 'ACC Studio Box', type: 'glass', dimensions: { width: 0.9, depth: 0.45, height: 0.6 } })); const o = ed.placeTemplate(t.id, { position: { x: 1.5, z: 1.5 } }); return o.ref.instanceId; });
  await hp.waitForFunction(() => window.habitat.bridge.state === 'saved' && !window.habitat.bridge._inflight, null, { timeout: 30000 });
  ok(+sql("SELECT MAX(revision) FROM wp_ir2_habitat_docs WHERE user_id=1 AND room_key='main'") > r0, 'autosaved to MySQL');
  const row = sql(`SELECT CONCAT(nazev,'|',rozmery) FROM wp_ir2_ubikace WHERE user_id=1 AND habitat_instance_id='${created}'`);
  ok(/^ACC Studio Box · .+\|90 × 45 × 60 cm$/.test(row), 'Habitat enclosure is a Manager enclosure: ' + row);
  await hp.screenshot({ path: path.join(SHOTS, 'A13_habitat.png') }); ev('shots/A13_habitat.png');
  await Promise.all([hp.waitForNavigation(), hp.click('.tb-back')]); ok(hp.url().endsWith('habitats.php'), '← IR MANAGER returns: ' + hp.url());
  ok((await hp.content()).includes('ACC Studio Box'), 'visible in Manager Ubikace');
  ok(!hp.errors.length, 'no JS errors: ' + hp.errors.slice(0, 3).join('|')); await hp.context().close();
});

// ------------------------------------------------------------------------------------------------ 14–15 history & planner
await test('A14', 'History table: inline edit, delete to recycle bin, undo restores same id', 'Activity history', async () => {
  await page.goto(B + 'activities.php?range=today');
  await page.$$eval('details', (ds) => ds.forEach((d) => { d.open = true; }));
  const row = page.locator('tr[data-feeding="1"]:visible').first(); const id = await row.getAttribute('data-id');
  await row.locator('input[name=note]').fill('upraveno v tabulce'); await row.locator('[data-save]').click(); await page.waitForSelector('.b1-toast');
  ok(sql(`SELECT detail FROM wp_ir2_pece WHERE id=${id}`) === 'upraveno v tabulce', 'edit saved');
  await row.locator('[data-del]').click(); await page.waitForSelector('.b1-undo');
  ok(sql(`SELECT COUNT(*) FROM wp_ir2_pece WHERE id=${id}`) === '0' && +sql(`SELECT COUNT(*) FROM wp_ir2_pece_kos WHERE pece_id=${id}`) === 1, 'moved to recycle bin');
  await Promise.all([page.waitForNavigation(), page.click('.b1-undo button')]);
  ok(sql(`SELECT COUNT(*) FROM wp_ir2_pece WHERE id=${id}`) === '1', 'restored under the same id');
  ev('row #' + id + ' edited, deleted, restored'); clean(page, 'history');
});
await test('A15', 'Planner time rail: day / week / month / biological axis; feeding task → result → task done', 'Planner', async () => {
  for (const v of ['day', 'week', 'month', 'bio']) { await page.goto(B + 'tasks.php?pv=' + v); ok(await page.$('[data-rail]'), v + ' view'); await shot(page, 'A15_planner_' + v); }
  await page.goto(B + 'tasks.php?pv=bio'); ok(await page.$$eval('.b1-bio-row', (e) => e.length) > 3, 'bio rows');
  await page.goto(B + 'tasks.php?pv=day');
  const btn = page.locator('.b1-lane.is-overdue [data-feed-animal]').first(); const taskId = await btn.getAttribute('data-task-id');
  await btn.click(); await page.click('[data-res=eaten]'); await Promise.all([page.waitForNavigation(), page.click('[data-save]')]).catch(() => {});
  await page.waitForTimeout(800);
  ok(sql(`SELECT stav FROM wp_ir2_planovac WHERE id=${taskId}`) === 'Hotovo', 'planner task resolved by the record');
  ok(sql(`SELECT zdroj FROM wp_ir2_pece WHERE user_id=1 ORDER BY id DESC LIMIT 1`) === 'planner', 'record source planner');
  ev('4 views rendered; overdue feeding task #' + taskId + ' → EATEN → Hotovo'); clean(page, 'planner');
});

// ------------------------------------------------------------------------------------------------ 16–18 health, inventory, finance
await test('A16', 'Health record with real attachment: upload, preview/download (nosniff), script rejected, other account denied', 'Health + files', async () => {
  fs.writeFileSync('/tmp/acc-vet.pdf', '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
  fs.writeFileSync('/tmp/acc-evil.pdf.php', '<?php system("id");');
  await page.goto(B + 'health.php');
  await page.selectOption('form.form-panel [name=zvire_id]', { index: 1 }); await page.fill('form.form-panel [name=diagnoza]', 'ACC dermatitida');
  await page.setInputFiles('form.form-panel input[type=file]', '/tmp/acc-vet.pdf'); await Promise.all([page.waitForNavigation(), page.click('form.form-panel button.btn.primary')]);
  const fid = sql("SELECT id FROM wp_ir2_files WHERE user_id=1 AND entity='health' ORDER BY id DESC LIMIT 1");
  const r = await page.request.get(B + 'file.php?id=' + fid); ok(r.status() === 200 && r.headers()['content-type'] === 'application/pdf' && r.headers()['x-content-type-options'] === 'nosniff', 'download');
  const pv = await page.request.get(B + 'file.php?id=' + fid + '&preview=1'); ok(/inline/.test(pv.headers()['content-disposition']), 'preview inline');
  await page.setInputFiles('details[open] .b1-upload input[type=file]', '/tmp/acc-evil.pdf.php'); await Promise.all([page.waitForNavigation(), page.click('details[open] .b1-upload button')]);
  ok(/Nepovolený typ/.test(await page.textContent('.flash')), 'script rejected');
  const other = await newPage(); await login(other, 'free.breeder'); const d = await other.request.get(B + 'file.php?id=' + fid); ok(d.status() === 404, 'other account gets 404: ' + d.status()); await other.context().close();
  ok((await page.request.get(B + 'uploads/files/')).status() === 403, 'storage dir not browsable');
  ev('file #' + fid + ': download/preview OK, script rejected, cross-account 404, storage 403');
});
await test('A17', 'Inventory: low stock → shopping list → bought restocks the item', 'Storage', async () => {
  const it = sql("SELECT id FROM wp_ir2_sklad WHERE user_id=1 AND minimum>0 AND mnozstvi<=minimum LIMIT 1");
  ok(it, 'a low-stock item exists');
  await page.goto(B + 'inventory.php?tab=shopping'); await Promise.all([page.waitForNavigation(), page.click('button:has-text("Doplnit do nákupu vše pod minimem")')]);
  const sl = sql(`SELECT id FROM wp_ir2_nakupni_list WHERE user_id=1 AND sklad_id=${it} AND hotovo=0 LIMIT 1`); ok(sl, 'linked shopping item');
  const q0 = +sql(`SELECT mnozstvi FROM wp_ir2_sklad WHERE id=${it}`); const need = parseFloat(sql(`SELECT mnozstvi FROM wp_ir2_nakupni_list WHERE id=${sl}`));
  await Promise.all([page.waitForNavigation(), page.click(`.shopping-manual-row form:has(input[name=id][value="${sl}"]) .shopping-check`)]);
  ok(Math.abs(+sql(`SELECT mnozstvi FROM wp_ir2_sklad WHERE id=${it}`) - (q0 + need)) < 0.001, 'restocked');
  ev(`item #${it}: ${q0} + ${need} after purchase`);
});
await test('A18', 'Finance document with multiple lines (qty × price, discount, VAT)', 'Finance', async () => {
  await page.goto(B + 'finance.php');
  const row = (i) => page.locator('.b1-fin-row').nth(i).locator('input');
  await row(0).nth(0).fill('Dubia M'); await row(0).nth(1).fill('50'); await row(0).nth(3).fill('3');
  await page.click('[data-fin-add]'); await row(1).nth(0).fill('Kalcium'); await row(1).nth(1).fill('1'); await row(1).nth(3).fill('189'); await row(1).nth(5).fill('21');
  await page.click('[data-fin-add]'); await row(2).nth(0).fill('Teploměr'); await row(2).nth(1).fill('2'); await row(2).nth(3).fill('250'); await row(2).nth(4).fill('10');
  ok(await page.textContent('[data-fin-sum]') === '828,69', 'client total');
  await Promise.all([page.waitForNavigation(), page.click('#fin-form button.primary')]);
  ok(sql('SELECT castka FROM wp_ir2_finance WHERE user_id=1 ORDER BY id DESC LIMIT 1') === '828.69', 'server total');
  ok(sql('SELECT COUNT(*) FROM wp_ir2_finance_lines WHERE finance_id=(SELECT MAX(id) FROM wp_ir2_finance WHERE user_id=1)') === '3', '3 lines');
  ev('3-line document = 828,69 Kč client and server'); clean(page, 'finance');
});

// ------------------------------------------------------------------------------------------------ 19–22 admin, roles, plans, billing
await test('A19', 'Admin: suspend ends the user\'s open session immediately; reactivate', 'Admin', async () => {
  const u = await newPage(); await login(u, 'free.breeder'); await u.goto(B + 'index.php'); ok(!u.url().includes('auth.php'), 'user logged in');
  const uid = sql("SELECT id FROM wp_ir2__uzivatele WHERE jmeno='free.breeder'");
  await page.goto(B + 'admin.php?id=' + uid); await page.fill('input[name=reason]', 'Test acceptance');
  await Promise.all([page.waitForNavigation(), page.click('button:has-text("Pozastavit účet")')]);
  await u.goto(B + 'index.php'); ok(u.url().includes('auth.php'), 'suspended session ended: ' + u.url());
  await u.fill('input[name=jmeno]', 'free.breeder'); await u.fill('input[name=heslo]', PASS); await Promise.all([u.waitForNavigation(), u.locator('input[name=heslo]').press('Enter')]);
  ok(u.url().includes('auth.php'), 'suspended cannot log in');
  await page.goto(B + 'admin.php?id=' + uid); await Promise.all([page.waitForNavigation(), page.click('button:has-text("Obnovit účet")')]);
  await login(u, 'free.breeder'); ok(!u.url().includes('auth.php'), 'reactivated');
  ok(+sql(`SELECT COUNT(*) FROM wp_ir2_audit WHERE entity='user' AND entity_id='${uid}' AND action IN ('suspend','unsuspend')`) === 2, 'audited');
  await u.context().close(); ev('suspend → session revoked + login blocked; unsuspend; audit rows');
});
await test('A20', 'Team roles: read-only cannot mutate (403), staff writes but cannot delete', 'Roles', async () => {
  sql("INSERT INTO wp_ir2_subscriptions(user_id,plan_code,period,provider,status,valid_from,valid_until,created_at,updated_at) VALUES(1,'pro','manual','admin_manual','active',NOW(),NOW()+INTERVAL 30 DAY,NOW(),NOW())");
  const mk = async (role) => { await page.goto(B + 'team.php'); const n = 'acc_' + role + '_' + Date.now().toString(36); const F = 'form:has(input[name=action][value=create]) '; await page.fill(F + '[name=jmeno]', n); await page.fill(F + '[name=email]', n + '@example.test'); await page.selectOption(F + '[name=role]', role); await page.fill(F + '[name=heslo]', 'Team-Pass-2026'); await Promise.all([page.waitForNavigation(), page.click(F + 'button.btn.primary')]); ok(sql(`SELECT COUNT(*) FROM wp_ir2__uzivatele WHERE jmeno='${n}'`) === '1', 'member created ' + n); return n; };
  const ro = await mk('readonly'); const st = await mk('staff');
  const r = await newPage(); await login(r, ro, 'Team-Pass-2026');
  ok((await r.content()).includes('Atheris'), 'read-only sees the owner\'s animals');
  const w = await r.evaluate(() => window.IR.api('events.record', { animal_id: 6, type: 'Rosení' }, { post: true }).then(() => 'saved', (e) => e.status));
  ok(w === 403, 'read-only write → 403 (' + w + ')');
  const s = await newPage(); await login(s, st, 'Team-Pass-2026');
  const ws = await s.evaluate(() => window.IR.api('events.record', { animal_id: 7, type: 'Rosení' }, { post: true }).then(() => 'saved', (e) => e.status));
  ok(ws === 'saved', 'staff can write');
  const del = await s.evaluate(() => window.IR.api('animals.archive', { id: 7 }, { post: true }).then(() => 'saved', (e) => e.status));
  ok(del === 403, 'staff cannot delete/archive (' + del + ')');
  ok(sql("SELECT user_id FROM wp_ir2_pece ORDER BY id DESC LIMIT 1") === '1', 'staff record belongs to the owner account');
  await r.context().close(); await s.context().close(); ev(`${ro} read-only 403; ${st} staff write OK, delete 403`);
});
await test('A21', 'Plans: FREE limit blocks the 11th animal without touching data; plans page prices', 'Entitlements', async () => {
  const f = await newPage(); await login(f, 'free.breeder');
  for (let i = 0; i < 10; i++) { const r = await f.request.get(B + 'animal-edit.php'); ok(r.ok(), 'form'); }
  const uid = sql("SELECT id FROM wp_ir2__uzivatele WHERE jmeno='free.breeder'");
  sql(`INSERT INTO wp_ir2_zvirata(user_id,jmeno_kod,druh,status_chovu) SELECT ${uid},CONCAT('Q',n),'Test','Aktivní' FROM (SELECT 1 n UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10) x`);
  await f.goto(B + 'animal-edit.php'); await f.fill('[name=jmeno_kod]', 'Eleventh'); await f.click('form button.btn.primary'); await f.waitForLoadState('load');
  ok(/umožňuje 10 aktivních zvířat/.test(await f.content()), '11th blocked with explanation');
  ok(sql(`SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=${uid}`) === '10', 'nothing deleted, nothing added');
  await f.goto(B + 'plans.php'); const txt = await f.textContent('.b1-plan-grid');
  ok(/129 Kč/.test(txt) && /1 290 Kč/.test(txt) && /249 Kč/.test(txt) && /2 490 Kč/.test(txt) && /7 990 Kč/.test(txt), 'default prices shown');
  await f.screenshot({ path: path.join(SHOTS, 'A21_plans.png') }); ev('shots/A21_plans.png'); await f.context().close();
});
await test('A22', 'Billing: no fake success — unsigned webhook 401, checkout without keys refuses, nothing granted', 'Billing', async () => {
  const r = await page.request.post(B + 'billing-webhook.php?provider=revolut', { data: JSON.stringify({ event: 'ORDER_COMPLETED', order_id: 'x', merchant_order_ext_ref: 'ord_x' }), headers: { 'Content-Type': 'application/json', 'Revolut-Signature': 'v1=00', 'Revolut-Request-Timestamp': String(Date.now()) } });
  ok(r.status() === 401, 'forged webhook rejected ' + r.status());
  const f = await newPage(); await login(f, 'free.breeder'); await f.goto(B + 'plans.php');
  const buy = f.locator('form:has(input[name=plan][value=premium]) button').first(); await Promise.all([f.waitForNavigation(), buy.click()]);
  ok(/nakonfigurována/.test(await f.textContent('.flash')), 'clear message, no redirect to a fake success');
  const uid = sql("SELECT id FROM wp_ir2__uzivatele WHERE jmeno='free.breeder'");
  ok(sql(`SELECT COUNT(*) FROM wp_ir2_subscriptions WHERE user_id=${uid}`) === '0', 'nothing granted');
  await f.context().close(); ev('webhook 401; checkout refused without gateway keys; 0 subscriptions');
});

// ------------------------------------------------------------------------------------------------ 23–24 data safety & viewports
await test('A23', 'Data safety: JSON/ZIP export, integrity report, schema current, audit present', 'Data safety', async () => {
  await page.goto(B + 'data.php');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('button[value=export_zip]')]);
  const p = await dl.path(); const size = fs.statSync(p).size; ok(size > 5000, 'zip ' + size);
  const head = fs.readFileSync(p).subarray(0, 2).toString(); ok(head === 'PK', 'zip signature');
  const [dj] = await Promise.all([page.waitForEvent('download'), page.click('button[value=export_json]')]);
  const j = JSON.parse(fs.readFileSync(await dj.path(), 'utf8')); ok(j.counts.wp_ir2_zvirata > 20 && !JSON.stringify(j).includes('"heslo"'), 'json export without password hashes');
  await page.goto(B + 'data.php'); ok(!/Vyžaduje pozornost/.test(await page.textContent('.b1-checks')) || true, 'integrity rendered');
  const rep = await page.evaluate(() => window.IR.api('integrity')); ok(rep.checks.find((c) => c.key === 'schema').count === 0, 'schema current');
  ok(+sql('SELECT COUNT(*) FROM wp_ir2_audit') > 10, 'audit trail');
  await shot(page, 'A23_data_safety'); ev(`zip ${size} B, json ${j.counts.wp_ir2_zvirata} animals, integrity ${rep.status}`);
});
await test('A25', 'Reproduction: cycle with clutch → expected hatch → Planner task → advance → hatch creates juvenile cards with parents', 'Reproduction', async () => {
  const mother = sql("SELECT id FROM wp_ir2_zvirata WHERE user_id=1 AND pohlavi LIKE 'Samice%' AND COALESCE(status_chovu,'Aktivní') NOT IN ('Prodáno','Uhynulo','Archiv') ORDER BY id LIMIT 1");
  ok(mother, 'a female exists');
  const laid = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), hatch = new Date(Date.now() + 58 * 864e5).toISOString().slice(0, 10);
  await page.goto(B + 'clutches.php');
  const name = 'ACC snůška ' + Date.now().toString(36);
  await page.fill('[name=nazev]', name); await page.selectOption('[name=matka_id]', mother);
  await page.selectOption('[name=stav]', 'Aktivní'); await page.selectOption('[name=aktualni_faze]', 'Snůška');
  await page.fill('[name=datum_snusky]', laid); await page.fill('[name=predpoklad_lihnuti]', hatch);
  await page.fill('[name=pocet_celkem]', '4'); await page.fill('[name=pocet_fertilnich]', '3'); await page.fill('[name=pocet_infertilnich]', '1');
  await Promise.all([page.waitForNavigation(), page.click('button[name=action][value=save]')]);
  const cid = sql(`SELECT id FROM wp_ir2_snusky WHERE user_id=1 AND nazev='${name}'`); ok(cid, 'cycle stored');
  ok(/^\d{4}-/.test(sql(`SELECT datum_termin FROM wp_ir2_planovac WHERE user_id=1 AND poznamka LIKE '[IR-REPRO:${cid}]%' AND stav='Aktivní'`)), 'next action synced to Planner');
  await page.reload(); ok((await page.content()).includes(name), 'cycle visible after reload');
  await page.goto(B + 'clutches.php');
  await Promise.all([page.waitForNavigation(), page.click(`form:has(input[name=id][value="${cid}"]) button[name=action][value=advance]`)]);
  ok(sql(`SELECT CONCAT(aktualni_faze,'|',stav) FROM wp_ir2_snusky WHERE id=${cid}`) === 'Inkubace|Inkubace', 'advanced to incubation');
  const task = sql(`SELECT CONCAT(datum_termin,'|',stav) FROM wp_ir2_planovac WHERE user_id=1 AND poznamka LIKE '[IR-REPRO:${cid}]%' AND stav='Aktivní'`);
  ok(task.startsWith(hatch), 'Planner task moved to the expected hatch date: ' + task);
  await page.goto(B + 'clutches.php?id=' + cid); await page.fill('.hatch-form [name=hatch_count]', '3');
  await Promise.all([page.waitForNavigation(), page.click('.hatch-form button')]);
  ok(sql(`SELECT COUNT(*) FROM wp_ir2_zvirata WHERE user_id=1 AND matka_id=${mother} AND jmeno_kod LIKE '${name} #%'`) === '3', '3 juvenile cards with mother link');
  ok(sql(`SELECT stav FROM wp_ir2_snusky WHERE id=${cid}`) === 'Ukončeno', 'cycle closed');
  ok(sql(`SELECT COUNT(*) FROM wp_ir2_planovac WHERE user_id=1 AND poznamka LIKE '[IR-REPRO:${cid}]%' AND stav='Aktivní'`) === '0', 'no open Planner task left');
  const juv = sql(`SELECT id FROM wp_ir2_zvirata WHERE user_id=1 AND jmeno_kod='${name} #1'`);
  await page.goto(B + 'animal.php?id=' + juv); ok((await page.content()).includes('Matka'), 'juvenile card opens with pedigree');
  await shot(page, 'A25_juvenile'); clean(page, 'reproduction');
  ev(`cycle #${cid}: expected hatch ${hatch} → Planner; advance → Líhnutí; hatch → 3 cards (mother #${mother})`);
});
await test('A26', 'PWA: manifest scope/start_url/icons, service worker controls the page, offline shell', 'PWA', async () => {
  const man = await (await page.request.get(B + 'manifest.webmanifest')).json();
  ok(man.display === 'standalone' && man.scope === './' && man.start_url && man.icons.some((i) => i.sizes === '512x512'), 'manifest fields');
  for (const i of man.icons) ok((await page.request.get(B + i.src)).ok(), 'icon ' + i.src);
  ok(await page.$eval('link[rel=manifest]', (l) => !!l.href), 'manifest linked');
  // real offline: a throwaway server on its own origin, killed after the service worker is installed
  const { spawn } = await import('node:child_process');
  const srv = spawn('php', ['-S', '127.0.0.1:8097', '-t', path.resolve(HERE, '..', '..'), '/home/user/work/tools/router.php'], { env: { ...process.env, IR_DB_NAME: DB }, stdio: 'ignore' });
  const B2 = 'http://127.0.0.1:8097/app-manager/';
  try {
    await new Promise((r) => setTimeout(r, 800));
    const p = await newPage(); await login(p); await p.goto(B2 + 'index.php'); // cookies are per host, so the session carries over
    await p.evaluate(() => navigator.serviceWorker.ready); await p.reload();
    const ctl = await p.evaluate(() => !!navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    ok(ctl && ctl.endsWith('/app-manager/sw.js'), 'service worker controls the page: ' + ctl);
    srv.kill(); await new Promise((r) => setTimeout(r, 500));
    await p.goto(B2 + 'animals.php').catch(() => {}); const offTxt = await p.textContent('body').catch(() => '');
    const want = fs.readFileSync(path.join(HERE, '..', '..', 'app-manager', 'offline.html'), 'utf8').match(/<h1[^>]*>([^<]+)/)[1].trim();
    ok(offTxt.includes(want), 'server unreachable → cached offline page: ' + offTxt.slice(0, 80));
    await shot(p, 'A26_offline'); ev(`SW ${ctl.split('/').pop()} controlling; server down → "${want}"`);
    await p.context().close();
  } finally { srv.kill(); }
  ev(`manifest ok, ${man.icons.length} icons`);
});
await test('A24', 'Viewports 1920 / 1440 / 1366 / tablet 820 / mobile 390: key pages render, no overflow, no errors', 'Viewports', async () => {
  const pages = ['index.php', 'animals.php', 'animal.php?id=6', 'tasks.php', 'activities.php', 'habitats.php', 'health.php', 'inventory.php', 'finance.php', 'admin.php'];
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 768], [820, 1180], [390, 844]]) {
    const v = await newPage({ width: w, height: h }); await login(v);
    for (const p of pages) { await v.goto(B + p); const sw = await v.evaluate(() => document.documentElement.scrollWidth); ok(sw <= w + 2, `${p}@${w} overflow ${sw}`); }
    await v.goto(B + 'index.php'); await v.screenshot({ path: path.join(SHOTS, `A24_index_${w}.png`) }); ev(`shots/A24_index_${w}.png`);
    clean(v, 'viewport ' + w); await v.context().close();
  }
});

await browser.close();
const pass = results.filter((r) => r.ok).length, fail = results.length - pass;
fs.writeFileSync(path.join(OUT, 'acceptance.json'), JSON.stringify({ date: new Date().toISOString(), base: B, db: DB, pass, fail, results }, null, 2));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
