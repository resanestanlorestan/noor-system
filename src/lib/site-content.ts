// الحاقیهٔ ۲.۱۸.۴ — مدیریت محتوای سایت (CMS)
// رجیستری مرکزی متن‌های قابل ویرایش سایت: هر کلید = یک متنِ نمایشی با صفحه/بخش/
// برچسب و مقدار پیش‌فرضِ استخراج‌شده از خود رابط کاربری. مقادیر ذخیره‌شدهٔ مدیر
// در جدول site_content بر پیش‌فرض مقدم می‌شوند؛ تا پیش از نخستین ویرایش، جدول
// خالی است و همین پیش‌فرض‌ها سرو می‌شوند (الگوی استاندارد CMS: کد = پیش‌فرض،
// دیتابیس = محتوای جاری).
import { cache } from "react";
import { db } from "@/db";
import { siteContent } from "@/db/schema";

export type ContentKind = "title" | "subtitle" | "text" | "multiline" | "button" | "message";
export type ContentItem = { key: string; label: string; kind: ContentKind; value: string; hint?: string };
export type ContentGroup = {
  page: string;
  pageLabel: string;
  pageHint?: string;
  preview: "browser" | "authcard" | "herocard" | "none";
  items: ContentItem[];
};

export const CONTENT_MAX_LENGTH = 2000;

export const siteContentGroups: ContentGroup[] = [
  {
    page: "site", pageLabel: "شناسنامهٔ سایت", preview: "browser",
    pageHint: "عنوان و توضیحی که در تب مرورگر، نتایج جست‌وجو و اشتراک‌گذاری لینک‌ها نمایش داده می‌شود.",
    items: [
      { key: "site.title", label: "عنوان اصلی سایت", kind: "title", value: "نور | سامانه جامع فعالان قرآنی" },
      { key: "site.description", label: "توضیحات سایت", kind: "multiline", value: "سامانه ثبت و بررسی پرونده فعالان قرآنی" },
    ],
  },
  {
    page: "shell", pageLabel: "پوستهٔ سامانه (منو و نوار بالا)", preview: "browser",
    pageHint: "متن‌های همیشگی پوستهٔ کاربری: برند منو، عنوان نوار بالا و جای‌نگهدار جست‌وجو.",
    items: [
      { key: "shell.brand.title", label: "نام سامانه در منو", kind: "title", value: "سامانه نور" },
      { key: "shell.brand.subtitle", label: "زیرعنوان منو", kind: "subtitle", value: "جامع فعالان قرآنی" },
      { key: "shell.topbar.title", label: "عنوان نوار بالا", kind: "title", value: "سامانه جامع فعالان قرآنی" },
      { key: "shell.search.placeholder", label: "متن راهنمای جست‌وجو", kind: "subtitle", value: "جست‌وجو در پرونده‌ها..." },
    ],
  },
  {
    page: "auth", pageLabel: "صفحات ورود و ثبت‌نام", preview: "authcard",
    pageHint: "سربرگ، ستون معرفی، عنوان کارت، دکمه‌ها و پیام‌های راهنمای صفحات عمومی.",
    items: [
      { key: "auth.story.badge", label: "نشان بالای ستون معرفی", kind: "subtitle", value: "همراه جامعه قرآنی کشور" },
      { key: "auth.story.heading1", label: "تیتر ستون معرفی (سطر اول)", kind: "title", value: "برای ثبت امروز،" },
      { key: "auth.story.heading2", label: "تیتر ستون معرفی (سطر دوم — با تأکید)", kind: "title", value: "برای آینده‌ای روشن‌تر" },
      { key: "auth.story.body", label: "توضیح ستون معرفی", kind: "multiline", value: "مسیر یکپارچه شناسایی و همراهی با فعالان قرآنی؛ از ایجاد حساب و تکمیل پرونده تا بررسی و پیگیری." },
      { key: "auth.feature1.title", label: "مزیت ۱ — عنوان", kind: "subtitle", value: "یک خانواده بزرگ قرآنی" },
      { key: "auth.feature1.sub", label: "مزیت ۱ — توضیح", kind: "text", value: "ثبت و تکمیل اطلاعات در یک فضای یکپارچه" },
      { key: "auth.feature2.title", label: "مزیت ۲ — عنوان", kind: "subtitle", value: "پیگیری آسان پرونده‌ها" },
      { key: "auth.feature2.sub", label: "مزیت ۲ — توضیح", kind: "text", value: "مراحل بررسی شفاف و قابل پیگیری" },
      { key: "auth.feature3.title", label: "مزیت ۳ — عنوان", kind: "subtitle", value: "حریم خصوصی در اولویت" },
      { key: "auth.feature3.sub", label: "مزیت ۳ — توضیح", kind: "text", value: "دسترسی به اطلاعات بر اساس نقش و محدوده" },
      { key: "auth.story.footer", label: "پانوشت ستون معرفی", kind: "text", value: "سامانه جامع فعالان قرآنی" },
      { key: "auth.login.eyebrow", label: "ورود — عنوان کوچک", kind: "subtitle", value: "خوش آمدید" },
      { key: "auth.login.title", label: "ورود — عنوان کارت", kind: "title", value: "ورود به سامانه" },
      { key: "auth.login.body", label: "ورود — توضیح کارت", kind: "text", value: "برای ورود، اطلاعات حساب کاربری خود را وارد کنید." },
      { key: "auth.register.eyebrow", label: "ثبت‌نام — عنوان کوچک", kind: "subtitle", value: "همراه ما شوید" },
      { key: "auth.register.title", label: "ثبت‌نام — عنوان کارت", kind: "title", value: "ایجاد حساب کاربری" },
      { key: "auth.register.body", label: "ثبت‌نام — توضیح کارت", kind: "multiline", value: "فقط اطلاعات ضروری حساب: نام، نام خانوادگی، شماره موبایل و گذرواژه. پس از ایجاد حساب و ورود، پرونده الکترونیکی خود را در بخش «پرونده‌ها» مرحله‌به‌مرحله تکمیل و مدارک را بارگذاری می‌کنید." },
      { key: "auth.setup.eyebrow", label: "راه‌اندازی اولیه — عنوان کوچک", kind: "subtitle", value: "پیکربندی اولیه" },
      { key: "auth.setup.title", label: "راه‌اندازی اولیه — عنوان کارت", kind: "title", value: "ساخت مدیر اولیه" },
      { key: "auth.setup.body", label: "راه‌اندازی اولیه — توضیح کارت", kind: "text", value: "این مرحله فقط یک‌بار و با کد محلی انجام می‌شود." },
      { key: "auth.reset_done", label: "پیام موفقیت بازنشانی گذرواژه", kind: "message", value: "گذرواژه با موفقیت بازنشانی شد؛ با گذرواژه جدید وارد شوید." },
      { key: "auth.login.register_cta", label: "دکمهٔ ثبت‌نام فعال قرآنی", kind: "button", value: "ثبت‌نام فعال قرآنی" },
      { key: "auth.login.forgot_prompt", label: "پرسش فراموشی گذرواژه", kind: "text", value: "گذرواژه را فراموش کرده‌اید؟" },
      { key: "auth.login.forgot_cta", label: "دکمهٔ بازیابی گذرواژه", kind: "button", value: "بازیابی با پیامک" },
      { key: "auth.login.first_setup", label: "متن بخش راه‌اندازی اولیه", kind: "text", value: "اولین ورود به سامانه؟" },
      { key: "auth.login.setup_cta", label: "دکمهٔ راه‌اندازی مدیر اولیه", kind: "button", value: "راه‌اندازی مدیر اولیه" },
      { key: "auth.register.have_account", label: "متن کاربران قبلیِ ثبت‌نام", kind: "text", value: "پیش‌تر حساب ساخته‌اید؟" },
      { key: "auth.bottom_note", label: "یادداشت پایین کارت", kind: "text", value: "دسترسی به اطلاعات بر اساس نقش و محدوده مجاز کنترل می‌شود." },
      { key: "auth.footer.left", label: "پانوشت صفحه — سمت راست", kind: "text", value: "سامانه جامع فعالان قرآنی" },
      { key: "auth.footer.credit", label: "پانوشت صفحه — اعتبار طراح", kind: "text", value: "طراحی شده توسط پویا فرهادی" },
    ],
  },
  {
    page: "dashboard", pageLabel: "داشبورد اصلی", preview: "herocard",
    pageHint: "خوش‌آمدگویی، بنر اصلی، پانل‌های روند و وضعیت و پیام‌های نمایشی داشبورد.",
    items: [
      { key: "dash.head.title_activist", label: "عنوان صفحه برای فعال قرآنی", kind: "title", value: "داشبورد من" },
      { key: "dash.head.title_admin", label: "عنوان صفحه برای مدیران", kind: "title", value: "داشبورد مدیریتی" },
      { key: "dash.head.subtitle", label: "زیرعنوان خوش‌آمدگویی", kind: "text", value: "به سامانه جامع فعالان قرآنی خوش آمدید" },
      { key: "dash.hero.badge", label: "نشان بنر اصلی", kind: "subtitle", value: "همراه جامعه قرآنی" },
      { key: "dash.hero.title_template", label: "تیتر بنر اصلی", kind: "message", value: "{name}، خوش آمدید", hint: "‏{name} با نام کاربرِ واردشده جایگزین می‌شود." },
      { key: "dash.hero.body", label: "متن بنر اصلی", kind: "multiline", value: "در کنار هم، برای شناسایی و همراهی بهتر با فعالان قرآنی.\nپرونده‌ها و اقدامات خود را از اینجا پیگیری کنید.", hint: "هر سطر جدید در سایت به‌صورت خط جدید نمایش داده می‌شود." },
      { key: "dash.hero.cta", label: "دکمهٔ بنر اصلی", kind: "button", value: "مشاهده پرونده‌ها" },
      { key: "dash.hero.caption", label: "زیرنویس بنر اصلی", kind: "subtitle", value: "همراهی برای آینده‌ای روشن" },
      { key: "dash.overdue_template", label: "پیام پرونده‌های معوق", kind: "message", value: "{count} پرونده بیش از ۱۴ روز بدون بررسی مانده است.", hint: "‏{count} با تعداد واقعی (عدد فارسی) جایگزین می‌شود." },
      { key: "dash.trend.badge", label: "پانل روند — برچسب کوچک", kind: "subtitle", value: "نمودار روند" },
      { key: "dash.trend.title", label: "پانل روند — عنوان", kind: "title", value: "روند ثبت‌نام شش ماه شمسی" },
      { key: "dash.trend.sub", label: "پانل روند — توضیح", kind: "text", value: "پرونده‌های ثبت‌شده در شش ماه منتهی به ماه جاری" },
      { key: "dash.recent.badge", label: "پانل آخرین پرونده‌ها — برچسب", kind: "subtitle", value: "دسترسی سریع" },
      { key: "dash.recent.title", label: "پانل آخرین پرونده‌ها — عنوان", kind: "title", value: "آخرین پرونده‌ها" },
      { key: "dash.recent.sub", label: "پانل آخرین پرونده‌ها — توضیح", kind: "text", value: "آخرین اطلاعات ثبت‌شده در محدوده شما" },
      { key: "dash.recent.empty", label: "پیام خالی بودن فهرست پرونده‌ها", kind: "message", value: "برای شروع، اولین پرونده را ثبت کنید." },
      { key: "dash.status.badge", label: "پانل گردش کار — برچسب", kind: "subtitle", value: "گردش کار" },
      { key: "dash.status.title", label: "پانل گردش کار — عنوان", kind: "title", value: "وضعیت پرونده‌ها" },
      { key: "dash.status.sub", label: "پانل گردش کار — توضیح", kind: "text", value: "تایم‌لاین هشت‌مرحله‌ای هر پرونده" },
      { key: "dash.status.note", label: "یادداشت گردش کار", kind: "multiline", value: "از ثبت‌نام اولیه و تکمیل مدارک تا ارسال، بررسی تخصصی و نتیجهٔ نهایی — با تاریخ ورود به هر مرحله." },
      { key: "dash.status.cta", label: "دکمهٔ گردش کار", kind: "button", value: "مشاهده وضعیت پرونده‌ها" },
      { key: "dash.privacy.title", label: "کارت حریم خصوصی — عنوان", kind: "subtitle", value: "حریم خصوصی و کنترل دسترسی" },
      { key: "dash.privacy.body", label: "کارت حریم خصوصی — متن", kind: "multiline", value: "دسترسی به پرونده‌ها بر اساس نقش و محدوده جغرافیایی کنترل می‌شود و اقدامات حساس در رویدادهای سامانه ثبت می‌شوند." },
    ],
  },
  {
    page: "pages", pageLabel: "سرصفحهٔ صفحات سامانه", preview: "none",
    pageHint: "عنوان و زیرعنوانی که بالای هر صفحهٔ سامانه نمایش داده می‌شود.",
    items: [
      { key: "pages.cases.title", label: "بانک پرونده‌ها — عنوان", kind: "title", value: "بانک پرونده‌ها" },
      { key: "pages.cases.sub", label: "بانک پرونده‌ها — زیرعنوان", kind: "text", value: "مشاهده و پیگیری پرونده‌ها در محدوده دسترسی شما" },
      { key: "pages.cases_new.title", label: "ثبت پرونده جدید — عنوان", kind: "title", value: "ثبت پرونده جدید" },
      { key: "pages.cases_new.sub", label: "ثبت پرونده جدید — زیرعنوان", kind: "text", value: "ثبت اطلاعات مرحله‌به‌مرحله و اجباری است؛ تا مرحلهٔ جاری کامل و ذخیره نشود، مرحلهٔ بعدی قفل می‌ماند." },
      { key: "pages.cases_claim.title", label: "اتصال پرونده — عنوان", kind: "title", value: "پرونده من قبلاً ثبت شده است؟" },
      { key: "pages.cases_claim.sub", label: "اتصال پرونده — زیرعنوان", kind: "text", value: "اگر مدیر یا کارشناس پیش‌تر اطلاعات شما را ثبت کرده، با تطبیق مشخصات می‌توانید آن را به حساب خود متصل کنید." },
      { key: "pages.users.title", label: "مدیریت کاربران — عنوان", kind: "title", value: "مدیریت کاربران" },
      { key: "pages.users.sub", label: "مدیریت کاربران — زیرعنوان", kind: "text", value: "کاربران مجاز در محدوده مدیریتی خود را مشاهده کنید." },
      { key: "pages.events.title", label: "رویدادها — عنوان", kind: "title", value: "رویدادهای قرآنی" },
      { key: "pages.events.sub", label: "رویدادها — زیرعنوان", kind: "text", value: "ثبت رویدادهای کشوری، استانی و شهرستانی، دعوت فعالان و یادآور پیامکی پیش از برگزاری" },
      { key: "pages.reports.title", label: "گزارش‌ها — عنوان", kind: "title", value: "گزارش‌ها و آمار" },
      { key: "pages.reports.sub", label: "گزارش‌ها — زیرعنوان", kind: "text", value: "نمای تحلیلی پرونده‌ها در محدوده دسترسی شما" },
      { key: "pages.broadcasts.title", label: "پیام گروهی — عنوان", kind: "title", value: "ارسال پیام گروهی به فعالان" },
      { key: "pages.broadcasts.sub", label: "پیام گروهی — زیرعنوان", kind: "text", value: "پیامک و اعلان هم‌زمان برای فعالان محدوده مدیریتی شما، بر اساس فیلتر جغرافیا، تخصص و وضعیت پرونده" },
      { key: "pages.sms.title", label: "مدیریت پیامک‌ها — عنوان", kind: "title", value: "مدیریت پیامک‌ها" },
      { key: "pages.sms.sub", label: "مدیریت پیامک‌ها — زیرعنوان", kind: "text", value: "متن‌ها، قالب‌ها، تنظیمات ارسال و تاریخچهٔ همهٔ پیامک‌های سامانه — بدون تغییر کد" },
      { key: "pages.permissions.title", label: "نقش‌ها و مجوزها — عنوان", kind: "title", value: "ماتریس نقش‌ها و مجوزها" },
      { key: "pages.permissions.sub", label: "نقش‌ها و مجوزها — زیرعنوان", kind: "text", value: "مجوزهای هر نقش را تعیین کنید، نقش سفارشی تعریف کنید و آن را به کاربران تخصیص دهید." },
      { key: "pages.settings.title", label: "تقسیمات — عنوان", kind: "title", value: "تقسیمات، تخصص‌ها و سازمان‌ها" },
      { key: "pages.settings.sub", label: "تقسیمات — زیرعنوان", kind: "text", value: "فهرست پیش‌فرض شهرستان‌ها فقط شامل مراکز استان است و قابل تکمیل است." },
      { key: "pages.ranking.title", label: "رتبه‌بندی — عنوان", kind: "title", value: "رتبه‌بندی و امتیاز فعالان قرآنی" },
      { key: "pages.ranking.sub", label: "رتبه‌بندی — زیرعنوان", kind: "text", value: "امتیاز هر فعال از مجموع وزن‌دار سوابق ساختاریافته پرونده او محاسبه می‌شود: فعالیت‌ها، تدریس، داوری، مسابقات، پژوهش، دوره‌ها (و ساعت آن‌ها)، گواهینامه‌ها و حضور در رویدادها" },
      { key: "pages.reminders.title", label: "یادآور معوق‌ها — عنوان", kind: "title", value: "یادآور پیامکی پرونده‌های معوق" },
      { key: "pages.reminders.sub", label: "یادآور معوق‌ها — زیرعنوان", kind: "text", value: "پرونده‌هایی که بیش از حد تعیین‌شده بدون به‌روزرسانی در کارتابل بررسی مانده‌اند" },
      { key: "pages.notifications.title", label: "اعلان‌ها — عنوان", kind: "title", value: "اعلان‌ها" },
      { key: "pages.notifications.sub", label: "اعلان‌ها — زیرعنوان", kind: "text", value: "پیگیری رویدادها و تغییرات مربوط به پرونده‌های مجاز" },
      { key: "pages.outbox.title", label: "صندوق پیام‌ها — عنوان", kind: "title", value: "صندوق پیام‌های سامانه" },
      { key: "pages.outbox.sub", label: "صندوق پیام‌ها — زیرعنوان", kind: "text", value: "ایمیل‌ها و پیامک‌های اعلانی که سامانه برای کاربران تولید می‌کند" },
      { key: "pages.audit.title", label: "رویدادهای حساس — عنوان", kind: "title", value: "رویدادهای حساس سامانه" },
      { key: "pages.audit.sub", label: "رویدادهای حساس — زیرعنوان", kind: "text", value: "ثبت ورود، خروج و اقدامات مهم برای پیگیری و حسابرسی" },
      { key: "pages.account.title", label: "حساب کاربری — عنوان", kind: "title", value: "حساب کاربری" },
      { key: "pages.manager_sms.title", label: "اطلاع‌رسانی مدیران — عنوان", kind: "title", value: "اطلاع‌رسانی پیامکی مدیران" },
      { key: "pages.manager_sms.sub", label: "اطلاع‌رسانی مدیران — زیرعنوان", kind: "text", value: "هنگام ثبت هر پروندهٔ جدید، برای مدیران فعال پیامک خودکار ارسال می‌شود؛ فهرست مدیران از سامانهٔ کاربران همگام می‌ماند." },
      { key: "pages.api_management.title", label: "مدیریت API — عنوان", kind: "title", value: "مدیریت API و اتصال به سامانه‌های خارجی" },
      { key: "pages.api_management.sub", label: "مدیریت API — زیرعنوان", kind: "text", value: "کلیدهای اختصاصی، اتصال‌ها، وب‌هوک‌ها، مستندات و تاریخچهٔ کامل درخواست‌ها — همهٔ داده‌ها از همان بانک پرونده‌های سامانه خوانده و نوشته می‌شود." },
    ],
  },
];

/** نقشهٔ تختِ پیش‌فرض‌ها برای لودر و اعتبارسنجی کنش‌ها. */
export const DEFAULT_CONTENT: Record<string, string> = Object.fromEntries(
  siteContentGroups.flatMap((group) => group.items.map((item) => [item.key, item.value])),
);

export const CONTENT_KEYS = Object.keys(DEFAULT_CONTENT);

export const isContentKey = (key: string): key is string => Object.hasOwn(DEFAULT_CONTENT, key);

export const contentGroupOf = (key: string) =>
  siteContentGroups.find((group) => group.items.some((item) => item.key === key)) ?? null;

export const contentItemOf = (key: string) => {
  for (const group of siteContentGroups) {
    const item = group.items.find((entry) => entry.key === key);
    if (item) return { group, item };
  }
  return null;
};

export type SiteContent = { text: (key: string) => string };

/** خواندن یک‌بارهٔ همهٔ مقادیر ذخیره‌شده در هر درخواست (memo با cache)؛
 * هر خطای دیتابیس به‌جای از کار افتادن سایت، به پیش‌فرض‌های کد برمی‌گردد. */
export const getContent = cache(async (): Promise<SiteContent> => {
  let overrides = new Map<string, string>();
  try {
    const rows = await db.select({ key: siteContent.key, value: siteContent.value }).from(siteContent);
    overrides = new Map(rows.map((row) => [row.key, row.value]));
  } catch {
    // پیش از اجرای مایگریشن یا در خطای گذرا، پیش‌فرض‌ها سرو می‌شوند
  }
  return {
    text: (key: string) => {
      if (Object.hasOwn(overrides, key)) return overrides.get(key) as string;
      return DEFAULT_CONTENT[key] ?? "";
    },
  };
});

/** جایگزینی جای‌نگه‌دارهای پیام‌های قالبی: {name} و {count}. */
export const fillTemplate = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(name|count)\}/g, (match, token: string) => (token in vars ? vars[token] : match));
