<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$data = json_decode(file_get_contents('php://input'), true);

if ($data && isset($data['hero_id']) && isset($data['action'])) {
    $heroId = $data['hero_id'];
    $action = $data['action'];
    update_hero_stats($heroId, $action);
}

echo json_encode(["status" => "Record logged successfully"]);
?>