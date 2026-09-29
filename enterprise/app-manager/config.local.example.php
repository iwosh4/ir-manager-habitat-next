<?php
return [
    'db_host' => 'localhost',
    'db_port' => 3306,
    'db_name' => 'DATABASE_NAME',
    'db_user' => 'DATABASE_USER',
    'db_pass' => 'DATABASE_PASSWORD',
    'auth_table' => 'wp_ir2__uzivatele',

    // Canonical public URL. Security-sensitive links (password reset) use only
    // this configured value and never the incoming Host header.
    'public_url' => 'https://example.cz/app-manager',
    'allowed_hosts' => ['example.cz'],
    'force_https' => true,
    'trust_proxy_headers' => false,

    // Public self-registration is intentionally OFF by default.
    'allow_registration' => false,

    'mail_from' => 'no-reply@example.cz',
    'mail_from_name' => 'IR Manager',

    // Home Assistant: RFC1918/ULA private networks are allowed by default.
    // Add a public hostname here only when you explicitly want to connect to it.
    'ha_allow_private_networks' => true,
    'ha_allowed_hosts' => [],

    // Optional application secret used for connector-token encryption.
    // 'app_secret' => 'replace-with-a-long-random-secret',
];
