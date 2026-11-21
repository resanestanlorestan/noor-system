#!/usr/bin/env node
/**
 * وریفای بصری الحاقیهٔ ۲.۲۰.۰ — رندر واقعی صفحات با مرورگر و ثبت تصویر
 * پیش‌نیاز: سرور روی localhost:3000 بالا باشد و postgres در دسترس باشد.
 * خروجی: download/verify-220/*.png
 */
const { chromium } = require("playwright");
const fs = require("node:fs");

const BASE = process.env.VC_BASE || "http://localhost:3000";
const OUT = "/home/z/my-project/download/verify-220";
const EMAIL = "admin@noor.local";
const PASS = "NoorAdmin2026!x";

async function setTheme(page, theme) {
  await page.evaluate((t) => {
    localStorage.setItem("noor-theme", t);
    document.cookie = `noor-theme=${t}; path=/; max-age=31536000`;
  }, theme);
  await page.reload({ waitUntil: "networkidle" });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const results = [];

  // ---------- صفحهٔ ورود ----------
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/login-light.png`, fullPage: true });
  results.push("login-light");
  await setTheme(page, "dark");
  await page.screenshot({ path: `${OUT}/login-dark.png`, fullPage: true });
  results.push("login-dark");
  await setTheme(page, "light");

  // ---------- ورود واقعی ----------
  await page.fill('input[name="identifier"]', EMAIL);
  await page.fill('input[name="password"]', PASS);
  await page.click('button.auth-submit');
  await page.waitForURL(/dashboard|account/, { timeout: 30000 }).catch(() => {});
  const url = page.url();
  results.push(`landed:${url}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/dashboard-light.png`, fullPage: true });
  results.push("dashboard-light");
  await setTheme(page, "dark");
  await page.screenshot({ path: `${OUT}/dashboard-dark.png`, fullPage: true });
  results.push("dashboard-dark");
  await setTheme(page, "light");

  // ---------- جدول پرونده‌ها ----------
  await page.goto(`${BASE}/cases`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/cases-light.png`, fullPage: false });
  results.push("cases-light");
  await ctx.close();

  // ---------- موبایل ----------
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await mctx.newPage();
  await mp.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mp.fill('input[name="identifier"]', EMAIL);
  await mp.fill('input[name="password"]', PASS);
  await mp.click('button.auth-submit');
  await mp.waitForURL(/dashboard|account/, { timeout: 30000 }).catch(() => {});
  await mp.waitForLoadState("networkidle");
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${OUT}/dashboard-mobile.png`, fullPage: false });
  results.push("dashboard-mobile");
  // باز کردن کشوی منو
  await mp.click(".ws-menu").catch(() => {});
  await mp.waitForTimeout(500);
  await mp.screenshot({ path: `${OUT}/dashboard-mobile-menu.png`, fullPage: false });
  results.push("dashboard-mobile-menu");
  await mctx.close();

  await browser.close();
  for (const r of results) console.log("✓", r);
  console.log("DONE");
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
