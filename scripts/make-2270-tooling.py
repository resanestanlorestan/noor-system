#!/usr/bin/env python3
# مولد ابزارهای استقرار ۲.۲۷.۰ از الگوی ۲.۲۶.۰ — یک‌بار اجرا، خروجی‌ها:
#   scripts/build-slim-package-2270.sh
#   scripts/deploy-2210/md5-host-2270.py
#   scripts/deploy-2210/build-patch-2270.py
#   scripts/deploy-2210/fileman-patch-2270.py  (بدون مایگریشن — ۲.۲۷ تغییر schema ندارد)
#   scripts/deploy-2270.sh
import re

ROOT = "/home/z/my-project"

def read(p):
    return open(f"{ROOT}/{p}", encoding="utf-8").read()

def write(p, content):
    open(f"{ROOT}/{p}", "w", encoding="utf-8").write(content)
    print("WROTE", p, len(content), "bytes")

# ---------------- ۱) بیلد اسلیم ۲.۲۷.۰ ----------------
slim = read("scripts/build-slim-package-2260.sh").replace("2260", "2270").replace("2.26.0", "2.27.0")
slim = slim.replace(
    "# Adapted from build-slim-package-2250.sh — 2.27.0 adds the fixed-field override\n# layer (catalog + case_field_overrides migration + FixedFieldsManager UI).",
    "# Adapted from build-slim-package-2260.sh — 2.27.0 adds the full Persian Excel\n# export (form-ordered full-info sheet + per-case export route). No DB schema change.",
)
marker = 'grep -c "caseFieldCatalogFor" noor-system/src/app/actions/case-steps-admin.ts && echo "CATALOG IN ACTIONS OK"'
extra_gates = marker + '''
echo "=== 2.27.0 code gates: full Persian Excel export ==="
grep -c "buildFullInfoSheet" noor-system/src/lib/case-export-model.ts && echo "EXPORT MODEL OK"
grep -c "export_case_detail" noor-system/src/app/api/cases/[id]/export/route.ts && echo "CASE DETAIL EXPORT OK"
grep -c "خروجی اکسل" noor-system/src/app/\\(workspace\\)/cases/\\[id\\]/page.tsx && echo "DETAIL BUTTON OK"'''
assert marker in slim
slim = slim.replace(marker, extra_gates)
write("scripts/build-slim-package-2270.sh", slim)

# ---------------- ۲) نقشهٔ md5 هاست ۲.۲۷.۰ ----------------
write("scripts/deploy-2210/md5-host-2270.py",
      read("scripts/deploy-2210/md5-host-2260.py").replace("2260", "2270").replace("پچ ۲.۲۱.۰", "پچ ۲.۲۷.۰"))

# ---------------- ۳) ساخت پچ تفاوت‌ها ۲.۲۷.۰ ----------------
bp = read("scripts/deploy-2210/build-patch-2260.py").replace("2260", "2270").replace("2.26.0", "2.27.0")
# دوبار‌نویسی متادیتای کهن حذف می‌شود (خط پایانی patch-meta-2250 دیگر معنا ندارد)
bp = bp.replace('''json.dump({"sha": sha, "bytes": sz, "chunks": N, "entries": len(sel)},
          open("/tmp/patch-meta-2270.json", "w"))
''', "")
write("scripts/deploy-2210/build-patch-2270.py", bp)

# ---------------- ۴) درایور پچی ۲.۲۷.۰ ----------------
fm = read("scripts/deploy-2210/fileman-patch-2260.py").replace("2260", "2270").replace("2.26.0", "2.27.0")

# ۴الف — سرصفحهٔ تازه
old_head = fm[:fm.index("import base64")]
new_head = '''#!/usr/bin/env python3
# استقرار پچی ۲.۲۷.۰ — خط لولهٔ پچی md5 بدون مایگریشن (الحاقیهٔ خروجی اکسل
# تغییر schema ندارد). (۱) گیت‌های محتوایی: مدل خروجی کامل، مسیر تک‌پرونده،
# دکمهٔ جزئیات، صفحهٔ /steps، موتور پویا، لایهٔ override و BUILD_ID/نسخهٔ دوگانه؛
# (۲) اکسترکت overlay، بکاپ کانفیگ، وریفای دیسک (شامل رگرسیون ۲.۲۲ تا ۲.۲۶)؛
# (۳) پاک‌سازی بی‌قیدوشرط بقایای همهٔ دوره‌ها؛ خودحذف.
'''
fm = new_head + fm[len(old_head):]

# ۴ب — حذف بلوک مایگریشن (node/proc_open) — ۲.۲۷ مایگریشن ندارد
mig_start = "    // مایگریشن 0032 پیش از ری‌استارت"
mig_end = "    }} else {{ $o['migrate_raw'] = 'node not found'; $o['migrate_ok'] = false; }}\n"
i, j = fm.index(mig_start), fm.index(mig_end) + len(mig_end)
fm = fm[:i] + "    // الحاقیهٔ ۲.۲۷.۰ مایگریشن ندارد — بدون تغییر schema؛ فقط اکسترکت و وریفای\n" + fm[j:]

# ۴پ — گیت‌های محتوایی تازهٔ ۲.۲۷ داخل زیپ (پس از zip_ff_actions)
ff_actions = "    $o['zip_ff_actions'] = strpos((string)$zip->getFromName('noor-system/src/app/actions/case-steps-admin.ts'), 'saveFieldOverrideAction') !== false;"
assert ff_actions in fm
fm = fm.replace(ff_actions, ff_actions + '''
    $o['zip_export_model'] = strpos((string)$zip->getFromName('noor-system/src/lib/case-export-model.ts'), 'buildFullInfoSheet') !== false;
    $o['zip_detail_export'] = strpos((string)$zip->getFromName('noor-system/src/app/api/cases/[id]/export/route.ts'), 'export_case_detail') !== false;
    $o['zip_detail_button'] = strpos((string)$zip->getFromName('noor-system/src/app/(workspace)/cases/[id]/page.tsx'), 'خروجی اکسل') !== false;''', 1)

# ۴ت — شرط گیت نهایی زیپ: حذف مایگریشن‌ها و افزودن گیت‌های ۲.۲۷
old_gate = "if (!($o['zip_steps_page'] && $o['zip_dynamic_engine'] && $o['zip_build_id'] && $o['zip_catalog'] && $o['zip_overrides_schema'] && $o['zip_ff_manager'] && $o['zip_ff_page'] && $o['zip_ff_actions'] && $o['zip_migrate_0032_sql'] && $o['zip_migrate_0032_js'] && $o['zip_standalone_version'] === '{VERSION}' && $o['zip_top_version'] === '{VERSION}')) throw new Exception('patch gate fail');"
assert old_gate in fm
fm = fm.replace(old_gate, "    if (!($o['zip_steps_page'] && $o['zip_dynamic_engine'] && $o['zip_build_id'] && $o['zip_catalog'] && $o['zip_overrides_schema'] && $o['zip_ff_manager'] && $o['zip_ff_page'] && $o['zip_ff_actions'] && $o['zip_export_model'] && $o['zip_detail_export'] && $o['zip_detail_button'] && $o['zip_standalone_version'] === '{VERSION}' && $o['zip_top_version'] === '{VERSION}')) throw new Exception('patch gate fail');", 1)

# ۴ث — گیت‌های دیسک تازهٔ ۲.۲۷ (پس از disk_ff_page) و اصلاح چک‌های مایگریشن کهن
ff_page = "    $o['disk_ff_page'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/steps/page.tsx'), 'FixedFieldsManager') !== false;"
assert ff_page in fm
fm = fm.replace(ff_page, ff_page + '''
    $o['disk_export_model'] = strpos((string)@file_get_contents($APP . '/src/lib/case-export-model.ts'), 'buildFullInfoSheet') !== false;
    $o['disk_detail_export'] = strpos((string)@file_get_contents($APP . '/src/app/api/cases/[id]/export/route.ts'), 'export_case_detail') !== false;
    $o['disk_detail_button'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/cases/[id]/page.tsx'), 'خروجی اکسل') !== false;''', 1)
# host-migrate-2270.js روی هاست وجود ندارد (فایل تازه نیست)؛ چک دیسک به 0032 واقعیِ موجود اشاره کند
fm = fm.replace("    $o['disk_migrate_0032_js'] = is_file($APP . '/host-migrate-2270.js');",
                "    $o['disk_migrate_0032_js'] = is_file($APP . '/host-migrate-2260.js');")
fm = fm.replace("    $o['zip_migrate_0032_js'] = strpos((string)$zip->getFromName('noor-system/host-migrate-2270.js'), '0032-case-field-overrides.sql') !== false;",
                "    $o['zip_migrate_0032_js'] = true; // ۲.۲۷ مایگریشن ندارد — دروازهٔ zip بی‌اثر")

# ۴ج — شرط ok نهایی: حذف migrate_ok و نگه‌داشتن گیت‌های دیسک + گیت‌های ۲.۲۷
old_ok = fm[fm.index("    $o['ok'] = ("):fm.index("}} catch (Throwable $e)")]
new_ok = '''    $o['ok'] = ($o['disk_build_id'] === '{BUILD_ID}' && $o['disk_top_version'] === '{VERSION}'
        && $o['disk_standalone_version'] === '{VERSION}' && $o['env_intact'] > 0
        && $o['disk_steps_page'] && $o['disk_dynamic_engine']
        && $o['disk_migrate_sql'] && $o['disk_migrate_js']
        && $o['disk_settings_no_form'] && $o['disk_step_has_form'] && $o['disk_forms_page']
        && $o['disk_specialty_delete'] && $o['disk_usage_guard']
        && $o['disk_catalog'] && $o['disk_overrides_schema'] && $o['disk_ff_page']
        && $o['disk_export_model'] && $o['disk_detail_export'] && $o['disk_detail_button']);
'''
fm = fm.replace(old_ok, new_ok, 1)

# ۴چ — پاک‌سازی بقایای دوره‌های پیشین (۲.۲۶ هم اضافه شد) + زیپ کهن ۲.۲۶
old_zips = "    @unlink($H . '/noor-patch-2210.zip'); @unlink($H . '/noor-patch-2220.zip'); @unlink($H . '/noor-patch-2230.zip'); @unlink($H . '/noor-patch-2240.zip'); @unlink($H . '/noor-patch-2250.zip');"
assert old_zips in fm
fm = fm.replace(old_zips, old_zips + " @unlink($H . '/noor-patch-2260.zip');", 1)
old_list = "foreach (['cr2190.php', 'mh2210.php', 'mh2270.php', 'probe2193.php', 'diskprobe2230.php', 'ex2230p.php', 'rst2230.php', 'ex2240p.php', 'rst2240.php', 'ex2250p.php', 'rst2250.php'] as $p) @unlink($H . '/public_html/' . $p);"
assert old_list in fm, "residue list shape changed"
fm = fm.replace(old_list, "foreach (['cr2190.php', 'mh2210.php', 'mh2260.php', 'probe2193.php', 'diskprobe2230.php', 'ex2230p.php', 'rst2230.php', 'ex2240p.php', 'rst2240.php', 'ex2250p.php', 'rst2250.php', 'ex2260p.php', 'rst2260.php', 'ex2270p.php', 'rst2270.php'] as $p) @unlink($H . '/public_html/' . $p);", 1)
write("scripts/deploy-2210/fileman-patch-2270.py", fm)

# ---------------- ۵) wrapper یک‌دستوری ----------------
wrap = read("scripts/deploy-2260.sh").replace("2260", "2270").replace("۲.۲۶.۰", "۲.۲۷.۰").replace("۰۰۳۲", "—")
wrap = wrap.replace("بستهٔ اسلیم از پیش ساخته شده: download/noor-slim-2.27.0.zip (sha=3baddd60...cff)",
                    "بستهٔ اسلیم از پیش ساخته شده: download/noor-slim-2.27.0.zip")
wrap = wrap.replace("مایگریشن —", "اکسترکت +")
write("scripts/deploy-2270.sh", wrap)

print("ALL 2270 TOOLING GENERATED")
