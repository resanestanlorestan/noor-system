import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { privateDir } from "@/lib/local-secrets";

// الحاقیهٔ ۲.۱۲.۰ — بارگذاری مرحله‌ای مدارک برای فرم ثبت‌نام یک‌مرحله‌ای.
// فایل بی‌درنگ با کنترل نوع واقعی محتوا (امضای بایت‌ها)، سقف حجم و محدودیت
// تعداد روی دیسک ذخیره می‌شود و فقط «شناسهٔ فایل» به کلاینت برمی‌گردد. اتصال
// فایل به پرونده فقط در اکشن «ثبت نهایی» انجام می‌شود؛ فایل‌های بی‌صاحب با
// ثبت‌نام ناتمام بی‌اثر می‌مانند (هرگز به هیچ پرونده‌ای متصل نمی‌شوند).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SECTION_PATTERN = /^(photo|evidence|university|seminary|memorization|specialty:[a-z_]+|work:\d{1,2}|course:\d{1,2}|education:\d{1,2})$/; // الحاقیهٔ ۲.۱۴.۰ — بخش education برای مدرک ردیف‌های تحصیلی ویزارد
const MAX_EVIDENCE_SIZE = 5 * 1024 * 1024;
const MAX_PHOTO_SIZE = 500 * 1024;

// محدودیت نرخ ساده درون‌حافظه‌ای: هر IP حداکثر ۲۴ بارگذاری در پنجرهٔ ۱۰ دقیقه‌ای
const rateBuckets = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 24;
const RATE_WINDOW_MS = 10 * 60 * 1000;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  if (rateBuckets.size > 5000) rateBuckets.clear();
  return bucket.count > RATE_LIMIT;
}

function sniffMime(bytes: Buffer): "application/pdf" | "image/png" | "image/jpeg" | null {
  if (bytes.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) return Response.json({ error: "تعداد بارگذاری‌ها بیش از حد مجاز است؛ کمی بعد دوباره تلاش کنید." }, { status: 429 });
  let form: FormData;
  try { form = await request.formData(); } catch { return Response.json({ error: "درخواست بارگذاری معتبر نیست." }, { status: 400 }); }
  const file = form.get("file");
  const section = String(form.get("section") || "");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "فایل را انتخاب کنید." }, { status: 400 });
  if (!SECTION_PATTERN.test(section)) return Response.json({ error: "بخش مدرک معتبر نیست." }, { status: 400 });
  const isPhoto = section === "photo";
  const maxSize = isPhoto ? MAX_PHOTO_SIZE : MAX_EVIDENCE_SIZE;
  if (file.size > maxSize) return Response.json({ error: isPhoto ? "حجم تصویر پرسنلی نباید بیش از ۵۰۰ کیلوبایت باشد." : "حجم فایل نباید بیش از ۵ مگابایت باشد." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) return Response.json({ error: "فقط فایل PDF، PNG یا JPEG معتبر مجاز است." }, { status: 400 });
  if (isPhoto && mime === "application/pdf") return Response.json({ error: "تصویر پرسنلی باید PNG یا JPEG باشد." }, { status: 400 });
  const key = randomUUID();
  const directory = path.join(privateDir, "uploads");
  const target = path.join(directory, key);
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  } catch {
    return Response.json({ error: "ذخیرهٔ فایل انجام نشد؛ دوباره تلاش کنید." }, { status: 500 });
  }
  return Response.json({
    ok: true,
    key,
    name: path.basename(file.name).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 180) || "document",
    mime,
    size: file.size,
    section,
  });
}
