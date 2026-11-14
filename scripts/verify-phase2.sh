#!/usr/bin/env bash
# Phase 2 smoke verification: boots the production server, then exercises the
# new dashboard cards/chart, the four case filters, settings org fields and the
# filtered Excel export. All in one shell because background processes do not
# survive between tool calls in this sandbox.
set -u
cd /home/z/my-project/noor-system

TOKEN=$(cat /tmp/admin-token.txt 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "FATAL: no admin token"; exit 1; fi

# fresh sessions for admin + county admin
env -u DATABASE_URL node -e "
require('dotenv').config();
const { createHash, randomBytes } = require('crypto');
const { Pool } = require('pg');
const digest = (v) => createHash('sha256').update(v).digest('hex');
(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  for (const email of ['admin@noor.local', 'county@noor.local']) {
    const u = await pool.query('select id from app_users where email=\$1', [email]);
    const token = randomBytes(32).toString('hex');
    await pool.query('insert into user_sessions (token_hash, user_id, expires_at) values (\$1, \$2, \$3)', [digest(token), u.rows[0].id, new Date(Date.now() + 2*3600*1000)]);
    const name = email.split('@')[0];
    require('fs').writeFileSync('/tmp/token-' + name + '.txt', token);
  }
  const rv = await pool.query(\"select id from app_users where email='reviewer@noor.local'\");
  require('fs').writeFileSync('/tmp/reviewer-uuid.txt', rv.rows[0].id);
  console.log('sessions ready');
  await pool.end();
})().catch(e => { console.error('session err', e.message); process.exit(1); });" || exit 1

ADMIN=$(cat /tmp/token-admin.txt)
COUNTY=$(cat /tmp/token-county.txt)
REVIEWER=$(cat /tmp/reviewer-uuid.txt)

# start production server
if ! curl -s -o /dev/null --max-time 2 http://localhost:3000/login; then
  setsid env -u DATABASE_URL -u APP_ENCRYPTION_KEY -u BOOTSTRAP_SETUP_CODE PORT=3000 node server.js > /tmp/noor-server.log 2>&1 < /dev/null &
  for i in $(seq 1 20); do sleep 0.5; curl -s -o /dev/null --max-time 2 http://localhost:3000/login && break; done
fi
curl -s -o /dev/null -w "server up: %{http_code}\n" http://localhost:3000/login || { echo "server failed"; tail -5 /tmp/noor-server.log; exit 1; }

pass=0; fail=0
check() { # name, ok(0/1)
  if [ "$2" = "1" ]; then echo "✓ $1"; pass=$((pass+1)); else echo "✗ $1"; fail=$((fail+1)); fi
}

# --- dashboard (admin): 8 cards + trend chart
code=$(curl -s -o /tmp/dash.html -w "%{http_code}" -H "Cookie: noor_session=$ADMIN" http://localhost:3000/dashboard)
check "dashboard HTTP 200" "$([ "$code" = "200" ] && echo 1 || echo 0)"
python3 - << 'EOF' > /tmp/dash-ok.txt
html = open('/tmp/dash.html').read()
cards = ["کل پرونده‌ها", "در انتظار بررسی", "بررسی تخصصی", "نیازمند اصلاح", "تأییدشده", "ردشده", "پرونده ناقص", "پرونده معوق"]
missing = [c for c in cards if c not in html]
print(1 if (not missing and 'trend-chart' in html and 'روند ثبت‌نام شش ماه شمسی' in html and html.count('ws-stat') >= 8) else 0)
EOF
check "dashboard 8 cards + trend chart" "$(cat /tmp/dash-ok.txt)"

# --- cases page: new filters render for manager
curl -s -o /tmp/cases.html -H "Cookie: noor_session=$ADMIN" "http://localhost:3000/cases"
python3 - << 'EOF' > /tmp/cases-ok.txt
html = open('/tmp/cases.html').read()
need = ['کارشناس مسئول', 'همه منابع', 'همه منابع' in html and 'ورود از فرم کاغذی' in html, 'نام مؤسسه', 'از تاریخ', 'تا تاریخ']
ok = all(x if isinstance(x, bool) else (x in html) for x in need)
print(1 if ok else 0)
EOF
check "cases page shows 4 new filters (manager)" "$(cat /tmp/cases-ok.txt)"

# --- filter: source=paper → only سمیه رحیمی row
curl -s -o /tmp/paper.html -H "Cookie: noor_session=$ADMIN" "http://localhost:3000/cases?source=paper"
python3 - << 'EOF' > /tmp/paper-ok.txt
import re
html = re.sub(r'<!-- -->', '', open('/tmp/paper.html').read())
m = re.search(r'([\u06F0-\u06F9]+)\s+پرونده در نتایج', html)
count = int(m.group(1).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789'))) if m else -1
print(1 if ('سمیه رحیمی' in html and count == 1 and 'مریم صادقی' not in html) else 0)
EOF
check "source=paper filter → 1 result (سمیه رحیمی)" "$(cat /tmp/paper-ok.txt)"

# --- filter: expertId=reviewer → assigned cases only (3: مریم/رضا/فاطمه)
curl -s -o /tmp/expert.html -H "Cookie: noor_session=$ADMIN" "http://localhost:3000/cases?expertId=$REVIEWER"
python3 - << 'EOF' > /tmp/expert-ok.txt
import re
html = re.sub(r'<!-- -->', '', open('/tmp/expert.html').read())
m = re.search(r'([\u06F0-\u06F9]+)\s+پرونده در نتایج', html)
count = int(m.group(1).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789'))) if m else -1
print(1 if (count == 4 and 'مریم صادقی' in html and 'سمیه رحیمی' in html and 'علی احمدی' not in html) else 0)
EOF
check "expertId=reviewer filter → 4 assigned cases" "$(cat /tmp/expert-ok.txt)"

# --- filter: institution=کانون قرآنی مساجد → the 6 new sample cases
curl -s -o /tmp/inst.html -H "Cookie: noor_session=$ADMIN" --get --data-urlencode "institution=کانون قرآنی مساجد" "http://localhost:3000/cases"
python3 - << 'EOF' > /tmp/inst-ok.txt
import re
html = re.sub(r'<!-- -->', '', open('/tmp/inst.html').read())
m = re.search(r'([\u06F0-\u06F9]+)\s+پرونده در نتایج', html)
count = int(m.group(1).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789'))) if m else -1
print(1 if (count == 6 and 'نرگس عزیزی' in html) else 0)
EOF
check "institution filter → 6 sample cases" "$(cat /tmp/inst-ok.txt)"

# --- filter: date range 1405/08/01.. → excludes the 40-day-old case (created ~1405/07/08)
curl -s -o /tmp/dates.html -H "Cookie: noor_session=$ADMIN" --get --data-urlencode "from=1405/08/01" --data-urlencode "to=1405/08/15" "http://localhost:3000/cases"
python3 - << 'EOF' > /tmp/dates-ok.txt
import re
html = re.sub(r'<!-- -->', '', open('/tmp/dates.html').read())
m = re.search(r'([\u06F0-\u06F9]+)\s+پرونده در نتایج', html)
count = int(m.group(1).translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹', '0123456789'))) if m else -1
print(1 if (count == 3 and 'مریم صادقی' not in html and 'رضا کریمی' not in html and 'سمیه رحیمی' in html and 'نرگس عزیزی' in html) else 0)
EOF
check "date-range filter → 3 cases (6 older excluded)" "$(cat /tmp/dates-ok.txt)"

# --- filter error path: bogus date shows Persian error, HTTP 200
curl -s -o /tmp/baddate.html -H "Cookie: noor_session=$ADMIN" --get --data-urlencode "from=xx/yy" "http://localhost:3000/cases"
check "invalid Jalali date shows friendly error" "$(grep -q 'شمسی' /tmp/baddate.html && echo 1 || echo 0)"

# --- settings: org form new fields + seeded full-profile org
curl -s -o /tmp/settings.html -H "Cookie: noor_session=$ADMIN" http://localhost:3000/settings
python3 - << 'EOF' > /tmp/settings-ok.txt
html = open('/tmp/settings.html').read()
need = ['تلفن تماس مؤسسه', 'نام مدیر مؤسسه', 'نشانی مؤسسه', 'حاج آقا موسوی', 'کانون قرآنی مساجد کشور']
print(1 if all(n in html for n in need) else 0)
EOF
check "settings org fields + full-profile org listed" "$(cat /tmp/settings-ok.txt)"

# --- county admin scope: sees Tehran county cases, has filters, no province select
code=$(curl -s -o /tmp/county.html -w "%{http_code}" -H "Cookie: noor_session=$COUNTY" http://localhost:3000/cases)
check "county admin cases page 200" "$([ "$code" = "200" ] && echo 1 || echo 0)"
check "county admin does NOT see province filter" "$(grep -q 'همه استان‌ها' /tmp/county.html && echo 0 || echo 1)"
check "county admin sees expert filter" "$(grep -q 'کارشناس مسئول' /tmp/county.html && echo 1 || echo 0)"

# --- filtered Excel export
code=$(curl -s -o /tmp/export.xlsx -w "%{http_code}" -H "Cookie: noor_session=$ADMIN" --get --data-urlencode "source=paper" "http://localhost:3000/api/cases/export")
ctype=$(file -b --mime-type /tmp/export.xlsx 2>/dev/null)
check "filtered Excel export 200 + xlsx" "$([ "$code" = "200" ] && [ "$ctype" = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ] && echo 1 || echo 0)"

echo "-----"
echo "PASS=$pass FAIL=$fail"
