#!/usr/bin/env python3
# گام پیگیری ۲.۲۳.۰ — پس از اکسترکت موفق، مایگریشن 0030 با node یافت‌شده از
# /proc (comm با پیشوند next-server) اجرا و در صورت موفقیت سرویس ری‌استارت می‌شود.
import json, os, re, secrets, subprocess, sys, time, urllib.request

CREDS = "/home/z/my-project/scripts/.cp-creds"
txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)
HOME = f"/home/{USER}"
JAR, HDR = "/tmp/cp-2230b.jar", "/tmp/cp-2230b-hdr.txt"
BASE = "https://pouyafarhadi.ir"

sess = None
for _ in range(4):
    subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                    f"https://{HOST}:2083/login", "--data-urlencode", f"user={USER}",
                    "--data-urlencode", f"pass={PASS}", "-H", "User-Agent: Mozilla/5.0"], check=False)
    try:
        m = re.search(r"cpsess\d+", open(HDR).read()); sess = m.group(0) if m else None
    except FileNotFoundError:
        sess = None
    if sess: break
    time.sleep(5)
if not sess:
    sys.exit("LOGIN_FAILED")
print("cpanel session ready", flush=True)


def save_file(name, content_path, directory):
    for attempt in range(5):
        out = subprocess.run(["curl", "-sk", "--max-time", "120", "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0",
                              "--data-urlencode", f"dir={directory}",
                              "--data-urlencode", f"file={name}",
                              "--data-urlencode", "utf8=1",
                              "--data-urlencode", f"content@{content_path}"],
                             capture_output=True, text=True).stdout
        if '"status":1' in out:
            print(f"SAVE {name}: OK", flush=True); return True
        print(f"SAVE {name} try{attempt}:", out[:100], flush=True)
        time.sleep(10 + 5 * attempt)
    return False


def hit(url, timeout=300):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=timeout) as r:
        return r.read().decode()


TOKEN = secrets.token_hex(16)
STUB = f"""<?php
header('Content-Type: application/json');
set_time_limit(240);
$T = '{TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t = 60) {{ $d = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']]; $p = proc_open($c, $d, $pipes); stream_set_blocking($pipes[1], false); stream_set_blocking($pipes[2], false); $o = ''; $e = time() + $t; while (time() < $e) {{ $r = [$pipes[1], $pipes[2]]; $w = null; $x = null; if (!stream_select($r, $w, $x, 1)) continue; foreach ($r as $s) {{ $o .= fread($s, 4096); }} if (!proc_get_status($p)['running']) break; }} proc_close($p); return $o; }}
$H = '{HOME}';
$APP = $H . '/noor-system';
$o = ['ok' => false];
// node واقعی فرایند جاری: comm با پیشوند next-server
$node = null;
foreach (glob('/proc/[0-9]*/comm') as $cf) {{
    $comm = @file_get_contents($cf);
    if ($comm && strpos($comm, 'next-server') === 0) {{ $exe = @readlink(str_replace('/comm', '/exe', $cf)); if ($exe && is_executable($exe)) {{ $node = $exe; break; }} }}
}}
$o['node'] = $node ? 'found' : 'not found';
if ($node) {{
    // escapeshellarg در این PHP بسته است؛ هر دو مسیر فاقد نویسهٔ خاص‌اند
    $mig = sh($node . ' ' . $APP . '/host-migrate-2230.js', 90);
    $o['migrate_raw'] = trim((string)$mig);
    $mj = json_decode((string)$mig, true);
    $o['migrate_ok'] = is_array($mj) && !empty($mj['ok']);
}}
$o['disk_build_id'] = trim((string)@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID'));
$o['forms_page'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/forms/page.tsx'), 'FormBuilder') !== false;
$o['ok'] = ($o['node'] === 'found' && $o['migrate_ok'] && $o['disk_build_id'] === 'CzluPobHZ9FgYD55vyh9J' && $o['forms_page']);
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
STUB_NAME = "mig2230-" + secrets.token_hex(4) + ".php"
tmp = "/tmp/mig2230.php"
open(tmp, "w").write(STUB)
if not save_file(STUB_NAME, tmp, f"{HOME}/public_html"):
    sys.exit("stub save failed")
os.unlink(tmp)
time.sleep(1.5)
res = hit(f"{BASE}/{STUB_NAME}?t={TOKEN}")
print("MIGRATE:", res[:600], flush=True)
try:
    o = json.loads(res)
except Exception:
    sys.exit("BAD_JSON")
if not o.get("ok"):
    sys.exit("MIGRATE_GATE_FAIL")

# ری‌استارت سرویس
RS_TOKEN = secrets.token_hex(16)
RS = f"""<?php
header('Content-Type: application/json');
$T = '{RS_TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t=15){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${{p}}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
@unlink($H . '/noor-patch-2230.zip');
@unlink(__FILE__);
echo json_encode(['kill'=>trim($kill)]);
"""
tmp = "/tmp/rst2230b.php"
open(tmp, "w").write(RS)
if not save_file("rst2230b.php", tmp, f"{HOME}/public_html"):
    sys.exit("restart stub save failed")
os.unlink(tmp)
time.sleep(1.5)
print("RESTART:", hit(f"{BASE}/rst2230b.php?t={RS_TOKEN}", 90)[:200], flush=True)
time.sleep(15)

ver = None
for i in range(12):
    try:
        h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    except Exception as e:
        h = f"ERR {e}"
    print(f"health try {i + 1}: {h[:90]}", flush=True)
    if '"version":"2.23.0"' in h and '"ok":true' in h:
        ver = "2.23.0"
        break
    time.sleep(15)

pages = {}
for path in ["/login", "/", "/forms", "/api/health/"]:
    code = subprocess.run(["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}",
                           "--max-time", "30", BASE + path],
                          capture_output=True, text=True).stdout
    pages[path] = code
print(json.dumps({"health_version": ver, "pages": pages}, indent=1))
sys.exit(0 if ver == "2.23.0" and pages.get("/login") == "200" else 1)
