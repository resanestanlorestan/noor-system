import { describe, expect, it } from "vitest";
import {
  activistRoleOptions, commentatorOptions, cooperationTypeOptions, courseFieldOptions,
  educationLevelOptions, hafizJuzOptions, formatSpecialtyDetail, legacyModarresFieldLabels,
  legacyTeacherSubjectLabels, memorizationCertTypeOptions, modarresFieldOptions, teacherSubjectOptions,
} from "@/lib/constants";
import { renderSmsBody, smsTemplateDef } from "@/lib/sms-templates";

// الحاقیهٔ ۲.۱۲.۰ — فهرست‌ها و قابلیت‌های جدید: تحصیلات، حافظ قرآن، تفسیر و تدبر،
// معلم/مدرس قرآنی، فعال قرآنی، کشویی وابستهٔ رشته، سوابق همکاری و پیامک نتیجهٔ بررسی.

describe("تحصیلات — مقطع دانشگاهی و حوزوی", () => {
  it("فهرست دانشگاهی از بی‌سواد تا دکترا را دارد", () => {
    expect(educationLevelOptions.university[0]).toBe("بی‌سواد");
    expect(educationLevelOptions.university).toContain("دکتری");
    // مقادیر قدیمی برای سازگاری دادهٔ موجود حفظ شده‌اند
    expect(educationLevelOptions.university).toContain("دیپلم");
    expect(educationLevelOptions.university).toContain("فوق دکتری");
  });
  it("فهرست حوزوی سطح ۱ تا ۴ را دارد", () => {
    for (const level of ["سطح ۱", "سطح ۲", "سطح ۳", "سطح ۴"]) expect(educationLevelOptions.seminary).toContain(level);
    expect(educationLevelOptions.seminary).toContain("مقدمات");
  });
});

describe("حافظ قرآن — میزان حفظ و نوع مدرک", () => {
  it("کلیدهای ذخیره‌سازی ۱ تا ۳۰ و complete ثابت مانده‌اند", () => {
    for (let index = 1; index <= 30; index++) expect(hafizJuzOptions[String(index)]).toBeTruthy();
    expect(hafizJuzOptions.complete).toBeTruthy();
  });
  it("برچسب‌ها مطابق درخواست است: حفظ ۱ جزء تا حفظ کل قرآن کریم", () => {
    expect(hafizJuzOptions["1"]).toBe("حفظ ۱ جزء");
    expect(hafizJuzOptions["3"]).toBe("حفظ ۳ جزء");
    expect(hafizJuzOptions.complete).toBe("حفظ کل قرآن کریم");
  });
  it("نوع مدرک حافظ سه گزینه دارد", () => {
    expect(Object.values(memorizationCertTypeOptions)).toEqual(["دارای مدرک تخصصی حفظ", "دارای مدرک عمومی حفظ", "فاقد مدرک"]);
  });
});

describe("تفسیر و تدبر — حوزه‌های فعالیت", () => {
  it("سه حوزهٔ درخواستی با نام دقیق وجود دارد", () => {
    expect(commentatorOptions.tadabbor).toBe("تدبر در قرآن کریم");
    expect(commentatorOptions.lifestyle).toBe("سبک زندگی قرآنی");
    expect(commentatorOptions.concepts).toBe("مفاهیم قرآن کریم");
  });
  it("گزینهٔ تفسیر (قابلیت قبلی) حذف نشده است", () => {
    expect(commentatorOptions.tafsir).toBe("تفسیر");
  });
});

describe("معلم قرآنی — فهرست ۹ رشته‌ای", () => {
  it("نُه رشتهٔ درخواستی را دارد", () => {
    expect(Object.keys(teacherSubjectOptions)).toHaveLength(9);
    for (const key of ["rokhani", "preschool", "hifz", "tajvid", "lahn", "tadabbor", "lifestyle", "mafahim", "qeraat"]) {
      expect(teacherSubjectOptions[key]).toBeTruthy();
    }
    expect(teacherSubjectOptions.rokhani).toBe("روخوانی و روان‌خوانی");
    expect(teacherSubjectOptions.preschool).toBe("پیش‌دبستانی");
    expect(teacherSubjectOptions.hifz).toBe("حفظ قرآن کریم");
    expect(teacherSubjectOptions.mafahim).toBe("مفاهیم قرآن کریم");
  });
  it("علوم قرآنی و قصه‌های قرآنی از فهرست انتخاب حذف شده‌اند", () => {
    expect(teacherSubjectOptions.ghesas).toBeUndefined();
    expect(teacherSubjectOptions.olum).toBeUndefined();
    // اما برچسب‌های قدیمی برای نمایش داده‌های قبلی باقی مانده‌اند
    expect(legacyTeacherSubjectLabels.ghesas).toBeTruthy();
    expect(legacyTeacherSubjectLabels.olum).toBeTruthy();
  });
  it("دادهٔ قدیمیِ حذف‌شده همچنان در خروجی نمایش داده می‌شود", () => {
    const rendered = formatSpecialtyDetail("trainer", null, ["rokhani", "ghesas", "olum"]);
    expect(rendered).toContain("روخوانی و روان‌خوانی");
    expect(rendered).toContain("قصه‌های قرآنی");
    expect(rendered).toContain("علوم قرآنی");
  });
});

describe("مدرس قرآنی — فهرست ۷ رشته‌ای", () => {
  it("هفت رشتهٔ درخواستی را دارد", () => {
    expect(Object.keys(modarresFieldOptions)).toHaveLength(7);
    for (const key of ["rokhani", "preschool", "hifz", "tajvid", "lahn", "mafahim", "tadabbor"]) {
      expect(modarresFieldOptions[key]).toBeTruthy();
    }
  });
  it("گزینه‌های حذف‌شدهٔ قدیمی در برچسب‌های legacy می‌مانند", () => {
    expect(modarresFieldOptions.olum).toBeUndefined();
    expect(modarresFieldOptions.methods).toBeUndefined();
    expect(Object.keys(legacyModarresFieldLabels)).toHaveLength(5);
    const rendered = formatSpecialtyDetail("teacher", null, ["hifz", "methods"]);
    expect(rendered).toContain("حفظ");
    expect(rendered).toContain("مناهج و روش‌های تدریس قرآن");
  });
});

describe("فعال قرآنی — نقش‌های اجرایی", () => {
  it("چهار نقش درخواستی را دارد", () => {
    expect(activistRoleOptions.institute_manager).toBe("مدیر مؤسسه قرآنی");
    expect(activistRoleOptions.quran_house_manager).toBe("مدیر خانه قرآن");
    expect(activistRoleOptions.home_session_manager).toBe("مدیر جلسه خانگی قرآن");
    expect(activistRoleOptions.experiential_teacher).toBe("معلم تجربی قرآن");
  });
});

describe("کشویی وابستهٔ رشته — سوابق و دوره‌ها", () => {
  it("فهرست هشت‌گانهٔ رشته‌ها برای نوع سابقه و دوره‌ها یکسان است", () => {
    expect(Object.keys(courseFieldOptions)).toHaveLength(8);
    for (const key of ["rokhani", "preschool", "hifz", "tajvid", "lahn", "tadabbor", "lifestyle", "mafahim"]) {
      expect(courseFieldOptions[key]).toBeTruthy();
    }
  });
});

describe("سوابق همکاری — نوع همکاری", () => {
  it("پنج نوع همکاری استاندارد دارد", () => {
    expect(Object.values(cooperationTypeOptions)).toEqual(["تمام‌وقت", "نیمه‌وقت", "پروژه‌ای", "داوطلبانه", "سایر"]);
  });
});

describe("پیامک نتیجهٔ بررسی پرونده", () => {
  it("سه قالب تأیید، نیازمند اصلاح و رد در رجیستری است", () => {
    for (const key of ["case_approved", "case_correction", "case_rejected"]) {
      const template = smsTemplateDef(key);
      expect(template?.category).toBe("case");
      expect(template?.defaultBody.length).toBeGreaterThan(20);
    }
  });
  it("متن نیازمند اصلاح توضیح کارشناس را جای‌گذاری می‌کند", () => {
    const body = renderSmsBody(smsTemplateDef("case_correction")!.defaultBody, { name: "زهرا موسوی", reason: "گواهی دوره تجوید بارگذاری نشده است", app: "سامانه نور" });
    expect(body).toContain("زهرا موسوی");
    expect(body).toContain("گواهی دوره تجوید بارگذاری نشده است");
    expect(body).toContain("اصلاح");
  });
  it("متن تأیید پیام مثبت دارد", () => {
    const body = renderSmsBody(smsTemplateDef("case_approved")!.defaultBody, { name: "زهرا موسوی", app: "سامانه نور" });
    expect(body).toContain("تأیید شد");
  });
});
