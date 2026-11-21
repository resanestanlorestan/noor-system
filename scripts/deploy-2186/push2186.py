#!/usr/bin/env python3
# انتقال بستهٔ ۲.۱۸.۶ به هاست — الگوی push2185.py + گیت توکن گیرنده (k=)
# تکه‌های 1.5MB باینری → base64 → POST JSON با شمارهٔ توالی؛ ادامه از جایی که ماند.
import base64, json, os, secrets, sys, time, urllib.request, urllib.error

ZIP = "/home/z/my-project/download/noor-slim-2.18.6.zip"
BASE = "https://pouyafarhadi.ir/rc2186.php"
TOKEN_FILE = "/home/z/my-project/scripts/deploy-2186/.rc-token"
CHUNK = 1_500_000  # بایت باینری در هر تکه
TOTAL = os.path.getsize(ZIP)
N = (TOTAL + CHUNK - 1) // CHUNK
print(f"total={TOTAL} chunks={N}")

TOKEN = open(TOKEN_FILE).read().strip()  # پیش از آپلود استاب جایگزین شده؛ همین‌جا خوانده می‌شود
if not TOKEN:
    sys.exit("missing receiver token — create .rc-token first")

def call(path, body=None, timeout=90):
    req = urllib.request.Request(BASE + path, data=body,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"} if body else {"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode()

def url(suffix=""):
    sep = "&" if "?" in suffix else "?"
    return f"{BASE}{suffix}{sep}k={TOKEN}"

# ریست وضعیت گیرنده برای ارسال تازه
for attempt in range(10):
    try:
        st = json.loads(call(f"?reset&k={TOKEN}"))
        break
    except Exception as e:
        print(f"reset try{attempt}: {repr(e)[:80]}"); time.sleep(20)
else:
    sys.exit("receiver unreachable")
print("reset:", st)
time.sleep(2)

with open(ZIP, "rb") as f:
    for seq in range(1, N + 1):
        f.seek((seq - 1) * CHUNK)
        data = f.read(CHUNK)
        body = json.dumps({"seq": seq, "b64": base64.b64encode(data).decode()}).encode()
        ok = False
        for attempt in range(4):
            try:
                res = json.loads(call(f"?k={TOKEN}", body, timeout=120))
                if res.get("received") == seq:
                    print(f"chunk {seq}/{N} ok ({res['bytes']} bytes)")
                    ok = True; break
                print(f"chunk {seq} try{attempt}: {res}")
            except Exception as e:
                print(f"chunk {seq} try{attempt}: {repr(e)[:90]}")
            time.sleep(8)
        if not ok:
            sys.exit(f"chunk {seq} failed after retries — rerun script to resume")
print("ALL CHUNKS UPLOADED")
