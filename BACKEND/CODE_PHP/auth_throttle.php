<?php
function auth_throttle_update($key, $failed) {
    $path = __DIR__ . '/../QUERY/login_attempts.json';
    $file = fopen($path, 'c+');
    if ($file === false) {
        throw new RuntimeException('Could not open login throttle storage.');
    }

    if (!flock($file, LOCK_EX)) {
        fclose($file);
        throw new RuntimeException('Could not lock login throttle storage.');
    }

    $raw = stream_get_contents($file);
    $attempts = $raw === '' ? [] : json_decode($raw, true);
    if (!is_array($attempts)) {
        flock($file, LOCK_UN);
        fclose($file);
        throw new RuntimeException('Login throttle storage contains invalid data.');
    }

    $now = time();
    foreach ($attempts as $entryKey => $times) {
        if (!is_array($times)) {
            unset($attempts[$entryKey]);
            continue;
        }
        $times = array_values(array_filter($times, static function ($timestamp) use ($now) {
            return is_int($timestamp) && $timestamp > $now - 600;
        }));
        if ($times === []) {
            unset($attempts[$entryKey]);
        } else {
            $attempts[$entryKey] = $times;
        }
    }

    $keyAttempts = $attempts[$key] ?? [];
    if ($failed === null) {
        unset($attempts[$key]);
        $keyAttempts = [];
    } elseif ($failed) {
        $keyAttempts[] = $now;
        $attempts[$key] = $keyAttempts;
    }
    $allowed = count($keyAttempts) < 5;

    $encoded = json_encode($attempts, JSON_UNESCAPED_SLASHES);
    if (!is_string($encoded)) {
        flock($file, LOCK_UN);
        fclose($file);
        throw new RuntimeException('Could not encode login throttle storage.');
    }
    ftruncate($file, 0);
    rewind($file);
    $written = fwrite($file, $encoded);
    fflush($file);
    flock($file, LOCK_UN);
    fclose($file);

    if ($written !== strlen($encoded)) {
        throw new RuntimeException('Could not write login throttle storage.');
    }
    return $allowed;
}
?>
