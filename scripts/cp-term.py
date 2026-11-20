#!/usr/bin/env python3
"""ورود به cPanel و اجرای یک دستور در ترمینال وب — اعتبارنامه از .cp-creds خوانده می‌شود.
usage: cp-term.py <command> [wait_seconds]"""
import http.cookiejar as cj
import json, os, re, ssl, subprocess, sys, time
import urllib.parse, urllib.request
import websocket

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def cpval(name):
    text = open(os.path.join(SCRIPT_DIR, ".cp-creds")).read()
    return re.search(rf"CP_{name}='([^']*)'", text).group(1)


HOST, USER, PASS = cpval("HOST"), cpval("USER"), cpval("PASS")
COMMAND = sys.argv[1]
WAIT = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0

jar_path = "/tmp/cp-term-jar.txt"
hdr_path = "/tmp/cp-term-hdr.txt"
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
url = f"wss://{HOST}:2083/{sess}/terminal/socket"
ssl_ws = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ssl_ws.check_hostname = False
ssl_ws.verify_mode = ssl.CERT_NONE
ws = websocket.create_connection(url, timeout=10, sslopt={"context": ssl_ws},
                                 header=[f"Cookie: {cookies}", f"Origin: https://{HOST}:2083"])
ws.send(json.dumps({"id": "1", "msg": {"method": "start", "params": {"cols": 200, "rows": 50}, "version": 1}}))
time.sleep(1.5)
ws.send(json.dumps({"id": "2", "msg": {"method": "data", "params": {"data": f"{COMMAND}\n"}}}))

out, deadline = [], time.time() + WAIT
ws.settimeout(1.0)
while time.time() < deadline:
    try:
        raw = ws.recv()
    except websocket.WebSocketTimeoutException:
        continue
    except Exception:
        break
    try:
        msg = json.loads(raw).get("msg", {})
        if msg.get("method") == "data":
            out.append(msg["params"].get("data", ""))
    except Exception:
        pass
ws.close()
text = "".join(out)
text = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", text)
print(text)
