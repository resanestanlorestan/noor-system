#!/usr/bin/env python3
"""Probe the cPanel Terminal websocket: try several likely paths with the session cookie."""
import ssl
import sys
import websocket

HOST = "89.39.208.254"
SESS = sys.argv[1] if len(sys.argv) > 1 else "cpsess2038087428"
COOKIE = f"sessioncookie={SESS}; cpsession={SESS}"
ORIGIN = f"https://{HOST}:2083"

paths = [
    f"/{SESS}/terminal/socket",
    f"/{SESS}/terminal/websocket",
    f"/{SESS}/cpsrvd/terminal/socket",
    f"/{SESS}/terminal",
]

for path in paths:
    url = f"wss://{HOST}:2083{path}"
    try:
        ws = websocket.create_connection(
            url, timeout=8,
            sslopt={"cert_reqs": ssl.CERT_NONE},
            header=[f"Cookie: {COOKIE}", f"Origin: {ORIGIN}"],
        )
        print(f"CONNECTED: {path}")
        ws.send("\n")
        try:
            data = ws.recv()
            print("RECV:", (data[:200] if isinstance(data, str) else data[:200]))
        except Exception as e:
            print("recv err:", e)
        ws.close()
    except Exception as e:
        print(f"FAIL {path}: {str(e)[:140]}")
