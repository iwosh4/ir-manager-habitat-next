<?php
declare(strict_types=1);

/*
 * BILLING (provider-neutral).
 *   customer/account = wp_ir2__uzivatele (breeder account) · plan = wp_ir2_plans · subscription = entitlement
 *   period (wp_ir2_subscriptions) · order / payment / refund / webhook log (wp_ir2_billing_*).
 * Providers: revolut_web (Revolut Merchant API — hosted checkout + webhooks), apple_app_store, google_play
 * (interfaces prepared; server-side store verification is required before anything is granted),
 * admin_manual (admin override with expiry).
 *
 * Payment success is NEVER taken from the browser redirect. An order becomes paid only when the server
 * re-fetches it from the provider API (after a signature-verified webhook or an explicit sync) and the
 * provider state is `completed`. Every transition is idempotent (webhook event ids are unique; an order
 * activates at most one subscription period).
 * Secrets live only in config.local.php: revolut_secret_key, revolut_webhook_secret, revolut_env.
 */
const IR_BILLING_PROVIDERS = ['revolut_web' => 'Revolut (web)', 'apple_app_store' => 'Apple App Store', 'google_play' => 'Google Play', 'admin_manual' => 'Ruční přidělení (admin)'];

function ir_billing_config(): array {
    $c = is_file(IR_ROOT.'/config.local.php') ? (require IR_ROOT.'/config.local.php') : [];
    $c = is_array($c) ? $c : [];
    $env = getenv('IR_REVOLUT_ENV') ?: (string)($c['revolut_env'] ?? 'sandbox');
    return [
        'secret' => getenv('IR_REVOLUT_SECRET_KEY') ?: (string)($c['revolut_secret_key'] ?? ''),
        'webhook_secret' => getenv('IR_REVOLUT_WEBHOOK_SECRET') ?: (string)($c['revolut_webhook_secret'] ?? ''),
        'env' => $env === 'production' ? 'production' : 'sandbox',
        'base' => $env === 'production' ? 'https://merchant.revolut.com/api' : 'https://sandbox-merchant.revolut.com/api',
        'api_version' => (string)($c['revolut_api_version'] ?? '2024-09-01'),
        'public_url' => defined('IR_PUBLIC_URL') ? IR_PUBLIC_URL : '',
    ];
}
function ir_billing_revolut_ready(): bool { $c = ir_billing_config(); return $c['secret'] !== '' && $c['webhook_secret'] !== ''; }

/** Price of a plan period in minor units (CZK haléře). */
function ir_billing_price(array $plan, string $period): ?int {
    $v = match ($period) { 'month' => $plan['price_month'], 'year' => $plan['price_year'], 'lifetime' => $plan['price_lifetime'], default => null };
    $allowed = match ($period) { 'month' => (int)$plan['allow_month'], 'year' => (int)$plan['allow_year'], 'lifetime' => (int)$plan['allow_lifetime'], default => 0 };
    if ($v === null || !$allowed || !(int)$plan['active']) return null;
    return (int)round((float)$v * 100);
}

/** Low-level Revolut Merchant API call (injectable transport for tests). */
function ir_revolut_request(string $method, string $path, ?array $body = null): array {
    if (isset($GLOBALS['ir_revolut_transport']) && is_callable($GLOBALS['ir_revolut_transport'])) return ($GLOBALS['ir_revolut_transport'])($method, $path, $body);
    $c = ir_billing_config();
    if ($c['secret'] === '') throw new RuntimeException('Revolut není nakonfigurován (revolut_secret_key).');
    $ch = curl_init($c['base'].$path);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CUSTOMREQUEST => $method, CURLOPT_TIMEOUT => 20,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer '.$c['secret'], 'Revolut-Api-Version: '.$c['api_version'], 'Accept: application/json', 'Content-Type: application/json']]);
    if ($body !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    $raw = curl_exec($ch); $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($raw === false) throw new RuntimeException('Revolut API nedostupné: '.$err);
    $json = json_decode((string)$raw, true);
    if ($code >= 400) throw new RuntimeException('Revolut API '.$code.': '.mb_substr((string)$raw, 0, 300));
    return is_array($json) ? $json : [];
}

/** Start a web checkout: our order (created) → Revolut order → checkout URL. Nothing is granted here. */
function ir_billing_checkout(PDO $pdo, int $uid, string $planCode, string $period, string $email = ''): array {
    $plans = ir_plans($pdo);
    $plan = $plans[$planCode] ?? null;
    if (!$plan) throw new RuntimeException('Neznámý tarif.');
    $amount = ir_billing_price($plan, $period);
    if ($amount === null) throw new RuntimeException('Tento tarif není v tomto období dostupný.');
    if ($amount === 0) throw new RuntimeException('Tarif Free se nekupuje.');
    if (!ir_billing_revolut_ready()) throw new RuntimeException('Platební brána zatím není nakonfigurována. Kontaktujte správce (tarif může přidělit ručně).');
    $id = ir_uuidish('ord');
    $pdo->prepare("INSERT INTO wp_ir2_billing_orders(id,user_id,plan_code,period,amount_minor,currency,provider,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'revolut_web','created',NOW(),NOW())")->execute([$id, $uid, $planCode, $period, $amount, (string)$plan['currency']]);
    $c = ir_billing_config();
    $body = ['amount' => $amount, 'currency' => (string)$plan['currency'], 'description' => 'IR Manager — '.$plan['name'].' ('.$period.')', 'merchant_order_data' => ['reference' => $id]];
    if ($c['public_url'] !== '') $body['redirect_url'] = $c['public_url'].'/plans.php?order='.rawurlencode($id);
    if ($email !== '') $body['customer'] = ['email' => $email];
    $res = ir_revolut_request('POST', '/orders', $body);
    $pdo->prepare("UPDATE wp_ir2_billing_orders SET provider_order_id=?, checkout_url=?, status='pending', updated_at=NOW() WHERE id=?")->execute([(string)($res['id'] ?? ''), (string)($res['checkout_url'] ?? ''), $id]);
    ir_audit($pdo, 'billing_order', $id, 'checkout', null, ['plan' => $planCode, 'period' => $period, 'amount' => $amount]);
    return ['order_id' => $id, 'checkout_url' => (string)($res['checkout_url'] ?? ''), 'provider_order_id' => (string)($res['id'] ?? '')];
}

/**
 * Re-fetch our order from Revolut and apply its state. The ONLY place that marks an order paid.
 * Revolut states: pending, processing, authorised, completed, cancelled, failed.
 */
function ir_billing_sync_order(PDO $pdo, string $orderId): array {
    $q = $pdo->prepare('SELECT * FROM wp_ir2_billing_orders WHERE id=? LIMIT 1'); $q->execute([$orderId]);
    $o = $q->fetch(); if (!$o) throw new RuntimeException('Objednávka nenalezena.');
    if ((string)$o['provider'] !== 'revolut_web' || !$o['provider_order_id']) return $o;
    $remote = ir_revolut_request('GET', '/orders/'.rawurlencode((string)$o['provider_order_id']));
    $state = strtolower((string)($remote['state'] ?? ''));
    $remoteAmount = (int)($remote['amount'] ?? $remote['order_amount']['value'] ?? -1);
    $remoteCurrency = strtoupper((string)($remote['currency'] ?? $remote['order_amount']['currency'] ?? ''));
    $pdo->beginTransaction();
    try {
        $q = $pdo->prepare('SELECT * FROM wp_ir2_billing_orders WHERE id=? FOR UPDATE'); $q->execute([$orderId]); $o = $q->fetch();
        $newStatus = match ($state) { 'completed' => 'paid', 'authorised', 'processing', 'pending' => 'pending', 'cancelled' => 'cancelled', 'failed' => 'failed', default => (string)$o['status'] };
        if ($newStatus === 'paid' && ($remoteAmount !== (int)$o['amount_minor'] || $remoteCurrency !== strtoupper((string)$o['currency']))) { $newStatus = 'mismatch'; error_log('IR billing amount mismatch '.$orderId); }
        if ($newStatus === 'paid' && (string)$o['status'] !== 'paid') {
            $pdo->prepare('INSERT INTO wp_ir2_billing_payments(order_id,provider,provider_payment_id,status,amount_minor,currency,raw_json,created_at) VALUES(?,?,?,?,?,?,?,NOW())')
                ->execute([$orderId, 'revolut_web', (string)($remote['payments'][0]['id'] ?? $remote['id'] ?? ''), 'completed', (int)$o['amount_minor'], (string)$o['currency'], json_encode($remote)]);
            $subId = ir_billing_grant($pdo, (int)$o['user_id'], (string)$o['plan_code'], (string)$o['period'], 'revolut_web', (string)$o['provider_order_id'], null);
            $pdo->prepare('UPDATE wp_ir2_billing_orders SET status=?, subscription_id=?, updated_at=NOW() WHERE id=?')->execute(['paid', $subId, $orderId]);
            ir_audit($pdo, 'billing_order', $orderId, 'paid', ['status' => $o['status']], ['subscription' => $subId], (int)$o['user_id']);
        } elseif ($newStatus !== (string)$o['status'] && (string)$o['status'] !== 'paid') {
            $pdo->prepare('UPDATE wp_ir2_billing_orders SET status=?, updated_at=NOW() WHERE id=?')->execute([$newStatus, $orderId]);
        }
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    $q = $pdo->prepare('SELECT * FROM wp_ir2_billing_orders WHERE id=?'); $q->execute([$orderId]);
    return $q->fetch() ?: [];
}

/**
 * Grant / extend an entitlement period (any provider). Extends from the later of now / current end of the
 * same plan so renewals never lose days. Lifetime = no end.
 */
function ir_billing_grant(PDO $pdo, int $uid, string $planCode, string $period, string $provider, ?string $providerRef, ?string $until, string $note = '', ?int $by = null): int {
    if (!isset(IR_BILLING_PROVIDERS[$provider])) throw new RuntimeException('Neznámý poskytovatel.');
    $from = date('Y-m-d H:i:s');
    if ($until === null && $period !== 'lifetime' && $period !== 'manual') {
        $cur = ir_scalar($pdo, "SELECT MAX(valid_until) FROM wp_ir2_subscriptions WHERE user_id=? AND plan_code=? AND status='active' AND valid_until>NOW()", [$uid, $planCode], null);
        $base = $cur ?: $from;
        $until = date('Y-m-d H:i:s', strtotime($base.($period === 'year' ? ' +1 year' : ' +1 month')));
    }
    $pdo->prepare("INSERT INTO wp_ir2_subscriptions(user_id,plan_code,period,provider,provider_subscription_id,status,valid_from,valid_until,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,'active',?,?,?,?,NOW(),NOW())")
        ->execute([$uid, $planCode, $period, $provider, $providerRef, $from, $period === 'lifetime' ? null : $until, $note !== '' ? mb_substr($note, 0, 255) : null, $by]);
    $id = (int)$pdo->lastInsertId();
    ir_entitlement_reset();
    ir_audit($pdo, 'subscription', $id, 'grant', null, ['plan' => $planCode, 'period' => $period, 'provider' => $provider, 'until' => $until], $uid);
    return $id;
}
/** Cancel at period end (user) or immediately (admin). Data is never touched. */
function ir_billing_cancel(PDO $pdo, int $uid, int $subId, bool $immediately = false): void {
    if ($immediately) $pdo->prepare("UPDATE wp_ir2_subscriptions SET status='canceled', valid_until=NOW(), updated_at=NOW() WHERE id=? AND user_id=?")->execute([$subId, $uid]);
    else $pdo->prepare('UPDATE wp_ir2_subscriptions SET cancel_at_period_end=1, updated_at=NOW() WHERE id=? AND user_id=?')->execute([$subId, $uid]);
    ir_entitlement_reset();
    ir_audit($pdo, 'subscription', $subId, $immediately ? 'cancel_now' : 'cancel_at_period_end', null, null, $uid);
}
/** Refund bookkeeping: subscription ends, entitlement falls back (data stays, quota locks apply). */
function ir_billing_refund(PDO $pdo, string $orderId, int $amountMinor, string $providerRefundId = '', string $status = 'completed'): void {
    $q = $pdo->prepare('SELECT * FROM wp_ir2_billing_orders WHERE id=?'); $q->execute([$orderId]); $o = $q->fetch();
    if (!$o) throw new RuntimeException('Objednávka nenalezena.');
    $dup = ir_scalar($pdo, 'SELECT COUNT(*) FROM wp_ir2_billing_refunds WHERE order_id=? AND provider_refund_id=?', [$orderId, $providerRefundId], 0);
    if ($providerRefundId !== '' && $dup) return; // idempotent
    $pdo->prepare('INSERT INTO wp_ir2_billing_refunds(order_id,provider,provider_refund_id,amount_minor,status,created_at) VALUES(?,?,?,?,?,NOW())')->execute([$orderId, (string)$o['provider'], $providerRefundId ?: null, $amountMinor, $status]);
    if ($status === 'completed' && $o['subscription_id']) $pdo->prepare("UPDATE wp_ir2_subscriptions SET status='refunded', valid_until=NOW(), updated_at=NOW() WHERE id=?")->execute([(int)$o['subscription_id']]);
    ir_entitlement_reset();
    $pdo->prepare("UPDATE wp_ir2_billing_orders SET status='refunded', updated_at=NOW() WHERE id=?")->execute([$orderId]);
    ir_audit($pdo, 'billing_order', $orderId, 'refund', null, ['amount' => $amountMinor], (int)$o['user_id']);
}

/** Verify a Revolut webhook signature: header "v1=<hex>[,v1=…]", signed payload "v1.<timestamp>.<raw body>". */
function ir_revolut_signature_ok(string $raw, string $timestamp, string $sigHeader, string $secret, int $toleranceSec = 300): bool {
    if ($secret === '' || $timestamp === '' || $sigHeader === '') return false;
    if (!ctype_digit($timestamp) || abs((int)(time() * 1000) - (int)$timestamp) > $toleranceSec * 1000) return false;
    $expected = 'v1='.hash_hmac('sha256', 'v1.'.$timestamp.'.'.$raw, $secret);
    foreach (explode(',', $sigHeader) as $s) if (hash_equals($expected, trim($s))) return true;
    return false;
}

/**
 * Webhook entry (billing-webhook.php). Logged once per event id; a verified ORDER_* event triggers a
 * server-side re-fetch of the order — the webhook body itself never grants anything.
 */
function ir_billing_handle_revolut_webhook(PDO $pdo, string $raw, array $headers): array {
    $c = ir_billing_config();
    $sigOk = ir_revolut_signature_ok($raw, (string)($headers['revolut-request-timestamp'] ?? ''), (string)($headers['revolut-signature'] ?? ''), $c['webhook_secret']);
    $p = json_decode($raw, true) ?: [];
    $event = (string)($p['event'] ?? '');
    $eventId = (string)($p['id'] ?? $p['event_id'] ?? hash('sha256', $raw));
    if (!$sigOk) {
        // logged for diagnostics under its own key, so a forged request can never "use up" a real event id
        $pdo->prepare("INSERT IGNORE INTO wp_ir2_billing_webhooks(provider,event_id,event_type,signature_ok,payload,error,processed_at,created_at) VALUES('revolut_web',?,?,0,?,'invalid signature',NOW(),NOW())")
            ->execute(['invalid:'.hash('sha256', $raw.microtime()), mb_substr($event, 0, 80), mb_substr($raw, 0, 65000)]);
        return ['status' => 'rejected'];
    }
    $ins = $pdo->prepare('INSERT IGNORE INTO wp_ir2_billing_webhooks(provider,event_id,event_type,signature_ok,payload,created_at) VALUES(?,?,?,1,?,NOW())');
    $ins->execute(['revolut_web', $eventId, $event, $raw]);
    if (!$ins->rowCount()) {
        // already seen: done → duplicate; previously failed → retry (the provider re-delivers on non-2xx)
        $done = ir_scalar($pdo, "SELECT processed_at FROM wp_ir2_billing_webhooks WHERE provider='revolut_web' AND event_id=?", [$eventId], null);
        if ($done !== null) return ['status' => 'duplicate'];
    }
    try {
        $ref = (string)($p['merchant_order_ext_ref'] ?? '');
        $orderId = $ref;
        if ($orderId === '' && !empty($p['order_id'])) $orderId = (string)ir_scalar($pdo, "SELECT id FROM wp_ir2_billing_orders WHERE provider='revolut_web' AND provider_order_id=?", [(string)$p['order_id']], '');
        $result = 'ignored';
        if ($orderId !== '' && str_starts_with($event, 'ORDER_')) { $o = ir_billing_sync_order($pdo, $orderId); $result = 'order:'.($o['status'] ?? '?'); }
        $pdo->prepare("UPDATE wp_ir2_billing_webhooks SET processed_at=NOW() WHERE provider='revolut_web' AND event_id=?")->execute([$eventId]);
        return ['status' => $result];
    } catch (Throwable $e) {
        $pdo->prepare("UPDATE wp_ir2_billing_webhooks SET error=?, processed_at=NULL WHERE provider='revolut_web' AND event_id=?")->execute([mb_substr($e->getMessage(), 0, 500), $eventId]);
        ir_job_fail($pdo, 'billing_webhook', $e->getMessage(), ['event_id' => $eventId]);
        return ['status' => 'error'];
    }
}

/**
 * App-store entitlement updates (future native apps). The contract exists so the SAME account receives
 * entitlements from Google Play / App Store — but nothing is granted until server-side receipt
 * verification against the store is implemented and configured (no fake success).
 */
function ir_billing_store_notification(PDO $pdo, string $provider, array $payload): array {
    if (!in_array($provider, ['apple_app_store', 'google_play'], true)) throw new RuntimeException('Neznámý obchod.');
    $pdo->prepare('INSERT IGNORE INTO wp_ir2_billing_webhooks(provider,event_id,event_type,signature_ok,payload,error,created_at) VALUES(?,?,?,0,?,?,NOW())')
        ->execute([$provider, hash('sha256', json_encode($payload)), (string)($payload['notificationType'] ?? $payload['type'] ?? ''), json_encode($payload), 'store verification not configured — nothing granted']);
    return ['status' => 'not_configured', 'granted' => false];
}

// ------------------------------------------------------------------------------------ jobs (failed-job log)
function ir_job_fail(PDO $pdo, string $type, string $error, array $payload = []): void {
    try {
        if (!ir_table_exists($pdo, 'wp_ir2_jobs')) return;
        $pdo->prepare("INSERT INTO wp_ir2_jobs(job_type,status,payload,attempts,last_error,created_at,updated_at) VALUES(?,'failed',?,1,?,NOW(),NOW())")->execute([$type, json_encode($payload), mb_substr($error, 0, 2000)]);
    } catch (Throwable) {}
}
