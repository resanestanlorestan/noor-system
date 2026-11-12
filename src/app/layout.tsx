import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/vazirmatn/400.css";
import "@fontsource/vazirmatn/500.css";
import "@fontsource/vazirmatn/600.css";
import "@fontsource/vazirmatn/700.css";
import "./globals.css";
import "./workspace.css";

export const metadata: Metadata = {
  title: "نور | سامانه جامع فعالان قرآنی",
  description: "سامانه ثبت و بررسی پرونده فعالان قرآنی",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
