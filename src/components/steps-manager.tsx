"use client";
// الحاقیهٔ ۲.۲۵.۰ — مدیریت مراحل ثبت پرونده در داشبورد: افزودن مرحلهٔ سفارشی،
// ویرایش عنوان/توضیح هر مرحله (پایه یا سفارشی)، فعال/غیرفعال‌سازی و حذف مراحل
// سفارشی، تغییر ترتیب با Drag & Drop و دکمه‌های بالا/پایین (مرحلهٔ «بازبینی و
// ارسال» همیشه آخرین می‌ماند — هم در UI و هم در گارد سرور) و انتخاب مرحله برای
// باز کردن فرم‌ساز فیلدهای سفارشی. همهٔ تغییرات با اکشن سرور و ممیزی ثبت می‌شود.
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronUp, GripVertical, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { createCaseStepAction, deleteCaseStepAction, reorderCaseStepsAction, saveCaseStepMetaAction, toggleCaseStepAction } from "@/app/actions/case-steps-admin";
import { initialActionState } from "@/lib/action-state";

export type ManagedCaseStepView = { id: number; code: string; title: string; description: string | null; kind: "system" | "custom"; required: boolean; active: boolean; formStatus: "none" | "draft" | "published" | "disabled"; version: number; answersCount: number };

export function StepsManager({ rows, selectedId }: { rows: ManagedCaseStepView[]; selectedId: number | null }) {
  const router = useRouter();
  // هم‌گام‌سازی با دادهٔ سرور از طریق key در صفحهٔ والد: با هر router.refresh
  // کامپوننت با دادهٔ تازه دوباره ساخته می‌شود (بدون setState در effect).
  const [list, setList] = useState(rows);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [orderPending, setOrderPending] = useState(false);
  const [metaState, metaAction, metaPending] = useActionState(saveCaseStepMetaAction, initialActionState);
  const [addState, addAction, addPending] = useActionState(createCaseStepAction, initialActionState);
  const review = list.find((item) => item.code === "review");
  const ordered = list.filter((item) => item.code !== "review");
  const move = (index: number, delta: number) => {
    setList((current) => {
      const ids = current.filter((item) => item.code !== "review");
      const target = index + delta;
      if (target < 0 || target >= ids.length) return current;
      const next = [...ids];
      [next[index], next[target]] = [next[target], next[index]];
      return [...next, ...(current.filter((item) => item.code === "review"))];
    });
  };
  const dropOn = (index: number) => {
    if (dragIndex === null || dragIndex === index) return setDragIndex(null);
    setList((current) => {
      const ids = [...current.filter((item) => item.code !== "review")];
      const [moved] = ids.splice(dragIndex, 1);
      ids.splice(index, 0, moved);
      return [...ids, ...(current.filter((item) => item.code === "review"))];
    });
    setDragIndex(null);
  };
  const saveOrder = async () => {
    setOrderPending(true);
    try {
      const fd = new FormData();
      const reviewId = review?.id;
      fd.set("order", JSON.stringify([...ordered.map((item) => item.id), ...(reviewId ? [reviewId] : [])]));
      await reorderCaseStepsAction(fd);
      router.refresh();
    } finally {
      setOrderPending(false);
    }
  };
  const statusLabel = (item: ManagedCaseStepView) => item.formStatus === "published" ? `فرم فعال — نسخهٔ ${item.version}` : item.formStatus === "draft" ? "پیش‌نویس فرم" : item.formStatus === "disabled" ? "فرم غیرفعال" : "بدون فرم";
  const kindLabel = (item: ManagedCaseStepView) => item.kind === "system" ? "مرحلهٔ پایهٔ سامانه" : "مرحلهٔ سفارشی";

  return <section className="ws-panel detail-section">
    <div className="detail-section-head"><div><span>مدیریت مراحل ثبت پرونده</span><h2>زنجیرهٔ مراحل</h2><p>افزودن، ویرایش عنوان و توضیح، ترتیب نمایش و فعال/غیرفعال‌سازی هر مرحله از همین‌جا انجام می‌شود؛ تغییرات بدون کدنویسی در فرایند ثبت پرونده اعمال می‌شود. مراحل پایهٔ سامانه برای سلامت دادهٔ پرونده‌ها همیشه فعال می‌مانند و «بازبینی و ارسال» همیشه آخرین مرحله است.</p></div></div>
    <form action={addAction} className="management-form">
      <div className="form-grid">
        <label>افزودن مرحلهٔ سفارشی<input name="title" maxLength={120} required placeholder="مثلاً مصاحبه و ارزیابی" /></label>
        <label>توضیح و راهنمای مرحله<input name="description" maxLength={500} placeholder="اختیاری" /></label>
      </div>
      {addState.error && <div className="form-error" role="alert">{addState.error}</div>}
      {addState.success && <div className="form-success" role="status">{addState.success}</div>}
      <button className="primary-button" disabled={addPending}>{addPending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} افزودن مرحله</button>
    </form>
    <div className="county-list specialties-manage-list">
      {ordered.map((item, index) => <div key={item.id} className={"specialties-manage-row" + (dragIndex === index ? " dragging" : "") + (item.id === selectedId ? " selected" : "")} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(index)}>
        <span className="builder-drag" title="جابه‌جایی با کشیدن"><GripVertical size={15} /></span>
        <div className="specialties-manage-info">
          <strong>{item.title}</strong>
          <small>{kindLabel(item)} · {statusLabel(item)}{item.answersCount ? ` · ${item.answersCount} پاسخ ثبت‌شده` : ""} · {item.active ? "فعال" : "غیرفعال"}</small>
        </div>
        <span className="builder-field-tools">
          <button type="button" title="بالا" onClick={() => move(index, -1)} disabled={index === 0}><ChevronUp size={14} /></button>
          <button type="button" title="پایین" onClick={() => move(index, 1)} disabled={index === ordered.length - 1}><ChevronDown size={14} /></button>
          <button type="button" title="ویرایش عنوان و توضیح" onClick={() => setEditing(editing === item.id ? null : item.id)}><Pencil size={14} /></button>
          {item.kind === "custom" && <form action={deleteCaseStepAction} className="inline-form">
            <input type="hidden" name="caseStepId" value={item.id} />
            <button type="submit" className="row-remove" title="حذف مرحله" onClick={(event) => { if (!window.confirm(`مرحلهٔ «${item.title}» حذف شود؟\n\nحذف تنها زمانی انجام می‌شود که هیچ پاسخی برای این مرحله ثبت نشده باشد؛ در غیر این صورت سامانه حذف را رد می‌کند و تعداد پاسخ‌ها را اعلام می‌کند. مراحل پایهٔ سامانه قابل حذف نیستند. این عمل پس از تأیید برگشت‌ناپذیر است.`)) event.preventDefault(); }}><Trash2 size={14} /></button>
          </form>}
          {item.kind === "custom" && <form action={async (fd: FormData) => { const res = await toggleCaseStepAction(fd); if (res?.success) router.refresh(); }} className="inline-form">
            <input type="hidden" name="caseStepId" value={item.id} />
            <button type="submit" className={item.active ? "row-remove" : "secondary-button"} title={item.active ? "غیرفعال‌سازی مرحله" : "فعال‌سازی مجدد"}>{item.active ? "غیرفعال" : "فعال"}</button>
          </form>}
          <Link className="secondary-button" href={`/steps?st=${item.id}`}>فرم‌ساز</Link>
        </span>
        {editing === item.id && <form action={metaAction} className="specialties-edit-form">
          <input type="hidden" name="caseStepId" value={item.id} />
          <label>عنوان مرحله<input name="title" defaultValue={item.title} maxLength={120} required /></label>
          <label>توضیح<input name="description" defaultValue={item.description || ""} maxLength={500} /></label>
          <button className="primary-button" disabled={metaPending}>{metaPending ? <LoaderCircle className="spin" size={15} /> : "ذخیره"}</button>
          <button type="button" onClick={() => setEditing(null)} title="بستن"><X size={15} /></button>
        </form>}
      </div>)}
      {review && <div key={review.id} className={"specialties-manage-row pinned" + (review.id === selectedId ? " selected" : "")}>
        <span className="builder-drag" title="این مرحله همیشه آخرین است"><GripVertical size={15} /></span>
        <div className="specialties-manage-info">
          <strong>{review.title}</strong>
          <small>مرحلهٔ پایهٔ سامانه · همیشه آخرین مرحله · {statusLabel(review)}</small>
        </div>
        <span className="builder-field-tools">
          <button type="button" title="ویرایش عنوان و توضیح" onClick={() => setEditing(editing === review.id ? null : review.id)}><Pencil size={14} /></button>
          <Link className="secondary-button" href={`/steps?st=${review.id}`}>فرم‌ساز</Link>
        </span>
        {editing === review.id && <form action={metaAction} className="specialties-edit-form">
          <input type="hidden" name="caseStepId" value={review.id} />
          <label>عنوان مرحله<input name="title" defaultValue={review.title} maxLength={120} required /></label>
          <label>توضیح<input name="description" defaultValue={review.description || ""} maxLength={500} /></label>
          <button className="primary-button" disabled={metaPending}>{metaPending ? <LoaderCircle className="spin" size={15} /> : "ذخیره"}</button>
          <button type="button" onClick={() => setEditing(null)} title="بستن"><X size={15} /></button>
        </form>}
      </div>}
    </div>
    <div className="builder-actions">
      <button type="button" className="secondary-button" onClick={() => saveOrder()} disabled={orderPending}>{orderPending ? <LoaderCircle className="spin" size={16} /> : "ذخیرهٔ ترتیب فعلی"}</button>
      <small>ترتیب با کشیدن ردیف‌ها یا دکمه‌های بالا/پایین تغییر می‌کند و با «ذخیرهٔ ترتیب» در فرایند ثبت پرونده اعمال می‌شود.</small>
    </div>
    {metaState.error && <div className="form-error" role="alert">{metaState.error}</div>}
    {metaState.success && <div className="form-success" role="status">{metaState.success}</div>}
  </section>;
}
