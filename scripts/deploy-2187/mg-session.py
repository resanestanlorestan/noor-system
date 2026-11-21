#!/usr/bin/env python3
# مایگریشن 0027 از مسیر save_file_content — الگوی restart2185.py:
# نوشتن استاب PHP با نشست cPanel → فراخوانی فوری (پیش از قرنطینهٔ اسکنر آپلود) →
# خودحذف استاب. استاب همان منطق mg2187.php را دارد (PDO + .env هاست + idempotent).
import json, re, secrets, subprocess, sys

txt = open("/home/z/my-project/scripts/.cp-creds").read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)
JAR = "/tmp/cp-2187mg.jar"
HDR = "/tmp/cp-2187mg-hdr.txt"
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

STUB = """<?php
header('Content-Type: application/json');
set_time_limit(90);
$K = '__TOKEN__';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); echo '{"error":"bad token"}'; exit; }
$o = ['ok' => false];
try {
    $envFile = '/home/epqoisdl/noor-system/.env';
    if (!is_file($envFile)) throw new Exception('.env missing');
    $env = file_get_contents($envFile);
    if (!preg_match('/^DATABASE_URL=(.*)$/m', $env, $m)) throw new Exception('DATABASE_URL missing');
    $url = trim($m[1]);
    if (!preg_match('/^postgres(ql)?:\\/\\//i', $url)) throw new Exception('not a postgres url');
    $u = parse_url($url);
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'));
    $pdo = new PDO($dsn, urldecode($u['user'] ?? ''), urldecode($u['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10]);
    $pdo->exec("ALTER TABLE user_sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now()");
    $pdo->exec("CREATE INDEX IF NOT EXISTS sessions_last_seen_idx ON user_sessions (last_seen_at)");
    $cols = $pdo->query("select count(*) from information_schema.columns where table_name='user_sessions' and column_name='last_seen_at'")->fetchColumn();
    $idx = $pdo->query("select count(*) from pg_indexes where tablename='user_sessions' and indexname='sessions_last_seen_idx'")->fetchColumn();
    $filled = $pdo->query("select count(*) from user_sessions where last_seen_at is not null")->fetchColumn();
    $o['ok'] = ((int)$cols === 1 && (int)$idx === 1);
    $o['sessions_with_last_seen'] = (int)$filled;
} catch (Throwable $e) { $o['error'] = $e->getMessage(); }
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
STUB = STUB.replace("__TOKEN__", TOKEN)

out = subprocess.run(["curl", "-sk", "--max-time", "90", "-b", JAR,
                      f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                      "-H", "User-Agent: Mozilla/5.0",
                      "--data-urlencode", "dir=/home/epqoisdl/public_html",
                      "--data-urlencode", "file=mg2187s.php",
                      "--data-urlencode", "utf8=1",
                      "--data-urlencode", f"content={STUB}"],
                     capture_output=True, text=True).stdout
print("SAVE mg2187s:", "OK" if '"status":1' in out else out[:150])
time_sleep = 1.5
import time; time.sleep(time_sleep)

r = subprocess.run(["curl", "-sk", "--max-time", "90", "-H", "User-Agent: Mozilla/5.0",
                    f"https://pouyafarhadi.ir/mg2187s.php?k={TOKEN}"],
                   capture_output=True, text=True).stdout
print("MIGRATION:", r[:300])
