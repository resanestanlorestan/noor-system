import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import { THEME_BOOTSTRAP, THEME_KEY, themeFromCookie } from "@/lib/theme";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "نور | سامانه جامع فعالان قرآنی",
  description: "سامانه ثبت و بررسی پرونده فعالان قرآنی",
};

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
