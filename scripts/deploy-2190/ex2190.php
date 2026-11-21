<?php
// استاب استخراج ۲.۱۹.۰ — گیت sha256، بکاپ کانفیگ، استخراج محافظت‌شده، وریفای
// (BUILD_ID، نسخه، .env، کلاس‌ها، مایگریشن 0028) و خودحذف؛ مایگریشن پس از آن
// و پیش از ری‌استارت اجرا می‌شود تا کد تازه روی جدول‌های موجود بالا بیاید.
header('Content-Type: application/json');
set_time_limit(300);
$H = '/home/epqoisdl';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-slim-2.19.0.zip';
$EXPECT = 'e13051637bfed89385f1f1ffbda71c93f618c92b053edfa06ded2e1263cb641a';
$o = ['ok' => false];
function rd($p) { $h = fopen($p, 'rb'); $s = ''; while (!feof($h)) { $s .= fread($h, 65536); } fclose($h); return $s; }
$LOG = '/home/epqoisdl/public_html/.x2190.json';
function logstep($arr) { global $LOG; $arr['at'] = round(microtime(true) * 1000); @file_put_contents($LOG, json_encode($arr, JSON_UNESCAPED_SLASHES)); }
logstep(['stage' => 'started']);
try {
    if (!is_file($ZIP)) throw new Exception('zip missing');
    $o['zip_bytes'] = filesize($ZIP);
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    logstep(['stage' => 'sha_ok']);
    $bk = $H . '/bk-2190';
    if (!is_dir($bk)) @mkdir($bk, 0700, true);
    foreach (['.env', 'server.js', 'package.json'] as $f) {
        if (is_file($APP . '/' . $f)) @copy($APP . '/' . $f, $bk . '/' . $f);
    }
    $o['backup_ok'] = is_file($bk . '/.env') && is_file($bk . '/server.js');
    logstep(['stage' => 'backup_done', 'backup_ok' => $o['backup_ok']]);
    $zip = new ZipArchive();
    if ($zip->open($ZIP) !== true) throw new Exception('zip open fail');
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $n = $zip->getNameIndex($i);
        $b = basename($n);
        if ($b === '.htaccess' || $b === '.env') throw new Exception('protected file inside zip: ' . $n);
    }
    $o['entries'] = $zip->numFiles;
    if (!$zip->extractTo($H)) throw new Exception('extract fail');
    $zip->close();
    clearstatcache();
    logstep(['stage' => 'extracted']);
    $o['build_id'] = is_file($APP . '/.next/standalone/.next/BUILD_ID') ? trim(@file_get_contents($APP . '/.next/standalone/.next/BUILD_ID')) : 'no';
    $pkg = json_decode(rd($APP . '/package.json'), true);
    $o['pkg_version'] = is_array($pkg) ? ($pkg['version'] ?? '?') : 'parse-fail';
    $o['env_intact'] = is_file($APP . '/.env') ? filesize($APP . '/.env') : 0;
    $o['classes_lib'] = is_file($APP . '/src/lib/classes.ts') ? 'yes' : 'no';
    $o['migration_0028'] = is_file($APP . '/drizzle/0028-classes.sql') ? 'yes' : 'no';
    $o['classes_page'] = is_file($APP . '/src/app/(workspace)/classes/page.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['build_id'] === 'mNeS4Pt4mTj2yMD66pir2' && $o['pkg_version'] === '2.19.0' && $o['env_intact'] > 0 && $o['classes_lib'] === 'yes' && $o['migration_0028'] === 'yes' && $o['classes_page'] === 'yes');
    logstep(['stage' => 'verified', 'ok' => $o['ok'], 'detail' => [$o['build_id'], $o['pkg_version'], $o['env_intact'], $o['migration_0028'] ?? null]]);
} catch (Throwable $e) {
    $o['error'] = $e->getMessage();
    logstep(['stage' => 'error', 'error' => $o['error']]);
}
if (!empty($o['ok'])) { @unlink($ZIP); @unlink($LOG); }
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
