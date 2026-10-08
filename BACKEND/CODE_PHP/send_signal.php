<?php
// Activate the Global Web Application Firewall (WAF) & SOC Lockdown
require_once __DIR__ . '/waf.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json');

$raw_input = file_get_contents('php://input');
$url_input = urldecode($_SERVER['REQUEST_URI'] ?? '');

// --- WAF TRIPWIRE (Secondary endpoint-specific check) ---
$threat_signatures = ['/<script>/i', '/UNION SELECT/i', '/DROP TABLE/i', '/OR 1=1/i', '/SLEEP\(/i', '/-- /i'];
foreach ($threat_signatures as $pattern) {
    if (preg_match($pattern, $raw_input) || preg_match($pattern, $url_input)) {
        http_response_code(403);
        echo json_encode(["success" => false, "error" => "WAF BLOCKED. FLAG{n1c3_try_t3ach3r_w4f_1s_4ct1v3}"]);
        exit;
    }
}

$data = json_decode($raw_input, true);
if (!$data && !empty($_POST)) {
    $data = $_POST;
}
if (!$data || !isset($data['signal_type'])) {
    echo json_encode(["success" => false, "error" => "No emergency data received."]);
    exit;
}

$name = htmlspecialchars(strip_tags(trim($data['civilian_name'] ?? 'Anonymous Civilian')), ENT_QUOTES, 'UTF-8');
$location = htmlspecialchars(strip_tags(trim($data['location'] ?? 'San Franz Sector')), ENT_QUOTES, 'UTF-8');
$type = ($data['signal_type'] === 'villain') ? 'villain' : 'emergency';
$requested = htmlspecialchars(strip_tags(trim($data['requested_heroes'] ?? '')), ENT_QUOTES, 'UTF-8');

try {
    $signal = add_signal_record($name, $location, $type, $requested);
    echo json_encode(["success" => true, "signal" => $signal]);
} catch (Exception $e) {
    echo json_encode(["success" => false, "error" => "Save Error: " . $e->getMessage()]);
}
?>