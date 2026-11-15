#!/usr/bin/env bash
# استقرار الحاقیهٔ ۲.۱۲.۰ روی هاست تولیدی (نُور سامانه)
# مراحل: بیلد → بستهٔ اسلیم → آپلود از طریق ابزارهای cpapi → بازکردن بسته،
# مهاجرت پایگاه داده (db push)، ری‌استارت Passenger و راستی‌آزمایی زنده.
# نیازمند ابزارهای بازیابی‌شده از اسنپ‌شات قبلی: scripts/cpupload.sh و
# scripts/term-drive.py (در صورت نبود، از کامیت اسنپ‌شات پلتفرم بازیابی شود).
set -euo pipefail
APP=/home/z/my-project
OUT=/home/z/my-project/download/noor-slim-2120.zip
HOSTDIR=noor-system   # نام پوشهٔ بسته درون zip (سازگار با مسیرهای سرور)

cd "$APP"
echo "== 1) build =="
npm run build
echo "== 2) slim package =="
bash "$APP/scripts/build-slim-package-2120.sh"
echo "== 3) upload =="
bash "$APP/scripts/cpupload.sh" "$OUT" "noor-slim-2120.zip" "/home/epqoisdl"
echo "== 4) host steps (unzip + db push + restart) via term-drive =="
python3 "$APP/scripts/term-drive.py" run '
cd /home/epqoisdl
unzip -o noor-slim-2120.zip
cd noor-system
node -e "require(\"dotenv\").config(); const {execSync}=require(\"child_process\"); execSync(\"npx drizzle-kit push --force\", {stdio:\"inherit\"});"
touch tmp/restart.txt 2>/dev/null || mkdir -p tmp && touch tmp/restart.txt
echo DEPLOY-2120-DONE
'
echo "== 5) live verification =="
curl -sk --max-time 30 -o /dev/null -w "login:%{http_code}\n" https://pouyafarhadi.ir/login
curl -sk --max-time 30 https://pouyafarhadi.ir/api/health
echo
