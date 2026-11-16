#!/usr/bin/env python3
"""پروب مسیرهای سوکت ترمینال cPanel با نشست تازهٔ ورود."""
import os, re, ssl, subprocess, sys
import websocket

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
text = open(os.path.join(SCRIPT_DIR, "cpread.sh")).read()
HOST = re.search(r"CP_HOST='([^']*)'", text).group(1)
USER = re.search(r"CP_USER='([^']*)'", text).group(1)
PASS = re.search(r"CP_PASS='([^']*)'", text).group(1)

jar, hdr = "/tmp/probe-jar.txt", "/tmp/probe-hdr.txt"
for p in (jar, hdr):
    if os.path.exists(p):
        os.remove(p)
subprocess.run(["curl", "-sk", "--max-time", "40", "-c", jar, "-D", hdr, "-o", "/dev/null",
                f"https://{HOST}:2083/login",
                "--data-urlencode", f"user={USER}", "--data-urlencode", f"pass={PASS}",
                "-H", "User-Agent: Mozilla/5.0"], check=True)
sess = None
for line in open(hdr):
    m = re.search(r"cpsess\d+", line)
    if m:
        sess = m.group(0)
        break
print("session:", sess)

cookies = "; ".join(
    f"{parts[5]}={parts[6]}"
    for parts in (ln.split() for ln in open(jar) if ln.startswith("#HttpOnly_") or (ln.strip() and not ln.startswith("#")))
    if len(parts) >= 7)
print("cookies:", [c.split("=", 1)[0] for c in cookies.split("; ")])

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

paths = [
    f"/{sess}/terminal/socket",
    f"/{sess}/terminal/websocket",
    f"/{sess}/cpsrvd/terminal/socket",
    f"/{sess}/frontend/jupiter/terminal/socket",
    f"/terminal/socket?cpanel_jsonapi_apiversion=2",
]
for path in paths:
    url = f"wss://{HOST}:2083{path}"
    try:
        ws = websocket.create_connection(url, timeout=8, sslopt={"context": ctx},
                                         header=[f"Cookie: {cookies}", f"Origin: https://{HOST}:2083"])
        print(f"CONNECTED: {path}")
        ws.close()
    except Exception as e:
        msg = str(e).split(" -+-+- ")[0][:120]
        print(f"FAIL {path}: {msg}")
