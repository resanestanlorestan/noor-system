"use client";
// الحاقیهٔ ۲.۱۵.۰ — رابط کاربری «مدیریت API و اتصال به سامانه‌های خارجی»
// هفت تب: نمای کلی، کلیدهای API، اتصال‌ها، وب‌هوک‌ها، مستندات، گزارش درخواست‌ها، تنظیمات.
import { useActionState, useState } from "react";
import { initialActionState } from "@/lib/action-state";
import { createApiKeyAction, revealApiKeyAction, toggleApiKeyAction, deleteApiKeyAction, upsertIntegrationAction, testIntegrationAction, toggleIntegrationAction, deleteIntegrationAction, upsertWebhookAction, testWebhookAction, toggleWebhookAction, deleteWebhookAction, retryApiLogAction, saveApiSettingsAction } from "@/app/actions/api-management";

export type ApiKeyRow = { id: string; name: string; keyPrefix: string; scopes: string[]; rateLimit: number; active: boolean; lastUsedAt: string | null; createdAt: string };
export type IntegrationRow = { id: string; name: string; baseUrl: string; authType: string; authHeaderName: string; active: boolean; lastStatus: string | null; lastLatencyMs: number | null; lastTestedAt: string | null };
export type WebhookRow = { id: string; name: string; eventKey: string; url: string; active: boolean; lastStatusCode: number | null; lastDispatchAt: string | null; integrationName: string | null };
export type LogRow = { id: string; direction: string; method: string; path: string; statusCode: number | null; ok: boolean; durationMs: number; error: string | null; createdAt: string; subject: string };
export type SettingsRow = { incomingEnabled: boolean; defaultRateLimit: number; ipAllowlist: string; updatedAt: string };
export type ApiManagementProps = {
  keys: ApiKeyRow[]; integrations: IntegrationRow[]; webhooks: WebhookRow[]; logs: LogRow[];
  settings: SettingsRow; events: { key: string; label: string }[]; scopes: { key: string; label: string }[];
  stats: { activeKeys: number; integrations: number; webhooks: number; logs24h: number; errors24h: number };
  baseUrl: string;
};

const faTime = (iso: string | null) => iso ? new Date(iso).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) : "—";
const statusDot = (ok: boolean | null) => <span className={`api-dot ${ok === null ? "" : ok ? "api-dot-ok" : "api-dot-fail"}`} />;

const TABS = [
  ["overview", "نمای کلی"], ["keys", "کلیدهای API"], ["integrations", "اتصال به سامانه‌ها"], ["webhooks", "وب‌هوک‌ها"],
  ["docs", "مستندات API"], ["logs", "گزارش درخواست‌ها"], ["settings", "تنظیمات"],
] as const;

export function ApiManagement(props: ApiManagementProps) {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("overview");
  const [keyState, keyAction, keyPending] = useActionState(createApiKeyAction, initialActionState);
  const [revealState, revealAction] = useActionState(revealApiKeyAction, initialActionState);
  const [integrationState, integrationAction, integrationPending] = useActionState(upsertIntegrationAction, initialActionState);
  const [testState, testAction] = useActionState(testIntegrationAction, initialActionState);
  const [webhookState, webhookAction, webhookPending] = useActionState(upsertWebhookAction, initialActionState);
  const [settingsState, settingsAction, settingsPending] = useActionState(saveApiSettingsAction, initialActionState);

  const notice = (state: { error?: string; success?: string }) => state.error ? <p className="api-notice api-notice-fail">{state.error}</p> : state.success ? <p className="api-notice">{state.success}</p> : null;

  return (
    <div className="api-management">
      <nav className="api-tabs">{TABS.map(([key, label]) => <button key={key} type="button" className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>

      {tab === "overview" && (
        <div className="ws-stats api-overview">
          <div className="ws-stat"><b>{props.stats.activeKeys}</b><span>کلید فعال</span></div>
          <div className="ws-stat"><b>{props.stats.integrations}</b><span>اتصال ثبت‌شده</span></div>
          <div className="ws-stat"><b>{props.stats.webhooks}</b><span>وب‌هوک فعال</span></div>
          <div className="ws-stat"><b>{props.stats.logs24h}</b><span>درخواست ۲۴ ساعت اخیر</span></div>
          <div className="ws-stat"><b>{props.stats.errors24h}</b><span>خطای ۲۴ ساعت اخیر</span></div>
          <div className="api-overview-note ws-panel">
            <h3>شروع سریع</h3>
            <p>۱) در تب «کلیدهای API» یک کلید با سطح دسترسی دلخواه بسازید و مقدار آن (فقط یک‌بار نمایش داده می‌شود) را در اختیار توسعه‌دهندهٔ سامانهٔ مقصد بگذارید. ۲) سامانهٔ خارجی با هدر <code dir="ltr">Authorization: Bearer &lt;کلید&gt;</code> به نشانی <code dir="ltr">{props.baseUrl}/api/v1/cases</code> درخواست می‌زند. ۳) برای دریافت خودکار رویدادها، در تب «وب‌هوک‌ها» نشانی مقصد را ثبت کنید. همهٔ درخواست‌ها در تب «گزارش درخواست‌ها» ثبت می‌شود و درخواست‌های ناموفق قابل ارسال مجددند.</p>
          </div>
        </div>
      )}

      {tab === "keys" && (
        <div className="settings-grid api-grid">
          <section className="ws-panel detail-section">
            <div className="detail-section-head"><div><span>ایجاد کلید</span><h2>کلید API جدید</h2><p>سطح دسترسی خواندن/نوشتن و سقف درخواست در دقیقه را تعیین کنید.</p></div></div>
            <form action={keyAction} className="api-form">
              <label>نام کلید یا سامانهٔ مصرف‌کننده<input name="name" required minLength={3} placeholder="مثلاً: سامانهٔ آموزش پرورش" /></label>
              <fieldset className="api-scopes">{props.scopes.map((scope) => (
                <label key={scope.key} className="api-scope"><input type="checkbox" name="scopes" value={scope.key} defaultChecked={scope.key === "cases:read"} />{scope.label}<small dir="ltr">{scope.key}</small></label>
              ))}</fieldset>
              <label>سقف درخواست در دقیقه<input name="rateLimit" type="number" min={5} max={600} defaultValue={60} /></label>
              <button className="primary-button" disabled={keyPending}>{keyPending ? "در حال ساخت…" : "ساخت کلید"}</button>
            </form>
            {notice(keyState)}
            {keyState.secret && (
              <div className="api-secret">
                <strong>مقدار کلید — فقط همین یک‌بار نمایش داده می‌شود؛ اکنون ذخیره کنید:</strong>
                <code dir="ltr">{keyState.secret}</code>
                <small>در دیتابیس فقط هش و نسخهٔ رمزنگاری‌شده نگهداری می‌شود. بعداً با دکمهٔ «نمایش» مدیر ارشد می‌تواند دوباره ببیند.</small>
              </div>
            )}
          </section>
          <section className="ws-panel detail-section">
            <div className="detail-section-head"><div><span>فهرست کلیدها</span><h2>کلیدهای صادرشده</h2><p>{props.keys.length} کلید</p></div></div>
            <div className="api-rows">{props.keys.map((key) => (
              <div key={key.id} className="api-row">
                <div className="api-row-main"><strong>{key.name}</strong><code dir="ltr">{key.keyPrefix}…</code><span>{key.scopes.join("، ")}</span><small>سقف: {key.rateLimit}/دقیقه · آخرین استفاده: {faTime(key.lastUsedAt)}</small></div>
                <div className="api-row-actions">
                  <span className={`api-pill ${key.active ? "api-pill-ok" : ""}`}>{key.active ? "فعال" : "غیرفعال"}</span>
                  <form action={revealAction}><input type="hidden" name="id" value={key.id} /><button className="secondary-button">نمایش</button></form>
                  <form action={toggleApiKeyAction}><input type="hidden" name="id" value={key.id} /><button className="secondary-button">{key.active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></form>
                  <form action={deleteApiKeyAction}><input type="hidden" name="id" value={key.id} /><button className="api-danger">حذف</button></form>
                </div>
              </div>
            ))}{!props.keys.length && <p className="api-empty">هنوز کلیدی ساخته نشده است.</p>}</div>
            {revealState.secret && <div className="api-secret"><strong>{revealState.success}</strong><code dir="ltr">{revealState.secret}</code></div>}
            {notice(revealState)}
          </section>
        </div>
      )}

      {tab === "integrations" && (
        <div className="settings-grid api-grid">
          <section className="ws-panel detail-section">
            <div className="detail-section-head"><div><span>ثبت یا ویرایش</span><h2>اتصال به سامانهٔ خارجی</h2><p>نشانی پایه، نوع احراز و هدرهای سفارشی را ثبت کنید؛ توکن رمزنگاری‌شده ذخیره می‌شود.</p></div></div>
            <form action={integrationAction} className="api-form">
              <label>نام سامانه<input name="name" required minLength={3} /></label>
              <label>نشانی پایه (Endpoint URL)<input name="baseUrl" dir="ltr" required placeholder="https://example.org/api" /></label>
              <label>نوع احراز<select name="authType" defaultValue="none"><option value="none">بدون احراز</option><option value="bearer">Bearer Token</option><option value="header">هدر سفارشی</option></select></label>
              <label>نام هدر احراز (برای حالت هدر سفارشی)<input name="authHeaderName" dir="ltr" defaultValue="X-API-Key" /></label>
              <label>توکن یا رمز (اختیاری؛ رمزنگاری‌شده ذخیره می‌شود)<input name="token" dir="ltr" type="password" /></label>
              <label>هدرهای سفارشی (هر خط: Name: Value)<textarea name="headers" dir="ltr" rows={2} /></label>
              <button className="primary-button" disabled={integrationPending}>{integrationPending ? "در حال ذخیره…" : "ذخیرهٔ اتصال"}</button>
            </form>
            {notice(integrationState)}
            {notice(testState)}
          </section>
          <section className="ws-panel detail-section">
            <div className="detail-section-head"><div><span>فهرست اتصال‌ها</span><h2>سامانه‌های خارجی</h2><p>{props.integrations.length} اتصال</p></div></div>
            <div className="api-rows">{props.integrations.map((item) => (
              <div key={item.id} className="api-row">
                <div className="api-row-main"><strong>{item.name}</strong><code dir="ltr">{item.baseUrl}</code><span>{item.authType === "bearer" ? "Bearer" : item.authType === "header" ? `هدر ${item.authHeaderName}` : "بدون احراز"}</span><small>آخرین تست: {faTime(item.lastTestedAt)}{item.lastLatencyMs !== null ? ` · ${item.lastLatencyMs}ms` : ""}</small></div>
                <div className="api-row-actions">
                  {statusDot(item.lastStatus === null ? null : item.lastStatus === "ok")}
                  <form action={testAction}><input type="hidden" name="id" value={item.id} /><button className="secondary-button">تست اتصال</button></form>
                  <form action={toggleIntegrationAction}><input type="hidden" name="id" value={item.id} /><button className="secondary-button">{item.active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></form>
                  <form action={deleteIntegrationAction}><input type="hidden" name="id" value={item.id} /><button className="api-danger">حذف</button></form>
                </div>
              </div>
            ))}{!props.integrations.length && <p className="api-empty">هنوز اتصالی ثبت نشده است.</p>}</div>
          </section>
        </div>
      )}

      {tab === "webhooks" && (
        <div className="settings-grid api-grid">
          <section className="ws-panel detail-section">
            <div className="detail-section-head"><div><span>ثبت وب‌هوک</span><h2>وب‌هوک جدید</h2><p>روی رویداد انتخابی، بدنهٔ JSON با امضای HMAC-SHA256 به نشانی مقصد POST می‌شود.</p></div></div>
            <form action={webhookAction} className="api-form">
              <label>نام وب‌هوک<input name="name" required minLength={3} /></label>
              <label>رویداد<select name="eventKey" required>{props.events.map((event) => <option key={event.key} value={event.key}>{event.label} ({event.key})</option>)}</select></label>
              <label>نشانی مقصد<input name="url" dir="ltr" required placeholder="https://example.org/hooks/noor" /></label>
              <label>اتصال مرتبط (اختیاری — اگر غیرفعال شود وب‌هوک هم ارسال نمی‌شود)<select name="integrationId" defaultValue=""><option value="">بدون اتصال</option>{props.integrations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label>رمز امضا (اختیاری؛ رمزنگاری‌شده ذخیره می‌شود)<input name="secret" dir="ltr" type="password" /></label>
              <button className="primary-button" disabled={webhookPending}>{webhookPending ? "در حال ذخیره…" : "ذخیرهٔ وب‌هوک"}</button>
            </form>
            {notice(webhookState)}
          </section>
          <section className="ws-panel detail-section">
            <div className="detail-section-head"><div><span>فهرست وب‌هوک‌ها</span><h2>وب‌هوک‌های ثبت‌شده</h2><p>{props.webhooks.length} وب‌هوک</p></div></div>
            <div className="api-rows">{props.webhooks.map((item) => (
              <div key={item.id} className="api-row">
                <div className="api-row-main"><strong>{item.name}</strong><span>{item.eventKey}</span><code dir="ltr">{item.url}</code><small>آخرین ارسال: {faTime(item.lastDispatchAt)} · کد وضعیت: {item.lastStatusCode ?? "—"}</small></div>
                <div className="api-row-actions">
                  <span className={`api-pill ${item.lastStatusCode && item.lastStatusCode < 400 ? "api-pill-ok" : item.lastStatusCode ? "api-pill-fail" : ""}`}>{item.lastStatusCode ?? "—"}</span>
                  <form action={testWebhookAction}><input type="hidden" name="id" value={item.id} /><button className="secondary-button">ارسال آزمایشی</button></form>
                  <form action={toggleWebhookAction}><input type="hidden" name="id" value={item.id} /><button className="secondary-button">{item.active ? "غیرفعال‌سازی" : "فعال‌سازی"}</button></form>
                  <form action={deleteWebhookAction}><input type="hidden" name="id" value={item.id} /><button className="api-danger">حذف</button></form>
                </div>
              </div>
            ))}{!props.webhooks.length && <p className="api-empty">هنوز وب‌هوکی ثبت نشده است.</p>}</div>
          </section>
        </div>
      )}

      {tab === "docs" && <ApiDocs baseUrl={props.baseUrl} events={props.events} scopes={props.scopes} />}

      {tab === "logs" && (
        <section className="ws-panel detail-section">
          <div className="detail-section-head"><div><span>مانیتورینگ</span><h2>گزارش درخواست‌ها</h2><p>۱۰۰ درخواست اخیر ورودی و خروجی با کد وضعیت، تأخیر و خطا؛ درخواست‌های ناموفق خروجی قابل ارسال مجددند.</p></div></div>
          <div className="api-log-table" role="table">
            <div className="api-log-head" role="row"><span>زمان</span><span>جهت</span><span>متد</span><span>مسیر / مقصد</span><span>مقصد</span><span>کد</span><span>تأخیر</span><span>خطا</span><span></span></div>
            {props.logs.map((log) => (
              <div key={log.id} className="api-log-row" role="row">
                <span>{faTime(log.createdAt)}</span>
                <span>{log.direction === "incoming" ? "ورودی" : "خروجی"}</span>
                <span dir="ltr">{log.method}</span>
                <span className="api-log-path" dir="ltr">{log.path}</span>
                <span>{log.subject}</span>
                <span>{statusDot(log.ok)} {log.statusCode ?? "—"}</span>
                <span>{log.durationMs}ms</span>
                <span className="api-log-error">{log.error ?? "—"}</span>
                <span>{!log.ok && log.direction === "outgoing" && <form action={retryApiLogAction}><input type="hidden" name="id" value={log.id} /><button className="secondary-button">ارسال مجدد</button></form>}</span>
              </div>
            ))}
            {!props.logs.length && <p className="api-empty">هنوز درخواستی ثبت نشده است.</p>}
          </div>
        </section>
      )}

      {tab === "settings" && (
        <section className="ws-panel detail-section api-settings-form">
          <div className="detail-section-head"><div><span>تنظیمات سراسری</span><h2>تنظیمات API</h2><p>کلید ورودی، سقف پیش‌فرض نرخ و فهرست مجاز IP؛ تغییرات رویداد ممیزی ثبت می‌کند.</p></div></div>
          <form action={settingsAction} className="api-form">
            <label className="api-scope"><input type="checkbox" name="incomingEnabled" defaultChecked={props.settings.incomingEnabled} />فعال‌بودن API ورودی (دریافت درخواست سامانه‌های خارجی)</label>
            <label>سقف پیش‌فرض درخواست در دقیقه (برای کلید بدون سقف اختصاصی)<input name="defaultRateLimit" type="number" min={5} max={600} defaultValue={props.settings.defaultRateLimit} /></label>
            <label>فهرست مجاز IP (با کاما جدا شود؛ خالی = بدون محدودیت)<input name="ipAllowlist" dir="ltr" defaultValue={props.settings.ipAllowlist} placeholder="5.10.20.30, 91.0.0.0/8" /></label>
            <button className="primary-button" disabled={settingsPending}>{settingsPending ? "در حال ذخیره…" : "ذخیرهٔ تنظیمات"}</button>
          </form>
          <small>آخرین به‌روزرسانی: {faTime(props.settings.updatedAt)} — همهٔ درخواست‌ها روی HTTPS الزامی هستند و کلیدها و توکن‌ها فقط رمزنگاری‌شده ذخیره می‌شوند.</small>
          {notice(settingsState)}
        </section>
      )}
    </div>
  );
}

function ApiDocs({ baseUrl, events, scopes }: { baseUrl: string; events: { key: string; label: string }[]; scopes: { key: string; label: string }[] }) {
  return (
    <div className="api-docs">
      <section className="ws-panel detail-section">
        <div className="detail-section-head"><div><span>برای توسعه‌دهندگان</span><h2>مستندات API سامانه نور</h2><p>پایهٔ نشانی: <code dir="ltr">{baseUrl}/api/v1</code> · قالب همهٔ پاسخ‌ها: JSON با پوشش <code dir="ltr">{'{ ok, data | error }'}</code></p></div></div>
        <h3>احراز هویت</h3>
        <p>همهٔ درخواست‌ها به هدر <code dir="ltr">Authorization: Bearer &lt;کلید&gt;</code> (یا <code dir="ltr">X-API-Key</code>) نیاز دارند. سطح دسترسی هر کلید: {scopes.map((scope) => `${scope.label} (${scope.key})`).join(" و ")}. سقف نرخ: per-minute و پاسخ 429 در تجاوز.</p>
        <h3>نقاط اتصال</h3>
        <div className="api-log-table">
          <div className="api-log-head api-log-row"><span dir="ltr">GET /api/v1/cases?page=1&amp;pageSize=20&amp;status=draft&amp;q=موسوی</span><span>فهرست صفحه‌بندی‌شدهٔ پرونده‌های فعال (cases:read)</span></div>
          <div className="api-log-row"><span dir="ltr">GET /api/v1/cases/&#123;id&#125;</span><span>جزئیات یک پرونده (cases:read)</span></div>
          <div className="api-log-row"><span dir="ltr">POST /api/v1/cases</span><span>ایجاد پروندهٔ تازه با فیلدهای هویتی و تماس (cases:write)</span></div>
          <div className="api-log-row"><span dir="ltr">PUT /api/v1/cases/&#123;id&#125;</span><span>ویرایش فیلدهای تماس و نشانی: phone، alternatePhone، email، city، postalCode، address، job، organization (cases:write)</span></div>
          <div className="api-log-row"><span dir="ltr">DELETE /api/v1/cases/&#123;id&#125;</span><span>حذف نرم پرونده — هم‌ارز حذف از داشبورد (cases:write)</span></div>
        </div>
        <h3>نمونهٔ درخواست و پاسخ</h3>
        <pre dir="ltr">{`POST ${baseUrl}/api/v1/cases
Authorization: Bearer nk_live_xxx
Content-Type: application/json

{ "firstName": "زهرا", "lastName": "موسوی", "fatherName": "علی",
  "nationalId": "0012345678", "phone": "09121234567", "city": "تهران" }

→ 201 { "ok": true, "data": { "caseId": "…", "status": "draft" } }
→ 409 { "ok": false, "error": "کد ملی با یک پروندهٔ فعال تکراری است…" }`}</pre>
        <h3>وب‌هوک‌ها</h3>
        <p>رویدادها: {events.map((event) => `${event.label} (${event.key})`).join("، ")}. بدنهٔ ارسالی <code dir="ltr">{'{ event, sentAt, data }'}</code> است و امضای هدر <code dir="ltr">X-Noor-Signature</code> برابر HMAC-SHA256(body, رمز وب‌هوک) است.</p>
        <h3>نمونهٔ کد اتصال</h3>
        <pre dir="ltr">{`# curl — دریافت فهرست پرونده‌ها
curl -H "Authorization: Bearer nk_live_xxx" \\
  "${baseUrl}/api/v1/cases?pageSize=10"`}</pre>
        <pre dir="ltr">{`// Node.js (fetch) — ایجاد پرونده
const res = await fetch("${baseUrl}/api/v1/cases", {
  method: "POST",
  headers: { Authorization: "Bearer nk_live_xxx", "Content-Type": "application/json" },
  body: JSON.stringify({ firstName: "زهرا", lastName: "موسوی", fatherName: "علی",
    nationalId: "0012345678", phone: "09121234567" }),
});
const { ok, data } = await res.json();`}</pre>
        <pre dir="ltr">{`# Python (requests) + بررسی امضای وب‌هوک
import requests, hmac, hashlib
res = requests.get("${baseUrl}/api/v1/cases", headers={"Authorization": "Bearer nk_live_xxx"})
signature = hmac.new(secret.encode(), body_bytes, hashlib.sha256).hexdigest()`}</pre>
      </section>
    </div>
  );
}
