#!/usr/bin/env python3
# ری‌استارت و پاک‌سازی ۲.۱۸.۶ — الگوی restart2185.py:
# نوشتن استاب kill-next-server با نشست cPanel → فراخوانی عمومی (خودحذف) →
# poll سلامت تا 2.18.7 → حذف گیرندهٔ آپلود و وضعیت آن (بستن پنجرهٔ امنیتی).
import json, re, secrets, subprocess, sys, time

txt = open("/home/z/my-project/scripts/.cp-creds").read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)
JAR = "/tmp/cp-2186.jar"
HDR = "/tmp/cp-2186-hdr.txt"
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

def uapi(path):
    return subprocess.run(["curl", "-sk", "--max-time", "90", "-b", JAR,
                           f"https://{HOST}:2083/{sess}/execute/{path}",
                           "-H", "User-Agent: Mozilla/5.0"], capture_output=True, text=True).stdout

STUB = """<?php
header('Content-Type: application/json');
$T = '__TOKEN__';
if (!hash_equals($T, $_GET['t'] ?? '')) { http_response_code(403); exit; }
function sh($c, $t=15){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }
$before = sh("for p in /proc/[0-9]*/; do c=\\$(readlink \\${p}cwd 2>/dev/null); case \\\"\\$c\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${p}comm 2>/dev/null)\\\";; esac; done | head -4");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${p}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${p}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
echo json_encode(['before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""
STUB = STUB.replace("__TOKEN__", TOKEN)

out = subprocess.run(["curl", "-sk", "--max-time", "90", "-b", JAR,
                      f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                      "-H", "User-Agent: Mozilla/5.0",
                      "--data-urlencode", "dir=/home/epqoisdl/public_html",
                      "--data-urlencode", "file=rst2186.php",
                      "--data-urlencode", "utf8=1",
                      "--data-urlencode", f"content={STUB}"],
                     capture_output=True, text=True).stdout
print("SAVE rst2186:", "OK" if '"status":1' in out else out[:150])
time.sleep(1.5)

r = subprocess.run(["curl", "-sk", "--max-time", "60", "-H", "User-Agent: Mozilla/5.0",
                    f"https://pouyafarhadi.ir/rst2186.php?t={TOKEN}"],
                   capture_output=True, text=True).stdout
print("RESTART CALL:", r[:280])
time.sleep(20)
ver = None
for i in range(10):
    h = subprocess.run(["curl", "-sk", "--max-time", "45", "-H", "User-Agent: Mozilla/5.0",
                        f"https://pouyafarhadi.ir/api/health/?adv={i}{int(time.time())}"],
                       capture_output=True, text=True).stdout
    print(f"health try {i+1}: {h[:70]}")
    if "2.18.7" in h:
        ver = "2.18.7"
        print("DEPLOYED-2186 OK")
        break
    time.sleep(25)

# پاک‌سازی: گیرندهٔ آپلود، وضعیتش و استاب‌های مایگریشن حذف شوند (بستن پنجرهٔ امنیتی)
for f in ["rc2187.php", ".up2187.json", ".x2187.json", "mg2187.php", "mg2187s.php"]:
    d = uapi(f"Fileman/delete_file?path=/home/epqoisdl/public_html/{f}")
    print(f"delete {f}:", "OK" if '"status":1' in d else d[:120])

sys.exit(0 if ver == "2.18.7" else 2)
