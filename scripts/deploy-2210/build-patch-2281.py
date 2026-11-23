#!/usr/bin/env python3
# گام ۲ پچ ۲.۲۸.۱ — ساخت بستهٔ پچ از تفاوت zip اسلیم محلی با نقشهٔ md5 هاست
# خروجی: download/noor-patch-2281.zip + آمار (تعداد، حجم، sha256، تعداد قطعات)
import hashlib, json, zipfile

ZIP = "/home/z/my-project/download/noor-slim-2.28.1.zip"
HOSTMAP = "/tmp/host-md5-2281.json"
OUT = "/home/z/my-project/download/noor-patch-2281.zip"
PREFIX = "noor-system/"

host = json.load(open(HOSTMAP))
z = zipfile.ZipFile(ZIP)
# استثناها: ابزار مخزن و دادهٔ pg محلی و گذرواژه‌نما هرگز به هاست نمی‌روند؛
# server.js لودر اثبات‌شدهٔ هاست را دست‌نخورده می‌گذارد.
EXCLUDE = ("noor-system/scripts/", "noor-system/server.js")
names = [n for n in z.namelist() if not n.endswith("/") and not n.startswith(EXCLUDE)]
sel = []
skip_same = 0
excluded = 0
stats = {"src": 0, "next": 0, "other": 0, "forced": []}
for n in names:
    rel = n[len(PREFIX):]
    data = z.read(n)
    md5 = hashlib.md5(data).hexdigest()
    force = n == PREFIX + ".next/standalone/.next/BUILD_ID"
    if rel not in host:
        why = "missing"
    elif host[rel] != md5:
        why = "changed"
    elif force:
        why = "forced"
    else:
        skip_same += 1
        continue
    sel.append((n, data, why))
    if why == "forced":
        stats["forced"].append(rel)
    if rel.startswith("src/"):
        stats["src"] += 1
    elif rel.startswith(".next/"):
        stats["next"] += 1
    else:
        stats["other"] += 1

zp = zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED)
for n, data, _ in sel:
    zp.writestr(n, data)
zp.close()
sz = len(open(OUT, "rb").read())
sha = hashlib.sha256(open(OUT, "rb").read()).hexdigest()
N = (sz + 1_499_999) // 1_500_000
import json as _j
_j.dump({"sha": sha, "bytes": sz, "chunks": N, "entries": len(sel)},
        open("/tmp/patch-meta-2281.json", "w"))
print(json.dumps({
    "zip_entries_total": len(names),
    "patch_entries": len(sel),
    "identical_skipped": skip_same,
    "by_area": stats,
    "patch_bytes": sz,
    "patch_sha256": sha,
    "chunks_1_5MB": N,
}, indent=1))
