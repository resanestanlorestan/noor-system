"use client";

// الحاقیهٔ ۲.۱۹.۳ — اسکرول نرم به اولین بخش هایلایت‌شده پس از هدایت
// «بررسی آمادگی ارسال». با CSS هم‌نام (.section-flagged) کار می‌کند و
// هیچ رفتار تازه‌ای جز نشانه‌گذاری چشم کاربر ندارد.

import { useEffect } from "react";

export function FlagFocus() {
  useEffect(() => {
    const target = document.querySelector(".section-flagged");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);
  return null;
}
