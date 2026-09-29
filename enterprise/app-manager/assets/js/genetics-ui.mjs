/* ==========================================================================
 * IR Manager — Genetics UI (pure presentation layer)
 * All genetic probability math lives in genetics-engine.mjs. This file only
 * builds inputs, calls the engine, and renders its output. It must never
 * reimplement any Mendelian/probability computation itself.
 * ========================================================================== */
import { calculate, probabilitiesSumTo1 } from './genetics-engine.mjs';

const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = (() => { let n = 0; return () => `g${Date.now().toString(36)}${(n++).toString(36)}`; })();

const loci = $('#g-loci'), result = $('#g-result'), data = JSON.parse($('#g-data')?.textContent || '{"projects":[]}');

const MODE_LABELS = { recessive: 'Recesivní', dominant: 'Dominantní', codominant: 'Kodominantní', incomplete: 'Neúplně dominantní', sexlinked: 'Sex-linked / pohlavně vázaný', custom: 'Uživatelský / neurčený' };
const STATE_LABELS = { normal: 'Normal', visual: 'Visual / plný projev', het: 'Heterozygot (100 % jistota)', possibleHet: 'Possible het (%)', homozygous: 'Homozygot', uncertainZygosity: 'Nejisté het/homozygot (%)', custom: 'Vlastní %', unknown: 'Unknown' };
const NAME_HINTS = {
    recessive: { p0: 'Normal', p1: 'Het. nositel', p2: 'Visual' },
    dominant: { p0: 'Normal', p1: 'Dominantní forma', p2: 'Homozygotní forma (pokud odlišná)' },
    codominant: { p0: 'Normal', p1: 'Forma (het)', p2: 'Super forma (homo)' },
    incomplete: { p0: 'Normal', p1: 'Forma (het)', p2: 'Forma (homo)' },
    sexlinked: { p0: 'Normal', p1: 'Het. nositelka', p2: 'Visual' },
    custom: { p0: 'Stav A', p1: 'Stav B', p2: 'Stav C' },
};

/* -------------------------- gene row (one locus) ------------------------- */

function stateBlock(side, v = {}) {
    const st = v.state || { kind: 'normal' };
    return `
    <div class="gg-state" data-side="${side}">
      <select data-k="${side}Kind">${Object.entries(STATE_LABELS).map(([k, l]) => `<option value="${k}" ${st.kind === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <input data-k="${side}Pct" type="number" min="0" max="100" step="1" value="${Number.isFinite(st.pct) ? st.pct : 50}" placeholder="%" title="Pravděpodobnost, v procentech" ${['possibleHet', 'uncertainZygosity'].includes(st.kind) ? '' : 'hidden'}>
      <div class="gg-custom" ${st.kind === 'custom' ? '' : 'hidden'}>
        <input data-k="${side}P0" type="number" min="0" max="100" value="${st.custom?.p0 ?? 0}" title="% Normal"><input data-k="${side}P1" type="number" min="0" max="100" value="${st.custom?.p1 ?? 0}" title="% Heterozygot"><input data-k="${side}P2" type="number" min="0" max="100" value="${st.custom?.p2 ?? 0}" title="% Homozygot/visual">
      </div>
    </div>`;
}

function geneRow(v = {}) {
    const row = document.createElement('div');
    row.className = 'gg-row';
    row.dataset.id = v.id || uid();
    const mode = v.mode || 'recessive';
    row.innerHTML = `
    <div class="gg-row-main">
      <input class="gg-name" data-k="name" placeholder="Název genu / lokusu, např. Albino" value="${esc(v.name || '')}">
      <input class="gg-allele" data-k="alleleName" placeholder="alela (volitelně)" value="${esc(v.alleleName || '')}">
      <select data-k="mode">${Object.entries(MODE_LABELS).map(([k, l]) => `<option value="${k}" ${mode === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      <select data-k="system" class="gg-system" ${mode === 'sexlinked' ? '' : 'hidden'}><option value="XY" ${v.system === 'XY' ? 'selected' : ''}>XY (samec heterogametický)</option><option value="ZW" ${v.system === 'ZW' ? 'selected' : ''}>ZW (samice heterogametická)</option></select>
      <button type="button" class="gg-remove" title="Odebrat gen">×</button>
    </div>
    <div class="gg-row-parents">
      <div class="gg-parent-col"><small>OTEC</small>${stateBlock('father', v.father)}</div>
      <div class="gg-parent-col"><small>MATKA</small>${stateBlock('mother', v.mother)}</div>
    </div>
    <div class="gg-row-names">
      <small>Pojmenování fenotypů (nepovinné - jinak se použije výchozí):</small>
      <input data-k="nameP0" placeholder="${NAME_HINTS[mode].p0}" value="${esc(v.names?.p0 || '')}">
      <input data-k="nameP1" placeholder="${NAME_HINTS[mode].p1}" value="${esc(v.names?.p1 || '')}">
      <input data-k="nameP2" placeholder="${NAME_HINTS[mode].p2}" value="${esc(v.names?.p2 || '')}">
    </div>
    <div class="gg-row-link">
      <label><input type="checkbox" data-k="linkedToPrev" ${v.linkedToPrev ? 'checked' : ''}> Geneticky propojen s předchozím genem (linked)</label>
      <div class="gg-link-fields" ${v.linkedToPrev ? '' : 'hidden'}>
        <label>Recombination rate %<input data-k="recombinationRate" type="number" min="0" max="50" value="${v.recombinationRate ?? 0}"></label>
        <label>Fáze<select data-k="phase"><option value="unknown" ${(!v.phase || v.phase === 'unknown') ? 'selected' : ''}>Neznámá</option><option value="cis" ${v.phase === 'cis' ? 'selected' : ''}>Cis (společně)</option><option value="trans" ${v.phase === 'trans' ? 'selected' : ''}>Trans (odděleně)</option></select></label>
      </div>
    </div>
    <input class="gg-note" data-k="note" placeholder="Poznámka (volitelně)" value="${esc(v.note || '')}">`;

    row.querySelector('.gg-remove').onclick = () => { row.remove(); renumberLinks(); };
    row.querySelector('[data-k="mode"]').addEventListener('change', e => onModeChange(row, e.target.value));
    row.querySelector('[data-k="linkedToPrev"]').addEventListener('change', e => { row.querySelector('.gg-link-fields').hidden = !e.target.checked; });
    $$('.gg-state', row).forEach(block => {
        const side = block.dataset.side;
        block.querySelector(`[data-k="${side}Kind"]`).addEventListener('change', e => syncStateVisibility(block, side, e.target.value));
    });
    loci.append(row);
    return row;
}

function onModeChange(row, mode) {
    row.querySelector('.gg-system').hidden = mode !== 'sexlinked';
    const hints = NAME_HINTS[mode] || NAME_HINTS.custom;
    row.querySelector('[data-k="nameP0"]').placeholder = hints.p0;
    row.querySelector('[data-k="nameP1"]').placeholder = hints.p1;
    row.querySelector('[data-k="nameP2"]').placeholder = hints.p2;
}
function syncStateVisibility(block, side, kind) {
    block.querySelector(`[data-k="${side}Pct"]`).hidden = !['possibleHet', 'uncertainZygosity'].includes(kind);
    block.querySelector('.gg-custom').hidden = kind !== 'custom';
}
function renumberLinks() { /* linked-to-previous is resolved at read time by DOM order, nothing to precompute */ }

/* -------------------------- reading form state ---------------------------- */

function parentMeta(side) {
    return {
        name: $(`[data-parent="${side}"][data-field="name"]`)?.value.trim() || '',
        description: $(`[data-parent="${side}"][data-field="description"]`)?.value.trim() || '',
        notes: $(`[data-parent="${side}"][data-field="notes"]`)?.value.trim() || '',
    };
}

function readState(row, side) {
    const kind = row.querySelector(`[data-k="${side}Kind"]`).value;
    if (kind === 'possibleHet' || kind === 'uncertainZygosity') {
        return { kind, pct: Number(row.querySelector(`[data-k="${side}Pct"]`).value || 0) };
    }
    if (kind === 'custom') {
        return { kind, custom: { p0: Number(row.querySelector(`[data-k="${side}P0"]`).value || 0), p1: Number(row.querySelector(`[data-k="${side}P1"]`).value || 0), p2: Number(row.querySelector(`[data-k="${side}P2"]`).value || 0) } };
    }
    return { kind };
}

function readGenes() {
    const rows = $$('.gg-row', loci);
    return rows.map((row, i) => {
        const mode = row.querySelector('[data-k="mode"]').value;
        const gene = {
            id: row.dataset.id,
            name: row.querySelector('[data-k="name"]').value.trim(),
            alleleName: row.querySelector('[data-k="alleleName"]').value.trim(),
            mode,
            system: mode === 'sexlinked' ? row.querySelector('[data-k="system"]').value : 'autosomal',
            father: { state: readState(row, 'father') },
            mother: { state: readState(row, 'mother') },
            names: { p0: row.querySelector('[data-k="nameP0"]').value.trim(), p1: row.querySelector('[data-k="nameP1"]').value.trim(), p2: row.querySelector('[data-k="nameP2"]').value.trim() },
            note: row.querySelector('[data-k="note"]').value.trim(),
            linkedToPrev: row.querySelector('[data-k="linkedToPrev"]').checked,
            recombinationRate: Number(row.querySelector('[data-k="recombinationRate"]')?.value || 0),
            phase: row.querySelector('[data-k="phase"]')?.value || 'unknown',
        };
        gene._prevId = i > 0 ? rows[i - 1].dataset.id : null;
        return gene;
    }).filter(g => g.name);
}

function buildEngineInput(genes) {
    const linkedPairs = [];
    const skip = new Set();
    for (const g of genes) {
        if (g.linkedToPrev && g._prevId && !skip.has(g.id)) {
            linkedPairs.push({ locusIdA: g._prevId, locusIdB: g.id, recombinationRate: g.recombinationRate, phase: g.phase });
            skip.add(g.id);
        }
    }
    const loci = genes.map(({ _prevId, linkedToPrev, recombinationRate, phase, ...rest }) => rest);
    return { loci, linkedPairs };
}

function payload() {
    return {
        schema: 'ir-genetics-v3',
        species: $('#g-species').value.trim(),
        name: $('#g-name').value.trim(),
        father: parentMeta('father'),
        mother: parentMeta('mother'),
        genes: readGenes(),
        notes: $('#g-notes').value.trim(),
    };
}

/* -------------------------- rendering results ------------------------------ */

function pct(v) { return `${(v * 100).toLocaleString('cs-CZ', { maximumFractionDigits: 2 })} %`; }

function comboLabel(row) {
    const visualOrExpressed = row.genes.filter(g => g.visual);
    const carriers = row.genes.filter(g => g.carrier);
    const rest = row.genes.filter(g => !g.visual && !g.carrier);
    const parts = [];
    if (visualOrExpressed.length) parts.push(visualOrExpressed.map(g => g.phenotype).join(' + '));
    if (!parts.length) parts.push(rest.length && rest.every(g => g.phenotype) ? 'Normal' : 'Normal');
    let label = parts.join(' + ');
    if (carriers.length) label += (label ? '<br>' : '') + carriers.map(g => `100% het ${g.name}`).join(', ');
    return label || 'Normal';
}

function render(input) {
    let out;
    try { out = calculate(input); }
    catch (e) { result.innerHTML = `<div class="gg-error">${esc(e.message)}</div>`; return; }

    const totalOk = probabilitiesSumTo1(out.rows, 1e-4);
    const RENDER_CAP = 500;
    const shown = out.rows.slice(0, RENDER_CAP);
    const top = out.rows.slice(0, 12);

    const uncertaintyBanner = out.uncertain
        ? `<div class="gg-banner gg-banner-warn">⚠ Výpočet obsahuje nejisté genetické vstupy (possible het / nejistá zygozita). Výsledky níže jsou pravděpodobnostní, ne jisté.</div>`
        : `<div class="gg-banner gg-banner-ok">✓ Všechny vstupy jsou zadány s jistotou - výsledky jsou deterministické (matematicky jisté), ne odhad.</div>`;

    const excludedNote = out.excludedLoci.length
        ? `<div class="gg-banner gg-banner-warn">Vynecháno z výpočtu (genotyp „Unknown"): ${out.excludedLoci.map(esc).join(', ')}.</div>` : '';

    const sumWarn = !totalOk ? `<div class="gg-banner gg-banner-warn">Součet pravděpodobností se od 100 % odchyluje o víc než zaokrouhlovací toleranci - zkontroluj prosím vstupy.</div>` : '';

    result.innerHTML = `
      ${uncertaintyBanner}${excludedNote}${sumWarn}
      <section class="gg-summary">
        <h3>Nejpravděpodobnější kombinace</h3>
        <div class="gg-combo-grid">${top.map(r => `<article class="gg-combo-card"><strong>${pct(r.p)}</strong><span>${comboLabel(r)}</span></article>`).join('')}</div>
        ${out.rows.length > top.length ? `<button type="button" class="btn secondary" id="g-show-all">Zobrazit všechny kombinace (${out.rows.length})</button>` : ''}
      </section>
      <section class="gg-detail" id="g-detail" hidden>
        <h3>Detailní kombinace${out.rows.length > RENDER_CAP ? ` (zobrazeno prvních ${RENDER_CAP} z ${out.rows.length}, seřazeno podle pravděpodobnosti)` : ''}</h3>
        <div class="gg-detail-table">${shown.map(r => `<div class="gg-detail-row"><b>${pct(r.p)}</b><span>${r.genes.map(g => `${esc(g.name)}: ${esc(g.genotypeLabel)} <i>(${esc(g.phenotype)})</i>`).join(' · ')}</span></div>`).join('')}</div>
      </section>
      <section class="gg-explain">
        <details><summary>Jak byl výsledek vypočítán</summary>${renderExplain(out.perLocusExplain)}</details>
      </section>
      ${out.warnings.length ? `<section class="gg-warnings"><details><summary>Poznámky k výpočtu (${out.warnings.length})</summary><ul>${out.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></details></section>` : ''}
    `;
    $('#g-show-all')?.addEventListener('click', () => { $('#g-detail').hidden = false; $('#g-show-all').remove(); });
}

function renderExplain(perLocusExplain) {
    return perLocusExplain.map(e => {
        if (e.linked) {
            return `<article class="gg-explain-locus"><header>${esc(e.name)}</header><p>Vazba genů, recombination rate ${e.recombinationRate ?? 0} %, fáze: ${esc(e.phase || 'neznámá')}.</p></article>`;
        }
        if (!e.father) return `<article class="gg-explain-locus"><header>${esc(e.name)}</header><p>Lokus vynechán (neznámý genotyp).</p></article>`;
        const distStr = d => d.dist.map(x => `${x.count}× (${pct(x.p)})`).join(', ') || '—';
        return `<article class="gg-explain-locus">
          <header>${esc(e.name)}</header>
          <div class="gg-explain-flow">
            <div><small>OTEC</small><b>${esc(distStr(e.father))}</b></div>
            <span>×</span>
            <div><small>MATKA</small><b>${esc(distStr(e.mother))}</b></div>
            <span>=</span>
            <div><small>POTOMSTVO</small><b>${(e.perSex?.[0]?.rows || []).map(r => `${pct(r.p)} ${esc(r.phenotype)}`).join(', ')}</b></div>
          </div>
        </article>`;
    }).join('');
}

/* -------------------------- top-level wiring -------------------------------- */

function runCalculation() {
    const p = payload();
    if (!p.genes.length) { result.innerHTML = '<div class="empty-state">Přidej alespoň jeden gen.</div>'; return; }
    render(buildEngineInput(p.genes));
}

function clearAll() {
    loci.replaceChildren(); geneRow({ mode: 'recessive' }); geneRow({ mode: 'dominant' });
    for (const el of $$('[data-parent]')) el.value = '';
    $('#g-species').value = ''; $('#g-name').value = ''; $('#g-notes').value = '';
    result.innerHTML = '<div class="empty-state">Zadej rodiče a geny a spusť výpočet.</div>';
}

function swapParents() {
    for (const field of ['name', 'description', 'notes']) {
        const f = $(`[data-parent="father"][data-field="${field}"]`), m = $(`[data-parent="mother"][data-field="${field}"]`);
        if (f && m) { const tmp = f.value; f.value = m.value; m.value = tmp; }
    }
    for (const row of $$('.gg-row', loci)) {
        for (const key of ['Kind', 'Pct', 'P0', 'P1', 'P2']) {
            const f = row.querySelector(`[data-k="father${key}"]`), m = row.querySelector(`[data-k="mother${key}"]`);
            if (f && m) { const tmp = f.value; f.value = m.value; m.value = tmp; }
        }
        syncStateVisibility(row.querySelector('.gg-state[data-side="father"]'), 'father', row.querySelector('[data-k="fatherKind"]').value);
        syncStateVisibility(row.querySelector('.gg-state[data-side="mother"]'), 'mother', row.querySelector('[data-k="motherKind"]').value);
    }
}

$('#g-add')?.addEventListener('click', () => geneRow());
$('#g-add-bottom')?.addEventListener('click', () => geneRow());
$('#g-calc')?.addEventListener('click', runCalculation);
$('#g-clear')?.addEventListener('click', clearAll);
$('#g-swap')?.addEventListener('click', swapParents);

$$('[data-parent-pick]').forEach(sel => sel.onchange = () => {
    const side = sel.dataset.parentPick, opt = sel.selectedOptions[0];
    if (!opt || !opt.value) return;
    $(`[data-parent="${side}"][data-field="name"]`).value = opt.dataset.name || '';
    const d = $(`[data-parent="${side}"][data-field="description"]`);
    if (d && !d.value) d.value = opt.dataset.genetics || '';
    if (!$('#g-species').value) $('#g-species').value = opt.dataset.species || '';
});

$('#g-save')?.addEventListener('submit', e => {
    const p = payload();
    e.currentTarget.elements.name.value = p.name || `${p.father.name || 'Otec'} × ${p.mother.name || 'Matka'}`;
    e.currentTarget.elements.species.value = p.species;
    e.currentTarget.elements.project_json.value = JSON.stringify(p);
});

function migrateOldGene(g) {
    // Back-compat for projects saved under the previous, much simpler schema
    // (schema 'ir-genetics-v2': fatherState/fatherPct/motherState/motherPct flat strings).
    if (g.father && g.mother) return g; // already new-format
    const toState = (stateName, pctVal) => {
        if (stateName === 'possible') return { kind: 'possibleHet', pct: Number(pctVal || 50) };
        if (stateName === 'homo') return { kind: 'homozygous' };
        if (['normal', 'visual', 'het'].includes(stateName)) return { kind: stateName };
        return { kind: 'normal' };
    };
    return {
        id: uid(), name: g.name || '', alleleName: '', mode: g.mode || 'recessive', system: 'autosomal',
        father: { state: toState(g.fatherState, g.fatherPct) }, mother: { state: toState(g.motherState, g.motherPct) },
        names: {}, note: g.note || '', linkedToPrev: false, recombinationRate: 0, phase: 'unknown',
    };
}

function loadProject(pr) {
    let raw = {};
    try {
        const male = JSON.parse(pr.male_traits || '{}');
        raw = { schema: male.schema || '', father: male.parent || {}, genes: (male.genes || []).map(migrateOldGene), species: pr.species || '', name: pr.name || '' };
        const mother = JSON.parse(pr.female_traits || '{}'); raw.mother = mother.parent || {};
        const notes = JSON.parse(pr.notes || '{}'); raw.notes = notes.raw || '';
    } catch { return; }
    $('#g-name').value = raw.name || ''; $('#g-species').value = raw.species || '';
    for (const side of ['father', 'mother']) for (const field of ['name', 'description', 'notes']) {
        const el = $(`[data-parent="${side}"][data-field="${field}"]`); if (el) el.value = raw[side]?.[field] || '';
    }
    $('#g-notes').value = raw.notes || '';
    loci.replaceChildren();
    (raw.genes?.length ? raw.genes : [{}]).forEach(g => geneRow(g));
    result.innerHTML = '<div class="empty-state">Projekt načten. Stiskni „Vypočítat", pro zobrazení výsledku.</div>';
}
$$('[data-project-id]').forEach(b => b.onclick = () => { const pr = (data.projects || []).find(x => String(x.id) === String(b.dataset.projectId)); if (pr) loadProject(pr); });

geneRow({ mode: 'recessive' });
geneRow({ mode: 'dominant' });
