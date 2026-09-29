<?php
declare(strict_types=1);

/* Security hardening 065: additive/idempotent only. */

// Database-level uniqueness for password-reset identity.
$idx=$pdo->prepare("SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME='uniq_email'");
$idx->execute([IR_AUTH_TABLE]);
if((int)$idx->fetchColumn()===0){
    $dup=$pdo->query("SELECT LOWER(email) e,COUNT(*) c FROM `".IR_AUTH_TABLE."` WHERE email IS NOT NULL AND TRIM(email)<>'' GROUP BY LOWER(email) HAVING COUNT(*)>1 LIMIT 1")->fetch();
    if($dup)throw new RuntimeException('Nelze vytvořit unikátní index e-mailu: v uživatelích existuje duplicitní e-mail '.$dup['e'].'. Nejdříve ho oprav v Admin panelu.');
    $pdo->exec("ALTER TABLE `".IR_AUTH_TABLE."` ADD UNIQUE KEY uniq_email (email)");
}

// Self-contained tables formerly supplied by an external migration package.
$pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_contacts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id BIGINT UNSIGNED NOT NULL,type VARCHAR(40) NOT NULL DEFAULT 'chovatel',name VARCHAR(160) NOT NULL,company VARCHAR(160) NULL,email VARCHAR(190) NULL,phone VARCHAR(80) NULL,address VARCHAR(255) NULL,country VARCHAR(80) NULL,species TEXT NULL,notes TEXT NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY ix_contacts_user(user_id),KEY ix_contacts_name(user_id,name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
$pdo->exec("CREATE TABLE IF NOT EXISTS wp_ir2_documents (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,user_id BIGINT UNSIGNED NOT NULL,animal_id BIGINT UNSIGNED NULL,contact_id BIGINT UNSIGNED NULL,health_ref VARCHAR(120) NULL,category VARCHAR(60) NOT NULL DEFAULT 'ostatni',title VARCHAR(190) NOT NULL,language_mode VARCHAR(20) NOT NULL DEFAULT 'CZ+EN+DE',template_key VARCHAR(60) NULL,body_cs LONGTEXT NULL,body_en LONGTEXT NULL,body_de LONGTEXT NULL,file_name VARCHAR(255) NULL,file_path VARCHAR(255) NULL,mime_type VARCHAR(100) NULL,file_size BIGINT UNSIGNED NULL,created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,PRIMARY KEY(id),KEY ix_docs_user(user_id),KEY ix_docs_animal(user_id,animal_id),KEY ix_docs_contact(user_id,contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

echo "Migrace 065: unikátní e-mail a bezpečnostní podpůrné tabulky ověřeny.\n";
