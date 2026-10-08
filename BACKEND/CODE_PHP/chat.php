<?php
// 1. Instantly start trapping ALL garbage output, warnings, or HTML
ob_start();
error_reporting(0);
ini_set('display_errors', 0);

// 2. CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-SDN-Auth');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    ob_end_clean();
    http_response_code(200);
    exit;
}

// 3. Parse JS Input
function read_chat_request() {
    $raw = file_get_contents('php://input');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    if (!empty($_POST)) {
        return $_POST;
    }

    if (!empty($_REQUEST)) {
        return $_REQUEST;
    }

    return [];
}

function build_local_reply($heroName, $heroSkill, $activeThreats, $userMessage, $history) {
    $skill = strtolower(trim((string) $heroSkill));
    $message = strtolower(trim((string) $userMessage));
    $normalized = preg_replace('/[^a-z0-9\s]/', ' ', $message);
    $threatText = $activeThreats > 0 ? "Threats remain active across the grid." : "Sector is stable and secured.";

    $greetingReplies = [
        "Hey, this is $heroName. The channel is open and I’m ready to help.",
        "$heroName online. I’ve got the line and I’m listening.",
        "Copy that. $heroName here, standing by for your command."
    ];

    $selfIntroReplies = [
        "$heroName online. I’m the tactical operator on this line, and I’m ready for orders.",
        "I’m $heroName, and I’m locked onto the channel with the squad.",
        "$heroName reporting in. Ready to coordinate and hold the line."
    ];

    $statusReplies = [
        "$heroName reports: $threatText",
        "$heroName status: the field is steady, and the channel remains secure.",
        "$heroName checking in. $threatText"
    ];

    $supportReplies = [
        "$heroName confirms tactical order received and is holding position. $threatText",
        "Understood. $heroName is moving to cover the squad and maintain the channel.",
        "$heroName acknowledges. I’m holding the line and ready to support."
    ];

    $threatReplies = [
        "$heroName is tracking the hostile signature. $threatText",
        "Hostile contact detected. $heroName is locking down the response window.",
        "$heroName has eyes on the threat and is holding a defensive posture."
    ];

    $skillReplies = [
        'elemental' => [
            'My elementals are stable and ready to respond.',
            'My field is steady, and the charge is under control.',
            'I’ve got the elemental channel balanced and ready to move.'
        ],
        'brawler' => [
            'My armor is locked in and I’m pushing forward.',
            'The line is heavy and ready for contact.',
            'My guard is up and I’m ready to absorb the pressure.'
        ],
        'tech' => [
            'My systems are stable and scanning the field.',
            'The signal matrix is clean and I’m tracking everything.',
            'I’ve got the network clear and the comms are live.'
        ],
        'healer' => [
            'I’m keeping the line steady and ready to support.',
            'The support channel is stable, and I’m ready to assist.',
            'I’ve got the med-tech line open and the team covered.'
        ],
    ];

    if (preg_match('/\b(hi|hello|hey|hey there|greetings|good morning|good evening)\b/', $message)) {
        return $greetingReplies[array_sum(array_map('ord', str_split(substr($heroName, 0, 3)))) % count($greetingReplies)];
    }

    if (preg_match('/\b(who are you|what is your name|your name)\b/', $message)) {
        return $selfIntroReplies[array_sum(array_map('ord', str_split(substr($heroName, 0, 4)))) % count($selfIntroReplies)];
    }

    if (preg_match('/\b(status|report|how are you|what is going on|update)\b/', $message)) {
        return $statusReplies[array_sum(array_map('ord', str_split(substr($heroName, 0, 2)))) % count($statusReplies)];
    }

    if (preg_match('/\b(help|support|cover|hold|move|stay|block|guard)\b/', $message)) {
        return $supportReplies[array_sum(array_map('ord', str_split(substr($heroName, 0, 5)))) % count($supportReplies)];
    }

    if (preg_match('/\b(threat|hostile|enemy|attack|alert|danger)\b/', $message) || $activeThreats > 0) {
        return $threatReplies[array_sum(array_map('ord', str_split(substr($heroName, 0, 3)))) % count($threatReplies)];
    }

    $historyCount = count($history);
    $skillList = $skillReplies[$skill] ?? [
        'The channel is stable and I’m ready to move.',
        'I’m locked in on the mission and ready to respond.',
        'I’ve got the line and I’m ready for the next order.'
    ];
    $baseReply = $skillList[array_sum(array_map('ord', str_split($heroName))) % count($skillList)];

    if ($historyCount > 0) {
        return "$baseReply We’ve already covered $historyCount exchange(s), and I’m still locked in on the mission.";
    }

    if (strlen($normalized) <= 3) {
        return "Copy that. I’m listening on the channel and ready to respond.";
    }

    return "$baseReply I’m on the line and ready to support the squad.";
}

$request = read_chat_request();

$userMessage = trim((string)($request['message'] ?? $_POST['message'] ?? $_GET['message'] ?? ''));
$history = isset($request['history']) && is_array($request['history']) ? $request['history'] : [];
$heroName = trim((string)($request['hero_name'] ?? 'Agent')) ?: 'Agent';
$heroSkill = trim((string)($request['hero_skill'] ?? 'tactical')) ?: 'tactical';
$activeThreats = (int)($request['active_threats'] ?? 0);

if ($userMessage === '') {
    $reply = 'ERROR: NO TRANSMISSION RECEIVED.';
} else {
    $reply = build_local_reply($heroName, $heroSkill, $activeThreats, $userMessage, $history);
    $apiKey = getenv('GROQ_API_KEY') ?: '';
    $apiUrl = 'https://api.groq.com/openai/v1/chat/completions';

    if (function_exists('curl_init') && !empty($apiKey)) {
        $mapContext = ($activeThreats > 0) ? "There are $activeThreats active threats." : "The sector map is clear.";
        $systemPrompt = "You are $heroName, a $heroSkill specialist. $mapContext Keep reply under 2 sentences, strictly in-character. Do not invent threats. Do not introduce yourself as AI.";

        $messages = [["role" => "system", "content" => $systemPrompt]];
        foreach ($history as $prev) {
            if (isset($prev['role'], $prev['content'])) {
                $messages[] = ["role" => $prev['role'], "content" => $prev['content']];
            }
        }
        $messages[] = ["role" => "user", "content" => $userMessage];

        $ch = curl_init($apiUrl);
        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => json_encode(['model' => 'llama-3.1-8b-instant', 'messages' => $messages, 'temperature' => 0.7, 'max_tokens' => 150]),
                CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
                CURLOPT_TIMEOUT => 20,
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => 0,
            ]);

            $response = curl_exec($ch);
            $curlErr = curl_error($ch);
            curl_close($ch);

            if (is_string($response) && trim($response) !== '') {
                $decoded = json_decode($response, true);
                if (isset($decoded['choices'][0]['message']['content']) && trim((string) $decoded['choices'][0]['message']['content']) !== '') {
                    $reply = trim((string) $decoded['choices'][0]['message']['content']);
                } elseif (isset($decoded['error']['message'])) {
                    $reply = "[GROQ API ERROR: " . $decoded['error']['message'] . "]";
                }
            } elseif ($curlErr !== '') {
                $reply = "$heroName acknowledges. Comm link is degraded, but I am holding position. ($curlErr)";
            }
        }
    }
}

try {
    if (file_exists(__DIR__ . '/db.php')) {
        @include_once __DIR__ . '/db.php';
        if (function_exists('add_system_chat_message')) {
            @add_system_chat_message($heroName, $userMessage, 'hero_chat');
            @add_system_chat_message($heroName, $reply, 'hero_chat_response');
        }
    }
} catch (Throwable $e) {
}

$junk = ob_get_clean();
http_response_code(200);
echo json_encode(['reply' => $reply], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
exit;
?>