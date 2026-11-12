#!/usr/bin/env bash
# دود تست مرورگر واقعی — ورود هر ۶ نقش و بازدید صفحات کلیدی
set -u
BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0
declare -a RESULTS

login_role() { # $1=name $2=email $3=password $4=landing-check
  agent-browser open "$BASE/login" >/dev/null 2>&1
  agent-browser find label "ایمیل" fill "$2" >/dev/null 2>&1
  agent-browser find role textbox fill "$3" --name "گذرواژه" >/dev/null 2>&1
  agent-browser find role button click --name "ورود به سامانه" >/dev/null 2>&1
  agent-browser wait --load networkidle >/dev/null 2>&1
  local url; url=$(agent-browser get url 2>/dev/null)
  if echo "$url" | grep -qE "dashboard|account"; then
    RESULTS+=("✓ ورود $1 → $url"); PASS=$((PASS+1)); return 0
  fi
  RESULTS+=("✗ ورود $1 → landed: $url"); FAIL=$((FAIL+1)); return 1
}

visit() { # $1=path $2=label
  local code
  agent-browser open "$BASE$1" >/dev/null 2>&1
  code=$(agent-browser eval "document.body?.innerText?.length || 0" 2>/dev/null)
  if [ -n "$code" ] && [ "$code" != "0" ] && [ "$code" != "null" ]; then
    RESULTS+=("  ✓ $2"); PASS=$((PASS+1))
  else
    RESULTS+=("  ✗ $2 (خالی یا خطا)"); FAIL=$((FAIL+1))
  fi
}

logout() {
  agent-browser open "$BASE/login" >/dev/null 2>&1
  agent-browser eval "document.cookie='noor_session=; Max-Age=0; path=/'" >/dev/null 2>&1
  agent-browser storage local clear >/dev/null 2>&1
}

# ---- super_admin
login_role super_admin admin@noor.local 'NoorAdmin2026!x' && {
  visit /dashboard "مدیر کل: داشبورد"
  visit /users "مدیر کل: کاربران"
  visit /reports "مدیر کل: گزارش‌ها"
  visit /permissions "مدیر کل: ماتریس دسترسی"
  visit /audit "مدیر کل: ممیزی"
}
logout

# ---- province_admin
login_role province_admin province@noor.local 'Province2026!x' && {
  visit /cases "مدیر استان: پرونده‌ها"
  visit /reports "مدیر استان: گزارش"
}
logout

# ---- county_admin
login_role county_admin county@noor.local 'County2026!x' && {
  visit /cases "مدیر شهرستان: پرونده‌ها"
}
logout

# ---- reviewer
login_role reviewer reviewer@noor.local 'Reviewer2026!x' && {
  visit /cases "ارزیاب: صف بررسی"
}
logout

# ---- specialist
login_role specialist specialist@noor.local 'Specialist2026!x' && {
  visit /cases "کارشناس: پرونده‌ها"
}
logout

# ---- activist
login_role activist activist@noor.local 'Activist2026!x' && {
  visit /account "فعال: حساب من"
}
logout

printf '%s\n' "${RESULTS[@]}"
echo "────────────"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ] && echo "SMOKE-OK" || echo "SMOKE-FAILED"
