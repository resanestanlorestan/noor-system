<?php
// cron-514cff — بازنویسی خطوط کرون reminders/events با هدر Bearer که رمز را هنگام اجرا از .env می‌خواند.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(60);
$spool = '/var/spool/cron/epqoisdl';
$cur = @file_get_contents($spool);
if ($cur === false) { echo "SPOOL_READ_FAILED\n"; exit(1); }

function bearerLine($schedule, $endpoint) {
  return $schedule . ' curl -fsS -H "Authorization: Bearer $(grep \'^CRON_SECRET=\' /home/epqoisdl/noor-system/.env | cut -d= -f2)" "https://pouyafarhadi.ir/api/cron/' . $endpoint . '" > /dev/null 2>&1';
}

$lines = preg_split('/\r?\n/', $cur);
$out = [];
$fixedRem = false; $fixedEve = false;
foreach ($lines as $l) {
  if (preg_match('/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+).*\/api\/cron\/reminders/', $l, $m)) {
    $out[] = bearerLine($m[1], 'reminders'); $fixedRem = true; continue;
  }
  if (preg_match('/^(\S+\s+\S+\s+\S+\s+\S+\s+\S+).*\/api\/cron\/events/', $l, $m)) {
    $out[] = bearerLine($m[1], 'events'); $fixedEve = true; continue;
  }
  if (trim($l) !== '') $out[] = $l;
}
if (!$fixedRem) $out[] = bearerLine('0 8 * * *', 'reminders');
if (!$fixedEve) $out[] = bearerLine('0 * * * *', 'events');

$new = implode("\n", $out) . "\n";
if (@file_put_contents($spool, $new) === false) { echo "SPOOL_WRITE_FAILED\n"; exit(1); }
echo "cron lines rewritten: reminders=", $fixedRem ? 'replaced' : 'added', " events=", $fixedEve ? 'replaced' : 'added', "\n";

// نمایش خطوط تازه (بدون رمز — خطوط Bearer رمز درون‌خطی ندارند)
foreach (preg_split('/\r?\n/', (string)file_get_contents($spool)) as $l)
  if (trim($l) !== '') echo "  | ", preg_replace('/[A-Za-z0-9_\-]{40,}/', '***', $l), "\n";
echo "== cron done ==\n";
