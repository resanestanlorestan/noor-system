#!/usr/bin/env python3
# استقرار ۲.۱۹.۱ — الگوی کامل ۲.۱۹.۰ در یک اسکریپت:
# گیرندهٔ توکن‌دار تکه‌ها → آپلود ۱.۵MBای با ادامه از نقطهٔ قطع → استخراج
# sha/BUILD/نسخه-gated با بکاپ کانفیگ و گارد فایل‌های محافظت‌شده → ری‌استارت
# next-server → poll سلامت تا 2.19.2 → حذف گیرنده/وضعیت/زیپ (بستن پنجرهٔ امنیتی).
import base64, json, os, re, secrets, subprocess, sys, time

ZIP = "/home/z/my-project/download/noor-slim-2.19.2.zip"
SHA = "75d952874a5d5d1bd13a567fd0a57dfab0d01640f3a1009eca32b0fdccca151d"
BUILD_ID = "3bwm0uPswTiihzBXV5tBC"
CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-2192.jar"
HDR = "/tmp/cp-2192-hdr.txt"
HOME = None
RC_TOKEN, EX_TOKEN, RS_TOKEN = (secrets.token_hex(16) for _ in range(3))

txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)
HOME = f"/home/{USER}"
BASE = "https://pouyafarhadi.ir"

subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                f"https://{HOST}:2083/login",
                "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                "-H", "User-Agent: Mozilla/5.0"], check=False)
sess = None
for ln in open(HDR):
    m = re.search(r"cpsess\d+", ln)
    if m:
        sess = m.group(0)
        break
if not sess:
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)
print("cpanel session ready")


def save_stub(name, content):
    out = subprocess.run(["curl", "-sk", "--max-time", "90", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                          "-H", "User-Agent: Mozilla/5.0",
                          "--data-urlencode", f"dir={HOME}/public_html",
                          "--data-urlencode", f"file={name}",
                          "--data-urlencode", "utf8=1",
                          "--data-urlencode", f"content={content}"],
                         capture_output=True, text=True).stdout
    print(f"SAVE {name}:", "OK" if '"status":1' in out else out[:150])
    return '"status":1' in out


def hit(url, timeout=90):
    return subprocess.run(["curl", "-sk", "--max-time", str(timeout), "-H", "User-Agent: Mozilla/5.0", url],
                          capture_output=True, text=True).stdout


RC_STUB = f"""<?php
// گیرندهٔ تکه‌های zip ۲.۱۹.۱ — الگوی rc2190.php + گیت توکن (k=)؛ خودحذف پس از استقرار.
header('Content-Type: application/json');
$K = '{RC_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); echo '{{"error":"bad token"}}'; exit; }}
$T = '{HOME}/noor-slim-2.19.2.zip';
$S = '{HOME}/public_html/.up2192.json';
$state = @file_exists($S) ? json_decode(@file_get_contents($S), true) : ['received' => 0, 'bytes' => 0];
if (isset($_GET['status'])) {{ echo json_encode($state); exit; }}
if (isset($_GET['reset'])) {{ @unlink($T); @unlink($S); echo '{{"reset":true}}'; exit; }}
$in = json_decode(@file_get_contents('php://input'), true);
if (!$in || !isset($in['seq'], $in['b64'])) {{ echo json_encode(['error' => 'bad body']); exit; }}
$raw = base64_decode($in['b64'], true);
if ($raw === false) {{ echo json_encode(['error' => 'bad b64', 'seq' => $in['seq']]); exit; }}
if ((int)$in['seq'] !== (int)($state['received'] ?? 0) + 1) {{ echo json_encode(['error' => 'seq out of order', 'expected' => ($state['received'] ?? 0) + 1, 'got' => $in['seq']]); exit; }}
$ok = @file_put_contents($T, $raw, FILE_APPEND);
if ($ok === false) {{ echo json_encode(['error' => 'write failed', 'seq' => $in['seq']]); exit; }}
$state['received'] = (int)$in['seq'];
$state['bytes'] = (int)$state['bytes'] + strlen($raw);
@file_put_contents($S, json_encode($state));
echo json_encode($state);
"""

EX_STUB = f"""<?php
// استاب استخراج ۲.۱۹.۱ — گیت sha256/BUILD_ID/نسخه + گارد فایل محافظت‌شده + بکاپ کانفیگ
// + وریفای قاعدهٔ تازهٔ CSS (edu-tab) و فایل‌های کلاس‌ها؛ خودحذف. مایگریشنی ندارد (CSS-only).
header('Content-Type: application/json');
set_time_limit(300);
$H = '{HOME}';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-slim-2.19.2.zip';
$EXPECT = '{SHA}';
$o = ['ok' => false];
function rd($p) {{ $h = fopen($p, 'rb'); $s = ''; while (!feof($h)) {{ $s .= fread($h, 65536); }} fclose($h); return $s; }}
try {{
    if (!is_file($ZIP)) throw new Exception('zip missing');
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    $bk = $H . '/bk-2192';
    if (!is_dir($bk)) @mkdir($bk, 0700, true);
    foreach (['.env', 'server.js', 'package.json'] as $f) if (is_file($APP . '/' . $f)) @copy($APP . '/' . $f, $bk . '/' . $f);
    $o['backup_ok'] = is_file($bk . '/.env') && is_file($bk . '/server.js');
    $zip = new ZipArchive();
    if ($zip->open($ZIP) !== true) throw new Exception('zip open fail');
    for ($i = 0; $i < $zip->numFiles; $i++) {{
        $b = basename($zip->getNameIndex($i));
        if ($b === '.htaccess' || $b === '.env') throw new Exception('protected file inside zip');
    }}
    $o['entries'] = $zip->numFiles;
    $css = (string)$zip->getFromName('noor-system/src/app/workspace.css');
    $o['css_has_actions'] = strpos($css, 'edu-tab') !== false;
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    $o['build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $pkg = json_decode(rd($APP . '/package.json'), true);
    $o['pkg_version'] = is_array($pkg) ? ($pkg['version'] ?? '?') : 'parse-fail';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $o['classes_lib'] = is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no';
    $o['classes_page'] = is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['build_id'] === '{BUILD_ID}' && $o['pkg_version'] === '2.19.2' && $o['env_intact'] > 0
        && $o['classes_lib'] === 'yes' && $o['classes_page'] === 'yes' && $o['css_has_actions']);
}} catch (Throwable $e) {{ $o['error'] = $e->getMessage(); }}
if (!empty($o['ok'])) {{ @unlink($ZIP); @unlink('{HOME}/public_html/.up2192.json'); }}
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""

RS_STUB = f"""<?php
// استاب ری‌استارت ۲.۱۹.۱ — الگوی rst2190؛ خودحذف.
header('Content-Type: application/json');
$T = '{RS_TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t=15){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}
$before = sh("for p in /proc/[0-9]*/; do c=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$c\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done | head -4");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${{p}}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
echo json_encode(['before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""

TOTAL = os.path.getsize(ZIP)
CHUNK = 1_500_000
N = (TOTAL + CHUNK - 1) // CHUNK
print(f"total={TOTAL} chunks={N}")

if not save_stub("rc2192.php", RC_STUB):
    sys.exit("receiver stub save failed")
time.sleep(1.5)


def call_rc(suffix="", body=None, timeout=90):
    sep = "&" if "?" in suffix else "?"
    url = f"{BASE}/rc2192.php{suffix}{sep}k={RC_TOKEN}"
    data = None
    headers = {"User-Agent": "Mozilla/5.0"}
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = __import__("urllib.request", fromlist=["Request"]).Request(url, data=data, headers=headers)
    with __import__("urllib.request", fromlist=["urlopen"]).urlopen(req, timeout=timeout) as r:
        return r.read().decode()


for attempt in range(10):
    try:
        st = call_rc("?reset")
        break
    except Exception as e:
        print(f"reset try{attempt}: {repr(e)[:80]}")
        time.sleep(20)
else:
    sys.exit("receiver unreachable")
print("reset:", st)
time.sleep(2)

with open(ZIP, "rb") as f:
    for seq in range(1, N + 1):
        f.seek((seq - 1) * CHUNK)
        data = f.read(CHUNK)
        body = {"seq": seq, "b64": base64.b64encode(data).decode()}
        ok = False
        for attempt in range(4):
            try:
                res = json.loads(call_rc("", body, timeout=120))
                if res.get("received") == seq:
                    print(f"chunk {seq}/{N} ok")
                    ok = True
                    break
                print(f"chunk {seq} try{attempt}: {res}")
            except Exception as e:
                print(f"chunk {seq} try{attempt}: {repr(e)[:90]}")
            time.sleep(8)
        if not ok:
            sys.exit(f"chunk {seq} failed — rerun script to resume")
print("ALL CHUNKS UPLOADED")

if not save_stub("ex2192.php", EX_STUB):
    sys.exit("extractor stub save failed")
time.sleep(1.5)
print("EXTRACT:", hit(f"{BASE}/ex2192.php?k={EX_TOKEN}", 240)[:420])

if not save_stub("rst2192.php", RS_STUB):
    sys.exit("restart stub save failed")
time.sleep(1.5)
print("RESTART:", hit(f"{BASE}/rst2192.php?t={RS_TOKEN}", 60)[:200])
time.sleep(15)

ver = None
for i in range(12):
    h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    m = re.search(r'"version":"([^"]+)"', h)
    if m:
        ver = m.group(1)
        if ver == "2.19.2":
            print(f"health try {i + 1}: version {ver} — OK")
            break
    print(f"health try {i + 1}: {h[:90]}")
    time.sleep(20)

if ver == "2.19.2":
    # بستن پنجرهٔ امنیتی: حذف گیرندهٔ آپلود و وضعیت آن
    subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                    f"https://{HOST}:2083/{sess}/execute/Fileman/delete",
                    "-H", "User-Agent: Mozilla/5.0",
                    "--data-urlencode", f"dir={HOME}/public_html",
                    "--data-urlencode", "file=rc2192.php"], capture_output=True, text=True)
    print("DEPLOYED-2192 OK (receiver deleted)")
else:
    print("HEALTH NOT CONFIRMED — investigate manually")
    sys.exit(1)
