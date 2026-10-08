<?php
/**
 * SAN FRANZ SECTOR - PORTABLE SINGLE-FILE DATABASE SYSTEM
 * 
 * Replaces external MariaDB/MySQL server dependencies with a self-contained,
 * zero-configuration single JSON database file (BACKEND/QUERY/db.json).
 * Automatically initializes tables and default assets if missing.
 */

// Normalized path to the database file
function db_file_path() {
    return __DIR__ . '/../QUERY/db.json';
}

// Default initial dataset
function get_default_db() {
    return [
        'threat_level' => 20,
        'heroes' => [
            '1' => [
                'id' => 1,
                'name' => base64_encode('FLAMBAE'),
                'skill' => 'elemental',
                'status' => 'RESTING',
                'stat_combat' => 85,
                'stat_defense' => 50,
                'stat_agility' => 75,
                'stat_comms' => 60,
                'stat_intel' => 65,
                'deeds_logged' => 0,
                'x' => 50,
                'y' => 80
            ],
            '2' => [
                'id' => 2,
                'name' => base64_encode('AEGIS'),
                'skill' => 'brawler',
                'status' => 'RESTING',
                'stat_combat' => 70,
                'stat_defense' => 90,
                'stat_agility' => 55,
                'stat_comms' => 50,
                'stat_intel' => 60,
                'deeds_logged' => 0,
                'x' => 30,
                'y' => 75
            ],
            '3' => [
                'id' => 3,
                'name' => base64_encode('ATLAS'),
                'skill' => 'brawler',
                'status' => 'RESTING',
                'stat_combat' => 80,
                'stat_defense' => 85,
                'stat_agility' => 60,
                'stat_comms' => 45,
                'stat_intel' => 55,
                'deeds_logged' => 0,
                'x' => 80,
                'y' => 80
            ],
            '4' => [
                'id' => 4,
                'name' => base64_encode('ROS AN'),
                'skill' => 'tech',
                'status' => 'RESTING',
                'stat_combat' => 50,
                'stat_defense' => 60,
                'stat_agility' => 70,
                'stat_comms' => 90,
                'stat_intel' => 95,
                'deeds_logged' => 0,
                'x' => 20,
                'y' => 65
            ],
            '5' => [
                'id' => 5,
                'name' => base64_encode('SONAR'),
                'skill' => 'tech',
                'status' => 'RESTING',
                'stat_combat' => 60,
                'stat_defense' => 65,
                'stat_agility' => 80,
                'stat_comms' => 85,
                'stat_intel' => 85,
                'deeds_logged' => 0,
                'x' => 65,
                'y' => 70
            ]
        ],
        'signals' => [
            [
                'id' => 1,
                'civilian_name' => 'Dr. Sarah Lin',
                'location' => 'North Pier Sector 4',
                'signal_type' => 'emergency',
                'requested_heroes' => '2,4',
                'status' => 'active',
                'created_at' => date('Y-m-d H:i:s')
            ]
        ],
        'admin_comms' => [
            [
                'id' => 1,
                'sender' => 'DIRECTOR',
                'message' => 'All sector assets on alert. Standby for dispatch directives.',
                'created_at' => date('Y-m-d H:i:s')
            ]
        ],
        'incidents' => [],
        'decorations' => [],
        'next_hero_id' => 6,
        'next_signal_id' => 2,
        'next_comm_id' => 2
    ];
}

// Thread-safe read with shared lock
function get_db() {
    $path = db_file_path();
    if (!file_exists($path)) {
        $db = get_default_db();
        save_db($db);
        return $db;
    }

    $fp = fopen($path, 'r');
    if (!$fp) {
        return get_default_db();
    }

    flock($fp, LOCK_SH);
    $content = stream_get_contents($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    $data = json_decode($content, true);
    if (!is_array($data)) {
        $db = get_default_db();
        save_db($db);
        return $db;
    }

    // Ensure core collections exist
    if (!isset($data['heroes']) || !is_array($data['heroes'])) {
        $data['heroes'] = get_default_db()['heroes'];
    }
    if (!isset($data['signals']) || !is_array($data['signals'])) {
        $data['signals'] = [];
    }
    if (!isset($data['admin_comms']) || !is_array($data['admin_comms'])) {
        $data['admin_comms'] = [];
    }

    return $data;
}

// Thread-safe overwrite
function save_db($data) {
    $path = db_file_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);

    $fp = fopen($path, 'c+');
    if (!$fp) {
        return file_put_contents($path, $json) !== false;
    }

    if (flock($fp, LOCK_EX)) {
        ftruncate($fp, 0);
        rewind($fp);
        fwrite($fp, $json);
        fflush($fp);
        flock($fp, LOCK_UN);
        fclose($fp);
        return true;
    } else {
        fclose($fp);
        return file_put_contents($path, $json) !== false;
    }
}

// Thread-safe atomic read-modify-write helper
function modify_db(callable $callback) {
    $path = db_file_path();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    $fp = fopen($path, 'c+');
    if (!$fp) {
        $data = get_db();
        $result = $callback($data);
        save_db($data);
        return $result;
    }

    flock($fp, LOCK_EX);
    $content = stream_get_contents($fp);
    $data = json_decode($content, true);
    if (!is_array($data)) {
        $data = get_default_db();
    }
    if (!isset($data['heroes']) || !is_array($data['heroes'])) $data['heroes'] = [];
    if (!isset($data['signals']) || !is_array($data['signals'])) $data['signals'] = [];
    if (!isset($data['admin_comms']) || !is_array($data['admin_comms'])) $data['admin_comms'] = [];

    $result = $callback($data);

    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, $json);
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);

    return $result;
}

// --- HERO HELPERS ---

function get_all_heroes() {
    $db = get_db();
    $heroes = [];
    foreach ($db['heroes'] as $key => $hero) {
    $id = isset($hero['id']) ? $hero['id'] : $key;
    $rawName = $hero['name'] ?? '';
    $decodedName = base64_decode($rawName, true);
    $name = $decodedName !== false ? $decodedName : $rawName;
    $heroes[$id] = [
        'id' => $id,
        'name' => $name ?: 'Agent',
        'skill' => $hero['skill'] ?? 'tech',
        'status' => $hero['status'] ?? 'RESTING',
        'stat_combat' => (int)($hero['stat_combat'] ?? 65),
        'stat_defense' => (int)($hero['stat_defense'] ?? 50),
        'stat_agility' => (int)($hero['stat_agility'] ?? 70),
        'stat_comms' => (int)($hero['stat_comms'] ?? 45),
        'stat_intel' => (int)($hero['stat_intel'] ?? 60),
        'deeds_logged' => (int)($hero['deeds_logged'] ?? 0),
        'x' => (int)($hero['x'] ?? 50),
        'y' => (int)($hero['y'] ?? 50),
    ];
    }
    return $heroes;
}

function add_hero_record($name, $skill, $stats = [], $x = null, $y = null) {
    return modify_db(function(&$db) use ($name, $skill, $stats, $x, $y) {
        $maxId = 0;
        foreach ($db['heroes'] as $h) {
            $num = (int)($h['id'] ?? 0);
            if ($num > $maxId) $maxId = $num;
        }
        $nextId = $maxId + 1;
        if (isset($db['next_hero_id']) && (int)$db['next_hero_id'] > $nextId) {
            $nextId = (int)$db['next_hero_id'];
        }
        $db['next_hero_id'] = $nextId + 1;

        $posX = ($x !== null) ? (int)$x : rand(20, 80);
        $posY = ($y !== null) ? (int)$y : rand(20, 80);

        $encodedName = base64_encode(strtoupper(trim($name)));
        $hero = [
            'id' => $nextId,
            'name' => $encodedName,
            'skill' => strtolower(trim($skill)),
            'status' => 'RESTING',
            'stat_combat' => (int)($stats['combat'] ?? 65),
            'stat_defense' => (int)($stats['defense'] ?? 50),
            'stat_agility' => (int)($stats['agility'] ?? 70),
            'stat_comms' => (int)($stats['comms'] ?? 45),
            'stat_intel' => (int)($stats['intel'] ?? 60),
            'deeds_logged' => 0,
            'x' => $posX,
            'y' => $posY
        ];

        $db['heroes'][(string)$nextId] = $hero;
        return $hero;
    });
}

function delete_hero_record($hero_id) {
    return modify_db(function(&$db) use ($hero_id) {
        $target = (string)$hero_id;
        $found = false;
        foreach ($db['heroes'] as $key => $h) {
            if ((string)($h['id'] ?? '') === $target || (string)$key === $target) {
                unset($db['heroes'][$key]);
                $found = true;
            }
        }
        return $found;
    });
}

function update_hero_stats($hero_id, $action) {
    return modify_db(function(&$db) use ($hero_id, $action) {
        $target = (string)$hero_id;
        foreach ($db['heroes'] as $key => &$h) {
            if ((string)($h['id'] ?? '') === $target || (string)$key === $target) {
                if ($action === 'civilian_saved') {
                    $h['stat_defense'] = ($h['stat_defense'] ?? 50) + 2;
                    $h['stat_agility'] = ($h['stat_agility'] ?? 70) + 2;
                    $h['deeds_logged'] = ($h['deeds_logged'] ?? 0) + 1;
                } elseif ($action === 'threat_neutralized') {
                    $h['stat_combat'] = ($h['stat_combat'] ?? 65) + 3;
                    $h['deeds_logged'] = ($h['deeds_logged'] ?? 0) + 1;
                }
                return true;
            }
        }
        return false;
    });
}

// --- SIGNALS HELPERS ---

function get_active_signals() {
    $db = get_db();
    $signals = [];
    foreach ($db['signals'] as $sig) {
        if (($sig['status'] ?? '') === 'active') {
            $signals[] = $sig;
        }
    }
    return $signals;
}

function add_signal_record($name, $location, $type, $requested) {
    return modify_db(function(&$db) use ($name, $location, $type, $requested) {
        // Anti-duplicate protection: If an active beacon already exists for this entity, update and return it
        foreach ($db['signals'] as &$existingSig) {
            if (($existingSig['status'] ?? '') === 'active' && 
                ($existingSig['civilian_name'] ?? '') === $name && 
                ($existingSig['signal_type'] ?? '') === $type) {
                $existingSig['location'] = $location;
                $existingSig['requested_heroes'] = $requested;
                $existingSig['created_at'] = date('Y-m-d H:i:s');
                return $existingSig;
            }
        }

        $maxId = 0;
        foreach ($db['signals'] as $sig) {
            $num = (int)($sig['id'] ?? 0);
            if ($num > $maxId) $maxId = $num;
        }
        $nextId = $maxId + 1;
        if (isset($db['next_signal_id']) && (int)$db['next_signal_id'] > $nextId) {
            $nextId = (int)$db['next_signal_id'];
        }
        $db['next_signal_id'] = $nextId + 1;

        $signal = [
            'id' => $nextId,
            'civilian_name' => $name,
            'location' => $location,
            'signal_type' => $type,
            'requested_heroes' => $requested,
            'status' => 'active',
            'created_at' => date('Y-m-d H:i:s')
        ];

        $db['signals'][] = $signal;
        return $signal;
    });
}

function clear_signals_record($id = null) {
    return modify_db(function(&$db) use ($id) {
        if ($id !== null && $id !== '') {
            $target = (string)$id;
            $newSignals = [];
            foreach ($db['signals'] as $sig) {
                if ((string)($sig['id'] ?? '') !== $target) {
                    $newSignals[] = $sig;
                }
            }
            $db['signals'] = array_values($newSignals);
        } else {
            $db['signals'] = [];
        }
        return true;
    });
}

// --- ADMIN COMMS HELPERS ---

function get_admin_messages() {
    $db = get_db();
    $messages = $db['admin_comms'] ?? [];
    usort($messages, function($a, $b) {
        return ($a['id'] ?? 0) <=> ($b['id'] ?? 0);
    });
    return array_values($messages);
}

function add_admin_message($sender, $message) {
    return modify_db(function(&$db) use ($sender, $message) {
        $maxId = 0;
        foreach ($db['admin_comms'] as $msg) {
            $num = (int)($msg['id'] ?? 0);
            if ($num > $maxId) $maxId = $num;
        }
        $nextId = $maxId + 1;
        if (isset($db['next_comm_id']) && (int)$db['next_comm_id'] > $nextId) {
            $nextId = (int)$db['next_comm_id'];
        }
        $db['next_comm_id'] = $nextId + 1;

        $entry = [
            'id' => $nextId,
            'sender' => $sender,
            'message' => $message,
            'created_at' => date('Y-m-d H:i:s')
        ];

        $db['admin_comms'][] = $entry;
        return $entry;
    });
}
?>
