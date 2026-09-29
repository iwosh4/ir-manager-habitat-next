/* IR Manager BETA 1.0 FINAL — shared client layer.
   IR.api (CSRF, JSON), toasts, LIVE strip, QR scanner (BarcodeDetector → jsQR fallback), feeding sheet
   (EATEN / REFUSED / IN SHED / NOT FED), taxonomy autocomplete (Latin first), local QR rendering, shortcuts.
   No secrets, no demo data: everything comes from api.php for the logged-in account. */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const csrf = () => $('[data-csrf]')?.dataset.csrf || $('input[name=_csrf]')?.value || '';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ICON = (n) => `<img class="ir-visual-icon" src="assets/icons/custom/${esc(n)}.webp" alt="" aria-hidden="true" loading="lazy">`;

  async function api(action, data = null, opts = {}) {
    const url = 'api.php?a=' + encodeURIComponent(action) + (data && !opts.post && opts.method !== 'POST' ? '&' + new URLSearchParams(data) : '');
    const post = opts.post || opts.method === 'POST';
    const init = { credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (post) {
      init.method = 'POST';
      init.headers['X-CSRF-Token'] = csrf();
      if (data instanceof FormData) init.body = data;
      else { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(data || {}); }
    }
    let res, json;
    try { res = await fetch(url, init); json = await res.json(); }
    catch (e) { throw Object.assign(new Error(navigator.onLine ? 'Server neodpověděl. Nic nebylo uloženo.' : 'Jste offline. Nic nebylo uloženo.'), { code: 'network' }); }
    if (!json.ok) throw Object.assign(new Error(json.message || 'Operaci se nepodařilo dokončit.'), { code: json.error, status: res.status, data: json });
    return json;
  }

  // ------------------------------------------------------------------ toasts
  function toast(msg, type = 'ok', ms = 3800) {
    let host = $('.b1-toasts');
    if (!host) { host = document.createElement('div'); host.className = 'b1-toasts'; host.setAttribute('role', 'status'); host.setAttribute('aria-live', 'polite'); document.body.append(host); }
    const el = document.createElement('div'); el.className = 'b1-toast is-' + type; el.textContent = msg; host.append(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // ------------------------------------------------------------------ sheet (modal) helper
  function sheet(html, { title = '', wide = false, onClose } = {}) {
    const ov = document.createElement('div');
    ov.className = 'b1-sheet-ov';
    ov.innerHTML = `<div class="b1-sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><strong>${esc(title)}</strong><button type="button" class="b1-x" data-close aria-label="Zavřít">×</button></header><div class="b1-sheet-body">${html}</div></div>`;
    const prev = document.activeElement;
    const close = () => { ov.remove(); document.removeEventListener('keydown', key); onClose?.(); prev?.focus?.(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', key);
    document.body.append(ov);
    setTimeout(() => ov.querySelector('button:not([data-close]),input,select')?.focus(), 30);
    return { el: ov.querySelector('.b1-sheet-body'), close, root: ov };
  }

  // ------------------------------------------------------------------ LIVE strip
  const LIVE = { i: 0, msgs: [], timer: 0, hover: false, user: false };
  const liveHost = $('[data-live]');
  function liveRender(dir = 1) {
    const host = liveHost; if (!host || !LIVE.msgs.length) return;
    const m = LIVE.msgs[LIVE.i];
    const html = `<a class="b1-live-msg ${m.prio ? 'prio' : ''}" href="${esc(m.href)}">${ICON(m.icon)}<b>${esc(m.text)}</b>${m.detail ? `<span>${esc(m.detail)}</span>` : ''}</a>`;
    const track = $('.b1-live-track', host); const cur = $('.b1-live-msg', track);
    if (cur && !reduced()) {
      const w = document.createElement('div'); w.innerHTML = html; const el = w.firstElementChild;
      el.classList.add(dir > 0 ? 'enter' : 'enter-rev'); track.append(el);
      cur.classList.add(dir > 0 ? 'leave' : 'leave-rev'); setTimeout(() => cur.remove(), 300);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('enter', 'enter-rev')));
    } else track.innerHTML = html;
    host.classList.toggle('has-prio', !!m.prio);
    const c = $('[data-live-count]', host); if (c) c.textContent = `${LIVE.i + 1}/${LIVE.msgs.length}`;
  }
  function liveStep(d = 1) { if (!LIVE.msgs.length) return; LIVE.i = (LIVE.i + d + LIVE.msgs.length) % LIVE.msgs.length; liveRender(d); }
  function liveSchedule() {
    clearInterval(LIVE.timer);
    const paused = LIVE.user || LIVE.hover || document.hidden || reduced();
    liveHost?.classList.toggle('paused', paused);
    if (!paused) LIVE.timer = setInterval(() => liveStep(1), 6500);
  }
  if (liveHost) {
    try { LIVE.msgs = JSON.parse(liveHost.dataset.liveMessages || '[]'); } catch { LIVE.msgs = []; }
    if (!LIVE.msgs.length) liveHost.hidden = true;
    liveHost.addEventListener('mouseenter', () => { LIVE.hover = true; liveSchedule(); });
    liveHost.addEventListener('mouseleave', () => { LIVE.hover = false; liveSchedule(); });
    liveHost.addEventListener('focusin', () => { LIVE.hover = true; liveSchedule(); });
    liveHost.addEventListener('focusout', () => { LIVE.hover = false; liveSchedule(); });
    $('[data-live-prev]', liveHost)?.addEventListener('click', () => liveStep(-1));
    $('[data-live-next]', liveHost)?.addEventListener('click', () => liveStep(1));
    $('[data-live-pause]', liveHost)?.addEventListener('click', (e) => {
      LIVE.user = !LIVE.user; liveHost.classList.toggle('user-paused', LIVE.user);
      e.currentTarget.setAttribute('aria-pressed', String(LIVE.user)); e.currentTarget.setAttribute('aria-label', LIVE.user ? 'Pokračovat' : 'Pozastavit'); liveSchedule();
    });
    document.addEventListener('visibilitychange', liveSchedule);
    liveSchedule();
    // refresh from the server every 90 s (real data; keeps position)
    setInterval(async () => {
      if (document.hidden) return;
      try { const r = await api('live.summary'); if (r.messages) { LIVE.msgs = r.messages; LIVE.i = Math.min(LIVE.i, LIVE.msgs.length - 1); liveHost.hidden = !LIVE.msgs.length; } } catch {}
    }, 90000);
  }

  // ------------------------------------------------------------------ local QR rendering (labels, cards) — no third-party service
  let qrgenP = null;
  const loadScript = (src) => new Promise((ok, bad) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => bad(new Error('Nelze načíst ' + src)); document.head.append(s); });
  function qrSvg(text, cell = 4) {
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  }
  async function renderQrs(root = document) {
    const els = $$('[data-qr-render]', root); if (!els.length) return;
    qrgenP ||= loadScript('assets/vendor/qr/qrcode.min.js');
    await qrgenP;
    els.forEach((el) => { el.innerHTML = qrSvg(el.dataset.qrRender); el.querySelector('svg')?.setAttribute('role', 'img'); el.querySelector('svg')?.setAttribute('aria-label', 'QR kód'); });
  }
  renderQrs();

  // ------------------------------------------------------------------ feeding sheet (one animal): EATEN / REFUSED / IN SHED / NOT FED
  const RESULTS = [
    ['eaten', 'Snědlo', 'feeding', 'ok'],
    ['refused', 'Odmítlo', 'warning-action', 'warn'],
    ['in_shed', 'Ve svleku', 'shedding', 'info'],
    ['not_fed', 'Nekrmeno', 'reminder', 'muted'],
  ];
  function nowLocal() { const d = new Date(); d.setSeconds(0, 0); return new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
  async function recordEvent(payload, { onDone } = {}) {
    try {
      const r = await api('events.record', payload, { post: true });
      onDone?.(r); return r;
    } catch (e) {
      if (e.code === 'duplicate') {
        if (confirm(e.message + '\n\nZapsat přesto další záznam?')) return recordEvent({ ...payload, allow_duplicate: true }, { onDone });
        return null;
      }
      throw e;
    }
  }
  function feedSheet(animal, { source = 'manual', taskId = 0, after } = {}) {
    const s = sheet(`
      <div class="b1-feed-head">${animal.photo ? `<img src="${esc(animal.photo)}" alt="">` : ICON('animals')}<div><b>${esc(animal.name)}</b><small>${esc(animal.latin || animal.species || '')}</small>${animal.appetite?.alert ? `<em class="b1-flag warn">${animal.appetite.consecutive_refusals}× odmítnutí za sebou</em>` : ''}${animal.shed && ['window', 'observed'].includes(animal.shed.state) ? `<em class="b1-flag info">okno svlékání</em>` : ''}</div></div>
      <div class="b1-feed-results" role="radiogroup" aria-label="Výsledek krmení">${RESULTS.map(([k, l, ic, t]) => `<button type="button" class="b1-res is-${t}" data-res="${k}" role="radio" aria-checked="false">${ICON(ic)}<span>${l}</span></button>`).join('')}</div>
      <div class="b1-form-grid b1-feed-more">
        <label>Krmivo<input class="input" name="feed" value="${esc(animal.feed || '')}" autocomplete="off"></label>
        <label>Množství<input class="input" name="qty" inputmode="decimal" placeholder="1"></label>
        <label>Kdy<input class="input" type="datetime-local" name="performed_at" value="${nowLocal()}" max="${nowLocal()}"></label>
        <label class="b1-wide">Poznámka<input class="input" name="note" maxlength="500"></label>
      </div>
      <div class="b1-sheet-actions"><button type="button" class="btn" data-close>Zrušit</button><button type="button" class="btn primary" data-save disabled>Uložit</button></div>`, { title: 'Krmení · ' + animal.name });
    let res = null;
    $$('[data-res]', s.el).forEach((b) => b.addEventListener('click', () => {
      res = b.dataset.res; $$('[data-res]', s.el).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      $('[data-save]', s.el).disabled = false;
      $('.b1-feed-more', s.el).classList.toggle('is-min', res === 'in_shed' || res === 'not_fed');
    }));
    $('[data-save]', s.el).addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Ukládám…';
      const f = (n) => $(`[name=${n}]`, s.el)?.value?.trim() || '';
      try {
        const r = await recordEvent({ animal_id: animal.id, result: res, feed: res === 'eaten' || res === 'refused' ? f('feed') : '', qty: res === 'eaten' ? f('qty') : '', performed_at: f('performed_at').replace('T', ' '), note: f('note'), source, planner_task_id: taskId });
        if (r) { s.close(); toast(`Zapsáno: ${RESULTS.find((x) => x[0] === res)[1]} · ${animal.name}`); after?.(r); }
        else { btn.disabled = false; btn.textContent = 'Uložit'; }
      } catch (e) { btn.disabled = false; btn.textContent = 'Uložit'; toast(e.message, 'bad', 6000); }
    });
    return s;
  }
  // buttons anywhere: <button data-feed-animal='{"id":1,"name":"…"}'>
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-feed-animal]'); if (!b) return;
    e.preventDefault();
    let a; try { a = JSON.parse(b.dataset.feedAnimal); } catch { return; }
    feedSheet(a, { source: b.dataset.source || 'manual', taskId: +b.dataset.taskId || 0, after: () => { if (b.dataset.reload !== 'no') setTimeout(() => location.reload(), 500); } });
  });

  // forms that answer with a file download stay on the page: give them a fresh one-time token after submitting,
  // otherwise a second export from the same page is rejected as a duplicate submission
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-download]'); if (!f) return;
    setTimeout(() => { const t = f.querySelector('input[name=_submission]'); if (t) t.value = [...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join(''); }, 50);
  });

  // ------------------------------------------------------------------ QR scanner
  let jsqrP = null;
  async function qrScanner() {
    const s = sheet(`
      <div class="b1-qr-stage"><video playsinline muted></video><div class="b1-qr-frame" aria-hidden="true"><i></i></div><p class="b1-qr-status" aria-live="polite">Spouštím kameru…</p></div>
      <form class="b1-inline b1-qr-manual"><input class="input b1-grow" name="code" placeholder="Kód z štítku, např. IR:A:…" autocomplete="off" aria-label="Kód ručně"><button class="btn">Otevřít</button></form>
      <div class="b1-qr-result" hidden></div>`, { title: 'Skenovat QR', onClose: stop });
    $('[data-qr-open]')?.classList.add('is-active');
    const video = $('video', s.el), status = $('.b1-qr-status', s.el), out = $('.b1-qr-result', s.el);
    let stream = null, raf = 0, busy = false, canvas = null, detector = null, lastCode = '';
    function stop() { cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); stream = null; $('[data-qr-open]')?.classList.remove('is-active'); }
    async function handle(code) {
      if (busy || !code || code === lastCode) return; busy = true; lastCode = code;
      navigator.vibrate?.(40);
      status.textContent = 'Kód načten, ověřuji…';
      try {
        const r = await api('qr.resolve', { code });
        stop(); showResult(r);
      } catch (e) { status.textContent = e.message; busy = false; setTimeout(() => { lastCode = ''; }, 2500); }
    }
    function showResult(r) {
      $('.b1-qr-stage', s.el).hidden = true; $('.b1-qr-manual', s.el).hidden = true; out.hidden = false;
      if (r.kind === 'animal') {
        const a = { id: r.id, name: r.name, latin: r.latin, species: r.species, photo: r.photo, appetite: r.appetite, shed: r.shed, feed: r.feed };
        out.innerHTML = `<div class="b1-feed-head">${r.photo ? `<img src="${esc(r.photo)}" alt="">` : ICON('animals')}<div><b>${esc(r.name)}</b><small>${esc(r.latin || r.species)}</small>${r.locked ? '<em class="b1-flag warn">nad limit tarifu — jen pro čtení</em>' : ''}</div></div>
          <div class="b1-qr-actions">${r.locked ? '' : `<button type="button" class="btn primary" data-a="feed">${ICON('feeding')} Krmení</button><button type="button" class="btn" data-a="care">${ICON('care')} Jiný záznam</button>`}<a class="btn" href="${esc(r.url)}">${ICON('view')} Karta zvířete</a><button type="button" class="btn" data-a="again">${ICON('scan')} Skenovat další</button></div>`;
        $('[data-a=feed]', out)?.addEventListener('click', () => { s.close(); feedSheet(a, { source: 'qr', after: () => qrScanner() }); });
        $('[data-a=care]', out)?.addEventListener('click', () => { location.href = 'quick.php?animal_id=' + r.id + '&source=qr'; });
        if (r.action === 'FEED' && !r.locked) { s.close(); feedSheet(a, { source: 'qr', after: () => qrScanner() }); return; }
      } else {
        out.innerHTML = `<div class="b1-feed-head">${ICON('habitat')}<div><b>${esc(r.name)}</b><small>Ubikace · ${r.animals.length} ${r.animals.length === 1 ? 'zvíře' : 'zvířat'}</small></div></div>
          <div class="b1-qr-list">${r.animals.map((x) => `<button type="button" class="btn" data-feed="${x.id}" data-name="${esc(x.jmeno_kod)}">${ICON('feeding')} ${esc(x.jmeno_kod)}</button>`).join('') || '<p class="muted">Ubikace je prázdná.</p>'}</div>
          <div class="b1-qr-actions"><a class="btn" href="${esc(r.url)}">${ICON('habitat')} Detail ubikace</a><button type="button" class="btn" data-a="again">${ICON('scan')} Skenovat další</button></div>`;
        $$('[data-feed]', out).forEach((b) => b.addEventListener('click', () => { s.close(); feedSheet({ id: +b.dataset.feed, name: b.dataset.name }, { source: 'qr', after: () => qrScanner() }); }));
      }
      $('[data-a=again]', out)?.addEventListener('click', () => { s.close(); qrScanner(); });
    }
    $('.b1-qr-manual', s.el).addEventListener('submit', (e) => { e.preventDefault(); lastCode = ''; handle(e.currentTarget.code.value.trim()); });
    if (!navigator.mediaDevices?.getUserMedia) { status.textContent = 'Tento prohlížeč neumí použít kameru (je potřeba HTTPS). Zadejte kód ručně.'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      status.textContent = e.name === 'NotAllowedError' ? 'Přístup ke kameře byl zamítnut. Povolte kameru v nastavení prohlížeče, nebo zadejte kód ručně.' : e.name === 'NotFoundError' ? 'Zařízení nemá kameru. Zadejte kód ručně.' : 'Kameru se nepodařilo spustit (' + e.name + '). Zadejte kód ručně.';
      return;
    }
    if (!s.root.isConnected) { stop(); return; }
    video.srcObject = stream; await video.play().catch(() => {});
    if ('BarcodeDetector' in window) { try { if ((await BarcodeDetector.getSupportedFormats()).includes('qr_code')) detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch {} }
    if (!detector) { jsqrP ||= loadScript('assets/vendor/qr/jsQR.min.js'); try { await jsqrP; } catch { status.textContent = 'Dekodér QR se nepodařilo načíst. Zadejte kód ručně.'; return; } canvas = document.createElement('canvas'); }
    status.textContent = 'Namiřte kameru na QR štítek zvířete nebo ubikace.';
    let last = 0;
    const tick = async (t) => {
      if (!stream) return;
      raf = requestAnimationFrame(tick);
      if (t - last < 180 || video.readyState < 2 || busy) return; last = t;
      try {
        if (detector) { const c = await detector.detect(video); if (c[0]?.rawValue) handle(c[0].rawValue); }
        else {
          const w = 480, h = Math.round(video.videoHeight / video.videoWidth * w) || 360;
          canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, w, h);
          const r = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' }); if (r?.data) handle(r.data);
        }
      } catch {}
    };
    raf = requestAnimationFrame(tick);
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-qr-open]'); if (!b) return; e.preventDefault(); qrScanner(); });

  // ------------------------------------------------------------------ taxonomy autocomplete (Latin first)
  function taxonField(input) {
    const wrap = document.createElement('div'); wrap.className = 'b1-ac'; input.after(wrap); wrap.prepend(input);
    const list = document.createElement('div'); list.className = 'b1-ac-list'; list.hidden = true; list.setAttribute('role', 'listbox'); wrap.append(list);
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false'); input.autocomplete = 'off';
    const form = input.form;
    const set = (name, v) => {
      const f = form?.querySelector(`[name="${name}"]`); if (!f || v === undefined) return;
      if (f.tagName === 'SELECT' && v && ![...f.options].some((o) => o.value === String(v))) f.add(new Option(input.value, v));
      f.value = v ?? ''; f.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let items = [], act = -1, t = 0, seq = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); act = -1; };
    const choose = async (it) => {
      close();
      if (it.create) {
        try { const r = await api('taxonomy.create', { latin: input.value.trim() }, { post: true }); it = { id: r.id, latin: r.taxon.latinsky_nazev, czech: r.taxon.cesky_nazev || '', english: r.taxon.anglicky_nazev || '', group: r.taxon.kategorie_chovu || '' }; toast('Nový taxon uložen: ' + it.latin); }
        catch (e) { toast(e.message, 'bad', 6000); return; }
      } else if (!it.id) {
        try { const r = await api('taxonomy.create', { latin: it.latin, czech: it.czech, english: it.english, group: it.group }, { post: true }); it.id = r.id; } catch (e) { toast(e.message, 'bad'); return; }
      }
      const prevLatin = input.dataset.prevLatin || '';
      input.value = it.latin; input.dataset.prevLatin = it.latin;
      set(input.dataset.taxonId || 'druh_id', it.id);
      const czf = form?.querySelector(`[name="${input.dataset.taxonCzech || 'druh'}"]`);
      if (czf && (!czf.value.trim() || czf.value === prevLatin)) set(input.dataset.taxonCzech || 'druh', it.czech || it.latin);
      set(input.dataset.taxonLatin || 'latinsky_nazev', it.latin);
      input.dispatchEvent(new CustomEvent('taxon:selected', { detail: it, bubbles: true }));
    };
    const render = () => {
      const q = input.value.trim();
      const exact = items.some((x) => x.latin.toLowerCase() === q.toLowerCase());
      const rows = items.map((x, i) => `<div class="b1-ac-row ${i === act ? 'is-act' : ''}" role="option" data-i="${i}"><i>${esc(x.latin)}</i>${x.czech || x.english ? `<small>${esc([x.czech, x.english].filter(Boolean).join(' · '))}</small>` : ''}${x.source === 'catalog' ? '<em>v katalogu</em>' : ''}</div>`);
      if (q.length >= 3 && !exact) rows.push(`<div class="b1-ac-row is-create ${act === items.length ? 'is-act' : ''}" role="option" data-i="${items.length}">+ Vytvořit taxon „<i>${esc(q)}</i>“<small>Latinský název je povinný, český volitelný</small></div>`);
      list.innerHTML = rows.join(''); list.hidden = !rows.length; input.setAttribute('aria-expanded', String(!list.hidden));
    };
    const all = () => { const q = input.value.trim(); const exact = items.some((x) => x.latin.toLowerCase() === q.toLowerCase()); return q.length >= 3 && !exact ? [...items, { create: true }] : items; };
    input.addEventListener('input', () => {
      clearTimeout(t); const q = input.value.trim();
      if (q.length < 2) { items = []; close(); return; }
      t = setTimeout(async () => { const my = ++seq; try { const r = await api('taxonomy.search', { q, limit: 10 }); if (my !== seq) return; items = r.items; act = -1; render(); } catch {} }, 160);
    });
    input.addEventListener('keydown', (e) => {
      const n = all().length; if (list.hidden || !n) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % n; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); act = (act - 1 + n) % n; render(); }
      else if (e.key === 'Enter' && act >= 0) { e.preventDefault(); choose(all()[act]); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', (e) => { const r = e.target.closest('[data-i]'); if (!r) return; e.preventDefault(); choose(all()[+r.dataset.i]); });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }
  $$('[data-taxon-input]').forEach(taxonField);

  // ------------------------------------------------------------------ keyboard shortcuts (not while typing)
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input,textarea,select,[contenteditable]') || $('.b1-sheet-ov')) return;
    const k = e.key.toLowerCase();
    if (k === 'q') { e.preventDefault(); qrScanner(); }
    else if (k === 'r') { e.preventDefault(); location.href = 'quick.php'; }
    else if (k === 'v') { const v = $('[data-voice-open]'); if (v) { e.preventDefault(); v.click(); } }
  });

  window.IR = Object.assign(window.IR || {}, { api, toast, sheet, feedSheet, recordEvent, qrScanner, renderQrs, taxonField, esc, ICON });
})();

/* Enclosure clone (BETA1-08): N copies of an enclosure's setup (not animals / history). */
(() => {
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-clone-cage]'); if (!b || !window.IR) return;
    e.preventDefault();
    const { sheet, esc } = window.IR;
    const csrf = document.querySelector('[data-csrf]')?.dataset.csrf || '';
    const s = sheet(`<form method="post" action="habitats.php" class="b1-form-grid" style="padding:0">
      <input type="hidden" name="_csrf" value="${esc(csrf)}"><input type="hidden" name="_submission" value="${[...crypto.getRandomValues(new Uint8Array(16))].map((x) => x.toString(16).padStart(2, '0')).join('')}"><input type="hidden" name="action" value="clone-cage"><input type="hidden" name="id" value="${esc(b.dataset.cloneCage)}">
      <p class="b1-wide muted" style="margin:0">Zkopíruje se typ, rozměry (Š × H × V), klima, technika, pravidla péče a vybavení z Habitat Studia. Zvířata, historie a QR kód se nekopírují — každá kopie dostane vlastní identitu.</p>
      <label>Počet kopií<input class="input" type="number" name="count" min="1" max="50" value="1" required></label>
      <label class="b1-check"><input type="checkbox" name="no_rack" value="1"> mimo sestavu</label>
      <label class="b1-wide">Názvy kopií (volitelné, každý na nový řádek)<textarea class="input" name="names" rows="3" placeholder="${esc(b.dataset.name)} (2)"></textarea></label>
      <div class="b1-wide b1-sheet-actions"><button type="button" class="btn" data-close>Zrušit</button><button class="btn primary">Vytvořit kopie</button></div></form>`, { title: 'Klonovat · ' + b.dataset.name });
  });
})();

/* Group feeding session (BETA1-01): every member gets its own result in ONE batch (all-or-nothing). */
(() => {
  const R = [['eaten', 'Snědlo'], ['refused', 'Odmítlo'], ['in_shed', 'Ve svleku'], ['not_fed', 'Nekrmeno'], ['skip', 'Vynechat']];
  async function groupSession(gid, taskId = 0) {
    const { api, sheet, esc, toast, ICON } = window.IR;
    let data; try { data = await api('groups.members', { group_id: gid }); } catch (e) { toast(e.message, 'bad'); return; }
    const m = data.members;
    const now = new Date(); now.setSeconds(0, 0); const local = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const s = sheet(`
      <div class="b1-gs-top b1-form-grid" style="padding:0 0 10px">
        <label>Krmivo<input class="input" name="feed" value="${esc(m[0]?.feed || '')}"></label>
        <label>Kusů / jedinec<input class="input" name="qty" inputmode="decimal" placeholder="1"></label>
        <label>Kdy<input class="input" type="datetime-local" name="when" value="${local}" max="${local}"></label>
        <div class="b1-gs-all"><span class="muted">Všem:</span>${R.slice(0, 4).map(([k, l]) => `<button type="button" class="btn small" data-all="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="b1-gs-list">${m.map((a) => `<div class="b1-gs-row ${a.locked ? 'is-locked' : ''}" data-id="${a.id}">
          <span class="b1-gs-photo">${a.photo ? `<img src="${esc(a.photo)}" alt="">` : ICON('animals')}</span>
          <span class="b1-gs-name"><b>${esc(a.name)}</b><small>${esc([a.code, a.sex].filter(Boolean).join(' · '))}${a.alert ? ` · <em class="warn">${a.refusals}× odmítnutí</em>` : ''}${['window', 'observed'].includes(a.shed) ? ' · <em class="info">svlékání</em>' : ''}</small></span>
          <span class="b1-seg" role="radiogroup" aria-label="Výsledek ${esc(a.name)}">${R.map(([k, l]) => `<button type="button" data-r="${k}" role="radio" aria-checked="${(a.locked ? 'skip' : (['window', 'observed'].includes(a.shed) ? 'in_shed' : 'eaten')) === k}" ${a.locked && k !== 'skip' ? 'disabled' : ''}>${l}</button>`).join('')}</span>
        </div>`).join('') || '<p class="muted">Skupina nemá aktivní jedince.</p>'}</div>
      <div class="b1-sheet-actions"><span class="b1-gs-sum muted" data-sum></span><button type="button" class="btn" data-close>Zrušit</button><button type="button" class="btn primary" data-save>Uložit krmení skupiny</button></div>`, { title: 'Krmení skupiny · ' + data.group.name, wide: true });
    const el = s.el;
    const sum = () => { const c = {}; el.querySelectorAll('.b1-gs-row').forEach((r) => { const v = r.querySelector('[aria-checked=true]')?.dataset.r; c[v] = (c[v] || 0) + 1; }); el.querySelector('[data-sum]').textContent = R.filter(([k]) => c[k]).map(([k, l]) => `${l} ${c[k]}`).join(' · '); };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]'); if (b && !b.disabled) { b.parentElement.querySelectorAll('[data-r]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); sum(); }
      const all = e.target.closest('[data-all]'); if (all) { el.querySelectorAll('.b1-gs-row:not(.is-locked) [data-r="' + all.dataset.all + '"]').forEach((x) => x.click()); }
    });
    sum();
    el.querySelector('[data-save]').addEventListener('click', async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true; btn.textContent = 'Ukládám…';
      const results = {}; el.querySelectorAll('.b1-gs-row').forEach((r) => { results[r.dataset.id] = r.querySelector('[aria-checked=true]')?.dataset.r || 'skip'; });
      const f = (n) => el.querySelector(`[name=${n}]`).value.trim();
      try {
        const r = await api('events.group', { group_id: gid, result: 'eaten', results, feed: f('feed'), qty_each: f('qty'), performed_at: f('when').replace('T', ' '), source: taskId ? 'planner' : 'manual', planner_task_id: taskId || 0 }, { post: true });
        s.close(); toast('Uloženo jednou dávkou: ' + r.text, 'ok', 5000); setTimeout(() => location.reload(), 900);
      } catch (e) { btn.disabled = false; btn.textContent = 'Uložit krmení skupiny'; toast(e.message, 'bad', 7000); }
    });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-group-feed]'); if (!b) return; e.preventDefault(); groupSession(+b.dataset.groupFeed, +b.dataset.taskId || 0); });
  window.IR && (window.IR.groupSession = groupSession);
})();
