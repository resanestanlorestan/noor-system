<?php
// diagnose-temp v5 — وضعیت حساب 5ab7fc5d و ممیزی حذف‌های اخیر.
header('Content-Type: text/plain; charset=utf-8');
$env = @file_get_contents('/home/epqoisdl/noor-system/.env');
preg_match('/^DATABASE_URL=(.*)$/m', $env, $m);
$u = parse_url(trim($m[1], " \t\"'"));
$conn = @pg_connect(sprintf('host=%s port=%d dbname=%s user=%s password=%s connect_timeout=8',
  $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'), $u['user'], $u['pass']));
if (!$conn) { echo "CONNECT_FAILED\n"; exit; }

$queries = [
  'account_5ab7' => "SELECT id, username, email, role, status, created_at FROM app_users WHERE id='5ab7fc5d-b8e7-4c81-ba54-60f6c6fa3dcd'",
  'sessions_of_5ab7' => "SELECT count(*)::int AS n FROM user_sessions WHERE user_id='5ab7fc5d-b8e7-4c81-ba54-60f6c6fa3dcd'",
  'recent_audit' => "SELECT created_at, actor_id, action, target_type, target_id FROM audit_logs WHERE created_at > now() - interval '3 days' ORDER BY created_at DESC LIMIT 30",
  'recent_status_history' => "SELECT sh.created_at, sh.from_status, sh.to_status, sh.note, sh.actor_id FROM application_status_history sh JOIN applications app ON app.id=sh.application_id JOIN quranic_activists qa ON qa.id=app.activist_id WHERE qa.national_id_last4='5275' ORDER BY sh.created_at DESC LIMIT 10",
];
foreach ($queries as $label => $q) {
  echo "===== {$label} =====\n";
  $r = @pg_query($conn, $q);
  if (!$r) { echo "QUERY_FAILED: ", pg_last_error($conn), "\n"; continue; }
  echo "rows: ", pg_num_rows($r), "\n";
  while ($row = pg_fetch_assoc($r)) echo json_encode($row, JSON_UNESCAPED_UNICODE) . "\n";
}
echo "== done ==\n";
