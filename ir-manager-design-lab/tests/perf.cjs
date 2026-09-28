// Concept B — load & route-switch timings from the running app. Usage: node tests/perf.cjs [baseUrl]
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const BASE = process.argv[2] || 'http://localhost:8095/ir-manager-design-lab/index.html';
const ROUTES = ['planner/timeline', 'tasks/today', 'animals/grid', 'animals/a/a_pr02', 'reproduction/overview', 'health/overview', 'enclosures/overview', 'inventory/overview', 'finance/overview', 'genetics/calculator', 'tools', 'dashboard'];
(async () => {
  const b = await chromium.launch({ args: ['--disable-gpu'] });
  for (const [label, vp] of [['desktop 1440', { width: 1440, height: 900 }], ['mobile 390', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    await p.goto(BASE + '#/dashboard'); await p.evaluate(() => localStorage.clear());
    const t0 = Date.now(); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('#view .brief'); const cold = Date.now() - t0; await p.reload(); await p.waitForSelector('#view .brief'); const t1 = Date.now(); await p.reload({ waitUntil: 'load' }); await p.waitForSelector('#view .brief'); const warm = Date.now() - t1;
    const nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const r = performance.getEntriesByType('resource'); return { dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), requests: r.length + 1, kb: Math.round(r.reduce((s, x) => s + (x.transferSize || x.encodedBodySize || 0), 0) / 1024) }; });
    const sw = [];
    for (const r of ROUTES) { const ms = await p.evaluate(async (h) => { const t0 = performance.now(); location.hash = '#/' + h; await new Promise((res) => { const v = document.getElementById('view'); const mo = new MutationObserver(() => { mo.disconnect(); requestAnimationFrame(() => res()); }); mo.observe(v, { childList: true }); setTimeout(res, 3000); }); return Math.round(performance.now() - t0); }, r); sw.push([r, ms]); await p.waitForTimeout(250); }
    const heap = await p.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
    const act = await p.evaluate(async () => { location.hash = '#/planner/week'; await new Promise((r) => setTimeout(r, 600)); const v = document.getElementById('view'); const b = document.querySelector('.tl-it:not(.grp) [data-act=tl-done]');
      let rendered; const done = new Promise((res) => { const mo = new MutationObserver(() => { mo.disconnect(); rendered = performance.now(); res(); }); mo.observe(v, { childList: true, subtree: false }); });
      const t0 = performance.now(); b.click(); await new Promise((r) => requestAnimationFrame(r)); const feedback = performance.now() - t0; await done; return { feedbackMs: Math.round(feedback), viewUpdatedMs: Math.round(rendered - t0) }; });
    console.log(JSON.stringify({ label, firstLoadToDashboardMs: cold, reloadToDashboardMs: warm, nav, routeSwitchMs: Object.fromEntries(sw), medianSwitch: sw.map((x) => x[1]).sort((a, b) => a - b)[Math.floor(sw.length / 2)], tapPlannerWeek: act, heapMB: heap }));
    await p.close();
  }
  await b.close();
})();
