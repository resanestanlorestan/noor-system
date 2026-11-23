#!/usr/bin/env bash
# استقرار الحاقیهٔ ۲.۲۸.۱ روی تولید — یک‌دستوری پس از ارائهٔ اعتبارنامهٔ cPanel.
# پیش‌نیاز: scripts/.cp-creds با سه literal معتبر (CP_HOST/CP_USER/CP_PASS)
# ساخته شده باشد. بستهٔ اسلیم از پیش ساخته شده: download/noor-slim-2.28.1.zip
# (BUILD_ID=YQ8zfvzVxjP3pgxBuYf9Y). این انتشار مایگریشن ندارد (تغییر DB نیست).
# پس از پایان موفق، خود درایور پچی بقایای هاست را پاک می‌کند.
set -euo pipefail
cd /home/z/my-project
if [ ! -f scripts/.cp-creds ]; then
  echo "BLOQUED: scripts/.cp-creds نیست؛ سه سطر CP_HOST=…/CP_USER=…/CP_PASS=… را بسازید و دوباره اجرا کنید." >&2
  exit 2
fi
echo "== گام ۱: نقشهٔ md5 فایل‌های واقعی هاست =="
python3 scripts/deploy-2210/md5-host-2281.py
echo "== گام ۲: ساخت پچ md5-محور (فقط تفاوت‌ها) =="
python3 scripts/deploy-2210/build-patch-2281.py
echo "== گام ۳: آپلود قطعه‌ای + اکسترکت + ری‌استارت + سلامت 2.28.1 =="
python3 scripts/deploy-2210/fileman-patch-2281.py
echo "DEPLOY_2281_DONE"
