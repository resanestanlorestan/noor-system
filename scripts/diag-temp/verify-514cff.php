<?php
// verify-514cff — راستی‌آزمایی نهایی زنده؛ در پایان خودش را حذف می‌کند.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(120);
function maskLine($l) {
  $l = preg_replace('/^(DATABASE_URL|APP_ENCRYPTION_KEY|CRON_SECRET|PAYAMAK_PANEL_API_KEY|PAYAMAK_PANEL_USERNAME)=.*$/i', '$1=***MASKED***', $l);
  return preg_replace('/[A-Za-z0-9_\-]{40,}/', '***', $l);
}
$base = 'https://pouyafarhadi.ir';

echo "== 1) نسخه و بیلد روی هاست ==\n";
$pkg = (string)@file_get_contents('/home/epqoisdl/noor-system/package.json');
echo "version: ", preg_match('/"version":\s*"([^"]+)"/', $pkg, $m) ? $m[1] : '?', "\n";
echo "build_id: ", @file_get_contents('/home/epqoisdl/noor-system/.next/standalone/.next/BUILD_ID') ?: '?', " (مطلوب: 0FmrP-vKYs2mo2J5SaOgH)\n";

echo "== 2) سلامت سرویس ==\n";
$ctx = stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
$h = @file_get_contents($base . '/api/health', false, $ctx);
echo "health: ", $h !== false ? trim($h) : "FAILED", "\n";
$login = @file_get_contents($base . '/login', false, $ctx);
echo "login page: ", $login !== false ? "OK (" . strlen($login) . " bytes)" : "FAILED", "\n";

echo "== 3) هدر HSTS (F4) ==\n";
$headers = @get_headers($base . '/login', false, stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true]])) ?: [];
$hsts = '(not found)';
foreach ($headers as $hd) if (stripos($hd, 'strict-transport-security') !== false) $hsts = $hd;
echo $hsts, "\n";

echo "== 4) گارد کرون (P1): رمز تازه با Bearer پذیرفته می‌شود؟ ==\n";
$env = (string)@file_get_contents('/home/epqoisdl/noor-system/.env');
preg_match('/^CRON_SECRET=(.*)$/m', $env, $sm);
$cronSecret = isset($sm[1]) ? trim($sm[1]) : '';
$bctx = stream_context_create(['http' => ['timeout' => 60, 'ignore_errors' => true, 'header' => "Authorization: Bearer $cronSecret\r\n"], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
$cronResp = @file_get_contents($base . '/api/cron/reminders', false, $bctx);
echo "Bearer call: ", $cronResp !== false ? substr((string)$cronResp, 0, 220) : "FAILED", "\n";

echo "== 5) گارد کرون (P1): ?key= رد می‌شود؟ ==\n";
$kctx = stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true, 'header' => "Authorization: Bearer wrongvalue\r\n"], 'ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
$kResp = @file_get_contents($base . '/api/cron/reminders?key=anything', false, $kctx);
$kCode = $kResp === false ? '(blocked)' : '(200!)';
echo "key= + wrong bearer => ", $kResp !== false ? substr((string)$kResp, 0, 120) : $kCode, "\n";

echo "== 6) crontab فعلی ==\n";
foreach (preg_split('/\r?\n/', (string)@file_get_contents('/var/spool/cron/epqoisdl')) as $l)
  if (trim($l) !== '') echo "  | ", maskLine($l), "\n";

echo "== 7) کلیدهای .env ==\n";
foreach (preg_split('/\r?\n/', $env) as $l)
  if (trim($l) !== '' && strpos($l, '=') !== false) echo "  ", maskLine($l), "\n";

echo "== 8) حذف SetEnv از .htaccess ==\n";
$ht = (string)@file_get_contents('/home/epqoisdl/public_html/.htaccess');
$cnt = preg_match_all('/^\s*SetEnv\s+(APP_ENCRYPTION_KEY|CRON_SECRET|DATABASE_URL)\b/im', $ht);
echo "SetEnv lines remaining: ", $cnt, " (مطلوب: 0)\n";

echo "== 9) فایل‌های حذف‌شده نباید باشند ==\n";
$absent = ['cleanup-9f3c1a.php','dbx-9f3c1a.php','deploy-9f3c1a.php','purge-9f3c1a.php','verify-9f3c1a.php','probe-p8k2.php','preflight-514cff.php','deploy-514cff.php','rotate-514cff.php','cron-514cff.php','upload-514cff.php'];
foreach ($absent as $f) echo "  /home/epqoisdl/public_html/$f : ", is_file('/home/epqoisdl/public_html/' . $f) ? "STILL THERE!!" : "gone", "\n";
echo "  diag-temp dir: ", is_dir('/home/epqoisdl/noor-system/scripts/diag-temp') ? "STILL THERE!!" : "gone", "\n";
foreach (['noor-slim-2105.zip','noor-slim-2106.zip','noor-slim-2121.zip'] as $f)
  echo "  /home/epqoisdl/$f : ", is_file('/home/epqoisdl/' . $f) ? "STILL THERE!!" : "gone", "\n";
echo "  old env backups: ", count(glob('/home/epqoisdl/.env.backup-*') ?: []) - (is_file('/home/epqoisdl/.env.backup-2180') ? 1 : 0), " (مطلوب: 0)\n";

echo "== 10) مارکر نسخه ==\n";
echo is_file('/home/epqoisdl/.v2180-real-done') ? ".v2180-real-done: OK\n" : ".v2180-real-done: MISSING\n";

// خودزدایی در پایان
@unlink(__FILE__);
echo "== verify done (این فایل حذف شد) ==\n";
