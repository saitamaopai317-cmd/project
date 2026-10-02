<?php
header('Content-Type: application/json');
$pdo = new PDO("mysql:host=localhost;dbname=san_frans_sector", "sdn_user", "admin123");

// If a message is being sent (POST request)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = json_decode(file_get_contents('php://input'), true);
    $stmt = $pdo->prepare("INSERT INTO admin_comms (sender, message) VALUES (?, ?)");
    $stmt->execute([$data['sender'], $data['message']]);
    echo json_encode(['success' => true]);
    exit;
}

// If retrieving messages (GET request)
$stmt = $pdo->query("SELECT * FROM admin_comms ORDER BY id ASC");
$messages = $stmt->fetchAll(PDO::FETCH_ASSOC);
echo json_encode(['success' => true, 'messages' => $messages]);
?>