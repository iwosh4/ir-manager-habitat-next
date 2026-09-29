# IR Manager Enterprise — BETA 1.0 FINAL · Deployment

Target: the existing hosting of `ireptiles.cz` (PHP 8.1+ with PDO MySQL, `fileinfo`, `zip`, `curl`; MySQL 8.0 / MariaDB 10.6+).
The package replaces the **code** of `/app-manager/`. It never contains, and never overwrites, your database,
`config.local.php` or user uploads.

## Contents of the delivery

| File | What it is |
|---|---|
| `IR_MANAGER_ENTERPRISE_BETA_1_0_FINAL_CLAUDE.zip` | Runtime only — a clean `app-manager/` folder (PHP, CSS/JS, KPI and crocodile images, PWA files, `.htaccess`, Habitat Studio 4.2 runtime + three.js vendor, QR vendor libs, empty upload scaffolding). No credentials, SQL, docs, tests or user files. |
| `IR_MANAGER_BETA_1_0_FINAL_MIGRATION.sql` | Additive, idempotent migration `20260929_070_beta1_final`. Only `wp_ir2_*` tables. No `DROP` / `TRUNCATE` / data rewrite. |
| `DEPLOY_BETA_1_0_FINAL.md` | This guide. |
| `CLAUDE_ACCEPTANCE_REPORT.md` | Requirement → implementation → test → result → evidence. |
| `CLAUDE_BUILD_MANIFEST.json` | File count, SHA-256 of the ZIP, schema version, test counts, limitations, source archives. |

Verify the ZIP before uploading: `sha256sum IR_MANAGER_ENTERPRISE_BETA_1_0_FINAL_CLAUDE.zip` must equal `runtime_zip.sha256` in the manifest.

## 1. Back up (5 minutes, do not skip)

1. **Database** — phpMyAdmin → Export → the whole database (or `mysqldump --single-transaction --routines ireptilescz6002 > backup-before-beta1.sql`).
2. **Files** — download the current `/app-manager/` folder, at least:
   * `app-manager/config.local.php` (database credentials — the new ZIP does not contain it)
   * `app-manager/uploads/` (all animal photos, avatars, pedigree images, documents, attachments)

## 2. Replace the code (clean replacement)

1. Upload the ZIP next to the current folder and unpack it into a **new** folder, e.g. `/app-manager-new/`.
2. Copy into the new folder from the old one:
   * `app-manager/config.local.php`
   * the whole `app-manager/uploads/` folder (merge — the ZIP only brings empty scaffolding and `.htaccess` files)
3. Rename `/app-manager/` → `/app-manager-old/` and `/app-manager-new/` → `/app-manager/`.
   (Keep `-old` until you have verified the release; rollback = rename back + restore the DB backup.)

Never delete `uploads/` — it is user data and is not part of any package.

## 3. Migrate the database (either way — both are idempotent and identical)

* **A — in the app (recommended):** log in as the administrator → *Administrace → Systém → Aktualizace databáze* (`upgrade.php`) → *Spustit*.
  The runner applies migrations 046, 065 and 070 only where needed and prints each step.
* **B — SQL:** phpMyAdmin → select the database → *Import* → `IR_MANAGER_BETA_1_0_FINAL_MIGRATION.sql`.

Re-running either path is safe: existing columns, indexes and tables are detected and skipped, default plans are
inserted with `INSERT IGNORE`, backfills only fill `NULL` values. The first existing administrator becomes
`superadmin` only when no superadmin exists yet.

## 4. Optional configuration (`config.local.php`)

```php
return [
  // … existing db_* keys stay unchanged …
  'public_url' => 'https://www.ireptiles.cz/app-manager',   // used for QR labels and payment return URLs
  // Revolut Merchant (online payments). Without these keys the plans page shows prices but refuses checkout,
  // and administrators can still grant plans manually (Administrace → Účty → Tarif).
  'revolut_env' => 'sandbox',                 // 'production' when going live
  'revolut_secret_key' => '…',                // Merchant API secret key — never in JS, never in the ZIP
  'revolut_webhook_secret' => '…',            // signing secret of the webhook below
];
```

Revolut Business → Merchant API → Webhooks → URL: `https://<domain>/app-manager/billing-webhook.php?provider=revolut`,
events `ORDER_COMPLETED`, `ORDER_AUTHORISED`, `ORDER_CANCELLED`, `ORDER_FAILED`. A plan is activated only after the
server re-fetches the order from Revolut and it is `completed` with the expected amount — never from the browser redirect.

## 5. Scheduled job (daily)

Hosting cron (e.g. 03:17 every day):

```
php /path/to/app-manager/cron.php all
```

* `backup` — one data backup ZIP per account in `app-manager/storage/backups/` (web access denied), 14 kept.
* `billing-sync` — re-checks pending Revolut orders (missed webhooks), expires ended subscriptions.

## 6. Post-deploy check (10 minutes)

1. Log in → Dashboard: header order *Rychlý záznam → QR → Hlas → Hledat → Oznámení → Profil → krokodýl*, LIVE strip, 6 KPI images.
2. *Administrace → Systém*: schema “Aktuální”, migration `20260929_070_beta1_final` listed.
3. *Nastavení → Bezpečnost dat*: integrity report green/amber, download the ZIP export once.
4. Open an animal → *Krmení* → pick a result → the record appears in *Historie aktivit* under **DNES**.
5. *Ubikace → Habitat Studio 3D*: your enclosures are under **MOJE UBIKACE**, status “Uloženo”, *← IR MANAGER* returns.
   The first opening converts the room from the previous studio (old tables are only read).
6. Phone: bottom navigation *Domů · Zvířata · + · Úkoly · Více*; QR button opens the camera (HTTPS required).

## Notes

* Plans: existing accounts start on **FREE (10 animals)** unless a subscription/manual grant exists. Nothing is ever
  deleted on a lower plan — animals above the limit become read-only. Grant plans in *Administrace → Účty*.
* Home Assistant is intentionally not part of this release; device/port ids in Habitat stay stable for later.
* The old Home Assistant connector page (`habitat-home-assistant.php`) is no longer part of the runtime. Its database
  tables and any stored connection rows are left untouched (nothing is dropped); the integration will return on top of
  Habitat's stable device/port ids in a later release.
