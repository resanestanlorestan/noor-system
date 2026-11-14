"use client";
import { useSyncExternalStore } from "react";
import { MoonStar, Sun } from "lucide-react";
import { applyTheme, currentTheme, subscribeTheme, type Theme } from "@/lib/theme";

/**
 * دکمهٔ تغییر تم — در سربرگ ورود و نوار بالای فضای کاری.
 * برچسب تم فعلی را نشان می‌دهد؛ کلیک بین «روشن» و «شبانه» جابه‌جا می‌شود.
 * وضعیت تم با useSyncExternalStore از data-theme روی <html> خوانده می‌شود تا
 * هم بدون hydration-mismatch باشد و هم بدون setState همگام در اثر (لینت).
 */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "light" as Theme);
  const next: Theme = theme === "dark" ? "light" : "dark";
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => applyTheme(next)}
      title={isDark ? "تغییر به تم روشن" : "تغییر به تم شبانه"}
      aria-label={isDark ? "تغییر به تم روشن" : "تغییر به تم شبانه"}
      aria-pressed={isDark}
    >
      {isDark ? <Sun size={17} /> : <MoonStar size={17} />}
      {!compact && <span>{isDark ? "تم روشن" : "تم شبانه"}</span>}
    </button>
  );
}
