<?php
header('Content-Type: application/json');

$requestMethod = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($requestMethod === 'OPTIONS') {
    return;
}

$readOnlyEndpoints = [
    'file_monitor.php',
    'get_heroes.php',
    'get_signals.php',
    'get_state.php',
    'secure_line.php'
];

$endpoint = basename($_SERVER['SCRIPT_FILENAME'] ?? '');
$lockfile = __DIR__ . '/defcon.state';

if (file_exists($lockfile) &&
    ($requestMethod !== 'GET' || !in_array($endpoint, $readOnlyEndpoints, true))) {
    http_response_code(503);
    header('Cache-Control: no-store');
    echo json_encode([
        'success' => false,
        'error' => 'DEFCON-1 ACTIVE: API ACCESS IS READ-ONLY.'
    ]);
    exit;
}
?>
