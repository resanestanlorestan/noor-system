"use client";
// الحاقیهٔ ۲.۱۰.۳ — نمایش پیام فلش و پاکسازی توکن «?m=» از نوار آدرس
// بلافاصله پس از رندر؛ آدرس تمیز می‌ماند و چون توکن سمت سرور یک‌بار مصرف
// شده، بازخوانی صفحه پیام را دوباره نشان نمی‌دهد. دیگر پارامترهای query
// (مثل فیلترهای فهرست پرونده‌ها) دست‌نخورده می‌مانند.
import { useEffect } from "react";

export function FlashNotice({ message }: { message: string }) {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("m")) return;
    url.searchParams.delete("m");
    const qs = url.searchParams.toString();
    window.history.replaceState(null, "", url.pathname + (qs ? `?${qs}` : "") + url.hash);
  }, []);
  return <div className="ws-notice" role="status">{message}</div>;
}
