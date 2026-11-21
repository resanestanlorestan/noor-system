// Feature tests for الحاقیهٔ ۲.۱۸.۴ — مدیریت محتوای سایت (CMS):
// ذخیرهٔ گروهی متن‌ها با ثبت نسخهٔ پیشین، بازگردانی نسخه، بازنشانی به پیش‌فرض
// برنامه، گارد مجوز cms.manage و ثبت ممیزی. فقط مدیر ارشد به‌صورت پیش‌فرض
// دسترسی دارد (کاتالوگ مجوزها) و سایر نقش‌ها باید رد شوند.
import { beforeAll, beforeEach, afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import "./env";
import { db } from "@/db";
import * as s from "@/db/schema";
import { featureSeed, loginAs, closeDb, form, type Fixture } from "./helpers";
import { initialActionState } from "@/lib/action-state";
import { revertContentAction, resetContentKeyAction, saveContentGroupAction } from "@/app/actions/cms";
import { CONTENT_KEYS, DEFAULT_CONTENT, siteContentGroups } from "@/lib/site-content";

let f: Fixture;

beforeAll(async () => { f = await featureSeed(); }, 30_000);
// DB ویژگی بین اجراها پایدار است؛ هر آزمون از حالت بدون ویرایش (فقط پیش‌فرض‌ها) شروع می‌کند
beforeEach(async () => { await db.delete(s.siteContent); });
afterAll(async () => {
  await db.delete(s.siteContent);
  closeDb();
});

const revisionsOf = (key: string) =>
  db.select().from(s.siteContentRevisions).where(eq(s.siteContentRevisions.key, key));

describe("رجیستری محتوا", () => {
  it("کلیدها یکتا هستند و همه در نقشهٔ پیش‌فرض‌اند", () => {
    const keys = siteContentGroups.flatMap((group) => group.items.map((item) => item.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(DEFAULT_CONTENT[key]).toBeDefined();
    expect(CONTENT_KEYS.length).toBe(keys.length);
  });

  it("هر گروه شناسهٔ یکتا و پیش‌نمایش مشخص دارد", () => {
    const pages = siteContentGroups.map((group) => group.page);
    expect(new Set(pages).size).toBe(pages.length);
    for (const group of siteContentGroups) {
      expect(["browser", "authcard", "herocard", "none"]).toContain(group.preview);
      expect(group.items.length).toBeGreaterThan(0);
    }
  });
});

describe("ذخیرهٔ گروهی متن‌ها", () => {
  it("فقط مدیر ارشد اجازهٔ ذخیره دارد؛ فعال قرآنی رد می‌شود", async () => {
    await loginAs("act");
    const denied = await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "متن غیرمجاز" }));
    expect(denied.error).toBeTruthy();
    expect((await db.select().from(s.siteContent).where(eq(s.siteContent.key, "site.title"))).length).toBe(0);
  });

  it("نخستین ذخیره ردیف می‌سازد و ذخیرهٔ بعدی، مقدار قبلی را به تاریخچه می‌فرستد", async () => {
    await loginAs("super");
    const first = await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "پرتال قرآنی نور" }));
    expect(first.error).toBeUndefined();
    let [row] = await db.select().from(s.siteContent).where(eq(s.siteContent.key, "site.title"));
    expect(row?.value).toBe("پرتال قرآنی نور");
    expect(row?.page).toBe("site");
    // نخستین ذخیره: مقدار قبلی‌ای وجود نداشت → نسخه‌ای ثبت نمی‌شود
    expect((await revisionsOf("site.title")).length).toBe(0);
    const second = await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "پرتال قرآنی نور — دو" }));
    expect(second.error).toBeUndefined();
    [row] = await db.select().from(s.siteContent).where(eq(s.siteContent.key, "site.title"));
    expect(row?.value).toBe("پرتال قرآنی نور — دو");
    const revisions = await revisionsOf("site.title");
    expect(revisions.length).toBe(1);
    expect(revisions[0].value).toBe("پرتال قرآنی نور");
    const auditRows = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "cms_content_update"));
    expect(auditRows.some((entry) => entry.targetId === "site.title")).toBe(true);
  });

  it("گروه پیام‌های قالبی را هم ذخیره می‌کند و متن خالی مجاز است", async () => {
    await loginAs("super");
    const state = await saveContentGroupAction(initialActionState, form({
      page: "dashboard",
      "v:dash.hero.title_template": "سلام {name}! خوش آمدی",
      "v:dash.recent.empty": "",
    }));
    expect(state.error).toBeUndefined();
    const [template] = await db.select().from(s.siteContent).where(eq(s.siteContent.key, "dash.hero.title_template"));
    expect(template?.value).toContain("{name}");
    const [empty] = await db.select().from(s.siteContent).where(eq(s.siteContent.key, "dash.recent.empty"));
    expect(empty?.value).toBe("");
  });

  it("ذخیرهٔ بدون تغییر پیام هشدار می‌دهد و نسخهٔ تازه نمی‌سازد", async () => {
    await loginAs("super");
    const initial = await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "پرتال قرآنی نور" }));
    expect(initial.error).toBeUndefined();
    const before = await revisionsOf("site.title");
    const state = await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "پرتال قرآنی نور" }));
    expect(state.warning).toBe(true);
    expect(state.success).toBeTruthy();
    expect((await revisionsOf("site.title")).length).toBe(before.length);
  });
});

describe("بازگردانی و بازنشانی", () => {
  it("بازگردانی نسخه، مقدار قبلی را برمی‌گرداند و مقدار جاری به تاریخچه می‌رود", async () => {
    await loginAs("super");
    await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "نسخهٔ یک" }));
    await saveContentGroupAction(initialActionState, form({ page: "site", "v:site.title": "نسخهٔ دو" }));
    const revisions = await revisionsOf("site.title");
    const original = revisions.find((entry) => entry.value === "نسخهٔ یک")!;
    const state = await revertContentAction(initialActionState, form({ key: "site.title", revisionId: String(original.id) }));
    expect(state.error).toBeUndefined();
    const [row] = await db.select().from(s.siteContent).where(eq(s.siteContent.key, "site.title"));
    expect(row?.value).toBe("نسخهٔ یک");
    const after = await revisionsOf("site.title");
    expect(after.some((entry) => entry.value === "نسخهٔ دو")).toBe(true);
    const auditRows = await db.select().from(s.auditLogs).where(eq(s.auditLogs.action, "cms_content_revert"));
    expect(auditRows.length).toBeGreaterThan(0);
  });

  it("درخواست بازگردانی با کلید نامعتبر رد می‌شود", async () => {
    await loginAs("super");
    const state = await revertContentAction(initialActionState, form({ key: "bogus.key", revisionId: "1" }));
    expect(state.error).toBeTruthy();
  });

  it("بازنشانی به پیش‌فرض، ردیف و تاریخچه را حذف می‌کند و دوباره‌اش هشدار می‌دهد", async () => {
    await loginAs("super");
    await saveContentGroupAction(initialActionState, form({ page: "dashboard", "v:dash.hero.title_template": "سلام {name}! خوش آمدی" }));
    const state = await resetContentKeyAction(initialActionState, form({ key: "dash.hero.title_template" }));
    expect(state.error).toBeUndefined();
    expect((await db.select().from(s.siteContent).where(eq(s.siteContent.key, "dash.hero.title_template"))).length).toBe(0);
    expect((await revisionsOf("dash.hero.title_template")).length).toBe(0); // حذف cascade
    const again = await resetContentKeyAction(initialActionState, form({ key: "dash.hero.title_template" }));
    expect(again.warning).toBe(true);
  });
});
