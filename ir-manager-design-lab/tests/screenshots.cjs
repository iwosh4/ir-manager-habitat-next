// Concept B — screenshots from the actual running app (fresh demo data, no mock-ups).
// Usage: node tests/screenshots.cjs [baseUrl] [outDir]
const fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8095/ir-manager-design-lab/index.html';
const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots');
fs.mkdirSync(path.join(OUT, 'desktop'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'mobile'), { recursive: true });
const shots = [];

const DESKTOP = [
  ['01-dashboard', '#/dashboard'], ['02-planner-timeline', '#/planner/timeline'], ['03-planner-week-lanes', '#/planner/week'], ['04-planner-history', '#/planner/history'],
  ['05-tasks-today', '#/tasks/today'], ['06-quick-care', '#/tasks/quick'], ['07-animals-grid', '#/animals/grid'], ['08-animals-table', '#/animals/table'], ['09-animals-groups', '#/animals/groups'],
  ['10-profile-overview', '#/animals/a/a_pr02'], ['11-profile-group', '#/animals/a/a_az01'], ['12-reproduction', '#/reproduction/overview'], ['13-cycle-detail', '#/reproduction/cycle/cy_pr02'],
  ['14-clutch-detail', '#/reproduction/clutch/cl_msp'], ['15-incubation', '#/reproduction/incubation'], ['16-health', '#/health/overview'], ['17-medication', '#/health/medication'],
  ['18-enclosures', '#/enclosures/overview'], ['19-enclosure-detail', '#/enclosures/e/e_ch1'], ['20-assemblies', '#/enclosures/assemblies'], ['21-habitat-studio-entry', '#/enclosures/habitat'],
  ['22-inventory', '#/inventory/overview'], ['23-stock', '#/inventory/stock'], ['24-finance', '#/finance/overview'], ['25-finance-monthly', '#/finance/monthly'], ['26-sales', '#/sales/reserved'],
  ['27-directory', '#/directory/all'], ['28-genetics', '#/genetics/calculator'], ['29-tools', '#/tools'], ['30-settings-activities', '#/settings/activities'],
];
const DESKTOP_INTERACTIVE = [
  ['40-quick-record-actions', '#/dashboard', async (p) => { await p.keyboard.press('q'); }],
  ['41-quick-record-targets', '#/dashboard', async (p) => { await p.keyboard.press('q'); await p.waitForTimeout(300); await p.click('[data-q=type][data-v=feeding]'); await p.click('[data-q=filter][data-v=all]'); }],
  ['42-quick-record-feeding', '#/dashboard', async (p) => { await p.keyboard.press('q'); await p.waitForTimeout(300); await p.click('[data-q=type][data-v=feeding]'); await p.click('[data-q=filter][data-v=all]'); await p.click('[data-q=toggle][data-id=a_fp01] .qt-t'); }],
  ['43-search-palette', '#/dashboard', async (p) => { await p.keyboard.press('/'); await p.keyboard.type('pyth'); }],
  ['44-notifications', '#/dashboard', async (p) => { await p.click('[data-act=notifications]'); }],
  ['45-workspace-edit', '#/dashboard', async (p) => { await p.click('[data-act=ws-edit][data-ws=dashboard]'); }],
  ['46-widget-library', '#/dashboard', async (p) => { await p.click('[data-act=ws-edit][data-ws=dashboard]'); await p.waitForTimeout(300); await p.click('[data-act=ws-add][data-ws=dashboard]'); }],
  ['47-widget-config', '#/dashboard', async (p) => { await p.click('[data-act=ws-edit][data-ws=dashboard]'); await p.waitForTimeout(300); await p.locator('[data-act=ws-config]').nth(1).click(); }],
  ['48-multitool-drawer', '#/dashboard', async (p) => { await p.keyboard.press('t'); }],
  ['49-postpone-menu', '#/planner/week', async (p) => { await p.locator('.tl-it:not(.grp) [data-act=tl-later]').first().click(); }],
  ['50-group-expanded', '#/planner/timeline', async (p) => { const e = p.locator('.grp [data-act=tl-expand]').first(); if (await e.count()) await e.click(); }],
  ['51-add-animal', '#/animals/grid', async (p) => { await p.keyboard.press('n'); }],
  ['52-hatch-flow', '#/reproduction/incubation', async (p) => { await p.locator('[data-act=rp-hatch]').first().click(); }],
  ['53-light-theme', '#/dashboard', async (p) => { await p.evaluate(() => { document.documentElement.dataset.theme = 'light'; }); }],
];
const MOBILE = [
  ['m01-home', '#/dashboard'], ['m02-animals', '#/animals/grid'], ['m03-profile', '#/animals/a/a_cc01'], ['m04-tasks', '#/tasks/today'], ['m05-planner-stream', '#/planner/timeline'],
  ['m06-quick-care', '#/tasks/quick'], ['m07-reproduction', '#/reproduction/overview'], ['m08-clutch', '#/reproduction/clutch/cl_msp'], ['m09-health', '#/health/overview'], ['m10-inventory', '#/inventory/overview'],
  ['m11-animals-table-cards', '#/animals/table'], ['m12-genetics', '#/genetics/calculator'],
];
const MOBILE_INTERACTIVE = [
  ['m20-quick-action-sheet', '#/dashboard', async (p) => { await p.click('.bn-rec'); }],
  ['m21-quick-record-target', '#/dashboard', async (p) => { await p.click('.bn-rec'); await p.waitForTimeout(300); await p.click('[data-q=type][data-v=weight]'); }],
  ['m22-quick-record-weight', '#/dashboard', async (p) => { await p.click('.bn-rec'); await p.waitForTimeout(300); await p.click('[data-q=type][data-v=weight]'); await p.click('[data-q=filter][data-v=all]'); await p.click('[data-q=toggle][data-id=a_cc02] .qt-t'); }],
  ['m23-more-accordion', '#/dashboard', async (p) => { await p.click('.bnav [data-act=more]'); await p.waitForTimeout(300); const r = p.locator('[data-more-toggle]').nth(1); if (await r.count()) await r.click(); }],
  ['m24-postpone-sheet', '#/planner/week', async (p) => { await p.locator('.tl-it:not(.grp) [data-act=tl-later]').first().click(); }],
  ['m25-multitool', '#/tools', async () => {}],
];

async function run(ctxOpts, list, dir, suffix = '', full = false) {
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  const ctx = await browser.newContext(ctxOpts); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '#/dashboard'); await p.evaluate(() => localStorage.clear()); await p.goto(BASE + '#/dashboard'); await p.reload(); await p.waitForTimeout(1200);
  for (const [name, hash, fn] of list) {
    await p.keyboard.press('Escape').catch(() => {}); await p.keyboard.press('Escape').catch(() => {});
    await p.evaluate((h) => { document.documentElement.dataset.theme = 'dark'; location.hash = h; }, hash); await p.waitForTimeout(800);
    if (fn) { try { await fn(p); } catch (e) { errs.push(`${name}: ${e.message.split('\n')[0]}`); } await p.waitForTimeout(600); }
    const file = path.join(OUT, dir, `${name}${suffix}.png`); await p.screenshot({ path: file, fullPage: full }); shots.push(path.relative(OUT, file));
  }
  await browser.close(); return errs;
}
(async () => {
  const errs = [];
  errs.push(...await run({ viewport: { width: 1440, height: 900 } }, [...DESKTOP, ...DESKTOP_INTERACTIVE], 'desktop', '-1440'));
  errs.push(...await run({ viewport: { width: 1920, height: 1080 } }, DESKTOP.filter(([n]) => /01|02|07|10|12|18|24/.test(n)), 'desktop', '-1920'));
  errs.push(...await run({ viewport: { width: 1366, height: 768 } }, DESKTOP.filter(([n]) => /01|02|05|07|10|22/.test(n)), 'desktop', '-1366'));
  const phone = (w, h) => ({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  errs.push(...await run(phone(390, 844), [...MOBILE, ...MOBILE_INTERACTIVE], 'mobile', '-390'));
  errs.push(...await run(phone(430, 932), MOBILE.slice(0, 6), 'mobile', '-430'));
  errs.push(...await run(phone(360, 780), [...MOBILE.slice(0, 5), MOBILE_INTERACTIVE[0]], 'mobile', '-360'));
  fs.writeFileSync(path.join(OUT, 'INDEX.txt'), shots.join('\n') + '\n');
  console.log(`${shots.length} screenshots → ${OUT}`); console.log(errs.length ? `issues:\n${errs.join('\n')}` : 'no page errors');
})();
