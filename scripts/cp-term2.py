#!/usr/bin/env python3
"""اجرای دستور در ترمینال وب cPanel با استفاده از نشست موجود (بدون لاگین تازه).
نشست از /tmp/cpsess.txt (شناسه cpsess) و /tmp/cpjar.txt (فایل کوکی curl) خوانده می‌شود.
usage: cp-term2.py <command> [wait_seconds]"""
import json, os, re, ssl, sys, time
import websocket

HOST = "89.39.208.254"
COMMAND = sys.argv[1]
WAIT = float(sys.argv[2]) if len(sys.argv) > 2 else 15.0

sess = open("/tmp/cpsess.txt").read().strip()
jar_path = "/tmp/cpjar.txt"

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
