// الحاقیهٔ ۲.۱۰.۵ — رجیستری قالب‌های پیامک سامانه.
// این فایل «منبع حقیقت» انواع پیامک است و کاملاً خالص است (بدون وابستگی به
// دیتابیس) تا در کد کلاینت هم امن باشد؛ افزودن یک نوع پیامک جدید فقط یعنی یک
// ورودی به SMS_TEMPLATE_DEFS و یک فراخوانی queueTemplateSms در نقطهٔ ارسال —
// متنِ هر قالب از دیتابیس (sms_templates، در lib/sms-admin.ts) یا پیش‌فرض
// همین‌جا خوانده می‌شود و از داشبورد مدیریت پیامک‌ها بدون تغییر کد ویرایش می‌شود.

export type SmsCategory = "auth" | "case" | "reminder" | "event" | "broadcast" | "test" | "system";

export const smsCategoryLabels: Record<SmsCategory, string> = {
  auth: "احراز هویت", case: "پرونده‌ها", reminder: "یادآورها", event: "رویدادها",
  broadcast: "پیام گروهی", test: "آزمایشی", system: "سیستمی",
};

export type SmsVariableDef = { token: string; label: string; sample: string };
export type SmsTemplateDef = {
  key: string;
  category: SmsCategory;
  label: string;
  hint: string;
  variables: SmsVariableDef[];
  defaultBody: string;
};

export const SMS_TEMPLATE_DEFS: SmsTemplateDef[] = [
  {
    key: "mobile_verification",
    category: "auth",
    label: "کد تأیید ثبت‌نام / شماره موبایل",
    hint: "با درخواست کد تأیید موبایل (ثبت‌نام، ورود اول و ارسال دوباره) فرستاده می‌شود.",
    variables: [
      { token: "code", label: "کد تأیید", sample: "۴۸۲۹۱۰" },
      { token: "app", label: "نام سامانه", sample: "سامانه جامع فعالان قرآنی" },
    ],
    defaultBody: "کد تأیید ثبت‌نام شما در {{app}}: {{code}}\nاعتبار این کد ۱۰ دقیقه است؛ آن را در اختیار هیچ‌کس قرار ندهید.",
  },
  {
    key: "password_reset",
    category: "auth",
    label: "کد بازیابی گذرواژه",
    hint: "با درخواست بازیابی گذرواژه از مسیر «فراموشی رمز» فرستاده می‌شود.",
    variables: [
      { token: "code", label: "کد تأیید", sample: "۴۸۲۹۱۰" },
      { token: "app", label: "نام سامانه", sample: "سامانه جامع فعالان قرآنی" },
    ],
    defaultBody: "کد بازیابی گذرواژه شما در {{app}}: {{code}}\nاعتبار این کد ۱۰ دقیقه است؛ آن را در اختیار هیچ‌کس قرار ندهید.",
  },
  {
    key: "case_submitted",
    category: "case",
    label: "ارسال پرونده برای بررسی",
    hint: "پس از ارسال پرونده به کارتابل بررسی، به کارکنان بررسیِ همان استان/شهرستان می‌رسد.",
    variables: [
      { token: "name", label: "نام فعال", sample: "زهرا موسوی" },
      { token: "app", label: "نام سامانه", sample: "سامانه نور" },
    ],
    defaultBody: "{{app}}: پرونده {{name}} برای بررسی ارسال شد. لطفاً کارتابل پرونده‌ها را در سامانه کنترل فرمایید.",
  },
  // الحاقیهٔ ۲.۱۶.۰ — اطلاع‌رسانی خودکار ثبت پرونده به مدیران دارای دریافت فعال
  {
    key: "manager_case_created",
    category: "case",
    label: "اطلاع‌رسانی ثبت پرونده به مدیران",
    hint: "به‌محض ثبت (ارسال برای بررسی) هر پروندهٔ جدید، برای همهٔ مدیران فعالِ فهرست «اطلاع‌رسانی پیامکی مدیران» فرستاده می‌شود.",
    variables: [
      { token: "registrant", label: "نام ثبت‌کننده", sample: "زهرا موسوی" },
      { token: "datetime", label: "تاریخ و ساعت ثبت", sample: "۱۴۰۵/۸/۲۴ ساعت ۱۶:۳۰" },
      { token: "app", label: "نام سامانه", sample: "سامانه نور" },
    ],
    defaultBody: "مدیر محترم، یک پرونده جدید در {{app}} ثبت شد.\nثبت‌کننده: {{registrant}}\nزمان ثبت: {{datetime}}\nلطفاً جهت بررسی به پنل مدیریت مراجعه فرمایید.",
  },
  // الحاقیهٔ ۲.۱۲.۰ — پیامک نتیجهٔ بررسی به خودِ فعال: تأیید، نیازمند اصلاح
  // (با توضیح کارشناس) و رد؛ متن هر سه از پنل مدیریت پیامک‌ها قابل ویرایش است.
  {
    key: "case_approved",
    category: "case",
    label: "تأیید پرونده به فعال",
    hint: "پس از تأیید نهایی پرونده توسط مسئول مجاز، به خودِ فعال می‌رسد.",
    variables: [
      { token: "name", label: "نام فعال", sample: "زهرا موسوی" },
      { token: "app", label: "نام سامانه", sample: "سامانه نور" },
    ],
    defaultBody: "{{app}}: {{name}} عزیز، پرونده شما تأیید شد و فرآیند بررسی کامل شد. از همراهی شما سپاسگزاریم.",
  },
  {
    key: "case_correction",
    category: "case",
    label: "نیازمند اصلاح به فعال",
    hint: "پس از اعلام نقص، به خودِ فعال با توضیح کارشناس می‌رسد.",
    variables: [
      { token: "name", label: "نام فعال", sample: "زهرا موسوی" },
      { token: "reason", label: "توضیح کارشناس", sample: "گواهی دوره تجوید بارگذاری نشده است" },
      { token: "app", label: "نام سامانه", sample: "سامانه نور" },
    ],
    defaultBody: "{{app}}: {{name}} عزیز، پرونده شما نیازمند اصلاح است. {{reason}} لطفاً برای اصلاح موارد به سامانه مراجعه کنید.",
  },
  {
    key: "case_rejected",
    category: "case",
    label: "نتیجهٔ بررسی به فعال",
    hint: "پس از رد پرونده، به خودِ فعال می‌رسد؛ جزئیات دلیل در سامانه ثبت می‌شود.",
    variables: [
      { token: "name", label: "نام فعال", sample: "زهرا موسوی" },
      { token: "app", label: "نام سامانه", sample: "سامانه نور" },
    ],
    defaultBody: "{{app}}: {{name}} عزیز، نتیجه بررسی پرونده شما ثبت شده است. برای مشاهده جزئیات و ثبت اعتراض وارد سامانه شوید.",
  },
  {
    key: "overdue_staff",
    category: "reminder",
    label: "یادآور معوق به مسئول پرونده",
    hint: "در صفحهٔ یادآور معوق‌ها و کرون روزانه، به مسئول هر پروندهٔ معوق فرستاده می‌شود.",
    variables: [
      { token: "name", label: "نام فعال", sample: "زهرا موسوی" },
      { token: "days", label: "روز انتظار", sample: "۱۲" },
    ],
    defaultBody: "سامانه نور: پرونده {{name}} بیش از {{days}} روز در انتظار بررسی است. لطفاً در سامانه پیگیری فرمایید.",
  },
  {
    key: "overdue_activist",
    category: "reminder",
    label: "یادآور معوق به فعال",
    hint: "یادآور پیگیری وضعیت پرونده به خودِ فعالِ ثبت‌کننده.",
    variables: [
      { token: "days", label: "روز انتظار", sample: "۱۲" },
    ],
    defaultBody: "سامانه نور: پرونده شما بیش از {{days}} روز در انتظار بررسی است. برای اطلاع از وضعیت به سامانه مراجعه فرمایید.",
  },
  {
    key: "event_reminder",
    category: "event",
    label: "یادآور رویداد",
    hint: "پیش از برگزاری رویداد برای شرکت‌کننده‌های دارای شماره موبایل.",
    variables: [
      { token: "title", label: "عنوان رویداد", sample: "همایش قرآنی استان" },
      { token: "date", label: "زمان برگزاری", sample: "۱۴۰۵/۰۹/۰۵ ساعت ۰۹:۰۰" },
      { token: "place", label: "مکان", sample: "در سالن اجلاس استان" },
    ],
    defaultBody: "سامانه نور: رویداد «{{title}}» در تاریخ {{date}} برگزار می‌شود{{place}}. لطفاً حضور خود را در سامانه تأیید کنید.",
  },
];

export const smsTemplateDef = (key: string) => SMS_TEMPLATE_DEFS.find((item) => item.key === key) || null;

/** متن پیش‌فرض ثبت‌شده در رجیستری؛ اگر قالب در دیتابیس ویرایش نشده باشد همین استفاده می‌شود. */
export function defaultSmsBody(key: string): string {
  return smsTemplateDef(key)?.defaultBody ?? "";
}

/** جایگزینی متغیرهای {{token}}؛ متغیر غایب با رشتهٔ خالی جایگزین می‌شود. */
export function renderSmsBody(body: string, vars: Record<string, string | number | undefined | null>): string {
  return body.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, token: string) => {
    const value = vars[token];
    return value === undefined || value === null ? "" : String(value);
  });
}

/** پیش‌نمایش قالب با مقادیر نمونه برای پنل مدیریت. */
export function previewSmsBody(body: string, variables: SmsVariableDef[]): string {
  return renderSmsBody(body, Object.fromEntries(variables.map((item) => [item.token, item.sample])));
}
