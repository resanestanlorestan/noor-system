#!/usr/bin/env python3
# مولد ابزارهای استقرار ۲.۲۸.۰ از الگوی ۲.۲۶.۰ (این الحاقیه مایگریشن ۰۰۳۳ دارد)
# خروجی‌ها:
#   scripts/build-slim-package-2280.sh
#   scripts/deploy-2210/md5-host-2280.py
#   scripts/deploy-2210/build-patch-2280.py
#   scripts/deploy-2210/fileman-patch-2280.py  (مایگریشن ۰۰۳۳ با node resolوشهٔ /proc)
#   scripts/deploy-2280.sh
import re

ROOT = "/home/z/my-project"

def read(p):
    return open(f"{ROOT}/{p}", encoding="utf-8").read()

def write(p, content):
    open(f"{ROOT}/{p}", "w", encoding="utf-8").write(content)
    print("WROTE", p, len(content), "bytes")

# ---------------- ۱) بیلد اسلیم ۲.۲۸.۰ ----------------
slim = read("scripts/build-slim-package-2260.sh").replace("2260", "2280").replace("2.26.0", "2.28.0")
slim = slim.replace(
    "# Adapted from build-slim-package-2250.sh — 2.28.0 adds the fixed-field override\n# layer (catalog + case_field_overrides migration + FixedFieldsManager UI).",
    "# Adapted from build-slim-package-2260.sh — 2.28.0 adds the dynamic specialty\n# detail fields (0033 migration + panel editor) on top of the 2.27 Excel export.",
)
anchor = 'grep -c "caseFieldCatalogFor" noor-system/src/app/actions/case-steps-admin.ts && echo "CATALOG IN ACTIONS OK"'
assert anchor in slim
slim = slim.replace(anchor, anchor + '''
echo "=== 2.27.0 regression gates: full Persian Excel export ==="
grep -c "buildFullInfoSheet" noor-system/src/lib/case-export-model.ts && echo "EXPORT MODEL OK"
grep -c "export_case_detail" noor-system/src/app/api/cases/[id]/export/route.ts && echo "CASE DETAIL EXPORT OK"
echo "=== 2.28.0 code gates: dynamic specialty detail fields ==="
grep -c "loadSpecialtyDetailMeta" noor-system/src/lib/specialty-detail-meta.ts && echo "DETAIL META OK"
grep -c "saveSpecialtyDetailAction" noor-system/src/app/actions/forms.ts && echo "DETAIL ACTIONS OK"
grep -c "SpecialtyFieldsEditor" noor-system/src/app/\\(workspace\\)/forms/page.tsx && echo "EDITOR PAGE OK"
ls noor-system/drizzle/0033-specialty-detail-overrides.sql >/dev/null && echo "MIGRATION 0033 OK"
ls noor-system/host-migrate-2280.js >/dev/null && echo "HOST MIGRATE 2280 OK"''', 1)
write("scripts/build-slim-package-2280.sh", slim)

# ---------------- ۲) نقشهٔ md5 هاست ----------------
write("scripts/deploy-2210/md5-host-2280.py",
      read("scripts/deploy-2210/md5-host-2260.py").replace("2260", "2280").replace("پچ ۲.۲۱.۰", "پچ ۲.۲۸.۰"))

# ---------------- ۳) ساخت پچ تفاوت‌ها ----------------
bp = read("scripts/deploy-2210/build-patch-2260.py").replace("2260", "2280").replace("2.26.0", "2.28.0")
bp = bp.replace('''json.dump({"sha": sha, "bytes": sz, "chunks": N, "entries": len(sel)},
          open("/tmp/patch-meta-2280.json", "w"))
''', "")
write("scripts/deploy-2210/build-patch-2280.py", bp)

# ---------------- ۴) درایور پچی ۲.۲۸.۰ ----------------
fm = read("scripts/deploy-2210/fileman-patch-2260.py").replace("2260", "2280").replace("2.26.0", "2.28.0")
# نام فایل مایگریشن داخل گیت‌ها و مسیرها به ۰۰۳۳ تغییر می‌کند (پیش از افزودن
# گیت‌های legacy ۰۰۳۲ که عمداً نام کهن را می‌سنجند)
fm = fm.replace("'0032-case-field-overrides.sql'", "'0033-specialty-detail-overrides.sql'")
fm = fm.replace("/drizzle/0032-case-field-overrides.sql", "/drizzle/0033-specialty-detail-overrides.sql")

# ۴الف — سرصفحهٔ تازه
old_head = fm[:fm.index("import base64")]
new_head = '''#!/usr/bin/env python3
# استقرار پچی ۲.۲۸.۰ — خط لولهٔ پچی md5 با مایگریشن ۰۰۳۳ (جدول پویای فیلد
# جزئیات تخصص‌ها). (۱) گیت‌های محتوایی زیپ: مدل متای پویا، ویرایشگر پنل،
# اکشن‌های ذخیره/بازنشانی، مایگریشن ۰۰۳۳ + اسکریپت هاست، BUILD_ID و نسخهٔ دوگانه؛
# (۲) اکسترکت overlay، اجرای مایگریشن با host-migrate-2280.js و node resolوشهٔ
# /proc، بکاپ کانفیگ، وریفای دیسک شامل رگرسیون ۲.۲۲ تا ۲.۲۷؛ (۳) پاک‌سازی
# بی‌قیدوشرط بقایای همهٔ دوره‌ها؛ خودحذف.
'''
fm = new_head + fm[len(old_head):]

# ۴ب — گیت‌های محتوایی تازهٔ ۲.۲۸ داخل زیپ (پس از zip_migrate_0032_js که پس از
# تغییر نام اکنون فایل‌های ۰۰۳۳ را می‌سنجد) + تغییر نام گیت‌ها به ۰۰۳۳
fm = fm.replace("$o['zip_migrate_0032_sql']", "$o['zip_migrate_0033_sql']")
fm = fm.replace("$o['zip_migrate_0032_js']", "$o['zip_migrate_0033_js']")
mig_js_line = "    $o['zip_migrate_0033_js'] = strpos((string)$zip->getFromName('noor-system/host-migrate-2280.js'), '0033-specialty-detail-overrides.sql') !== false;"
assert mig_js_line in fm
fm = fm.replace(mig_js_line, mig_js_line + '''
    $o['zip_specialty_meta'] = strpos((string)$zip->getFromName('noor-system/src/lib/specialty-detail-meta.ts'), 'loadSpecialtyDetailMeta') !== false;
    $o['zip_detail_editor'] = strpos((string)$zip->getFromName('noor-system/src/components/specialty-fields-editor.tsx'), 'saveSpecialtyDetailAction') !== false;
    $o['zip_detail_actions'] = strpos((string)$zip->getFromName('noor-system/src/app/actions/forms.ts'), 'saveSpecialtyDetailAction') !== false;''', 1)

# ۴پ — شرط گیت نهایی زیپ: فقط مدخل‌های تضمینیِ همین پچ (۳ گیت ۲.۲۸ + ۰۰۳۳ + BUILD_ID + نسخهٔ دوگانه)
old_gate = fm[fm.index("    // گیت پچ تفاوتی‌محور"):fm.index("    if (!$zip->extractTo($H)) throw new Exception('extract fail');")]
new_gate = '''    // گیت پچ تفاوتی‌محور ۲.۲۸.۰ — فقط مدخل‌های تضمینیِ همین پچ؛ فایل‌های
    // تغییر‌نیافتهٔ ۲.۲۶/۲.۲۷ در پچ نیستند و کنترل آن‌ها به گیت‌های دیسکِ
    // پس از اکسترکت واگذار شده است
    if (!($o['zip_specialty_meta'] && $o['zip_detail_editor'] && $o['zip_detail_actions'] && $o['zip_migrate_0033_sql'] && $o['zip_migrate_0033_js'] && $o['zip_build_id'] && $o['zip_standalone_version'] === '{VERSION}' && $o['zip_top_version'] === '{VERSION}')) throw new Exception('patch gate fail');
'''
fm = fm.replace(old_gate, new_gate, 1)

# ۴ت — مایگریشن ۰۰۳۳ پیش از ری‌استارت (کامنت + مسیر پس از تغییر نام درست است)
fm = fm.replace("    // مایگریشن 0032 پیش از ری‌استارت؛ node از /proc فرایند جاری next-server resolوشه می‌شود",
                "    // مایگریشن 0033 پیش از ری‌استارت؛ node از /proc فرایند جاری next-server resolوشه می‌شود")

# ۴ث — گیت‌های دیسک تازهٔ ۲.۲۸ + رگرسیون ۰۰۳۲/۲.۲۷ (پس از disk_ff_page)
ff_page = "    $o['disk_ff_page'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/steps/page.tsx'), 'FixedFieldsManager') !== false;"
assert ff_page in fm
fm = fm.replace(ff_page, ff_page + '''
    $o['disk_ff_manager'] = strpos((string)@file_get_contents($APP . '/src/components/fixed-fields-manager.tsx'), 'saveFieldOverrideAction') !== false;
    $o['disk_detail_meta'] = strpos((string)@file_get_contents($APP . '/src/lib/specialty-detail-meta.ts'), 'loadSpecialtyDetailMeta') !== false;
    $o['disk_detail_editor'] = strpos((string)@file_get_contents($APP . '/src/components/specialty-fields-editor.tsx'), 'saveSpecialtyDetailAction') !== false;
    $o['disk_detail_actions'] = strpos((string)@file_get_contents($APP . '/src/app/actions/forms.ts'), 'saveSpecialtyDetailAction') !== false;
    $o['disk_migrate_0032_legacy_sql'] = is_file($APP . '/drizzle/0032-case-field-overrides.sql');
    $o['disk_migrate_0032_legacy_js'] = is_file($APP . '/host-migrate-2260.js');
    $o['disk_export_model'] = strpos((string)@file_get_contents($APP . '/src/lib/case-export-model.ts'), 'buildFullInfoSheet') !== false;
    $o['disk_detail_export'] = strpos((string)@file_get_contents($APP . '/src/app/api/cases/[id]/export/route.ts'), 'export_case_detail') !== false;
    $o['disk_detail_button'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/cases/[id]/page.tsx'), 'خروجی اکسل') !== false;''', 1)
# گیت‌های دیسک ۰۰۳۲ که پس از تغییر نام مسیر ۰۰۳۳ را می‌سنجند — تغییر نام متغیر
fm = fm.replace("$o['disk_migrate_0032_sql']", "$o['disk_migrate_0033_sql']")
fm = fm.replace("$o['disk_migrate_0032_js']", "$o['disk_migrate_0033_js']")

# ۴ج — شرط ok نهایی
old_ok = fm[fm.index("    $o['ok'] = ($o['disk_build_id']"):fm.index("}} catch (Throwable $e)")]
new_ok = '''    $o['ok'] = ($o['disk_build_id'] === '{BUILD_ID}' && $o['disk_top_version'] === '{VERSION}'
        && $o['disk_standalone_version'] === '{VERSION}' && $o['env_intact'] > 0
        && $o['migrate_ok'] && $o['disk_steps_page'] && $o['disk_dynamic_engine']
        && $o['disk_migrate_sql'] && $o['disk_migrate_js']
        && $o['disk_settings_no_form'] && $o['disk_step_has_form'] && $o['disk_forms_page']
        && $o['disk_specialty_delete'] && $o['disk_usage_guard']
        && $o['disk_catalog'] && $o['disk_overrides_schema'] && $o['disk_ff_page'] && $o['disk_ff_manager']
        && $o['disk_migrate_0032_legacy_sql'] && $o['disk_migrate_0032_legacy_js']
        && $o['disk_migrate_0033_sql'] && $o['disk_migrate_0033_js']
        && $o['disk_detail_meta'] && $o['disk_detail_editor'] && $o['disk_detail_actions']
        && $o['disk_export_model'] && $o['disk_detail_export'] && $o['disk_detail_button']);
'''
fm = fm.replace(old_ok, new_ok, 1)

# ۴چ — پاک‌سازی بقایای همهٔ دوره‌ها + زیپ‌های کهن
old_zips = "    @unlink($H . '/noor-patch-2210.zip'); @unlink($H . '/noor-patch-2220.zip'); @unlink($H . '/noor-patch-2230.zip'); @unlink($H . '/noor-patch-2240.zip'); @unlink($H . '/noor-patch-2250.zip');"
assert old_zips in fm
fm = fm.replace(old_zips, old_zips + " @unlink($H . '/noor-patch-2260.zip'); @unlink($H . '/noor-patch-2270.zip');", 1)
old_list = "foreach (['cr2190.php', 'mh2210.php', 'mh2280.php', 'probe2193.php', 'diskprobe2230.php', 'ex2230p.php', 'rst2230.php', 'ex2240p.php', 'rst2240.php', 'ex2250p.php', 'rst2250.php'] as $p) @unlink($H . '/public_html/' . $p);"
assert old_list in fm, "residue list shape changed"
fm = fm.replace(old_list, "foreach (['cr2190.php', 'mh2210.php', 'mh2260.php', 'mh2270.php', 'mh2280.php', 'probe2193.php', 'diskprobe2230.php', 'ex2230p.php', 'rst2230.php', 'ex2240p.php', 'rst2240.php', 'ex2250p.php', 'rst2250.php', 'ex2260p.php', 'rst2260.php', 'ex2270p.php', 'rst2270.php', 'ex2280p.php', 'rst2280.php'] as $p) @unlink($H . '/public_html/' . $p);", 1)
write("scripts/deploy-2210/fileman-patch-2280.py", fm)

# ---------------- ۵) wrapper یک‌دستوری ----------------
wrap = read("scripts/deploy-2260.sh").replace("2260", "2280").replace("۲.۲۶.۰", "۲.۲۸.۰").replace("۰۰۳۲", "۰۰۳۳")
write("scripts/deploy-2280.sh", wrap)

print("ALL 2280 TOOLING GENERATED")
