// Sdílené komponenty — tři vizuální úrovně: PRIMÁRNÍ / SEKUNDÁRNÍ / DETAIL.
import { esc } from '../core/dom.js';
import { gl, ico, tile } from '../core/icons.js';
import { SPECIES, latin, imgFor } from '../data/species.js';
import { MODULES } from '../nav.js';

/** Page heading: IR tile icon + title + subtitle, tabs underneath, actions right (evolution of .premium-page-heading). */
export function pageHead({ mod, icon, title, sub, tabs, actions = '', kicker, cur }) {
  const m = MODULES[mod] || {};
  const T = tabs ?? m.subs ?? [];
  return `<header class="ph">
    <div class="ph-row">${tile(icon || m.icon || 'dashboard', 'lg')}<div class="ph-t">${kicker ? `<span class="kicker">${esc(kicker)}</span>` : ''}<h1 class="t-page">${esc(title || m.label)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="ph-a">${actions}</div></div>
    ${T.length ? `<nav class="tabs" role="tablist">${T.map(([k, l, n]) => `<a role="tab" href="#/${mod}/${k}" class="tab ${cur === k ? 'on' : ''}" aria-selected="${cur === k}">${esc(l)}${n != null && n !== '' ? `<em>${n}</em>` : ''}</a>`).join('')}<i class="tab-ind" aria-hidden="true"></i></nav>` : ''}
  </header>`;
}
/** Block (card) with heading level. level: 'primary' | 'secondary' | 'detail' */
export function block(title, body, { icon, kicker, actions = '', cls = '', level = 'secondary', sub = '', id } = {}) {
  return `<section class="blk lvl-${level} ${cls}" ${id ? `id="${id}"` : ''}><header class="blk-h">${icon ? tile(icon, 'sm') : ''}<div class="blk-t">${kicker ? `<span class="kicker">${esc(kicker)}</span>` : ''}<h2>${esc(title)}</h2>${sub ? `<span class="meta">${sub}</span>` : ''}</div><div class="blk-a">${actions}</div></header><div class="blk-b">${body}</div></section>`;
}
export const sexMark = (s) => s === 'm' ? `<span class="sex m" title="Samec">${gl('male')}</span>` : s === 'f' ? `<span class="sex f" title="Samice">${gl('female')}</span>` : `<span class="sex u" title="Neurčeno">${gl('unknown-sex')}</span>`;
export const sexText = (a) => a.kind === 'group' ? `<span class="ratio" title="samci.samice.neurčeno">${a.sexes.m}.${a.sexes.f}.${a.sexes.u}</span>` : sexMark(a.sex);
export const avatar = (a, s = 40, extra = '') => `<span class="av ${extra}" style="--s:${s}px"><img src="${imgFor(a)}" alt="" loading="lazy" decoding="async"></span>`;
export const spLabel = (key, { cz = true } = {}) => { const sp = SPECIES[key]; return `<span class="spl"><b class="latin">${esc(latin(sp))}</b>${cz ? `<span class="cz">${esc(sp.cz)}</span>` : ''}</span>`; };
const STATUS = { active: ['Aktivní', 'ok'], 'for-sale': ['Na prodej', 'am'], reserved: ['Rezervováno', 'info'], sold: ['Prodáno', 'mute'], deceased: ['Uhynulo', 'mute'], quarantine: ['Karanténa', 'warn'] };
export const statusPill = (s) => { const [l, k] = STATUS[s] || [s, '']; return `<span class="pill ${k}">${esc(l)}</span>`; };
const BREED = { breeding: 'V chovu', paired: 'Spárováno', gravid: 'Březí', 'post-lay': 'Po snůšce', cycling: 'Cyklování', 'pre-brumation': 'Před brumací' };
export const breedPill = (b) => BREED[b] ? `<span class="pill repro">${gl('reproduction')}${BREED[b]}</span>` : '';
export function ring(p, { size = 64, stroke = 6, label = '', color = 'var(--am)' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, p));
  return `<span class="ring" style="--s:${size}px"><svg viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="#1d2830" stroke-width="${stroke}" fill="none"/><circle class="ring-v" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color}" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" style="--c:${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg><b>${label}</b></span>`;
}
/** Biological range: 80 ├──────┤ 100 — honest window, current-day marker, never a fake exact date. */
export function rangeBar(day, [a, b], { unit = 'dní', compact = false } = {}) {
  const max = Math.max(b * 1.1, day + 3), pct = (x) => `${Math.min(100, (x / max) * 100).toFixed(2)}%`;
  const state = day < a ? 'before' : day <= b ? 'in' : 'after';
  return `<div class="rb ${compact ? 'compact' : ''} st-${state}"><div class="rb-track"><i class="rb-fill" style="--w:${pct(Math.min(day, max))}"></i><i class="rb-win" style="left:${pct(a)};width:calc(${pct(b)} - ${pct(a)})"></i><i class="rb-now" style="left:${pct(Math.min(day, max))}"><em>den ${day}</em></i></div>${compact ? '' : `<div class="rb-lab"><span style="left:${pct(a)}">${a}</span><span style="left:${pct(b)}">${b} ${unit}</span></div>`}</div>`;
}
export function spark(vals, { w = 220, h = 56, color = 'var(--am)' } = {}) {
  if (vals.length < 2) return '';
  const mn = Math.min(...vals), mx = Math.max(...vals), sx = w / (vals.length - 1), sy = (v) => h - 6 - ((v - mn) / (mx - mn || 1)) * (h - 12);
  const pts = vals.map((v, i) => `${(i * sx).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="sg${w}${h}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><polygon points="0,${h} ${pts} ${w},${h}" fill="url(#sg${w}${h})"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/><circle cx="${w}" cy="${sy(vals[vals.length - 1])}" r="3.2" fill="${color}"/></svg>`;
}
export const empty = (title, text = '', iconName = 'status-ok', actionHTML = '') => `<div class="empty">${tile(iconName, 'lg')}<b>${esc(title)}</b>${text ? `<span class="muted small">${esc(text)}</span>` : ''}${actionHTML}</div>`;
export const money = (v) => `${Math.round(v).toLocaleString('cs-CZ').replace(/\s/g, ' ')} Kč`;
export const num = (v, d = 0) => (+v).toLocaleString('cs-CZ', { maximumFractionDigits: d });
export const typeTile = (T) => `<span class="ttile" style="--c:${T.color}">${ico(T.icon)}</span>`;
export { tile, ico, gl };
