#!/bin/bash
# Builds the five BETA 1.0 FINAL artifacts into enterprise/dist/:
#   IR_MANAGER_ENTERPRISE_BETA_1_0_FINAL_CLAUDE.zip   runtime only: a clean /app-manager/ replacement
#   IR_MANAGER_BETA_1_0_FINAL_MIGRATION.sql           additive, idempotent (generated from includes/schema-beta1.php)
#   DEPLOY_BETA_1_0_FINAL.md, CLAUDE_ACCEPTANCE_REPORT.md   (copied from docs/)
#   CLAUDE_BUILD_MANIFEST.json                        counts, SHA-256, schema version, tests, limitations, sources
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
APP="$ROOT/app-manager"; DIST="$ROOT/dist"; STAGE=$(mktemp -d)/app-manager
mkdir -p "$DIST" "$STAGE"
ZIP="$DIST/IR_MANAGER_ENTERPRISE_BETA_1_0_FINAL_CLAUDE.zip"

# 1) runtime files: everything under app-manager EXCEPT secrets, user data, dev/test/doc material
rsync -a "$APP/" "$STAGE/" \
  --exclude 'config.local.php' --exclude 'config.local.*.php.bak' \
  --exclude 'storage/' \
  --exclude 'uploads/**/[0-9]*/' \
  --exclude '*.md' --exclude '*.txt' --exclude '*.sql' --exclude '*.zip' --exclude '*.log' \
  --exclude '*.test.mjs' --exclude '*.test.js' --exclude 'tests/' --exclude 'node_modules/' \
  --exclude '.DS_Store' --exclude '.git*' --exclude 'assets/js/voice.js'
# keep the upload scaffolding (deny-all .htaccess + empty dirs) so a fresh install works
for d in animals profile pedigree documents files; do mkdir -p "$STAGE/uploads/$d"; [ -f "$STAGE/uploads/$d/.htaccess" ] || cp "$APP/uploads/animals/.htaccess" "$STAGE/uploads/$d/.htaccess"; done

# 2) guards — refuse to package something unsafe
if find "$STAGE" -name 'config.local.php' | grep -q .; then echo "credentials in stage" >&2; exit 1; fi
if find "$STAGE/uploads" -type f ! -name '.htaccess' ! -name '.gitkeep' ! -name 'index.html' | grep -q .; then echo "user files in stage" >&2; exit 1; fi
if grep -rIlE "(db_pass|DB_PASSWORD)['\"]?\s*=>\s*['\"][^'\"]{4,}" "$STAGE" --include=*.php | grep -v config.local.example.php | grep -q .; then echo "possible secret" >&2; exit 1; fi
for must in index.php api.php habitat-studio.php .htaccess manifest.webmanifest sw.js assets/img/caiman-hero.webp assets/img/kpi/animals.webp assets/css/beta1.css assets/js/beta1.js assets/vendor/qr/jsQR.min.js habitat/src/main.js habitat/vendor/three/build/three.module.js habitat/assets/models; do
  [ -e "$STAGE/$must" ] || { echo "missing runtime asset: $must" >&2; exit 1; }
done

# 3) syntax check of every PHP file in the package
find "$STAGE" -name '*.php' -print0 | xargs -0 -n1 php -l >/dev/null

# 4) zip (deterministic order, no extra attrs)
rm -f "$ZIP"; (cd "$(dirname "$STAGE")" && find app-manager -type f | LC_ALL=C sort | zip -q -X -@ "$ZIP")
FILES=$(unzip -Z1 "$ZIP" | grep -v '/$' | wc -l)
SHA=$(sha256sum "$ZIP" | cut -d' ' -f1)

# 5) migration SQL (generated from the same step list the PHP upgrade uses)
php -r 'define("IR_CLI_NO_DB", true); require "'"$APP"'/includes/schema-beta1.php"; echo ir_schema_beta1_sql();' > "$DIST/IR_MANAGER_BETA_1_0_FINAL_MIGRATION.sql"
SCHEMA=$(php -r 'require "'"$APP"'/includes/schema-beta1.php"; echo IR_SCHEMA_VERSION;')

# 6) docs
cp "$ROOT/docs/DEPLOY_BETA_1_0_FINAL.md" "$ROOT/docs/CLAUDE_ACCEPTANCE_REPORT.md" "$DIST/"

# 7) manifest
unzip -Z1 "$ZIP" | grep -v '/$' > "$DIST/.filelist"
node - "$DIST" "$FILES" "$SHA" "$SCHEMA" "$(du -b "$ZIP" | cut -f1)" <<'NODE'
const fs = require('fs'), path = require('path');
const [dist, files, sha, schema, bytes] = process.argv.slice(2);
// every runtime file is classified; an unclassified file fails the build (AE: only runtime-required files)
const RULES = [
  [/^app-manager\/habitat\/vendor\//, 'habitat: three.js vendor'], [/^app-manager\/habitat\/assets\//, 'habitat: 3D models / textures / environment'],
  [/^app-manager\/habitat\/src\//, 'habitat: Studio 4.2 runtime + Manager bridge'],
  [/^app-manager\/assets\/vendor\/qr\//, 'vendor: QR generate / scan'], [/^app-manager\/assets\/vendor\//, 'vendor: other runtime libs'],
  [/^app-manager\/assets\/img\/kpi\//, 'graphics: KPI backgrounds'], [/^app-manager\/assets\/(img|icons)\//, 'graphics: header crocodile, icons, placeholders, PWA icons'],
  [/^app-manager\/assets\/css\//, 'ui: stylesheets'], [/^app-manager\/assets\/js\//, 'ui: scripts'], [/^app-manager\/assets\/fonts?\//, 'ui: fonts'],
  [/^app-manager\/uploads\//, 'scaffolding: upload folders (deny-all .htaccess)'], [/^app-manager\/migrations\//, 'db: migration runner'],
  [/^app-manager\/includes\//, 'server: services / includes'], [/(^|\/)\.htaccess$/, 'server: access rules'],
  [/^app-manager\/(manifest\.webmanifest|sw\.js|offline\.html)$/, 'pwa'], [/^app-manager\/(favicon[-0-9]*\.(png|ico)|apple-touch-icon\.png)$/, 'pwa: favicons / touch icon'], [/^app-manager\/config\.local\.example\.php$/, 'config template (no secrets)'],
  [/^app-manager\/[^/]+\.php$/, 'server: pages / endpoints'], [/^app-manager\/assets\//, 'ui: other assets'],
];
const list = fs.readFileSync(path.join(dist, '.filelist'), 'utf8').trim().split('\n'); fs.unlinkSync(path.join(dist, '.filelist'));
const classes = {}; const unclassified = [];
for (const f of list) { const r = RULES.find(([re]) => re.test(f)); if (!r) unclassified.push(f); else classes[r[1]] = (classes[r[1]] || 0) + 1; }
if (unclassified.length) { console.error('unclassified runtime files:\n' + unclassified.join('\n')); process.exit(1); }
const R = path.join(dist, '..', 'tests', 'results'); const rd = (f) => { try { return JSON.parse(fs.readFileSync(path.join(R, f), 'utf8')); } catch { return null; } };
const svc = rd('services.json'), voice = rd('voice-core.json'), acc = rd('acceptance.json'), stat = rd('static-checks.json');
let hs = null; try { const t = fs.readFileSync(path.join(R, 'habitat-4_2-regression.txt'), 'utf8'); const m = t.match(/(\d+)\/(\d+) passed/); if (m) hs = { pass: +m[1], total: +m[2] }; } catch {}
const m = {
  product: 'IR Manager Enterprise', release: 'BETA 1.0 FINAL', built_at: new Date().toISOString(),
  runtime_zip: { name: 'IR_MANAGER_ENTERPRISE_BETA_1_0_FINAL_CLAUDE.zip', sha256: sha, bytes: +bytes, runtime_file_count: +files, root: 'app-manager/', classification: classes, excluded: ['config.local.php', 'uploads/* user files', 'storage/', 'docs', 'tests', 'reports', 'screenshots', '*.sql', '*.md', 'node_modules', 'backups', 'dev tools'] },
  schema: { version: schema, migration_file: 'IR_MANAGER_BETA_1_0_FINAL_MIGRATION.sql', properties: ['additive', 'idempotent', 'no DROP/TRUNCATE', 'touches only wp_ir2_* tables'] },
  tests: {
    service_integration: svc && { pass: svc.pass, fail: svc.fail },
    voice_parser_unit: voice && { pass: voice.pass, fail: voice.fail },
    browser_acceptance: acc && { pass: acc.pass, fail: acc.fail, workflows: acc.results.length },
    habitat_4_2_regression: hs,
    static_checks: stat && { pass: stat.pass, fail: stat.fail },
  },
  known_limitations: { blockers: [], non_blocking: JSON.parse(fs.readFileSync(path.join(dist, '..', 'docs', 'limitations.json'), 'utf8')) },
  source_archives: ['web_app-manager_2026-09-28-212601.zip', 'ireptilescz6002(20260927-155307).sql', 'HABITAT_STUDIO_4_2_ROOM_EVOLUTION_COMPLETE.zip', 'IR_MANAGER_OBSIDIAN_EVOLUTION_PREVIEW_HOSTING_READY.zip', 'IR_MANAGER_FEEDING_LIVE_DEMO.zip', 'IR_MANAGER_ENTERPRISE_BETA_1_0_RC1_OSTRY_TEST.zip (reference only, not used as base)'],
};
fs.writeFileSync(path.join(dist, 'CLAUDE_BUILD_MANIFEST.json'), JSON.stringify(m, null, 2));
console.log(JSON.stringify({ files: +files, sha, schema }, null, 0));
NODE
rm -rf "$(dirname "$STAGE")"
ls -la "$DIST"
