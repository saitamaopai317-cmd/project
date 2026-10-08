<?php
require_once __DIR__ . '/session_auth.php';
require_once __DIR__ . '/audit_log.php';
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (!is_director_authenticated()) {
    write_audit_event('classified_reserves_read', 'anonymous', 'denied', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    http_response_code(403);
    echo json_encode([
        'success' => false,
        'error' => 'Director clearance required.'
    ]);
    exit;
}

write_audit_event('classified_reserves_read', (string) ($_SESSION['worker_id'] ?? 'director'), 'success');
$agents = [
    'C1' => [
        'name' => 'ECLIPSE',
        'skill' => 'mental',
        'true_name' => 'Kaelen Vance',
        'blood_type' => 'O- Negative',
        'eval' => 'Clinical empathy suppression. Psionic overload capable.',
        'stats' => ['combat' => 90, 'defense' => 60, 'agility' => 80, 'comms' => 40, 'intel' => 95]
    ],
    'C2' => [
        'name' => 'OVERRIDE',
        'skill' => 'tech',
        'true_name' => 'Jax Mercer',
        'blood_type' => 'AB+ Enhanced',
        'eval' => 'Textbook sociopathy channeled into tactical cyber warfare.',
        'stats' => ['combat' => 85, 'defense' => 85, 'agility' => 70, 'comms' => 90, 'intel' => 85]
    ]
];

echo json_encode(['success' => true, 'agents' => $agents], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
?>
