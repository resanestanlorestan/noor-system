import { describe, expect, it } from "vitest";
import { toGregorian, toJalaali } from "jalaali-js";
import { JALALI_YEAR_MAX, JALALI_YEAR_MIN, jalaliText, parseJalaliOrIso } from "@/components/jalali-date-picker";

describe("parseJalaliOrIso", () => {
  it("parses standard Latin-digit Jalali text", () => {
    expect(parseJalaliOrIso("1403/05/12")).toEqual({ jy: 1403, jm: 5, jd: 12 });
    expect(parseJalaliOrIso("1375/1/1")).toEqual({ jy: 1375, jm: 1, jd: 1 });
  });

  it("parses Persian-digit Jalali text (user-facing format)", () => {
    expect(parseJalaliOrIso("۱۴۰۳/۰۵/۱۲")).toEqual({ jy: 1403, jm: 5, jd: 12 });
  });

  it("parses stored ISO Gregorian dates back to Jalali", () => {
    // 2024-08-02 Gregorian == 1403/05/12 Jalali
    expect(parseJalaliOrIso("2024-08-02")).toEqual({ jy: 1403, jm: 5, jd: 12 });
    // Wizard defaults pass isoToJalali output, DB passes ISO — both accepted.
    expect(parseJalaliOrIso("1995-03-21")).toEqual(toJalaali(1995, 3, 21));
  });

  it("accepts the datetime wire format of events (date part)", () => {
    expect(parseJalaliOrIso("2026-11-20T18:30")).toEqual(toJalaali(2026, 11, 20));
  });

  it("rejects invalid input", () => {
    expect(parseJalaliOrIso("")).toBeNull();
    expect(parseJalaliOrIso("abc")).toBeNull();
    expect(parseJalaliOrIso("1403/13/01")).toBeNull(); // ماه نامعتبر
    expect(parseJalaliOrIso("1403/07/31")).toBeNull(); // مهر ۳۰ روز دارد
    expect(parseJalaliOrIso("1404/12/30")).toBeNull(); // ۱۴۰۴ کبیسه نیست
    expect(parseJalaliOrIso("9999/01/01")).toBeNull(); // بیرون از محدودهٔ سال
  });

  it("accepts valid edge days: six 31-day months and leap Esfand 30", () => {
    expect(parseJalaliOrIso("1403/05/31")).toEqual({ jy: 1403, jm: 5, jd: 31 }); // مرداد ۳۱ روز دارد
    expect(parseJalaliOrIso("1399/12/30")).toEqual({ jy: 1399, jm: 12, jd: 30 }); // ۱۳۹۹ کبیسه است
  });
});

describe("jalaliText round-trip", () => {
  it("produces the exact wire format jalaliToIso accepts (padded, Latin digits)", () => {
    expect(jalaliText({ jy: 1403, jm: 5, jd: 12 })).toBe("1403/05/12");
    expect(jalaliText({ jy: 1375, jm: 1, jd: 1 })).toBe("1375/01/01");
  });

  it("round-trips through real Gregorian conversion", () => {
    const original = { jy: 1420, jm: 7, jd: 15 };
    const text = jalaliText(original);
    const reparsed = parseJalaliOrIso(text);
    expect(reparsed).toEqual(original);
    const g = toGregorian(original.jy, original.jm, original.jd);
    expect(parseJalaliOrIso(`${g.gy}-${String(g.gm).padStart(2, "0")}-${String(g.gd).padStart(2, "0")}`)).toEqual(original);
  });
});

describe("year bounds", () => {
  it("covers realistic birth dates and future events", () => {
    expect(JALALI_YEAR_MIN).toBeLessThanOrEqual(1330);
    expect(JALALI_YEAR_MAX).toBeGreaterThanOrEqual(1420);
  });
});
