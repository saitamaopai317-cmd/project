<?php
// Hide PHP warnings so they don't break our JSON feed!
error_reporting(0);
header('Cache-Control: no-store, no-cache');
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$villains = ["Riot Boss", "Cyber-Ninja", "Mutant Hound", "Rogue AI"];
$civilians = ["Trapped Workers", "Lost Child", "Injured VIP", "Stranded Pilot"];
$skills = ["tech", "elemental", "brawler"];

$incidents = [];
$num_incidents = rand(3, 5);

for ($i = 1; $i <= $num_incidents; $i++) {
    $id = "00" . $i;
    $is_combat = rand(0, 1) == 1;
    
    $incidents[$id] = [
        "id" => $id,
        "type" => $is_combat ? "combat" : "rescue",
        "target" => $is_combat ? "VILLAIN: " . $villains[array_rand($villains)] : "CIVILIAN: " . $civilians[array_rand($civilians)],
        "req_skill" => $skills[array_rand($skills)], 
        "time_left" => rand(25, 45),                 
        "status" => "active",                        
        "x" => rand(15, 85),
        "y" => rand(15, 75),
        "width" => rand(60, 120),
        "height" => rand(60, 120)
    ];
}

$decorations = [];
for ($i = 0; $i < 6; $i++) {
    $decorations[] = [
        "type" => rand(0, 1) == 1 ? "mountain" : "road",
        "x" => rand(0, 90), "y" => rand(0, 90), "size" => rand(100, 300)
    ];
}

$updatedState = modify_db(function(&$db) use ($incidents, $decorations) {
    $db['threat_level'] = 20;
    $db['incidents'] = $incidents;
    $db['decorations'] = $decorations;
    return $db;
});

echo json_encode(["success" => true, "state" => $updatedState]);
?>