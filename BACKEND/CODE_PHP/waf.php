<?php
session_start();

// 1. DEFCON-1 KILL SWITCH CHECK
// If the lockdown file exists, immediately block all POST/INSERT requests.
if ($_SERVER['REQUEST_METHOD'] === 'POST' && file_exists(__DIR__ . '/defcon.state')) {
    header('HTTP/1.1 403 Forbidden');
    die(json_encode(['success' => false, 'error' => 'DEFCON-1 ACTIVE: DATABASE IS IN READ-ONLY LOCKDOWN.']));
}

// 2. RATE LIMITING (Anti-DDOS & Brute Force Protection)
$time_window = 5; // Seconds
$max_requests = 15; // Max allowed requests in the time window

if (!isset($_SESSION['req_count'])) {
    $_SESSION['req_count'] = 0;
    $_SESSION['req_start'] = time();
}

if (time() - $_SESSION['req_start'] > $time_window) {
    $_SESSION['req_count'] = 0;
    $_SESSION['req_start'] = time();
}

$_SESSION['req_count']++;

if ($_SESSION['req_count'] > $max_requests) {
    header('HTTP/1.1 429 Too Many Requests');
    die(json_encode(['success' => false, 'error' => 'RATE LIMIT EXCEEDED. IP LOGGED.']));
}

// 3. XSS & SQL INJECTION PAYLOAD SCANNER
$malicious_patterns = [
    '/<script>/i',       // XSS Attempt
    '/UNION SELECT/i',   // SQLi Attempt
    '/DROP TABLE/i',     // Database Drop Attempt
    '/--/'               // SQL Comment injection
];

$input_data = file_get_contents('php://input');

foreach ($malicious_patterns as $pattern) {
    if (preg_match($pattern, $input_data)) {
        header('HTTP/1.1 403 Forbidden');
        // Bonus: Returns a CTF flag if they try to hack the system during the demo!
        die(json_encode(['success' => false, 'error' => 'WAF: MALICIOUS PAYLOAD BLOCKED.', 'flag' => 'CTF{san_franz_waf_secured}']));
    }
}
?>