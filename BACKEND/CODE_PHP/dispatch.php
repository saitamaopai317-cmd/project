<?php
header('Content-Type: application/json');
require_once __DIR__ . '/db.php';

$request = json_decode(file_get_contents('php://input'), true);

$action = $request['action'] ?? ''; 
$incident_id = $request['incident_id'] ?? '';
$hero_ids = $request['hero_ids'] ?? [];

$result_status = "error";

$db = modify_db(function(&$db) use ($action, $incident_id, $hero_ids, &$result_status) {
    if (isset($db['incidents'][$incident_id]) && $db['incidents'][$incident_id]['status'] === 'active') {
        if ($action === 'timeout') {
            $db['incidents'][$incident_id]['status'] = 'failed';
            $db['threat_level'] = ($db['threat_level'] ?? 0) + 20; 
            $result_status = "timeout";
        } else if ($action === 'deploy' && !empty($hero_ids)) {
            $team_skills = [];
            $offset = 0;
            
            foreach ($hero_ids as $h_id) {
                if (isset($db['heroes'][$h_id])) {
                    $db['heroes'][$h_id]['x'] = $db['incidents'][$incident_id]['x'] + ($offset * 2);
                    $db['heroes'][$h_id]['y'] = $db['incidents'][$incident_id]['y'] - ($offset * 2);
                    $team_skills[] = $db['heroes'][$h_id]['skill'];
                    $offset++;
                }
            }
            
            $req_skill = $db['incidents'][$incident_id]['req_skill'] ?? '';
            
            if (in_array($req_skill, $team_skills)) {
                $db['incidents'][$incident_id]['status'] = 'resolved';
                $db['threat_level'] = ($db['threat_level'] ?? 0) - 10; 
                $result_status = "success";
            } else {
                $db['incidents'][$incident_id]['status'] = 'failed';
                $db['threat_level'] = ($db['threat_level'] ?? 0) + 15; 
                $result_status = "mismatch";
            }
        }
        $db['threat_level'] = max(0, min(100, $db['threat_level'] ?? 0));
    }
    return $db;
});

echo json_encode(["result" => $result_status, "state" => $db]);
?>