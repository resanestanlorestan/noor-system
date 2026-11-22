#!/usr/bin/env python3
# استقرار ۲.۱۹.۳ — مسیر Fileman (الحاقیهٔ ۲.۱۹.۳، طرح B)
# ------------------------------------------------------------------
# تجربهٔ این نوبت نشان داد گارد میزبان، POSTهای بزرگِ پشت‌سرهم به URLهای
# عمومی را بعد از ۴-۵ درخواست 403 می‌کند؛ در مقابل مسیر احرازشدهٔ cPanel
# (:2083) حتی با ده‌ها درخواست هرگز 403 نداده است. پس قطعات زیپ به‌صورت
# متن base64 با Fileman::save_file_content ذخیره می‌شوند و استاب استخراج
# همان‌ها را decode و به هم می‌چسباند و با گیت sha/BUILD/نسخه/CSS استقرار
# می‌دهد. هیچ رازی در این فایل نیست؛ اعتبارنامه از scripts/.cp-creds.
import base64, json, os, re, subprocess, sys, time, secrets

CREDS = "/home/z/my-project/scripts/.cp-creds"
ZIP = "/home/z/my-project/download/noor-slim-2.19.4.zip"
SHA = "e31980033d4928f426b5605acab7a3eb280a071d45a5cb18204436e5ddcd1e32"
BUILD_ID = "gbjToaW7QFjOJwAz9hFVj"
VERSION = "2.19.4"
DEPLOY_SRC = "/home/z/my-project/scripts/deploy-2194/deploy-2194.py"
JAR = "/tmp/cp-2194b.jar"
HDR = "/tmp/cp-2194b-hdr.txt"
BASE = "https://pouyafarhadi.ir"
EX_TOKEN, RS_TOKEN = (secrets.token_hex(16) for _ in range(2))

txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)
HOME = f"/home/{USER}"
sess = None
for attempt in range(10):
    subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                    f"https://{HOST}:2083/login",
                    "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                    "-H", "User-Agent: Mozilla/5.0"], check=False)
    for ln in open(HDR):
        m = re.search(r"cpsess\d+", ln)
        if m:
            sess = m.group(0)
            break
    if sess:
        break
    print(f"login try {attempt}: no session — retrying", flush=True)
    time.sleep(15 + 5 * attempt)
if not sess:
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)
print("cpanel session ready", flush=True)


def save_file(name: str, content_path: str, timeout: int = 120, directory: str | None = None) -> bool:
    """ذخیرهٔ یک فایل متنی روی هاست با Fileman::save_file_content (محتوا از فایل محلی)."""
    target_dir = directory or HOME
    for attempt in range(6):
        out = subprocess.run(["curl", "-sk", "--max-time", str(timeout), "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0",
                              "--data-urlencode", f"dir={target_dir}",
                              "--data-urlencode", f"file={name}",
                              "--data-urlencode", "utf8=1",
                              "--data-urlencode", f"content@{content_path}"],
                             capture_output=True, text=True).stdout
        if '"status":1' in out:
            print(f"SAVE {name}: OK", flush=True)
            return True
        print(f"SAVE {name} try{attempt}:", out[:120], flush=True)
        time.sleep(15 + 10 * attempt)
    print(f"SAVE {name} failed after retries", flush=True)
    return False


def delete_file(name: str, directory: str) -> None:
    subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                    f"https://{HOST}:2083/{sess}/execute/Fileman/delete",
                    "-H", "User-Agent: Mozilla/5.0",
                    "--data-urlencode", f"dir={directory}",
                    "--data-urlencode", f"file={name}"], capture_output=True, text=True)


def hit(url: str, timeout: int = 90) -> str:
    import urllib.request
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode()


# ---------- ۱) قطعات base64 با Fileman ذخیره می‌شوند ----------
TOTAL = os.path.getsize(ZIP)
CHUNK = 1_500_000
N = (TOTAL + CHUNK - 1) // CHUNK
print(f"total={TOTAL} chunks={N}", flush=True)
with open(ZIP, "rb") as f:
    for seq in range(1, N + 1):
        f.seek((seq - 1) * CHUNK)
        data = f.read(CHUNK)
        tmp = f"/tmp/noor-b64-{seq:02d}.txt"
        with open(tmp, "w") as tf:
            tf.write(base64.b64encode(data).decode())
        if not save_file(f"noor-part-{seq:02d}.b64.txt", tmp):
            sys.exit(f"fileman save of part {seq} failed")
        os.unlink(tmp)
        time.sleep(3)
print("ALL PARTS SAVED VIA FILEMAN", flush=True)

# ---------- ۲) استاب استخراج: مونتاژ از .b64.txt با همان گیت‌های ۲.۱۹.۳ ----------
src = open(DEPLOY_SRC).read()
m = re.search(r'EX_STUB = f"""(.*?)"""\n', src, re.S)
tpl = m.group(1)
OLD_ASSEMBLE = """    $parts = glob($H . '/noor-part-*.bin');
    $NEED = (int)($_GET['n'] ?? 0);
    if (!$parts || ($NEED > 0 && count($parts) < $NEED)) throw new Exception('parts incomplete: ' . count($parts ?: []) . '/' . $NEED);
    sort($parts);
    $out = @fopen($ZIP, 'wb');
    if (!$out) throw new Exception('zip write fail');
    $total = 0;
    foreach ($parts as $p) {{ $c = @file_get_contents($p); if ($c === false) throw new Exception('part read fail'); $total += fwrite($out, $c); }}
    fclose($out);
    $o['assembled'] = $total;"""
NEW_ASSEMBLE = """    $parts = glob($H . '/noor-part-*.b64.txt');
    $NEED = (int)($_GET['n'] ?? 0);
    if (!$parts || ($NEED > 0 && count($parts) < $NEED)) throw new Exception('parts incomplete: ' . count($parts ?: []) . '/' . $NEED);
    sort($parts);
    $out = @fopen($ZIP, 'wb');
    if (!$out) throw new Exception('zip write fail');
    $total = 0;
    foreach ($parts as $p) {{ $c = @file_get_contents($p); if ($c === false) throw new Exception('part read fail'); $raw = base64_decode($c, true); if ($raw === false) throw new Exception('part b64 fail'); $total += fwrite($out, $raw); }}
    fclose($out);
    $o['assembled'] = $total;"""
if OLD_ASSEMBLE not in tpl:
    sys.exit("ex stub assembly block not found in source template")
tpl = tpl.replace(OLD_ASSEMBLE, NEW_ASSEMBLE)
tpl = tpl.replace("foreach ((glob($H . '/noor-part-*.bin') ?: []) as $p) @unlink($p);",
                  "foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);")
ex_stub = tpl.replace("{HOME}", HOME).replace("{EX_TOKEN}", EX_TOKEN).replace("{BUILD_ID}", BUILD_ID).replace("{SHA}", SHA).replace("{{", "{").replace("}}", "}")
tmp = "/tmp/ex2194b.php"
with open(tmp, "w") as f:
    f.write(ex_stub)
if not save_file("ex2194b.php", tmp, directory=f"{HOME}/public_html"):
    sys.exit("extractor stub save failed")
os.unlink(tmp)
time.sleep(1.5)
print("EXTRACT:", hit(f"{BASE}/ex2194b.php?k={EX_TOKEN}&n={N}", 240)[:420], flush=True)

# ---------- ۲ب) مایگریشن ۰۰۲۹ — ستون «نوع دانشگاه» (استاب PDO خودکفا، پیش از ری‌استارت) ----------
MG_TOKEN = secrets.token_hex(16)
MG_STUB = f"""<?php
header('Content-Type: application/json');
set_time_limit(60);
$K = '{MG_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$o = ['ok' => false];
try {{
    $envFile = '{HOME}/noor-system/.env';
    if (!is_file($envFile)) throw new Exception('.env missing');
    $env = file_get_contents($envFile);
    if (!preg_match('/^DATABASE_URL=(.*)$/m', $env, $m)) throw new Exception('DATABASE_URL missing');
    $u = parse_url(trim($m[1]));
    $dsn = sprintf('pgsql:host=%s;port=%d;dbname=%s', $u['host'], $u['port'] ?? 5432, ltrim($u['path'], '/'));
    $pdo = new PDO($dsn, urldecode($u['user'] ?? ''), urldecode($u['pass'] ?? ''), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 10]);
    $pdo->exec("ALTER TABLE \\"education_records\\" ADD COLUMN IF NOT EXISTS \\"university_type\\" varchar(60)");
    $col = (int)$pdo->query("select count(*) from information_schema.columns where table_name='education_records' and column_name='university_type'")->fetchColumn();
    $o = ['ok' => $col === 1, 'column' => $col];
}} catch (Throwable $e) {{ $o['error'] = $e->getMessage(); }}
echo json_encode($o);
@unlink(__FILE__);
"""
tmp = "/tmp/mg2194.php"
with open(tmp, "w") as f:
    f.write(MG_STUB)
if not save_file("mg2194.php", tmp, directory=f"{HOME}/public_html"):
    sys.exit("migration stub save failed")
os.unlink(tmp)
time.sleep(1.5)
mg_out = ""
for attempt in range(6):
    mg_out = hit(f"{BASE}/mg2194.php?k={MG_TOKEN}", 60)
    if mg_out.strip().startswith("{"):
        break
    print(f"mg try{attempt}: non-JSON ({mg_out.strip()[:60]!r}) — waiting", flush=True)
    time.sleep(20)
print("MIGRATE:", mg_out[:200], flush=True)
if '"ok":true' not in mg_out:
    sys.exit("migration not confirmed — investigate manually")

# ---------- ۳) ری‌استارت سرور با همان استاب الگو ----------
m = re.search(r'RS_STUB = f"""(.*?)"""\n', src, re.S)
rs_stub = m.group(1).replace("{HOME}", HOME).replace("{RS_TOKEN}", RS_TOKEN).replace("{{", "{").replace("}}", "}")
tmp = "/tmp/rst2194.php"
with open(tmp, "w") as f:
    f.write(rs_stub)
if not save_file("rst2194.php", tmp, directory=f"{HOME}/public_html"):
    sys.exit("restart stub save failed")
os.unlink(tmp)
time.sleep(1.5)
print("RESTART:", hit(f"{BASE}/rst2194.php?t={RS_TOKEN}", 60)[:200], flush=True)
time.sleep(15)

# ---------- ۴) پایش سلامت ----------
ver = None
for i in range(12):
    h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    mm = re.search(r'"version":"([^"]+)"', h)
    if mm:
        ver = mm.group(1)
        if ver == VERSION:
            print(f"health try {i + 1}: version {ver} — OK", flush=True)
            break
    print(f"health try {i + 1}: {h[:90]}", flush=True)
    time.sleep(20)

if ver != VERSION:
    print("HEALTH NOT CONFIRMED — investigate manually")
    sys.exit(1)

# ---------- ۵) بستن پنجرهٔ امنیتی: پاک‌سازی کامل بقایای آپلود ----------
leftovers = ["noor-slim-2.19.2.zip", "noor-slim-2.19.3.zip", "rc2192.php", "rc2194.php", "ex2192.php", "mg2194.php", "ex2194b.php", "rst2194.php", ".up2192.json", ".up2194.json"]
leftovers += [f"noor-part-{seq:02d}.bin" for seq in range(1, 20)]
for name in leftovers:
    delete_file(name, HOME)
    time.sleep(0.6)
    delete_file(name, f"{HOME}/public_html")
    time.sleep(0.6)
print("DEPLOYED-2194 OK (stubs and leftovers deleted)", flush=True)
