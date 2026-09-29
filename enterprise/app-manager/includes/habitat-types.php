<?php
declare(strict_types=1);

if (!function_exists('ir_habitat_types')) {
    function ir_habitat_types(): array {
        return [
            'Terárium',
            'Paludárium',
            'Akvaterárium',
            'Plastový box',
            'Rack box',
            'Inkubační box',
            'Karanténní box',
        ];
    }
}

if (!function_exists('ir_habitat_type')) {
    function ir_habitat_type(string $value): string {
        $value = trim($value);
        if ($value === '') $value = 'Terárium';
        if (!in_array($value, ir_habitat_types(), true)) {
            throw new RuntimeException('Neplatný typ ubikace.');
        }
        return $value;
    }
}
