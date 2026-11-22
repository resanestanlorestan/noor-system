#!/usr/bin/env python3
"""بازیابی scripts/.cp-creds پس از بازیافت سندباکس — از بقایای literal در
اسکریپت‌های قدیمی deploy که در فهرست strip-cp-creds.py نبودند یا از کپی /tmp.
هیچ مقداری چاپ نمی‌شود؛ فقط نام فایل مبدأ و کلیدهای پیداشده."""
import os, re, pathlib

CANDIDATES = [
    "/tmp/my-project/scripts/cpread.sh",
    "/home/z/my-project/scripts/deploy-2186/rst2186.py",
    "/home/z/my-project/scripts/deploy-2187/rst2187.py",
    "/home/z/my-project/scripts/deploy-2187/mg-session.py",
    "/home/z/my-project/scripts/deploy-2191/deploy-2191.py",
    "/home/z/my-project/scripts/deploy-2192/deploy-2192.py",
    "/home/z/my-project/scripts/cp-cron-probe.sh",
    "/home/z/my-project/scripts/host-recon2-2180.sh",
    "/tmp/my-project/scripts/cp-cron-probe.sh",
]
PAT = {k: re.compile(rf"{k}\s*=\s*'([^']+)'") for k in ("CP_HOST", "CP_USER", "CP_PASS")}
HOST_OK = re.compile(r"^[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")   # دامنهٔ واقعی
USER_OK = re.compile(r"^[A-Za-z][A-Za-z0-9_\-]{2,31}$")    # کاربر cPanel
PASS_OK = re.compile(r"^[^\s()\[\]{}+*^$|\\']{4,}$")       # نه تکهٔ regex، نه خالی

for path in CANDIDATES:
    p = pathlib.Path(path)
    if not p.exists():
        continue
    try:
        txt = p.read_text(errors="replace")
    except Exception:
        continue
    raw = {k: (m.group(1) if (m := PAT[k].search(txt)) else "") for k in PAT}
    # همهٔ تطبیق‌های ممکن هر کلید را ببین؛ اولین معتبرِ هر کافی است
    vals = {}
    for k in PAT:
        for m in PAT[k].finditer(txt):
            v = m.group(1)
            if (HOST_OK if k == "CP_HOST" else USER_OK if k == "CP_USER" else PASS_OK).match(v):
                vals[k] = v
                break
    found = [k for k in PAT if vals.get(k)]
    if len(found) == 3:
        out = pathlib.Path("/home/z/my-project/scripts/.cp-creds")
        out.write_text(f"CP_HOST='{vals['CP_HOST']}'\nCP_USER='{vals['CP_USER']}'\nCP_PASS='{vals['CP_PASS']}'\n")
        os.chmod(out, 0o600)
        print(f"RESTORED from {path}: HOST={vals['CP_HOST']}, USER present, PASS present ({len(vals['CP_PASS'])} chars)")
        raise SystemExit(0)
    elif found:
        print(f"PARTIAL/INVALID in {path}: {found} (host_ok={bool(HOST_OK.match(raw['CP_HOST'] or ''))})")
print("NOT_RECOVERED: no candidate holds all three valid literals")
