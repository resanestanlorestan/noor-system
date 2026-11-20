"use client";

// الحاقیهٔ ۲.۱۸.۷ — خروج خودکار در صورت عدم فعالیت (Idle Session Timeout):
// تایمر مشترک بین همهٔ تب‌ها بر پایهٔ localStorage؛ فعالیت = کلیک/تایپ/پیمایش/
// جابه‌جایی بین صفحات. نزدیک به سقف (پیش‌فرض ۱۵ دقیقه) مودال هشدار با شمارش
// معکوس و دکمهٔ «ادامه فعالیت» (تمدید با اعتبارسنجی سرور) باز می‌شود؛ بی‌پاسخی
// تا پایان سقف یعنی خروج خودکار: حذف امن نشست در سرور و هدایت به صفحهٔ ورود.
// سمت سرور هم مستقل از این تایمر، هر درخواست پس از سقف را می‌رد (lib/auth).
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { CircleAlert } from "lucide-react";

const LS_ACTIVITY = "noor.lastActivity";
const LS_LOCK = "noor.idleLogoutLock";
/** فاصلهٔ نوشتن فعالیت مشترک در localStorage تا رویداد storage تب‌ها را زیر بار نبرد. */
const WRITE_THROTTLE_MS = 5_000;
/** حداقل فاصلهٔ نبض سرور پس از فعالیت واقعی؛ تایمر کلاینت و lastSeenAt سرور را نزدیک نگه می‌دارد. */
const PING_THROTTLE_MS = 60_000;
/** عمر قفل خروج؛ اگر برندهٔ خروج ناکام ماند، نشست با همان درخواست بعدی سرور باطل می‌شود. */
const LOCK_TTL_MS = 15_000;

const faNum = (n: number) => new Intl.NumberFormat("fa-IR").format(n);
const faClock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${faNum(Math.floor(s / 60))}:${faNum(s % 60).padStart(2, "۰")}`; };

const readSharedActivity = (): number | null => {
  try { const v = Number(localStorage.getItem(LS_ACTIVITY)); return Number.isFinite(v) && v > 0 ? v : null; } catch { return null; }
};

export function IdleTimeout({ idleMs, warnMs }: { idleMs: number; warnMs: number }) {
  const pathname = usePathname();
  const lastRef = useRef<number>(0);
  const lastWriteRef = useRef<number>(0);
  const lastPingRef = useRef<number>(0);
  const leavingRef = useRef(false);
  const [warning, setWarning] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  const goToLogin = useCallback(() => { leavingRef.current = true; setWarning(false);
    // ناوبری سخت و جایگزین‌کننده عمدی است: پس از پایان نشست همهٔ وضعیت حافظه (کش RSC و state تب) دور ریخته می‌شود
    window.location.replace("/login?reason=idle"); }, []);

  /** ثبت فعالیت: تایمر کلاینت بلافاصله صفر می‌شود؛ نوشتن مشترک و نبض سرورِ
   *  متعاقبِ آن throttle می‌شوند تا بار اضافه و تمدیدهای بی‌مصبّت نداشته باشیم. */
  const recordActivity = useCallback((now: number) => {
    if (leavingRef.current) return;
    lastRef.current = now;
    if (now - lastWriteRef.current >= WRITE_THROTTLE_MS) {
      lastWriteRef.current = now;
      try { localStorage.setItem(LS_ACTIVITY, String(now)); } catch { /* حالت خصوصی مرورگر — تایمر همین تب کافی است */ }
    }
    if (now - lastPingRef.current >= PING_THROTTLE_MS) {
      lastPingRef.current = now;
      fetch("/api/session/ping", { method: "POST", keepalive: true }).then((res) => {
        if (res.status === 401) goToLogin();
      }).catch(() => undefined);
    }
  }, [goToLogin]);

  const extend = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/session/ping", { method: "POST" });
      if (res.ok) {
        const now = Date.now();
        lastPingRef.current = now;
        lastWriteRef.current = now;
        lastRef.current = now;
        try { localStorage.setItem(LS_ACTIVITY, String(now)); } catch { /* بی‌اهمیت */ }
        setWarning(false);
      } else { goToLogin(); }
    } catch { goToLogin(); } finally { setBusy(false); }
  }, [goToLogin]);

  const manualLogout = useCallback(async () => {
    setBusy(true);
    try { await fetch("/api/auth/logout", { method: "POST", keepalive: true }); } catch { /* حذف نشست در سرور با درخواست بعدی هم تضمین می‌شود */ }
    leavingRef.current = true;
    // همان ناوبری سختِ جایگزین‌کننده؛ بدون reason چون خروج انتخابی کاربر است
    window.location.replace("/login");
  }, []);

  // چرخهٔ حیات: نشستِ نخستِ فعالیت مشترک، شنونده‌های فعالیت، هم‌گامی بین‌تبی و تیک ثانیه‌ای
  useEffect(() => {
    const now = Date.now();
    // اگر ردیف نشست تا این‌جا رسید یعنی سرور نشست را سالم دیده و همین پیمایش
    // خودش فعالیت است؛ بنابراین مبنا=max(مقدار مشترک, اکنون).
    lastRef.current = Math.max(readSharedActivity() ?? 0, now);
    lastWriteRef.current = now;
    try { localStorage.setItem(LS_ACTIVITY, String(Math.max(readSharedActivity() ?? 0, now))); } catch { /* بی‌اهمیت */ }

    const onActivity = (event: Event) => {
      if (leavingRef.current) return;
      // رویدادهای صفحه‌کلید تکراری (نگه‌داشتن کلید) فعالیت نو محسوب نمی‌شوند
      if (event.type === "keydown" && (event as KeyboardEvent).repeat) return;
      recordActivity(Date.now());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === LS_ACTIVITY && event.newValue) {
        const shared = Number(event.newValue);
        if (Number.isFinite(shared) && shared > lastRef.current) lastRef.current = shared;
      } else if (event.key === LS_LOCK && event.newValue) {
        // تبِ برنده خروج را آغاز کرده؛ بقیهٔ تب‌ها فوراً به صفحهٔ ورود می‌روند
        goToLogin();
      }
    };
    const tick = () => {
      if (leavingRef.current) return;
      const idle = Date.now() - lastRef.current;
      if (idle >= idleMs) {
        // برندهٔ خروج (قفل) نشست را سمت سرور حذف می‌کند و همه به ورود می‌روند
        let isWinner = false;
        try {
          const raw = localStorage.getItem(LS_LOCK);
          const locked = raw ? Number(raw) : 0;
          if (!locked || Date.now() - locked >= LOCK_TTL_MS) { localStorage.setItem(LS_LOCK, String(Date.now())); isWinner = true; }
        } catch { isWinner = true; }
        if (isWinner) {
          fetch("/api/auth/logout?reason=idle", { method: "POST", keepalive: true }).catch(() => undefined);
          try { localStorage.removeItem(LS_LOCK); } catch { /* بی‌اهمیت */ }
        }
        goToLogin();
      } else if (idle >= idleMs - warnMs) {
        setRemaining(idleMs - idle);
        setWarning(true);
      } else {
        // هر فعالیت معتبر هشدار را می‌بندد؛ setState با همان مقدار قبلی از سوی React نادیده گرفته می‌شود
        setWarning(false);
      }
    };
    const options: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("pointerdown", onActivity, options);
    window.addEventListener("keydown", onActivity, options);
    window.addEventListener("scroll", onActivity, options);
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(tick, 1000);
    return () => {
      window.removeEventListener("pointerdown", onActivity, options);
      window.removeEventListener("keydown", onActivity, options);
      window.removeEventListener("scroll", onActivity, options);
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, [idleMs, warnMs, recordActivity, goToLogin]);

  // جابه‌جایی بین صفحات هم فعالیت است (شامل پیمایش داخلی Next)
  useEffect(() => { recordActivity(Date.now()); }, [pathname, recordActivity]);

  // فوکوس روی «ادامه فعالیت» هنگام بازشدن هشدار
  useEffect(() => { if (warning) confirmRef.current?.focus(); }, [warning]);

  if (!warning) return null;
  return <div className="idle-backdrop" role="presentation">
    <div className="idle-modal" role="dialog" aria-modal="true" aria-labelledby="idle-modal-title">
      <span className="idle-modal-icon" aria-hidden="true"><CircleAlert size={26} /></span>
      <strong id="idle-modal-title">نشست شما در آستانهٔ خروج خودکار</strong>
      <p>از آخرین فعالیتی که در سامانه داشتید مدتی گذشته است. اگر تا پایان شمارش معکوس پاسخ ندهید، برای حفظ امنیت حساب به‌صورت خودکار از سامانه خارج می‌شوید.</p>
      <div className="idle-countdown" aria-live="polite">خروج خودکار تا <b>{faClock(remaining)}</b> دیگر</div>
      <div className="idle-actions">
        <button type="button" className="idle-confirm" onClick={extend} disabled={busy}>{busy ? "در حال تمدید..." : "ادامه فعالیت"}</button>
        <button type="button" className="idle-cancel" onClick={manualLogout} disabled={busy}>خروج از حساب</button>
      </div>
    </div>
  </div>;
}
