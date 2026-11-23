#!/usr/bin/env python3
# استقرار پچی ۲.۲۸.۱ — خط لولهٔ پچی md5 بدون مایگریشن (تغییر DB ندارد).
# (۱) گیت‌های محتوایی زیپ: ویرایشگر «فهرست گزینه‌ها» (ویرایش + ذخیره و بعدی)،
# CSS کادر مرئی، حذف detailSavedAt، BUILD_ID و نسخهٔ دوگانهٔ 2.28.1؛ مدخل‌های
# تغییر‌نیافتهٔ ۲.۲۲ تا ۲.۲۸ در پچ تفاوتی‌محور نیستند و کنترلشان به گیت‌های
# دیسک پس از اکسترکت واگذار می‌شود (خالی‌پذیر در گیت زیپ).
# (۲) اکسترکت overlay، بکاپ کانفیگ، وریفای دیسک شامل رگرسیون ۲.۲۲ تا ۲.۲۸؛
# (۳) ری‌استارت + سلامت نسخهٔ 2.28.1؛ پاک‌سازی بقایا؛ خودحذف.
import base64, json, os, re, secrets, subprocess, sys, time, urllib.request

CREDS = "/home/z/my-project/scripts/.cp-creds"
PATCH = "/home/z/my-project/download/noor-patch-2281.zip"
META = json.load(open("/tmp/patch-meta-2281.json"))
PATCH_SHA = META["sha"]
BUILD_ID = open("/home/z/my-project/.next/standalone/.next/BUILD_ID").read().strip()
VERSION = "2.28.1"
JAR = "/tmp/cp-2281.jar"
HDR = "/tmp/cp-2281-hdr.txt"
BASE = "https://pouyafarhadi.ir"

txt = open(CREDS).read()
HOST = re.search(r"CP_HOST='([^']+)'", txt).group(1)
USER = re.search(r"CP_USER='([^']+)'", txt).group(1)
PASS = re.search(r"CP_PASS='([^']+)'", txt).group(1)
HOME = f"/home/{USER}"

sess = None
for attempt in range(4):
    subprocess.run(["curl", "-sk", "--max-time", "40", "-c", JAR, "-D", HDR, "-o", "/dev/null",
                    f"https://{HOST}:2083/login", "--data-urlencode", f"user={USER}",
                    "--data-urlencode", f"pass={PASS}", "-H", "User-Agent: Mozilla/5.0"], check=False)
    try:
        m = re.search(r"cpsess\d+", open(HDR).read()); sess = m.group(0) if m else None
    except FileNotFoundError:
        sess = None
    if sess: break
    time.sleep(5)
if not sess:
    print(json.dumps({"error": "LOGIN_FAILED"})); sys.exit(1)
print("cpanel session ready", flush=True)


def save_file(name, content_path, directory, timeout=120):
    for attempt in range(5):
        out = subprocess.run(["curl", "-sk", "--max-time", str(timeout), "-b", JAR,
                              f"https://{HOST}:2083/{sess}/execute/Fileman/save_file_content",
                              "-H", "User-Agent: Mozilla/5.0",
                              "--data-urlencode", f"dir={directory}",
                              "--data-urlencode", f"file={name}",
                              "--data-urlencode", "utf8=1",
                              "--data-urlencode", f"content@{content_path}"],
                             capture_output=True, text=True).stdout
        if '"status":1' in out:
            print(f"SAVE {name}: OK", flush=True); return True
        print(f"SAVE {name} try{attempt}:", out[:110], flush=True)
        time.sleep(10 + 5 * attempt)
    return False


def hit(url, timeout=300):
    # curl-based: روی ۴۰۳ استثنا نمی‌پرد و کد + بدنه را برمی‌گرداند تا
    # چالش BitNinja قابل تشخیص باشد و بدون شکستن پکیج با انتظار دوباره تلاش شود.
    out = subprocess.run(["curl", "-sk", "--max-time", str(timeout), "-w", "\n%{http_code}",
                          url, "-H", "User-Agent: Mozilla/5.0"],
                         capture_output=True, text=True)
    body = out.stdout
    text, _, code = body.rpartition("\n")
    return code.strip(), text


EX_TOKEN, RS_TOKEN = (secrets.token_hex(16) for _ in range(2))
STUB = f"""<?php
// استاب پچ ۲.۲۸.۱ — اسمبل قطعه‌ها با حذف فوری، گیت sha/BUILD_ID/نسخهٔ دوگانه،
// گیت‌های محتوایی ویرایشگر گزینه‌ها (بدون مایگریشن — تغییر DB ندارد)،
// اکسترکت overlay، بکاپ کانفیگ، وریفای دیسک (شامل رگرسیون ۲.۲۲ تا ۲.۲۸)،
// پاک‌سازی بی‌قیدوشرط؛ خودحذف.
header('Content-Type: application/json');
set_time_limit(300);
$K = '{EX_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$H = '{HOME}';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-patch-2281.zip';
$EXPECT = '{PATCH_SHA}';
$o = ['ok' => false];
try {{
    $parts = glob($H . '/noor-patch-part-*.b64.txt');
    $NEED = (int)($_GET['n'] ?? 0);
    if (!$parts || ($NEED > 0 && count($parts) < $NEED)) throw new Exception('parts incomplete: ' . count($parts ?: []) . '/' . $NEED);
    sort($parts);
    $out = @fopen($ZIP, 'wb');
    if (!$out) throw new Exception('zip write fail');
    foreach ($parts as $p) {{ $c = @file_get_contents($p); if ($c === false) throw new Exception('part read fail'); $raw = base64_decode($c, true); if ($raw === false) throw new Exception('part b64 fail'); fwrite($out, $raw); @unlink($p); }}
    fclose($out);
    foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);
    foreach (['2210', '2220', '2230', '2240', '2250', '2260', '2270', '2280'] as $v) @unlink($H . '/noor-patch-' . $v . '.zip');
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    $bk = $H . '/bk-2281';
    if (!is_dir($bk)) @mkdir($bk, 0700, true);
    foreach (['.env', 'server.js', 'package.json'] as $f) if (is_file($APP . '/' . $f)) @copy($APP . '/' . $f, $bk . '/' . $f);
    $o['backup_ok'] = is_file($bk . '/.env') && is_file($bk . '/server.js');
    $zip = new ZipArchive();
    if ($zip->open($ZIP) !== true) throw new Exception('zip open fail');
    for ($i = 0; $i < $zip->numFiles; $i++) {{
        $b = basename($zip->getNameIndex($i));
        if ($b === '.htaccess' || $b === '.env' || $b === '.cp-creds') throw new Exception('protected file inside patch');
    }}
    $o['entries'] = $zip->numFiles;
    // گیت‌های زیپ ۲.۲۸.۱ — فقط مدخل‌های تضمینیِ همین پچ تفاوتی‌محور؛
    // فایل‌های تغییر‌نیافتهٔ دوره‌های قبل خالی‌پذیرند (کنترل در گیت دیسک)
    $ed = (string)$zip->getFromName('noor-system/src/components/specialty-fields-editor.tsx');
    $o['zip_detail_editor'] = $ed === '' ? false : strpos($ed, 'ذخیره و بعدی') !== false && strpos($ed, 'labelRefs') !== false;
    $css = (string)$zip->getFromName('noor-system/src/app/workspace.css');
    $o['zip_css_visible_inputs'] = $css === '' ? false : strpos($css, '.spec-option-save') !== false && strpos($css, 'spec-option-label input:focus') !== false;
    $acts = (string)$zip->getFromName('noor-system/src/app/actions/forms.ts');
    $o['zip_actions_no_savedat'] = $acts === '' ? false : strpos($acts, 'detailSavedAt') === false && strpos($acts, 'saveSpecialtyDetailAction') !== false;
    $pgf = (string)$zip->getFromName('noor-system/src/app/(workspace)/forms/page.tsx');
    $o['zip_forms_page_no_savedat'] = $pgf === '' ? false : strpos($pgf, 'detailSavedAt') === false && strpos($pgf, 'SpecialtyFieldsEditor') !== false;
    // رگرسیون‌های پیشین در پچ خالی‌پذیرند؛ کنترلشان در گیت دیسک است
    $stepsP = (string)$zip->getFromName('noor-system/src/app/(workspace)/steps/page.tsx');
    $o['zip_steps_page'] = $stepsP === '' ? true : strpos($stepsP, 'StepsManager') !== false;
    $engine = (string)$zip->getFromName('noor-system/src/lib/case-steps.ts');
    $o['zip_dynamic_engine'] = $engine === '' ? true : strpos($engine, 'loadActiveCaseSteps') !== false;
    $mig33 = (string)$zip->getFromName('noor-system/drizzle/0033-specialty-detail-overrides.sql');
    $o['zip_migrate_0033_sql'] = $mig33 === '' ? true : $mig33 !== '';
    $bid = (string)$zip->getFromName('noor-system/.next/standalone/.next/BUILD_ID');
    $o['zip_build_id'] = trim($bid) === '{BUILD_ID}';
    $spj = json_decode((string)$zip->getFromName('noor-system/.next/standalone/package.json'), true);
    $o['zip_standalone_version'] = is_array($spj) ? ($spj['version'] ?? '?') : '?';
    $tpj = json_decode((string)$zip->getFromName('noor-system/package.json'), true);
    $o['zip_top_version'] = is_array($tpj) ? ($tpj['version'] ?? '?') : '?';
    if (!($o['zip_detail_editor'] && $o['zip_css_visible_inputs'] && $o['zip_actions_no_savedat'] && $o['zip_forms_page_no_savedat'] && $o['zip_build_id'] && $o['zip_standalone_version'] === '{VERSION}' && $o['zip_top_version'] === '{VERSION}')) throw new Exception('patch gate fail');
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    // وریفای دیسک: نسخهٔ دوگانه، سلامت فایل محیط، گیت‌های تازهٔ ۲.۲۸.۱ و
    // رگرسیون کامل ۲.۲۲ تا ۲.۲۸ (مراحل پویا، کاتالوگ، اکسل، حذف تخصص، ۰۰۳۳)
    $o['disk_build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $td = json_decode((string)@file_get_contents($APP . '/package.json'), true);
    $o['disk_top_version'] = is_array($td) ? ($td['version'] ?? '?') : '?';
    $sd = json_decode((string)@file_get_contents($APP . '/.next/standalone/package.json'), true);
    $o['disk_standalone_version'] = is_array($sd) ? ($sd['version'] ?? '?') : '?';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $edD = (string)@file_get_contents($APP . '/src/components/specialty-fields-editor.tsx');
    $o['disk_detail_editor_new'] = strpos($edD, 'ذخیره و بعدی') !== false && strpos($edD, 'labelRefs') !== false;
    $o['disk_detail_editor_old'] = strpos($edD, 'saveSpecialtyDetailAction') !== false;
    $cssD = (string)@file_get_contents($APP . '/src/app/workspace.css');
    $o['disk_css_new'] = strpos($cssD, '.spec-option-save') !== false;
    $actsD = (string)@file_get_contents($APP . '/src/app/actions/forms.ts');
    $o['disk_actions_no_savedat'] = strpos($actsD, 'detailSavedAt') === false && strpos($actsD, 'saveSpecialtyDetailAction') !== false;
    $pgD = (string)@file_get_contents($APP . '/src/app/(workspace)/forms/page.tsx');
    $o['disk_forms_page_no_savedat'] = strpos($pgD, 'detailSavedAt') === false && strpos($pgD, 'FormBuilder') !== false;
    $o['disk_steps_page'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/steps/page.tsx'), 'StepsManager') !== false;
    $o['disk_dynamic_engine'] = strpos((string)@file_get_contents($APP . '/src/lib/case-steps.ts'), 'loadActiveCaseSteps') !== false;
    $o['disk_migrate_sql'] = is_file($APP . '/drizzle/0031-case-step-definitions.sql');
    $o['disk_migrate_js'] = is_file($APP . '/host-migrate-2250.js');
    $o['disk_catalog'] = strpos((string)@file_get_contents($APP . '/src/lib/case-field-catalog.ts'), 'CASE_FIELD_CATALOG') !== false;
    $o['disk_overrides_schema'] = strpos((string)@file_get_contents($APP . '/src/db/schema.ts'), 'caseFieldOverrides') !== false;
    $o['disk_ff_page'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/steps/page.tsx'), 'FixedFieldsManager') !== false;
    $o['disk_ff_manager'] = strpos((string)@file_get_contents($APP . '/src/components/fixed-fields-manager.tsx'), 'saveFieldOverrideAction') !== false;
    $o['disk_detail_meta'] = strpos((string)@file_get_contents($APP . '/src/lib/specialty-detail-meta.ts'), 'loadSpecialtyDetailMeta') !== false;
    $o['disk_migrate_0032_legacy_sql'] = is_file($APP . '/drizzle/0032-case-field-overrides.sql');
    $o['disk_migrate_0032_legacy_js'] = is_file($APP . '/host-migrate-2260.js');
    $o['disk_export_model'] = strpos((string)@file_get_contents($APP . '/src/lib/case-export-model.ts'), 'buildFullInfoSheet') !== false;
    $o['disk_detail_export'] = strpos((string)@file_get_contents($APP . '/src/app/api/cases/[id]/export/route.ts'), 'export_case_detail') !== false;
    $o['disk_detail_button'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/cases/[id]/page.tsx'), 'خروجی اکسل') !== false;
    $o['disk_migrate_0033_sql'] = is_file($APP . '/drizzle/0033-specialty-detail-overrides.sql');
    $o['disk_migrate_0033_js'] = is_file($APP . '/host-migrate-2280.js');
    $o['disk_settings_no_form'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/settings/page.tsx'), 'OrganizationForm') === false;
    $o['disk_step_has_form'] = strpos((string)@file_get_contents($APP . '/src/app/(workspace)/cases/[id]/steps/[step]/page.tsx'), 'OrganizationForm') !== false;
    $o['disk_specialty_delete'] = strpos((string)@file_get_contents($APP . '/src/components/specialties-manager.tsx'), 'deleteSpecialtyAction') !== false;
    $o['disk_usage_guard'] = is_file($APP . '/src/lib/specialty-usage.ts');
    $o['ok'] = ($o['disk_build_id'] === '{BUILD_ID}' && $o['disk_top_version'] === '{VERSION}'
        && $o['disk_standalone_version'] === '{VERSION}' && $o['env_intact'] > 0
        && $o['disk_detail_editor_new'] && $o['disk_detail_editor_old'] && $o['disk_css_new']
        && $o['disk_actions_no_savedat'] && $o['disk_forms_page_no_savedat']
        && $o['disk_steps_page'] && $o['disk_dynamic_engine']
        && $o['disk_migrate_sql'] && $o['disk_migrate_js']
        && $o['disk_settings_no_form'] && $o['disk_step_has_form']
        && $o['disk_specialty_delete'] && $o['disk_usage_guard']
        && $o['disk_catalog'] && $o['disk_overrides_schema'] && $o['disk_ff_page'] && $o['disk_ff_manager']
        && $o['disk_migrate_0032_legacy_sql'] && $o['disk_migrate_0032_legacy_js']
        && $o['disk_migrate_0033_sql'] && $o['disk_migrate_0033_js']
        && $o['disk_detail_meta']
        && $o['disk_export_model'] && $o['disk_detail_export'] && $o['disk_detail_button']);
}} catch (Throwable $e) {{ $o['error'] = $e->getMessage(); }}
// پاک‌سازی بی‌قیدوشرط بعد از تلاش؛ هیچ چک به نتیجهٔ پاک‌سازی وابسته نیست
foreach ((glob($H . '/noor-patch-part-*.b64.txt') ?: []) as $p) @unlink($p);
foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);
if (!empty($o['ok'])) @unlink($ZIP);
@unlink($APP . '/scripts/.cp-creds');
$o['creds_gone'] = !is_file($APP . '/scripts/.cp-creds');
// بقایای استاب‌های دوره‌های پیشین public_html
foreach ((glob($H . '/public_html/rc-*.php') ?: []) as $p) @unlink($p);
foreach (['cr2190.php', 'mh2210.php', 'mh2260.php', 'mh2270.php', 'mh2280.php', 'mh2281.php', 'probe2193.php', 'diskprobe2230.php', 'ex2230p.php', 'rst2230.php', 'ex2240p.php', 'rst2240.php', 'ex2250p.php', 'rst2250.php', 'ex2260p.php', 'rst2260.php', 'ex2270p.php', 'rst2270.php', 'ex2280p.php', 'rst2280.php', 'ex2281p.php', 'rst2281.php'] as $p) @unlink($H . '/public_html/' . $p);
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""
tmp = "/tmp/ex2281p.php"
open(tmp, "w").write(STUB)
if not save_file("ex2281p.php", tmp, f"{HOME}/public_html"):
    sys.exit("patch stub save failed")
os.unlink(tmp)
time.sleep(1.5)

data = open(PATCH, "rb").read()
CHUNK = 1_500_000
N = (len(data) + CHUNK - 1) // CHUNK
print(f"patch_bytes={len(data)} chunks={N}", flush=True)
for seq in range(1, N + 1):
    part = data[(seq - 1) * CHUNK: seq * CHUNK]
    tmp = f"/tmp/noor-patch-part-{seq:02d}.b64"
    open(tmp, "w").write(base64.b64encode(part).decode())
    if not save_file(f"noor-patch-part-{seq:02d}.b64.txt", tmp, HOME):
        sys.exit(f"patch part {seq} save failed")
    os.unlink(tmp)
    time.sleep(4)

o = None
for attempt in range(4):
    time.sleep(3)
    code, res = hit(f"{BASE}/ex2281p.php?k={EX_TOKEN}&n={N}")
    print(f"EXTRACT try{attempt + 1} code={code}:", res[:1100], flush=True)
    if code != "200" and "anti-robot" in res:
        print("BitNinja challenge — آرام انتظار می‌کنیم (۱۰۰ ثانیه)", flush=True)
        time.sleep(100)
        continue
    try:
        o = json.loads(res)
        break
    except Exception:
        time.sleep(60)
if not isinstance(o, dict):
    sys.exit("EXTRACT_UNREACHABLE")
if not o.get("ok"):
    sys.exit("EXTRACT_GATE_FAIL")

RS = f"""<?php
header('Content-Type: application/json');
$T = '{RS_TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t=15){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}
$before = sh("for p in /proc/[0-9]*/; do c=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$c\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done | head -4");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${{p}}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
echo json_encode(['before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""
tmp = "/tmp/rst2281.php"
open(tmp, "w").write(RS)
if not save_file("rst2281.php", tmp, f"{HOME}/public_html"):
    sys.exit("restart stub save failed")
os.unlink(tmp)
time.sleep(1.5)
time.sleep(3)
code, rbody = hit(f"{BASE}/rst2281.php?t={RS_TOKEN}", 90)
print(f"RESTART code={code}:", rbody[:200], flush=True)
time.sleep(15)

ver = None
for i in range(12):
    code, h = hit(f"{BASE}/api/health/?adv={i}{int(time.time())}", 45)
    print(f"health try {i + 1} code={code}: {h[:90]}", flush=True)
    if f'"version":"{VERSION}"' in h and '"ok":true' in h:
        ver = VERSION
        break
    time.sleep(20)

pages = {}
for path in ["/login", "/", "/settings", "/forms", "/steps", "/api/health/"]:
    code = subprocess.run(["curl", "-sk", "-o", "/dev/null", "-w", "%{http_code}",
                           "--max-time", "30", BASE + path],
                          capture_output=True, text=True).stdout
    pages[path] = code
print(json.dumps({"health_version": ver, "pages": pages}, indent=1))
sys.exit(0 if ver == VERSION and pages.get("/login") == "200" else 1)
