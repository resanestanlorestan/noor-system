#!/usr/bin/env python3
# خنثی‌سازی بقایای آپلود ۲.۱۹.۳ — حذف فیزیکی با هیچ APIای از این نصب ممکن
# نیست (Fileman::delete/fmdelfile در UAPI و API2 هر دو غایب‌اند)، پس هر فایل
# باقی‌مانده با محتوای صفر بازنویسی می‌شود: استاب‌های PHP به فایل مردهٔ
# بی‌عملکرد و زیپ/قطعات نیمه‌کاره به فایل خالی تبدیل می‌شوند — پنجرهٔ
# امنیتی بسته و دیسک آزاد می‌شود؛ وریفای با اندازهٔ صفر از خود فهرست.
import json, re, subprocess, sys, time

CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-empty.jar"
HDR = "/tmp/cp-empty-hdr.txt"

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

EMPTY = "/tmp/empty-2194.txt"
with open(EMPTY, "w") as f:
    f.write("")


def list_sizes(directory: str) -> dict:
    out = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/execute/Fileman/list_files",
                          "-H", "User-Agent: Mozilla/5.0",
                          "--data-urlencode", f"dir={directory}",
                          "--data-urlencode", "showhidden=1"], capture_output=True, text=True).stdout
    try:
        return {f.get("file"): int(f.get("size") or 0) for f in json.loads(out).get("data", []) if isinstance(f, dict)}
    except Exception:
        return {}


def save_empty(name: str, directory: str) -> bool:
    for attempt in range(4):
        out = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0",
                              "--data-urlencode", f"dir={directory}",
                              "--data-urlencode", f"file={name}",
                              "--data-urlencode", "utf8=1",
                              "--data-urlencode", f"content@{EMPTY}"],
                             capture_output=True, text=True).stdout
        if '"status":1' in out:
            return True
        time.sleep(10)
    return False


pattern = re.compile(r"^(rc.*\.php|ex2192.*|ex2194.*|rst2192.*|rst2194.*|start2194\.php|diagkill2194\.php|wipe2194\.php|probe2194\.php|\.up219.*\.json|noor-slim-2.19.2.zip|noor-part-.*)$")
emptied = 0
for directory in [f"{HOME}/public_html", HOME]:
    for name, size in list_sizes(directory).items():
        if name and pattern.match(name) and size > 0:
            if save_empty(name, directory):
                emptied += 1
                print(f"emptied {directory}/{name} (was {size})", flush=True)
            else:
                print(f"FAILED {directory}/{name}", flush=True)
            time.sleep(0.6)
print(f"emptied total: {emptied}", flush=True)

print("=== verify sizes ===", flush=True)
for directory in [f"{HOME}/public_html", HOME]:
    sizes = list_sizes(directory)
    leftovers = {name: size for name, size in sizes.items() if name and pattern.match(name)}
    nonzero = {name: size for name, size in leftovers.items() if size > 0}
    print(f"{directory}: leftovers={len(leftovers)} nonzero={nonzero or 'none'}", flush=True)
