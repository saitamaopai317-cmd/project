<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

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

$messages = get_admin_messages();
echo json_encode(['success' => true, 'messages' => $messages]);
?>
