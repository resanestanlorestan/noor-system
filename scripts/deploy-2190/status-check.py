#!/usr/bin/env python3
# وضعیت‌سنج فقط-خواندنی برای وریفای استخراج ۲.۱۹.۰ (بدون اثر جانبی؛ خودحذف).
import re, secrets, subprocess, sys, time

txt = open("/home/z/my-project/scripts/.cp-creds").read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)
JAR = "/tmp/cp-2190st.jar"
HDR = "/tmp/cp-2190st-hdr.txt"
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

STUB = r"""<?php
header('Content-Type: application/json');
$K = '__TOKEN__';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); echo '{"error":"bad token"}'; exit; }
$APP = '/home/epqoisdl/noor-system';
function rd($p) { $h = @fopen($p, 'rb'); if (!$h) return null; $s = ''; while (!feof($h)) { $s .= fread($h, 65536); } fclose($h); return $s; }
$pkg = json_decode(rd($APP . '/package.json'), true);
$o = [
  'build_id' => trim((string)@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')),
  'version' => is_array($pkg) ? ($pkg['version'] ?? '?') : '?',
  'env' => filesize($APP . '/.env'),
  'zip_left' => is_file('/home/epqoisdl/noor-slim-2.19.0.zip') ? 'yes' : 'no',
  'classes_lib' => is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no',
  'migration_0028' => is_file($APP . '/drizzle/0028-classes.sql') ? 'yes' : 'no',
  'classes_page' => is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no',
  'cron_route' => is_file($APP . '/src/app/api/cron/classes/route.ts') ? 'yes' : 'no',
  'health_runtime' => 'unknown',
];
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
STUB = STUB.replace("__TOKEN__", TOKEN)

out = subprocess.run(["curl", "-sk", "--max-time", "90", "-b", JAR,
                      f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                      "-H", "User-Agent: Mozilla/5.0",
                      "--data-urlencode", "dir=/home/epqoisdl/public_html",
                      "--data-urlencode", "file=st2190s.php",
                      "--data-urlencode", "utf8=1",
                      "--data-urlencode", f"content={STUB}"],
                     capture_output=True, text=True).stdout
print("SAVE st2190s:", "OK" if '"status":1' in out else out[:120])
time.sleep(1.5)
r = subprocess.run(["curl", "-sk", "--max-time", "60", "-H", "User-Agent: Mozilla/5.0",
                    f"https://pouyafarhadi.ir/st2190s.php?k={TOKEN}"],
                   capture_output=True, text=True).stdout
print("STATE:", r[:400])
