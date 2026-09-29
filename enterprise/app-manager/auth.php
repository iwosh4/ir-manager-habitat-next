<?php
declare(strict_types=1);

define('IR_PUBLIC_PAGE', true);
require __DIR__ . '/includes/config.php';
require_once __DIR__ . '/includes/auth-security.php';

/* -------------------------------------------------------------------------
   LOGOUT — auth.php is the single account gateway
--------------------------------------------------------------------------- */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && (string)($_POST['action'] ?? '') === 'logout') {
    ir_verify_csrf();
    $_SESSION = [];

    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            time() - 42000,
            $params['path'],
            $params['domain'],
            (bool)$params['secure'],
            (bool)$params['httponly']
        );
    }

    session_destroy();
    header('Location: auth.php');
    exit;
}

if (ir_logged_in()) {
    ir_redirect('index.php');
}

/* -------------------------------------------------------------------------
   AUTH SCHEMA — additive only, never destructive
--------------------------------------------------------------------------- */
function ir_auth_column_exists(PDO $pdo, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (array_key_exists($key, $cache)) {
        return $cache[$key];
    }

    $st = $pdo->prepare(
        'SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?'
    );
    $st->execute([$table, $column]);
    return $cache[$key] = ((int)$st->fetchColumn() > 0);
}

function ir_auth_ensure_schema(PDO $pdo): array
{
    $table = IR_AUTH_TABLE;
    $result = ['email' => false, 'jazyk' => false, 'reset_token_hash' => false, 'reset_expires_at' => false, 'created_at' => false, 'role' => false, 'is_active' => false];

    foreach (array_keys($result) as $column) {
        try {
            $result[$column] = ir_auth_column_exists($pdo, $table, $column);
        } catch (Throwable $e) {
            $result[$column] = false;
        }
    }

    return $result;
}

$schema = ir_auth_ensure_schema($pdo);

/* -------------------------------------------------------------------------
   LANGUAGE
--------------------------------------------------------------------------- */
$languages = [
    'cs' => ['label' => 'CZ', 'name' => 'Čeština'],
    'en' => ['label' => 'EN', 'name' => 'English'],
    'de' => ['label' => 'DE', 'name' => 'Deutsch'],
    'pl' => ['label' => 'PL', 'name' => 'Polski'],
];

$text = [
    'cs' => [
        'signin' => 'Přihlášení', 'register' => 'Nový účet', 'forgot' => 'Zapomenuté heslo', 'reset' => 'Nové heslo',
        'welcome' => 'Vítej zpět', 'welcome_sub' => 'Vstup do svého chovatelského systému.',
        'create' => 'Vytvoř si účet', 'create_sub' => 'Vlastní účet IR Manageru, žádný demo profil.',
        'forgot_sub' => 'Zadej e-mail účtu. Pošleme jednorázový odkaz pro nové heslo.',
        'reset_sub' => 'Zvol nové heslo pro svůj účet.', 'username' => 'Uživatelské jméno', 'email' => 'E-mail',
        'password' => 'Heslo', 'password2' => 'Heslo znovu', 'login_btn' => 'Vstoupit do IR Manageru',
        'register_btn' => 'Vytvořit účet', 'send_reset' => 'Poslat odkaz pro obnovu', 'save_password' => 'Uložit nové heslo',
        'forgot_link' => 'Zapomněl jsem heslo', 'back' => 'Zpět na přihlášení',
        'required' => 'Vyplň všechna povinná pole.', 'bad_login' => 'Nesprávné uživatelské jméno nebo heslo.', 'inactive' => 'Tento účet je deaktivovaný.',
        'bad_username' => 'Uživatelské jméno musí mít 3 až 50 znaků.', 'bad_email' => 'Zadej platný e-mail.',
        'short_password' => 'Heslo musí mít alespoň 8 znaků.', 'password_mismatch' => 'Hesla se neshodují.',
        'exists_name' => 'Toto uživatelské jméno už existuje.', 'exists_email' => 'Tento e-mail už používá jiný účet.',
        'created' => 'Účet byl vytvořen. Můžeš se přihlásit.', 'reset_sent' => 'Pokud účet existuje, poslali jsme odkaz pro obnovu hesla.',
        'mail_failed' => 'Odkaz se nepodařilo odeslat. Zkontroluj nastavení e-mailu na hostingu.',
        'bad_token' => 'Odkaz pro obnovu je neplatný nebo vypršel.', 'password_changed' => 'Heslo bylo změněno. Můžeš se přihlásit.',
        'system_error' => 'Operaci se nepodařilo dokončit.', 'schema_error' => 'Databáze zatím nemá všechna pole potřebná pro tuto funkci.', 'registration_closed' => 'Veřejná registrace je vypnutá. Účet vytváří administrátor.',
        'hero1' => 'Tvůj chov.', 'hero2' => 'Jeden systém.', 'hero3' => 'Úplný přehled.',
        'hero_text' => 'Zvířata, péče, reprodukce, zdraví, ubikace a automatizace v jednom prostředí.', 'install' => 'Přidat na plochu',
    ],
    'en' => [
        'signin' => 'Sign in', 'register' => 'New account', 'forgot' => 'Forgot password', 'reset' => 'New password',
        'welcome' => 'Welcome back', 'welcome_sub' => 'Enter your breeding management system.',
        'create' => 'Create your account', 'create_sub' => 'Your own IR Manager account, no demo profile.',
        'forgot_sub' => 'Enter your account e-mail. We will send a one-time reset link.',
        'reset_sub' => 'Choose a new password.', 'username' => 'Username', 'email' => 'E-mail',
        'password' => 'Password', 'password2' => 'Repeat password', 'login_btn' => 'Enter IR Manager',
        'register_btn' => 'Create account', 'send_reset' => 'Send reset link', 'save_password' => 'Save new password',
        'forgot_link' => 'I forgot my password', 'back' => 'Back to sign in',
        'required' => 'Fill in all required fields.', 'bad_login' => 'Incorrect username or password.', 'inactive' => 'This account is disabled.',
        'bad_username' => 'Username must be 3 to 50 characters.', 'bad_email' => 'Enter a valid e-mail.',
        'short_password' => 'Password must be at least 8 characters.', 'password_mismatch' => 'Passwords do not match.',
        'exists_name' => 'This username already exists.', 'exists_email' => 'This e-mail is already in use.',
        'created' => 'Account created. You can sign in now.', 'reset_sent' => 'If the account exists, we sent a reset link.',
        'mail_failed' => 'The reset link could not be sent. Check mail configuration on the server.',
        'bad_token' => 'The reset link is invalid or expired.', 'password_changed' => 'Password changed. You can sign in now.',
        'system_error' => 'The operation could not be completed.', 'schema_error' => 'The database is missing fields required by this function.', 'registration_closed' => 'Public registration is disabled. An administrator creates accounts.',
        'hero1' => 'Your collection.', 'hero2' => 'One system.', 'hero3' => 'Complete control.',
        'hero_text' => 'Animals, care, breeding, health, habitats and automation in one environment.', 'install' => 'Add to home screen',
    ],
    'de' => [
        'signin' => 'Anmelden', 'register' => 'Neues Konto', 'forgot' => 'Passwort vergessen', 'reset' => 'Neues Passwort',
        'welcome' => 'Willkommen zurück', 'welcome_sub' => 'Melde dich bei deinem Zuchtsystem an.',
        'create' => 'Konto erstellen', 'create_sub' => 'Dein eigenes IR-Manager-Konto, kein Demo-Profil.',
        'forgot_sub' => 'Gib deine E-Mail ein. Wir senden einen einmaligen Reset-Link.',
        'reset_sub' => 'Wähle ein neues Passwort.', 'username' => 'Benutzername', 'email' => 'E-Mail',
        'password' => 'Passwort', 'password2' => 'Passwort wiederholen', 'login_btn' => 'IR Manager öffnen',
        'register_btn' => 'Konto erstellen', 'send_reset' => 'Reset-Link senden', 'save_password' => 'Passwort speichern',
        'forgot_link' => 'Passwort vergessen', 'back' => 'Zurück zur Anmeldung',
        'required' => 'Bitte alle Pflichtfelder ausfüllen.', 'bad_login' => 'Benutzername oder Passwort ist falsch.', 'inactive' => 'Dieses Konto ist deaktiviert.',
        'bad_username' => 'Der Benutzername muss 3 bis 50 Zeichen lang sein.', 'bad_email' => 'Gib eine gültige E-Mail ein.',
        'short_password' => 'Das Passwort muss mindestens 8 Zeichen lang sein.', 'password_mismatch' => 'Die Passwörter stimmen nicht überein.',
        'exists_name' => 'Dieser Benutzername existiert bereits.', 'exists_email' => 'Diese E-Mail wird bereits verwendet.',
        'created' => 'Konto erstellt. Du kannst dich anmelden.', 'reset_sent' => 'Falls das Konto existiert, wurde ein Reset-Link gesendet.',
        'mail_failed' => 'Der Reset-Link konnte nicht gesendet werden.', 'bad_token' => 'Der Reset-Link ist ungültig oder abgelaufen.',
        'password_changed' => 'Passwort geändert. Du kannst dich anmelden.', 'system_error' => 'Der Vorgang konnte nicht abgeschlossen werden.',
        'schema_error' => 'In der Datenbank fehlen Felder für diese Funktion.', 'registration_closed' => 'Die öffentliche Registrierung ist deaktiviert. Konten werden vom Administrator erstellt.',
        'hero1' => 'Deine Zucht.', 'hero2' => 'Ein System.', 'hero3' => 'Volle Übersicht.',
        'hero_text' => 'Tiere, Pflege, Zucht, Gesundheit, Terrarien und Automation in einer Umgebung.', 'install' => 'App installieren',
    ],
    'pl' => [
        'signin' => 'Logowanie', 'register' => 'Nowe konto', 'forgot' => 'Nie pamiętam hasła', 'reset' => 'Nowe hasło',
        'welcome' => 'Witaj ponownie', 'welcome_sub' => 'Wejdź do swojego systemu hodowlanego.',
        'create' => 'Utwórz konto', 'create_sub' => 'Własne konto IR Manager, bez profilu demo.',
        'forgot_sub' => 'Podaj e-mail konta. Wyślemy jednorazowy link resetujący.',
        'reset_sub' => 'Wybierz nowe hasło.', 'username' => 'Nazwa użytkownika', 'email' => 'E-mail',
        'password' => 'Hasło', 'password2' => 'Powtórz hasło', 'login_btn' => 'Wejdź do IR Manager',
        'register_btn' => 'Utwórz konto', 'send_reset' => 'Wyślij link resetujący', 'save_password' => 'Zapisz nowe hasło',
        'forgot_link' => 'Nie pamiętam hasła', 'back' => 'Powrót do logowania',
        'required' => 'Wypełnij wszystkie wymagane pola.', 'bad_login' => 'Nieprawidłowa nazwa użytkownika lub hasło.', 'inactive' => 'To konto jest wyłączone.',
        'bad_username' => 'Nazwa użytkownika musi mieć od 3 do 50 znaków.', 'bad_email' => 'Podaj prawidłowy e-mail.',
        'short_password' => 'Hasło musi mieć co najmniej 8 znaków.', 'password_mismatch' => 'Hasła nie są identyczne.',
        'exists_name' => 'Ta nazwa użytkownika już istnieje.', 'exists_email' => 'Ten e-mail jest już używany.',
        'created' => 'Konto utworzone. Możesz się zalogować.', 'reset_sent' => 'Jeśli konto istnieje, wysłaliśmy link resetujący.',
        'mail_failed' => 'Nie udało się wysłać linku resetującego.', 'bad_token' => 'Link jest nieprawidłowy lub wygasł.',
        'password_changed' => 'Hasło zostało zmienione. Możesz się zalogować.', 'system_error' => 'Nie udało się zakończyć operacji.',
        'schema_error' => 'W bazie brakuje pól wymaganych dla tej funkcji.', 'registration_closed' => 'Rejestracja publiczna jest wyłączona. Konto tworzy administrator.',
        'hero1' => 'Twoja hodowla.', 'hero2' => 'Jeden system.', 'hero3' => 'Pełna kontrola.',
        'hero_text' => 'Zwierzęta, opieka, rozród, zdrowie, terraria i automatyzacja w jednym miejscu.', 'install' => 'Dodaj do ekranu głównego',
    ],
];

$lang = strtolower(trim((string)($_REQUEST['lang'] ?? $_SESSION['auth_lang'] ?? 'cs')));
if (!isset($languages[$lang])) {
    $lang = 'cs';
}
$_SESSION['auth_lang'] = $lang;

function at(string $key): string
{
    global $text, $lang;
    return $text[$lang][$key] ?? $text['cs'][$key] ?? $key;
}

function auth_strlen(string $value): int
{
    return function_exists('mb_strlen') ? mb_strlen($value, 'UTF-8') : strlen($value);
}

function auth_mail_from(): string
{
    if (defined('IR_MAIL_FROM') && filter_var(IR_MAIL_FROM, FILTER_VALIDATE_EMAIL)) return IR_MAIL_FROM;
    $parts=defined('IR_PUBLIC_URL')?parse_url((string)IR_PUBLIC_URL):false;
    $host=is_array($parts)?preg_replace('/[^A-Za-z0-9.\-]/','',(string)($parts['host']??'')):'';
    return 'no-reply@'.($host?:'localhost');
}

function auth_base_url(): string
{
    $base=defined('IR_PUBLIC_URL')?(string)IR_PUBLIC_URL:'';
    $parts=parse_url($base);
    if(!is_array($parts)||($parts['scheme']??'')!=='https'||empty($parts['host'])||isset($parts['user'])||isset($parts['pass'])||isset($parts['query'])||isset($parts['fragment']))return '';
    return rtrim($base,'/').'/auth.php';
}

function auth_send_reset_mail(string $to, string $username, string $url): bool
{
    $subject = 'IR Manager – ' . at('reset');
    $body = "IR Manager\n\n" . $username . ",\n\n" . $url . "\n\n" . at('forgot_sub');
    $fromName = defined('IR_MAIL_FROM_NAME') ? (string)IR_MAIL_FROM_NAME : 'IR Manager';
    $from = auth_mail_from();
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        'From: ' . $fromName . ' <' . $from . '>',
        'Reply-To: ' . $from,
        'X-Mailer: IR Manager',
    ];
    return @mail($to, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, implode("\r\n", $headers));
}

$allowedModes = ['login', 'register', 'forgot', 'reset'];
$mode = (string)($_GET['mode'] ?? $_POST['mode'] ?? 'login');
if (!in_array($mode, $allowedModes, true)) $mode = 'login';
if ($mode === 'register' && (!defined('IR_ALLOW_REGISTRATION') || !IR_ALLOW_REGISTRATION)) $mode = 'login';

$error = null;
$oldUsername = trim((string)($_POST['jmeno'] ?? ''));
$oldEmail = trim((string)($_POST['email'] ?? ''));
$tokenFromRequest = trim((string)($_GET['token'] ?? $_POST['token'] ?? ''));
$flashes = ir_pull_flashes();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    ir_verify_csrf();
    $action = (string)($_POST['akce'] ?? 'login');
    if(!in_array($action,['login','register','forgot','reset'],true)){http_response_code(400);exit('Neplatná akce.');}
    try{
        if(!ir_auth_rate_limit($pdo,$action,trim((string)($_POST['jmeno']??$_POST['email']??'')))){
            http_response_code(429);header('Retry-After: 900');exit('Příliš mnoho pokusů. Zkus to znovu za 15 minut.');
        }
    }catch(Throwable $e){error_log('Auth limiter: '.$e->getMessage());http_response_code(503);exit('Přihlášení dočasně není dostupné. Administrátor musí ověřit databázovou migraci a System Check.');}
    $postedLang = strtolower(trim((string)($_POST['lang'] ?? $lang)));
    if (isset($languages[$postedLang])) {
        $lang = $postedLang;
        $_SESSION['auth_lang'] = $lang;
    }

    if ($action === 'register') {
        if (!defined('IR_ALLOW_REGISTRATION') || !IR_ALLOW_REGISTRATION) {
            $mode='login';
            $error=at('registration_closed');
        } else {
        $mode = 'register';
        $jmeno = trim((string)($_POST['jmeno'] ?? ''));
        $email = trim((string)($_POST['email'] ?? ''));
        $heslo = (string)($_POST['heslo'] ?? '');
        $heslo2 = (string)($_POST['heslo2'] ?? '');

        if ($jmeno === '' || $email === '' || $heslo === '' || $heslo2 === '') {
            $error = at('required');
        } elseif (auth_strlen($jmeno) < 3 || auth_strlen($jmeno) > 50) {
            $error = at('bad_username');
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = at('bad_email');
        } elseif (auth_strlen($heslo) < 8) {
            $error = at('short_password');
        } elseif (!hash_equals($heslo, $heslo2)) {
            $error = at('password_mismatch');
        } elseif (!$schema['email']) {
            $error = at('schema_error');
        } else {
            try {
                $st = $pdo->prepare('SELECT id, jmeno, email FROM ' . IR_AUTH_TABLE . ' WHERE jmeno = ? OR LOWER(email) = LOWER(?) LIMIT 1');
                $st->execute([$jmeno, $email]);
                $existing = $st->fetch();
                if ($existing) {
                    $error = strcasecmp((string)($existing['jmeno'] ?? ''), $jmeno) === 0 ? at('exists_name') : at('exists_email');
                } else {
                    $columns = ['jmeno', 'email', 'heslo'];
                    $values = [$jmeno, $email, password_hash($heslo, PASSWORD_DEFAULT)];
                    if ($schema['jazyk']) {
                        $columns[] = 'jazyk';
                        $values[] = $lang;
                    }
                    if ($schema['role']) {
                        $columns[] = 'role';
                        $values[] = 'user';
                    }
                    if ($schema['is_active']) {
                        $columns[] = 'is_active';
                        $values[] = 1;
                    }
                    $placeholders = implode(',', array_fill(0, count($columns), '?'));
                    $sql = 'INSERT INTO ' . IR_AUTH_TABLE . ' (' . implode(',', $columns) . ') VALUES (' . $placeholders . ')';
                    $pdo->prepare($sql)->execute($values);
                    ir_flash('success', at('created'));
                    ir_redirect('auth.php?mode=login&lang=' . rawurlencode($lang));
                }
            } catch (Throwable $e) {
                error_log('IR auth register failed: ' . $e->getMessage());
                $error = at('system_error');
            }
        }
        }
    } elseif ($action === 'forgot') {
        $mode = 'forgot';
        $email = trim((string)($_POST['email'] ?? ''));

        if ($email === '') {
            $error = at('required');
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = at('bad_email');
        } elseif (!$schema['email'] || !$schema['reset_token_hash'] || !$schema['reset_expires_at']) {
            $error = at('schema_error');
        } else {
            try {
                $st = $pdo->prepare('SELECT id, jmeno, email FROM ' . IR_AUTH_TABLE . ' WHERE LOWER(email) = LOWER(?) LIMIT 1');
                $st->execute([$email]);
                $user = $st->fetch();
                $mailFailed = false;
                if ($user) {
                    $token = bin2hex(random_bytes(32));
                    $tokenHash = hash('sha256', $token);
                    $expires = (new DateTimeImmutable('+60 minutes'))->format('Y-m-d H:i:s');
                    $pdo->prepare('UPDATE ' . IR_AUTH_TABLE . ' SET reset_token_hash = ?, reset_expires_at = ? WHERE id = ?')
                        ->execute([$tokenHash, $expires, (int)$user['id']]);
                    $base = auth_base_url();
                    $url = $base . '?mode=reset&lang=' . rawurlencode($lang) . '&token=' . rawurlencode($token);
                    if ($base === '' || !auth_send_reset_mail((string)$user['email'], (string)$user['jmeno'], $url)) {
                        $mailFailed = true;
                    }
                }
                if ($mailFailed) error_log('IR password reset email could not be delivered; check public_url and mail configuration.');
                ir_flash('success', at('reset_sent'));
                ir_redirect('auth.php?mode=login&lang=' . rawurlencode($lang));
            } catch (Throwable $e) {
                error_log('IR auth forgot failed: ' . $e->getMessage());
                $error = at('system_error');
            }
        }
    } elseif ($action === 'reset') {
        $mode = 'reset';
        $token = trim((string)($_POST['token'] ?? ''));
        $heslo = (string)($_POST['heslo'] ?? '');
        $heslo2 = (string)($_POST['heslo2'] ?? '');

        if ($token === '' || $heslo === '' || $heslo2 === '') {
            $error = at('required');
        } elseif (auth_strlen($heslo) < 8) {
            $error = at('short_password');
        } elseif (!hash_equals($heslo, $heslo2)) {
            $error = at('password_mismatch');
        } elseif (!$schema['reset_token_hash'] || !$schema['reset_expires_at']) {
            $error = at('schema_error');
        } else {
            try {
                $hash = hash('sha256', $token);
                $st = $pdo->prepare('SELECT id FROM ' . IR_AUTH_TABLE . ' WHERE reset_token_hash = ? AND reset_expires_at IS NOT NULL AND reset_expires_at >= NOW() LIMIT 1');
                $st->execute([$hash]);
                $userId = (int)$st->fetchColumn();
                if ($userId <= 0) {
                    $error = at('bad_token');
                } else {
                    $update=$pdo->prepare('UPDATE ' . IR_AUTH_TABLE . ' SET heslo = ?, reset_token_hash = NULL, reset_expires_at = NULL WHERE id = ? AND reset_token_hash = ? AND reset_expires_at >= NOW()');
                    $update->execute([password_hash($heslo, PASSWORD_DEFAULT), $userId,$hash]);
                    if($update->rowCount()!==1)throw new RuntimeException('Reset token already used.');
                    ir_flash('success', at('password_changed'));
                    ir_redirect('auth.php?mode=login&lang=' . rawurlencode($lang));
                }
            } catch (Throwable $e) {
                error_log('IR auth reset failed: ' . $e->getMessage());
                $error = at('system_error');
            }
        }
    } else {
        $mode = 'login';
        $jmeno = trim((string)($_POST['jmeno'] ?? ''));
        $heslo = (string)($_POST['heslo'] ?? '');
        if ($jmeno === '' || $heslo === '') {
            $error = at('required');
        } else {
            try {
                $select = 'id, jmeno, heslo' . ($schema['jazyk'] ? ', jazyk' : '') . ($schema['role'] ? ', role' : '') . ($schema['is_active'] ? ', is_active' : '');
                $st = $pdo->prepare('SELECT ' . $select . ' FROM ' . IR_AUTH_TABLE . ' WHERE jmeno = ? LIMIT 1');
                $st->execute([$jmeno]);
                $user = $st->fetch();
                if ($user && password_verify($heslo, (string)$user['heslo'])) {
                    $ext = [];
                    try { $x = $pdo->prepare('SELECT * FROM ' . IR_AUTH_TABLE . ' WHERE id=? LIMIT 1'); $x->execute([(int)$user['id']]); $ext = $x->fetch() ?: []; } catch (Throwable) {}
                    if ($schema['is_active'] && (int)($user['is_active'] ?? 1) !== 1) {
                        $error = at('inactive');
                    } elseif (!empty($ext['suspended_at'])) {
                        $error = 'Účet je pozastaven. Kontaktujte správce.';
                    } else {
                    session_regenerate_id(true);
                    /* BETA 1.0 tenancy: staff / read-only accounts work on their owner's data */
                    $_SESSION['actor_id'] = (int)$user['id'];
                    $_SESSION['session_version'] = (int)($ext['session_version'] ?? 0);
                    $_SESSION['user_id'] = !empty($ext['owner_user_id']) ? (int)$ext['owner_user_id'] : (int)$user['id'];
                    try { if (array_key_exists('posledni_prihlaseni', $ext)) $pdo->prepare('UPDATE ' . IR_AUTH_TABLE . ' SET posledni_prihlaseni=NOW() WHERE id=?')->execute([(int)$user['id']]); } catch (Throwable) {}
                    $_SESSION['auth_password_fingerprint'] = hash('sha256',(string)$user['heslo']);
                    $_SESSION['user_name'] = (string)$user['jmeno'];
                    $_SESSION['user_role'] = $schema['role'] ? strtolower((string)($user['role'] ?? 'user')) : 'user';
                    $userLang = $schema['jazyk'] ? (string)($user['jazyk'] ?? $lang) : $lang;
                    if (!isset($languages[$userLang])) $userLang = $lang;
                    $_SESSION['lang'] = $userLang;
                    $_SESSION['auth_lang'] = $userLang;
                    ir_redirect('index.php');
                    }
                }
                if ($error === null) $error = at('bad_login');
            } catch (Throwable $e) {
                error_log('IR auth login failed: ' . $e->getMessage());
                $error = at('system_error');
            }
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' && $mode === 'reset') {
    if ($tokenFromRequest === '' || !$schema['reset_token_hash'] || !$schema['reset_expires_at']) {
        $error = at('bad_token');
    } else {
        try {
            $st = $pdo->prepare('SELECT id FROM ' . IR_AUTH_TABLE . ' WHERE reset_token_hash = ? AND reset_expires_at IS NOT NULL AND reset_expires_at >= NOW() LIMIT 1');
            $st->execute([hash('sha256', $tokenFromRequest)]);
            if (!$st->fetchColumn()) $error = at('bad_token');
        } catch (Throwable $e) {
            $error = at('system_error');
        }
    }
}

$pageTitle = match ($mode) {
    'register' => at('register'),
    'forgot' => at('forgot'),
    'reset' => at('reset'),
    default => at('signin'),
};
?><!doctype html>
<html lang="<?= ir_e($lang) ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
    <meta name="theme-color" content="#090b0e">
    <meta name="color-scheme" content="dark">
    <link rel="icon" href="favicon.ico" sizes="any">
    <link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
    <link rel="apple-touch-icon" href="apple-touch-icon.png">
    <link rel="manifest" href="manifest.webmanifest">
    <title><?= ir_e($pageTitle) ?> · IR Manager</title>
    <link rel="stylesheet" href="assets/css/core.css?v=next-01">
</head>
<body class="ir-auth-body">
<div class="ir-auth-shell">
    <section class="ir-auth-visual">
        <div class="ir-auth-brandline">
            <img src="assets/img/app-icon.webp" alt="IR Manager" width="54" height="54">
            <div><strong>IR MANAGER</strong><span>TERARISTIKA</span></div>
        </div>
        <div class="ir-auth-copy">
            <span class="ir-kicker">CHOV · PÉČE · PŘEHLED</span>
            <h1><?= ir_e(at('hero1')) ?><br><em><?= ir_e(at('hero2')) ?></em><br><?= ir_e(at('hero3')) ?></h1>
            <p><?= ir_e(at('hero_text')) ?></p>
            <div class="ir-auth-chips"><span>Zvířata</span><span>Péče</span><span>Reprodukce</span><span>Habitat</span><span>Automatizace</span></div>
        </div>
        <div class="ir-auth-eye"><img src="assets/img/app-eye.webp" alt="" aria-hidden="true"></div>
    </section>

    <section class="ir-auth-card">
        <div class="ir-auth-lang">
            <?php foreach ($languages as $code => $meta): ?>
                <a class="<?= $code === $lang ? 'is-active' : '' ?>" href="auth.php?mode=<?= ir_e($mode) ?>&lang=<?= ir_e($code) ?><?= $tokenFromRequest !== '' ? '&token=' . rawurlencode($tokenFromRequest) : '' ?>" title="<?= ir_e($meta['name']) ?>"><?= ir_e($meta['label']) ?></a>
            <?php endforeach; ?>
        </div>

        <?php if ($mode === 'login' || ($mode === 'register' && defined('IR_ALLOW_REGISTRATION') && IR_ALLOW_REGISTRATION)): ?>
        <nav class="ir-auth-tabs" aria-label="Přihlášení a registrace">
            <a class="<?= $mode === 'login' ? 'is-active' : '' ?>" href="auth.php?mode=login&lang=<?= ir_e($lang) ?>"><?= ir_e(at('signin')) ?></a>
            <?php if(defined('IR_ALLOW_REGISTRATION') && IR_ALLOW_REGISTRATION): ?><a class="<?= $mode === 'register' ? 'is-active' : '' ?>" href="auth.php?mode=register&lang=<?= ir_e($lang) ?>"><?= ir_e(at('register')) ?></a><?php endif; ?>
        </nav>
        <?php endif; ?>

        <?php foreach ($flashes as $flash): ?>
            <div class="ir-auth-alert <?= ir_e((string)($flash['type'] ?? 'info')) ?>"><?= ir_e((string)($flash['message'] ?? '')) ?></div>
        <?php endforeach; ?>
        <?php if ($error): ?><div class="ir-auth-alert error"><?= ir_e($error) ?></div><?php endif; ?>

        <?php if ($mode === 'register' && defined('IR_ALLOW_REGISTRATION') && IR_ALLOW_REGISTRATION): ?>
            <header><span class="ir-kicker">IR MANAGER · ÚČET</span><h2><?= ir_e(at('create')) ?></h2><p><?= ir_e(at('create_sub')) ?></p></header>
            <form method="post" class="ir-auth-form" autocomplete="on">
                <?= ir_csrf_field() ?>
                <input type="hidden" name="akce" value="register"><input type="hidden" name="mode" value="register"><input type="hidden" name="lang" value="<?= ir_e($lang) ?>">
                <label><span><?= ir_e(at('username')) ?></span><input name="jmeno" value="<?= ir_e($oldUsername) ?>" minlength="3" maxlength="50" required autocomplete="username"></label>
                <label><span><?= ir_e(at('email')) ?></span><input type="email" name="email" value="<?= ir_e($oldEmail) ?>" required autocomplete="email"></label>
                <label><span><?= ir_e(at('password')) ?></span><input type="password" name="heslo" minlength="8" required autocomplete="new-password"></label>
                <label><span><?= ir_e(at('password2')) ?></span><input type="password" name="heslo2" minlength="8" required autocomplete="new-password"></label>
                <button class="ir-primary-btn wide" type="submit"><?= ir_e(at('register_btn')) ?><?= ir_icon('arrow-right') ?></button>
            </form>
        <?php elseif ($mode === 'forgot'): ?>
            <header><span class="ir-kicker">OBNOVA HESLA</span><h2><?= ir_e(at('forgot')) ?></h2><p><?= ir_e(at('forgot_sub')) ?></p></header>
            <form method="post" class="ir-auth-form">
                <?= ir_csrf_field() ?>
                <input type="hidden" name="akce" value="forgot"><input type="hidden" name="mode" value="forgot"><input type="hidden" name="lang" value="<?= ir_e($lang) ?>">
                <label><span><?= ir_e(at('email')) ?></span><input type="email" name="email" value="<?= ir_e($oldEmail) ?>" required autocomplete="email"></label>
                <button class="ir-primary-btn wide" type="submit"><?= ir_e(at('send_reset')) ?><?= ir_icon('arrow-right') ?></button>
            </form>
            <a class="ir-auth-back" href="auth.php?mode=login&lang=<?= ir_e($lang) ?>">← <?= ir_e(at('back')) ?></a>
        <?php elseif ($mode === 'reset'): ?>
            <header><span class="ir-kicker">NOVÉ HESLO</span><h2><?= ir_e(at('reset')) ?></h2><p><?= ir_e(at('reset_sub')) ?></p></header>
            <form method="post" class="ir-auth-form">
                <?= ir_csrf_field() ?>
                <input type="hidden" name="akce" value="reset"><input type="hidden" name="mode" value="reset"><input type="hidden" name="lang" value="<?= ir_e($lang) ?>"><input type="hidden" name="token" value="<?= ir_e($tokenFromRequest) ?>">
                <label><span><?= ir_e(at('password')) ?></span><input type="password" name="heslo" minlength="8" required autocomplete="new-password"></label>
                <label><span><?= ir_e(at('password2')) ?></span><input type="password" name="heslo2" minlength="8" required autocomplete="new-password"></label>
                <button class="ir-primary-btn wide" type="submit"><?= ir_e(at('save_password')) ?><?= ir_icon('check') ?></button>
            </form>
            <a class="ir-auth-back" href="auth.php?mode=login&lang=<?= ir_e($lang) ?>">← <?= ir_e(at('back')) ?></a>
        <?php else: ?>
            <header><span class="ir-kicker">VÍTEJ ZPĚT</span><h2><?= ir_e(at('welcome')) ?></h2><p><?= ir_e(at('welcome_sub')) ?></p></header>
            <form method="post" class="ir-auth-form" autocomplete="on">
                <?= ir_csrf_field() ?>
                <input type="hidden" name="akce" value="login"><input type="hidden" name="mode" value="login"><input type="hidden" name="lang" value="<?= ir_e($lang) ?>">
                <label><span><?= ir_e(at('username')) ?></span><input name="jmeno" value="<?= ir_e($oldUsername) ?>" required autocomplete="username" autofocus></label>
                <label><span><?= ir_e(at('password')) ?></span><input type="password" name="heslo" required autocomplete="current-password"></label>
                <button class="ir-primary-btn wide" type="submit"><?= ir_e(at('login_btn')) ?><?= ir_icon('arrow-right') ?></button>
            </form>
            <a class="ir-auth-forgot" href="auth.php?mode=forgot&lang=<?= ir_e($lang) ?>"><?= ir_e(at('forgot_link')) ?></a>
            <button class="ir-auth-install" type="button" data-auth-pwa-install><?= ir_icon('plus') ?><span><?= ir_e(at('install')) ?></span></button>
            <small class="ir-auth-install-status" data-auth-pwa-status></small>
        <?php endif; ?>

        <footer><span>IR Manager <?= ir_e(IR_APP_VERSION) ?></span><span>CSRF · password_hash · one-time reset</span></footer>
    </section>
</div>
<script>
(() => {
  let installPrompt = null;
  const button = document.querySelector('[data-auth-pwa-install]');
  const status = document.querySelector('[data-auth-pwa-status]');
  const installed = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; button?.classList.add('is-ready'); });
  button?.addEventListener('click', async () => {
    if (installed()) { if(status) status.textContent = 'IR Manager je už nainstalovaný.'; return; }
    if (installPrompt) { installPrompt.prompt(); try { await installPrompt.userChoice; } catch (_) {} installPrompt = null; return; }
    if(status) status.textContent = /iphone|ipad|ipod/i.test(navigator.userAgent) ? 'Safari: Sdílet → Přidat na plochu.' : 'V menu prohlížeče zvol Nainstalovat aplikaci / Přidat na plochu.';
  });
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(registration=>registration.update()).catch(()=>{}));
})();
</script>
</body>
</html>
