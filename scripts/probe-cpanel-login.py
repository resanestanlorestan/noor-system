#!/usr/bin/env python3
# پیش‌آزمون ورود cPanel برای استقرار ۲.۲۸.۱ — سه نشانی را به ترتیب می‌آزماید:
# https://HOST:2083 / http://HOST:2082 / http://IP:2082 — اولین cpsess برنده است.
import re, subprocess

txt = open("/home/z/my-project/scripts/.cp-creds").read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
IP = re.search(r"CP_IP='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)

targets = [
    (HOST, 2083, "https"),
    (HOST, 2082, "http"),
    (IP, 2082, "http"),
    (IP, 2083, "https"),
]
for host, port, scheme in targets:
    hdr = "/tmp/cp-probe-hdr.txt"
    out = subprocess.run(["curl", "-sk", "--max-time", "25", "-D", hdr, "-o", "/dev/null",
                          f"{scheme}://{host}:{port}/login",
                          "--data-urlencode", f"user={USER}",
                          "--data-urlencode", f"pass={PASS}",
                          "-H", "User-Agent: Mozilla/5.0"], capture_output=True, text=True)
    try:
        h = open(hdr).read()
    except FileNotFoundError:
        h = ""
    ok = "cpsess" in h or re.search(r"\b(cpsess\d+)", h)
    print(f"{scheme}://{host}:{port} -> curl_exit={out.returncode} cpsess={'YES' if ok else 'no'} first_line={h.splitlines()[0] if h else '-'}")
    if ok:
        print("WINNER:", f"{scheme}://{host}:{port}")
        break
