"use client";

// الحاقیهٔ ۲.۱۸.۴ — ویرایشگر محتوای سایت: ویرایش گروه‌به‌گروه با ردیابی تغییرات،
// پیش‌نمایش زندهٔ هر گروه قبل از انتشار، تاریخچهٔ نسخه‌ها و بازگردانی — کاملاً فارسی و RTL.
import { useCallback, useMemo, useState, useTransition } from "react";
import { Check, Clock3, Eye, EyeOff, Loader2, PenLine, RotateCcw, Search, Undo2 } from "lucide-react";
import {
  revertContentAction, resetContentKeyAction, saveContentGroupAction,
} from "@/app/actions/cms";
import type { ActionState } from "@/lib/action-state";
import type { ContentGroup, ContentItem } from "@/lib/site-content";

type Revision = { id: number; value: string; changedAt: string };

const KIND_LABEL: Record<ContentItem["kind"], string> = {
  title: "عنوان", subtitle: "زیرعنوان", text: "متن", multiline: "متن بلند", button: "دکمه", message: "پیام نمایشی",
};

const faTime = (iso: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
const preview = (value: string, max = 70) => (value.length > max ? `${value.slice(0, max)}…` : value.replace(/\n/g, " ⏎ "));

export function CmsManager({ groups, values, history }: {
  groups: ContentGroup[];
  values: Record<string, string>;
  history: Record<string, Revision[]>;
}) {
  const [active, setActive] = useState(groups[0]?.page ?? "");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [previewOn, setPreviewOn] = useState(true);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<ActionState>({});
  const [mutState, setMutState] = useState<ActionState>({});
  const [savePending, startSave] = useTransition();
  const [mutPending, startMut] = useTransition();

  // فراخوانی کنش‌ها به‌صورت دستورمند: نتیجه همان‌جا وضعیت UI را هم‌گام می‌کند
  const saveAction = (group: ContentGroup) => (fd: FormData) => {
    startSave(async () => {
      const res = await saveContentGroupAction({}, fd);
      setSaveState(res);
      if (res.savedPage) {
        const saved = groups.find((entry) => entry.page === res.savedPage);
        if (saved) setDrafts((prev) => {
          const next = { ...prev };
          for (const item of saved.items) delete next[item.key];
          return next;
        });
      }
    });
  };
  const revertAction = (fd: FormData) => {
    startMut(async () => {
      const res = await revertContentAction({}, fd);
      setMutState(res);
      if (res.savedKey) setDrafts((prev) => {
        const next = { ...prev };
        delete next[res.savedKey as string];
        return next;
      });
      if (!res.error) setOpenHistory(null);
    });
  };
  const resetAction = (fd: FormData) => {
    startMut(async () => {
      const res = await resetContentKeyAction({}, fd);
      setMutState(res);
      if (res.savedKey) setDrafts((prev) => {
        const next = { ...prev };
        delete next[res.savedKey as string];
        return next;
      });
      if (!res.error) setOpenHistory(null);
    });
  };

  const stored = useCallback((key: string, fallback: string) => (key in values ? values[key] : fallback), [values]);
  const val = (key: string, fallback: string) => (key in drafts ? drafts[key] : stored(key, fallback));
  const isDirty = (item: ContentItem) => item.key in drafts && drafts[item.key] !== stored(item.key, item.value);
  const dirtyCount = (group: ContentGroup) => group.items.filter(isDirty).length;

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return groups;
    return groups.map((group) => ({
      ...group,
      items: group.items.filter((item) => `${item.label} ${item.key} ${stored(item.key, item.value)} ${drafts[item.key] ?? ""}`.includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [groups, query, drafts, stored]);

  const mutNotice = mutState.error
    ? <p className="cms-notice error" role="alert">{mutState.error}</p>
    : mutState.success
      ? <p className={`cms-notice ${mutState.warning ? "warn" : "ok"}`} role="status"><Check size={13} /> {mutState.success}</p>
      : null;

  const notice = (state: typeof saveState) => state.error
    ? <p className="cms-notice error" role="alert">{state.error}</p>
    : state.success
      ? <p className={`cms-notice ${state.warning ? "warn" : "ok"}`} role="status"><Check size={13} /> {state.success}</p>
      : null;

  // تابع رندر (نه کامپوننت) تا درخت DOM پایدار بماند و فوکوسِ ورودی‌ها هنگام تایپ نپرد
  const renderItem = (group: ContentGroup, item: ContentItem) => {
    const value = val(item.key, item.value);
    const overridden = item.key in values;
    const dirty = isDirty(item);
    const revisions = history[item.key] ?? [];
    return <div key={item.key} className={`cms-item ${dirty ? "is-dirty" : ""}`}>
      <div className="cms-item-head">
        <div><strong>{item.label}</strong><code dir="ltr">{item.key}</code></div>
        <div className="cms-item-tools">
          <span className={`cms-chip ${dirty ? "dirty" : overridden ? "custom" : "default"}`}>{dirty ? "ذخیره‌نشده" : overridden ? "ویرایش‌شده" : "پیش‌فرض برنامه"}</span>
          <span className="cms-kind">{KIND_LABEL[item.kind]}</span>
          <button type="button" className="cms-mini" onClick={() => setOpenHistory(openHistory === item.key ? null : item.key)} title="نسخه‌های پیشین این متن">
            <Clock3 size={14} /> نسخه‌ها{revisions.length > 0 && <b>{new Intl.NumberFormat("fa-IR").format(revisions.length)}</b>}
          </button>
          {overridden && <form action={resetAction}>
            <input type="hidden" name="key" value={item.key} />
            <button type="submit" className="cms-mini" disabled={mutPending} title="حذف ویرایش و بازگشت به متن پیش‌فرض برنامه">
              {mutPending ? <Loader2 size={14} className="spin" /> : <Undo2 size={14} />} بازنشانی
            </button>
          </form>}
        </div>
      </div>
      {item.hint && <p className="cms-hint">{item.hint}</p>}
      {item.kind === "multiline" || item.kind === "message"
        ? <textarea className="cms-input" dir="auto" rows={item.kind === "message" ? 2 : 3} maxLength={2000} name={`v:${item.key}`} value={value} onChange={(event) => setDrafts((prev) => ({ ...prev, [item.key]: event.target.value }))} aria-label={item.label} />
        : <input className="cms-input" dir="auto" type="text" maxLength={300} name={`v:${item.key}`} value={value} onChange={(event) => setDrafts((prev) => ({ ...prev, [item.key]: event.target.value }))} aria-label={item.label} />}
      {openHistory === item.key && <div className="cms-history">
        {revisions.length === 0 && <p className="cms-hint">هنوز نسخهٔ پیشینی برای این متن ثبت نشده است؛ پس از اولین ذخیره، مقدار قبلی اینجا نگه داشته می‌شود.</p>}
        {revisions.map((revision) => <div key={revision.id} className="cms-rev-row">
          <div><span className="cms-rev-value">{preview(revision.value, 90) || "(خالی)"}</span><small>{faTime(revision.changedAt)}</small></div>
          <form action={revertAction}>
            <input type="hidden" name="key" value={item.key} />
            <input type="hidden" name="revisionId" value={revision.id} />
            <button type="submit" className="cms-mini accent" disabled={mutPending}><RotateCcw size={14} /> بازگردانی این نسخه</button>
          </form>
        </div>)}
      </div>}
    </div>;
  };

  const BrowserPreview = ({ group }: { group: ContentGroup }) => {
    const title = val("site.title", "");
    const titleItem = group.items.find((item) => item.key.endsWith(".title"));
    const subItem = group.items.find((item) => item.key.endsWith(".sub"));
    return <div className="cms-preview" dir="rtl">
      <div className="cms-browser"><div className="cms-browser-bar"><i /><i /><i /><span dir="ltr">pouyafarhadi.ir</span></div>
        <div className="cms-browser-tab">{preview(title, 40)}</div>
        <div className="cms-browser-body">
          {group.page === "shell" && <><div className="cms-mock-brand"><b>{val("shell.brand.title", "")}</b><small>{val("shell.brand.subtitle", "")}</small></div><div className="cms-mock-topbar"><strong>{val("shell.topbar.title", "")}</strong><em>{val("shell.search.placeholder", "")}</em></div></>}
          {group.page === "site" && <div className="cms-mock-doc"><h3>{title}</h3><p>{val("site.description", "")}</p><small>این عنوان و توضیح، در تب مرورگر و اشتراک‌گذاری لینک‌ها همین‌طور دیده می‌شود.</small></div>}
          {group.page === "pages" && titleItem && <div className="cms-mock-pagehead"><h3>{val(titleItem.key, titleItem.value)}</h3>{subItem && <p>{val(subItem.key, subItem.value)}</p>}<small>نمونهٔ سرصفحه برای یکی از صفحات این گروه.</small></div>}
        </div>
      </div>
    </div>;
  };

  const AuthPreview = () => <div className="cms-preview" dir="rtl">
    <div className="cms-mock-auth">
      <div className="cms-mock-story"><span className="cms-mock-badge">{val("auth.story.badge", "")}</span><h4>{val("auth.story.heading1", "")}<br /><em>{val("auth.story.heading2", "")}</em></h4><p>{val("auth.story.body", "")}</p><div className="cms-mock-features"><span>{val("auth.feature1.title", "")}</span><span>{val("auth.feature2.title", "")}</span><span>{val("auth.feature3.title", "")}</span></div></div>
      <div className="cms-mock-card"><div className="cms-mock-eyebrow">{val("auth.login.eyebrow", "")}</div><h5>{val("auth.login.title", "")}</h5><p>{val("auth.login.body", "")}</p><div className="cms-mock-button">{val("auth.login.forgot_cta", "")}</div></div>
    </div>
    <small className="cms-preview-note">پیش‌نمایش از مقادیر همین فرم — تا «ذخیره» نزنید، در سایت اعمال نمی‌شود.</small>
  </div>;

  const HeroPreview = () => {
    const title = val("dash.hero.title_template", "").replace("{name}", "مدیر نمونه");
    return <div className="cms-preview" dir="rtl">
      <div className="cms-mock-hero">
        <span className="cms-mock-badge">{val("dash.hero.badge", "")}</span>
        <h4>{title}</h4>
        {val("dash.hero.body", "").split("\n").map((line, index) => <p key={index}>{line}</p>)}
        <div className="cms-mock-button">{val("dash.hero.cta", "")}</div>
        <small>{val("dash.hero.caption", "")}</small>
        <div className="cms-mock-panels"><span>{val("dash.trend.title", "")}</span><span>{val("dash.recent.title", "")}</span><span>{val("dash.status.title", "")}</span></div>
      </div>
      <small className="cms-preview-note">پیام قالبی با مقدار نمونه رندر شده است؛ جای‌نگه‌دارهای {"{{name}}"} و {"{{count}}"} در سایت واقعی مقدار واقعی می‌گیرند.</small>
    </div>;
  };

  return <div className="cms-layout">
    <aside className="cms-side">
      <div className="cms-search"><Search size={15} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجو در متن‌ها و برچسب‌ها..." aria-label="جست‌وجو در محتواها" /></div>
      <nav aria-label="گروه‌های محتوا">
        {filtered.map((group) => <button key={group.page} type="button" className={`cms-side-item ${active === group.page ? "active" : ""}`} onClick={() => setActive(group.page)}>
          <strong>{group.pageLabel}</strong>
          <small>{new Intl.NumberFormat("fa-IR").format(group.items.length)} متن</small>
          {dirtyCount(group) > 0 && <b className="cms-dirty-badge">{new Intl.NumberFormat("fa-IR").format(dirtyCount(group))}</b>}
        </button>)}
        {filtered.length === 0 && <p className="cms-hint">چیزی هم‌خوان با جست‌وجوی شما پیدا نشد.</p>}
      </nav>
      <div className="cms-side-note"><PenLine size={15} /><p>تغییرها فقط پس از «ذخیره و انتشار» در سایت اعمال می‌شوند؛ برای هر متن می‌توانید از «نسخه‌ها» به مقدار قبلی برگردید.</p></div>
    </aside>
    <section className="cms-editor">
      {groups.filter((group) => group.page === active).map((group) => {
        const dirty = dirtyCount(group);
        return <div key={group.page} className="cms-group">
          <div className="cms-group-head">
            <div><h2>{group.pageLabel}</h2>{group.pageHint && <p>{group.pageHint}</p>}</div>
            <button type="button" className={`cms-mini ${previewOn ? "accent" : ""}`} onClick={() => setPreviewOn((prev) => !prev)}>
              {previewOn ? <EyeOff size={14} /> : <Eye size={14} />} {previewOn ? "بستن پیش‌نمایش" : "پیش‌نمایش زنده"}
            </button>
          </div>
          {previewOn && group.preview === "browser" && <BrowserPreview group={group} />}
          {previewOn && group.preview === "authcard" && <AuthPreview />}
          {previewOn && group.preview === "herocard" && <HeroPreview />}
          {notice(saveState)}{mutNotice}
          <form action={saveAction(group)}>
            <input type="hidden" name="page" value={group.page} />
            <div className="cms-items">
              {group.items.map((item) => renderItem(group, item))}
            </div>
            <div className="cms-savebar">
              <span>{dirty > 0 ? `${new Intl.NumberFormat("fa-IR").format(dirty)} فیلد ذخیره‌نشده در این گروه` : "همهٔ فیلدهای این گروه با نسخهٔ منتشرشده یکسان است"}</span>
              <button type="submit" className="primary-button" disabled={savePending || dirty === 0}>
                {savePending ? <Loader2 size={16} className="spin" /> : <Check size={16} />} ذخیره و انتشار این گروه
              </button>
            </div>
          </form>
        </div>;
      })}
    </section>
  </div>;
}
