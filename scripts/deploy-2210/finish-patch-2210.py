#!/usr/bin/env python3
# پایان‌بند پچ ۲.۲۱.۰ — حذف scripts/.cp-creds هاست + پاک‌سازی بقایا + ری‌استارت + پایش سلامت
import json, re, secrets, subprocess, sys, time, urllib.request

CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-2210.jar"
HDR = "/tmp/cp-2210-hdr.txt"
BASE = "https://pouyafarhadi.ir"

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
    time.sleep(5)
if not sess:
    sys.exit("LOGIN_FAILED")
print("session ready", flush=True)


def save_file(name, content_path, directory):
    for attempt in range(5):
        out = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0",
                              "--data-urlencode", f"dir={directory}",
                              "--data-urlencode", f"file={name}",
                              "--data-urlencode", "utf8=1",
                              "--data-urlencode", f"content@{content_path}"],
                             capture_output=True, text=True).stdout
        if '"status":1' in out:
            print(f"SAVE {name}: OK", flush=True)
            return True
        time.sleep(10)
    return False


def hit(url, timeout=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
                                timeout=timeout) as r:
        return r.read().decode()


# ---------- ۱) استاب پاک‌سازی ----------
CL_TOKEN = secrets.token_hex(12)
STUB = f"""<?php
header('Content-Type: application/json');
$K = '{CL_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$H = '{HOME}';
$A = $H . '/noor-system';
$o = [];
@unlink($A . '/scripts/.cp-creds');
$o['creds_gone'] = !is_file($A . '/scripts/.cp-creds');
$n = 0;
foreach ((glob($H . '/noor-patch-part-*.b64.txt') ?: []) as $p) {{ @unlink($p); $n++; }}
foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) {{ @unlink($p); $n++; }}
$o['parts_deleted'] = $n;
@unlink($H . '/noor-patch-2210.zip');
$o['zip_gone'] = !is_file($H . '/noor-patch-2210.zip');
$o['leftover_scan'] = array_map('basename', (glob($H . '/noor-*') ?: []));
echo json_encode($o, JSON_UNESCAPED_SLASHES);
@unlink(__FILE__);
"""
open("/tmp/cl2210.php", "w").write(STUB)
if not save_file("cl2210.php", "/tmp/cl2210.php", f"{HOME}/public_html"):
    sys.exit("cleanup stub save failed")
print("CLEANUP:", hit(f"{BASE}/cl2210.php?k={CL_TOKEN}")[:400], flush=True)

# ---------- ۲) ری‌استارت ----------
RS_TOKEN = secrets.token_hex(16)
RS = f"""<?php
header('Content-Type: application/json');
$T = '{RS_TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t=15){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}
$before = sh("for p in /proc/[0-9]*/; do c=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$c\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done | head -4");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${{p}}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
echo json_encode(['before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""
open("/tmp/rst2210.php", "w").write(RS)
if not save_file("rst2210.php", "/tmp/rst2210.php", f"{HOME}/public_html"):
    sys.exit("restart stub save failed")
print("RESTART:", hit(f"{BASE}/rst2210.php?t={RS_TOKEN}", 60)[:200], flush=True)
time.sleep(15)

# ---------- ۳) پایش سلامت ----------
ver = None
for i in range(12):
    try:
        h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    except Exception as e:
        h = f"ERR {e}"
    print(f"health try {i + 1}: {h[:90]}", flush=True)
    if '"version":"2.21.0"' in h and '"ok":true' in h:
        ver = "2.21.0"
        break
    time.sleep(15)

# ---------- ۴) صفحات ----------
pages = {}
for path in ["/login", "/", "/api/health/"]:
    code = subprocess.run(["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}",
                           "--max-time", "30", BASE + path],
                          capture_output=True, text=True).stdout
    pages[path] = code
print(json.dumps({"health_version": ver, "pages": pages}, indent=1))
sys.exit(0 if ver == "2.21.0" and pages.get("/login") == "200" else 1)
