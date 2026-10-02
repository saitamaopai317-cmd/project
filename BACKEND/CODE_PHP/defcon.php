<?php
header('Content-Type: application/json');
$data = json_decode(file_get_contents('php://input'), true);

// Strict Master Password Check
if (($data['code'] ?? '') !== 'GHOST_PROTOCOL') {
    echo json_encode(['success' => false, 'error' => 'INVALID AUTHORIZATION CODE.']);
    exit;
}

$lockfile = __DIR__ . '/defcon.state';

if ($data['action'] === 'lock') {
    file_put_contents($lockfile, "LOCKED BY SOC");
    echo json_encode(['success' => true, 'status' => 'LOCKED']);
} else {
    if (file_exists($lockfile)) {
        unlink($lockfile);
    }
    echo json_encode(['success' => true, 'status' => 'SECURE']);
}
?>