#!/usr/bin/env python3
# شبیه‌سازی محلی کامل خط لوله استقرار ۲.۲۱.۰ با بستهٔ تازه — بدون هیچ تماس شبکه‌ای:
# ۱) سازگاری ثابت‌ها بین درایور (fileman-deploy-2210.py) و قالب‌ها (deploy-2210.py)
# ۲) قطعه‌سازی دقیقاً مثل درایور (CHUNK=1.5MB، b64 بدون خط جدید)
# ۳) اسمبل دقیقاً مثل استاب استخراج (sort اسامی، decode سخت‌گیرانه، الحاق)
# ۴) گیت‌های استاب روی بستهٔ اسمبل‌شده: sha/محافظت/CSS(new: list-remove)/BUILD_ID/نسخه/
#    فایل‌های کلاس‌ها/اکشن‌های حذف/بقای .env
import base64, glob, hashlib, io, json, os, re, sys, zipfile

ROOT = "/home/z/my-project"
ZIP = f"{ROOT}/download/noor-slim-2.21.0.zip"
DRIVER = f"{ROOT}/scripts/deploy-2210/fileman-deploy-2210.py"
TPL = f"{ROOT}/scripts/deploy-2210/deploy-2210.py"
o = {}

# ---------- ۱) سازگاری ثابت‌ها ----------
drv = open(DRIVER).read()
tpl = open(TPL).read()
g = lambda s, k: re.search(rf'^{k} = "([^"]+)"', s, re.M).group(1)
drv_sha, tpl_sha = g(drv, "SHA"), g(tpl, "SHA")
drv_bid, tpl_bid = g(drv, "BUILD_ID"), g(tpl, "BUILD_ID")
o["consistency"] = {"driver_sha == tpl_sha": drv_sha == tpl_sha,
                    "driver_bid == tpl_bid": drv_bid == tpl_bid}
SHA, BUILD_ID = drv_sha, drv_bid
real_sha = hashlib.sha256(open(ZIP, "rb").read()).hexdigest()
o["consistency"]["gate_sha == real_zip_sha"] = SHA == real_sha

# ---------- ۲) قطعه‌سازی مثل درایور ----------
CHUNK = 1_500_000
TOTAL = os.path.getsize(ZIP)
N = (TOTAL + CHUNK - 1) // CHUNK
o["total"], o["chunks"] = TOTAL, N
tmpdir = "/tmp/roundtrip-2210"
os.system(f"rm -rf {tmpdir} && mkdir -p {tmpdir}")
with open(ZIP, "rb") as f:
    for seq in range(1, N + 1):
        f.seek((seq - 1) * CHUNK)
        data = f.read(CHUNK)
        with open(f"{tmpdir}/noor-part-{seq:02d}.b64.txt", "w") as tf:
            tf.write(base64.b64encode(data).decode())

# ---------- ۳) اسمبل مثل استاب (sort اسامی + decode سخت‌گیرانه + الحاق) ----------
parts = sorted(glob.glob(f"{tmpdir}/noor-part-*.b64.txt"))
o["parts_found"] = len(parts)
buf = io.BytesIO()
for p in parts:
    raw = base64.b64decode(open(p).read(), validate=True)
    buf.write(raw)
assembled_sha = hashlib.sha256(buf.getvalue()).hexdigest()
o["sha_ok"] = assembled_sha == SHA
o["assembled_size_ok"] = len(buf.getvalue()) == TOTAL

# ---------- ۴) گیت‌های استاب روی بستهٔ اسمبل‌شده ----------
z = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
names = z.namelist()
o["entries"] = len(names)
o["protected_ok"] = all(os.path.basename(n) not in (".htaccess", ".env") for n in names)
css = z.read("noor-system/src/app/workspace.css").decode("utf-8", "replace")
o["css_has_actions(edu-tab)"] = "edu-tab" in css
o["css_navy_sidebar(0e2148)"] = "0e2148" in css
o["css_list_remove(2.21.0)"] = "list-remove" in css
acts = z.read("noor-system/src/app/actions/management.ts").decode("utf-8", "replace")
o["delete_actions(2.21.0)"] = all(a in acts for a in ("deleteCountyAction", "deleteSpecialtyAction", "deleteOrganizationAction"))
bid = z.read("noor-system/.next/standalone/.next/BUILD_ID").decode().strip()
o["build_id_ok"] = bid == BUILD_ID
pkg = json.loads(z.read("noor-system/package.json"))
o["pkg_version_ok"] = pkg.get("version") == "2.21.0"

# شبیه‌سازی overlay: دایرکتوری با .env موجود، استخراج روی آن، .env باید بماند
simdir = f"{tmpdir}/appsim"
os.makedirs(f"{simdir}/noor-system", exist_ok=True)
open(f"{simdir}/noor-system/.env", "w").write("DATABASE_URL=postgresql://x\n")
z.extractall(simdir)
env_still = os.path.getsize(f"{simdir}/noor-system/.env") > 0
o["env_survives_overlay"] = env_still
o["classes_lib"] = os.path.isfile(f"{simdir}/noor-system/src/lib/classes.ts")
o["classes_page"] = os.path.isfile(f"{simdir}/noor-system/src/app/(workspace)/classes/page.tsx")
o["settings_page"] = os.path.isfile(f"{simdir}/noor-system/src/app/(workspace)/settings/page.tsx")
o["mg_forms_has_delete_ui"] = "deleteCounty" in z.read("noor-system/src/components/management-forms.tsx").decode("utf-8", "replace")
o["sharp_in_package"] = os.path.isdir(f"{simdir}/noor-system/.next/standalone/node_modules/@img")

stub_gates_ok = (o["sha_ok"] and o["protected_ok"] and o["css_has_actions(edu-tab)"]
                 and o["css_navy_sidebar(0e2148)"] and o["css_list_remove(2.21.0)"]
                 and o["delete_actions(2.21.0)"] and o["build_id_ok"] and o["pkg_version_ok"]
                 and o["env_survives_overlay"] and o["classes_lib"] and o["classes_page"])
o["ALL_STUB_GATES_OK"] = stub_gates_ok
print(json.dumps(o, indent=1))
sys.exit(0 if (stub_gates_ok and all(o["consistency"].values())) else 1)
