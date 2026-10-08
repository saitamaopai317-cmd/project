<?php
header('Content-Type: application/json');
header('Cache-Control: no-store');
require_once __DIR__ . '/audit_log.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'error' => 'POST required.']);
    exit;
}

$data = json_decode(file_get_contents('php://input'), true);
$expectedCode = getenv('SENTINEL_OVERRIDE_CODE');
$providedCode = is_array($data) ? ($data['code'] ?? '') : '';
$action = is_array($data) ? ($data['action'] ?? '') : '';

if (!is_string($expectedCode) || $expectedCode === '') {
    http_response_code(503);
    echo json_encode(['success' => false, 'error' => 'Sentinel override is not configured on the server.']);
    exit;
}

if (!is_string($providedCode) || !hash_equals($expectedCode, $providedCode)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'INVALID AUTHORIZATION CODE.']);
    exit;
}

if (!in_array($action, ['lock', 'unlock'], true)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid Sentinel action.']);
    exit;
}

$lockfile = __DIR__ . '/defcon.state';

if ($action === 'lock') {
    if (file_put_contents($lockfile, "LOCKED BY SENTINEL\n", LOCK_EX) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Could not activate lockdown. Check server file permissions.']);
        exit;
    }
    write_audit_event('defcon', 'sentinel', 'locked');
    echo json_encode(['success' => true, 'status' => 'LOCKED']);
} else {
    if (file_exists($lockfile) && !unlink($lockfile)) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Could not remove lockdown. Check server file permissions.']);
        exit;
    }
    write_audit_event('defcon', 'sentinel', 'unlocked');
    echo json_encode(['success' => true, 'status' => 'SECURE']);
}
?>