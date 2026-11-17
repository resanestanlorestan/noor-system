<?php
// cleanup-514cff — حذف کامل بقایای تشخیصی، بکاپ‌های قدیمی و بسته‌های ناقص/قدیمی.
// verify-514cff.php حذف نمی‌شود (خودش در پایان کار، خودش را حذف می‌کند).
header('Content-Type: text/plain; charset=utf-8');
if (($_GET['token'] ?? '') !== 'bb9c41873bc15c5b7d328bf7') { http_response_code(403); echo "FORBIDDEN"; exit; }
set_time_limit(120);
function rm($f) { $ok = @unlink($f); echo $ok ? "removed: $f\n" : "MISSING/FAIL: $f\n"; return $ok; }

echo "== public_html: ابزارهای تشخیصی و موقت ==\n";
foreach (['cleanup-9f3c1a.php','dbx-9f3c1a.php','deploy-9f3c1a.php','purge-9f3c1a.php','verify-9f3c1a.php','probe-p8k2.php','preflight-514cff.php','deploy-514cff.php','rotate-514cff.php','cron-514cff.php','upload-514cff.php','cleanup-514cff.php'] as $f)
  rm('/home/epqoisdl/public_html/' . $f);

echo "== diag-temp در noor-system ==\n";
foreach ((glob('/home/epqoisdl/noor-system/scripts/diag-temp/*') ?: []) as $f) rm($f);
@rmdir('/home/epqoisdl/noor-system/scripts/diag-temp');
echo is_dir('/home/epqoisdl/noor-system/scripts/diag-temp') ? "diag-temp still exists\n" : "diag-temp dir removed\n";

echo "== ریشهٔ خانه: اسکریپت‌ها و لاگ‌های تشخیصی/استقرار قدیمی ==\n";
foreach (['cleanup-291.sh','cleanup-291.log','diag-291.sh','diag-291.log','diag2-291.sh','diag2-291.log','diag3-291.sh','diag3-291.log','diag4-291.sh','diag4-291.log','diag-sms.sh','diag-sms.log','diag.log','diag2.log','diag2.js','deploy-2120.sh','deploy-218.sh','deploy.log','deploy-otp.log','cron-setup.log','crontab.tmp','cp-test.txt','embed-env-snippet.js','host-cron.sh','host-diag.sh','host-embed.sh','host-install.sh','host-procscan.sh','host-recon.sh','host-restart-290.sh','host-slim-install.sh','install.log'] as $f)
  rm('/home/epqoisdl/' . $f);
foreach ((glob('/home/epqoisdl/host-update-*.sh') ?: []) as $f) rm($f);
foreach ((glob('/home/epqoisdl/update-*.sh') ?: []) as $f) rm($f);
foreach ((glob('/home/epqoisdl/update-*.log') ?: []) as $f) rm($f);

echo "== بسته‌های قدیمی و ناقص (حاوی رازهای چرخش‌شده) ==\n";
foreach (['noor-slim-2105.zip','noor-slim-2106.zip','noor-slim-2121.zip'] as $f) rm('/home/epqoisdl/' . $f);
foreach ((glob('/home/epqoisdl/noor-slim-2122.zip.*.part') ?: []) as $f) rm($f);

echo "== بکاپ‌های .env قدیمی (غیر از backup-2180) ==\n";
foreach ((glob('/home/epqoisdl/.env.backup-*') ?: []) as $f)
  if (basename($f) !== '.env.backup-2180') rm($f);
echo is_file('/home/epqoisdl/.env.backup-2180') ? "kept: .env.backup-2180\n" : "NOTE: backup-2180 absent\n";

echo "== marker ها ==\n";
foreach ((glob('/home/epqoisdl/.v*-real-done') ?: []) as $f)
  if (basename($f) !== '.v2180-real-done') rm($f);
foreach ((glob('/home/epqoisdl/.v*-update-done') ?: []) as $f) rm($f);
foreach ((glob('/home/epqoisdl/.v*-restart-done') ?: []) as $f) rm($f);
rm('/home/epqoisdl/.v2180-rotation-done');
echo "(مارکرهای نسخه‌های قبلی حذف شد؛ .v2180-real-done نگه داشته می‌شود)\n";

echo "== cleanup done ==\n";
