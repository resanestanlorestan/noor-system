<?php
// verify-final — راستی‌آزمایی نهایی پس از purge؛ فقط‌خواندنی.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'Kv83mZQ1pLw4') { echo "FORBIDDEN"; exit; }
$env = @file_get_contents('/home/epqoisdl/noor-system/.env');
preg_match('/^DATABASE_URL=(.*)$/m', $env, $m);
$u = parse_url(trim($m[1], " \t\"'"));
$conn = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8',
  $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'), $u['user'], $u['pass']));
if (!$conn) { echo "CONNECT_FAILED\n"; exit; }

$checks = [
  'free_5275_active_rows' => "SELECT count(*)::int AS n FROM quranic_activists WHERE national_id_last4='5275' AND deleted_at IS NULL",
  'free_5275_any_rows' => "SELECT count(*)::int AS n FROM quranic_activists WHERE national_id_last4='5275'",
  'stale_account_5ab7' => "SELECT count(*)::int AS n FROM app_users WHERE id='5ab7fc5d-b8e7-4c81-ba54-60f6c6fa3dcd'",
  'other_stale_accounts_with_active_activists' => "
    SELECT qa.national_id_last4, qa.first_name, qa.last_name, qa.user_id AS uid,
           au.deleted_at AS account_deleted_at
    FROM quranic_activists qa
    LEFT JOIN app_users au ON au.id = qa.user_id
    WHERE qa.deleted_at IS NULL
      AND (au.id IS NULL OR au.deleted_at IS NOT NULL)
    ORDER BY qa.created_at DESC LIMIT 10",
  'zombie_cases_active_activist_soft_deleted_app' => "
    SELECT qa.national_id_last4, qa.first_name, qa.last_name
    FROM quranic_activists qa
    JOIN applications app ON app.activist_id = qa.id
    WHERE qa.deleted_at IS NULL AND app.deleted_at IS NOT NULL
    LIMIT 10",
  'health_audit_last' => "SELECT created_at, action, detail FROM audit_logs ORDER BY created_at DESC LIMIT 3",
];
foreach ($checks as $label => $sql) {
  echo "===== {$label} =====\n";
  $r = @pg_query($conn, $sql);
  if (!$r) { echo "QUERY_FAILED: ", pg_last_error($conn), "\n"; continue; }
  while ($row = pg_fetch_assoc($r)) echo json_encode($row, JSON_UNESCAPED_UNICODE), "\n";
  if (pg_num_rows($r) === 0) echo "(empty)\n";
}
echo "== done ==\n";
