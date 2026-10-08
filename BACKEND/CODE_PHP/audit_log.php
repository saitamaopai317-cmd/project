<?php
function write_audit_event($action, $actor, $result, $details = '') {
    $entry = [
        'timestamp' => gmdate('c'),
        'action' => substr((string) $action, 0, 80),
        'actor' => substr((string) $actor, 0, 80),
        'result' => substr((string) $result, 0, 40),
        'details' => substr((string) $details, 0, 240)
    ];
    $line = json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $path = __DIR__ . '/../QUERY/audit.log';
    if (!is_string($line) || file_put_contents($path, $line . PHP_EOL, FILE_APPEND | LOCK_EX) === false) {
        error_log('Could not persist an audit event: ' . $entry['action']);
        return false;
    }
    return true;
}
?>
