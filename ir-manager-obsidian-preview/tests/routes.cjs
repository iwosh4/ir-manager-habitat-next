// visit many routes, collect errors + overflow, screenshot each
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
(async () => { const [w, h, outdir, ...routes] = process.argv.slice(2); const b = await chromium.launch({ args: ['--disable-gpu'] });
const ctx = await b.newContext({ viewport: { width: +w, height: +h }, timezoneId: 'Europe/Prague', locale: 'cs-CZ', hasTouch: +w < 800, isMobile: +w < 800 }); const p = await ctx.newPage(); await p.clock.setFixedTime(new Date(process.env.CLOCK || '2026-09-29T10:40:00+02:00'));
const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n')[1])); p.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type() + ': ' + m.text()); }); p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
await p.goto('http://localhost:8095/ir-manager-obsidian-preview/index.html#/prehled'); await p.waitForTimeout(1200);
for (const r of routes) { errs.length = 0; await p.evaluate(h => location.hash = h, r); await p.waitForTimeout(700);
  const ov = await p.evaluate(() => { const vw = document.documentElement.clientWidth; const out = []; for (const el of document.querySelectorAll('#view *')) { const b = el.getBoundingClientRect(); if (b.width && b.right > vw + 1 && getComputedStyle(el).position !== 'fixed') { let s = el.tagName.toLowerCase() + '.' + [...el.classList].join('.'); out.push(s + ' r=' + Math.round(b.right)); } } const v = document.querySelector('#view'); return { list: out.slice(0, 5), sw: v.scrollWidth, cw: v.clientWidth, doc: document.documentElement.scrollWidth }; });
  const name = r.replace(/[#/?=]/g, '_'); await p.screenshot({ path: `${outdir}/${name}.png` });
  console.log(r, errs.length ? '\n  ' + errs.join('\n  ') : 'ok', ov.sw > ov.cw + 1 || ov.doc > +w ? `OVERFLOW view ${ov.sw}/${ov.cw} doc ${ov.doc} ${ov.list.join(' | ')}` : ''); }
await b.close(); })();
