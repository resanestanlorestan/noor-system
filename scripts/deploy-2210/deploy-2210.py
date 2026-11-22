#!/usr/bin/env python3
# قالب‌های استاب استقرار ۲.۲۱.۰ — برگرفته از deploy-2200.py با گیت‌های تازه
# ------------------------------------------------------------------
# EX_STUB: مونتاژ قطعات base64 (مسیر Fileman)، گیت sha256/BUILD_ID/نسخهٔ
# ۲.۲۱.۰ + گیت CSS جدید (.list-remove دکمهٔ حذف اطلاعات پایه) + گیت‌های موروثی
# (سرمه‌ای سایدبار/edu-tab/فایل‌های کلاس‌ها) + گارد فایل محافظت‌شده + بکاپ
# کانفیگ + توکن فراخوان؛ خودحذف. مایگریشن ندارد — الحاقیهٔ ۲.۲۱.۰ فقط کد/UI است.
# RS_STUB: همان الگوی rst2190/2194/2200 — کشتن next-server با cwd */noor-system.

SHA = "25a1ba7b6fd75d30f1bcaa85fff03716813bb8c54a13c3b1d11b031ce54ca8e8"
BUILD_ID = "6F8WtPjSkacCJj0qsRpZr"
VERSION = "2.21.0"

EX_STUB = f"""<?php
// استاب استخراج ۲.۲۱.۰ — گیت sha256/BUILD_ID/نسخه + توکن فراخوان + گارد فایل
// محافظت‌شده + بکاپ کانفیگ + گیت CSS حذف اطلاعات پایه + گیت‌های موروثی؛ خودحذف.
header('Content-Type: application/json');
set_time_limit(300);
$K = '{EX_TOKEN}';
if (!hash_equals($K, $_GET['k'] ?? '')) {{ http_response_code(403); exit; }}
$H = '{HOME}';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-slim-2.21.0.zip';
$EXPECT = '{SHA}';
$o = ['ok' => false];
function rd($p) {{ $h = fopen($p, 'rb'); $s = ''; while (!feof($h)) {{ $s .= fread($h, 65536); }} fclose($h); return $s; }}
try {{
    $parts = glob($H . '/noor-part-*.b64.txt');
    $NEED = (int)($_GET['n'] ?? 0);
    if (!$parts || ($NEED > 0 && count($parts) < $NEED)) throw new Exception('parts incomplete: ' . count($parts ?: []) . '/' . $NEED);
    sort($parts);
    $out = @fopen($ZIP, 'wb');
    if (!$out) throw new Exception('zip write fail');
    $total = 0;
    foreach ($parts as $p) {{ $c = @file_get_contents($p); if ($c === false) throw new Exception('part read fail'); $raw = base64_decode($c, true); if ($raw === false) throw new Exception('part b64 fail'); $total += fwrite($out, $raw); }}
    fclose($out);
    $o['assembled'] = $total;
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    $bk = $H . '/bk-2210';
    if (!is_dir($bk)) @mkdir($bk, 0700, true);
    foreach (['.env', 'server.js', 'package.json'] as $f) if (is_file($APP . '/' . $f)) @copy($APP . '/' . $f, $bk . '/' . $f);
    $o['backup_ok'] = is_file($bk . '/.env') && is_file($bk . '/server.js');
    $zip = new ZipArchive();
    if ($zip->open($ZIP) !== true) throw new Exception('zip open fail');
    for ($i = 0; $i < $zip->numFiles; $i++) {{
        $b = basename($zip->getNameIndex($i));
        if ($b === '.htaccess' || $b === '.env') throw new Exception('protected file inside zip');
    }}
    $o['entries'] = $zip->numFiles;
    $css = (string)$zip->getFromName('noor-system/src/app/workspace.css');
    $o['css_has_actions'] = strpos($css, 'edu-tab') !== false;
    $o['css_navy_sidebar'] = strpos($css, '0e2148') !== false;
    $o['css_list_remove'] = strpos($css, 'list-remove') !== false;
    $acts = (string)$zip->getFromName('noor-system/src/app/actions/management.ts');
    $o['delete_actions'] = strpos($acts, 'deleteCountyAction') !== false && strpos($acts, 'deleteSpecialtyAction') !== false && strpos($acts, 'deleteOrganizationAction') !== false;
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    $o['build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $pkg = json_decode(rd($APP . '/package.json'), true);
    $o['pkg_version'] = is_array($pkg) ? ($pkg['version'] ?? '?') : 'parse-fail';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $o['classes_lib'] = is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no';
    $o['classes_page'] = is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['build_id'] === '{BUILD_ID}' && $o['pkg_version'] === '2.21.0' && $o['env_intact'] > 0
        && $o['classes_lib'] === 'yes' && $o['classes_page'] === 'yes'
        && $o['css_has_actions'] && $o['css_navy_sidebar'] && $o['css_list_remove'] && $o['delete_actions']);
}} catch (Throwable $e) {{ $o['error'] = $e->getMessage(); }}
if (!empty($o['ok'])) {{ foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p); @unlink($ZIP); @unlink('{HOME}/public_html/.up2210.json'); }}
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
"""

RS_STUB = f"""<?php
// استاب ری‌استارت ۲.۲۱.۰ — الگوی rst2190/2194/2200؛ خودحذف.
header('Content-Type: application/json');
$T = '{RS_TOKEN}';
if (!hash_equals($T, $_GET['t'] ?? '')) {{ http_response_code(403); exit; }}
function sh($c, $t=15){{ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){{ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){{ $o.=fread($s,4096);}} if(!proc_get_status($p)['running'])break; }} proc_close($p); return $o; }}
$before = sh("for p in /proc/[0-9]*/; do c=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$c\\\" in */noor-system*) echo \\\"PID=\\$(basename \\$p) \\$(cat \\${{p}}comm 2>/dev/null)\\\";; esac; done | head -4");
$kill = sh("for p in /proc/[0-9]*/; do cwd=\\$(readlink \\${{p}}cwd 2>/dev/null); case \\\"\\$cwd\\\" in */noor-system*) comm=\\$(cat \\${{p}}comm 2>/dev/null); case \\\"\\$comm\\\" in next-server*) kill -9 \\$(basename \\$p) 2>/dev/null && echo \\\"killed \\$(basename \\$p)\\\";; esac;; esac; done", 12);
echo json_encode(['before'=>trim($before), 'kill'=>trim($kill)]);
@unlink(__FILE__);
"""
