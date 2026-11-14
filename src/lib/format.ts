import { isValidJalaaliDate, toGregorian, toJalaali } from "jalaali-js";

export function normalizeDigits(value: string) {
  return value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}
export function normalizeText(value: string) { return value.trim().replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/\s+/g, " "); }
export function validNationalId(value: string) {
  if (!/^\d{10}$/.test(value) || /^(\d)\1{9}$/.test(value)) return false;
  const remainder = value.slice(0, 9).split("").reduce((sum, digit, i) => sum + Number(digit) * (10 - i), 0) % 11;
  return Number(value[9]) === (remainder < 2 ? remainder : 11 - remainder);
}
export function validPostalCode(value: string) { return /^\d{10}$/.test(value) && !/^0{10}$/.test(value); }
export function validIdCardNumber(value: string) { return /^\d{1,10}$/.test(value); }
export function jalaliToIso(value: string): string | null {
  const match = normalizeDigits(value.trim()).match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  if (year < 1200 || year > 1500 || !isValidJalaaliDate(year, month, day)) return null;
  const { gy, gm, gd } = toGregorian(year, month, day);
  const iso = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
  return iso <= new Date().toISOString().slice(0, 10) ? iso : null;
}
export function isoToJalali(value: string | null | undefined) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const j = toJalaali(year, month, day);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}
export function faNumber(value: number) { return new Intl.NumberFormat("fa-IR").format(value); }
export function faDate(value: Date | string, withTime = false) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { year: "numeric", month: "long", day: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}), timeZone: "Asia/Tehran" }).format(new Date(value));
}
