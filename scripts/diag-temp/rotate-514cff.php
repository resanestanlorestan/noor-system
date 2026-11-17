<?php
// rotate-514cff v2 — چرخش رمز پایگاه‌داده و CRON_SECRET + حذف SetEnv از .htaccess Passenger.
// هیچ رمزی در خروجی چاپ نمی‌شود؛ فقط وضعیت و طول‌ها.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(120);
$envPath = '/home/epqoisdl/noor-system/.env';
$htPath  = '/home/epqoisdl/public_html/.htaccess';
$env = @file_get_contents($envPath);
if ($env === false) { echo "ENV_READ_FAILED\n"; exit(1); }

// 1) بکاپ پیش از چرخش
if (!@copy($envPath, '/home/epqoisdl/.env.backup-2180')) echo "BACKUP_FAILED\n"; else echo "backup: .env.backup-2180 OK\n";

preg_match('/^DATABASE_URL=(.*)$/m', $env, $m);
if (!$m) { echo "NO_DATABASE_URL\n"; exit(1); }
$u = parse_url(trim($m[1], " \t\"'"));
if (!$u || empty($u['user'])) { echo "URL_PARSE_FAILED\n"; exit(1); }
$dbUser = $u['user'];
$dbHost = $u['host'];
$dbPort = $u['port'] ?? 5432;
$dbName = ltrim($u['path'] ?? '', '/');
echo "db: name=$dbName user=" . substr($dbUser, 0, 9) . "***\n";

// 2) رمزهای تازه (فقط نویسه‌های شانزده‌دهی — بی‌نیاز از گریز)
$newDbPass = bin2hex(random_bytes(16));
$newCronSecret = bin2hex(random_bytes(24));

// 3) تغییر رمز کاربر پایگاه‌داده
$conn = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8',
  $dbHost, $dbPort, $dbName, $dbUser, $u['pass'] ?? ''));
if (!$conn) { echo "CONNECT_OLD_FAILED\n"; exit(1); }
$r = @pg_query($conn, sprintf('ALTER USER "%s" WITH PASSWORD \'%s\'', $dbUser, $newDbPass));
if (!$r) { echo "ALTER_FAILED: ", preg_replace('/password=[^\s]*/', 'password=***', (string)pg_last_error($conn)), "\n"; exit(1); }
pg_close($conn);
echo "ALTER USER OK\n";

// 4) راستی‌آزمایی اتصال با رمز تازه
$conn2 = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8',
  $dbHost, $dbPort, $dbName, $dbUser, $newDbPass));
if (!$conn2) { echo "RECONNECT_FAILED — رمز عوض شد؛ اگر .env بازنویسی نشود باید از بکاپ بازگردانی کرد\n"; exit(1); }
$r2 = @pg_query($conn2, 'SELECT 1');
echo $r2 ? "RECONNECT_OK\n" : "RECONNECT_QUERY_FAILED\n";
pg_close($conn2);

// 5) بازنویسی .env: DATABASE_URL با رمز تازه + CRON_SECRET تازه
$scheme = $u['scheme'] ?? 'postgres';
$newUrl = sprintf('%s://%s:%s@%s:%d/%s', $scheme, $dbUser, $newDbPass, $dbHost, $dbPort, $dbName);
if (!empty($u['query'])) $newUrl .= '?' . $u['query'];
$lines = preg_split('/\r?\n/', $env);
$out = []; $hadUrl = false; $hadCron = false;
foreach ($lines as $line) {
  if (preg_match('/^DATABASE_URL=/i', $line)) { $out[] = "DATABASE_URL=$newUrl"; $hadUrl = true; continue; }
  if (preg_match('/^CRON_SECRET=/i', $line)) { $out[] = "CRON_SECRET=$newCronSecret"; $hadCron = true; continue; }
  $out[] = $line;
}
if (!$hadUrl) $out[] = "DATABASE_URL=$newUrl";
if (!$hadCron) $out[] = "CRON_SECRET=$newCronSecret";
if (!@file_put_contents($envPath, implode("\n", $out))) { echo "ENV_WRITE_FAILED\n"; exit(1); }
@chmod($envPath, 0600);
echo "env rewritten: DATABASE_URL=new CRON_SECRET=", $hadCron ? "replaced" : "added", " url_len=", strlen($newUrl), "\n";

// 6) حذف خطوط SetEnv از .htaccess (ثبت env سرویس Passenger/LiteSpeed که رمزها را سایه می‌انداختند)
$ht = (string)@file_get_contents($htPath);
if ($ht !== '') {
  $htLines = preg_split('/\r?\n/', $ht);
  $kept = []; $removed = 0;
  foreach ($htLines as $l) {
    if (preg_match('/^\s*SetEnv\s+(APP_ENCRYPTION_KEY|CRON_SECRET|DATABASE_URL)\b/i', $l)) { $removed++; continue; }
    $kept[] = $l;
  }
  if ($removed > 0 && @file_put_contents($htPath, implode("\n", $kept)) !== false) {
    echo "htaccess: $removed SetEnv line(s) removed\n";
  } elseif ($removed === 0) {
    echo "htaccess: no SetEnv lines found\n";
  } else {
    echo "HTACCESS_WRITE_FAILED\n";
  }
} else {
  echo "htaccess: UNREADABLE (باید دستی بررسی شود)\n";
}

// 7) ری‌استارت Passenger و مارکر نسخه
@touch('/home/epqoisdl/noor-system/tmp/restart.txt');
@touch('/home/epqoisdl/.v2180-rotation-done');
echo "restart touched\n";
echo "== rotation done ==\n";
