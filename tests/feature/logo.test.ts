// Feature tests for الحاقیهٔ ۲.۱۸.۵ — مدیریت لوگوی سایت:
// اعتبارسنجی بایت‌محور فرمت (PNG/JPEG/WEBP/SVG)، سقف حجم، رد SVG خطرناک و فایل
// جعل‌شده، آپلود/جایگزینی/حذف با مجوز cms.manage، سرو عمومی از /api/site/logo و
// ساخت URL نسخه‌دار برای باطل‌کردن کش. فیکسچرها به‌صورت برنامه‌ای ساخته می‌شوند.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import zlib from "node:zlib";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { featureSeed, loginAs, closeDb, form, type Fixture } from "./helpers";
import { initialActionState } from "@/lib/action-state";
import { removeLogoAction, uploadLogoAction } from "@/app/actions/cms";
import { sniffLogoImage } from "@/lib/site-settings";
import { getSiteSettings } from "@/lib/site-settings";
import { GET as logoRoute } from "@/app/api/site/logo/route";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
beforeEach(async () => {
  await db.delete(s.siteSettings);
  await db.insert(s.siteSettings).values({ id: 1 }).onConflictDoNothing();
});
afterAll(async () => {
  await db.delete(s.siteSettings);
  await db.insert(s.siteSettings).values({ id: 1 }).onConflictDoNothing();
  closeDb();
});

// PNG واقعی ۴×۴: امضا + IHDR (با CRC صحیح) + IDAT + IEND
function pngFixture(width = 4, height = 4): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);   // بیت‌عمق
  ihdr.writeUInt8(6, 9);   // رنگ RGBA
  const ihdrChunk = Buffer.concat([Buffer.from([0, 0, 0, 13]), Buffer.from("IHDR"), ihdr, Buffer.from([0, 0, 0, 0])]);
  const crc = zlib.crc32(ihdrChunk.subarray(4, 17)) >>> 0;
  ihdrChunk.writeUInt32BE(crc, 17);
  const raw = Buffer.concat(Array.from({ length: height }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4)])));
  const idat = zlib.deflateSync(raw);
  const idatChunk = Buffer.alloc(idat.length + 12);
  idatChunk.writeUInt32BE(idat.length, 0);
  idatChunk.write("IDAT", 4, "latin1");
  idat.copy(idatChunk, 8);
  idatChunk.writeUInt32BE(zlib.crc32(idatChunk.subarray(4, 8 + idat.length)) >>> 0, 8 + idat.length);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ihdrChunk, idatChunk,
    Buffer.from([0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]),
  ]);
}

// JPEG مینیمال با SOF0 خوانا (۴×۴)
function jpegFixture(): Buffer {
  return Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x04, 0x00, 0x04, 0xff, 0xd9]);
}

// WEBP مینیمال با تکهٔ VP8X (ابعاد ۴×۴)
function webpFixture(): Buffer {
  const b = Buffer.alloc(40);
  b.write("RIFF", 0, "latin1");
  b.writeUInt32LE(32, 4);
  b.write("WEBP", 8, "latin1");
  b.write("VP8X", 12, "latin1");
  b.writeUInt32LE(10, 16);
  b.writeUInt8(0x10, 20);
  b.writeUIntLE(3, 24, 3); // عرض − ۱
  b.writeUIntLE(3, 27, 3); // ارتفاع − ۱
  return b;
}

const svgFixture = (body = "") => Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="120" height="40">${body}</svg>`);
const svgFile = (bytes: Buffer, name = "logo.svg") => new File([new Uint8Array(bytes)], name, { type: "image/svg+xml" });
const pngFile = () => new File([new Uint8Array(pngFixture())], "logo.png", { type: "image/png" });

describe("تشخیص فرمت از بایت‌ها", () => {
  it("PNG، JPEG و WEBP سالم با ابعاد واقعی شناسایی می‌شوند", () => {
    expect(sniffLogoImage(pngFixture(300, 90))).toEqual({ mime: "image/png", width: 300, height: 90 });
    expect(sniffLogoImage(jpegFixture())).toEqual({ mime: "image/jpeg", width: 4, height: 4 });
    expect(sniffLogoImage(webpFixture())).toEqual({ mime: "image/webp", width: 4, height: 4 });
  });

  it("SVG سالم پذیرفته و SVG با اسکریپت یا entity رد می‌شود", () => {
    expect(sniffLogoImage(svgFixture())?.mime).toBe("image/svg+xml");
    for (const evil of [
      svgFixture("<script>alert(1)</script>"),
      svgFixture('<a xlink:href="javascript:alert(1)">x</a>'),
      svgFixture('<rect onload="alert(1)" width="1" height="1"/>'),
      svgFixture("<!ENTITY x SYSTEM 'file:///etc/passwd'>"),
    ]) expect(sniffLogoImage(evil)).toBeNull();
  });

  it("فایل جعل‌شده و فرمت ناشناخته رد می‌شوند", () => {
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 7)]);
    expect(sniffLogoImage(fakePng)).toBeNull(); // امضا بدون IHDR معتبر
    expect(sniffLogoImage(Buffer.from("GIF89a" + "0".repeat(40)))).toBeNull();
    expect(sniffLogoImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("آپلود و مدیریت لوگو از داشبورد", () => {
  it("فعال قرآنی اجازهٔ آپلود ندارد", async () => {
    await loginAs("act");
    const denied = await uploadLogoAction(initialActionState, form({ file: pngFile() }));
    expect(denied.error).toBeTruthy();
    expect((await db.select().from(s.siteSettings).limit(1))[0]?.logoData).toBeNull();
  });

  it("آپلود مدیر ارشد ذخیره می‌شود، URL نسخه‌دار می‌سازد و ممیزی ثبت می‌کند", async () => {
    await loginAs("super");
    const state = await uploadLogoAction(initialActionState, form({ file: pngFile() }));
    expect(state.error).toBeUndefined();
    expect(state.success).toBeTruthy();
    const [row] = await db.select().from(s.siteSettings).limit(1);
    expect(row?.logoMime).toBe("image/png");
    expect(row?.logoWidth).toBe(4);
    expect(row?.logoSize).toBeGreaterThan(0);
    const settings = await getSiteSettings();
    expect(settings.logoUrl).toMatch(/^\/api\/site\/logo\?v=\d+$/);
    expect(settings.logoWidth).toBe(4);
    const auditRows = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "cms_logo_update"));
    expect(auditRows.length).toBe(1);
  });

  it("جایگزینی: آپلود دوم روی همان ردیف می‌نویسد", async () => {
    await loginAs("super");
    await uploadLogoAction(initialActionState, form({ file: pngFile() }));
    await uploadLogoAction(initialActionState, form({ file: svgFile(svgFixture(), "mark.svg") }));
    const rows = await db.select().from(s.siteSettings);
    expect(rows.length).toBe(1);
    expect(rows[0].logoMime).toBe("image/svg+xml");
    expect(rows[0].logoName).toBe("mark.svg");
  });

  it("فایل بزرگ‌تر از سقف، جعل‌شده و SVG خطرناک رد می‌شوند", async () => {
    await loginAs("super");
    const big = await uploadLogoAction(initialActionState, form({ file: new File([new Uint8Array(Buffer.alloc(1024 * 1024 + 1))], "big.png", { type: "image/png" }) }));
    expect(big.error).toContain("۱ مگابایت");
    const fake = await uploadLogoAction(initialActionState, form({ file: new File([new Uint8Array(Buffer.alloc(64, 1))], "fake.png", { type: "image/png" }) }));
    expect(fake.error).toBeTruthy();
    const evil = await uploadLogoAction(initialActionState, form({ file: svgFile(svgFixture("<script>alert(1)</script>"), "evil.svg") }));
    expect(evil.error).toBeTruthy();
    expect((await db.select().from(s.siteSettings).limit(1))[0]?.logoData).toBeNull();
  });
});

describe("سرو عمومی و حذف", () => {
  it("مسیر /api/site/logo بایت‌ها را با Content-Type درست می‌سروید و بدون لوگو ۴۰۴ است", async () => {
    const before = await logoRoute(new Request("http://localhost/api/site/logo"));
    expect(before.status).toBe(404);
    await loginAs("super");
    const bytes = pngFixture(300, 90);
    await uploadLogoAction(initialActionState, form({ file: new File([new Uint8Array(bytes)], "logo.png", { type: "image/png" }) }));
    const res = await logoRoute(new Request("http://localhost/api/site/logo"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toContain("public");
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    // سرو SVG باید CSP سخت‌گیرانه داشته باشد
    await uploadLogoAction(initialActionState, form({ file: svgFile(svgFixture()) }));
    const svgRes = await logoRoute(new Request("http://localhost/api/site/logo"));
    expect(svgRes.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
  });

  it("حذف لوگو به پیش‌فرض بازمی‌گرداند و دوباره‌اش هشدار می‌دهد", async () => {
    await loginAs("super");
    await uploadLogoAction(initialActionState, form({ file: pngFile() }));
    const state = await removeLogoAction(initialActionState, form({ remove: "1" }));
    expect(state.error).toBeUndefined();
    const settings = await getSiteSettings();
    expect(settings.logoUrl).toBeNull();
    expect((await logoRoute(new Request("http://localhost/api/site/logo"))).status).toBe(404);
    const auditRows = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "cms_logo_remove"));
    expect(auditRows.length).toBe(1);
    const again = await removeLogoAction(initialActionState, form({ remove: "1" }));
    expect(again.warning).toBe(true);
  });
});
