#!/bin/bash
# استقرار و سخت‌سازی ۲.۱۸.۰ روی هاست — یک‌بارمصرف، از طریق cron خط یک‌بارمصرف
# هیچ مقدار رازی در این اسکریپت یا خروجی آن نیست؛ رازها همین‌جا ساخته می‌شوند.
if [ -f /home/epqoisdl/deploy-218.running ]; then exit 0; fi
touch /home/epqoisdl/deploy-218.running
LOG=/home/epqoisdl/deploy-218.log
{
set -e
cd /home/epqoisdl
echo "== reassemble =="
cat noor-slim-2122.zip.00.part noor-slim-2122.zip.01.part noor-slim-2122.zip.02.part noor-slim-2122.zip.03.part noor-slim-2122.zip.04.part > noor-slim-2122.zip
echo "SIZE:$(stat -c%s noor-slim-2122.zip)"
md5sum noor-slim-2122.zip
echo "== php cleanup =="
rm -f public_html/cleanup-9f3c1a.php public_html/dbx-9f3c1a.php public_html/deploy-9f3c1a.php public_html/purge-9f3c1a.php public_html/verify-9f3c1a.php public_html/index.php
echo "PHP-LEFT:$(ls public_html/*.php 2>/dev/null | wc -l)"
echo "== htaccess SetEnv removal =="
cp public_html/.htaccess .htaccess.bak-218
sed -i '/CLOUDLINUX ENV VARS CONFIGURATION BEGIN/,/CLOUDLINUX ENV VARS CONFIGURATION END/d' public_html/.htaccess
echo "SETENV-REMAIN:$(grep -c SetEnv public_html/.htaccess || true)"
echo "== unzip bundle =="
unzip -oq noor-slim-2122.zip -d /home/epqoisdl
echo "UNZIP-OK"
echo "== rotate secrets =="
NEWPW=$(openssl rand -hex 16)
NEWS=$(openssl rand -hex 24)
NODE=/home/epqoisdl/nodevenv/noor-system/22/bin/node
cd /home/epqoisdl/noor-system/.next/standalone
NEWPW="$NEWPW" NEWS="$NEWS" "$NODE" /home/epqoisdl/rotate-218.js
printf '%s\n' "$NEWS" > /home/epqoisdl/.cron-secret-218
chmod 600 /home/epqoisdl/.cron-secret-218
echo "== restart passenger =="
mkdir -p /home/epqoisdl/noor-system/tmp
touch /home/epqoisdl/noor-system/tmp/restart.txt
echo "DEPLOY-218-DONE"
} >> "$LOG" 2>&1
rm -f /home/epqoisdl/deploy-218.running
