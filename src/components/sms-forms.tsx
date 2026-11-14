"use client";
// الحاقیهٔ ۲.۱۰.۵ — فرم‌های کلاینت پنل مدیریت پیامک‌ها: ویرایش قالب با پیش‌نمایش
// زندهٔ متغیرها، تنظیمات پنل پیامکی (کلید API هرگز به کلاینت برنمی‌گردد) و
// فرم تست ارسال با نمایش نتیجهٔ واقعی.
import { useActionState, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { saveSmsSettingsAction, saveSmsTemplateAction, sendTestSmsAction } from "@/app/actions/sms";
import { initialActionState } from "@/lib/action-state";
import { renderSmsBody, type SmsTemplateDef } from "@/lib/sms-templates";

export function SmsTemplateEditor({ def, body }: { def: SmsTemplateDef; body: string }) {
  const [state, action, pending] = useActionState(saveSmsTemplateAction, initialActionState);
  const [text, setText] = useState(body);
  const preview = renderSmsBody(text, Object.fromEntries(def.variables.map((item) => [item.token, item.sample])));
  return <details className="sms-editor"><summary>ویرایش متن قالب</summary>
    <form action={action} className="side-form sms-editor-form">
      <input type="hidden" name="templateKey" value={def.key} />
      <label className="full-field">متن پیامک ({def.label})<textarea name="body" value={text} onChange={(event) => setText(event.target.value)} maxLength={900} rows={4} aria-label={`متن قالب ${def.label}`} /></label>
      <div className="sms-vars">
        <small>متغیرهای مجاز:</small>
        {def.variables.map((item) => <code key={item.token}>{`{{${item.token}}}`} — {item.label}</code>)}
      </div>
      <div className="sms-preview"><small>پیش‌نمایش با مقادیر نمونه:</small><p dir="rtl">{preview}</p></div>
      {state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.success && <p className="form-success" role="status">{state.success}</p>}
      <button disabled={pending} className="secondary-button">{pending ? <LoaderCircle className="spin" size={15} /> : null} ذخیرهٔ متن قالب</button>
    </form>
  </details>;
}

export function SmsSettingsForm({ provider, username, sender, enabled, hasSecret }: { provider: string; username: string; sender: string; enabled: boolean; hasSecret: boolean }) {
  const [state, action, pending] = useActionState(saveSmsSettingsAction, initialActionState);
  return <form action={action} className="side-form sms-settings-form">
    <label className="full-field">سرویس‌دهنده<select name="provider" defaultValue={provider} aria-label="سرویس‌دهنده پیامکی">
      <option value="">بدون سرویس‌دهنده (حالت محلی)</option>
      <option value="payamak-panel">پیامک‌پنل (rest.payamak-panel.com)</option>
      <option value="kavenegar">کاوه‌نگار (api.kavenegar.com)</option>
    </select></label>
    <label className="full-field">نام کاربری پنل (پیامک‌پنل)<input name="username" defaultValue={username} maxLength={120} dir="ltr" placeholder="USERNAME" aria-label="نام کاربری پنل پیامکی" /></label>
    <label className="full-field">{hasSecret ? "کلید API (ذخیره‌شده — برای تغییر مقدار جدید بنویسید)" : "کلید API"}<input name="secret" type="password" maxLength={200} dir="ltr" placeholder={hasSecret ? "•••••••••• (بدون تغییر رها کنید)" : "APIKey / API KEY"} autoComplete="new-password" aria-label="کلید API سرویس‌دهنده" /></label>
    <label className="full-field">شماره خط فرستنده<input name="sender" defaultValue={sender} maxLength={31} dir="ltr" placeholder="5000..." aria-label="شماره خط فرستنده" /></label>
    <label className="sms-switch"><input type="checkbox" name="enabled" value="1" defaultChecked={enabled} /> ارسال واقعی پیامک فعال باشد (اولویت با این تنظیمات است؛ در غیر این‌صورت متغیرهای محیطی .env)</label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
    <button disabled={pending} className="primary-button">{pending ? <LoaderCircle className="spin" size={15} /> : null} ذخیرهٔ تنظیمات</button>
    <p className="table-footnote">کلید API با APP_ENCRYPTION_KEY رمزنگاری و فقط در دیتابیس ذخیره می‌شود و در هیچ صفحه‌ای نمایش داده نمی‌شود.</p>
  </form>;
}

export function SmsTestForm({ templates }: { templates: { key: string; label: string }[] }) {
  const [state, action, pending] = useActionState(sendTestSmsAction, initialActionState);
  return <form action={action} className="side-form sms-test-form">
    <label className="full-field">شماره گیرندهٔ آزمایشی<input name="phone" inputMode="tel" maxLength={15} dir="ltr" placeholder="0912..." defaultValue={state.mobile || ""} aria-label="شماره موبایل گیرندهٔ آزمایشی" /></label>
    <label className="full-field">قالب (اختیاری)<select name="templateKey" defaultValue="" aria-label="انتخاب قالب برای تست">
      <option value="">— متن دلخواه —</option>
      {templates.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
    </select></label>
    <label className="full-field">متن دلخواه (اگر قالبی انتخاب نشود)<textarea name="customBody" maxLength={600} rows={3} placeholder="مثلاً: سامانه نور در دسترس است." aria-label="متن دلخواه پیامک آزمایشی" /></label>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.success && <p className="form-success" role="status">{state.success}</p>}
    <button disabled={pending} className="secondary-button">{pending ? <LoaderCircle className="spin" size={15} /> : null} ارسال پیامک آزمایشی</button>
  </form>;
}
