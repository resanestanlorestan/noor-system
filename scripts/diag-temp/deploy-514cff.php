<?php
// deploy-514cff v2 — بازچینی باندل از بخش‌های base64 + راستی‌آزمایی sha256 + استخراج ZipArchive.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(600);
$target  = '/home/epqoisdl';
$zipFile = $target . '/noor-slim-2122.zip';
$sha     = 'eeb5be5daf7f07a796fd8ea7e93fef8e2a13392ceb6cb4d11dfd5b94cfef3911';
$size    = 26936530;
$nb64    = 13;

function shaOf($f) { return hash_file('sha256', $f); }

$fullOk = is_file($zipFile) && shaOf($zipFile) === $sha;
echo "full zip: ", $fullOk ? "VALID" : (is_file($zipFile) ? "INVALID(" . filesize($zipFile) . ")" : "MISSING"), "\n";

if (!$fullOk) {
  $parts = glob($target . '/noor-2122-b64.*');
  natsort($parts);
  echo "b64 parts found: ", count($parts), " (need $nb64)\n";
  if (count($parts) >= $nb64) {
    $out = @fopen($zipFile, 'wb');
    if (!$out) { echo "ZIP_WRITE_FAILED\n"; exit(1); }
    foreach ($parts as $p) {
      $raw = base64_decode((string)file_get_contents($p), true);
      if ($raw === false || $raw === '') { echo "PART_DECODE_FAILED: ", basename($p), "\n"; fclose($out); exit(1); }
      fwrite($out, $raw);
    }
    fclose($out);
    clearstatcache();
    echo "assembled: ", filesize($zipFile), " bytes\n";
    if (shaOf($zipFile) !== $sha) { echo "SHA_MISMATCH after assembly\n"; exit(1); }
    echo "sha256 OK\n";
    foreach ($parts as $p) @unlink($p);
    echo "b64 parts removed\n";
  } else {
    echo "INSUFFICIENT_PARTS — آپلود بخش‌ها کامل نیست\n";
    exit(1);
  }
}

// پاک‌سازی part های کهنهٔ نشست قبل (با زیپ معتبرِ تأییدشده)
foreach (glob($target . '/noor-slim-2122.zip.*.part') ?: [] as $old) { @unlink($old); echo "stale removed: ", basename($old), "\n"; }

if (!class_exists('ZipArchive')) { echo "NO_ZIPARCHIVE\n"; exit(1); }
$zip = new ZipArchive();
if ($zip->open($zipFile) !== true) { echo "ZIP_OPEN_FAILED\n"; exit(1); }
echo "entries: ", $zip->numFiles, "\n";
if (!$zip->extractTo($target)) { echo "EXTRACT_FAILED\n"; exit(1); }
$zip->close();
echo "extracted OK\n";
if (!is_dir($target . '/noor-system/tmp')) @mkdir($target . '/noor-system/tmp', 0755, true);
@touch($target . '/noor-system/tmp/restart.txt');
@touch($target . '/.v2180-real-done');
echo "restart touched + marker .v2180-real-done\n";
$pkg = (string)@file_get_contents($target . '/noor-system/package.json');
echo "version: ", preg_match('/"version":\s*"([^"]+)"/', $pkg, $m) ? $m[1] : '?', "\n";
echo "build_id: ", @file_get_contents($target . '/noor-system/.next/standalone/.next/BUILD_ID') ?: '?', "\n";
echo "env intact: ", is_file($target . '/noor-system/.env') ? "YES" : "NO!!", "\n";
echo "== deploy done ==\n";
