<?php
require_once __DIR__ . '/session_auth.php';
start_sdn_session();
require_once __DIR__ . '/auth_throttle.php';
require_once __DIR__ . '/worker_account_store.php';
require_once __DIR__ . '/audit_log.php';
require_once __DIR__ . '/security_guard.php';
header('Cache-Control: no-store, no-cache');
header('Content-Type: application/json');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    http_response_code(405);
    echo json_encode([
        "success" => false,
        "message" => "POST required."
    ]);
    exit;
}

$raw_input = file_get_contents('php://input');
if (!is_string($raw_input) || strlen($raw_input) > 4096) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid login request."
    ]);
    exit;
}

$request = json_decode($raw_input, true);
if (!is_array($request) || !isset($request['password']) || !is_string($request['password'])) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid login request."
    ]);
    exit;
}

$workerId = $request['worker_id'] ?? '';
if (!is_string($workerId) || strlen($workerId) > 32) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid login request."
    ]);
    exit;
}

$input_password = trim($request['password']);
$workerId = trim($workerId);
if ($input_password === '' || strlen($input_password) > 1024 || ($workerId !== '' && !preg_match('/^[A-Za-z0-9_-]{3,32}$/', $workerId))) {
    http_response_code(400);
    echo json_encode([
        "success" => false,
        "message" => "Invalid login request."
    ]);
    exit;
}

// Stored bcrypt hashes for the authorized access codes.
$hash_dispatcher = '$2y$12$lkh2lKo4kg0FusJv1L9ubusK7gVnR96/uvqEr16dJ1bU7q.9hTZ.m';
$hash_director = getenv('DIRECTOR_PASSWORD_HASH') ?: '$2y$12$My7D/nk4is/vkT7gBzR3r.b2pHWo05tEsIs3sWiiFDiroW6vNsVfu';
$dispatcherWorkerId = '123123';
$clientAddress = is_string($_SERVER['REMOTE_ADDR'] ?? null) ? $_SERVER['REMOTE_ADDR'] : 'unknown';
$ipAttemptKey = hash('sha256', $clientAddress);
$accountAttemptKey = hash('sha256', $clientAddress . "\0" . $workerId);

try {
    $ipRetryAfter = 0;
    $accountRetryAfter = 0;
    $ipAttemptsAllowed = auth_throttle_update($ipAttemptKey, false, $ipRetryAfter);
    $accountAttemptsAllowed = auth_throttle_update($accountAttemptKey, false, $accountRetryAfter);
    if (!$ipAttemptsAllowed || !$accountAttemptsAllowed) {
        $retryAfter = max(1, $ipRetryAfter, $accountRetryAfter);
        write_audit_event('login', $workerId ?: 'unknown', 'rate_limited', $clientAddress);
        http_response_code(429);
        header('Retry-After: ' . $retryAfter);
        echo json_encode(["success" => false, "message" => "TOO MANY FAILED ATTEMPTS."]);
        exit;
    }
} catch (RuntimeException $error) {
    error_log('Login throttle unavailable: ' . $error->getMessage());
    http_response_code(503);
    echo json_encode(["success" => false, "message" => "LOGIN SERVICE TEMPORARILY UNAVAILABLE."]);
    exit;
}

$token = bin2hex(random_bytes(16));
$workerAccount = null;
if ($workerId !== '' && $workerId !== $dispatcherWorkerId) {
    try {
        $workerAccount = verify_worker_account($workerId, $input_password);
    } catch (RuntimeException $error) {
        error_log('Worker account authentication unavailable: ' . $error->getMessage());
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "LOGIN SERVICE TEMPORARILY UNAVAILABLE."]);
        exit;
    }
}

// Securely hash the incoming attempt and compare it to the stored hashes
if (($workerId === $dispatcherWorkerId && password_verify($input_password, $hash_dispatcher)) || $workerAccount !== null) {
    try {
        auth_throttle_update($ipAttemptKey, null);
        auth_throttle_update($accountAttemptKey, null);
    } catch (RuntimeException $error) {
        error_log('Could not clear login throttle after successful authentication: ' . $error->getMessage());
    }
    session_regenerate_id(true);
    $_SESSION['role'] = 'admin';
    $_SESSION['worker_id'] = $workerId;
    $_SESSION['worker_name'] = $workerAccount['name'] ?? 'Dispatcher';
    write_audit_event('login', $workerId, 'success', $clientAddress);
    echo json_encode([
        "success" => true,
        "token" => $token,
        "role" => "admin",
        "message" => "CLEARANCE GRANTED: WELCOME DISPATCHER",
        "worker_name" => $_SESSION['worker_name']
    ]);
} elseif (password_verify($input_password, $hash_director)) {
    try {
        auth_throttle_update($ipAttemptKey, null);
        auth_throttle_update($accountAttemptKey, null);
    } catch (RuntimeException $error) {
        error_log('Could not clear login throttle after successful authentication: ' . $error->getMessage());
    }
    session_regenerate_id(true);
    $_SESSION['role'] = 'super_admin';
    write_audit_event('login', 'director', 'success', $clientAddress);
    echo json_encode([
        "success" => true,
        "token" => $token,
        "role" => "super_admin",
        "message" => "CLEARANCE GRANTED: WELCOME DIRECTOR"
    ]);
} else {
    try {
        $ipRetryAfter = 0;
        $accountRetryAfter = 0;
        $ipAttemptsAllowed = auth_throttle_update($ipAttemptKey, true, $ipRetryAfter);
        $accountAttemptsAllowed = auth_throttle_update($accountAttemptKey, true, $accountRetryAfter);
        write_audit_event('login', $workerId ?: 'unknown', 'failure', $clientAddress);
        if (!$ipAttemptsAllowed || !$accountAttemptsAllowed) {
            $retryAfter = max(1, $ipRetryAfter, $accountRetryAfter);
            http_response_code(429);
            header('Retry-After: ' . $retryAfter);
            echo json_encode(["success" => false, "message" => "TOO MANY FAILED ATTEMPTS."]);
            exit;
        }
    } catch (RuntimeException $error) {
        error_log('Could not record failed login attempt: ' . $error->getMessage());
        http_response_code(503);
        echo json_encode(["success" => false, "message" => "LOGIN SERVICE TEMPORARILY UNAVAILABLE."]);
        exit;
    }
    echo json_encode([
        "success" => false,
        "message" => "ACCESS DENIED: INVALID SECURITY CLEARANCE"
    ]);
}
?>