<?php
header('Content-Type: application/json');

try {
    $pdo = new PDO("mysql:host=localhost;dbname=san_frans_sector", "sdn_user", "admin123");
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Fetch all heroes
    $stmt = $pdo->query("SELECT * FROM heroes");
    $heroes = [];
    
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        // Use 'id' or 'hero_id' based on what your table uses
        $hero_id = isset($row['id']) ? $row['id'] : $row['hero_id'];
        
        $heroes[$hero_id] = [
            'id' => $hero_id,
            'name' => $row['name'],
            'skill' => $row['skill'],
            'status' => $row['status'],
            
            // Pass the stats to the frontend!
            'stat_combat' => $row['stat_combat'] ?? 65,
            'stat_defense' => $row['stat_defense'] ?? 50,
            'stat_agility' => $row['stat_agility'] ?? 70,
            'stat_comms' => $row['stat_comms'] ?? 45,
            'stat_intel' => $row['stat_intel'] ?? 60
        ];
    }

    echo json_encode(["success" => true, "heroes" => $heroes]);
} catch (PDOException $e) {
    echo json_encode(["success" => false, "error" => "Database Connection Failed: " . $e->getMessage()]);
}
?>