#!/bin/bash
# Acceptance DB = fresh clone of the real dump + BETA 1.0 migration, with LOCAL-ONLY test credentials.
set -e
DB=${1:-ir_accept}
HERE=$(cd "$(dirname "$0")/.." && pwd)
bash "$HERE/reset-db.sh" "$DB" >/dev/null
APPDIR="$HERE/../app-manager" IR_DB_NAME=$DB php -r '
define("IR_PUBLIC_PAGE", true);
require getenv("APPDIR")."/includes/config.php";
$h = password_hash("Local-Test-2026!", PASSWORD_DEFAULT);
$pdo->prepare("UPDATE wp_ir2__uzivatele SET heslo=?, session_version=0 WHERE id=1")->execute([$h]);
// a second breeder account on FREE (quota / isolation tests)
$pdo->prepare("INSERT INTO wp_ir2__uzivatele(jmeno,heslo,email,role,is_active,created_at) VALUES(?,?,?,?,1,NOW())")->execute(["free.breeder", $h, "free@example.test", "user"]);
echo "accounts ready\n";
'
