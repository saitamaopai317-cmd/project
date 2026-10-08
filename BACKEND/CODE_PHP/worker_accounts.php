<?php
require_once __DIR__ . '/session_auth.php';
require_once __DIR__ . '/worker_account_store.php';
require_once __DIR__ . '/audit_log.php';
header('Content-Type: application/json');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

if (!is_director_authenticated()) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Director clearance required.']);
    exit;
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? '');
if (!in_array($method, ['GET', 'POST'], true)) {
    header('Allow: GET, POST');
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'GET or POST required.']);
    exit;
}

$request = [];
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $decoded = is_string($raw) && strlen($raw) <= 4096 ? json_decode($raw, true) : null;
    if (!is_array($decoded)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Invalid worker account request.']);
        exit;
    }
    $request = $decoded;
}

try {
    if ($method === 'GET' || ($request['action'] ?? '') === 'list') {
        $accounts = update_worker_accounts(static function (&$accounts) {
            return array_map(static function ($id, $account) {
                return [
                    'worker_id' => (string) $id,
                    'name' => (string) ($account['name'] ?? $id)
                ];
            }, array_keys($accounts), array_values($accounts));
        });
        array_unshift($accounts, ['worker_id' => '123123', 'name' => 'Legacy Dispatcher', 'legacy' => true]);
        echo json_encode(['success' => true, 'accounts' => $accounts]);
        exit;
    }

    $action = $request['action'] ?? '';
    $workerId = $request['worker_id'] ?? '';
    if (!is_string($workerId) || !preg_match('/^[A-Za-z0-9_-]{3,32}$/', $workerId) || $workerId === '123123') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Use a unique worker ID with 3-32 letters, numbers, underscores, or hyphens.']);
        exit;
    }

    if ($action === 'create') {
        $name = $request['name'] ?? '';
        $password = $request['password'] ?? '';
        $trimmedName = is_string($name) ? trim($name) : '';
        $nameLength = is_string($name) ? preg_match_all('/./us', $trimmedName) : false;
        if ($nameLength === false || $nameLength < 4 || $nameLength > 80) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Display name must be 4 to 80 characters.']);
            exit;
        }
        if (!is_string($password) || strlen($password) < 12 || strlen($password) > 1024) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Password must be 12 to 1024 characters.']);
            exit;
        }

        $created = update_worker_accounts(static function (&$accounts) use ($workerId, $trimmedName, $password) {
            if (isset($accounts[$workerId])) return false;
            $accounts[$workerId] = [
                'name' => $trimmedName,
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'created_at' => gmdate('c')
            ];
            return true;
        });
        if (!$created) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => 'That worker ID already exists.']);
            exit;
        }
        write_audit_event('worker_account_created', (string) $_SESSION['role'], 'success', $workerId);
        echo json_encode(['success' => true]);
        exit;
    }

    if ($action === 'delete') {
        $deleted = update_worker_accounts(static function (&$accounts) use ($workerId) {
            if (!isset($accounts[$workerId])) return false;
            unset($accounts[$workerId]);
            return true;
        });
        if (!$deleted) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Worker account not found.']);
            exit;
        }
        write_audit_event('worker_account_deleted', (string) $_SESSION['role'], 'success', $workerId);
        echo json_encode(['success' => true]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Unknown worker account action.']);
} catch (RuntimeException $error) {
    error_log('Worker account operation failed: ' . $error->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Worker account storage is unavailable.']);
}
?>
