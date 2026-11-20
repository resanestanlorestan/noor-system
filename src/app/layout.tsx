import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import { THEME_BOOTSTRAP, THEME_KEY, themeFromCookie } from "@/lib/theme";
import { DEFAULT_CONTENT, getContent } from "@/lib/site-content";
import { getSiteSettings } from "@/lib/site-settings";
import "./globals.css";
import "./workspace.css";

// الحاقیهٔ ۲.۱۸.۴ — عنوان و توضیحات سایت از CMS؛ در خطای دیتابیس به پیش‌فرض کد برمی‌گردد
export async function generateMetadata(): Promise<Metadata> {
  try {
    const [content, settings] = await Promise.all([getContent(), getSiteSettings()]);
    return {
      title: content.text("site.title") || DEFAULT_CONTENT["site.title"],
      description: content.text("site.description") || DEFAULT_CONTENT["site.description"],
      // الحاقیهٔ ۲.۱۸.۵: آیکن مرورگر هم از لوگوی مدیریتی می‌آید
      icons: settings.logoUrl ? { icon: settings.logoUrl } : undefined,
    };
  } catch {
    return { title: DEFAULT_CONTENT["site.title"], description: DEFAULT_CONTENT["site.description"] };
  }
}

export const viewport: Viewport = {
  themeColor: "#f5f8f5",
};

// تمِ ذخیره‌شدهٔ کاربر از کوکی خوانده می‌شود تا در همان رندر سرور اعمال گردد؛
// به این ترتیب hydration با خروجی سرور مطابقت دارد و تم هیچ‌وقت فلش نمی‌زند.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const savedTheme = themeFromCookie((await cookies()).get(THEME_KEY)?.value);
  return (
    <html lang="fa" dir="rtl" data-theme={savedTheme} suppressHydrationWarning>
      <head>
        {/* پشتیبان: اگر کوکی نبود، تمِ localStorage پیش از رندر اعمال و کوکی همگام می‌شود */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
