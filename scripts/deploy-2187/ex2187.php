<?php
// استاب استخراج ۲.۱۸.۷ — الگوی extract2185v2/ex2186: گیت sha256، بکاپ کانفیگ،
// استخراج محافظت‌شده، وریفای شش‌گانه (BUILD_ID، نسخه، .env، cms، مایگریشن 0027) و خودحذف.
// توجه: ری‌استارت اینجا انجام نمی‌شود؛ مایگریشن 0027 پیش از ری‌استارت اجرا می‌گردد
// تا کد تازه (که last_seen_at را می‌خواند) روی ستون موجود بالا بیاید.
header('Content-Type: application/json');
set_time_limit(300);
$H = '/home/epqoisdl';
$APP = $H . '/noor-system';
$ZIP = $H . '/noor-slim-2.18.7.zip';
$EXPECT = '250c3693703987f9531c38daeca1fe207f36ff9a079bebae5decad5eaf34b59e';
$o = ['ok' => false];
function rd($p) { $h = fopen($p, 'rb'); $s = ''; while (!feof($h)) { $s .= fread($h, 65536); } fclose($h); return $s; }
$LOG = '/home/epqoisdl/public_html/.x2187.json';
function logstep($arr) { global $LOG; $arr['at'] = round(microtime(true) * 1000); @file_put_contents($LOG, json_encode($arr, JSON_UNESCAPED_SLASHES)); }
logstep(['stage' => 'started']);
try {
    if (!is_file($ZIP)) throw new Exception('zip missing');
    $o['zip_bytes'] = filesize($ZIP);
    $hash = hash_file('sha256', $ZIP);
    if ($hash !== $EXPECT) throw new Exception('sha mismatch: ' . $hash);
    $o['sha_ok'] = true;
    logstep(['stage' => 'sha_ok']);
    $bk = $H . '/bk-2187';
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
    $o['migration_0027'] = is_file($APP . '/drizzle/0027-session-last-seen.sql') ? 'yes' : 'no';
    $o['idle_component'] = is_file($APP . '/src/components/idle-timeout.tsx') ? 'yes' : 'no';
    $o['ok'] = ($o['build_id'] === 'Y3ql0jqSHhq8ZT9envRjt' && $o['pkg_version'] === '2.18.7' && $o['env_intact'] > 0 && $o['cms_lib'] === 'yes' && $o['migration_0027'] === 'yes' && $o['idle_component'] === 'yes');
    logstep(['stage' => 'verified', 'ok' => $o['ok'], 'detail' => [$o['build_id'], $o['pkg_version'], $o['env_intact'], $o['migration_0027'] ?? null, $o['idle_component'] ?? null]]);
} catch (Throwable $e) {
    $o['error'] = $e->getMessage();
    logstep(['stage' => 'error', 'error' => $o['error']]);
}
if (!empty($o['ok'])) { @unlink($ZIP); @unlink($LOG); }
@unlink(__FILE__);
echo json_encode($o, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
