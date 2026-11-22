#!/usr/bin/env python3
# گام ۱ پچ ۲.۲۱.۰ — نقشهٔ md5 فایل‌های واقعی noor-system روی هاست
# استاب PHP ~۶۰۰ بایتی با Fileman::save_file_content ذخیره و فراخوانی می‌شود؛
# خروجی JSON {مسیر نسبی: md5} در /tmp/host-md5-2210.json ذخیره می‌شود.
import json, re, secrets, subprocess, sys

CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-2210.jar"
HDR = "/tmp/cp-2210-hdr.txt"
BASE = "https://pouyafarhadi.ir"
OUT = "/tmp/host-md5-2210.json"

txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)
HOME = f"/home/{USER}"

sess = None
for attempt in range(4):
    subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                    f"https://{HOST}:2083/login",
                    "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                    "-H", "User-Agent: Mozilla/5.0"], check=False)
    try:
        m = re.search(r"cpsess\d+", open(HDR).read())
        sess = m.group(0) if m else None
    except FileNotFoundError:
        sess = None
    if sess:
        break
if not sess:
    sys.exit("LOGIN_FAILED")
print("session ready:", sess[:14] + "...", flush=True)

TOK = secrets.token_hex(12)
STUB = f"""<?php
header('Content-Type: application/json');
set_time_limit(120);
$K = '{TOK}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$A = '{HOME}/noor-system';
$o = [];
try {{
  $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($A, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::LEAVES_ONLY);
  foreach ($it as $f) {{ if ($f->isFile()) {{ $p = str_replace($A . '/', '', $f->getPathname()); $o[$p] = md5_file($f->getPathname()); }} }}
}} catch (Throwable $e) {{ $o['__error'] = $e->getMessage(); }}
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
stub_path = "/tmp/mh2210.php"
open(stub_path, "w").write(STUB)
r = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                    f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                    "-H", "User-Agent: Mozilla/5.0",
                    "--data-urlencode", f"dir={HOME}/public_html",
                    "--data-urlencode", "file=mh2210.php",
                    "--data-urlencode", "utf8=1",
                    "--data-urlencode", f"content@{stub_path}"],
                   capture_output=True, text=True).stdout
if '"status":1' not in r:
    sys.exit(f"STUB_SAVE_FAIL: {r[:200]}")
print("stub saved", flush=True)

import urllib.request, urllib.error
url = f"{BASE}/mh2210.php?k={TOK}"
try:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=300) as resp:
        body = resp.read().decode()
except Exception as e:
    sys.exit(f"STUB_HIT_FAIL: {e}")
subprocess.run(["curl", "-sk", "--max-time", "40", "-b", JAR,
                f"https://{HOST}:2083/{sess}/execute/Fileman/delete",
                "-H", "User-Agent: Mozilla/5.0",
                "--data-urlencode", f"dir={HOME}/public_html",
                "--data-urlencode", "file=mh2210.php"], capture_output=True)
try:
    m = json.loads(body)
except Exception:
    sys.exit(f"BAD_JSON: {body[:200]}")
n = len([k for k in m if not k.startswith("__")])
json.dump(m, open(OUT, "w"))
print(f"HOST_MD5_MAP_OK files={n} error={m.get('__error', '-')} saved={OUT}", flush=True)
