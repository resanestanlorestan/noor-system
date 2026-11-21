<?php
// استاب مایگریشن ۲.۱۸.۷ — اجرای idempotent مایگریشن 0027 (ستون last_seen_at +
// ایندکس) روی دیتابیس پروداکشن با PDO، پیش از ری‌استارت کد تازه؛ سپس خودحذف.
// گیت توکن (k=) دارد و هیچ مقدار اتصالی را در پاسخ نمایش نمی‌دهد.
header('Content-Type: application/json');
set_time_limit(90);
$K = '__TOKEN__';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); echo '{"error":"bad token"}'; exit; }
$o = ['ok' => false];
try {
    $envFile = '/home/epqoisdl/noor-system/.env';
    if (!is_file($envFile)) throw new Exception('.env missing');
    $env = file_get_contents($envFile);
    if (!preg_match('/^DATABASE_URL=(.*)$/m', $env, $m)) throw new Exception('DATABASE_URL missing');
    $url = trim($m[1]);
    if (!preg_match('/^postgres(ql)?:\/\//i', $url)) throw new Exception('not a postgres url');
    $u = parse_url($url);
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'));
    $pdo = new PDO($dsn, urldecode($u['user'] ?? ''), urldecode($u['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10]);
    $pdo->exec("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now()");
    $pdo->exec("CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON user_sessions (last_seen_at)");
    $cols = $pdo->query("select count(*) from information_schema.columns where table_name='user_sessions' and column_name='last_seen_at'")->fetchColumn();
    $idx = $pdo->query("select count(*) from pg_indexes where tablename='user_sessions' and indexname='sessions_last_seen_idx'")->fetchColumn();
    $filled = $pdo->query("select count(*) from user_sessions where last_seen_at is not null")->fetchColumn();
    $o['ok'] = ((int)$cols === 1 && (int)$idx === 1);
    $o['sessions_with_last_seen'] = (int)$filled;
} catch (Throwable $e) {
    $o['error'] = $e->getMessage();
}
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
