// Unit tests for the pure broadcast logic: filter parsing, message validation,
// audience labels, SMS template and the recipient cap (no database involved).
import { describe, expect, it } from "vitest";
import {
  BROADCAST_SMS_PREFIX, MAX_BROADCAST_RECIPIENTS, MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH,
  audienceLabel, broadcastSmsText, filterParams, parseBroadcastFilters,
  parseBroadcastMessage, recipientsWithinCap,
} from "@/lib/broadcasts";

describe("اعتبارسنجی فیلتر مخاطبان", () => {
  it("ورودی خالی یعنی همه فعالان محدوده، بدون خطا", () => {
    const { filters, error } = parseBroadcastFilters({});
    expect(error).toBeUndefined();
    expect(filters.onlyWithPhone).toBe(false);
    expect(filters.provinceId).toBeUndefined();
  });

  it("شناسه‌های عددی و وضعیت معتبر پذیرفته می‌شوند", () => {
    const { filters, error } = parseBroadcastFilters({ provinceId: "7", countyId: "13", specialtyId: "3", status: "pending", onlyWithPhone: "1" });
    expect(error).toBeUndefined();
    expect(filters).toMatchObject({ provinceId: 7, countyId: 13, specialtyId: 3, status: "pending", onlyWithPhone: true });
  });

  it("شناسه غیرعددی یا منفی خطا می‌دهد", () => {
    expect(parseBroadcastFilters({ provinceId: "abc" }).error).toBeTruthy();
    expect(parseBroadcastFilters({ specialtyId: "0" }).error).toBeTruthy();
    expect(parseBroadcastFilters({ countyId: "1; drop table" }).error).toBeTruthy();
  });

  it("وضعیت نامعتبر خطا می‌دهد", () => {
    expect(parseBroadcastFilters({ status: "hacked" }).error).toBeTruthy();
    expect(parseBroadcastFilters({ status: "approved" }).error).toBeUndefined();
  });

  it("شهرستان بدون استان خطا می‌دهد", () => {
    expect(parseBroadcastFilters({ countyId: "5" }).error).toBeTruthy();
    expect(parseBroadcastFilters({ provinceId: "2", countyId: "5" }).error).toBeUndefined();
  });
});

describe("اعتبارسنجی پیام", () => {
  it("عنوان و متن خالی خطا می‌دهد", () => {
    expect(parseBroadcastMessage({}).error).toBeTruthy();
    expect(parseBroadcastMessage({ subject: "عنوان" }).error).toBeTruthy();
    expect(parseBroadcastMessage({ body: "متن" }).error).toBeTruthy();
  });

  it("پیام معتبر برش‌خورده و بدون خطا برمی‌گردد", () => {
    const { subject, body, error } = parseBroadcastMessage({ subject: "  اطلاعیه دوره  ", body: " ثبت‌نام از شنبه آغاز می‌شود. " });
    expect(error).toBeUndefined();
    expect(subject).toBe("اطلاعیه دوره");
    expect(body).toBe("ثبت‌نام از شنبه آغاز می‌شود.");
  });

  it("سقف طول عنوان و متن رعایت می‌شود", () => {
    expect(parseBroadcastMessage({ subject: "ا".repeat(MAX_SUBJECT_LENGTH + 1), body: "متن" }).error).toBeTruthy();
    expect(parseBroadcastMessage({ subject: "عنوان", body: "م".repeat(MAX_BODY_LENGTH + 1) }).error).toBeTruthy();
    expect(parseBroadcastMessage({ subject: "ا".repeat(MAX_SUBJECT_LENGTH), body: "م".repeat(MAX_BODY_LENGTH) }).error).toBeUndefined();
  });
});

describe("برچسب مخاطبان و پارامترها", () => {
  it("بدون فیلتر برچسب کل فعالان است", () => {
    expect(audienceLabel({ onlyWithPhone: false }, {})).toBe("همه فعالان محدوده دسترسی");
  });

  it("اجزای فیلتر در برچسب فارسی می‌آیند", () => {
    const label = audienceLabel(
      { provinceId: 1, specialtyId: 3, status: "pending", onlyWithPhone: true },
      { province: "تهران", specialty: "قاری" },
    );
    expect(label).toContain("استان تهران");
    expect(label).toContain("تخصص قاری");
    expect(label).toContain("در انتظار بررسی");
    expect(label).toContain("فقط دارای شماره همراه");
  });

  it("فیلدهای خالی از پارامترهای پنهان حذف می‌شوند", () => {
    const params = filterParams({ provinceId: 4, onlyWithPhone: true });
    expect(params).toEqual({ provinceId: "4", onlyWithPhone: "1" });
    expect(Object.keys(filterParams({ onlyWithPhone: false }))).toHaveLength(0);
  });
});

describe("قالب پیامک گروهی و سقف گیرندگان", () => {
  it("پیامک با پیشوند سامانه نور شروع می‌شود و عنوان و متن را دارد", () => {
    const text = broadcastSmsText("اطلاعیه", "ثبت‌نام آغاز شد.");
    expect(text.startsWith(BROADCAST_SMS_PREFIX)).toBe(true);
    expect(text).toContain("اطلاعیه");
    expect(text).toContain("ثبت‌نام آغاز شد.");
  });

  it("متن بلندتر از ۴۸۰ نویسه برش می‌خورد", () => {
    const text = broadcastSmsText("عنوان", "م".repeat(600));
    expect(text.length).toBeLessThanOrEqual(480);
    expect(text.endsWith("…")).toBe(true);
  });

  it("سقف گیرندگان ۵۰۰ است و مقادیر منفی رد می‌شوند", () => {
    expect(MAX_BROADCAST_RECIPIENTS).toBe(500);
    expect(recipientsWithinCap(0)).toBe(true);
    expect(recipientsWithinCap(500)).toBe(true);
    expect(recipientsWithinCap(501)).toBe(false);
    expect(recipientsWithinCap(-1)).toBe(false);
  });
});
