<?php
require_once __DIR__ . '/security_guard.php';
// Secure this endpoint with the WAF!
require_once 'waf.php'; 
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
require_once __DIR__ . '/db.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['hero_id'])) {
    echo json_encode(['success' => false, 'error' => 'Missing hero ID.']);
    exit;
}

try {
    // Delete the specific hero from the database file
    delete_hero_record($data['hero_id']);
    echo json_encode(['success' => true]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Delete Error: ' . $e->getMessage()]);
}
?>