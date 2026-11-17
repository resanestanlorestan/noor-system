#!/usr/bin/env python3
"""Drive the cPanel Terminal websocket: connect, send a command, print output."""
import ssl, sys, json, time
import websocket

HOST = "89.39.208.254"
SESS = sys.argv[1]
CMD = sys.argv[2] if len(sys.argv) > 2 else "echo HELLO-CPTERM"
COOKIE = f"sessioncookie={SESS}; cpsession={SESS}"
ORIGIN = f"https://{HOST}:2083"
PATH = f"/{SESS}/cpsrvd/terminal/socket"

ws = websocket.create_connection(
    f"wss://{HOST}:2083{PATH}", timeout=10,
    sslopt={"cert_reqs": ssl.CERT_NONE},
    header=[f"Cookie: {COOKIE}", f"Origin: {ORIGIN}"],
)
print("CONNECTED")

def recv_for(seconds):
    ws.settimeout(0.5)
    end = time.time() + seconds
    out = []
    while time.time() < end:
        try:
            data = ws.recv()
            out.append(data if isinstance(data, str) else data.decode("utf-8", "replace"))
        except websocket.WebSocketTimeoutException:
            continue
        except Exception as e:
            out.append(f"<<recv-err {e}>>")
            break
    return out

print("=== initial ===")
for m in recv_for(4): print(m[:300])

for payload in [
    json.dumps({"action": "input", "data": CMD + "\n"}),
    CMD + "\n",
]:
    ws.send(payload)
    time.sleep(1.5)
    print(f"=== after send {payload[:60]} ===")
    for m in recv_for(4): print(m[:300])
    if any("HELLO-CPTERM" in m for m in []): break

ws.close()
