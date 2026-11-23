#!/usr/bin/env bash
# استقرار الحاقیهٔ ۲.۲۷.۰ روی تولید — یک‌دستوری پس از ارائهٔ اعتبارنامهٔ cPanel.
# پیش‌نیاز: scripts/.cp-creds با سه literal معتبر (CP_HOST/CP_USER/CP_PASS)
# ساخته شده باشد. پس از پایان موفق، خود درایور پچی remnants هاست را پاک می‌کند.
# بستهٔ اسلیم از پیش ساخته شده: download/noor-slim-2.26.0.zip (sha=3baddd60...cff)
set -euo pipefail
cd /home/z/my-project
if [ ! -f scripts/.cp-creds ]; then
  echo "BLOQUED: scripts/.cp-creds نیست؛ سه سطر CP_HOST=…/CP_USER=…/CP_PASS=… را بسازید و دوباره اجرا کنید." >&2
  exit 2
fi
echo "== گام ۱: نقشهٔ md5 فایل‌های واقعی هاست =="
python3 scripts/deploy-2210/md5-host-2270.py
echo "== گام ۲: ساخت پچ md5-محور (فقط تفاوت‌ها) =="
python3 scripts/deploy-2210/build-patch-2270.py
echo "== گام ۳: آپلود قطعه‌ای + اکسترکت + اکسترکت + + ری‌استارت + سلامت =="
python3 scripts/deploy-2210/fileman-patch-2270.py
echo "DEPLOY_2270_DONE"
