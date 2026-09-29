-- IR Manager BETA 1.0 FINAL — safe additive migration 20260929_070_beta1_final
-- Additive and idempotent: every step checks information_schema first. No DROP, no TRUNCATE, no data rewrite
-- except filling NEW NULL columns. Touches only wp_ir2_* tables. Safe to run more than once.
-- Run against the IR Manager database (the same one as config.local.php db_name).

SET NAMES utf8mb4;

-- column wp_ir2_pece.vysledek
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='vysledek')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `vysledek` VARCHAR(20) NULL DEFAULT NULL COMMENT ''eaten|refused|in_shed|not_fed|observed|completed''', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.zdroj
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='zdroj')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `zdroj` VARCHAR(20) NULL DEFAULT NULL COMMENT ''qr|nfc|voice|planner|quick|manual|profile|bulk|import''', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.davka_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='davka_id')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `davka_id` VARCHAR(40) NULL DEFAULT NULL COMMENT ''batch id: one Krmeni xN session''', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.skupina_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='skupina_id')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `skupina_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.krmivo
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='krmivo')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `krmivo` VARCHAR(190) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.mnozstvi
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='mnozstvi')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `mnozstvi` DECIMAL(10,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.suplement
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='suplement')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `suplement` VARCHAR(190) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.planovac_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='planovac_id')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `planovac_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.vytvoreno
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='vytvoreno')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `vytvoreno` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.upraveno
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='upraveno')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `upraveno` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.autor_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='autor_id')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `autor_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_pece.upravil_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND COLUMN_NAME='upravil_id')=0, 'ALTER TABLE `wp_ir2_pece` ADD COLUMN `upravil_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- index wp_ir2_pece index ir70_user_animal_type_date
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND INDEX_NAME='ir70_user_animal_type_date')=0, 'ALTER TABLE `wp_ir2_pece` ADD INDEX `ir70_user_animal_type_date` (user_id,zvire_id,typ,datum)', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- index wp_ir2_pece index ir70_user_batch
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND INDEX_NAME='ir70_user_batch')=0, 'ALTER TABLE `wp_ir2_pece` ADD INDEX `ir70_user_batch` (user_id,davka_id)', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- index wp_ir2_pece index ir70_user_date
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece' AND INDEX_NAME='ir70_user_date')=0, 'ALTER TABLE `wp_ir2_pece` ADD INDEX `ir70_user_date` (user_id,datum)', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_pece_kos
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_pece_kos')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_pece_kos` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, pece_id BIGINT UNSIGNED NOT NULL, zvire_id INT UNSIGNED NULL, row_json LONGTEXT NOT NULL, smazano DATETIME NOT NULL, smazal_id INT UNSIGNED NULL, obnoveno DATETIME NULL, PRIMARY KEY(id), KEY user_deleted(user_id,smazano), KEY pece(pece_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_event_batches
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_event_batches')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_event_batches` (id VARCHAR(40) NOT NULL, user_id INT UNSIGNED NOT NULL, typ VARCHAR(100) NOT NULL, datum DATETIME NOT NULL, zdroj VARCHAR(20) NULL, skupina_id INT UNSIGNED NULL, planovac_id INT UNSIGNED NULL, pocet INT UNSIGNED NOT NULL DEFAULT 0, souhrn_json TEXT NULL, poznamka TEXT NULL, vytvoreno DATETIME NOT NULL, upraveno DATETIME NULL, autor_id INT UNSIGNED NULL, PRIMARY KEY(id), KEY user_date(user_id,datum)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_audit
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_audit')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_audit` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, account_id INT UNSIGNED NULL, actor_id INT UNSIGNED NULL, entity VARCHAR(60) NOT NULL, entity_id VARCHAR(64) NULL, action VARCHAR(60) NOT NULL, before_json LONGTEXT NULL, after_json LONGTEXT NULL, ip VARCHAR(64) NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY account_date(account_id,created_at), KEY entity(entity,entity_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.qr_token
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='qr_token')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `qr_token` VARCHAR(24) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.status_pred_archivaci
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='status_pred_archivaci')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `status_pred_archivaci` VARCHAR(60) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.archivovano
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='archivovano')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `archivovano` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.prah_odmitnuti
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='prah_odmitnuti')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `prah_odmitnuti` TINYINT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.zamceno_kvota
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='zamceno_kvota')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `zamceno_kvota` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.verejny_profil
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='verejny_profil')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `verejny_profil` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.prodejni_cena
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='prodejni_cena')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `prodejni_cena` DECIMAL(12,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.nocni_pokles
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='nocni_pokles')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `nocni_pokles` VARCHAR(80) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zvirata.okno_pareni
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND COLUMN_NAME='okno_pareni')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD COLUMN `okno_pareni` VARCHAR(120) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- index wp_ir2_zvirata index ir70_qr
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zvirata' AND INDEX_NAME='ir70_qr')=0, 'ALTER TABLE `wp_ir2_zvirata` ADD INDEX `ir70_qr` (user_id,qr_token)', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.qr_token
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='qr_token')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `qr_token` VARCHAR(24) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.klon_zdroj_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='klon_zdroj_id')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `klon_zdroj_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.sirka_cm
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='sirka_cm')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `sirka_cm` DECIMAL(8,1) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.hloubka_cm
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='hloubka_cm')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `hloubka_cm` DECIMAL(8,1) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.vyska_cm
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='vyska_cm')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `vyska_cm` DECIMAL(8,1) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.technika
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='technika')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `technika` TEXT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.pece_nastaveni
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='pece_nastaveni')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `pece_nastaveni` TEXT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.habitat_json
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='habitat_json')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `habitat_json` LONGTEXT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.archivovano
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='archivovano')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `archivovano` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.vytvoreno
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='vytvoreno')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `vytvoreno` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.upraveno
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='upraveno')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `upraveno` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.habitat_instance_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='habitat_instance_id')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `habitat_instance_id` VARCHAR(64) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_ubikace.habitat_template_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND COLUMN_NAME='habitat_template_id')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD COLUMN `habitat_template_id` VARCHAR(64) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- index wp_ir2_ubikace index ir70_qr
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND INDEX_NAME='ir70_qr')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD INDEX `ir70_qr` (user_id,qr_token)', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- index wp_ir2_ubikace index ir70_habitat_inst
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace')=1 AND (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_ubikace' AND INDEX_NAME='ir70_habitat_inst')=0, 'ALTER TABLE `wp_ir2_ubikace` ADD INDEX `ir70_habitat_inst` (user_id,habitat_instance_id)', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_taxon_aliases
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_taxon_aliases')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_taxon_aliases` (id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, druh_id INT UNSIGNED NOT NULL, alias VARCHAR(190) NOT NULL, typ VARCHAR(20) NOT NULL DEFAULT ''synonym'' COMMENT ''synonym|common|trade|locality|morph'', jazyk VARCHAR(5) NULL, PRIMARY KEY(id), KEY user_alias(user_id,alias), KEY druh(druh_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2__uzivatele.owner_user_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele' AND COLUMN_NAME='owner_user_id')=0, 'ALTER TABLE `wp_ir2__uzivatele` ADD COLUMN `owner_user_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2__uzivatele.posledni_prihlaseni
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele' AND COLUMN_NAME='posledni_prihlaseni')=0, 'ALTER TABLE `wp_ir2__uzivatele` ADD COLUMN `posledni_prihlaseni` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2__uzivatele.suspended_at
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele' AND COLUMN_NAME='suspended_at')=0, 'ALTER TABLE `wp_ir2__uzivatele` ADD COLUMN `suspended_at` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2__uzivatele.suspend_reason
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele' AND COLUMN_NAME='suspend_reason')=0, 'ALTER TABLE `wp_ir2__uzivatele` ADD COLUMN `suspend_reason` VARCHAR(255) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2__uzivatele.session_version
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2__uzivatele' AND COLUMN_NAME='session_version')=0, 'ALTER TABLE `wp_ir2__uzivatele` ADD COLUMN `session_version` INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_account_notes
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_account_notes')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_account_notes` (id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, author_id INT UNSIGNED NULL, note TEXT NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user(user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_feature_flags
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_feature_flags')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_feature_flags` (id INT UNSIGNED NOT NULL AUTO_INCREMENT, flag_key VARCHAR(80) NOT NULL, user_id INT UNSIGNED NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1, updated_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY flag_user(flag_key,user_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_jobs
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_jobs')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_jobs` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, job_type VARCHAR(60) NOT NULL, user_id INT UNSIGNED NULL, status VARCHAR(20) NOT NULL DEFAULT ''queued'', payload TEXT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0, last_error TEXT NULL, run_after DATETIME NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), KEY status(status,run_after)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_backups
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_backups')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_backups` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NULL, kind VARCHAR(20) NOT NULL DEFAULT ''export'', file_name VARCHAR(190) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0, sha256 CHAR(64) NULL, status VARCHAR(20) NOT NULL DEFAULT ''ok'', created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user_date(user_id,created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_backups.error
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_backups')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_backups' AND COLUMN_NAME='error')=0, 'ALTER TABLE `wp_ir2_backups` ADD COLUMN `error` TEXT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_plans
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_plans')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_plans` (code VARCHAR(30) NOT NULL, name VARCHAR(80) NOT NULL, price_month DECIMAL(10,2) NULL, price_year DECIMAL(10,2) NULL, price_lifetime DECIMAL(10,2) NULL, currency CHAR(3) NOT NULL DEFAULT ''CZK'', max_animals INT UNSIGNED NULL COMMENT ''NULL = unlimited'', max_users INT UNSIGNED NOT NULL DEFAULT 1, storage_mb INT UNSIGNED NOT NULL DEFAULT 200, features_json TEXT NOT NULL, allow_month TINYINT(1) NOT NULL DEFAULT 1, allow_year TINYINT(1) NOT NULL DEFAULT 1, allow_lifetime TINYINT(1) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, sort_order INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL, PRIMARY KEY(code)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_subscriptions
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_subscriptions')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_subscriptions` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, plan_code VARCHAR(30) NOT NULL, period VARCHAR(10) NOT NULL DEFAULT ''month'' COMMENT ''month|year|lifetime|manual'', provider VARCHAR(30) NOT NULL COMMENT ''revolut_web|apple_app_store|google_play|admin_manual'', provider_customer_id VARCHAR(190) NULL, provider_subscription_id VARCHAR(190) NULL, status VARCHAR(20) NOT NULL COMMENT ''active|trialing|past_due|canceled|expired|refunded|pending'', valid_from DATETIME NOT NULL, valid_until DATETIME NULL, cancel_at_period_end TINYINT(1) NOT NULL DEFAULT 0, note VARCHAR(255) NULL, created_by INT UNSIGNED NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user_status(user_id,status), KEY provider_sub(provider,provider_subscription_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_billing_orders
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_billing_orders')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_billing_orders` (id VARCHAR(40) NOT NULL, user_id INT UNSIGNED NOT NULL, plan_code VARCHAR(30) NOT NULL, period VARCHAR(10) NOT NULL, amount_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL, provider VARCHAR(30) NOT NULL, provider_order_id VARCHAR(190) NULL, provider_customer_id VARCHAR(190) NULL, status VARCHAR(20) NOT NULL DEFAULT ''created'', checkout_url TEXT NULL, subscription_id BIGINT UNSIGNED NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), KEY user(user_id), KEY provider_order(provider,provider_order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_billing_payments
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_billing_payments')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_billing_payments` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id VARCHAR(40) NOT NULL, provider VARCHAR(30) NOT NULL, provider_payment_id VARCHAR(190) NULL, status VARCHAR(20) NOT NULL, amount_minor BIGINT NOT NULL, currency CHAR(3) NOT NULL, raw_json LONGTEXT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY order_id(order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_billing_refunds
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_billing_refunds')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_billing_refunds` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, order_id VARCHAR(40) NOT NULL, provider VARCHAR(30) NOT NULL, provider_refund_id VARCHAR(190) NULL, amount_minor BIGINT NOT NULL, status VARCHAR(20) NOT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), KEY order_id(order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_billing_webhooks
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_billing_webhooks')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_billing_webhooks` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, provider VARCHAR(30) NOT NULL, event_id VARCHAR(190) NOT NULL, event_type VARCHAR(80) NULL, signature_ok TINYINT(1) NOT NULL DEFAULT 0, payload LONGTEXT NOT NULL, processed_at DATETIME NULL, error TEXT NULL, created_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY provider_event(provider,event_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_files
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_files')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_files` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, entity VARCHAR(30) NOT NULL COMMENT ''health|animal|enclosure|finance'', entity_id BIGINT UNSIGNED NOT NULL, kind VARCHAR(40) NULL, original_name VARCHAR(190) NOT NULL, stored_path VARCHAR(255) NOT NULL, mime VARCHAR(100) NOT NULL, size_bytes BIGINT UNSIGNED NOT NULL, sha256 CHAR(64) NOT NULL, note VARCHAR(255) NULL, created_at DATETIME NOT NULL, deleted_at DATETIME NULL, PRIMARY KEY(id), KEY entity(user_id,entity,entity_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zdravi.kontrola_datum
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zdravi')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zdravi' AND COLUMN_NAME='kontrola_datum')=0, 'ALTER TABLE `wp_ir2_zdravi` ADD COLUMN `kontrola_datum` DATE NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_zdravi.upraveno
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zdravi')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_zdravi' AND COLUMN_NAME='upraveno')=0, 'ALTER TABLE `wp_ir2_zdravi` ADD COLUMN `upraveno` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_habitat_docs
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_habitat_docs')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_habitat_docs` (id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, room_key VARCHAR(40) NOT NULL, name VARCHAR(190) NOT NULL, doc_json LONGTEXT NOT NULL, revision INT UNSIGNED NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(id), UNIQUE KEY user_room(user_id,room_key)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_habitat_assemblies
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_habitat_assemblies')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_habitat_assemblies` (id INT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, asm_key VARCHAR(64) NOT NULL, rack_id INT UNSIGNED NULL, name VARCHAR(190) NOT NULL, asm_json LONGTEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, deleted_at DATETIME NULL, PRIMARY KEY(id), UNIQUE KEY user_asm(user_id,asm_key), KEY rack(rack_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_sklad.cena_ks
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_sklad')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_sklad' AND COLUMN_NAME='cena_ks')=0, 'ALTER TABLE `wp_ir2_sklad` ADD COLUMN `cena_ks` DECIMAL(12,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_sklad.druh_skladu
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_sklad')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_sklad' AND COLUMN_NAME='druh_skladu')=0, 'ALTER TABLE `wp_ir2_sklad` ADD COLUMN `druh_skladu` VARCHAR(20) NULL DEFAULT NULL COMMENT ''live|frozen|equipment|supplement|technical|custom''', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_sklad.aliasy
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_sklad')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_sklad' AND COLUMN_NAME='aliasy')=0, 'ALTER TABLE `wp_ir2_sklad` ADD COLUMN `aliasy` VARCHAR(255) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_nakupni_list.sklad_id
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_nakupni_list')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_nakupni_list' AND COLUMN_NAME='sklad_id')=0, 'ALTER TABLE `wp_ir2_nakupni_list` ADD COLUMN `sklad_id` INT UNSIGNED NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_nakupni_list.cena_odhad
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_nakupni_list')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_nakupni_list' AND COLUMN_NAME='cena_odhad')=0, 'ALTER TABLE `wp_ir2_nakupni_list` ADD COLUMN `cena_odhad` DECIMAL(12,2) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- table wp_ir2_finance_lines
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance_lines')=0, 'CREATE TABLE IF NOT EXISTS `wp_ir2_finance_lines` (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, user_id INT UNSIGNED NOT NULL, finance_id INT UNSIGNED NOT NULL, item VARCHAR(190) NOT NULL, qty DECIMAL(12,3) NOT NULL DEFAULT 1, unit VARCHAR(20) NULL, unit_price DECIMAL(12,2) NOT NULL DEFAULT 0, discount_pct DECIMAL(5,2) NULL, vat_pct DECIMAL(5,2) NULL, subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, total DECIMAL(12,2) NOT NULL DEFAULT 0, cost DECIMAL(12,2) NULL, sort_order INT NOT NULL DEFAULT 0, PRIMARY KEY(id), KEY fin(user_id,finance_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_finance.upraveno
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance' AND COLUMN_NAME='upraveno')=0, 'ALTER TABLE `wp_ir2_finance` ADD COLUMN `upraveno` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_finance.smazano
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance' AND COLUMN_NAME='smazano')=0, 'ALTER TABLE `wp_ir2_finance` ADD COLUMN `smazano` DATETIME NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
-- column wp_ir2_finance.doklad
SET @ir_sql := IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance')=1 AND (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wp_ir2_finance' AND COLUMN_NAME='doklad')=0, 'ALTER TABLE `wp_ir2_finance` ADD COLUMN `doklad` VARCHAR(80) NULL DEFAULT NULL', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;

-- default plan matrix (INSERT IGNORE: admin edits are never overwritten)
INSERT IGNORE INTO wp_ir2_plans(code,name,price_month,price_year,price_lifetime,currency,max_animals,max_users,storage_mb,features_json,allow_month,allow_year,allow_lifetime,active,sort_order,updated_at) VALUES('free','Free',0,0,NULL,'CZK',10,1,200,'{"animals":true,"enclosures":true,"care_history":true,"planner_basic":true,"qr":true,"documents_basic":true,"export":true}',1,1,0,1,10,NOW());
INSERT IGNORE INTO wp_ir2_plans(code,name,price_month,price_year,price_lifetime,currency,max_animals,max_users,storage_mb,features_json,allow_month,allow_year,allow_lifetime,active,sort_order,updated_at) VALUES('premium','Premium',129,1290,NULL,'CZK',100,1,2048,'{"animals":true,"enclosures":true,"care_history":true,"planner_basic":true,"qr":true,"documents_basic":true,"export":true,"planner_advanced":true,"automation":true,"reproduction":true,"genetics":true,"supplements":true,"inventory":true,"reports":true,"habitat_planner":true,"habitat_assembly":true,"documents_extended":true,"voice":true,"finance":true}',1,1,0,1,20,NOW());
INSERT IGNORE INTO wp_ir2_plans(code,name,price_month,price_year,price_lifetime,currency,max_animals,max_users,storage_mb,features_json,allow_month,allow_year,allow_lifetime,active,sort_order,updated_at) VALUES('pro','Pro / Breeder',249,2490,NULL,'CZK',NULL,3,10240,'{"animals":true,"enclosures":true,"care_history":true,"planner_basic":true,"qr":true,"documents_basic":true,"export":true,"planner_advanced":true,"automation":true,"reproduction":true,"genetics":true,"supplements":true,"inventory":true,"reports":true,"habitat_planner":true,"habitat_assembly":true,"documents_extended":true,"voice":true,"finance":true,"habitat_showcase":true,"habitat_techplan":true,"automation_advanced":true,"public_sales":true,"exports_advanced":true,"backups":true,"multi_user":true,"priority_support":true}',1,1,0,1,30,NOW());
INSERT IGNORE INTO wp_ir2_plans(code,name,price_month,price_year,price_lifetime,currency,max_animals,max_users,storage_mb,features_json,allow_month,allow_year,allow_lifetime,active,sort_order,updated_at) VALUES('platinum','Platinum Lifetime',NULL,NULL,7990,'CZK',NULL,3,10240,'{"animals":true,"enclosures":true,"care_history":true,"planner_basic":true,"qr":true,"documents_basic":true,"export":true,"planner_advanced":true,"automation":true,"reproduction":true,"genetics":true,"supplements":true,"inventory":true,"reports":true,"habitat_planner":true,"habitat_assembly":true,"documents_extended":true,"voice":true,"finance":true,"habitat_showcase":true,"habitat_techplan":true,"automation_advanced":true,"public_sales":true,"exports_advanced":true,"backups":true,"multi_user":true,"priority_support":true}',0,0,1,1,40,NOW());

-- backfill only NEW columns (NULL values) of historical records
UPDATE wp_ir2_pece SET vysledek='eaten' WHERE vysledek IS NULL AND typ='Krmení';
UPDATE wp_ir2_pece SET vysledek='refused' WHERE vysledek IS NULL AND typ='Odmítnutí potravy';
UPDATE wp_ir2_pece SET vytvoreno=datum WHERE vytvoreno IS NULL;
-- the first existing administrator becomes SUPERADMIN (only when no superadmin exists yet)
SET @ir_has_super := (SELECT COUNT(*) FROM wp_ir2__uzivatele WHERE role='superadmin');
SET @ir_sql := IF(@ir_has_super=0, 'UPDATE wp_ir2__uzivatele SET role=''superadmin'' WHERE role=''admin'' ORDER BY id LIMIT 1', 'SELECT 1');
PREPARE ir_stmt FROM @ir_sql; EXECUTE ir_stmt; DEALLOCATE PREPARE ir_stmt;
CREATE TABLE IF NOT EXISTS wp_ir2_schema_migrations (id INT UNSIGNED NOT NULL AUTO_INCREMENT,migration VARCHAR(190) NOT NULL,notes TEXT NULL,applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_migration(migration)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO wp_ir2_schema_migrations(migration,notes) VALUES('20260929_070_beta1_final','BETA 1.0 FINAL additive migration (manual SQL).');
