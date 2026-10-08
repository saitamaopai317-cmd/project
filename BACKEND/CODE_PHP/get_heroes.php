<?php
header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");
require_once __DIR__ . '/db.php';

try {
    $heroes = get_all_heroes();
    echo json_encode(["success" => true, "heroes" => $heroes]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => "Database Read Error: " . $e->getMessage()]);
}
?>