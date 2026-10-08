<?php
require_once __DIR__ . '/security_guard.php';
// Activate the Global Web Application Firewall (WAF)
require_once __DIR__ . '/waf.php';
require_once __DIR__ . '/db.php';

header('Content-Type: application/json');
header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
header("Pragma: no-cache");

$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

if (!$data || !isset($data['name']) || empty(trim($data['name']))) {
    echo json_encode(['success' => false, 'error' => 'Missing hero codename.']);
    exit;
}

try {
    $rawSkill = strtolower(trim($data['skill'] ?? 'tech'));
    if ($rawSkill === 'combat') $rawSkill = 'brawler';
    if ($rawSkill === 'support') $rawSkill = 'tech';

    $stats = [
        'combat' => (int)($data['combat'] ?? 75),
        'defense' => (int)($data['defense'] ?? 60),
        'agility' => (int)($data['agility'] ?? 70),
        'comms' => (int)($data['comms'] ?? 55),
        'intel' => (int)($data['intel'] ?? 65)
    ];

    // Give each new hero a visible patrol coordinate across San Franz sectors
    $posX = isset($data['x']) ? (int)$data['x'] : rand(25, 75);
    $posY = isset($data['y']) ? (int)$data['y'] : rand(25, 75);

    $heroName = strtoupper(trim(strip_tags($data['name'])));
    $hero = add_hero_record($heroName, $rawSkill, $stats, $posX, $posY);

    echo json_encode(['success' => true, 'hero' => $hero, 'message' => "Hero {$heroName} successfully deployed to active roster."]);
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => 'Deployment Error: ' . $e->getMessage()]);
}
?>