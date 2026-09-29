// Real interaction test of the Obsidian preview. Prints PASS/FAIL lines.
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const BASE = 'http://localhost:8095/ir-manager-obsidian-preview/index.html';
const results = []; const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
(async () => {
  const b = await chromium.launch({ args: ['--disable-gpu'] });
  const desk = async () => { const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Prague' }); const p = await ctx.newPage(); await p.clock.setFixedTime(new Date('2026-09-29T10:40:00+02:00')); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); await p.goto(BASE + '#/prehled'); await p.waitForTimeout(1200); return { p, errs, ctx }; };
  const { p, errs } = await desk();
  const W = (ms = 450) => p.waitForTimeout(ms);
  const count = (sel) => p.locator(sel).count();
  const txt = (sel) => p.locator(sel).first().innerText().catch(() => '');
  // --- header order
  const order = await p.evaluate(() => [...document.querySelectorAll('.hd > *:not(.hd-mbrand):not(.hd-mtitle), .hd-actions > *, .hd-right > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.className.split(' ')[0]));
  ok('header order', JSON.stringify(order).includes('"hd-rec","hd-tool","hd-tool"') && order.indexOf('hd-search') < order.indexOf('hd-bell') && order.indexOf('hd-bell') < order.indexOf('hd-profile') && order.indexOf('hd-profile') < order.indexOf('hd-caiman'), order.join(','));
  // --- live strip: next / pause
  const m1 = await txt('.lv-msg b'); await p.click('[data-act=live-next]'); await W(500); const m2 = await txt('.lv-track .lv-msg:last-child b');
  ok('live next', m1 !== m2, `${m1} → ${m2}`);
  await p.click('[data-act=live-pause]'); await W(); ok('live pause', await p.locator('.live.paused').count() === 1);
  await p.click('[data-act=live-pause]'); await p.mouse.move(700, 500);
  // --- planner: complete + undo
  await p.evaluate(() => (location.hash = '#/ukoly/planovac')); await W(900);
  const openBefore = await count('.tl-it.st-overdue');
  const first = p.locator('.tl-it.st-overdue [data-act=tl-done]').first(); const id = await first.getAttribute('data-id');
  await first.click(); await W(200); ok('completion motion class', await count('.tl-it.is-done') >= 1);
  await W(700); ok('toast Zapsáno', (await txt('.toast .t-msg')).startsWith('Zapsáno'), await txt('.toast .t-msg'));
  ok('item completed', await count('.tl-it.st-overdue') === openBefore - 1, `${openBefore} → ${await count('.tl-it.st-overdue')}`);
  await p.click('.toast .t-undo'); await W(700); ok('undo restores', await count('.tl-it.st-overdue') === openBefore);
  // postpone
  await p.locator('.tl-it.st-overdue [data-act=tl-later]').first().click(); await W(300); ok('postpone menu', await count('.menu button') >= 5);
  await p.locator('.menu button').nth(0).click(); await W(700); ok('postponed toast', (await txt('.toast:last-child .t-msg')).startsWith('Odloženo'), await txt('.toast:last-child .t-msg'));
  // skip
  await p.locator('.tl-it.st-overdue [data-act=tl-skip]').first().click(); await W(700); ok('skip toast', (await txt('.toast:last-child .t-msg')).startsWith('Vynecháno'));
  // detail
  await p.locator('.tl-it.st-open [data-act=tl-detail]').first().click(); await W(500); ok('detail panel', (await txt('.ov-drawer .ov-head h2')) === 'Detail'); await p.keyboard.press('Escape'); await W(300);
  // group expand + complete all
  const grp = p.locator('.tl-it.grp.st-open, .tl-it.grp.st-overdue').first();
  const gtitle = await grp.locator('.tl-title b').innerText(); await grp.locator('[data-act=tl-expand]').click(); await W(500);
  ok('group expand', await count('.grp-list .grp-row') >= 2, gtitle);
  await p.locator('.tl-it.grp.open [data-act=tl-group-done]').first().click(); await W(900); ok('group HOTOVO VŠE', (await txt('.toast:last-child .t-msg')).includes('×'), await txt('.toast:last-child .t-msg'));
  // extended schedule
  await p.click('[data-act=pl-xs]'); await W(500); ok('extended schedule', await count('.xs-row') >= 5, `${await count('.xs-row')} rows`); await p.click('.ph [data-act=pl-xs], .pl-bar [data-act=pl-xs]'); await W(300);
  // --- quick record flow: feeding → target → save
  await p.keyboard.press('q'); await W(500); ok('quick record opens', await count('.qr-modal .qa') === 10);
  await p.locator('.qa[data-v=feeding]').click(); await W(400); ok('QR target step', await count('.qt') >= 1, `${await count('.qt')} candidates`);
  await p.locator('.qt').first().click(); await W(400); ok('QR detail step', await count('.qr-go [data-q=save]') >= 1);
  await p.locator('.qr-go .btn.primary[data-q=save]').click(); await W(700); ok('QR saved', (await txt('.toast:last-child .t-msg')).startsWith('Zapsáno'), await txt('.toast:last-child .t-msg'));
  // --- search
  await p.keyboard.press('Control+k'); await W(400); await p.keyboard.type('Tessa'); await W(400);
  ok('search groups', (await p.locator('.sp-g h6').allInnerTexts()).join(',').toLowerCase().includes('zvířata'), (await p.locator('.sp-g h6').allInnerTexts()).join(','));
  await p.keyboard.press('Enter'); await W(800); ok('search navigates', (await p.evaluate(() => location.hash)).includes('karta/a_pr02'));
  // profile NAKRMIT one click (FP-01)
  await p.evaluate(() => (location.hash = '#/zvirata/karta/a_fp01')); await W(800);
  await p.evaluate(() => (location.hash = '#/zvirata/karta/a_fp02')); await W(800); const lbl = await txt('[data-act=pf-feed] b'); await p.click('[data-act=pf-feed]'); await W(900); const qrOpen = await count('.qr-modal'); ok('profile NAKRMIT', qrOpen ? !lbl.includes('termín') : (await txt('.toast:last-child .t-msg')).startsWith('Zapsáno'), `${lbl} → ${qrOpen ? 'quick record (no due feeding)' : await txt('.toast:last-child .t-msg')}`); if (qrOpen) { await p.keyboard.press('Escape'); await W(300); }
  // --- notifications
  await p.click('[data-act=notifications]'); await W(500); const cats = await p.locator('.nc-g h6').allInnerTexts(); ok('notification categories', cats.length >= 3, cats.map((c) => c.split('\n')[0]).join(' | '));
  const nd = p.locator('[data-n-done]').first(); if (await nd.count()) { await nd.click(); await W(800); ok('notification direct action', (await txt('.toast:last-child .t-msg')).startsWith('Zapsáno')); }
  await p.keyboard.press('Escape'); await W(300);
  // --- QR / voice states
  await p.click('[data-act=qr]'); await W(400); ok('QR scanning state', await count('.hd-tool.scanning') === 1 && await count('.scan-line') === 1); await p.keyboard.press('Escape'); await W(300); ok('QR state cleared', await count('.hd-tool.scanning') === 0);
  await p.click('[data-act=voice]'); await W(400); await p.click('.v-orb'); await W(300); ok('voice listening state', await count('.voice.listening') === 1 && (await p.evaluate(() => document.querySelector('[data-role=voice]').className)).includes('listening')); await W(1500); await p.click('[data-v-ex]'); await W(150); ok('voice processing state', await count('.voice.processing') === 1); await W(600); ok('voice parse result', await count('.v-res') === 1, await txt('.v-res b')); await p.keyboard.press('Escape'); await W(300);
  // --- widgets: edit, add, resize, move, accent
  await p.evaluate(() => (location.hash = '#/prehled')); await W(900);
  const nW = await count('.wsp[data-ws=prehled] .w');
  await p.click('[data-act=ws-edit][data-ws=prehled]'); await W(500); ok('edit mode', await count('.wsp.editing') === 1);
  await p.click('.wsp-bar [data-act=ws-add]'); await W(500); const cats2 = await p.locator('.lib-cats button').allInnerTexts(); ok('library categories', ['PŘEHLED', 'PÉČE', 'REPRODUKCE', 'ZDRAVÍ', 'SKLAD', 'FINANCE', 'NÁSTROJE'].every((c) => cats2.join(' ').includes(c)), cats2.map((x) => x.split('\n')[0]).join(','));
  await p.fill('[data-libq]', 'nákup'); await W(300); ok('library search', await count('.lib-i') >= 1, `${await count('.lib-i')} hits`);
  await p.locator('.lib-i[data-add=shopping]').click(); await W(700); ok('widget added', await count('.wsp[data-ws=prehled] .w') === nW + 1);
  const last = p.locator('.wsp[data-ws=prehled] .w').last(); const wid = await last.getAttribute('data-wid');
  await last.locator('[data-act=ws-size][data-v=l]').click(); await W(400); ok('widget resize', (await p.locator(`[data-wid="${wid}"]`).getAttribute('class')).includes('w-l'));
  await p.locator(`[data-wid="${wid}"] [data-act=ws-move][data-d="-1"]`).click(); await W(400); const idx = await p.evaluate((w) => [...document.querySelectorAll('.wsp[data-ws=prehled] .w')].findIndex((e) => e.dataset.wid === w), wid); ok('widget move', idx === nW - 1, `index ${idx}`);
  await p.locator(`[data-wid="${wid}"] [data-act=ws-config]`).click(); await W(400); await p.click('[data-c-acc=blue]'); await p.click('[data-c-frame=strip]'); await W(300); await p.keyboard.press('Escape'); await W(300);
  ok('widget accent/frame', /acc-blue/.test(await p.locator(`[data-wid="${wid}"]`).getAttribute('class')) && /fr-strip/.test(await p.locator(`[data-wid="${wid}"]`).getAttribute('class')));
  await p.click('[data-act=ws-done]'); await W(500);
  // shopping list in the new widget: add item
  const shop = p.locator(`[data-wid="${wid}"] .tool.shop`); const n0 = await shop.locator('.si').count();
  await shop.locator('[data-t=add-in]').fill('Cvrčci 300 ks 1,1'); await shop.locator('[data-t=add-in]').press('Enter'); await W(400);
  ok('shopping add', await p.locator(`[data-wid="${wid}"] .si`).count() === n0 + 1);
  await p.locator(`[data-wid="${wid}"] .si`).last().locator('.cb').check(); await W(500); ok('shopping check', await p.locator(`[data-wid="${wid}"] .si.done`).count() >= 1);
  // notes autosave
  const note = p.locator('.wsp[data-ws=prehled] .note-ta').first(); await note.click(); await p.keyboard.type(' Test autosave.'); await W(900);
  const saved = await p.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('irmO.ws.v1')).docs).includes('Test autosave.')); ok('notes autosave', saved);
  // calculator
  await p.evaluate(() => (location.hash = '#/nastroje?n=calculator')); await W(800);
  for (const k of ['1', '2', '×', '3', '=']) await p.locator(`.calc-k [data-k="${k}"]`).click();
  ok('calculator', (await txt('.calc-e')) === '36', await txt('.calc-e'));
  // reload persistence
  await p.reload(); await W(1200); ok('layout persists reload', await p.evaluate((w) => !!JSON.parse(localStorage.getItem('irmO.ws.v1')).layouts.prehled.find((x) => x.id === w), wid));
  ok('no page errors (desktop)', errs.length === 0, errs.slice(0, 3).join(' | '));
  // --- mobile
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Europe/Prague', hasTouch: true, isMobile: true }); const m = await ctx2.newPage(); await m.clock.setFixedTime(new Date('2026-09-29T10:40:00+02:00')); const merr = []; m.on('pageerror', (e) => merr.push(e.message));
  await m.goto(BASE + '#/prehled'); await m.waitForTimeout(1200);
  const bn = await m.locator('.bn').boundingBox(); ok('mobile bottom nav height', bn && bn.height >= 72 && bn.height <= 84, bn && `${bn.height}px`);
  ok('mobile nav labels', (await m.locator('.bn > a span, .bn > button span').allInnerTexts()).join(',') === 'Domů,Zvířata,Úkoly,Více', (await m.locator('.bn > a span, .bn > button span').allInnerTexts()).join(','));
  await m.tap('.bn-plus'); await m.waitForTimeout(500); ok('mobile + opens sheet', await m.locator('.ov-sheet .qa').count() === 10); await m.keyboard.press('Escape'); await m.waitForTimeout(400);
  await m.tap('[data-bn=more]'); await m.waitForTimeout(500); ok('mobile More sheet', await m.locator('.more-sheet .more-i').count() >= 10);
  const h0 = await m.evaluate(() => location.hash); await m.locator('.more-i[data-more-i=sklad] [data-more-toggle]').tap(); await m.waitForTimeout(300); ok('More accordion (no reload)', await m.locator('.more-i[data-more-i=sklad].open .more-subs a').count() === 3 && (await m.evaluate(() => location.hash)) === h0);
  await m.locator('.more-i[data-more-i=sklad] .more-subs a').nth(2).tap(); await m.waitForTimeout(800); ok('More navigates', (await m.evaluate(() => location.hash)) === '#/sklad/nakup');
  await m.evaluate(() => (location.hash = '#/ukoly/planovac')); await m.waitForTimeout(900); ok('mobile planner sticky bar', await m.locator('.m-plbar .btn').count() === 4);
  ok('no page errors (mobile)', merr.length === 0, merr.slice(0, 3).join(' | '));
  console.log(results.join('\n')); console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
  await b.close();
})().catch((e) => { console.log(results.join('\n')); console.error('CRASH', e.message); process.exit(1); });
