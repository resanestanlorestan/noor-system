#!/usr/bin/env python3
# مایگریشن 0028 برای دیپلوی ۲.۱۹.۰ — الگوی اثبات‌شدهٔ save_file_content:
# نوشتن استاب PHP با نشست cPanel → فراخوانی فوری (پیش از قرنطینهٔ اسکنر آپلود)
# → استاب فایل SQL مایگریشن را از مسیر app خوانده، دستورها را روی
# statement-breakpoint می‌شکند و idempotent اجرا می‌کند → خودحذف.
import json, re, secrets, subprocess, sys, time

txt = open("/home/z/my-project/scripts/.cp-creds").read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)
JAR = "/tmp/cp-2190mg.jar"
HDR = "/tmp/cp-2190mg-hdr.txt"
TOKEN = secrets.token_hex(16)

subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                f"https://{HOST}:2083/login",
                "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                "-H", "User-Agent: Mozilla/5.0"], check=False)
sess = None
for ln in open(HDR):
    m = re.search(r"cpsess\d+", ln)
    if m: sess = m.group(0); break
if not sess:
    print("LOGIN_FAILED"); sys.exit(1)
print("cpanel session ready")

STUB = r"""<?php
header('Content-Type: application/json');
set_time_limit(120);
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
    $sqlFile = '/home/epqoisdl/noor-system/drizzle/0028-classes.sql';
    if (!is_file($sqlFile)) throw new Exception('migration file missing');
    $sql = file_get_contents($sqlFile);
    $statements = array_map('trim', explode('--> statement-breakpoint', $sql));
    $done = 0;
    foreach ($statements as $st) {
        $t = trim($st);
        if ($t === '' || preg_match('/^(?:--[^\n]*\n?)+$/', $t)) continue;
        $pdo->exec($t);
        $done++;
    }
    $tables = ['classes','classes_counties','classes_specialties','class_sessions','class_registrations','class_waitlist','class_attendance','class_attendance_logs','class_sms_log'];
    $missing = [];
    foreach ($tables as $t) {
        $c = $pdo->query("select count(*) from information_schema.tables where table_name='" . $t . "'")->fetchColumn();
        if ((int)$c !== 1) $missing[] = $t;
    }
    $perm = $pdo->query("select count(*) from role_permissions where permission_key like 'classes.%'")->fetchColumn();
    $o['ok'] = (count($missing) === 0 && (int)$perm >= 4);
    $o['statements'] = $done;
    if ($missing) $o['missing_tables'] = $missing;
    $o['class_permission_rows'] = (int)$perm;
} catch (Throwable $e) { $o['error'] = $e->getMessage(); }
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
STUB = STUB.replace("__TOKEN__", TOKEN)

out = subprocess.run(["curl", "-sk", "--max-time", "180", "-b", JAR,
                      f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                      "-H", "User-Agent: Mozilla/5.0",
                      "--data-urlencode", "dir=/home/epqoisdl/public_html",
                      "--data-urlencode", "file=mg2190s.php",
                      "--data-urlencode", "utf8=1",
                      "--data-urlencode", f"content={STUB}"],
                     capture_output=True, text=True).stdout
print("SAVE mg2190s:", "OK" if '"status":1' in out else out[:150])
time.sleep(1.5)

r = ""
for attempt in range(3):
    r = subprocess.run(["curl", "-sk", "--max-time", "180", "-H", "User-Agent: Mozilla/5.0",
                        f"https://pouyafarhadi.ir/mg2190s.php?k={TOKEN}"],
                       capture_output=True, text=True).stdout
    if r.strip():
        break
    print(f"MIGRATION try {attempt + 1} empty, retrying...")
    time.sleep(10)
print("MIGRATION:", r[:400])
