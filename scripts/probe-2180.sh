#!/bin/bash
# پیش‌نمایش وضعیت دسترسی به هاست — کم‌درخواست و کم‌فاصله (ضدربات)
# usage: bash probe-2180.sh
cd /home/z/my-project/scripts
echo "== [1] cPanel login probe =="
timeout 60 bash cpapi.sh Fileman get_disk_info 2>&1 | head -c 300; echo
sleep 8
echo "== [2] site health GET =="
curl -sk --max-time 30 -o /tmp/probe-health.json -w 'http=%{http_code} time=%{time_total}s\n' https://pouyafarhadi.ir/api/health
head -c 300 /tmp/probe-health.json; echo
sleep 8
echo "== [3] upload stub GET (existence only) =="
curl -sk --max-time 30 -o /tmp/probe-up.html -w 'http=%{http_code}\n' 'https://pouyafarhadi.ir/upload-514cff.php'
grep -io 'forbidden\|no idx\|missing' /tmp/probe-up.html | head -1
echo "== probe done =="
