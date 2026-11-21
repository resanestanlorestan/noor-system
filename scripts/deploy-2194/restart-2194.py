#!/usr/bin/env python3
# تشخیص و ری‌استارت سرور تولید برای ۲.۱۹.۳ — گسترده‌تر از الگوی rst2194:
# هر پروسه‌ای که cwd آن داخل noor-system است کشته می‌شود (نه فقط comm=next-server)
# و در صورت بازنگشتن سرویس، راه‌اندازی دستی nohup انجام می‌شود. خودحذف استاب‌ها.
import json, re, subprocess, sys, time, secrets

CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-2194b.jar"
HDR = "/tmp/cp-2194b-hdr2.txt"
BASE = "https://pouyafarhadi.ir"
KILL_TOKEN, START_TOKEN = (secrets.token_hex(16) for _ in range(2))

txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)
HOME = f"/home/{USER}"

sess = None
subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                f"https://{HOST}:2083/login",
                "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                "-H", "User-Agent: Mozilla/5.0"], check=False)
for ln in open(HDR):
    m = re.search(r"cpsess\d+", ln)
    if m:
        sess = m.group(0)
        break
if not sess:
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)
print("cpanel session ready", flush=True)


def save_file(name: str, content_path: str) -> bool:
    for attempt in range(6):
        out = subprocess.run(["curl", "-sk", "--max-time", "90", "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0",
                              "--data-urlencode", f"dir={HOME}/public_html",
                              "--data-urlencode", f"file={name}",
                              "--data-urlencode", "utf8=1",
                              "--data-urlencode", f"content@{content_path}"],
                             capture_output=True, text=True).stdout
        if '"status":1' in out:
            print(f"SAVE {name}: OK", flush=True)
            return True
        print(f"SAVE {name} try{attempt}:", out[:120], flush=True)
        time.sleep(12 + 8 * attempt)
    return False


def hit(url: str, timeout: int = 60) -> str:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode()


PHP_SH = """function sh($c, $t=20){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}"""

KILL_STUB = f"""<?php
header('Content-Type: application/json');
$K = '{KILL_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
{PHP_SH}
$build = is_file('{HOME}/noor-system/.next/standalone/.next/BUILD_ID') ? trim(file_get_contents('{HOME}/noor-system/.next/standalone/.next/BUILD_ID')) : 'missing';
$before = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done", 25);
echo json_encode(['build'=>$build, 'before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""

START_STUB = f"""<?php
header('Content-Type: application/json');
$K = '{START_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
{PHP_SH}
$build = is_file('{HOME}/noor-system/.next/standalone/.next/BUILD_ID') ? trim(file_get_contents('{HOME}/noor-system/.next/standalone/.next/BUILD_ID')) : 'missing';
$st = sh("cd {HOME}/noor-system/.next/standalone && nohup node server.js > {HOME}/server-2194.log 2>&1 & echo started=\\$!");
echo json_encode(['build'=>$build, 'start'=>trim($st)]);
@unlink(__FILE__);
"""

for name, stub in [("diagkill2194.php", KILL_STUB), ("start2194.php", START_STUB)]:
    tmp = f"/tmp/{name}"
    with open(tmp, "w") as f:
        f.write(stub)
    if not save_file(name, tmp):
        sys.exit(f"{name} save failed")

print("DIAG+KILL:", hit(f"{BASE}/diagkill2194.php?k={KILL_TOKEN}", 60)[:500], flush=True)

ver = None
for i in range(12):
    time.sleep(10 if i < 6 else 20)
    try:
        h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
        mm = re.search(r'"version":"([^"]+)"', h)
        ver = mm.group(1) if mm else None
        print(f"health try {i + 1}: {h[:120]}", flush=True)
    except Exception as e:
        ver = None
        print(f"health try {i + 1}: {repr(e)[:90]}", flush=True)
    if ver == "2.19.4":
        print("HEALTH 2.19.4 OK", flush=True)
        break

if ver != "2.19.4":
    print("manual start fallback...", flush=True)
    print("START:", hit(f"{BASE}/start2194.php?k={START_TOKEN}", 60)[:400], flush=True)
    for i in range(9):
        time.sleep(15)
        try:
            h = hit(f"{BASE}/api/health/?adv2={i}{int(time.time())}", 45)
            mm = re.search(r'"version":"([^"]+)"', h)
            ver = mm.group(1) if mm else None
            print(f"health2 try {i + 1}: {h[:120]}", flush=True)
        except Exception as e:
            ver = None
            print(f"health2 try {i + 1}: {repr(e)[:90]}", flush=True)
        if ver == "2.19.4":
            print("HEALTH 2.19.4 OK (manual start)", flush=True)
            break

print("RESULT:", ver or "none", flush=True)
