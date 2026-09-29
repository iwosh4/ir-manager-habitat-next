<?php
declare(strict_types=1);
/*
 * Scheduled jobs — CLI only:  php /path/to/app-manager/cron.php backup|billing-sync|all
 * backup:       daily account backups (data ZIP) with retention (14 per account)
 * billing-sync: re-check pending Revolut orders (covers missed webhooks); expire ended subscriptions
 */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
define('IR_PUBLIC_PAGE', true);
require __DIR__.'/includes/config.php';
require_once __DIR__.'/includes/reptile_core.php';
$job = $argv[1] ?? 'all';
$out = [];
if ($job === 'backup' || $job === 'all') $out['backup'] = ir_backup_daily_all($pdo, (int)(getenv('IR_BACKUP_KEEP') ?: 14));
if ($job === 'billing-sync' || $job === 'all') {
    $n = 0; $err = 0;
    if (ir_billing_revolut_ready()) {
        $ids = $pdo->query("SELECT id FROM wp_ir2_billing_orders WHERE provider='revolut_web' AND status='pending' AND created_at>NOW()-INTERVAL 7 DAY")->fetchAll(PDO::FETCH_COLUMN) ?: [];
        foreach ($ids as $id) { try { ir_billing_sync_order($pdo, (string)$id); $n++; } catch (Throwable $e) { $err++; ir_job_fail($pdo, 'billing_sync', $e->getMessage(), ['order' => $id]); } }
    }
    $exp = $pdo->exec("UPDATE wp_ir2_subscriptions SET status='expired', updated_at=NOW() WHERE status IN ('active','trialing','past_due') AND valid_until IS NOT NULL AND valid_until<NOW()");
    $out['billing'] = ['synced' => $n, 'errors' => $err, 'expired' => (int)$exp];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE), "\n";
