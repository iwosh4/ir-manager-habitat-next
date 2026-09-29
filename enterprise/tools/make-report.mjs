// Generates docs/CLAUDE_ACCEPTANCE_REPORT.md from the real test result files — no result is written by hand.
//   node tools/make-report.mjs
// Each requirement lists the tests that prove it; its status is PASS only if every referenced test passed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = path.join(ROOT, 'tests', 'results');
const rd = (f) => JSON.parse(fs.readFileSync(path.join(R, f), 'utf8'));
const acc = rd('acceptance.json'), svc = rd('services.json'), voice = rd('voice-core.json'), stat = rd('static-checks.json');
const hsTxt = fs.readFileSync(path.join(R, 'habitat-4_2-regression.txt'), 'utf8');
const hsM = hsTxt.match(/(\d+)\/(\d+) passed/); const hs = { pass: +hsM[1], total: +hsM[2] };

// test reference → { ok, label, evidence }
function resolve(ref) {
  const [kind, key] = ref.split(':');
  if (kind === 'A') { const t = acc.results.find((r) => r.id === key); return t ? { ok: t.ok, label: `${t.id} ${t.name}`, evidence: (t.evidence || []).join('; ') || t.error } : { ok: false, label: key + ' (not run)' }; }
  if (kind === 'S') { const t = stat.results.find((r) => r.id === key); return t ? { ok: t.ok, label: `${t.id} ${t.name}`, evidence: t.evidence || t.error } : { ok: false, label: key + ' (not run)' }; }
  if (kind === 'svc') { const t = svc.results.filter((r) => r.name.startsWith(key)); return t.length ? { ok: t.every((x) => x.ok), label: 'service: ' + t.map((x) => x.name).join(' / '), evidence: 'tests/php/services.test.php' } : { ok: false, label: 'service ' + key + ' (not found)' }; }
  if (kind === 'voice') return { ok: voice.fail === 0, label: `voice parser unit tests (${voice.pass}/${voice.pass + voice.fail})`, evidence: 'tests/js/voice-core.test.mjs' };
  if (kind === 'hs') return { ok: hs.pass === hs.total, label: `Habitat 4.2 regression (${hs.pass}/${hs.total})`, evidence: 'tests/results/habitat-4_2-regression.txt' };
  throw new Error('unknown ref ' + ref);
}

const REQ = [
  // ---- E. known blockers
  ['BETA1-01', 'Group husbandry', 'Representative group card; member mini-cards; group session writes one batch of per-member events (all-or-nothing); individual history kept per member', ['A:A08', 'svc:GROUP']],
  ['BETA1-02', 'KPI graphics', 'Six KPI cards with real image backgrounds (relative paths, dark overlay); image load failure logged', ['A:A01', 'A:A24', 'S:S5']],
  ['BETA1-03', 'LIVE strip', 'Server-computed messages (`live.summary`), one clipped message at a time, pause / prev / next', ['A:A02', 'svc:LIVE']],
  ['BETA1-04', 'QR', 'Local QR generation (no third-party service), stable `IR:A:`/`IR:E:` tokens, camera scanner (BarcodeDetector → jsQR), permission/error fallback, manual entry, writes a real event', ['A:A09', 'A:A10', 'S:S3']],
  ['BETA1-05', 'Voice', 'Web Speech recognition, hands-free dialogue, TTS read-back with mic paused, yes/no/repeat/correct/cancel, CZ/EN/DE, Latin + DB names as vocabulary, ambiguity → question, never invents an animal', ['A:A11', 'voice:all']],
  ['BETA1-06', 'Manager ↔ Habitat', 'Habitat Studio 4.2 hosted in Manager; MySQL is authoritative (revisioned save, 409 on conflict); Manager enclosures in MY ENCLOSURES; new Habitat instances/assemblies become Manager entities; ← IR MANAGER with autosave; legacy room migrated', ['A:A13', 'svc:HABITAT', 'hs:all']],
  ['BETA1-07', 'Taxonomy', 'Latin-first autocomplete (genus prefix, epithet, Czech alias); manual taxon without Czech name, synonyms, localities; Latin validation', ['A:A04', 'A:A05', 'svc:TAXONOMY']],
  ['BETA1-08', 'Enclosure clone', 'Clone ×N copies setup only (no animals/history), new stable id + QR identity, save & add similar, audit', ['A:A12', 'svc:ENCLOSURE']],
  ['BETA1-09', 'Animal CRUD by stable id', 'Create → immediately in list → open → edit → reload → archive → restore; card/OPEN resolve by id', ['A:A04', 'svc:ANIMAL']],
  // ---- sections
  ['F', 'Animals / profile', 'Latin-primary cards, feeding button on card, pedigree incl. external ancestors (crash fixed), archive/restore', ['A:A04', 'A:A06', 'A:A25']],
  ['G', 'Group husbandry', 'see BETA1-01', ['A:A08', 'svc:GROUP']],
  ['H', 'Unified event service', 'All channels (profile, planner, quick, QR, voice, group, manual) call `ir_event_record`; source stored as metadata; planner auto-reconciled; duplicate protection asks', ['A:A06', 'A:A07', 'A:A10', 'A:A11', 'A:A15', 'svc:Duplicate', 'svc:NOT FED']],
  ['I', 'Feeding — locked workflow', 'EATEN / REFUSED / IN SHED / NOT FED only; stock + supplement only on EATEN; future dates refused', ['A:A06', 'svc:EATEN', 'svc:REFUSED', 'svc:IN SHED', 'svc:NOT FED', 'svc:Future']],
  ['J', 'Supplement rotation', 'Advances only on successful feed; corrections roll back', ['svc:SUPPLEMENT', 'svc:CORRECTION eaten']],
  ['K', 'Appetite', 'Consecutive refusals alert; in-shed neither counts nor breaks the streak', ['svc:APPETITE', 'svc:LIVE']],
  ['L', 'Shed', 'Observed → completed; estimate window from individual history; insufficient-data state', ['svc:SHED']],
  ['M', 'Activity history', 'Grouped by human day (DNES/VČERA) with result summary; inline edit; delete to recycle bin; undo restores same id; later corrections audited', ['A:A06', 'A:A14', 'svc:HISTORY', 'svc:CORRECTION', 'svc:SOFT DELETE']],
  ['N', 'Planner', 'Time rail day / week / month / biological axis; feeding task → result → task done', ['A:A15']],
  ['O', 'Reproduction', 'Cycle → expected hatch → Planner task → advance → hatch creates juvenile cards linked to parents', ['A:A25']],
  ['P', 'Health + documents', 'Real uploads (type sniffing, script rejected, nosniff, private storage 403, cross-account denied), preview/download', ['A:A16']],
  ['Q', 'Enclosures', 'Clone, QR identity, archive/restore, Habitat link', ['A:A12', 'A:A13', 'svc:ENCLOSURE']],
  ['R', 'Storage / inventory', 'Feeding consumes stock; low stock → shopping list → bought restocks', ['A:A17', 'svc:EATEN', 'svc:CORRECTION eaten']],
  ['S', 'Finance', 'Multi-line documents (qty × price, discount, VAT), totals client = server, sale marks animal sold, soft delete', ['A:A18', 'svc:FINANCE']],
  ['U', 'Dashboard', 'Header order, crocodile, LIVE, six KPI image cards, no broken assets', ['A:A01', 'A:A02']],
  ['V', 'Mobile', 'Bottom nav Home/Animals/+/Tasks/More, no horizontal scroll, viewports 1920/1440/1366/820/390', ['A:A03', 'A:A24']],
  ['W', 'Admin', 'Roles superadmin/admin/owner/staff/readonly, suspend revokes sessions, reset, plan grant, audit, last superadmin protected', ['A:A19', 'svc:ADMIN']],
  ['X', 'Accounts / team / entitlements', 'FREE 10 animals (blocks creation, never deletes), PREMIUM/PRO/PLATINUM, team logins bound to owner, read-only 403, staff cannot delete', ['A:A20', 'A:A21', 'svc:ENTITLEMENT', 'svc:TEAM']],
  ['Y', 'Billing', 'Revolut order + webhook (HMAC v1, timestamp, dedupe, forged events isolated), paid only after server re-fetch; no keys → checkout refused; never fake success', ['A:A22', 'svc:BILLING']],
  ['Z', 'PWA', 'Manifest (scope, start_url, 192/512 icons), service worker controls the page, offline fallback; PHP pages/API/uploads never cached', ['A:A26', 'S:S5']],
  ['AA', 'Auth / security', 'CSRF + one-time submission tokens, session_version revocation, read-only guard (JSON 403 for API), secrets only in config.local.php', ['A:A19', 'A:A20', 'A:A16', 'S:S2']],
  ['AB', 'Performance', 'Habitat 3D loaded only on its page (lazy); dashboard loads no 3D engine; filemtime cache busting', ['A:A01', 'hs:all']],
  ['AC', 'Data safety', 'JSON/ZIP export with media manifest, integrity report, daily backups with retention, audit trail; repeated exports from one page', ['A:A23', 'svc:EXPORT']],
  ['AD', 'Static / code quality', 'php -l, JS syntax + imports, secrets, third-party services, crawl (404/JS errors/truncated pages/duplicate ids), assets, migration idempotency on a fresh dump', ['S:S1', 'S:S2', 'S:S3', 'S:S4', 'S:S5', 'S:S6', 'S:S7', 'S:S8']],
  ['HA', 'Home Assistant', 'Intentionally NOT implemented (brief); stable device/port ids kept in Habitat data model', ['hs:all']],
];

const rows = REQ.map(([id, name, impl, refs]) => { const r = refs.map(resolve); return { id, name, impl, refs: r, ok: r.every((x) => x.ok) }; });
const allOk = rows.every((r) => r.ok);
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# IR Manager Enterprise — BETA 1.0 FINAL · Acceptance report (Claude)

Generated ${new Date().toISOString()} by \`tools/make-report.mjs\` from the raw result files in \`tests/results/\`.
A requirement is **PASS** only when every test referenced for it passed in the last run.

## Summary

| Suite | Result | Source |
|---|---|---|
| Browser acceptance (real PHP app, fresh clone of the real DB, Chromium) | **${acc.pass}/${acc.pass + acc.fail}** | \`tests/e2e/acceptance.mjs\` → \`acceptance.json\`, \`shots/\` |
| Service integration (event service, billing, entitlements, export…) | **${svc.pass}/${svc.pass + svc.fail}** | \`tests/php/services.test.php\` |
| Voice parser unit tests (CZ/EN/DE, Latin, numbers, ambiguity) | **${voice.pass}/${voice.pass + voice.fail}** | \`tests/js/voice-core.test.mjs\` |
| Habitat Studio 4.2 regression (in-browser 3D) | **${hs.pass}/${hs.total}** | \`habitat-4_2-regression.txt\` |
| Static & crawl checks | **${stat.pass}/${stat.pass + stat.fail}** | \`tests/e2e/static-checks.mjs\` → \`static-checks.json\` |
| Requirements | **${rows.filter((r) => r.ok).length}/${rows.length} PASS** | below |

${allOk ? 'No known blocker remains.' : '**NOT ALL REQUIREMENTS PASS — see FAIL rows. This build must not be declared final.**'}

## Requirement → implementation → test → result → evidence

| Req | Area | Implemented | Tests | Result | Evidence |
|---|---|---|---|---|---|
`;
for (const r of rows) md += `| ${r.id} | ${esc(r.name)} | ${esc(r.impl)} | ${esc(r.refs.map((x) => x.label).join('<br>'))} | ${r.ok ? 'PASS' : '**FAIL**'} | ${esc(r.refs.map((x) => x.evidence).filter(Boolean).join('<br>'))} |\n`;
md += `
## Browser acceptance workflows

| # | Workflow | Result | Time | Evidence / error |
|---|---|---|---|---|
`;
for (const t of acc.results) md += `| ${t.id} | ${esc(t.name)} | ${t.ok ? 'PASS' : '**FAIL**'} | ${(t.ms / 1000).toFixed(1)} s | ${esc(t.ok ? (t.evidence || []).join('; ') : t.error)} |\n`;
md += `
## Static checks

| # | Check | Result | Evidence |
|---|---|---|---|
`;
for (const t of stat.results) md += `| ${t.id} | ${esc(t.name)} | ${t.ok ? 'PASS' : '**FAIL**'} | ${esc(t.evidence || t.error)} |\n`;
md += `
## Defects found by these tests and fixed in this build

* Animal card crashed (PHP fatal mid-page, HTTP 200) when the pedigree contained an external ancestor without an animal card — pre-existing in production code; pedigree nodes now render register persons.
* Read-only team members got a plain-text 403 from the API, shown as "server did not respond"; the guard now answers JSON for API calls and a flash + redirect for forms.
* A second export from the Data page (ZIP then JSON) was rejected as a duplicate submission because a download does not reload the page; download forms now get a fresh one-time token.
* Voice: units spoken as inflected words ("gramů") were not normalised.

## How to reproduce

\`\`\`
bash tests/e2e/setup-accept.sh ir_accept                         # fresh clone of the real dump + migration, local test password
IR_DB_NAME=ir_accept php -S 127.0.0.1:8091 -t enterprise tools/router.php
node tests/e2e/acceptance.mjs && node tests/e2e/static-checks.mjs
bash tests/reset-db.sh ir_test && IR_DB_NAME=ir_test php tests/php/services.test.php
node tests/js/voice-core.test.mjs
node tools/make-report.mjs && bash tools/package-beta1.sh
\`\`\`

## Known limitations (non-blocking)

${JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'limitations.json'), 'utf8')).map((l) => '* ' + l).join('\n')}
`;
fs.writeFileSync(path.join(ROOT, 'docs', 'CLAUDE_ACCEPTANCE_REPORT.md'), md);
console.log(`requirements ${rows.filter((r) => r.ok).length}/${rows.length} PASS; acceptance ${acc.pass}/${acc.pass + acc.fail}; static ${stat.pass}/${stat.pass + stat.fail}`);
if (!allOk) { for (const r of rows.filter((x) => !x.ok)) console.log('  FAIL', r.id, r.refs.filter((x) => !x.ok).map((x) => x.label).join(' / ')); process.exit(1); }
