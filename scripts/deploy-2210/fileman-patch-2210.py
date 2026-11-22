#!/usr/bin/env python3
# استقرار پچی ۲.۲۱.۰ روی سهمیهٔ تنگ — الگوی fileman-deploy-2210 با تغییرات:
# ۱) حذف ۲۰ قطعهٔ قدیمیِ تلاش کامل (آزادسازی ~۴۰MB) پیش از آپلود پچ
# ۲) پچ ۹۲۵KB/۲۶۲مدخل (فقط تفاوت md5 با هاست) — بدون scripts/** و server.js ریشه
# ۳) استاب PHP: اسمبل با حذف هر قطعه بلافاصله بعد از decode (سقف حافظهٔ دیسک پایین)
# ۴) گیت‌ها: sha256 پچ / BUILD_ID / نسخهٔ 2.21.0 در هر دو package.json / CSS list-remove /
#    اکشن‌های حذف / گارد فایل محافظت‌شده / بکاپ کانفیگ
# ۵) پاک‌سازی: قطعات قدیمی+جدید، زیپ پچ، استاب‌ها، scripts/.cp-creds روی هاست
import base64, json, re, secrets, subprocess, sys, time, urllib.request

CREDS = "/home/z/my-project/scripts/.cp-creds"
PATCH = "/home/z/my-project/download/noor-patch-2210.zip"
PATCH_SHA = "e240c08d0680031b3947f591c241a154efdfb804041d8f5d9a372620942c4f7f"
BUILD_ID = "6F8WtPjSkacCJj0qsRpZr"
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
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)
print("cpanel session ready", flush=True)


def save_file(name: str, content_path: str, directory: str, timeout: int = 120) -> bool:
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


def delete_file(name: str, directory: str) -> None:
    subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                    f"https://{HOST}:2083/{sess}/execute/Fileman/delete",
                    "-H", "User-Agent: Mozilla/5.0",
                    "--data-urlencode", f"dir={directory}",
                    "--data-urlencode", f"file={name}"], capture_output=True, text=True)


def hit(url: str, timeout: int = 240) -> str:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
                                timeout=timeout) as r:
        return r.read().decode()


# ---------- ۱) حذف قطعات قدیمی تلاش کامل (آزادسازی سهمیه) ----------
for seq in range(1, 28):
    delete_file(f"noor-part-{seq:02d}.b64.txt", HOME)
print("old parts deleted (1..27)", flush=True)

# ---------- ۲) استاب استخراج پچ ----------
EX_TOKEN, RS_TOKEN = (secrets.token_hex(16) for _ in range(2))
STUB = f"""<?php
// استاب پچ ۲.۲۱.۰ — اسمبل قطعات با حذف فوری هر قطعه، گیت sha/BUILD_ID/نسخه/CSS/اکشن‌ها،
// بکاپ کانفیگ، اکسترکت overlay، وریفای روی دیسک، پاک‌سازی کامل؛ خودحذف.
header('Content-Type: application/json');
set_time_limit(300);
$K = '{EX_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$H = '{HOME}';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-patch-2210.zip';
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
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    $bk = $H . '/bk-2210';
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
    $css = (string)$zip->getFromName('noor-system/src/app/workspace.css');
    $o['css_list_remove'] = strpos($css, 'list-remove') !== false;
    $o['css_navy_sidebar'] = strpos($css, '0e2148') !== false;
    $acts = (string)$zip->getFromName('noor-system/src/app/actions/management.ts');
    $o['delete_actions'] = strpos($acts, 'deleteCountyAction') !== false && strpos($acts, 'deleteSpecialtyAction') !== false && strpos($acts, 'deleteOrganizationAction') !== false;
    $bid = (string)$zip->getFromName('noor-system/.next/standalone/.next/BUILD_ID');
    $o['zip_build_id'] = trim($bid) === '{BUILD_ID}';
    $sp = json_decode((string)$zip->getFromName('noor-system/.next/standalone/package.json'), true);
    $o['zip_standalone_version'] = is_array($sp) ? ($sp['version'] ?? '?') : '?';
    $tp = json_decode((string)$zip->getFromName('noor-system/package.json'), true);
    $o['zip_top_version'] = is_array($tp) ? ($tp['version'] ?? '?') : '?';
    $gate = $o['css_list_remove'] && $o['css_navy_sidebar'] && $o['delete_actions'] && $o['zip_build_id'] && $o['zip_standalone_version'] === '2.21.0' && $o['zip_top_version'] === '2.21.0';
    if (!$gate) throw new Exception('patch gate fail');
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    $o['disk_build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $tpd = json_decode((string)@file_get_contents($APP . '/package.json'), true);
    $o['disk_top_version'] = is_array($tpd) ? ($tpd['version'] ?? '?') : '?';
    $spd = json_decode((string)@file_get_contents($APP . '/.next/standalone/package.json'), true);
    $o['disk_standalone_version'] = is_array($spd) ? ($spd['version'] ?? '?') : '?';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $o['classes_lib'] = is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no';
    $o['classes_page'] = is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no';
    $o['disk_mgmt_actions'] = strpos((string)@file_get_contents($APP . '/src/app/actions/management.ts'), 'deleteCountyAction') !== false;
    $o['creds_removed'] = !is_file($APP . '/scripts/.cp-creds');
    $o['ok'] = ($o['disk_build_id'] === '{BUILD_ID}' && $o['disk_top_version'] === '2.21.0'
        && $o['disk_standalone_version'] === '2.21.0' && $o['env_intact'] > 0
        && $o['classes_lib'] === 'yes' && $o['classes_page'] === 'yes' && $o['disk_mgmt_actions'] && $o['creds_removed']);
}} catch (Throwable $e) {{ $o['error'] = $e->getMessage(); }}
if (!empty($o['ok'])) {{
    foreach ((glob($H . '/noor-patch-part-*.b64.txt') ?: []) as $p) @unlink($p);
    foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);
    @unlink($ZIP);
    @unlink('{HOME}/public_html/.up2210.json');
    @unlink($APP . '/scripts/.cp-creds');
}}
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
tmp = "/tmp/ex2210p.php"
open(tmp, "w").write(STUB)
if not save_file("ex2210p.php", tmp, f"{HOME}/public_html"):
    sys.exit("patch stub save failed")
import os
os.unlink(tmp)
time.sleep(1.5)

# ---------- ۳) آپلود قطعات پچ (الگوی نام متفاوت) ----------
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

# ---------- ۴) استخراج با گیت‌ها ----------
res = hit(f"{BASE}/ex2210p.php?k={EX_TOKEN}&n={N}")
print("EXTRACT:", res[:600], flush=True)
try:
    o = json.loads(res)
except Exception:
    sys.exit("EXTRACT_BAD_JSON")
if not o.get("ok"):
    sys.exit("EXTRACT_GATE_FAIL")

# ---------- ۵) ری‌استارت ----------
RS_STUB = f"""<?php
header('Content-Type: application/json');
$T = '{RS_TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t=15){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}
$before = sh("for p in /proc/[0-9]*/; do c=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$c\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done | head -4");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${{p}}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
echo json_encode(['before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""
tmp = "/tmp/rst2210.php"
open(tmp, "w").write(RS_STUB)
if not save_file("rst2210.php", tmp, f"{HOME}/public_html"):
    sys.exit("restart stub save failed")
os.unlink(tmp)
time.sleep(1.5)
print("RESTART:", hit(f"{BASE}/rst2210.php?t={RS_TOKEN}", 60)[:200], flush=True)
time.sleep(15)

# ---------- ۶) پایش سلامت ----------
ver = None
for i in range(12):
    try:
        h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    except Exception as e:
        h = f"ERR {e}"
    mm = re.search(r'"version":"([^"]+)"', h)
    print(f"health try {i + 1}: {h[:90]}", flush=True)
    if mm and mm.group(1) == "2.21.0" and '"ok":true' in h:
        ver = "2.21.0"
        break
    time.sleep(15)

# ---------- ۷) وریفای صفحات + خلاصه ----------
pages = {}
for path in ["/login", "/", "/api/health/"]:
    code = subprocess.run(["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}",
                           "--max-time", "30", BASE + path],
                          capture_output=True, text=True).stdout
    pages[path] = code
print(json.dumps({"health_version": ver, "pages": pages}, indent=1))
sys.exit(0 if ver == "2.21.0" and pages.get("/login") == "200" else 1)
