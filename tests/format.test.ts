import { describe, expect, it } from "vitest";
import { isoToJalali, jalaliToIso, normalizeDigits, normalizeText, validIdCardNumber, validNationalId, validPostalCode } from "@/lib/format";
import { documentTypeLabels, referenceSpecialties, sourceLabels } from "@/lib/constants";
import { caseFilterQuery, parseCaseFilters } from "@/lib/case-search";

describe("normalizeDigits", () => {
  it("converts Persian digits to ASCII", () => {
    expect(normalizeDigits("۱۲۳۴۵")).toBe("12345");
  });
  it("converts Arabic-Indic digits to ASCII", () => {
    expect(normalizeDigits("٠١٢٣")).toBe("0123");
  });
  it("leaves ASCII digits unchanged", () => {
    expect(normalizeDigits("0491")).toBe("0491");
  });
});

describe("normalizeText", () => {
  it("normalizes Arabic yeh/kaf to Persian forms", () => {
    expect(normalizeText("علي كريم")).toBe("علی کریم");
  });
  it("collapses whitespace", () => {
    expect(normalizeText(" سلام   دنیا ")).toBe("سلام دنیا");
  });
});

describe("validNationalId", () => {
  it("accepts a checksum-valid national id", () => {
    expect(validNationalId("0079279902")).toBe(true);
    expect(validNationalId("1234567891")).toBe(true);
  });
  it("rejects invalid checksum", () => {
    expect(validNationalId("0079279906")).toBe(false);
    expect(validNationalId("0079279907")).toBe(false);
  });
  it("rejects repeated digits and wrong lengths", () => {
    expect(validNationalId("0000000000")).toBe(false);
    expect(validNationalId("12345")).toBe(false);
    expect(validNationalId("12345678901")).toBe(false);
  });
});

describe("validPostalCode", () => {
  it("accepts a ten-digit postal code", () => {
    expect(validPostalCode("1234567890")).toBe(true);
    expect(validPostalCode("0134567890")).toBe(true);
  });
  it("rejects wrong length, non-digits and all-zero", () => {
    expect(validPostalCode("12345")).toBe(false);
    expect(validPostalCode("12345678901")).toBe(false);
    expect(validPostalCode("12345678a0")).toBe(false);
    expect(validPostalCode("0000000000")).toBe(false);
  });
});

describe("validIdCardNumber", () => {
  it("accepts digits up to ten places", () => {
    expect(validIdCardNumber("123456")).toBe(true);
    expect(validIdCardNumber("0012345")).toBe(true);
    expect(validIdCardNumber("1234567890")).toBe(true);
  });
  it("rejects letters, empty and over-long values", () => {
    expect(validIdCardNumber("1234a")).toBe(false);
    expect(validIdCardNumber("")).toBe(false);
    expect(validIdCardNumber("12345678901")).toBe(false);
  });
});

describe("phase-1 reference data", () => {
  it("exposes the paper-form source label", () => {
    expect(sourceLabels.paper).toBe("ورود از فرم کاغذی");
    expect(Object.keys(sourceLabels)).toHaveLength(4);
  });
  it("exposes the three base specialties of the requirement document", () => {
    const codes = referenceSpecialties.map((item) => item.code);
    expect(codes).toContain("commentator");
    expect(codes).toContain("author");
    expect(codes).toContain("cultural_activist");
  });
  it("exposes the document type catalogue", () => {
    expect(Object.keys(documentTypeLabels)).toContain("national_card");
    expect(Object.keys(documentTypeLabels)).toContain("course_certificate");
    expect(Object.keys(documentTypeLabels)).toHaveLength(7);
  });
});

describe("jalaliToIso / isoToJalali", () => {
  it("converts a valid Jalali date", () => {
    expect(jalaliToIso("1403/05/02")).toBe("2024-07-23");
  });
  it("accepts Persian digits", () => {
    expect(jalaliToIso("۱۴۰۳/۰۵/۰۲")).toBe("2024-07-23");
  });
  it("rejects invalid dates and future dates", () => {
    expect(jalaliToIso("1403/13/01")).toBeNull();
    expect(jalaliToIso("1403/05/32")).toBeNull();
    expect(jalaliToIso("1500/01/01")).toBeNull();
    expect(jalaliToIso("not-a-date")).toBeNull();
  });
  it("round-trips iso to jalali", () => {
    const iso = jalaliToIso("1403/05/02")!;
    expect(isoToJalali(iso)).toBe("1403/05/02");
  });
});

describe("phase-2 case filters", () => {
  it("accepts a valid expert/source/institution/date-range combination", () => {
    const parsed = parseCaseFilters({ expertId: "123e4567-e89b-42d3-a456-426614174000", source: "paper", institution: "  کانون نور  ", from: "۱۴۰۳/۰۱/۰۱", to: "1403/06/31" });
    expect(parsed.error).toBeUndefined();
    expect(parsed.filters.expertId).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(parsed.filters.source).toBe("paper");
    expect(parsed.filters.institution).toBe("کانون نور");
    expect(parsed.filters.fromIso).toBe("2024-03-20");
    expect(parsed.filters.toIso).toBe("2024-09-21");
  });
  it("rejects an unknown source value", () => {
    expect(parseCaseFilters({ source: "hacked" }).error).toBe("منبع ثبت معتبر نیست.");
  });
  it("rejects a non-uuid expert id", () => {
    expect(parseCaseFilters({ expertId: "abc" }).error).toBe("کارشناس مسئول معتبر نیست.");
  });
  it("rejects an invalid Jalali date range value", () => {
    expect(parseCaseFilters({ from: "1403/02/32" }).error).toContain("شمسی");
  });
  it("rejects an inverted date range", () => {
    expect(parseCaseFilters({ from: "1403/05/01", to: "1403/01/01" }).error).toContain("بعد از تاریخ پایان");
  });
  it("serializes the new filters into the shareable query string", () => {
    const parsed = parseCaseFilters({ expertId: "123e4567-e89b-42d3-a456-426614174000", source: "manager", institution: "اوقاف", from: "1403/01/01" });
    const query = new URLSearchParams(caseFilterQuery(parsed.filters));
    expect(query.get("expertId")).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(query.get("source")).toBe("manager");
    expect(query.get("institution")).toBe("اوقاف");
    expect(query.get("from")).toBe("1403/01/01");
  });
});
