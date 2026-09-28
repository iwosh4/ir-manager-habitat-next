// DASHBOARD — answers: what needs attention, what happens today, what is next — then the breeder's own workspace.
import { esc } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../core/i18n.js';
import * as store from '../core/store.js';
import { SPECIES } from '../data/species.js';
import { TYPE } from '../engine/ops.js';
import { groupItems, isOpen } from '../engine/timeline.js';
import { contextItems } from '../ui/timeline.js';
import { ring } from '../ui/components.js';
import { workspaceHTML, mountWorkspace } from '../widgets/workspace.js';
import { DAY, startOfDay, hm, dLong } from '../core/time.js';

export function context() {
  return { sub: dLong(Date.now()), actions: [{ label: 'Planner', icon: 'planner', act: 'go', data: { href: '#/planner/timeline' }, hideM: true }, { label: 'Quick Record', icon: 'plus', act: 'quick-record', primary: true, kbd: 'Q', hideM: true }] };
}
export function render() {
  const db = store.get(), n = Date.now(), sod = startOfDay(n), h = new Date(n).getHours();
  const items = contextItems({ from: sod - 7 * DAY, to: sod + DAY, includeHistory: false }).filter((i) => i.kind !== 'phase');
  const open = items.filter(isOpen), overdue = open.filter((i) => i.status === 'overdue');
  const done = contextItems({ from: sod, to: sod + DAY, includeHistory: true }).filter((i) => i.status === 'done' && i.kind !== 'phase' && i.kind !== 'record');
  const tot = open.filter((i) => i.t >= sod).length + done.length;
  const next = groupItems(open.sort((a, b) => a.t - b.t))[0];
  const animals = db.animals.filter((a) => !['sold', 'deceased'].includes(a.status)).reduce((s, a) => s + (a.kind === 'group' ? a.count : 1), 0);
  const greet = h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  return `<div class="dash">
    <section class="brief">
      <img class="brief-img" src="assets/img/art/banner.webp" alt="" aria-hidden="true">
      <div class="brief-shade"></div>
      <div class="brief-l">
        <span class="brief-k">${esc(greet)}, ${esc(db.user.name.split(' ')[0])}</span>
        <h2>${open.length ? `${open.length} open ${open.length === 1 ? 'item' : 'items'} today${overdue.length ? ` · <em class="danger-t">${overdue.length} overdue</em>` : ''}` : 'Everything for today is done'}</h2>
        <p>${animals} animals · ${db.enclosures.length} enclosures · ${db.clutches.filter((c) => c.status === 'incubating').length} clutches incubating · ${db.cycles.filter((c) => c.status === 'active').length} active cycles</p>
        <div class="brief-q">${[['feeding', 'Feeding'], ['water', 'Water'], ['misting', 'Misting'], ['weight', 'Weight'], ['health', 'Health']].map(([k, l]) => `<button class="bq" data-act="qr-type" data-type="${k}" style="--c:${TYPE[k].color}">${icon(TYPE[k].icon)}<span>${l}</span></button>`).join('')}<button class="bq more" data-act="quick-record">${icon('plus')}<span>More</span></button></div>
      </div>
      <div class="brief-r">
        <div class="brief-ring">${ring(tot ? done.length / tot : 1, { size: 76, stroke: 6, label: `${Math.round(tot ? (done.length / tot) * 100 : 100)}%` })}<span>${done.length} of ${tot} done today</span></div>
        ${next ? nextHTML(next) : ''}
      </div>
    </section>
    ${workspaceHTML('dashboard', { title: 'My workspace' })}
  </div>`;
}
export function mount(root) { mountWorkspace(root); }

function nextHTML(x) {
  const T = TYPE[x.type] || TYPE.task, grp = x.kind === 'group';
  const who = grp ? `${x.items.length} × ${x.items.slice(0, 3).map((i) => i.sub?.code).join(', ')}${x.items.length > 3 ? '…' : ''}` : x.sub ? `${x.sub.code}${x.sub.name ? ` · ${x.sub.name}` : ''}` : '';
  const ids = grp ? x.items.filter(isOpen).map((i) => i.id).join(',') : x.id;
  return `<div class="brief-next" style="--c:${T.color}"><span class="brief-k">${x.status === 'overdue' ? 'Overdue first' : `Next · ${hm(x.t)}`}</span>
    <div class="bn-card"><span class="tdot">${icon(T.icon)}</span><div class="bn-t"><b>${esc(grp ? `${T.label} ×${x.items.length}` : x.title)}</b><span>${esc(who)}${x.status === 'overdue' ? ` · <em class="danger-t">${hm(x.t)}</em>` : ''}</span></div>
    <button class="btn primary" data-act="${grp ? 'w-bulk' : 'tl-done'}" ${grp ? `data-ids="${ids}"` : `data-id="${esc(x.id)}"`}>${icon('check')}${x.type === 'feeding' ? 'FED' : 'DONE'}</button><button class="btn ghost" data-act="${grp ? 'tl-group-later' : 'tl-later'}" data-id="${esc(x.id)}">${icon('later')}</button></div></div>`;
}
