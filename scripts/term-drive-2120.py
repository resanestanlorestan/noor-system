#!/usr/bin/env python3
"""Drive the cPanel Terminal websocket. Usage: term-drive-2120.py <sess> <command> [seconds]"""
import json, re, ssl, sys, time
import websocket

HOST = "89.39.208.254"
SESS = sys.argv[1]
COMMAND = sys.argv[2]
WAIT = float(sys.argv[3]) if len(sys.argv) > 3 else 12.0
COOKIE = f"sessioncookie={SESS}; cpsession={SESS}"
print(f"session: {SESS[:14]}…", file=sys.stderr)

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# --- websocket terminal ---
url = f"wss://{HOST}:2083/{SESS}/terminal/socket"
ws = websocket.create_connection(url, timeout=10, sslopt={"cert_reqs": ssl.CERT_NONE},
                                 header=[f"Cookie: {COOKIE}", f"Origin: https://{HOST}:2083"])
ws.send(json.dumps({"id": "1", "msg": {"method": "start", "params": {"cols": 120, "rows": 40}, "version": 1}}))
time.sleep(1.5)
ws.send(json.dumps({"id": "2", "msg": {"method": "data", "params": {"data": f"{COMMAND}\n"}}}))

out = []
deadline = time.time() + WAIT
ws.settimeout(1.0)
while time.time() < deadline:
    try:
        raw = ws.recv()
    except websocket.WebSocketTimeoutException:
        continue
    except Exception:
        break
    try:
        payload = json.loads(raw)
        msg = payload.get("msg", {})
        if msg.get("method") == "data":
            out.append(msg["params"].get("data", ""))
    except Exception:
        pass
ws.close()
text = "".join(out)
# strip terminal escape noise lightly
text = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", text)
print(text)
