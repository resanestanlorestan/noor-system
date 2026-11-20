#!/usr/bin/env python3
"""ورود به cPanel و اجرای یک دستور در ترمینال وب (مسیر cpsrvd) با انتظار کافی.
usage: term-run.py <command> [wait_seconds]
اعتبارنامه از scripts/.cp-creds خوانده می‌شود (هیچ رازی در این فایل نیست)."""
import http.cookiejar as cj
import json, os, re, ssl, subprocess, sys, time
import websocket

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def cpval(name):
    text = open(os.path.join(SCRIPT_DIR, ".cp-creds")).read()
    return re.search(rf"CP_{name}='([^']*)'", text).group(1)


HOST, USER, PASS = cpval("HOST"), cpval("USER"), cpval("PASS")
COMMAND = sys.argv[1]
WAIT = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0

jar_path = "/tmp/cp-tr-jar.txt"
hdr_path = "/tmp/cp-tr-hdr.txt"
for p in (jar_path, hdr_path):
    if os.path.exists(p):
        os.remove(p)
subprocess.run([
    "curl", "-sk", "--max-time", "40", "-c", jar_path, "-D", hdr_path, "-o", "/dev/null",
    f"https://{HOST}:2083/login",
    "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
    "-H", "User-Agent: Mozilla/5.0"], check=True)
sess = None
for line in open(hdr_path):
    m = re.search(r"cpsess\d+", line)
    if m:
        sess = m.group(0)
        break
if not sess:
    sys.exit("LOGIN_FAILED")

cookies = "; ".join(
    f"{parts[5]}={parts[6]}"
    for parts in (ln.split() for ln in open(jar_path) if ln.startswith("#HttpOnly_") or (ln.strip() and not ln.startswith("#")))
    if len(parts) >= 7)

ssl_ws = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ssl_ws.check_hostname = False
ssl_ws.verify_mode = ssl.CERT_NONE
ws = websocket.create_connection(
    f"wss://{HOST}:2083/{sess}/cpsrvd/terminal/socket", timeout=10,
    sslopt={"context": ssl_ws},
    header=[f"Cookie: {cookies}", f"Origin: https://{HOST}:2083"])

out, deadline = [], time.time() + WAIT
ws.settimeout(1.0)
last = time.time()


def collect(raw):
    global last
    try:
        j = json.loads(raw)
        msg = j.get("msg") or {}
        data = msg.get("params", {}).get("data") if isinstance(msg.get("params"), dict) else None
        if data is None and isinstance(j.get("data"), str):
            data = j["data"]
        if data:
            out.append(data)
            last = time.time()
            return
    except Exception:
        pass
    out.append(raw if isinstance(raw, str) else raw.decode("utf-8", "replace"))
    last = time.time()


sent = False
while time.time() < deadline:
    try:
        raw = ws.recv()
        collect(raw)
    except websocket.WebSocketTimeoutException:
        if not sent and time.time() - last > 1.5:
            ws.send(json.dumps({"action": "input", "data": COMMAND + "\n"}))
            ws.send(COMMAND + "\n")
            sent = True
        continue
    except Exception:
        break
ws.close()
text = "".join(out)
text = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", text)
print(text[-8000:])
