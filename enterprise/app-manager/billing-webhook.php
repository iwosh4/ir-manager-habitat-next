<?php
declare(strict_types=1);
/*
 * Payment provider webhooks (no session). Revolut: signature-verified (Revolut-Signature + timestamp),
 * idempotent per event id; the order is then re-fetched from the Revolut API server-side — the webhook body
 * itself never grants anything. Non-2xx on processing error so the provider re-delivers.
 */
define('IR_PUBLIC_PAGE', true);
define('IR_API', true);
require __DIR__.'/includes/config.php';
require_once __DIR__.'/includes/reptile_core.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') ir_json(['ok' => false, 'error' => 'method'], 405);
$raw = (string)file_get_contents('php://input', false, null, 0, 1024 * 1024);
$headers = [];
foreach ($_SERVER as $k => $v) if (str_starts_with($k, 'HTTP_')) $headers[strtolower(str_replace('_', '-', substr($k, 5)))] = (string)$v;
$provider = (string)($_GET['provider'] ?? 'revolut');
try {
    $r = match ($provider) {
        'revolut' => ir_billing_handle_revolut_webhook($pdo, $raw, $headers),
        'google_play', 'apple_app_store' => ir_billing_store_notification($pdo, $provider, json_decode($raw, true) ?: []),
        default => ['status' => 'unknown_provider'],
    };
} catch (Throwable $e) {
    error_log('IR billing webhook: '.$e->getMessage());
    ir_json(['ok' => false], 500);
}
$code = match ($r['status'] ?? '') { 'rejected' => 401, 'error' => 500, 'unknown_provider' => 404, default => 200 };
ir_json(['ok' => $code === 200, 'status' => $r['status'] ?? ''], $code);
