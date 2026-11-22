<?php
// استاب استخراج/ری‌استارت ۲.۲۰.۰ بر پایهٔ زیپ موجود روی هاست (پس از شکست کوتا)
// گیت sha256 → صفر کردن قطعات (آزادسازی) → بکاپ کانفیگ → گیت محافظت/CSS →
// استخراج → گیت‌های پس از استخراج → صفر کردن زیپ → کشتن next-server (ری‌استارت) → خودحذف
header('Content-Type: application/json');
set_time_limit(300);
$K = 'xK7Qp2Wm9Rt4Vb6N';
if (!hash_equals($K, $_GET['k'] ?? '')) { http_response_code(403); exit; }
$H = '/home/epqoisdl';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-slim-2.20.0.zip';
$EXPECT = '601869a2ad4f91dcca99999a8c4624bc36b8bcc4aff9c9845ca84e6953914175';
$o = ['ok' => false];
function rd($p) { $h = fopen($p, 'rb'); $s = ''; while (!feof($h)) { $s .= fread($h, 65536); } fclose($h); return $s; }
function sh($c, $t=15){ $d=[1=>['pipe','w'],2=>['pipe','w']]; $p=proc_open($c,$d,$pipes); stream_set_blocking($pipes[1],false); stream_set_blocking($pipes[2],false); $o=''; $e=time()+$t; while(time()<$e){ $r=[$pipes[1],$pipes[2]]; $w=null; $x=null; if(!stream_select($r,$w,$x,1))continue; foreach($r as $s){ $o.=fread($s,4096);} if(!proc_get_status($p)['running'])break; } proc_close($p); return $o; }
try {
    if (!is_file($ZIP)) throw new Exception('zip missing');
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    $freed = 0;
    foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) { $sz = filesize($p); if (@file_put_contents($p, '') !== false) { $freed += $sz; } }
    $o['parts_freed'] = $freed;
    clearstatcache();
    $o['df_before'] = trim(sh("df -h {$H} 2>&1 | tail -1", 5));
    $bk = $H . '/bk-2200';
    if (!is_dir($bk)) @mkdir($bk, 0700, true);
    foreach (['.env', 'server.js', 'package.json'] as $f) if (is_file($APP . '/' . $f)) @copy($APP . '/' . $f, $bk . '/' . $f);
    $o['backup_ok'] = is_file($bk . '/.env') && is_file($bk . '/server.js');
    $zip = new ZipArchive();
    if ($zip->open($ZIP) !== true) throw new Exception('zip open fail');
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $b = basename($zip->getNameIndex($i));
        if ($b === '.htaccess' || $b === '.env') throw new Exception('protected file inside zip');
    }
    $o['entries'] = $zip->numFiles;
    $css = (string)$zip->getFromName('noor-system/src/app/workspace.css');
    $o['css_has_actions'] = strpos($css, 'edu-tab') !== false;
    $o['css_navy_sidebar'] = strpos($css, '0e2148') !== false;
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    $o['build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $pkg = json_decode(rd($APP . '/package.json'), true);
    $o['pkg_version'] = is_array($pkg) ? ($pkg['version'] ?? '?') : 'parse-fail';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $o['classes_lib'] = is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no';
    $o['classes_page'] = is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['build_id'] === 'OHNNXiOg408HE9OTWX3PO' && $o['pkg_version'] === '2.20.0' && $o['env_intact'] > 0
        && $o['classes_lib'] === 'yes' && $o['classes_page'] === 'yes' && $o['css_has_actions'] && $o['css_navy_sidebar']);
} catch (Throwable $e) { $o['error'] = $e->getMessage(); }
if (!empty($o['ok'])) {
    @file_put_contents($ZIP, '');
    $cmd = "for p in /proc/[0-9]*/; do cwd=\$(readlink \${p}cwd 2>/dev/null); case \"\$cwd\" in */noor-system*) comm=\$(cat \${p}comm 2>/dev/null); case \"\$comm\" in next-server*) kill -9 \$(basename \$p) 2>/dev/null && echo \"killed \$(basename \$p)\";; esac;; esac; done";
    $o['kill'] = trim((string)sh($cmd, 12));
    $o['df_after'] = trim(sh("df -h {$H} 2>&1 | tail -1", 5));
    foreach ((glob($H . '/noor-part-*.b64.txt') ?: []) as $p) @unlink($p);
    @unlink($H . '/public_html/.up2200.json');
}
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES);
