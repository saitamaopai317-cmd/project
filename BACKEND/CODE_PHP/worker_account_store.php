<?php
function update_worker_accounts(callable $callback) {
    $path = __DIR__ . '/../QUERY/worker_accounts.json';
    $file = fopen($path, 'c+');
    if ($file === false) {
        throw new RuntimeException('Could not open worker account storage.');
    }
    if (!flock($file, LOCK_EX)) {
        fclose($file);
        throw new RuntimeException('Could not lock worker account storage.');
    }

    $raw = stream_get_contents($file);
    $accounts = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($accounts)) {
        flock($file, LOCK_UN);
        fclose($file);
        throw new RuntimeException('Worker account storage contains invalid data.');
    }

    $result = $callback($accounts);
    $encoded = json_encode($accounts, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) {
        flock($file, LOCK_UN);
        fclose($file);
        throw new RuntimeException('Could not encode worker account storage.');
    }
    ftruncate($file, 0);
    rewind($file);
    $written = fwrite($file, $encoded);
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);

    if ($written !== strlen($encoded)) {
        throw new RuntimeException('Could not write worker account storage.');
    }
    return $result;
}

function verify_worker_account($workerId, $password) {
    return update_worker_accounts(static function (&$accounts) use ($workerId, $password) {
        $account = $accounts[$workerId] ?? null;
        if (!is_array($account) || !isset($account['password_hash']) ||
            !is_string($account['password_hash']) || !password_verify($password, $account['password_hash'])) {
            return null;
        }
        return [
            'worker_id' => $workerId,
            'name' => (string) ($account['name'] ?? $workerId)
        ];
    });
}
?>
