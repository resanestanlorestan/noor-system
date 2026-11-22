#!/usr/bin/env python3
"""جستجوی سراسری اعتبارنامهٔ cPanel (سه literal معتبر) در:
۱) همهٔ فایل‌های زیر my-project (به‌جز .git) ۲) کل /tmp ۳) /home/z (عمق ۳)
۴) همهٔ blobهای دست‌یافتنی گیت. هیچ مقداری چاپ نمی‌شود."""
import os, re, pathlib, subprocess

HOST_OK = re.compile(r"CP_HOST\s*=\s*'([A-Za-z0-9.\-]+\.[A-Za-z]{2,})'")
USER_OK = re.compile(r"CP_USER\s*=\s*'([A-Za-z][A-Za-z0-9_\-]{2,31})'")
PASS_OK = re.compile(r"CP_PASS\s*=\s*'([^\s()\[\]{}+*^$|\\']{4,})'")
OUT = pathlib.Path("/home/z/my-project/scripts/.cp-creds")

def write(host, user, pwd, src):
    OUT.write_text(f"CP_HOST='{host}'\nCP_USER='{user}'\nCP_PASS='{pwd}'\n")
    os.chmod(OUT, 0o600)
    print(f"RESTORED from {src}: HOST={host}, USER present, PASS {len(pwd)} chars")
    raise SystemExit(0)

def scan_text(txt, src):
    mh, mu, mp = HOST_OK.search(txt), USER_OK.search(txt), PASS_OK.search(txt)
    if mh and mu and mp:
        write(mh.group(1), mu.group(1), mp.group(1), src)

roots = [pathlib.Path("/home/z/my-project"), pathlib.Path("/tmp"), pathlib.Path("/home/z")]
seen = 0
for root in roots:
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".git", "node_modules", ".next", "pgserver", "data")]
        for name in filenames:
            p = pathlib.Path(dirpath) / name
            if p.stat().st_size > 2_000_000:
                continue
            seen += 1
            try:
                scan_text(p.read_text(errors="replace"), str(p))
            except Exception:
                pass
print(f"FS scan done: {seen} files, nothing")

# گیت: همهٔ کامیت‌ها، همهٔ مسیرها
try:
    commits = subprocess.run(["git", "rev-list", "--all"], capture_output=True, text=True, cwd="/home/z/my-project").stdout.split()
    hits = set()
    for c in commits:
        r = subprocess.run(["git", "grep", "-hE", r"(CP_HOST|CP_USER|CP_PASS)\s*=\s*'[^']+'", c, "--", "."],
                           capture_output=True, text=True, cwd="/home/z/my-project")
        for line in r.stdout.splitlines():
            if "CP_HOST" in line: continue
            hits.add((line[:80],))  # فقط برای شمارش؛ مقدار چاپ نمی‌شود
        mh, mu, mp = HOST_OK.search(r.stdout), USER_OK.search(r.stdout), PASS_OK.search(r.stdout)
        if mh and mu and mp:
            write(mh.group(1), mu.group(1), mp.group(1), f"git:{c[:10]}")
    print(f"git scan done: {len(commits)} commits, {len(hits)} cred-ish lines (no valid triple)")
except Exception as e:
    print("git scan error:", e)
print("NOT_RECOVERED")
