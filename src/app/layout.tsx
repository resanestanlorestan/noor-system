import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "سامانه نور", template: "%s | سامانه نور" },
  description: "سامانه مدیریت فعالان قرآنی",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
