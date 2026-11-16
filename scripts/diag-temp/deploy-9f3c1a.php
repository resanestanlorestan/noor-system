<?php
// deploy-9f3c1a — بازکردن بستهٔ noor-slim-2121.zip روی هاست بدون shell_exec:
// ZipArchive → استخراج با بازنویسی بر .env و .private-app موجود + ری‌استارت Passenger.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'Kv83mZQ1pLw4') { echo "FORBIDDEN"; exit; }
set_time_limit(600);
$zipFile = '/home/epqoisdl/noor-slim-2121.zip';
$target = '/home/epqoisdl';
if (!class_exists('ZipArchive')) { echo "NO_ZIPARCHIVE\n"; exit(1); }
clearstatcache();
if (!file_exists($zipFile) || filesize($zipFile) < 1000000) { echo "ZIP_MISSING_OR_SMALL: ", filesize($zipFile) ?: 0, "\n"; exit(1); }
echo "zip size: ", filesize($zipFile), "\n";
$zip = new ZipArchive();
if ($zip->open($zipFile) !== true) { echo "ZIP_OPEN_FAILED\n"; exit(1); }
echo "entries: ", $zip->numFiles, "\n";
if (!$zip->extractTo($target)) { echo "EXTRACT_FAILED\n"; exit(1); }
$zip->close();
echo "extracted OK\n";
if (!is_dir('/home/epqoisdl/noor-system/tmp')) @mkdir('/home/epqoisdl/noor-system/tmp', 0755, true);
@touch('/home/epqoisdl/noor-system/tmp/restart.txt');
echo "restart touched\n";
echo "version: ";
echo @file_get_contents('/home/epqoisdl/noor-system/package.json') ? (preg_match('/"version":\s*"([^"]+)"/', file_get_contents('/home/epqoisdl/noor-system/package.json'), $m) ? $m[1] : '?') : '?';
echo "\n";
// نسخهٔ بیلد .next برای تطبیق با محلی
$bid = @file_get_contents('/home/epqoisdl/noor-system/.next/standalone/.next/BUILD_ID');
echo "build_id: ", $bid ?: '?', "\n";
echo "== deploy done ==\n";
