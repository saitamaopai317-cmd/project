<?php
header('Cache-Control: no-store, no-cache');
header('Content-Type: application/json');

$raw_input = file_get_contents('php://input');
$url_input = urldecode($_SERVER['REQUEST_URI']);

$threat_signatures = [
    '/<script>/i',         
    '/UNION SELECT/i',     
    '/DROP TABLE/i',       
    '/OR 1=1/i',           
    '/SLEEP\(/i',          
    '/javascript:/i',      
    '/-- /i'               
];

foreach ($threat_signatures as $pattern) {
    if (preg_match($pattern, $raw_input) || preg_match($pattern, $url_input)) {
        http_response_code(403);
        echo json_encode([
            "success" => false, 
            "message" => "SECURITY PROTOCOL TRIPPED: MALICIOUS PAYLOAD BLOCKED. FLAG{n1c3_try_t3ach3r_w4f_1s_4ct1v3}"
        ]);
        exit; 
    }
}
// --------------------------------------

$request = json_decode($raw_input, true);
$input_password = $request['password'] ?? '';

// 🔒 PASTE YOUR GENERATED BCRYPT HASHES HERE
// The plaintext passwords '200727' and '200828' no longer exist in this file.
$hash_dispatcher = '$2y$12$5rXAk3jETnAPXgvvPItmGuJzIOC8U6yG46YKokD9cH4hgbbmejsyi';
$hash_director   = '$2y$12$PKL2wmUYhCrCp5gBWEeVuuWqXFJMs2bXcj0FZpuiRQQwssNfyRLZO';

$token = bin2hex(random_bytes(16));

// Securely hash the incoming attempt and compare it to the stored hashes
if (password_verify($input_password, $hash_dispatcher)) {
    echo json_encode([
        "success" => true,
        "token" => $token,
        "role" => "admin",
        "message" => "CLEARANCE GRANTED: WELCOME DISPATCHER"
    ]);
} elseif (password_verify($input_password, $hash_director)) {
    echo json_encode([
        "success" => true,
        "token" => $token,
        "role" => "super_admin",
        "message" => "CLEARANCE GRANTED: WELCOME DIRECTOR"
    ]);
} else {
    echo json_encode([
        "success" => false,
        "message" => "ACCESS DENIED: INVALID SECURITY CLEARANCE"
    ]);
}
?>