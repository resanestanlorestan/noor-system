<?php
// orch-514cff — هماهنگ‌کنندهٔ تک‌فایلی استقرار/چرخش/کرون/پاک‌سازی/راستی‌آزمایی.
// ?step=status|deploy|rotate|cron|cleanup|verify
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(600);
$STEP = $_GET['step'] ?? 'status';
$target  = '/home/epqoisdl';
$zipFile = $target . '/noor-slim-2122.zip';
$SHA     = 'eeb5be5daf7f07a796fd8ea7e93fef8e2a13392ceb6cb4d11dfd5b94cfef3911';
$envPath = $target . '/noor-system/.env';
$htPath  = $target . '/public_html/.htaccess';
function maskLine($l) {
  $l = preg_replace('/^(DATABASE_URL|APP_ENCRYPTION_KEY|CRON_SECRET|PAYAMAK_PANEL_API_KEY|PAYAMAK_PANEL_USERNAME)=.*$/i', '$1=***MASKED***', $l);
  return preg_replace('/[A-Za-z0-9_\-]{40,}/', '***', $l);
}

if ($STEP === 'status') {
  echo "full zip: ", is_file($zipFile) ? ("present " . filesize($zipFile)) : "MISSING", "\n";
  echo "b64 parts: ", count(glob($target . '/noor-2122-b64.*') ?: []), "/26\n";
  echo "stale parts: ", count(glob($target . '/noor-slim-2122.zip.*.part') ?: []), "\n";
  $pkg = (string)@file_get_contents($target . '/noor-system/package.json');
  echo "version: ", preg_match('/"version":\s*"([^"]+)"/', $pkg, $m) ? $m[1] : '?', "\n";
  echo "build_id: ", @file_get_contents($target . '/noor-system/.next/standalone/.next/BUILD_ID') ?: '?', "\n";
  echo "marker: ", is_file($target . '/.v2180-real-done') ? "2180-done" : "none", "\n";
  echo "rotation: ", is_file($target . '/.v2180-rotation-done') ? "done" : "none", "\n";
  echo "== status ==\n"; exit;
}

if ($STEP === 'deploy') {
  $fullOk = is_file($zipFile) && hash_file('sha256', $zipFile) === $SHA;
  echo "full zip: ", $fullOk ? "VALID" : (is_file($zipFile) ? "INVALID(" . filesize($zipFile) . ")" : "MISSING"), "\n";
  if (!$fullOk) {
    $parts = glob($target . '/noor-2122-b64.*');
    natsort($parts);
    echo "b64 parts found: ", count($parts), " (need 26)\n";
    if (count($parts) < 26) { echo "INSUFFICIENT_PARTS\n"; exit(1); }
    $out = @fopen($zipFile, 'wb');
    if (!$out) { echo "ZIP_WRITE_FAILED\n"; exit(1); }
    foreach ($parts as $p) {
      $raw = base64_decode((string)file_get_contents($p), true);
      if ($raw === false || $raw === '') { echo "PART_DECODE_FAILED: ", basename($p), "\n"; fclose($out); exit(1); }
      fwrite($out, $raw);
    }
    fclose($out);
    clearstatcache();
    echo "assembled: ", filesize($zipFile), " bytes\n";
    if (hash_file('sha256', $zipFile) !== $SHA) { echo "SHA_MISMATCH\n"; exit(1); }
    echo "sha256 OK\n";
    foreach ($parts as $p) @unlink($p);
    echo "b64 parts removed\n";
  }
  foreach (glob($target . '/noor-slim-2122.zip.*.part') ?: [] as $old) { @unlink($old); echo "stale removed: ", basename($old), "\n"; }
  if (!class_exists('ZipArchive')) { echo "NO_ZIPARCHIVE\n"; exit(1); }
  $zip = new ZipArchive();
  if ($zip->open($zipFile) !== true) { echo "ZIP_OPEN_FAILED\n"; exit(1); }
  echo "entries: ", $zip->numFiles, "\n";
  if (!$zip->extractTo($target)) { echo "EXTRACT_FAILED\n"; exit(1); }
  $zip->close();
  echo "extracted OK\n";
  if (!is_dir($target . '/noor-system/tmp')) @mkdir($target . '/noor-system/tmp', 0755, true);
  @touch($target . '/noor-system/tmp/restart.txt');
  @touch($target . '/.v2180-real-done');
  echo "restart + marker .v2180-real-done\n";
  $pkg = (string)@file_get_contents($target . '/noor-system/package.json');
  echo "version: ", preg_match('/"version":\s*"([^"]+)"/', $pkg, $m) ? $m[1] : '?', "\n";
  echo "build_id: ", @file_get_contents($target . '/noor-system/.next/standalone/.next/BUILD_ID') ?: '?', "\n";
  echo "env intact: ", is_file($envPath) ? "YES" : "NO!!", "\n";
  echo "== deploy done ==\n"; exit;
}

if ($STEP === 'rotate') {
  $env = @file_get_contents($envPath);
  if ($env === false) { echo "ENV_READ_FAILED\n"; exit(1); }
  if (!@copy($envPath, $target . '/.env.backup-2180')) echo "BACKUP_FAILED\n"; else echo "backup: .env.backup-2180 OK\n";
  preg_match('/^DATABASE_URL=(.*)$/m', $env, $m);
  if (!$m) { echo "NO_DATABASE_URL\n"; exit(1); }
  $u = parse_url(trim($m[1], " \t\"'"));
  if (!$u || empty($u['user'])) { echo "URL_PARSE_FAILED\n"; exit(1); }
  $dbUser = $u['user']; $dbHost = $u['host']; $dbPort = $u['port'] ?? 5432; $dbName = ltrim($u['path'] ?? '', '/');
  echo "db: name=$dbName user=", substr($dbUser, 0, 9), "***\n";
  $newDbPass = bin2hex(random_bytes(16));
  $newCronSecret = bin2hex(random_bytes(24));
  $conn = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8', $dbHost, $dbPort, $dbName, $dbUser, $u['pass'] ?? ''));
  if (!$conn) { echo "CONNECT_OLD_FAILED\n"; exit(1); }
  $r = @pg_query($conn, sprintf('ALTER USER "%s" WITH PASSWORD \'%s\'', $dbUser, $newDbPass));
  if (!$r) { echo "ALTER_FAILED: ", preg_replace('/password=[^\s]*/', 'password=***', (string)pg_last_error($conn)), "\n"; exit(1); }
  pg_close($conn);
  echo "ALTER USER OK\n";
  $conn2 = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8', $dbHost, $dbPort, $dbName, $dbUser, $newDbPass));
  if (!$conn2) { echo "RECONNECT_FAILED\n"; exit(1); }
  $r2 = @pg_query($conn2, 'SELECT 1');
  echo $r2 ? "RECONNECT_OK\n" : "RECONNECT_QUERY_FAILED\n";
  pg_close($conn2);
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
  echo "env rewritten: DATABASE_URL=new CRON_SECRET=", $hadCron ? "replaced" : "added", "\n";
  $ht = (string)@file_get_contents($htPath);
  if ($ht !== '') {
    $htLines = preg_split('/\r?\n/', $ht);
    $kept = []; $removed = 0;
    foreach ($htLines as $l) {
      if (preg_match('/^\s*SetEnv\s+(APP_ENCRYPTION_KEY|CRON_SECRET|DATABASE_URL)\b/i', $l)) { $removed++; continue; }
      $kept[] = $l;
    }
    if ($removed > 0 && @file_put_contents($htPath, implode("\n", $kept)) !== false) echo "htaccess: $removed SetEnv line(s) removed\n";
    elseif ($removed === 0) echo "htaccess: no SetEnv lines found\n";
    else echo "HTACCESS_WRITE_FAILED\n";
  } else echo "htaccess: UNREADABLE\n";
  @touch($target . '/noor-system/tmp/restart.txt');
  @touch($target . '/.v2180-rotation-done');
  echo "restart touched\n== rotation done ==\n"; exit;
}

if ($STEP === 'cron') {
  $spool = '/var/spool/cron/epqoisdl';
  $cur = @file_get_contents($spool);
  if ($cur === false) { echo "SPOOL_READ_FAILED\n"; exit(1); }
  function bearerLine($schedule, $endpoint) {
    return $schedule . ' curl -fsS -H "Authorization: Bearer $(grep \'^CRON_SECRET=\' /home/epqoisdl/noor-system/.env | cut -d= -f2)" "https://pouyafarhadi.ir/api/cron/' . $endpoint . '" > /dev/null 2>&1';
  }
  $lines = preg_split('/\r?\n/', $cur);
  $out = []; $fixedRem = false; $fixedEve = false;
  foreach ($lines as $l) {
    if (preg_match('/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+).*\/api\/cron\/reminders/', $l, $m)) { $out[] = bearerLine($m[1], 'reminders'); $fixedRem = true; continue; }
    if (preg_match('/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+).*\/api\/cron\/events/', $l, $m)) { $out[] = bearerLine($m[1], 'events'); $fixedEve = true; continue; }
    if (trim($l) !== '') $out[] = $l;
  }
  if (!$fixedRem) $out[] = bearerLine('0 8 * * *', 'reminders');
  if (!$fixedEve) $out[] = bearerLine('0 * * * *', 'events');
  if (@file_put_contents($spool, implode("\n", $out) . "\n") === false) { echo "SPOOL_WRITE_FAILED\n"; exit(1); }
  echo "cron lines: reminders=", $fixedRem ? 'replaced' : 'added', " events=", $fixedEve ? 'replaced' : 'added', "\n";
  foreach (preg_split('/\r?\n/', (string)file_get_contents($spool)) as $l)
    if (trim($l) !== '') echo "  | ", maskLine($l), "\n";
  echo "== cron done ==\n"; exit;
}

if ($STEP === 'cleanup') {
  function rm($f) { $ok = @unlink($f); echo $ok ? "removed: $f\n" : "MISSING/FAIL: $f\n"; return $ok; }
  echo "== public_html ==\n";
  foreach (['cleanup-9f3c1a.php','dbx-9f3c1a.php','deploy-9f3c1a.php','purge-9f3c1a.php','verify-9f3c1a.php','probe-p8k2.php','preflight-514cff.php','deploy-514cff.php','rotate-514cff.php','cron-514cff.php','upload-514cff.php','orch-514cff.php'] as $f)
    rm($target . '/public_html/' . $f);
  echo "== diag-temp ==\n";
  foreach ((glob($target . '/noor-system/scripts/diag-temp/*') ?: []) as $f) rm($f);
  @rmdir($target . '/noor-system/scripts/diag-temp');
  echo is_dir($target . '/noor-system/scripts/diag-temp') ? "diag-temp still exists\n" : "diag-temp dir removed\n";
  echo "== home leftovers ==\n";
  foreach (['cleanup-291.sh','cleanup-291.log','diag-291.sh','diag-291.log','diag2-291.sh','diag2-291.log','diag3-291.sh','diag3-291.log','diag4-291.sh','diag4-291.log','diag-sms.sh','diag-sms.log','diag.log','diag2.log','diag2.js','deploy-2120.sh','deploy-218.sh','deploy.log','deploy-otp.log','cron-setup.log','crontab.tmp','cp-test.txt','embed-env-snippet.js','host-cron.sh','host-diag.sh','host-embed.sh','host-install.sh','host-procscan.sh','host-recon.sh','host-restart-290.sh','host-slim-install.sh','install.log'] as $f)
    rm($target . '/' . $f);
  foreach ((glob($target . '/host-update-*.sh') ?: []) as $f) rm($f);
  foreach ((glob($target . '/update-*.sh') ?: []) as $f) rm($f);
  foreach ((glob($target . '/update-*.log') ?: []) as $f) rm($f);
  echo "== old bundles/parts ==\n";
  foreach (['noor-slim-2105.zip','noor-slim-2106.zip','noor-slim-2121.zip'] as $f) rm($target . '/' . $f);
  foreach ((glob($target . '/noor-slim-2122.zip.*.part') ?: []) as $f) rm($f);
  echo "== old env backups ==\n";
  foreach ((glob($target . '/.env.backup-*') ?: []) as $f)
    if (basename($f) !== '.env.backup-2180') rm($f);
  echo is_file($target . '/.env.backup-2180') ? "kept: .env.backup-2180\n" : "NOTE: backup-2180 absent\n";
  echo "== old markers ==\n";
  foreach ((glob($target . '/.v*-real-done') ?: []) as $f)
    if (basename($f) !== '.v2180-real-done') rm($f);
  foreach ((glob($target . '/.v*-update-done') ?: []) as $f) rm($f);
  foreach ((glob($target . '/.v*-restart-done') ?: []) as $f) rm($f);
  rm($target . '/.v2180-rotation-done');
  echo "== cleanup done ==\n"; exit;
}

if ($STEP === 'verify') {
  $base = 'https://pouyafarhadi.ir';
  echo "== 1) version/build ==\n";
  $pkg = (string)@file_get_contents($envPath ? ($target . '/noor-system/package.json') : '');
  echo "version: ", preg_match('/"version":\s*"([^"]+)"/', $pkg, $m) ? $m[1] : '?', "\n";
  echo "build_id: ", @file_get_contents($target . '/noor-system/.next/standalone/.next/BUILD_ID') ?: '?', " (target: 0FmrP-vKYs2mo2J5SaOgH)\n";
  echo "== 2) health/login ==\n";
  $ctx = stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
  $h = @file_get_contents($base . '/api/health', false, $ctx);
  echo "health: ", $h !== false ? trim($h) : "FAILED", "\n";
  $login = @file_get_contents($base . '/login', false, $ctx);
  echo "login: ", $login !== false ? "OK(" . strlen($login) . ")" : "FAILED", "\n";
  echo "== 3) HSTS ==\n";
  $headers = @get_headers($base . '/login', false, stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true]])) ?: [];
  $hsts = '(not found)';
  foreach ($headers as $hd) if (stripos($hd, 'strict-transport-security') !== false) $hsts = trim($hd);
  echo $hsts, "\n";
  echo "== 4) cron Bearer (P1) ==\n";
  $env = (string)@file_get_contents($envPath);
  preg_match('/^CRON_SECRET=(.*)$/m', $env, $sm);
  $cronSecret = isset($sm[1]) ? trim($sm[1]) : '';
  $bctx = stream_context_create(['http' => ['timeout' => 60, 'ignore_errors' => true, 'header' => "Authorization: Bearer $cronSecret\r\n"], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
  $cronResp = @file_get_contents($base . '/api/cron/reminders', false, $bctx);
  echo "Bearer: ", $cronResp !== false ? substr((string)$cronResp, 0, 200) : "FAILED", "\n";
  echo "== 5) ?key= rejected ==\n";
  $kctx = stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true, 'header' => "Authorization: Bearer wrongvalue\r\n"], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
  $kResp = @file_get_contents($base . '/api/cron/reminders?key=anything', false, $kctx);
  echo "key=+wrong: ", $kResp !== false ? substr((string)$kResp, 0, 120) : "(no response)", "\n";
  echo "== 6) crontab ==\n";
  foreach (preg_split('/\r?\n/', (string)@file_get_contents('/var/spool/cron/epqoisdl')) as $l)
    if (trim($l) !== '') echo "  | ", maskLine($l), "\n";
  echo "== 7) env keys ==\n";
  foreach (preg_split('/\r?\n/', $env) as $l)
    if (trim($l) !== '' && strpos($l, '=') !== false) echo "  ", maskLine($l), "\n";
  echo "== 8) SetEnv remaining ==\n";
  $ht = (string)@file_get_contents($htPath);
  echo "count: ", preg_match_all('/^\s*SetEnv\s+(APP_ENCRYPTION_KEY|CRON_SECRET|DATABASE_URL)\b/im', $ht), " (target: 0)\n";
  echo "== 9) absent files ==\n";
  foreach (['cleanup-9f3c1a.php','dbx-9f3c1a.php','deploy-9f3c1a.php','purge-9f3c1a.php','verify-9f3c1a.php','probe-p8k2.php','orch-514cff.php'] as $f)
    echo "  public_html/$f : ", is_file($target . '/public_html/' . $f) ? "STILL THERE!!" : "gone", "\n";
  echo "  diag-temp: ", is_dir($target . '/noor-system/scripts/diag-temp') ? "STILL THERE!!" : "gone", "\n";
  foreach (['noor-slim-2105.zip','noor-slim-2106.zip','noor-slim-2121.zip'] as $f)
    echo "  $f : ", is_file($target . '/' . $f) ? "STILL THERE!!" : "gone", "\n";
  echo "  old env backups: ", count(glob($target . '/.env.backup-*') ?: []) - (is_file($target . '/.env.backup-2180') ? 1 : 0), " (target: 0)\n";
  echo "== verify ==\n"; exit;
}

echo "UNKNOWN_STEP\n";
