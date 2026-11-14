// Unit tests for the SMS provider layer: provider selection from env
// variables, Iranian mobile-number normalization, and the پیامک‌پنل
// (rest.payamak-panel.com) adapter — including error handling — with a
// mocked global fetch (no database, no real network).
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeIranMobile, sendSmsViaPayamakPanel, smsConfigured, smsProvider, smsProviderLabel } from "@/lib/messaging";

const PAYAMAK_ENV = { PAYAMAK_PANEL_USERNAME: "panel-user", PAYAMAK_PANEL_PASSWORD: "panel-pass", PAYAMAK_PANEL_SENDER: "50004001122334" };

const withEnv = (vars: Record<string, string | undefined>, run: () => void | Promise<void>) => {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  return Promise.resolve(run()).finally(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
};

afterEach(() => vi.unstubAllGlobals());

describe("انتخاب سرویس پیامک", () => {
  it("بدون هیچ متغیری، هیچ سرویسی فعال نیست", async () => {
    await withEnv({ PAYAMAK_PANEL_USERNAME: undefined, PAYAMAK_PANEL_PASSWORD: undefined, KAVENEGAR_API_KEY: undefined }, () => {
      expect(smsProvider()).toBeNull();
      expect(smsProviderLabel()).toBeNull();
      expect(smsConfigured()).toBe(false);
    });
  });

  it("با نام کاربری و گذرواژهٔ پیامک‌پنل، سرویس پیامک‌پنل انتخاب می‌شود", async () => {
    await withEnv(PAYAMAK_ENV, () => {
      expect(smsProvider()).toBe("payamak-panel");
      expect(smsProviderLabel()).toBe("پیامک‌پنل");
      expect(smsConfigured()).toBe(true);
    });
  });

  it("APIKey پنل (به‌جای گذرواژه) هم کافی است — الگوی مستند سامانه", async () => {
    await withEnv({ PAYAMAK_PANEL_USERNAME: "panel-user", PAYAMAK_PANEL_API_KEY: "sample-uuid-key", PAYAMAK_PANEL_PASSWORD: undefined, KAVENEGAR_API_KEY: undefined }, () => {
      expect(smsProvider()).toBe("payamak-panel");
      expect(smsConfigured()).toBe(true);
    });
  });

  it("با KAVENEGAR_API_KEY سرویس کاوه‌نگار انتخاب می‌شود", async () => {
    await withEnv({ PAYAMAK_PANEL_USERNAME: undefined, PAYAMAK_PANEL_PASSWORD: undefined, KAVENEGAR_API_KEY: "k-123" }, () => {
      expect(smsProvider()).toBe("kavenegar");
      expect(smsProviderLabel()).toBe("کاوه‌نگار");
    });
  });

  it("در تنظیم‌بودن هر دو، اولویت با پیامک‌پنل است", async () => {
    await withEnv({ ...PAYAMAK_ENV, KAVENEGAR_API_KEY: "k-123" }, () => {
      expect(smsProvider()).toBe("payamak-panel");
    });
  });

  it("نام کاربری بدون گذرواژه برای پیامک‌پنل کافی نیست", async () => {
    await withEnv({ PAYAMAK_PANEL_USERNAME: "u", PAYAMAK_PANEL_PASSWORD: undefined, KAVENEGAR_API_KEY: undefined }, () => {
      expect(smsProvider()).toBeNull();
    });
  });
});

describe("نرمال‌سازی شمارهٔ همراه", () => {
  it("قالب‌های ۰۹ / ۹۸+ / ۰۰۹۸ را به ۰۹xxxxxxxxx تبدیل می‌کند", () => {
    expect(normalizeIranMobile("+989121234567")).toBe("09121234567");
    expect(normalizeIranMobile("00989121234567")).toBe("09121234567");
    expect(normalizeIranMobile("989121234567")).toBe("09121234567");
    expect(normalizeIranMobile("09121234567")).toBe("09121234567");
  });

  it(" جداکننده‌ها و نویسه‌های اضافی را حذف می‌کند", () => {
    expect(normalizeIranMobile("+98 912 123 4567")).toBe("09121234567");
    expect(normalizeIranMobile("(0912) 123-4567")).toBe("09121234567");
  });
});

describe("آداپتور پیامک‌پنل", () => {
  it("بدنهٔ درست را به SendSMS می‌فرستد و با RetStatus=1 موفق می‌شود", async () => {
    const fetchMock = vi.fn(async (url: unknown, init?: { body?: string }) => {
      expect(String(url)).toBe("https://rest.payamak-panel.com/api/SendSMS/SendSMS");
      expect(init?.body).toEqual(JSON.stringify({
        username: "panel-user", password: "panel-pass",
        to: "09121234567", from: "50004001122334", text: "سلام آزمون", isFlash: false,
      }));
      return new Response(JSON.stringify({ Value: "123456789", RetStatus: 1, StrRetStatus: "Ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await withEnv(PAYAMAK_ENV, async () => {
      await expect(sendSmsViaPayamakPanel("+989121234567", "سلام آزمون")).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });

  it("بدون خط ارسال‌کننده، from خالی ارسال می‌شود", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body || "{}") as { from?: string };
      expect(body.from).toBe("");
      return new Response(JSON.stringify({ Value: "1", RetStatus: 1 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await withEnv({ ...PAYAMAK_ENV, PAYAMAK_PANEL_SENDER: undefined }, async () => {
      await expect(sendSmsViaPayamakPanel("09121234567", "متن")).resolves.toBeUndefined();
    });
  });

  it("با APIKey، مقدار کلید به‌عنوان گذرواژه ارسال می‌شود", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: { body?: string }) => {
      const body = JSON.parse(init?.body || "{}") as { username?: string; password?: string };
      expect(body.username).toBe("panel-user");
      expect(body.password).toBe("the-api-key");
      return new Response(JSON.stringify({ Value: "1", RetStatus: 1 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await withEnv({ PAYAMAK_PANEL_USERNAME: "panel-user", PAYAMAK_PANEL_API_KEY: "the-api-key", PAYAMAK_PANEL_PASSWORD: undefined, PAYAMAK_PANEL_SENDER: undefined }, async () => {
      await expect(sendSmsViaPayamakPanel("09121234567", "متن")).resolves.toBeUndefined();
    });
  });

  it("RetStatus غیر از ۱ خطا می‌دهد و کد و وضعیت را در پیام می‌آورد", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Value: "", RetStatus: 12, StrRetStatus: "InvalidUserNameOrPassword" }), { status: 200 })));
    await withEnv(PAYAMAK_ENV, async () => {
      await expect(sendSmsViaPayamakPanel("09121234567", "متن")).rejects.toThrow(/RetStatus=12/);
    });
  });

  it("پاسخ غیرقابل‌خواندن (HTML/خالی) خطا می‌دهد", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>gateway</html>", { status: 200 })));
    await withEnv(PAYAMAK_ENV, async () => {
      await expect(sendSmsViaPayamakPanel("09121234567", "متن")).rejects.toThrow(/unreadable/);
    });
  });

  it("خطای HTTP (مثلاً ۵۰۳) خطا می‌دهد", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await withEnv(PAYAMAK_ENV, async () => {
      await expect(sendSmsViaPayamakPanel("09121234567", "متن")).rejects.toThrow(/503/);
    });
  });
});
