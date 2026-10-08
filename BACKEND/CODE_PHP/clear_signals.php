<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

// Check if the map sent a specific incident ID (via GET query or JSON body)
$id = isset($_GET['id']) && trim((string)$_GET['id']) !== '' ? trim((string)$_GET['id']) : null;

if (!$id) {
    $raw_input = file_get_contents('php://input');
    $post_data = json_decode($raw_input, true);
    if (isset($post_data['id']) && trim((string)$post_data['id']) !== '') {
        $id = trim((string)$post_data['id']);
    }
}

try {
    // If an ID was sent, delete only that specific beacon. Otherwise, clear all active signals.
    clear_signals_record($id);
    echo json_encode(["success" => true, "cleared_id" => $id]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>