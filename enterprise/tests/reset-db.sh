#!/bin/bash
# Fresh test database = real production dump (read-only input) + BETA 1.0 migration. Local only.
set -e
DB=${1:-ir_test}
mysql -uroot -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; GRANT ALL ON $DB.* TO 'irdev'@'localhost';"
mysql -uroot --init-command="SET SESSION sql_mode=''" $DB < <(sed -e 's/utf8mb4_0900_ai_ci/utf8mb4_unicode_ci/g' -e 's/^INSERT DELAYED IGNORE INTO/INSERT IGNORE INTO/' -e '/^CREATE DATABASE/d' -e '/^USE `/d' /home/user/inputs/ireptilescz6002.sql)
if [ "$2" != "nomigrate" ]; then
  IR_DB_NAME=$DB php -r 'define("IR_PUBLIC_PAGE",true); require "/home/user/ir-manager-habitat-next/enterprise/app-manager/includes/config.php"; require_once IR_ROOT."/includes/schema-beta1.php"; echo count(ir_schema_beta1_apply($pdo))," migration steps\n";'
fi
