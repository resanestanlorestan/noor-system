// Unit tests for the pure reminder logic: threshold/cooldown math, recipient
// resolution, SMS templates and phone masking (no database involved).
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLD_DAYS, OVERDUE_STATUSES, REMINDER_COOLDOWN_DAYS, THRESHOLD_OPTIONS,
  activistSmsText, isCooldownActive, maskPhone, overdueSince, parseThreshold,
  resolveRecipient, staffSmsText, waitingDays,
} from "@/lib/reminders";

const NOW = new Date("2026-11-08T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000);

describe("آستانه و ریاضیات انتظار", () => {
  it("گزینه‌های آستانه فقط ۷/۱۴/۳۰ هستند و پیش‌فرض ۱۴ است", () => {
    expect(THRESHOLD_OPTIONS).toEqual([7, 14, 30]);
    expect(DEFAULT_THRESHOLD_DAYS).toBe(14);
    expect(REMINDER_COOLDOWN_DAYS).toBe(3);
  });

  it("parseThreshold ارقام فارسی را می‌پذیرد و نامعتبر را به پیش‌فرض برمی‌گرداند", () => {
    expect(parseThreshold("7")).toBe(7);
    expect(parseThreshold("۳۰")).toBe(30);
    expect(parseThreshold("۱۴")).toBe(14);
    expect(parseThreshold("")).toBe(14);
    expect(parseThreshold(null)).toBe(14);
    expect(parseThreshold("99")).toBe(14);
    expect(parseThreshold("-5; drop table")).toBe(14);
  });

  it("overdueSince دقیقاً threshold روز قبل از اکنون است", () => {
    expect(overdueSince(14, NOW).getTime()).toBe(daysAgo(14).getTime());
  });

  it("waitingDays روز کامل انتظار را محاسبه می‌کند", () => {
    expect(waitingDays(daysAgo(20), NOW)).toBe(20);
    expect(waitingDays(daysAgo(14), NOW)).toBe(14);
    expect(waitingDays(new Date(NOW.getTime() - 36 * 3600000), NOW)).toBe(1);
    expect(waitingDays(new Date(NOW.getTime() + 86400000), NOW)).toBe(0);
  });

  it("وضعیت‌های معوق فقط در انتظار بررسی و بررسی تخصصی است", () => {
    expect(OVERDUE_STATUSES).toEqual(["pending", "specialist_review"]);
  });
});

describe("بازه یادآوری (cooldown)", () => {
  it("بدون یادآور قبلی فعال نیست", () => {
    expect(isCooldownActive(null, NOW)).toBe(false);
  });

  it("یادآور کمتر از ۳ روز پیش بازه را فعال می‌کند", () => {
    expect(isCooldownActive(daysAgo(2), NOW)).toBe(true);
    expect(isCooldownActive(daysAgo(3), NOW)).toBe(false);
    expect(isCooldownActive(daysAgo(10), NOW)).toBe(false);
  });
});

describe("انتخاب مسئول یادآوری", () => {
  const base = {
    expertId: null, expertActive: null, expertPhone: null,
    creatorId: "creator-id", creatorRole: "activist" as const, creatorActive: true, creatorPhone: null,
    activistUserId: null, activistUserActive: null, activistPhone: null,
  };

  it("اولویت اول کارشناس ارجاع‌شده فعال است", () => {
    const row = { ...base, expertId: "expert-id", expertActive: true, expertPhone: "09121110002" };
    expect(resolveRecipient(row)).toEqual({ userId: "expert-id", phone: "09121110002", source: "expert" });
  });

  it("کارشناس غیرفعال نادیده گرفته می‌شود و ثبت‌کننده سازمانی جایگزین می‌شود", () => {
    const row = { ...base, expertId: "expert-id", expertActive: false, creatorRole: "reviewer" as const, creatorPhone: "09121110001" };
    expect(resolveRecipient(row)).toEqual({ userId: "creator-id", phone: "09121110001", source: "staff_creator" });
  });

  it("ثبت‌کننده فعال (خود فعال قرآنی) گیرنده نیست و حساب کاربری فعال جایگزین می‌شود", () => {
    const row = { ...base, creatorRole: "activist" as const, activistUserId: "act-user-id", activistUserActive: true, activistPhone: "09121110099" };
    expect(resolveRecipient(row)).toEqual({ userId: "act-user-id", phone: "09121110099", source: "activist" });
  });

  it("حساب غیرفعال فعال قرآنی هم گیرنده نیست", () => {
    const row = { ...base, activistUserId: "act-user-id", activistUserActive: false };
    expect(resolveRecipient(row)).toBeNull();
  });

  it("بدون هیچ گیرنده معتبر null برمی‌گرداند", () => {
    expect(resolveRecipient({ ...base, creatorActive: false })).toBeNull();
  });
});

describe("قالب پیامک و پوشانیدن شماره", () => {
  it("پیامک کارکنان نام فعال و روز انتظار را دارد و کوتاه است", () => {
    const text = staffSmsText("زهرا موسوی", 21);
    expect(text).toContain("زهرا موسوی");
    expect(text).toContain("۲۱");
    expect(text).toContain("سامانه نور");
    expect(text.length).toBeLessThanOrEqual(140);
  });

  it("پیامک فعال قرآنی دوم شخص است", () => {
    const text = activistSmsText(15);
    expect(text).toContain("پرونده شما");
    expect(text).toContain("۱۵");
  });

  it("maskPhone فقط چهار رقم اول و آخر را نشان می‌دهد", () => {
    expect(maskPhone("09121110002")).toBe("0912***0002");
    expect(maskPhone("۰۹۱۲۱۱۱۰۰۰۲")).toBe("0912***0002");
    expect(maskPhone("0912")).toBe("***");
    expect(maskPhone(null)).toBe("—");
  });
});
