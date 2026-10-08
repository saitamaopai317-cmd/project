<?php
require_once __DIR__ . '/session_auth.php';
require_once __DIR__ . '/audit_log.php';
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (!is_director_authenticated()) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Director clearance required.']);
    exit;
}

$path = __DIR__ . '/../QUERY/audit.log';
if (!file_exists($path)) {
    echo json_encode(['success' => true, 'events' => []]);
    exit;
}

$file = fopen($path, 'rb');
if ($file === false) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not read the audit log.']);
    exit;
}
if (!flock($file, LOCK_SH)) {
    fclose($file);
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Could not lock the audit log.']);
    exit;
}
$lines = [];
while (($line = fgets($file)) !== false) {
    $lines[] = $line;
}
flock($file, LOCK_UN);
fclose($file);

$events = [];
foreach (array_slice($lines, -100) as $line) {
    $event = json_decode($line, true);
    if (is_array($event)) $events[] = $event;
}
echo json_encode(['success' => true, 'events' => array_reverse($events)], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
?>
