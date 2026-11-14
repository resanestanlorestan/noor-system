#!/usr/bin/env bash
# Browser smoke for the group-broadcast feature (Release 2.2):
# admin login → /broadcasts filters → audience preview → compose+send →
# history banner, then province admin access. Requires the app running on
# $BASE (default http://127.0.0.1:3000) with seeded demo users.
set -u
BASE="${1:-http://127.0.0.1:3000}"
PASS=0; FAIL=0; RESULTS=()
ok()   { RESULTS+=("✓ $1"); PASS=$((PASS+1)); }
bad()  { RESULTS+=("✗ $1"); FAIL=$((FAIL+1)); }
login() { # $1=email $2=password
  agent-browser open "$BASE/login" >/dev/null 2>&1
  agent-browser find label "ایمیل" fill "$1" >/dev/null 2>&1
  agent-browser find role textbox fill "$2" --name "گذرواژه" >/dev/null 2>&1
  agent-browser find role button click --name "ورود به سامانه" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
}
has_text() { # $1=needle $2=label
  sleep 2
  local body; body=$(agent-browser eval "document.body.innerText" 2>/dev/null | head -c 8000)
  if echo "$body" | grep -q "$1"; then ok "$2"; else bad "$2 (missing: $1)"; fi
}
logout() {
  # The session cookie is HttpOnly, so it must be cleared by the server via
  # the real logout button — JS cookie tricks do not work.
  agent-browser open "$BASE/dashboard" >/dev/null 2>&1
  agent-browser find role button click --name "خروج از حساب" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
}

# ---- super_admin: compose + send
login admin@noor.local 'NoorAdmin2026!x'
url=$(agent-browser get url 2>/dev/null)
if echo "$url" | grep -qE "dashboard|account"; then ok "ورود مدیر کل"; else bad "ورود مدیر کل (url=$url)"; fi

agent-browser open "$BASE/broadcasts" >/dev/null 2>&1; sleep 3
has_text "فیلتر گیرندگان" "پنل فیلتر مخاطبان"
has_text "گیرنده" "شمارش گیرندگان"
agent-browser find role button click --name "نمایش گیرندگان" >/dev/null 2>&1
sleep 3
has_text "نمونه گیرندگان" "پیش‌نمایش گیرندگان"

agent-browser find label "عنوان پیام" fill "اطلاعیه نمونه اسموک" >/dev/null 2>&1
sleep 1
agent-browser find role textbox fill "متن پیام نمونه گروهی از طریق اسموک مرورگر." --name "متن پیام" >/dev/null 2>&1
sleep 1
agent-browser eval "window.confirm = () => true" >/dev/null 2>&1
agent-browser find role button click --name "ارسال" >/dev/null 2>&1
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2
send_url=$(agent-browser get url 2>/dev/null)
if echo "$send_url" | grep -q "sent="; then ok "ارسال انجام شد ($send_url)"; else bad "ارسال (url=$send_url)"; fi
has_text "پیام گروهی ارسال شد" "بنر تأیید ارسال"
has_text "پیام‌های گروهی اخیر" "تاریخچه پیام‌ها"
logout

# ---- province_admin: page reachable inside scope
login province@noor.local 'Province2026!x'
agent-browser open "$BASE/broadcasts" >/dev/null 2>&1
has_text "فیلتر گیرندگان" "مدیر استان: صفحه پیام گروهی"
logout

# ---- reviewer must NOT reach the page
login reviewer@noor.local 'Reviewer2026!x'
agent-browser open "$BASE/broadcasts" >/dev/null 2>&1; sleep 2
url=$(agent-browser get url 2>/dev/null)
if echo "$url" | grep -q "dashboard"; then ok "کارشناس بررسی به /broadcasts راه ندارد"; else bad "گارد کارشناس (url=$url)"; fi
logout

for r in "${RESULTS[@]}"; do echo "$r"; done
echo "PASS=$PASS FAIL=$FAIL"
