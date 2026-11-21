#!/usr/bin/env python3
# پاک‌سازی نهایی تولید پس از استقرار ۲.۱۹.۳ — حذف همهٔ استاب‌ها (از جمله
# start2193.php که در این اجرا مصرف نشد)، وضعیت‌های آپلود، زیپ جزئی قدیمی
# و قطعات خام اجراهای قبلی؛ فهرست‌گیری از هاست تا هیچ rc*.php باقی نماند.
import json, re, subprocess, sys, time

CREDS = "/home/z/my-project/scripts/.cp-creds"
JAR = "/tmp/cp-cleanup.jar"
HDR = "/tmp/cp-cleanup-hdr.txt"

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


def delete_file(name: str, directory: str) -> None:
    subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                    f"https://{HOST}:2083/{sess}/execute/Fileman/delete",
                    "-H", "User-Agent: Mozilla/5.0",
                    "--data-urlencode", f"dir={directory}",
                    "--data-urlencode", f"file={name}"], capture_output=True, text=True)


patterns = re.compile(r"^(rc.*\.php|ex.*219.*\.php|rst.*219.*\.php|start2193\.php|diagkill2193\.php|\.up219.*\.json|noor-slim-2\.19\.2\.zip|noor-part-.*\.(bin|b64\.txt))$")
removed = []
for directory in [f"{HOME}/public_html", HOME]:
    for name in list_files(directory):
        if name and patterns.match(name):
            delete_file(name, directory)
            removed.append(f"{directory}/{name}")
            time.sleep(0.7)
print(f"removed {len(removed)} leftovers", flush=True)
for item in removed:
    print(" -", item, flush=True)
leftover_check = [n for n in list_files(f"{HOME}/public_html") if n and re.match(r"^rc|2193|2192|noor-part", n)]
print("remaining suspicious in public_html:", leftover_check or "none", flush=True)
