#!/bin/bash
# چرخش امن رازها روی هاست — مقدارها همین‌جا ساخته و مصرف می‌شوند؛ در خروجی چیزی چاپ نمی‌شود.
set -e
NODE=/home/epqoisdl/nodevenv/noor-system/22/bin/node
STANDALONE=/home/epqoisdl/noor-system/.next/standalone
export NEWPW=$(openssl rand -hex 16)
export NEWS=$(openssl rand -hex 24)
cd "$STANDALONE"
"$NODE" /home/epqoisdl/rotate-218.js
# رمز کرون در فایل محافظت‌شده برای استفادهٔ خط‌های cron با هدر Bearer
printf '%s\n' "$NEWS" > /home/epqoisdl/.cron-secret-218
chmod 600 /home/epqoisdl/.cron-secret-218
unset NEWPW NEWS
echo "ROTATE-DONE"
