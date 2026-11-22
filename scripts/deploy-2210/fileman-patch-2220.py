#!/usr/bin/env python3
# استقرار پچی ۲.۲۲.۰ — همان خط لولهٔ پچی ۲.۲۱.۰ (سهمیهٔ تنگ دیسک) با درس‌های ثبت‌شده:
# حذف .cp-creds و پاک‌سازی بی‌قیدوشرط بعد از وریفای (بدون وابستگی دایره‌ای ok)،
# گیت‌های مخصوص این الحاقیه: settings بدون OrganizationForm + مرحلهٔ ۲ با آن + BUILD_ID تازه.
import base64, json, os, re, secrets, subprocess, sys, time, urllib.request

CREDS = "/home/z/my-project/scripts/.cp-creds"
PATCH = "/home/z/my-project/download/noor-patch-2220.zip"
PATCH_SHA = "d3d88004d091874a110ef9c700e04186e637cc7c32031bb44d82baa1e1a5ff1f"
BUILD_ID = "nZBO_uO79Knt3IeN3db14"
VERSION = "2.22.0"
JAR = "/tmp/cp-2220.jar"
HDR = "/tmp/cp-2220-hdr.txt"
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
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)
print("cpanel session ready", flush=True)


def save_file(name, content_path, directory, timeout=120):
    for attempt in range(5):
        out = subprocess.run(["curl", "-sk", "--max-time", str(timeout), "-b", JAR,
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
        print(f"SAVE {name} try{attempt}:", out[:110], flush=True)
        time.sleep(10 + 5 * attempt)
    return False


def hit(url, timeout=240):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
                                timeout=timeout) as r:
        return r.read().decode()


EX_TOKEN, RS_TOKEN = (secrets.token_hex(16) for _ in range(2))
STUB = f"""<?php
// استاب پچ ۲.۲۲.۰ — اسمبل قطعه با حذف فوری، گیت sha/BUILD_ID/نسخهٔ دوگانه/
// انتقال فرم سازمان (settings بدون فرم، مرحلهٔ ۲ با فرم)، گارد فایل محافظت‌شده،
// بکاپ کانفیگ، اکسترکت overlay، وریفای روی دیسک، پاک‌سازی بی‌قیدوشرط؛ خودحذف.
header('Content-Type: application/json');
set_time_limit(300);
$K = '{EX_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$H = '{HOME}';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-patch-2220.zip';
$EXPECT = '{PATCH_SHA}';
$o = ['ok' => false];
try {{
    $parts = glob($H . '/noor-patch-part-*.b64.txt');
    $NEED = (int)($_GET['n'] ?? 0);
    if (!$parts || ($NEED > 0 && count($parts) < $NEED)) throw new Exception('parts incomplete: ' . count($parts ?: []) . '/' . $NEED);
    sort($parts);
    $out = @fopen($ZIP, 'wb');
    if (!$out) throw new Exception('zip write fail');
    foreach ($parts as $p) {{ $c = @file_get_contents($p); if ($c === false) throw new Exception('part read fail'); $raw = base64_decode($c, true); if ($raw === false) throw new Exception('part b64 fail'); fwrite($out, $raw); @unlink($p); }}
    fclose($out);
    foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);
    @unlink($H . '/noor-patch-2210.zip');
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    $bk = $H . '/bk-2220';
    if (!is_dir($bk)) @mkdir($bk, 0700, true);
    foreach (['.env', 'server.js', 'package.json'] as $f) if (is_file($APP . '/' . $f)) @copy($APP . '/' . $f, $bk . '/' . $f);
    $o['backup_ok'] = is_file($bk . '/.env') && is_file($bk . '/server.js');
    $zip = new ZipArchive();
    if ($zip->open($ZIP) !== true) throw new Exception('zip open fail');
    for ($i = 0; $i < $zip->numFiles; $i++) {{
        $b = basename($zip->getNameIndex($i));
        if ($b === '.htaccess' || $b === '.env' || $b === '.cp-creds') throw new Exception('protected file inside patch');
    }}
    $o['entries'] = $zip->numFiles;
    $sp = (string)$zip->getFromName('noor-system/src/app/(workspace)/settings/page.tsx');
    $st = (string)$zip->getFromName('noor-system/src/app/(workspace)/cases/[id]/steps/[step]/page.tsx');
    $o['settings_no_form'] = strpos($sp, 'OrganizationForm') === false;
    $o['settings_has_hint'] = strpos($sp, 'از مرحلهٔ ۲ ویزارد') !== false;
    $o['step_has_form'] = strpos($st, 'OrganizationForm') !== false && strpos($st, 'canRefs') !== false;
    $bid = (string)$zip->getFromName('noor-system/.next/standalone/.next/BUILD_ID');
    $o['zip_build_id'] = trim($bid) === '{BUILD_ID}';
    $spj = json_decode((string)$zip->getFromName('noor-system/.next/standalone/package.json'), true);
    $o['zip_standalone_version'] = is_array($spj) ? ($spj['version'] ?? '?') : '?';
    $tpj = json_decode((string)$zip->getFromName('noor-system/package.json'), true);
    $o['zip_top_version'] = is_array($tpj) ? ($tpj['version'] ?? '?') : '?';
    $gate = $o['settings_no_form'] && $o['settings_has_hint'] && $o['step_has_form'] && $o['zip_build_id'] && $o['zip_standalone_version'] === '{VERSION}' && $o['zip_top_version'] === '{VERSION}';
    if (!$gate) throw new Exception('patch gate fail');
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    $o['disk_build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $td = json_decode((string)@file_get_contents($APP . '/package.json'), true);
    $o['disk_top_version'] = is_array($td) ? ($td['version'] ?? '?') : '?';
    $sd = json_decode((string)@file_get_contents($APP . '/.next/standalone/package.json'), true);
    $o['disk_standalone_version'] = is_array($sd) ? ($sd['version'] ?? '?') : '?';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $o['disk_settings_no_form'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/settings/page.tsx'), 'OrganizationForm') === false;
    $o['disk_step_has_form'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/cases/[id]/steps/[step]/page.tsx'), 'OrganizationForm') !== false;
    $o['classes_lib'] = is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no';
    $o['classes_page'] = is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['disk_build_id'] === '{BUILD_ID}' && $o['disk_top_version'] === '{VERSION}'
        && $o['disk_standalone_version'] === '{VERSION}' && $o['env_intact'] > 0
        && $o['disk_settings_no_form'] && $o['disk_step_has_form']
        && $o['classes_lib'] === 'yes' && $o['classes_page'] === 'yes');
}} catch (Throwable $e) {{ $o['error'] = $e->getMessage(); }}
// پاک‌سازی بی‌قیدوشرط بعد از تلاش (درس ۲.۲۱.۰: هیچ چکِ به نتیجهٔ پاک‌سازی وابسته نیست)
foreach ((glob($H . '/noor-patch-part-*.b64.txt') ?: []) as $p) @unlink($p);
foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);
if (!empty($o['ok'])) @unlink($ZIP);
@unlink($APP . '/scripts/.cp-creds');
$o['creds_gone'] = !is_file($APP . '/scripts/.cp-creds');
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
tmp = "/tmp/ex2220p.php"
open(tmp, "w").write(STUB)
if not save_file("ex2220p.php", tmp, f"{HOME}/public_html"):
    sys.exit("patch stub save failed")
os.unlink(tmp)
time.sleep(1.5)

data = open(PATCH, "rb").read()
CHUNK = 1_500_000
N = (len(data) + CHUNK - 1) // CHUNK
print(f"patch_bytes={len(data)} chunks={N}", flush=True)
for seq in range(1, N + 1):
    part = data[(seq - 1) * CHUNK: seq * CHUNK]
    tmp = f"/tmp/noor-patch-part-{seq:02d}.b64"
    open(tmp, "w").write(base64.b64encode(part).decode())
    if not save_file(f"noor-patch-part-{seq:02d}.b64.txt", tmp, HOME):
        sys.exit(f"patch part {seq} save failed")
    os.unlink(tmp)
    time.sleep(2)

res = hit(f"{BASE}/ex2220p.php?k={EX_TOKEN}&n={N}")
print("EXTRACT:", res[:700], flush=True)
try:
    o = json.loads(res)
except Exception:
    sys.exit("EXTRACT_BAD_JSON")
if not o.get("ok"):
    sys.exit("EXTRACT_GATE_FAIL")

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
tmp = "/tmp/rst2220.php"
open(tmp, "w").write(RS)
if not save_file("rst2220.php", tmp, f"{HOME}/public_html"):
    sys.exit("restart stub save failed")
os.unlink(tmp)
time.sleep(1.5)
print("RESTART:", hit(f"{BASE}/rst2220.php?t={RS_TOKEN}", 60)[:200], flush=True)
time.sleep(15)

ver = None
for i in range(12):
    try:
        h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    except Exception as e:
        h = f"ERR {e}"
    print(f"health try {i + 1}: {h[:90]}", flush=True)
    if f'"version":"{VERSION}"' in h and '"ok":true' in h:
        ver = VERSION
        break
    time.sleep(15)

pages = {}
for path in ["/login", "/", "/settings", "/api/health/"]:
    code = subprocess.run(["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}",
                           "--max-time", "30", BASE + path],
                          capture_output=True, text=True).stdout
    pages[path] = code
print(json.dumps({"health_version": ver, "pages": pages}, indent=1))
sys.exit(0 if ver == VERSION and pages.get("/login") == "200" else 1)
