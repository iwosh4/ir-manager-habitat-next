/* IR Manager — hands-free voice dialogue (CZ / EN / DE).
   Listen → parse (voice-core) → ask for what is missing / ambiguous → read back (TTS) → "ano" → save via
   api events.record (source "voice") → "Uloženo" → listen again. Nothing is saved without confirmation.
   Works without SpeechRecognition through the typed command field (same dialogue, same parser). */
(() => {
  'use strict';
  const V = window.IRVoiceCore, IR = window.IR;
  if (!V || !IR) return;
  const { esc, api, ICON } = IR;
  const LANGS = { cs: ['cs-CZ', 'Čeština'], en: ['en-US', 'English'], de: ['de-DE', 'Deutsch'] };
  const store = { get(k, d) { try { return localStorage.getItem('ir.voice.' + k) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('ir.voice.' + k, v); } catch {} } };
  let vocab = null;

  function mount(host, { onClose } = {}) {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const S = { lang: store.get('lang', 'cs'), hands: store.get('hands', '1') === '1', listening: false, speaking: false, rec: null, draft: {}, stage: 'idle', last: '', wake: null, alive: true };
    host.innerHTML = `
      <div class="b1-voice">
        <div class="b1-voice-top">
          <button type="button" class="b1-mic" data-mic aria-pressed="false" aria-label="Mikrofon"><svg class="ir-icon" aria-hidden="true"><use href="assets/icons/sprite.svg#mic"></use></svg><i class="b1-wave" aria-hidden="true"><b></b><b></b><b></b><b></b><b></b></i></button>
          <div class="b1-voice-state"><strong data-state>Připraveno</strong><small data-hint>${Rec ? 'Klepněte na mikrofon a mluvte. Např. „Python regius snědl“.' : 'Tento prohlížeč neumí rozpoznávat řeč — napište příkaz do pole níže (dialog funguje stejně).'}</small></div>
          <div class="b1-voice-opts">
            <select class="input" data-lang aria-label="Jazyk">${Object.entries(LANGS).map(([k, [, l]]) => `<option value="${k}" ${k === S.lang ? 'selected' : ''}>${l}</option>`).join('')}</select>
            <label class="b1-check"><input type="checkbox" data-hands ${S.hands ? 'checked' : ''}> Bez rukou</label>
          </div>
        </div>
        <div class="b1-voice-heard" aria-live="polite"><span data-heard>—</span></div>
        <div class="b1-voice-draft" data-draft hidden></div>
        <div class="b1-voice-choices" data-choices hidden></div>
        <form class="b1-inline b1-voice-type" data-type><input class="input b1-grow" name="t" placeholder="Napište příkaz, např. „Morelia spilota odmítla“" autocomplete="off" aria-label="Textový příkaz"><button class="btn">Odeslat</button></form>
        <ol class="b1-voice-log" data-log aria-label="Průběh dialogu"></ol>
      </div>`;
    const $ = (s) => host.querySelector(s);
    const log = (who, text) => { const li = document.createElement('li'); li.className = 'is-' + who; li.textContent = text; $('[data-log]').prepend(li); while ($('[data-log]').children.length > 30) $('[data-log]').lastChild.remove(); };
    const setState = (t) => { $('[data-state]').textContent = t; };
    const tt = () => V.T[S.lang];

    function speak(text, then) {
      S.last = text; log('ir', text); setState(text);
      const synth = window.speechSynthesis;
      if (!synth || !S.alive) { then?.(); return; }
      stopRec();
      S.speaking = true;
      const u = new SpeechSynthesisUtterance(text); u.lang = LANGS[S.lang][0]; u.rate = 1.02;
      const v = synth.getVoices().find((x) => x.lang?.toLowerCase().startsWith(S.lang)); if (v) u.voice = v;
      let done = false; const fin = () => { if (done) return; done = true; S.speaking = false; then?.(); };
      u.onend = fin; u.onerror = fin; setTimeout(fin, 1200 + text.length * 90);
      synth.cancel(); synth.speak(u);
    }
    const listenAfter = () => { if (S.hands && S.alive && Rec) startRec(); };

    // ---------------------------------------------------------------- recognition
    function startRec() {
      if (!Rec || S.speaking || !S.alive) return;
      stopRec();
      const r = new Rec(); S.rec = r;
      r.lang = LANGS[S.lang][0]; r.interimResults = true; r.continuous = false; r.maxAlternatives = 3;
      r.onresult = (e) => {
        const res = e.results[e.results.length - 1];
        $('[data-heard]').textContent = res[0].transcript;
        if (res.isFinal) {
          // choose the alternative that parses best (Latin names are often the 2nd/3rd alternative)
          const alts = [...res].map((a) => a.transcript);
          let best = alts[0], bestScore = -1;
          for (const a of alts) { const p = V.parse(a, ctx()); const sc = (p.intent !== 'unknown' ? 1 : 0) + (p.animal ? 1 : 0) + (p.confidence || 0); if (sc > bestScore) { best = a; bestScore = sc; } }
          handle(best);
        }
      };
      r.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { S.listening = false; ui(); setState('Mikrofon není povolen. Povolte jej v prohlížeči, nebo pište do pole.'); }
        else if (e.error === 'network') setState('Rozpoznávání řeči vyžaduje připojení k internetu.');
      };
      r.onend = () => { S.rec = null; if (S.listening && !S.speaking && S.alive) setTimeout(() => S.listening && !S.speaking && !S.rec && startRec(), 250); ui(); };
      try { r.start(); ui(); } catch {}
    }
    function stopRec() { try { S.rec?.abort(); } catch {} S.rec = null; }
    async function wakeLock(on) { try { if (on && 'wakeLock' in navigator) S.wake = await navigator.wakeLock.request('screen'); else { await S.wake?.release(); S.wake = null; } } catch {} }
    function ui() {
      const mic = $('[data-mic]'); mic.classList.toggle('is-on', S.listening); mic.classList.toggle('is-hot', !!S.rec); mic.setAttribute('aria-pressed', String(S.listening));
      host.classList.toggle('is-speaking', S.speaking);
    }

    // ---------------------------------------------------------------- dialogue
    const ctx = () => ({ animals: vocab?.animals || [], lang: S.lang, pending: S.stage !== 'idle' ? { ...S.draft, candidates: S.stage === 'choose' ? S.draft.candidates : null } : null });
    function renderDraft() {
      const d = S.draft, el = $('[data-draft]');
      if (!d.animal && !d.type && !d.candidates) { el.hidden = true; return; }
      el.hidden = false;
      el.innerHTML = `<span class="b1-chip ${d.animal ? 'ok' : 'miss'}">${ICON('animals')} ${esc(d.animal ? d.animal.name + (d.animal.code ? ' · ' + d.animal.code : '') : d.candidates ? d.candidates.length + ' možnosti' : 'zvíře?')}</span>
        <span class="b1-chip ${d.type ? 'ok' : 'miss'}">${esc(d.type || 'akce?')}</span>
        ${d.type === 'Krmení' ? `<span class="b1-chip ${d.result ? 'ok' : 'miss'}">${esc(d.result ? V.RES_LABEL.cs[d.result] : 'výsledek?')}</span>` : ''}
        ${d.value !== null && d.value !== undefined ? `<span class="b1-chip ok">${esc(String(d.value) + (d.unit ? ' ' + d.unit : ''))}</span>` : ''}`;
      const ch = $('[data-choices]');
      if (S.stage === 'choose' && d.candidates) {
        ch.hidden = false;
        ch.innerHTML = d.candidates.map((a, i) => `<button type="button" class="btn" data-pick="${i}"><b>${i + 1}.</b> ${esc(a.name)}${a.code ? ' · ' + esc(a.code) : ''}${a.enclosure ? ' <small>(' + esc(a.enclosure) + ')</small>' : ''}</button>`).join('');
        ch.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { S.draft.animal = S.draft.candidates[+b.dataset.pick]; S.draft.candidates = null; advance(); }));
      } else ch.hidden = true;
    }
    function reset() { S.draft = {}; S.stage = 'idle'; renderDraft(); }
    function merge(p) {
      const d = S.draft;
      if (p.animal) { d.animal = p.animal; d.candidates = null; }
      else if (p.candidates && !d.animal) d.candidates = p.candidates;
      if (p.type) d.type = p.type;
      if (p.result) { d.result = p.result; d.type = 'Krmení'; }
      if (p.value !== null && p.value !== undefined) { d.value = p.value; if (p.unit) d.unit = p.unit; }
      if (p.feed) d.feed = p.feed;
    }
    function advance() {
      const d = S.draft, T = tt();
      renderDraft();
      if (!d.animal && d.candidates) { S.stage = 'choose'; renderDraft(); const names = d.candidates.map((a, i) => `${i + 1}. ${a.name}${a.code ? ' ' + a.code : ''}`).join(', '); return speak(T.ambiguous(d.candidates.length) + ' ' + names, listenAfter); }
      if (!d.animal) { S.stage = 'need'; return speak(T.which, listenAfter); }
      if (!d.type) { S.stage = 'need'; return speak(T.what, listenAfter); }
      if (d.type === 'Krmení' && !d.result) { S.stage = 'need'; return speak(T.what, listenAfter); }
      if (d.type === 'Vážení' && (d.value === null || d.value === undefined)) { S.stage = 'need'; return speak(T.value, listenAfter); }
      S.stage = 'confirm';
      speak(T.confirm(V.summary(d, S.lang)), listenAfter);
    }
    async function save(allowDup = false) {
      const d = S.draft, T = tt();
      const payload = { animal_id: d.animal.id, source: 'voice', allow_duplicate: allowDup };
      if (d.type === 'Krmení') { payload.result = d.result; if (d.result === 'eaten' && d.value) payload.qty = d.value; if (d.feed) payload.feed = d.feed; }
      else { payload.type = d.type; if (d.value !== null && d.value !== undefined) payload.value = String(d.value) + (d.unit ? ' ' + d.unit : (d.type === 'Vážení' ? ' g' : '')); }
      setState('Ukládám…');
      try {
        await api('events.record', payload, { post: true });
        IR.toast('Hlasem zapsáno: ' + V.summary(d, 'cs'));
        reset(); speak(T.saved, listenAfter);
      } catch (e) {
        if (e.code === 'duplicate') { S.stage = 'dup'; return speak(T.dup, listenAfter); }
        reset(); speak(T.err + ' ' + e.message, listenAfter);
      }
    }
    function handle(text) {
      text = String(text || '').trim(); if (!text) return;
      log('you', text); $('[data-heard]').textContent = text;
      const T = tt();
      const p = V.parse(text, ctx());
      switch (p.intent) {
        case 'stop': speak(T.bye); S.listening = false; stopRec(); wakeLock(false); ui(); return;
        case 'cancel': reset(); return speak(T.cancelled, listenAfter);
        case 'repeat': return speak(S.last || T.hello, listenAfter);
        case 'choose': if (S.stage === 'choose' && S.draft.candidates?.[p.index]) { S.draft.animal = S.draft.candidates[p.index]; S.draft.candidates = null; return advance(); } break;
        case 'yes': if (S.stage === 'confirm') return save(false); if (S.stage === 'dup') return save(true); break;
        case 'no': if (S.stage === 'dup') { reset(); return speak(T.cancelled, listenAfter); } if (S.stage === 'confirm') { S.stage = 'need'; return speak(S.lang === 'cs' ? 'Co mám opravit?' : S.lang === 'de' ? 'Was soll ich korrigieren?' : 'What should I correct?', listenAfter); } break;
      }
      if (S.stage === 'choose' && p.intent !== 'record') {
        // the name/code of one of the offered candidates
        const r = V.rankAnimals(text, S.draft.candidates)[0];
        if (r && r.s > 0.75) { S.draft.animal = r.a; S.draft.candidates = null; return advance(); }
      }
      if (['record', 'correct', 'value'].includes(p.intent) || (p.intent === 'unknown' && S.stage !== 'idle' && (p.value !== null))) {
        // a complete new command while confirming replaces the draft; otherwise it fills / corrects it
        if (S.stage === 'idle' || (p.intent === 'record' && p.animal && p.type && S.stage === 'confirm')) S.draft = {};
        merge(p); return advance();
      }
      speak(T.again, listenAfter);
    }

    // ---------------------------------------------------------------- wiring
    $('[data-mic]').addEventListener('click', async () => {
      if (!Rec) { $('[data-type] input').focus(); return; }
      S.listening = !S.listening;
      if (S.listening) { await wakeLock(true); if (S.stage === 'idle') speak(tt().hello, () => startRec()); else startRec(); }
      else { stopRec(); window.speechSynthesis?.cancel(); await wakeLock(false); setState('Pozastaveno'); }
      ui();
    });
    $('[data-lang]').addEventListener('change', (e) => { S.lang = e.target.value; store.set('lang', S.lang); if (S.rec) { stopRec(); startRec(); } });
    $('[data-hands]').addEventListener('change', (e) => { S.hands = e.target.checked; store.set('hands', S.hands ? '1' : '0'); });
    $('[data-type]').addEventListener('submit', (e) => { e.preventDefault(); const i = e.currentTarget.t; const v = i.value; i.value = ''; handle(v); });
    const loadVocab = async () => { if (vocab) return; setState('Načítám zvířata…'); try { vocab = await api('voice.vocabulary'); setState(`Připraveno · ${vocab.animals.length} zvířat`); } catch (e) { setState(e.message); } };
    loadVocab();
    return { destroy() { S.alive = false; S.listening = false; stopRec(); window.speechSynthesis?.cancel(); wakeLock(false); onClose?.(); }, handle, state: S };
  }

  window.IRVoice = { mount };
  // header / mobile buttons open the dialogue in a sheet; voice.php hosts it inline
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-voice-open]'); if (!b || document.querySelector('[data-voice-inline]')) return;
    e.preventDefault();
    let inst = null;
    const s = IR.sheet('<div data-voice-host></div>', { title: 'Hlasové ovládání', onClose: () => inst?.destroy() });
    inst = mount(s.el.querySelector('[data-voice-host]'));
  });
  const inline = document.querySelector('[data-voice-inline]');
  if (inline) window.IRVoice.inline = mount(inline);
})();
