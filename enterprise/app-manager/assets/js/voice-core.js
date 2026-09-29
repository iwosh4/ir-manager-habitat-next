/* IR Manager voice core — pure parsing (no DOM), CZ / EN / DE.
   parse(text, ctx) → { intent, animal|candidates, type, result, value, unit, feed, command, confidence }.
   Latin names are first-class: "Python regius", "P. regius", "regius", genus alone when unique; phonetic
   matching tolerates recogniser spelling ("pajton", "korelofus"). Ambiguity is never guessed: the caller asks. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.IRVoiceCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const norm = (s) => String(s || '').replace(/(\d),(\d)/g, '$1.$2').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[“”"„'’]/g, ' ').replace(/[^a-z0-9\s./-]/g, ' ').replace(/\s+/g, ' ').trim();
  const phon = (s) => norm(s).replace(/ph/g, 'f').replace(/th/g, 't').replace(/ch/g, 'k').replace(/ae|oe/g, 'e').replace(/qu/g, 'kv').replace(/x/g, 'ks').replace(/y/g, 'i').replace(/w/g, 'v').replace(/c(?=[aou])/g, 'k').replace(/c/g, 'k').replace(/(.)\1+/g, '$1').replace(/j/g, 'i');
  function lev(a, b) {
    if (a === b) return 0; if (!a.length) return b.length; if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[b.length];
  }
  const sim = (a, b) => { if (!a || !b) return 0; const r = 1 - lev(a, b) / Math.max(a.length, b.length); const p = 1 - lev(phon(a), phon(b)) / Math.max(phon(a).length, phon(b).length, 1); return Math.max(r, p); };

  // ------------------------------------------------------------------ lexicon
  const L = {
    yes: /^(ano|jo|jj|ok|okej|potvrzuji|potvrdit|uloz(it)?|spravne|presne|yes|yeah|yep|correct|save|confirm|ja|jawohl|richtig|speichern|bestatigen|genau)$/,
    no: /^(ne|nee|neni|spatne|no|nope|wrong|nein|falsch)$/,
    cancel: /\b(zrus(it)?|zrusit to|stornovat|konec zaznamu|cancel|abort|abbrechen|stornieren)\b/,
    repeat: /\b(opakuj|zopakuj|opakovat|znovu|repeat|again|say again|wiederhol\w*|nochmal)\b/,
    correct: /\b(oprav(it)?|zmen(it)?|oprava|correct(ion)?|change|fix|korrigier\w*|andern|anders)\b/,
    stop: /^(stop|konec|ukoncit|hotovo konec|vypnout|end|finish|quit|ende|beenden|aus)$/,
    next: /^(dalsi|pokracuj|next|continue|weiter|nachste)$/,
    ordinal: [[/\b(prvni|jedna|jednicka|first|one|erste|eins)\b/, 0], [/\b(druh[ya]|druhe|dva|dvojka|second|two|zweite|zwei)\b/, 1], [/\b(treti|tri|trojka|third|three|dritte|drei)\b/, 2], [/\b(ctvrt[ay]|ctyri|fourth|four|vierte|vier)\b/, 3]],
  };
  // feeding results (the only four) — checked before generic feeding
  const RESULTS = [
    ['in_shed', /\b(ve svleku|pred svlekem|svleka se|in (the )?shed|in blue|shedding now|in hautung|hautet sich)\b/],
    ['not_fed', /\b(nekrmeno|nekrmit|nekrmil|nekrmila|nekrmim|vynech\w*|preskoc\w*|not fed|skip(ped)?|nicht gefuttert|ausgelassen|uberspr\w*)\b/],
    ['refused', /\b(odmitl[ao]?|odmitnuti|odmita|neprijal[ao]?|nezral[ao]?|nesezral[ao]?|nechce|nevzal[ao]?|refus\w*|declin\w*|did not eat|didn t eat|verweiger\w*|nicht gefressen|frisst nicht)\b/],
    ['eaten', /\b(snedl[ao]?|sezral[ao]?|zral[ao]?|prijal[ao]?|vzal[ao]?|nakrmen[ao]?|nakrmil[ao]?|nakrm\w*|krmeni|krmit|ate|eaten|took it|fed|feeding|gefressen|gefuttert|futter\w*|fressen)\b/],
  ];
  const TYPES = [
    ['Vážení', /\b(vaz(eni|i|il[ao]?)|zvaz\w*|vaha|hmotnost|navazeno|weigh\w*|weight|gewicht|gewogen|wiegen)\b/],
    ['Výměna vody', /\b(vymen\w* vod\w*|nova voda|cerstva voda|voda|water( change)?|fresh water|wasser(wechsel)?)\b/],
    ['Čištění', /\b(cisten\w*|vycist\w*|uklid\w*|uklizeno|udrzb\w*|clean\w*|reinig\w*|sauber)\b/],
    ['Svlek', /\b(svlek(l[ao]?)?|svlecen\w*|svlekani|shed complete|shed|moulted|molted|hautung|gehautet)\b/],
    ['Rosení', /\b(rosen\w*|oros\w*|rosit|porosit|mlzen\w*|zamlz\w*|mist\w*|spray\w*|spruh\w*|bespruh\w*|nebel)\b/],
    ['Zdravotní kontrola', /\b(zdravotni kontrol\w*|kontrola zdravi|prohlidk\w*|veterin\w*|health check|checkup|vet|gesundheit\w*|tierarzt)\b/],
    ['Kálení', /\b(kalen\w*|vykal\w*|trus|feces|faeces|poop|kot)\b/],
  ];
  // spoken numbers (CZ / EN / DE) up to 9999, plus decimals "12,5" / "dvanact cela pet"
  const NUM = {
    nula: 0, zero: 0, null: 0, jedna: 1, jeden: 1, jedno: 1, one: 1, eins: 1, ein: 1, eine: 1, dva: 2, dve: 2, two: 2, zwei: 2, tri: 3, three: 3, drei: 3, ctyri: 4, four: 4, vier: 4, pet: 5, five: 5, funf: 5,
    sest: 6, six: 6, sechs: 6, sedm: 7, seven: 7, sieben: 7, osm: 8, eight: 8, acht: 8, devet: 9, nine: 9, neun: 9, deset: 10, ten: 10, zehn: 10, jedenact: 11, eleven: 11, elf: 11, dvanact: 12, twelve: 12, zwolf: 12,
    trinact: 13, thirteen: 13, dreizehn: 13, ctrnact: 14, fourteen: 14, vierzehn: 14, patnact: 15, fifteen: 15, funfzehn: 15, sestnact: 16, sixteen: 16, sechzehn: 16, sedmnact: 17, seventeen: 17, siebzehn: 17,
    osmnact: 18, eighteen: 18, achtzehn: 18, devatenact: 19, nineteen: 19, neunzehn: 19, dvacet: 20, twenty: 20, zwanzig: 20, tricet: 30, thirty: 30, dreissig: 30, ctyricet: 40, forty: 40, vierzig: 40, padesat: 50, fifty: 50, funfzig: 50,
    sedesat: 60, sixty: 60, sechzig: 60, sedmdesat: 70, seventy: 70, siebzig: 70, osmdesat: 80, eighty: 80, achtzig: 80, devadesat: 90, ninety: 90, neunzig: 90,
    sto: 100, hundred: 100, hundert: 100, dveste: 200, trista: 300, ctyrista: 400, petset: 500, sestset: 600, sedmset: 700, osmset: 800, devetset: 900, tisic: 1000, thousand: 1000, tausend: 1000,
  };
  function numberIn(t) {
    t = t.replace(/(ein|zwei|drei|vier|funf|sechs|sieben|acht|neun)und(zwanzig|dreissig|vierzig|funfzig|sechzig|siebzig|achtzig|neunzig)/g, '$1 und $2');
    const m = t.match(/(\d+(?:[.,]\d+)?)/); if (m) return parseFloat(m[1].replace(',', '.'));
    let total = 0, cur = 0, seen = false, dec = null;
    for (const w of t.split(' ')) {
      if (w === 'cela' || w === 'point' || w === 'komma') { dec = ''; continue; }
      if (NUM[w] === undefined) { if (seen && w !== 'a' && w !== 'and' && w !== 'und') break; continue; }
      seen = true; const v = NUM[w];
      if (dec !== null) { dec += String(v); continue; }
      if (v === 100 && cur) cur *= 100; else if (v === 1000) { total += (cur || 1) * 1000; cur = 0; } else cur += v;
    }
    if (!seen) return null;
    const n = total + cur; return dec ? parseFloat(n + '.' + dec) : n;
  }
  const UNIT = /\b(g|gram\w*|gramu|kg|kilo\w*|ks|kus\w*|pcs|pieces?|stuck|ml|cm|mm)\b/;

  // ------------------------------------------------------------------ animal resolution
  function animalKeys(a) {
    const k = [];
    const add = (v, w = 1) => { v = norm(v); if (v && v.length > 1) k.push([v, w]); };
    add(a.name, 1); add(a.code, 1); (a.aliases || []).forEach((x) => add(x, 1.02));
    const lat = norm(a.latin); if (lat) {
      const p = lat.split(' ');
      add(lat, 0.97);
      if (p.length > 1) { add(p[0] + ' ' + p[1], 0.96); add(p[0][0] + ' ' + p[1], 0.95); add(p[0][0] + '. ' + p[1], 0.95); add(p[1], 0.9); if (p[2]) add(p[2], 0.88); }
      add(p[0], 0.8);
    }
    add(a.species, 0.9);
    return k;
  }
  /** Score every animal against the utterance; returns sorted [{a, s}]. */
  function rankAnimals(text, animals) {
    const t = norm(text), words = t.split(' ');
    const grams = new Set(); for (let n = 1; n <= 5; n++) for (let i = 0; i + n <= words.length; i++) grams.add(words.slice(i, i + n).join(' '));
    const out = [];
    for (const a of animals) {
      let best = 0;
      for (const [k, w] of animalKeys(a)) {
        if (t.includes(k) && (k.length > 3 || new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(t))) { best = Math.max(best, w * (k.length >= 4 ? 1 : 0.9)); continue; }
        const kw = k.split(' ').length;
        for (const g of grams) { if (Math.abs(g.split(' ').length - kw) > 1 || g.length < 3) continue; const s = sim(g, k) * w; if (s > best) best = s; }
      }
      // disambiguators said together with a shared name: code "1/26", "jedna lomeno dvacet sest", sex, enclosure
      if (a.code && t.replace(/ lomeno | slash | strich /g, '/').includes(norm(a.code))) best += 0.08;
      if (a.enclosure && t.includes(norm(a.enclosure))) best += 0.05;
      if (best > 0) out.push({ a, s: Math.min(best, 1.1) });
    }
    return out.sort((x, y) => y.s - x.s);
  }

  /**
   * Parse one utterance. ctx: { animals[], lang, pending } — pending = the draft being confirmed (so "ano",
   * "odmítlo", "první" etc. are interpreted in context).
   */
  function parse(text, ctx = {}) {
    const t = norm(text);
    const out = { text: t, intent: null };
    if (!t) return out;
    if (L.stop.test(t)) return { ...out, intent: 'stop' };
    if (L.cancel.test(t)) return { ...out, intent: 'cancel' };
    if (L.repeat.test(t) && t.split(' ').length <= 3) return { ...out, intent: 'repeat' };
    if (ctx.pending?.candidates) { for (const [re, i] of L.ordinal) if (re.test(t) && t.split(' ').length <= 3) return { ...out, intent: 'choose', index: i }; }
    if (ctx.pending && L.yes.test(t)) return { ...out, intent: 'yes' };
    if (ctx.pending && L.no.test(t)) return { ...out, intent: 'no' };
    if (L.next.test(t)) return { ...out, intent: 'next' };
    const correct = L.correct.test(t);
    // result / type
    let result = null, type = null;
    for (const [r, re] of RESULTS) if (re.test(t)) { result = r; break; }
    if (result) type = 'Krmení';
    else for (const [ty, re] of TYPES) if (re.test(t)) { type = ty; break; }
    const value = numberIn(t.replace(/\b\d+\s*\/\s*\d+\b/g, ' ')), unitRaw = (t.match(UNIT) || [])[1] || null;
    const unit = !unitRaw ? null : /^gram|^g$/.test(unitRaw) ? 'g' : /^kilo|^kg$/.test(unitRaw) ? 'kg' : /^kus|^ks$|^pc|^piece|^stuck/.test(unitRaw) ? 'ks' : unitRaw;
    // feed item after "krmivo|potrava|food|futter" or known feed words
    let feed = null; const fm = t.match(/\b(?:krmivo|potrava|dostal[ao]?|food|with|futter|mit)\s+([a-z ]{3,40}?)(?:\s+(?:\d|kus|ks|g\b|gram)|$)/); if (fm) feed = fm[1].trim();
    // animals
    const ranked = ctx.animals?.length ? rankAnimals(t, ctx.animals) : [];
    const top = ranked[0], second = ranked[1];
    let animal = null, candidates = null;
    if (top && top.s >= 0.72) {
      const close = ranked.filter((r) => r.s >= top.s - 0.04 && r.s >= 0.72);
      if (close.length > 1) candidates = close.slice(0, 4).map((r) => r.a);
      else animal = top.a;
    }
    const confidence = top ? (candidates ? top.s * 0.6 : top.s) : 0;
    out.intent = correct ? 'correct' : (type || animal || candidates ? 'record' : (ctx.pending && value !== null ? 'value' : 'unknown'));
    return Object.assign(out, { type, result, value, unit, feed, animal, candidates, confidence, second: second?.a || null });
  }

  /** Czech / English / German prompts for TTS + UI. */
  const T = {
    cs: { hello: 'Poslouchám. Řekněte zvíře a co se stalo.', which: 'Kterému zvířeti?', ambiguous: (n) => `Mám ${n} možnosti. Řekněte první, druhá, nebo název.`, what: 'Co se stalo? Snědlo, odmítlo, ve svleku, nebo nekrmeno?', confirm: (s) => `${s}. Uložit?`, saved: 'Uloženo.', cancelled: 'Zrušeno.', again: 'Nerozuměl jsem. Zkuste to znovu.', dup: 'Dnes už záznam existuje. Uložit přesto?', value: 'Jaká hodnota?', bye: 'Hlasový režim ukončen.', err: 'Uložení selhalo.' },
    en: { hello: 'Listening. Say the animal and what happened.', which: 'Which animal?', ambiguous: (n) => `I have ${n} options. Say first, second, or the name.`, what: 'What happened? Ate, refused, in shed, or not fed?', confirm: (s) => `${s}. Save?`, saved: 'Saved.', cancelled: 'Cancelled.', again: 'Sorry, I did not get that.', dup: 'A record already exists today. Save anyway?', value: 'What value?', bye: 'Voice mode off.', err: 'Saving failed.' },
    de: { hello: 'Ich höre zu. Sagen Sie das Tier und was passiert ist.', which: 'Welches Tier?', ambiguous: (n) => `Ich habe ${n} Möglichkeiten. Sagen Sie erste, zweite oder den Namen.`, what: 'Was ist passiert? Gefressen, verweigert, in Häutung oder nicht gefüttert?', confirm: (s) => `${s}. Speichern?`, saved: 'Gespeichert.', cancelled: 'Abgebrochen.', again: 'Nicht verstanden. Bitte wiederholen.', dup: 'Heute gibt es schon einen Eintrag. Trotzdem speichern?', value: 'Welcher Wert?', bye: 'Sprachmodus beendet.', err: 'Speichern fehlgeschlagen.' },
  };
  const RES_LABEL = { cs: { eaten: 'snědlo', refused: 'odmítlo', in_shed: 've svleku', not_fed: 'nekrmeno' }, en: { eaten: 'ate', refused: 'refused', in_shed: 'in shed', not_fed: 'not fed' }, de: { eaten: 'gefressen', refused: 'verweigert', in_shed: 'in Häutung', not_fed: 'nicht gefüttert' } };
  const TYPE_LABEL = { en: { 'Krmení': 'Feeding', 'Vážení': 'Weighing', 'Výměna vody': 'Water change', 'Čištění': 'Cleaning', 'Svlek': 'Shed', 'Rosení': 'Misting', 'Zdravotní kontrola': 'Health check', 'Kálení': 'Feces' }, de: { 'Krmení': 'Fütterung', 'Vážení': 'Wiegen', 'Výměna vody': 'Wasserwechsel', 'Čištění': 'Reinigung', 'Svlek': 'Häutung', 'Rosení': 'Sprühen', 'Zdravotní kontrola': 'Gesundheitskontrolle', 'Kálení': 'Kot' } };
  function summary(d, lang = 'cs') {
    const ty = (TYPE_LABEL[lang] || {})[d.type] || d.type;
    const who = d.animal ? (d.animal.name + (d.animal.code ? ' ' + d.animal.code : '')) : '';
    const parts = [ty, who];
    if (d.result) parts.push(RES_LABEL[lang][d.result]);
    if (d.value !== null && d.value !== undefined && d.type !== 'Krmení') parts.push(String(d.value).replace('.', lang === 'en' ? '.' : ',') + (d.unit ? ' ' + d.unit : ''));
    if (d.type === 'Krmení' && d.value) parts.push(d.value + '×');
    return parts.filter(Boolean).join(', ');
  }
  return { norm, phon, sim, parse, rankAnimals, numberIn, summary, T, RES_LABEL };
});
