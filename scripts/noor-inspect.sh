#!/bin/bash
# noor-inspect — بررسی فقط‌خواندنی رکوردهای باقیماندهٔ کد ملی ۵۲۷۵ روی هاست تولیدی.
# با اولین اجرا خط کرون خودش را حذف می‌کند و فقط SELECT اجرا می‌شود.
(crontab -l 2>/dev/null | grep -v "noor-inspect" | crontab -) 2>/dev/null || true
OUT=/home/epqoisdl/noor-inspect.out
cd /home/epqoisdl/noor-system || { echo "NO-APP-DIR" > "$OUT"; exit 1; }
set -a; . ./.env 2>/dev/null; set +a
{
echo "== run: $(date -Is) =="
psql "$DATABASE_URL" -P pager=off \
 -c "SELECT a.id, a.user_id AS uid, a.deleted_at AS act_del, a.deleted_by AS del_by, a.first_name, a.last_name, a.father_name, a.phone FROM activists a WHERE a.national_id_last4='5275';" \
 -c "SELECT app.id, app.activist_id, app.deleted_at AS app_del, app.status, app.source, app.created_by AS creator FROM applications app JOIN activists a ON a.id=app.activist_id WHERE a.national_id_last4='5275';" \
 -c "SELECT indexname, indexdef FROM pg_indexes WHERE tablename='activists' AND indexname LIKE '%national%';" \
 -c "SELECT count(*) AS activists_total FROM activists;"
echo "== done =="
} > "$OUT" 2>&1
