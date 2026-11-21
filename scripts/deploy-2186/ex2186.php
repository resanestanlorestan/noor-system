<?php
// استاب استخراج ۲.۱۸.۶ — الگوی extract2185v2.php: گیت sha256، بکاپ کانفیگ،
// استخراج محافظت‌شده، وریفای پنج‌گانه، ری‌استارت با touch و خودحذف.
header('Content-Type: application/json');
set_time_limit(300);
$H = '/home/epqoisdl';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-slim-2.18.6.zip';
$EXPECT = 'f22dc63c906cd4cfc9c5ec5e12a7734ce13d5422932e2f295ed00fa435de641d';
$o = ['ok' => false];
function rd($p) { $h = fopen($p, 'rb'); $s = ''; while (!feof($h)) { $s .= fread($h, 65536); } fclose($h); return $s; }
$LOG = '/home/epqoisdl/public_html/.x2186.json';
function logstep($arr) { global $LOG; $arr['at'] = round(microtime(true) * 1000); @file_put_contents($LOG, json_encode($arr, JSON_UNESCAPED_SLASHES)); }
logstep(['stage' => 'started', 'parts_found' => count(@glob('/home/epqoisdl/cpart-*') ?: [])]);
try {
    if (!is_file($ZIP)) throw new Exception('zip missing');
    $o['zip_bytes'] = filesize($ZIP);
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    logstep(['stage' => 'sha_ok']);
    $bk = $H . '/bk-2186';
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
    $o['cms_lib'] = is_file($APP . '/src/lib/site-content.ts') ? 'yes' : 'no';
    $o['migration_0026'] = is_file($APP . '/drizzle/0026-site-logo.sql') ? 'yes' : 'no';
    $o['logo_page'] = is_file($APP . '/src/app/(workspace)/cms/logo/page.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['build_id'] === 'dGWtIqVSRXOJPyjC7dggT' && $o['pkg_version'] === '2.18.6' && $o['env_intact'] > 0 && $o['cms_lib'] === 'yes' && $o['migration_0026'] === 'yes');
    logstep(['stage' => 'verified', 'ok' => $o['ok'], 'detail' => [$o['build_id'], $o['pkg_version'], $o['env_intact'], $o['cms_lib'] ?? null, $o['migration_0026'] ?? null]]);
    if ($o['ok']) {
        @touch($APP . '/server.js');
        $o['touched'] = true;
        logstep(['stage' => 'done']);
    }
} catch (Throwable $e) {
    $o['error'] = $e->getMessage();
    logstep(['stage' => 'error', 'error' => $o['error']]);
}
if (!empty($o['ok'])) { @unlink($ZIP); @unlink($LOG); }
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
