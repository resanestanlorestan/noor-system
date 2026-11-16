<?php
// purge-9f3c1a — اجرای یک‌بارهٔ «حذف یکپارچهٔ حساب کاربر» (الحاقیهٔ ۲.۱۷.۰) برای
// حساب 5ab7fc5d روی تولید؛ دقیقاً مطابق purgeUserAccount + deleteUserAction.
// مراحل: پشتیبان pg_dump → تراکنش → حذف فایل فیزیکی → راستی‌آزمایی.
// فقط با توکن درست اجرا می‌شود؛ در اجرای مجدد IMPOSSIBLE گزارش می‌دهد.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'Kv83mZQ1pLw4') { echo "FORBIDDEN"; exit; }

$UID = '5ab7fc5d-b8e7-4c81-ba54-60f6c6fa3dcd';
$ACTOR = '099ca3aa-ce0e-4955-99d7-564cb1da5b31'; // مدیر کل بر اساس ممیزی موجود
$PRIVATE = '/home/epqoisdl/noor-system/.private-app';

$env = @file_get_contents('/home/epqoisdl/noor-system/.env');
preg_match('/^DATABASE_URL=(.*)$/m', $env, $m);
$u = parse_url(trim($m[1], " \t\"'"));
$db = ltrim($u['path'], '/'); $dbUser = $u['user']; $dbPass = $u['pass']; $host = $u['host']; $port = $u['port'] ?? 5432;
$conn = @pg_connect("host={$host} port={$port} dbname={$db} user={$dbUser} password={$dbPass} connect_timeout=8");
if (!$conn) { echo "CONNECT_FAILED\n"; exit; }
echo "connected to db={$db}\n";

function q($conn, $sql, $must = true) {
  $r = @pg_query($conn, $sql);
  if (!$r && $must) { echo "SQL_FAILED: ", pg_last_error($conn), "\nSQL: ", substr($sql, 0, 200), "\n"; exit(1); }
  return $r;
}
function inList($arr) { return implode(",", array_map(fn($x) => "'{$x}'", $arr)); }

// ---------- PHASE 0: گارد و تشخیص وضعیت حساب ----------
$ex = pg_fetch_assoc(q($conn, "SELECT role, full_name, deleted_at FROM app_users WHERE id='{$UID}'"));
if (!$ex) {
  echo "note: account row missing (orphan) — purging owned data only.\n";
  $ex = ['role' => 'unknown', 'full_name' => '(missing)', 'deleted_at' => '(missing)'];
} elseif ($ex['role'] === 'super_admin') { echo "ABORT — target is super_admin; deletion forbidden.\n"; exit; }
else echo "target: role={$ex['role']} full_name={$ex['full_name']} account_deleted_at={$ex['deleted_at']}\n";
// حساب stale = قبلاً با کد قدیمی گمنام/علامت‌شده ولی داده‌های متعلقش پاک نشده
$stale = ($ex['deleted_at'] && $ex['deleted_at'] !== '(missing)') ? true : false;

// ---------- PHASE 1: پشتیبان کامل داده‌ای (COPY TO — بدون shell_exec) ----------
@mkdir('/home/epqoisdl/backups', 0755, true);
$stamp = date('Ymd-His');
$bdir = "/home/epqoisdl/backups/noor-copy-{$stamp}";
@mkdir($bdir, 0755);
$tbls = pg_fetch_all(q($conn, "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")) ?: [];
$manifest = ""; $totalRows = 0; $bytes = 0;
foreach ($tbls as $t) {
  $name = $t['table_name'];
  $rows = @pg_copy_to($conn, "\"{$name}\"");
  if ($rows === false) { echo "ABORT — COPY failed for {$name}; no backup, no purge.\n"; exit(1); }
  file_put_contents("{$bdir}/{$name}.tsv", implode("\n", $rows) . (count($rows) ? "\n" : ""));
  $cnt = (int)pg_fetch_result(q($conn, "SELECT count(*)::bigint AS c FROM \"{$name}\""), 0, 0);
  if ((int)count($rows) !== $cnt) { echo "ABORT — rowcount mismatch for {$name} (copy=" . count($rows) . ", count={$cnt})\n"; exit(1); }
  $manifest .= "{$name}\t{$cnt}\n"; $totalRows += $cnt; $bytes += filesize("{$bdir}/{$name}.tsv");
}
file_put_contents("{$bdir}/manifest.tsv", $manifest);
echo "backup dir: {$bdir} ({$bytes} bytes, " . count($tbls) . " tables, {$totalRows} rows, all verified)\n";
$sha = hash('sha256', file_get_contents("{$bdir}/manifest.tsv"));
echo "manifest sha256: {$sha}\n";

// ---------- PHASE 2: جمع‌آوری داده‌های متعلق به حساب ----------
$actRows = pg_fetch_all(q($conn, "SELECT id FROM quranic_activists WHERE user_id='{$UID}'")) ?: [];
$actIds = array_column($actRows, 'id');
echo "owned activists: ", count($actIds), "\n";
$appIds = []; $keyRows = [];
if ($actIds) {
  $apps = pg_fetch_all(q($conn, "SELECT id FROM applications WHERE activist_id IN (" . inList($actIds) . ")")) ?: [];
  $appIds = array_column($apps, 'id');
  $docs = pg_fetch_all(q($conn, "SELECT storage_key FROM activist_documents WHERE application_id IN (" . inList($appIds) . ")")) ?: [];
  $keyRows = array_column($docs, 'storage_key');
  $prof = pg_fetch_assoc(q($conn, "SELECT photo_document_id, university_document_id, seminary_document_id, memorization_document_id FROM quranic_activists WHERE user_id='{$UID}'"));
  $special = array_values(array_filter([$prof['photo_document_id'], $prof['university_document_id'], $prof['seminary_document_id'], $prof['memorization_document_id']]));
  if ($special) {
    $sd = pg_fetch_all(q($conn, "SELECT storage_key FROM activist_documents WHERE id IN (" . inList($special) . ")")) ?: [];
    $keyRows = array_merge($keyRows, array_column($sd, 'storage_key'));
  }
}
echo "owned applications: ", count($appIds), " | physical files: ", count($keyRows), "\n";

// ---------- PHASE 3: تراکنش حذف ----------
q($conn, "BEGIN");
$fail = function ($msg) use ($conn) { pg_query($conn, "ROLLBACK"); echo "TX_ROLLBACK — {$msg}\n"; exit(1); };

foreach ($appIds as $appId) foreach ([
  "DELETE FROM case_reminders WHERE application_id='{$appId}'",
  "DELETE FROM application_status_history WHERE application_id='{$appId}'",
  "DELETE FROM document_requests WHERE application_id='{$appId}'",
  "DELETE FROM correction_requests WHERE application_id='{$appId}'",
  "DELETE FROM appeals WHERE application_id='{$appId}'",
  "DELETE FROM expert_referrals WHERE application_id='{$appId}'",
  "DELETE FROM expert_notes WHERE application_id='{$appId}'",
  "DELETE FROM application_versions WHERE application_id='{$appId}'",
  "DELETE FROM notifications WHERE application_id='{$appId}'",
] as $sql) if (!pg_query($conn, $sql)) $fail(pg_last_error($conn));

foreach ($actIds as $actId) foreach ([
  "DELETE FROM certificates WHERE activist_id='{$actId}'",
  "DELETE FROM education_records WHERE activist_id='{$actId}'",
  "DELETE FROM work_history WHERE activist_id='{$actId}'",
  "DELETE FROM activist_specialty_details WHERE activist_id='{$actId}'",
  "DELETE FROM activist_specialties WHERE activist_id='{$actId}'",
  "DELETE FROM activist_writings WHERE activist_id='{$actId}'",
  "DELETE FROM activist_organizations WHERE activist_id='{$actId}'",
  "DELETE FROM activity_records WHERE activist_id='{$actId}'",
  "DELETE FROM educational_courses WHERE activist_id='{$actId}'",
  "DELETE FROM event_participants WHERE activist_id='{$actId}'",
  "UPDATE quranic_activists SET photo_document_id=null, university_document_id=null, seminary_document_id=null, memorization_document_id=null WHERE id='{$actId}'",
] as $sql) if (!pg_query($conn, $sql)) $fail(pg_last_error($conn));

if ($appIds) { $list = inList($appIds); if (!pg_query($conn, "DELETE FROM activist_documents WHERE application_id IN ({$list})")) $fail(pg_last_error($conn)); }
if (isset($special) && $special) { $list = inList($special); if (!pg_query($conn, "DELETE FROM activist_documents WHERE id IN ({$list})")) $fail(pg_last_error($conn)); }
if ($appIds) { $list = inList($appIds); if (!pg_query($conn, "DELETE FROM applications WHERE id IN ({$list})")) $fail(pg_last_error($conn)); }
if ($actIds) { $list = inList($actIds); if (!pg_query($conn, "DELETE FROM quranic_activists WHERE id IN ({$list})")) $fail(pg_last_error($conn)); }

foreach (['user_sessions','mfa_recovery_codes','pending_mfa_sessions','password_reset_tokens',
  'email_verification_tokens','mobile_reset_codes','mobile_verification_codes',
  'pending_mobile_verifications','user_specialties','notifications'] as $tbl)
  if (!pg_query($conn, "DELETE FROM {$tbl} WHERE user_id='{$UID}'")) $fail(pg_last_error($conn));
if (!pg_query($conn, "DELETE FROM message_outbox WHERE user_id='{$UID}'")) $fail(pg_last_error($conn));
if (!pg_query($conn, "DELETE FROM manager_sms_recipients WHERE source_user_id='{$UID}'")) $fail(pg_last_error($conn));

// تعیین حالت: کامل یا گمنام — همان ۲۱ چکِ purgeUserAccount
$blockedChecks = [
  "SELECT id FROM application_status_history WHERE actor_id='{$UID}' LIMIT 1",
  "SELECT id FROM activist_documents WHERE uploaded_by='{$UID}' LIMIT 1",
  "SELECT id FROM applications WHERE created_by='{$UID}' OR assigned_expert_id='{$UID}' LIMIT 1",
  "SELECT id FROM expert_referrals WHERE specialist_id='{$UID}' OR requested_by='{$UID}' LIMIT 1",
  "SELECT id FROM correction_requests WHERE requested_by='{$UID}' OR responded_by='{$UID}' LIMIT 1",
  "SELECT id FROM appeals WHERE submitted_by='{$UID}' OR assigned_to='{$UID}' OR resolved_by='{$UID}' LIMIT 1",
  "SELECT id FROM expert_notes WHERE author_id='{$UID}' LIMIT 1",
  "SELECT id FROM application_versions WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM document_requests WHERE requested_by='{$UID}' LIMIT 1",
  "SELECT id FROM activist_writings WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM activist_organizations WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM activity_records WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM educational_courses WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM certificates WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM education_records WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM work_history WHERE created_by='{$UID}' LIMIT 1",
  "SELECT id FROM quranic_activists WHERE deleted_by='{$UID}' LIMIT 1",
  "SELECT id FROM custom_roles WHERE created_by='{$UID}' LIMIT 1",
  "SELECT key FROM sms_templates WHERE updated_by='{$UID}' LIMIT 1",
  "SELECT id FROM sms_settings WHERE updated_by='{$UID}' LIMIT 1",
  "SELECT id FROM api_settings WHERE updated_by='{$UID}' LIMIT 1",
];
$blocked = 0; $blockedHit = '';
foreach ($blockedChecks as $i => $sql) {
  $r = pg_query($conn, $sql);
  if (!$r) $fail(pg_last_error($conn));
  if (pg_num_rows($r) > 0) { $blocked++; if (!$blockedHit) $blockedHit = "check#{$i}: " . $sql; }
}
$mode = $blocked ? 'anonymized' : 'total';
echo "mode: {$mode}" . ($blocked ? " (first hit: {$blockedHit})" : "") . "\n";

if ($mode === 'total') {
  if (!pg_query($conn, "UPDATE audit_logs SET actor_id=null WHERE actor_id='{$UID}'")) $fail(pg_last_error($conn));
  if ($stale) echo "note: account row was already anonymized by old code (stale) — now fully removing it.\n";
  if (!pg_query($conn, "DELETE FROM app_users WHERE id='{$UID}'")) $fail(pg_last_error($conn));
} else {
  if ($stale) {
    echo "note: account already anonymized — data purged, row kept for audit trail.\n";
  } else {
    $short = substr($UID, 0, 8);
    $badHash = password_hash(bin2hex(random_bytes(16)), PASSWORD_BCRYPT);
    $sql = "UPDATE app_users SET full_name='حساب حذف‌شده ({$short})', first_name='حساب', last_name='حذف‌شده', email=null, phone=null, active=false, password_hash='" . pg_escape_string($badHash) . "', mfa_secret_cipher=null, mfa_enabled=false, mfa_enabled_at=null, custom_role_id=null, deleted_at=now() WHERE id='{$UID}'";
    if (!pg_query($conn, $sql)) $fail(pg_last_error($conn));
  }
}
$detail = ($stale ? 'stale_cleanup;' : '') . "{$ex['role']};cases=" . count($appIds) . ";files=" . count($keyRows);
$action = $mode === 'anonymized' ? 'anonymize_user' : 'delete_user';
if (!pg_query($conn, "INSERT INTO audit_logs (actor_id, action, target_type, target_id, detail) VALUES ('{$ACTOR}', '{$action}', 'user', '{$UID}', '" . pg_escape_string($detail) . "')")) $fail(pg_last_error($conn));

if (!pg_query($conn, "COMMIT")) $fail(pg_last_error($conn));
echo "TX_COMMITTED\n";

// ---------- PHASE 4: حذف فایل‌های فیزیکی (پس از تراکنش) ----------
foreach ($keyRows as $key) @unlink("{$PRIVATE}/uploads/{$key}");

// ---------- PHASE 5: راستی‌آزمایی ----------
echo "\n== verification ==\n";
foreach ([
  'activists_5275_left' => "SELECT count(*)::int AS n FROM quranic_activists WHERE national_id_last4='5275'",
  'active_hash_left' => "SELECT count(*)::int AS n FROM quranic_activists WHERE national_id_hash='aa6a571b12103c5097f96c6510218671a3adf4268959ee589c7ec95fe9304744' AND deleted_at IS NULL",
  'app_left' => "SELECT count(*)::int AS n FROM applications WHERE activist_id IN (SELECT id FROM quranic_activists WHERE national_id_last4='5275')",
  'account_state' => "SELECT count(*)::int AS n, coalesce(max(deleted_at::text),'-') AS del FROM app_users WHERE id='{$UID}'",
  'audit_entry' => "SELECT created_at, action, detail FROM audit_logs WHERE target_id='{$UID}' AND action IN ('delete_user','anonymize_user') ORDER BY created_at DESC LIMIT 1",
] as $label => $sql) {
  $r = q($conn, $sql);
  while ($row = pg_fetch_assoc($r)) echo "{$label}: ", json_encode($row, JSON_UNESCAPED_UNICODE), "\n";
}
echo "== done ==\n";
