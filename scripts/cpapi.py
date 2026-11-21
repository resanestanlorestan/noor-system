#!/usr/bin/env python3
# کلاینت UAPI با یک نشست: لاگین یک‌بار، سپس فراخوانی‌های form-encoded (بدون
# multipart — حفاظت هاست بدنهٔ مالتی‌پارت را می‌اندازد).
# usage: cpapi.py <api/path> [key=value ...]   (مقدار value=فایل:@path خوانده می‌شود)
import json, re, subprocess, sys, time

CREDS = "/home/z/my-project/scripts/.cp-creds"
txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']*)'", txt).group(1)
USER = re.search(r"CP_USER='([^']*)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", txt).group(1)

JAR = "/tmp/cp-api.jar"
HDR = "/tmp/cp-api-hdr.txt"
subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                f"https://{HOST}:2083/login",
                "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                "-H", "User-Agent: Mozilla/5.0"], check=False)
sess = None
for ln in open(HDR):
    m = re.search(r"cpsess\d+", ln)
    if m: sess = m.group(0); break
if not sess:
    print(json.dumps({"error": "LOGIN_FAILED"})); sys.exit(1)

def call_api(sess, path, pairs):
    args = []
    for k, v in pairs:
        if isinstance(v, str) and v.startswith("file:@"):
            v = open(v[6:]).read()
        args += ["--data-urlencode", f"{k}={v}"]
    raw = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                          f"https://{HOST}:2083/{sess}/execute/{path}",
                          "-H", "User-Agent: Mozilla/5.0"] + args,
                         capture_output=True, text=True).stdout
    try:
        return json.loads(raw)
    except Exception:
        return {"raw": raw[:300]}

# حالت دسته‌ای: cpapi.py --batch ops.json — چند فراخوانی با یک لاگین (فاصلهٔ ۴ثانیه)
if len(sys.argv) > 1 and sys.argv[1] == "--batch":
    ops = json.load(open(sys.argv[2]))
    out = []
    for i, op in enumerate(ops):
        if i: time.sleep(4)
        pairs = list(op.get("args", {}).items()) + op.get("_multi", [])
        r = call_api(sess, op["path"], pairs)
        out.append({"op": op.get("name", op["path"]), "status": r.get("status"), "errors": r.get("errors"), "data": r.get("data")})
        if r.get("status") != 1 and op.get("stop_on_error"):
            break
    print(json.dumps(out, ensure_ascii=False)[:2000])
    sys.exit(0)

path = sys.argv[1]
args = []
for a in sys.argv[2:]:
    if "=" not in a: continue
    k, v = a.split("=", 1)
    if v.startswith("file:@"):
        v = open(v[6:]).read()
    args += ["--data-urlencode", f"{k}={v}"]
raw = subprocess.run(["curl", "-sk", "--max-time", "60", "-b", JAR,
                      f"https://{HOST}:2083/{sess}/execute/{path}",
                      "-H", "User-Agent: Mozilla/5.0"] + args,
                     capture_output=True, text=True).stdout
try:
    print(json.dumps(json.loads(raw), ensure_ascii=False)[:600])
except Exception:
    print("RAW:", raw[:300])
