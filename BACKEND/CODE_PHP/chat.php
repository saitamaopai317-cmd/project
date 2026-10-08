<?php
require_once __DIR__ . '/security_guard.php';
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

$request = read_chat_request();

$userMessage = isset($request['message']) && is_string($request['message']) ? trim($request['message']) : '';
$history = isset($request['history']) && is_array($request['history']) ? array_slice($request['history'], -10) : [];
$heroName = trim((string)($request['hero_name'] ?? 'Agent')) ?: 'Agent';
$heroSkill = trim((string)($request['hero_skill'] ?? 'tactical')) ?: 'tactical';
$activeThreats = (int)($request['active_threats'] ?? 0);

if ($userMessage === '' || strlen($userMessage) > 2000) {
    http_response_code(400);
    ob_end_clean();
    echo json_encode(['error' => 'Enter a message under 2,000 characters.']);
    exit;
}

$apiKey = getenv('GROQ_API_KEY') ?: '';
if ($apiKey === '') {
    $apiKeyFile = __DIR__ . '/../QUERY/groq_config.php';
    if (is_file($apiKeyFile)) {
        try {
            $configuredApiKey = require $apiKeyFile;
        } catch (Throwable $error) {
            error_log('Hero Channel API key configuration could not be loaded.');
            http_response_code(503);
            ob_end_clean();
            echo json_encode(['error' => 'Hero Channel AI server configuration could not be loaded. Check groq_config.php.']);
            exit;
        }
        if (!is_string($configuredApiKey)) {
            error_log('Hero Channel API key configuration must return a string.');
            http_response_code(503);
            ob_end_clean();
            echo json_encode(['error' => 'Hero Channel AI server configuration is invalid.']);
            exit;
        }
        $apiKey = trim($configuredApiKey);
    }
}
if ($apiKey === '' || !function_exists('curl_init')) {
    http_response_code(503);
    ob_end_clean();
    echo json_encode(['error' => 'Hero Channel AI is unavailable. Configure the server API key and cURL.']);
    exit;
}

$personality = [
    'elemental' => 'You are bold and intense but disciplined, describing elemental tactics in grounded, concise terms.',
    'brawler' => 'You are direct, dependable, and protective. Use plain tactical language and focus on keeping the team safe.',
    'tech' => 'You are observant, analytical, and dryly witty. Mention systems only when relevant to the conversation.',
    'mental' => 'You are calm, perceptive, and thoughtful. Keep a confident, measured voice.',
    'healer' => 'You are empathetic, practical, and reassuring. Prioritize civilian and team safety.'
];
$skillPersona = $personality[strtolower($heroSkill)] ?? 'You are a professional, grounded field operative with a distinct but natural voice.';
$mapContext = $activeThreats > 0 ? "There are $activeThreats active reports on the sector map." : 'There are no active reports on the sector map.';
$systemPrompt = "You are $heroName, a $heroSkill specialist in a fictional dispatch team. $skillPersona Current situation: $mapContext Respond directly to the dispatcher, follow instructions such as standing by, remember the recent conversation, and do not invent events or claim actions were taken unless the system context confirms them. Use 1-3 natural sentences. Never say you are an AI.";

$messages = [['role' => 'system', 'content' => $systemPrompt]];
foreach ($history as $previousMessage) {
    if (!is_array($previousMessage) ||
        !isset($previousMessage['role'], $previousMessage['content']) ||
        !in_array($previousMessage['role'], ['user', 'assistant'], true) ||
        !is_string($previousMessage['content'])) {
        continue;
    }
    $content = trim($previousMessage['content']);
    if ($content !== '' && strlen($content) <= 2000) {
        $messages[] = ['role' => $previousMessage['role'], 'content' => $content];
    }
}
$messages[] = ['role' => 'user', 'content' => $userMessage];

$ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
if ($ch === false) {
    http_response_code(503);
    ob_end_clean();
    echo json_encode(['error' => 'Could not initialize the Hero Channel AI connection.']);
    exit;
}

curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => json_encode([
        'model' => 'qwen/qwen3.8-27b',
        'messages' => $messages,
        'temperature' => 0.9,
        'max_tokens' => 180
    ]),
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Authorization: Bearer ' . $apiKey],
    CURLOPT_TIMEOUT => 20
]);

$response = curl_exec($ch);
$curlErr = curl_error($ch);
$statusCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if (!is_string($response) || $response === '') {
    error_log('Hero Channel provider request failed: ' . $curlErr);
    http_response_code(502);
    ob_end_clean();
    echo json_encode(['error' => 'Hero Channel connection failed. Please try again.']);
    exit;
}

$decoded = json_decode($response, true);
$reply = $decoded['choices'][0]['message']['content'] ?? '';
if ($statusCode < 200 || $statusCode >= 300 || !is_string($reply) || trim($reply) === '') {
    error_log('Hero Channel provider returned HTTP ' . $statusCode . '.');
    http_response_code(502);
    ob_end_clean();
    echo json_encode(['error' => 'Hero Channel could not generate a reply. Please try again.']);
    exit;
}
$reply = trim($reply);

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