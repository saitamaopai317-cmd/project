<?php
// Secure this endpoint with the WAF!
require_once 'waf.php'; 
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['hero_id'])) {
    echo json_encode(['success' => false, 'error' => 'Missing hero ID.']);
    exit;
}

try {
    $pdo = new PDO("mysql:host=localhost;dbname=san_frans_sector", "sdn_user", "admin123");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // Delete the specific hero from the database
    $sql = "DELETE FROM heroes WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(['id' => $data['hero_id']]);

    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => 'DB Error: ' . $e->getMessage()]);
}
?>