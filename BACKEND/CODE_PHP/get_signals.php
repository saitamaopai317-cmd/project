<?php
require_once __DIR__ . '/security_guard.php';
header('Content-Type: application/json');
// Prevent browser caching so the map always sees the newest pings
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
require_once __DIR__ . '/db.php';

try {
    $signals = get_active_signals();
    // Send the data back to the Terminal OS map
    echo json_encode(["success" => true, "data" => $signals]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
}
?>