<?php
require_once __DIR__ . '/security_guard.php';
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Cache-Control: post-check=0, pre-check=0', false);
header('Pragma: no-cache');
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

echo json_encode(get_db(), JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
?>