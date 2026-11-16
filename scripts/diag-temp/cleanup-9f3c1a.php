<?php
// cleanup-stale — چک پروندهٔ فعال برای دو رکورد گیرکرده؛ فقط در صورت نبود پروندهٔ
// فعال، ردیف فعالِ آن‌ها نرم‌حذف می‌شود (deleted_at=now، قابل بازیابی) و ممیزی ثبت می‌شود.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'Kv83mZQ1pLw4') { echo "FORBIDDEN"; exit; }
$env = @file_get_contents('/home/epqoisdl/noor-system/.env');
preg_match('/^DATABASE_URL=(.*)$/m', $env, $m);
$u = parse_url(trim($m[1], " \t\"'"));
$conn = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8',
  $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'), $u['user'], $u['pass']));
if (!$conn) { echo "CONNECT_FAILED\n"; exit; }
$ACTOR = '099ca3aa-ce0e-4955-99d7-564cb1da5b31';

$targets = [
  ['last4' => '1877', 'name' => 'نگار فرج اللهی', 'uid' => 'b8cd7278-1f1f-4384-ae62-6c6f577098d3'],
  ['last4' => '5317', 'name' => 'معصومه گودرزی', 'uid' => null],
];

// پیش‌نمایش پرونده‌های هر هدف
foreach ($targets as $t) {
  $last4 = $t['last4'];
  $sql = "SELECT app.id, app.status, app.deleted_at IS NOT NULL AS app_deleted
          FROM applications app JOIN quranic_activists qa ON qa.id = app.activist_id
          WHERE qa.national_id_last4='{$last4}' AND qa.deleted_at IS NULL";
  $r = pg_query($conn, $sql);
  echo "== target {$last4} ({$t['name']}) ==\n";
  $apps = [];
  while ($row = pg_fetch_assoc($r)) { $apps[] = $row; echo json_encode($row, JSON_UNESCAPED_UNICODE), "\n"; }
  $activeApps = array_filter($apps, fn($a) => $a['app_deleted'] !== 't');
  if (count($activeApps) > 0) { echo "SKIP — has active application; row stays.\n\n"; continue; }
  // همهٔ پرونده‌ها حذف‌شده‌اند → ردیف فعال، زبالهٔ الگوی stale است → نرم‌حذف قابل بازیابی
  pg_query($conn, "BEGIN");
  $ok = pg_query($conn, "UPDATE quranic_activists SET deleted_at=now(), deleted_by='{$ACTOR}', updated_at=now() WHERE national_id_last4='{$last4}' AND deleted_at IS NULL")
    && pg_query($conn, "INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail) VALUES ('{$ACTOR}', 'delete_case_bank', 'quranic_activists', (SELECT id FROM quranic_activists WHERE national_id_last4='{$last4}' LIMIT 1), 'stale_cleanup;soft_delete;last4={$last4}')");
  if (!$ok) { echo "ROLLBACK: ", pg_last_error($conn), "\n"; pg_query($conn, "ROLLBACK"); exit(1); }
  pg_query($conn, "COMMIT");
  echo "soft-deleted stale activist row (recoverable).\n\n";
}

echo "===== final check =====\n";
$r = pg_query($conn, "SELECT qa.national_id_last4, qa.first_name, qa.last_name, qa.deleted_at IS NOT NULL AS now_deleted
  FROM quranic_activists qa
  JOIN applications app ON app.activist_id = qa.id
  WHERE qa.deleted_at IS NULL AND app.deleted_at IS NOT NULL");
while ($row = pg_fetch_assoc($r)) echo json_encode($row, JSON_UNESCAPED_UNICODE), "\n";
if (pg_num_rows($r) === 0) echo "no zombie rows left — all national IDs free.\n";
echo "== done ==\n";
