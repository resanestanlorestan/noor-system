<?php
// upload-514cff — گیرندهٔ بخش‌های base64 باندل + بررسی part های کهنه.
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(120);

// حالت بررسی: بازچینی part های کهنهٔ noor-slim-2122.zip.NN.part و گزارش sha
if (isset($_GET['check'])) {
  $parts = glob('/home/epqoisdl/noor-slim-2122.zip.*.part');
  natsort($parts);
  if (!$parts) { echo "NO_STALE_PARTS\n"; exit; }
  $tmp = '/home/epqoisdl/.stale-2122-check.bin';
  $out = @fopen($tmp, 'wb');
  foreach ($parts as $p) fwrite($out, (string)file_get_contents($p));
  fclose($out);
  echo "stale parts: ", count($parts), " total=", filesize($tmp), " sha=", hash_file('sha256', $tmp), "\n";
  @unlink($tmp);
  exit;
}

// دریافت بخش: ?idx=NN  — بدنهٔ خام = متن base64 بخش
$idx = isset($_GET['idx']) ? preg_replace('/[^0-9]/', '', $_GET['idx']) : '';
if ($idx === '') { echo "NO_IDX\n"; exit; }
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') { echo "EMPTY_BODY\n"; exit; }
$b64 = trim($raw);
if (!preg_match('/^[A-Za-z0-9+\/=\r\n]+$/', substr($b64, 0, 64))) { echo "NOT_B64\n"; exit; }
$dec = base64_decode($b64, true);
if ($dec === false || $dec === '') { echo "BAD_B64\n"; exit; }
$dest = '/home/epqoisdl/noor-2122-b64.' . $idx;
if (@file_put_contents($dest, $b64) === false) { echo "WRITE_FAILED\n"; exit; }
@chmod($dest, 0600);
echo "OK idx=$idx b64=" . strlen($b64) . " raw=" . strlen($dec) . "\n";
