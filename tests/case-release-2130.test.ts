import { describe, expect, it } from "vitest";
import { formatSpecialtyDetail, hafizJuzOptions, juzPartsFa, normalizeJuzParts, parseJuzNumbers } from "@/lib/constants";

// الحاقیهٔ ۲.۱۳.۰ — انتخاب تعاملی اجزای حفظ قرآن: اعتبارسنجی تعداد/بازه،
// نرمال‌سازی، نمایش فارسی در پروفایل و برچسب‌های میزان حفظ.

describe("اجزای حفظ — تجزیه و اعتبارسنجی", () => {
  it("اعداد معتبر مرتب برمی‌گرداند؛ تکراری، صفر، منفی و خارج از ۳۰ نامعتبر است", () => {
    expect(parseJuzNumbers("5,1,2")).toEqual([1, 2, 5]);
    expect(parseJuzNumbers("1,2,5,12,20")).toEqual([1, 2, 5, 12, 20]);
    expect(parseJuzNumbers("1,1")).toBeNull();
    expect(parseJuzNumbers("0")).toBeNull();
    expect(parseJuzNumbers("31")).toBeNull();
    expect(parseJuzNumbers("abc")).toBeNull();
    expect(parseJuzNumbers("")).toBeNull();
    expect(parseJuzNumbers(null)).toBeNull();
  });

  it("نرمال‌سازی در برابر میزان اعلام‌شده: دقیقاً همان تعداد الزامی است", () => {
    expect(normalizeJuzParts("5", "1,2,5,12,20")).toBe("1,2,5,12,20");
    expect(normalizeJuzParts("5", "20,5,12,1,2")).toBe("1,2,5,12,20"); // مرتب‌سازی
    expect(normalizeJuzParts("5", "1,2,5,12")).toBe("invalid"); // کمتر از اعلام
    expect(normalizeJuzParts("5", "1,2,5,12,20,30")).toBe("invalid"); // بیشتر از اعلام
    expect(normalizeJuzParts("1", "30")).toBe("30");
    expect(normalizeJuzParts("2", "1,x")).toBe("invalid");
  });

  it("بدون اجزا → null (سازگار با دادهٔ قدیمی)؛ حفظ کل → خودکار ۳۰ جزء", () => {
    expect(normalizeJuzParts("5", null)).toBeNull();
    expect(normalizeJuzParts("15", "")).toBeNull();
    const complete = normalizeJuzParts("complete", null);
    expect(complete?.split(",").length).toBe(30);
    expect(complete?.startsWith("1,2,3")).toBe(true);
    expect(complete?.endsWith("29,30")).toBe(true);
    // برای «حفظ کل» هر ورودی نادیده گرفته می‌شود و همیشه ۳۰ جزء ثبت می‌شود
    expect(normalizeJuzParts("complete", "1,2")).toBe(complete);
  });

  it("فهرست میزان حفظ دست‌نخورده است (سازگاری دادهٔ ۲.۱۲)", () => {
    expect(hafizJuzOptions["5"]).toBe("حفظ ۵ جزء");
    expect(hafizJuzOptions.complete).toBe("حفظ کل قرآن کریم");
  });
});

describe("اجزای حفظ — نمایش فارسی در پروفایل و اکسل", () => {
  it("خلاصهٔ فارسی اجزا با ارقام فارسی", () => {
    expect(juzPartsFa("1,2,5,12,20")).toBe("۱، ۲، ۵، ۱۲، ۲۰");
    expect(juzPartsFa("30,1,15")).toBe("۱، ۱۵، ۳۰");
    expect(juzPartsFa(Array.from({ length: 30 }, (_, index) => index + 1).join(","))).toBe("۱ تا ۳۰");
    expect(juzPartsFa(null)).toBeNull();
  });

  it("برچسب تخصص حافظ با اجزای منتخب ترکیب می‌شود", () => {
    expect(formatSpecialtyDetail("memorizer", "5", null, "1,2,5,12,20")).toBe("حفظ ۵ جزء (۱، ۲، ۵، ۱۲، ۲۰)");
    expect(formatSpecialtyDetail("memorizer", "complete", null, normalizeJuzParts("complete", null))).toBe("حفظ کل قرآن کریم (۱ تا ۳۰)");
    // دادهٔ قدیمی بدون اجزا: همان برچسب قبلی
    expect(formatSpecialtyDetail("memorizer", "15", null, null)).toBe("حفظ ۱۵ جزء");
    expect(formatSpecialtyDetail("memorizer", "15", null, undefined)).toBe("حفظ ۱۵ جزء");
    // اجزای نامعتبر نمایش داده نمی‌شوند
    expect(formatSpecialtyDetail("memorizer", "5", null, "1,2")).toBe("حفظ ۵ جزء");
    // تخصص‌های دیگر از اجزا استفاده نمی‌کنند
    expect(formatSpecialtyDetail("reciter", "6", null, "1,2,3")).toBe("سطح ۶");
  });
});
