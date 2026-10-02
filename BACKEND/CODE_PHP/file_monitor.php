<?php
header('Content-Type: application/json');

// The core files that must be protected from tampering
$protected_files = [
    'auth.php',
    'waf.php',
    'chat_admin.php',
    'authorize_agent.php',
    'send_signal.php'
];

$file_status = [];
$system_compromised = false;

foreach ($protected_files as $filename) {
    $filepath = __DIR__ . '/' . $filename;
    
    if (file_exists($filepath)) {
        // Get the exact time the file was last edited
        $last_modified = filemtime($filepath);
        $file_status[] = [
            'name' => $filename,
            'status' => 'SECURE',
            'color' => '#1eb9a6',
            'timestamp' => date("Y-m-d H:i:s", $last_modified)
        ];
    } else {
        // If a hacker deleted the file!
        $file_status[] = [
            'name' => $filename,
            'status' => 'MISSING / COMPROMISED',
            'color' => '#e25b3e',
            'timestamp' => 'ERR_NOT_FOUND'
        ];
        $system_compromised = true;
    }
}

// Check if the DEFCON lockdown file is active
$lockdown_active = file_exists(__DIR__ . '/defcon.state');

echo json_encode([
    'success' => true,
    'compromised' => $system_compromised,
    'lockdown' => $lockdown_active,
    'files' => $file_status
]);
?>