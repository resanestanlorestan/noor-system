-- Release 2.4 — حذف کامل ماژول «سند طراحی سامانه»:
-- مسیر /plan، API مرور (/api/planning/reviews) و جدول planning_review_marks
-- به‌همراه تمام محتوای آن از سامانه برداشته شد.
--> statement-breakpoint
drop table if exists "planning_review_marks";
