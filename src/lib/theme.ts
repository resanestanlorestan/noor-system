/**
 * سامانه دو تم «نور» — ردوبایگ/theme utilities.
 *
 * تم با data-theme روی <html> کنترل می‌شود:
 *   - "light" → تم روشن «روشن» (پیش‌فرض برند)
 *   - "dark"  → تم شبانه «شبانه»
 * انتخاب کاربر در localStorage و هم‌زمان در کوکی «noor-theme» ذخیره می‌شود تا
 * سرور هم در رندر سمت سرور همان تم را روی <html> بگذارد (بدون فلش و بدون
 * اینکه hydration در React 19 ویژگی اضافه را پاک کند).
 */
export const THEME_KEY = "noor-theme";
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // یک سال
export type Theme = "light" | "dark";

/** Script injected into <head> before hydration (SSR-safe, no flash). */
export const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem("${THEME_KEY}"),m=document.cookie.match(/(?:^|; )${THEME_KEY}=(light|dark)/),c=m&&m[1];if(t&&t!==c)document.cookie="${THEME_KEY}="+t+";path=/;max-age=${THEME_COOKIE_MAX_AGE};SameSite=Lax";var v=t||c;if(v==="dark"||v==="light")document.documentElement.dataset.theme=v;}catch(e){}})();`;

/** Read the saved theme from a Next.js cookie object (server side). */
export function themeFromCookie(cookieValue: string | undefined): Theme {
  return cookieValue === "dark" ? "dark" : "light";
}

export function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

const themeListeners = new Set<() => void>();

/** Subscribe to theme changes (client side) — for useSyncExternalStore. */
export function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
    document.cookie = `${THEME_KEY}=${theme};path=/;max-age=${THEME_COOKIE_MAX_AGE};SameSite=Lax`;
  } catch {}
  themeListeners.forEach((listener) => listener());
}
