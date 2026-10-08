<?php
require_once __DIR__ . '/security_guard.php';
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

// If a message is being sent (POST request)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $sender = trim($data['sender'] ?? 'DISPATCHER');
    $message = trim($data['message'] ?? '');
    if ($message !== '') {
        add_admin_message($sender, $message);
    }
    echo json_encode(['success' => true]);
    exit;
}

// If retrieving messages (GET request)
$messages = get_admin_messages();
echo json_encode(['success' => true, 'messages' => $messages]);
?>