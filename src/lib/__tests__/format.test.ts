import { describe, expect, it } from "vitest";
import {
  isoToJalali, jalaliToIso, jalaliToday, normalizeDigits, normalizeText,
  toPersianDigits, validIdCardNumber, validIranMobile, validNationalId, validPostalCode,
} from "@/lib/format";

describe("normalizeDigits / normalizeText", () => {
  it("converts Persian and Arabic digits to ASCII", () => {
    expect(normalizeDigits("۰۹۱۲۳۴۵۶۷۸۹")).toBe("09123456789");
    expect(normalizeDigits("٠١٢٣")).toBe("0123");
  });
  it("normalizes whitespace and zero-width characters", () => {
    expect(normalizeText(" علی\u200c  رضا ")).toBe("علی رضا");
    expect(normalizeText("A\u200bB")).toBe("AB");
  });
  it("toPersianDigits renders Persian numerals", () => {
    expect(toPersianDigits("1375/01/01")).toBe("۱۳۷۵/۰۱/۰۱");
  });
});

describe("validNationalId", () => {
  it("accepts a valid national ID", () => {
    // checksum: sum = 4*10+3*9+1*8+0*7+2*6+0*5+8*4+3*3+9*2 = 146 → rem 3 → check = 11-3 = 8
    expect(validNationalId("4310208398")).toBe(true);
  });
  it("rejects wrong checksum and malformed input", () => {
    expect(validNationalId("4310208397")).toBe(false);
    expect(validNationalId("4310208396")).toBe(false);
    expect(validNationalId("12345")).toBe(false);
    expect(validNationalId("1111111111")).toBe(false);
    expect(validNationalId("abcdefghij")).toBe(false);
  });
});

describe("other validators", () => {
  it("mobile numbers", () => {
    expect(validIranMobile("09123456789")).toBe(true);
    expect(validIranMobile("9123456789")).toBe(false);
    expect(validIranMobile("08123456789")).toBe(false);
  });
  it("id card number", () => {
    expect(validIdCardNumber("12345")).toBe(true);
    expect(validIdCardNumber("12345678901")).toBe(false);
  });
  it("postal code", () => {
    expect(validPostalCode("1234567890")).toBe(true);
    expect(validPostalCode("0000000000")).toBe(false);
    expect(validPostalCode("12345")).toBe(false);
  });
});

describe("jalali conversion", () => {
  it("round-trips a normal date", () => {
    const iso = jalaliToIso("۱۳۷۵/۰۱/۰۱");
    expect(iso).toBe("1996-03-20");
    expect(isoToJalali(iso!)).toBe("1375/01/01");
  });
  it("handles single-digit month/day (Mehr 1 1403 = Sep 22)", () => {
    expect(jalaliToIso("1403/7/15")).toBe("2024-10-06");
    expect(isoToJalali("2024-09-22")).toBe("1403/07/01");
  });
  it("rejects impossible dates", () => {
    expect(jalaliToIso("1403/13/01")).toBeNull();
    expect(jalaliToIso("1403/07/31")).toBeNull(); // Mehr has 30 days
    expect(jalaliToIso("")).toBeNull();
    expect(jalaliToIso("abc")).toBeNull();
  });
  it("leap year Esfand 30 is valid (1403 is leap)", () => {
    expect(jalaliToIso("1403/12/30")).toBe("2025-03-20");
  });
  it("jalaliToday returns a plausible current date string", () => {
    expect(jalaliToday()).toMatch(/^1[45]\d{2}\/\d{2}\/\d{2}$/);
  });
});
