#!/usr/bin/env python3
# پروب دیسک هاست برای الحاقیهٔ ۲.۲۳.۰ — df + بزرگ‌ترین اقلام home تا گلوگاه سهمیه پیدا شود
import base64, json, os, re, subprocess, sys, time

CREDS = "/home/z/my-project/scripts/.cp-creds"
txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)
HOME = f"/home/{USER}"
JAR, HDR = "/tmp/cp-p.jar", "/tmp/cp-p-hdr.txt"

sess = None
for _ in range(5):
    subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                    f"https://{HOST}:2083/login", "--data-urlencode", f"user={USER}",
                    "--data-urlencode", f"pass={PASS}", "-H", "User-Agent: Mozilla/5.0"], check=False)
    try:
        m = re.search(r"cpsess\d+", open(HDR).read()); sess = m.group(0) if m else None
    except FileNotFoundError:
        sess = None
    if sess: break
    time.sleep(20)
if not sess: sys.exit("LOGIN_FAILED")


def save_file(name, content_path, directory):
    out = subprocess.run(["curl", "-sk", "--max-time", "120", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                          "-H", "User-Agent: Mozilla/5.0",
                          "--data-urlencode", f"dir={directory}",
                          "--data-urlencode", f"file={name}",
                          "--data-urlencode", "utf8=1",
                          "--data-urlencode", f"content@{content_path}"],
                         capture_output=True, text=True).stdout
    print(f"SAVE {name}: {out[:90]}", flush=True)
    return '"status":1' in out


def hit(url, timeout=120):
    import urllib.request
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=timeout) as r:
        return r.read().decode()


TOKEN = os.urandom(16).hex()
STUB = f"""<?php
header('Content-Type: application/json');
$T = '{TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t = 20) {{ $d = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']]; $p = proc_open($c, $d, $pipes); stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false); $o = ''; $e = time() + $t; while (time() < $e) {{ $r = [$pipes[1], $pipes[2]]; $w = null; $x = null; if (!stream_select($r, $w, $x, 1)) continue; foreach ($r as $s) {{ $o .= fread($s, 4096); }} if (!proc_get_status($p)['running']) break; }} proc_close($p); return $o; }}
echo json_encode(['df' => sh("df -h /home/{USER} | tail -1"), 'du' => sh("du -sh /home/{USER}/* 2>/dev/null | sort -rh | head -14"), 'free' => sh("df -k /home/{USER} | tail -1 | awk '{{print $4}}'")]);
@unlink(__FILE__);
"""
tmp = "/tmp/diskprobe2230.php"
open(tmp, "w").write(STUB)
if not save_file("diskprobe2230.php", tmp, f"{HOME}/public_html"):
    sys.exit("STUB_SAVE_FAIL")
os.unlink(tmp)
time.sleep(1.5)
print(hit(f"https://{HOST}/diskprobe2230.php?t={TOKEN}")[:1200])
