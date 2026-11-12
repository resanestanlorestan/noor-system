export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function validEmailFormat(value: string) { return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
/** Password policy (مرحله دوم): 8–128 chars with at least one lowercase and
 *  one uppercase English letter and one digit. Applies on set (registration,
 *  change and reset); existing hashes keep working. */
export function validPasswordFormat(value: string) {
  return value.length >= 8 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}
export const PASSWORD_POLICY_HINT = "حداقل ۸ نویسه؛ شامل حروف کوچک و بزرگ انگلیسی و حداقل یک عدد.";
export const PASSWORD_POLICY_ERROR = "گذرواژه باید حداقل ۸ نویسه و شامل حروف کوچک و بزرگ انگلیسی و حداقل یک عدد باشد.";
export function validResetTokenFormat(value: string) { return /^[a-f0-9]{64}$/.test(value); }
/** Expects the output of normalizeIranMobile (messaging): 09xxxxxxxxx. */
export function validIranMobile(value: string) { return /^09\d{9}$/.test(value); }
export const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
