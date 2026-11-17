<?php
// preflight-514cff — خواندن وضعیت هاست پیش از چرخش؛ همهٔ مقادیر محرمانه ماسک می‌شوند.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(60);
function maskLine($l) {
  $l = preg_replace('/^(DATABASE_URL|APP_ENCRYPTION_KEY|CRON_SECRET|PAYAMAK_PANEL_API_KEY|PAYAMAK_PANEL_USERNAME|SMTP[A-Z_]*)=.*$/i', '$1=***MASKED***', $l);
  $l = preg_replace('/(Bearer\s+|key=|KEY=|SECRET=|PASSWORD=|pass=)[A-Za-z0-9_\-]{10,}/i', '$1***', $l);
  $l = preg_replace('/[A-Za-z0-9_\-]{40,}/', '***', $l);
  return $l;
}

echo "== zip status ==\n";
$zip = '/home/epqoisdl/noor-slim-2122.zip';
echo is_file($zip) ? ("size: " . filesize($zip) . "\n") : "MISSING\n";
foreach (glob('/home/epqoisdl/noor-slim-*.zip*') ?: [] as $f) echo "  related: ", basename($f), " ", filesize($f), "\n";

echo "== app version ==\n";
$pkg = @file_get_contents('/home/epqoisdl/noor-system/package.json');
echo preg_match('/"version":\s*"([^"]+)"/', (string)$pkg, $mm) ? $mm[1] : '?', "\n";
echo "build_id: ", @file_get_contents('/home/epqoisdl/noor-system/.next/standalone/.next/BUILD_ID') ?: '?', "\n";

echo "== .env keys ==\n";
foreach (preg_split('/\r?\n/', (string)@file_get_contents('/home/epqoisdl/noor-system/.env')) as $l)
  if (trim($l) !== '' && strpos($l, '=') !== false) echo "  ", maskLine($l), "\n";

echo "== crontab spool ==\n";
foreach (['/var/spool/cron/epqoisdl', '/var/spool/cron/crontabs/epqoisdl', '/var/cron/tabs/epqoisdl'] as $p) {
  if (is_readable($p)) {
    echo "  readable at: $p\n";
    foreach (preg_split('/\r?\n/', (string)file_get_contents($p)) as $l) if (trim($l) !== '') echo "  | ", maskLine($l), "\n";
    echo "  writable: ", is_writable($p) ? "YES" : "NO", "\n";
    break;
  }
}
if (!isset($p)) echo "  (none of the spool paths readable)\n";

echo "== public_html/.htaccess (SetEnv masked) ==\n";
$ht = (string)@file_get_contents('/home/epqoisdl/public_html/.htaccess');
if ($ht !== '') foreach (preg_split('/\r?\n/', $ht) as $l) echo "  | ", maskLine($l), "\n"; else echo "  (unreadable or empty)\n";

echo "== .cpanel/datastore scan (env hunt) ==\n";
foreach ((glob('/home/epqoisdl/.cpanel/datastore/*') ?: []) as $f) {
  $c = (string)@file_get_contents($f);
  $hit = preg_grep('/DATABASE_URL|CRON_SECRET|APP_ENCRYPTION|PAYAMAK/', [$c]) && preg_match('/DATABASE_URL|CRON_SECRET|APP_ENCRYPTION|PAYAMAK/', $c);
  echo "  ", basename($f), " size=", strlen($c), $hit ? "  <== CONTAINS ENV KEYS" : "", "\n";
  if ($hit) foreach (preg_split('/\r?\n/', $c) as $l) if (preg_match('/DATABASE_URL|CRON_SECRET|APP_ENCRYPTION|PAYAMAK/', $l)) echo "    > ", maskLine(substr($l, 0, 120)), "\n";
}

echo "== passenger/homedir env candidates ==\n";
foreach (['/home/epqoisdl/.env', '/home/epqoisdl/noor-system/.htaccess'] as $f)
  echo "  $f : ", is_file($f) ? "EXISTS" : "no", "\n";

echo "== home-root leftovers ==\n";
foreach ((glob('/home/epqoisdl/*') ?: []) as $f) {
  $b = basename($f);
  if (preg_match('/^(diag|cleanup|deploy|cron|crontab|cp-test|embed-env|noor-slim|install|host|update)/', $b) || $b === 'noor-system')
    echo "  ", is_dir($f) ? "d" : "f", " ", $b, " ", is_dir($f) ? '' : filesize($f), "\n";
}
foreach ((glob('/home/epqoisdl/.env.backup-*') ?: []) as $f) echo "  f ", basename($f), " ", filesize($f), "\n";

echo "== diag-temp real files ==\n";
foreach ((glob('/home/epqoisdl/noor-system/scripts/diag-temp/*') ?: []) as $f) echo "  ", basename($f), " ", filesize($f), "\n";

echo "== preflight done ==\n";
