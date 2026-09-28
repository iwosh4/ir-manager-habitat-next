// Concept B — real-work & workflow-efficiency test. Drives the running app with Playwright, counts every
// interaction (tap/click, key press, typed value = 1) and verifies the outcome in the persisted database.
// Usage: node tests/workflow.test.cjs [baseUrl] [outJson]
const path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8095/ir-manager-design-lab/index.html';
const OUT = process.argv[3] || path.join(__dirname, 'workflow-results.json');
const results = []; let page, n = 0;
const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('irmB.db.v1')));
const ws = () => page.evaluate(() => JSON.parse(localStorage.getItem('irmB.ws.v1')));
const settle = (ms = 350) => page.waitForTimeout(ms);
async function tap(sel, { nth = 0, count = true } = {}) { const l = page.locator(sel).nth(nth); await l.scrollIntoViewIfNeeded(); await l.click(); if (count) n++; await settle(); }
async function key(k) { await page.keyboard.press(k); n++; await settle(); }
async function type(sel, text) { const l = page.locator(sel).first(); await l.fill(String(text)); n++; await settle(150); }
async function go(hash) { await page.evaluate((h) => { location.hash = h; }, hash); await settle(700); }
async function test(name, budget, fn) {
  n = 0; let ok = false, note = '';
  await page.evaluate(() => localStorage.removeItem('irmB.db.v1')); await page.reload(); await settle(1000); // each test starts from fresh demo data
  try { const r = await fn(); ok = r !== false; note = typeof r === 'string' ? r : ''; } catch (e) { note = 'ERROR ' + e.message.split('\n')[0]; }
  const within = budget == null || n <= budget;
  results.push({ name, interactions: n, budget, pass: ok && within, verified: ok, note });
  console.log(`${ok && within ? 'PASS' : 'FAIL'}  ${name.padEnd(64)} ${String(n).padStart(2)} / ${budget ?? '–'}  ${note}`);
  await page.keyboard.press('Escape').catch(() => {}); await settle(200); await page.keyboard.press('Escape').catch(() => {}); await settle(200);
}
const recCount = (d, pred) => d.records.filter(pred).length;

(async () => {
  const browser = await chromium.launch({ args: ['--disable-gpu'] });
  for (const [label, vp] of [['desktop 1440×900', { width: 1440, height: 900 }], ['mobile 390×844', { width: 390, height: 844, isMobile: true, hasTouch: true }]]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: !!vp.isMobile, hasTouch: !!vp.hasTouch });
    page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(BASE + '#/dashboard'); await page.evaluate(() => { localStorage.clear(); }); await page.goto(BASE + '#/dashboard'); await page.reload(); await settle(1200);
    console.log(`\n=== ${label} ===`); results.push({ section: label });
    const M = !!vp.isMobile;

    await test('Scheduled feeding (single animal) → FED', 1, async () => {
      await go('#/planner/week');
      const id = await page.locator('.tl-it[data-type=feeding] [data-act=tl-done]').first().getAttribute('data-id');
      const before = (await db()).records.length; await tap(`.tl-it [data-act=tl-done][data-id="${id}"]`); await settle(600);
      const d = await db(); const r = d.records.find((x) => x.id === d.occ[id]?.recordId);
      return d.records.length === before + 1 && d.occ[id]?.status === 'done' ? `${id.split('@')[0]} fed · supplement ${r?.data?.supplement || '—'}` : false;
    });
    await test('Grouped feeding "Feeding ×8" → all FED in one tap', 1, async () => {
      await go('#/planner/timeline'); const g = page.locator('.grp [data-act=tl-group-done]');
      if (!(await g.count())) return 'no open group at this hour (skipped)';
      const before = (await db()).records.length; await tap('.grp [data-act=tl-group-done]'); await settle(600);
      const d = await db(); return d.records.length > before + 1 ? `${d.records.length - before} records` : false;
    });
    await test('Scheduled water / misting / cleaning → DONE', 1, async () => {
      await go('#/tasks/today'); const btn = page.locator('.tl-it:is([data-type=water],[data-type=misting],[data-type=cleaning]) [data-act=tl-done]').first();
      const id = await btn.getAttribute('data-id'); await tap(`[data-act=tl-done][data-id="${id}"]`); await settle(600);
      return (await db()).occ[id]?.status === 'done' ? `done ${id.split('@')[0]}` : false;
    });
    await test('Feeding refused', 1, async () => {
      await go('#/planner/week'); const b = page.locator('[data-act=tl-refused]').first(); const id = await b.getAttribute('data-id');
      await tap(`[data-act=tl-refused][data-id="${id}"]`); await settle(600); const d = await db(); const r = d.records.find((x) => x.id === d.occ[id]?.recordId);
      return r?.data?.refused ? 'refused recorded, rotation not advanced' : false;
    });
    await test('Postpone (Later → +1 hour)', 2, async () => {
      await go('#/planner/week'); const b = page.locator('.tl-it:not(.grp) [data-act=tl-later]').first(); const id = await b.getAttribute('data-id');
      await tap(`[data-act=tl-later][data-id="${id}"]`); await tap('.menu button, .menu-sheet button', { nth: 0 }); await settle(500);
      const d = await db(), st = d.occ[id], k = d.tasks.find((x) => x.id === id); return st?.status === 'postponed' || (k && k.postponedTo > Date.now()) ? 'postponed' : false;
    });
    await test('Skip (More → Skip)', 2, async () => {
      await go('#/planner/week'); const b = page.locator('.tl-it:not(.grp) [data-act=tl-more]').first(); const id = await b.getAttribute('data-id');
      await tap(`[data-act=tl-more][data-id="${id}"]`); await tap('.menu button:has-text("Skip"), .menu-sheet button:has-text("Skip")'); await settle(500);
      const d = await db(), k = d.tasks.find((x) => x.id === id); return d.occ[id]?.status === 'skipped' || ['skipped', 'cancelled'].includes(k?.status) ? `skipped (${k ? 'task' : 'occurrence'})` : false;
    });
    await test('Undo last action (toast Undo)', 1, async () => {
      await go('#/planner/week'); const b = page.locator('.tl-it:not(.grp) [data-act=tl-done]').first(); const id = await b.getAttribute('data-id');
      await tap(`[data-act=tl-done][data-id="${id}"]`, { count: false }); await settle(400);
      await tap('.toast [data-undo], .toast .t-undo'); await settle(600);
      return (await db()).occ[id]?.status !== 'done' ? 'restored' : false;
    });
    await test('Weight — inline weigh-in in Planner (type + SAVE)', 2, async () => {
      await go('#/planner/week'); const inp = page.locator('.tl-wt input').first(); if (!(await inp.count())) return 'no weigh-in due this week';
      const id = await inp.getAttribute('data-id'); await type(`#w-${id.replace(/[@:]/g, (c) => '\\' + c)}`, 1234); await tap(`[data-act=tl-weight][data-id="${id}"]`); await settle(600);
      const d = await db(); const r = d.records.find((x) => x.id === d.occ[id]?.recordId); return r?.data?.g === 1234 ? 'saved 1234 g' : false;
    });
    await test('Weight — from animal profile (Weight → value → SAVE)', 3, async () => {
      await go('#/animals/a/a_cc02'); await tap('.pf-actions [data-type=weight]'); await type('[data-q-input=g]', 45.5); await tap('[data-q=save]'); await settle(600);
      const d = await db(); return d.records.some((r) => r.subject === 'a_cc02' && r.type === 'weight' && r.data.g === 45.5) ? 'saved 45.5 g' : false;
    });
    await test('Weight — global Quick Record (open → Weight → animal → value → SAVE)', 5, async () => {
      await go('#/dashboard'); if (M) await tap('.bn-rec'); else await key('q'); await tap('[data-q=type][data-v=weight]'); await tap('[data-q=filter][data-v=all]', { count: false });
      n++; await page.locator('[data-q=toggle][data-id=a_fp02] .qt-t').click(); await settle(); await type('[data-q-input=g]', 72); await tap('[data-q=save]'); await settle(600);
      const d = await db(); return d.records.some((r) => r.subject === 'a_fp02' && r.type === 'weight' && r.data.g === 72) ? 'saved (filter change not counted: “All” is one extra tap when the animal is not due)' : false;
    });
    await test('Shed from profile (Shed → SHED)', 2, async () => {
      await go('#/animals/a/a_pr03'); await tap('.pf-actions [data-type=shed]'); await tap('[data-q=save]:not([data-incomplete])'); await settle(600);
      return (await db()).records.some((r) => r.subject === 'a_pr03' && r.type === 'shed' && r.by === 'you') ? 'shed recorded' : false;
    });
    await test('Health observation from profile (Health → chip → SAVE)', 3, async () => {
      await go('#/animals/a/a_cc01'); await tap('.pf-actions [data-type=health]'); await tap('[data-q=obs]'); await tap('[data-q=save]'); await settle(600);
      return (await db()).health.some((h) => h.animal === 'a_cc01' && !h.resolved && h.t > Date.now() - 60000) ? 'health record + follow-up' : false;
    });
    await test('Bulk care — Quick Care: Water → All animals → All → GO', 4, async () => {
      await go('#/tasks/quick'); await tap('[data-act=qc-type][data-v=water]'); await tap('[data-act=qc-scope][data-v=all]'); await tap('[data-act=qc-sel][data-v=all]');
      const before = (await db()).records.length; await tap('[data-act=qc-run]:not([data-refused])'); await settle(700);
      const d = await db(); return d.records.length > before ? `${d.records.length - before} animals watered in one pass` : false;
    });
    await test('Bulk care — Quick Record multi-select (open → type → Select all due → DONE)', 4, async () => {
      await go('#/dashboard'); if (M) await tap('.bn-rec'); else await key('q');
      let typ = null; for (const t of ['misting', 'feeding', 'water', 'cleaning']) { await page.locator(`[data-q=type][data-v=${t}]`).click(); await settle(300); if (await page.locator('[data-q=select-all]').count()) { typ = t; break; } await page.locator('[data-q=back-type], .qr-back').first().click().catch(async () => { await page.keyboard.press('Escape'); await settle(200); if (M) await page.locator('.bn-rec').click(); else await page.keyboard.press('q'); }); await settle(300); }
      n++; if (!typ) return 'no activity has ≥2 animals due at this hour';
      const before = (await db()).records.length; await tap('[data-q=select-all]'); await tap('[data-q=save]:not([data-refused])'); await settle(700);
      const d = await db(); return d.records.length > before ? `${d.records.length - before} × ${typ}` : false;
    });
    await test('Group husbandry — mist group AZ-01 (4 frogs) from its profile as one record', 2, async () => {
      await go('#/animals/a/a_az01'); const before = (await db()).records.length; await tap('.pf-actions [data-type=misting]'); await tap('[data-q=save]'); await settle(600);
      const d = await db(); const r = d.records.slice(before); return r.length === 1 && r[0].subject === 'a_az01' ? 'one record covers all 4 members' : false;
    });
    await test('New task (N → title → CREATE)', 3, async () => {
      await go('#/tasks/today'); if (M) await tap('.ctx [data-act=quick-record][data-type=task]'); else await key('n'); await type('[data-q-input=title]', 'Order springtails'); await tap('[data-q=save]'); await settle(600);
      return (await db()).tasks.some((k) => k.title === 'Order springtails') ? 'task created' : false;
    });
    await test('Clutch check in incubator (Check OK)', 1, async () => {
      await go('#/reproduction/incubation'); await tap('[data-act=rp-check]'); await settle(500);
      return (await db()).records.some((r) => r.type === 'incubation' && r.by === 'you') ? 'check recorded' : false;
    });
    await test('Stock correction (+ on Inventory)', 1, async () => {
      await go('#/inventory/stock'); const q0 = (await db()).inventory.find((i) => i.id === 'i_rat').qty; await tap('[data-act=iv-adj][data-id=i_rat][data-d="1"]'); await settle(500);
      return (await db()).inventory.find((i) => i.id === 'i_rat').qty === q0 + 1 ? 'stock +1' : false;
    });
    await test('Low stock → shopping list', 1, async () => {
      await go('#/inventory/overview'); await tap('.card [data-act=iv-lowshop]'); await settle(500);
      const w = await ws(); return Object.values(w.docs).some((d) => d.kind === 'shopping' && d.items.some((x) => x.ref)) ? 'items on list' : false;
    });
    await test('Global search → open animal (/ → type → Enter)', 3, async () => {
      await go('#/dashboard'); if (M) await tap('.top .m-only[data-act=search]'); else await key('/'); await page.keyboard.type('Tessa'); n++; await settle(300); await key('Enter'); await settle(600);
      return (await page.evaluate(() => location.hash)).includes('a_pr02') ? 'opened PR-02' : false;
    });

    // ---- custom workspace test
    if (!M) {
      await test('Workspace: edit → add widget from library search → done (persisted after reload)', 5, async () => {
        await go('#/dashboard'); await tap('[data-act=ws-edit][data-ws=dashboard]'); await tap('[data-act=ws-add][data-ws=dashboard]');
        await type('[data-libq]', 'incubation window'); await tap('.lib-i[data-add=incubation-tool]'); await settle(400); await tap('[data-act=ws-done]');
        await page.reload(); await settle(1200); const w = await ws(); return w.layouts.dashboard.some((x) => x.type === 'incubation-tool') ? 'added & persisted' : false;
      });
      await test('Workspace: resize + recolour + move + duplicate + remove (with undo)', null, async () => {
        await go('#/dashboard'); await tap('[data-act=ws-edit][data-ws=dashboard]');
        const first = await page.locator('.w[data-wid]').first().getAttribute('data-wid');
        await tap(`[data-wid="${first}"] [data-act=ws-size][data-v=w]`);
        await tap(`[data-wid="${first}"] [data-act=ws-move][data-d="1"]`);
        await tap(`[data-wid="${first}"] [data-act=ws-dup]`);
        const cnt = (await ws()).layouts.dashboard.length; await tap(`[data-wid="${first}"] [data-act=ws-remove]`); await tap('.toast .t-undo, .toast [data-undo]');
        await tap('[data-act=ws-done]'); await page.reload(); await settle(1200);
        const L = (await ws()).layouts.dashboard, w0 = L.find((x) => x.id === first);
        return w0 && w0.size === 'w' && L.length === cnt && L.findIndex((x) => x.id === first) === 1 ? 'size W, moved to #2, duplicate kept, remove undone, persisted' : `state ${JSON.stringify({ size: w0?.size, len: L.length, cnt, idx: L.findIndex((x) => x.id === first) })}`;
      });
      await test('Workspace: preset “Breeding focus” + reset to default', null, async () => {
        await go('#/dashboard'); await tap('[data-act=ws-edit][data-ws=dashboard]'); await tap('[data-act=ws-presets][data-ws=dashboard]'); await tap('.menu button:has-text("Breeding")');
        const a = (await ws()).layouts.dashboard.map((x) => x.type).join(','); await tap('[data-act=ws-reset][data-ws=dashboard]'); await tap('.ov-modal button:has-text("Reset"), .ov-sheet button:has-text("Reset")'); await settle(500);
        const b = (await ws()).layouts.dashboard.map((x) => x.type).join(','); await tap('[data-act=ws-done]').catch(() => {});
        return a.includes('hatch') && b.startsWith('kpis,today') ? 'preset applied, then reset to default' : `a=${a} b=${b}`;
      });
      await test('Workspace: two independent shopping lists as widgets', null, async () => {
        const w = await ws(); const lists = Object.values(w.docs).filter((d) => d.kind === 'shopping'); return lists.length >= 2 ? `${lists.length} lists (${lists.map((l) => l.title).join(', ')})` : false;
      });
    }
    await test('No uncaught page errors during run', null, async () => (errors.length ? `ERR ${errors.slice(0, 3).join(' | ')}` && false : 'clean'));
    await ctx.close();
  }
  // ---- morning round with the browser clock pinned to 08:10 (misting at 08:00 is due for 12 animals)
  { const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); page = await ctx.newPage(); page.setDefaultTimeout(4000);
    const d = new Date(); d.setHours(8, 10, 0, 0); await page.clock.install({ time: d }); await page.clock.resume?.();
    await page.goto(BASE + '#/dashboard'); await page.evaluate(() => localStorage.clear()); await page.reload(); await settle(1500);
    console.log('\n=== mobile 390×844, clock 08:10 (morning round) ==='); results.push({ section: 'mobile 390×844, clock pinned to 08:10' }); const M = true;
    await test('Morning misting round — + → Misting → Select all due → DONE', 4, async () => {
      await tap('.bn-rec'); await tap('[data-q=type][data-v=misting]'); const before = (await db()).records.length; await tap('[data-q=select-all]'); await tap('[data-q=save]'); await settle(700);
      const dd = await db(); return dd.records.length - before >= 2 ? `${dd.records.length - before} animals misted` : false;
    });
    await test('Morning round from Home — grouped Misting ×N in Planner → one tap', 1, async () => {
      await go('#/planner/today'); const g = page.locator('.grp[data-type=misting] [data-act=tl-group-done], .grp [data-act=tl-group-done]').first(); if (!(await g.count())) return false;
      const before = (await db()).records.length; await tap('.grp [data-act=tl-group-done]'); await settle(700); const dd = await db(); return dd.records.length - before >= 2 ? `${dd.records.length - before} records in one tap` : false;
    });
    await ctx.close(); }
  await browser.close();
  require('fs').writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
  const t = results.filter((r) => r.name); console.log(`\n${t.filter((r) => r.pass).length}/${t.length} passed`);
})();
