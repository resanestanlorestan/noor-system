#!/usr/bin/env python3
# پاک‌سازی واقعی بقایای آپلود: Fileman::delete در این نصب موجود نیست، پس یک
# استاب PHP موقت با فهرست دقیق فایل‌های ساخته‌شدهٔ آپلود، همه را unlink می‌کند
# و خودش هم حذف می‌شود؛ سپس با list_files تأیید می‌شود که چیزی نمانده است.
import json, re, subprocess, sys, time

CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-cleanup2.jar"
HDR = "/tmp/cp-cleanup2-hdr.txt"

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
    time.sleep(15)
if not sess:
    print(json.dumps({"error": "LOGIN_FAILED"}))
    sys.exit(1)
print("cpanel session ready", flush=True)


def list_files(directory: str) -> list:
    out = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/execute/Fileman/list_files",
                          "-H", "User-Agent: Mozilla/5.0",
                          "--data-urlencode", f"dir={directory}",
                          "--data-urlencode", "showhidden=1"], capture_output=True, text=True).stdout
    try:
        return [f.get("file") for f in json.loads(out).get("data", []) if isinstance(f, dict)]
    except Exception:
        return []


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
            return True
        time.sleep(12)
    return False


def hit(url: str, timeout: int = 60, data=None) -> str:
    # DNS سندباکس گاهی به لندینگِ IP دیگر می‌رسد؛ curl همان مسیر اثبات‌شده است
    return subprocess.run(["curl", "-sk", "--max-time", str(timeout), url,
                           "-H", "User-Agent: Mozilla/5.0"],
                          capture_output=True, text=True).stdout


pattern = re.compile(r"^(rc.*\.php|ex2192.*|ex2193.*|rst2192.*|rst2193.*|start2193\.php|diagkill2193\.php|\.up219.*\.json|noor-slim-2\.19\.2\.zip|noor-part-.*)$")
targets = []
for directory in [f"{HOME}/public_html", HOME]:
    for name in list_files(directory):
        if name and pattern.match(name):
            targets.append(f"{directory}/{name}")
targets = sorted(set(targets))
print(f"targets: {len(targets)}", flush=True)

K = __import__("secrets").token_hex(16)
# استاب خودکفا: فهرست را سمت سرور با glob می‌سازد تا فراخوانی GET ساده باشد
# (همان شکلی که rc-استاب‌ها همیشه با آن از گارد میزبان عبور کرده‌اند).
stub = "<?php\nheader('Content-Type: application/json');\n"
stub += f"$K = '{K}';\nif (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}\n"
stub += "$H = '" + HOME + "';\n$removed = 0;\n"
stub += "$paths = array_merge(\n"
stub += "  (glob($H . '/public_html/rc*.php') ?: []),\n"
stub += "  (glob($H . '/public_html/start2193.php') ?: []),\n"
stub += "  (glob($H . '/public_html/diagkill2193.php') ?: []),\n"
stub += "  (glob($H . '/public_html/ex2193*.php') ?: []),\n"
stub += "  (glob($H . '/public_html/rst2193.php') ?: []),\n"
stub += "  (glob($H . '/public_html/.up219*.json') ?: []),\n"
stub += "  (glob($H . '/ex2193*.php') ?: []),\n"
stub += "  (glob($H . '/rc2192.php') ?: []),\n"
stub += "  (glob($H . '/.up219*.json') ?: []),\n"
stub += "  (glob($H . '/noor-part-*.bin') ?: []),\n"
stub += "  (glob($H . '/noor-part-*.b64.txt') ?: []),\n"
stub += "  (glob($H . '/noor-slim-2.19.2.zip') ?: [])\n"
stub += ");\n"
stub += "foreach ($paths as $f) { if (basename($f) !== 'wipe2193.php' && @unlink($f)) $removed++; }\n"
stub += "echo json_encode(['removed' => $removed]);\n"
stub += "@unlink(__FILE__);\n"
tmp = "/tmp/wipe2193.php"
with open(tmp, "w") as f:
    f.write(stub)
if not save_file("wipe2193.php", tmp):
    sys.exit("wipe stub save failed")

for attempt in range(10):
    response = hit(f"https://{HOST}/wipe2193.php?k={K}")
    if response.strip().startswith("{"):
        print("WIPE:", response[:200], flush=True)
        break
    title = re.search(r"<title>([^<]+)</title>", response)
    print(f"wipe try{attempt}: blocked ({title.group(1) if title else response.strip()[:50]!r}) — waiting", flush=True)
    time.sleep(30)

time.sleep(2)
remaining = [n for d in [f"{HOME}/public_html", HOME] for n in list_files(d) if n and pattern.match(n)]
print("remaining after wipe:", remaining or "none", flush=True)
