<?php
// Activate the Global Web Application Firewall (WAF)
require_once 'waf.php';

header('Content-Type: application/json');
$data = json_decode(file_get_contents('php://input'), true);

if (!isset($data['name'])) {
    echo json_encode(['success' => false, 'error' => 'Missing hero name.']);
    exit;
}

try {
    $pdo = new PDO("mysql:host=localhost;dbname=san_frans_sector", "sdn_user", "admin123");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    
    // We added x and y to the INSERT statement, defaulting the hero to the center of the map (50, 50)
    $sql = "INSERT INTO heroes (name, skill, status, stat_combat, stat_defense, stat_agility, stat_comms, stat_intel, x, y) 
            VALUES (:name, :skill, 'RESTING', :combat, :defense, :agility, :comms, :intel, 50, 50)";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        'name' => $data['name'],
        'skill' => $data['skill'],
        'combat' => $data['combat'] ?? 50,
        'defense' => $data['defense'] ?? 50,
        'agility' => $data['agility'] ?? 50,
        'comms' => $data['comms'] ?? 50,
        'intel' => $data['intel'] ?? 50
    ]);

    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'error' => 'DB Error: ' . $e->getMessage()]);
}
?>