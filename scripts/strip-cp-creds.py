#!/usr/bin/env python3
"""گام ۲ — حذف اعتبارنامهٔ cPanel از اسکریپت‌های ردیابی‌شدهٔ مخزن.
اعتبارنامه‌ها به scripts/.cp-creds (ردیابی‌نشده، ۰۶۰۰) منتقل و اسکریپت‌ها به
خواندن از همان فایل تغییر می‌کنند."""
import os, re, pathlib, subprocess, sys

ROOT = pathlib.Path("/home/z/my-project")
CREDS = ROOT / "scripts/.cp-creds"

SHELL_FILES = [
    "scripts/cp-cron-probe.sh", "scripts/cpapi.sh", "scripts/cpcron.sh",
    "scripts/cpdel.sh", "scripts/cpread.sh", "scripts/cpsave.sh",
    "scripts/cpuapi-cron.sh", "scripts/cpupload.sh", "scripts/host-recon2-2180.sh",
]
POINTERS = [  # فایل‌هایی که اعتبارنامه را از cpread.sh می‌خوانند → به .cp-creds
    ("scripts/cp-session.sh", "$SCRIPT_DIR/cpread.sh"),
    ("scripts/cp-term-probe.py", "cpread.sh"),
    ("scripts/cp-term.py", "cpread.sh"),
    ("scripts/term-run.py", "cpread.sh"),
]

# 1) استخراج سه خط اعتبارنامه از cpread.sh (بدون چاپ مقدارها)
src = (ROOT / "scripts/cpread.sh").read_text()
lines = []
for key in ("CP_HOST", "CP_USER", "CP_PASS"):
    m = re.search(rf"^{key}='[^']*'\s*$", src, re.M)
    if not m:
        sys.exit(f"FATAL: {key} literal not found in cpread.sh")
    lines.append(m.group(0))
CREDS.write_text("\n".join(lines) + "\n")
os.chmod(CREDS, 0o600)

# 2) جایگزینی در اسکریپت‌های شل
block = (
    '# اعتبارنامه‌ها از فایل محلیِ ردیابی‌نشده خوانده می‌شوند (گام ۲ — راز از مخزن حذف شد)\n'
    'CREDS_FILE="$(cd "$(dirname "$0")" && pwd)/.cp-creds"\n'
    '[ -r "$CREDS_FILE" ] || { echo "CREDS_MISSING: $CREDS_FILE" >&2; exit 1; }\n'
    '. "$CREDS_FILE"\n'
)
for rel in SHELL_FILES:
    p = ROOT / rel
    text = p.read_text()
    text, n = re.subn(r"^CP_HOST='[^']*'\s*$", block.rstrip("\n"), text, count=1, flags=re.M)
    if n != 1:
        print(f"WARN: CP_HOST literal not found in {rel}")
    text = re.sub(r"^CP_USER='[^']*'\s*\n", "", text, count=1, flags=re.M)
    text = re.sub(r"^CP_PASS='[^']*'\s*\n", "", text, count=1, flags=re.M)
    p.write_text(text)
    print(f"stripped: {rel}")

# 3) تغییر مرجع خواندن اعتبارنامه
for rel, old in POINTERS:
    p = ROOT / rel
    text = p.read_text()
    if old in text:
        p.write_text(text.replace(old, ".cp-creds"))
        print(f"repointed: {rel} → .cp-creds")
    else:
        print(f"WARN: pattern {old!r} not found in {rel}")

print("DONE")
