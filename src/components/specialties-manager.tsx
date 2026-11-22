"use client";
// الحاقیهٔ ۲.۲۳.۰ — مدیریت تخصص‌های قرآنی در داشبورد: افزودن، ویرایش نام و
// توضیح، فعال/غیرفعال، تغییر ترتیب با Drag & Drop (و دکمه‌ها در موبایل) و
// انتخاب تخصص برای باز کردن فرم‌ساز. همهٔ تغییرات با اکشن سرور و ممیزی ثبت می‌شوند.
import Link from "next/link";
import { useActionState, useState } from "react";
import { ChevronDown, ChevronUp, GripVertical, LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { createSpecialtyAction, deleteSpecialtyAction, reorderSpecialtiesAction, saveSpecialtyMetaAction, toggleSpecialtyAction } from "@/app/actions/forms";
import { initialActionState } from "@/lib/action-state";

export type ManagedSpecialty = { id: number; title: string; description: string | null; active: boolean; formStatus: "none" | "draft" | "published" | "disabled"; version: number };

export function SpecialtiesManager({ rows, selectedId }: { rows: ManagedSpecialty[]; selectedId: number | null }) {
  const [list, setList] = useState(rows);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [orderPending, setOrderPending] = useState(false);
  const [metaState, metaAction, metaPending] = useActionState(saveSpecialtyMetaAction, initialActionState);
  const [addState, addAction, addPending] = useActionState(createSpecialtyAction, initialActionState);
  const move = (index: number, delta: number) => {
    setList((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const dropOn = (index: number) => {
    if (dragIndex === null || dragIndex === index) return setDragIndex(null);
    setList((current) => { const next = [...current]; const [moved] = next.splice(dragIndex, 1); next.splice(index, 0, moved); return next; });
    setDragIndex(null);
  };
  const saveOrder = async (ordered: ManagedSpecialty[]) => {
    setOrderPending(true);
    try {
      const fd = new FormData();
      fd.set("order", JSON.stringify(ordered.map((item) => item.id)));
      await reorderSpecialtiesAction(fd);
    } finally {
      setOrderPending(false);
    }
  };
  const statusLabel = (item: ManagedSpecialty) => item.formStatus === "published" ? `فرم فعال — نسخهٔ ${item.version}` : item.formStatus === "draft" ? "پیش‌نویس فرم" : item.formStatus === "disabled" ? "فرم غیرفعال" : "بدون فرم";

  return <section className="ws-panel detail-section">
    <div className="detail-section-head"><div><span>مدیریت تخصص‌های قرآنی</span><h2>فهرست تخصص‌ها</h2><p>افزودن، ویرایش نام و توضیح، فعال/غیرفعال، ترتیب نمایش و حذف هر تخصص — قدیمی یا جدید — از همین‌جا انجام می‌شود؛ انتخاب یک تخصص، فرم‌ساز آن را باز می‌کند. حذف تنها زمانی انجام می‌شود که تخصص در هیچ پرونده، حساب، ارجاع، دوره یا فرم پویایی استفاده نشده باشد؛ در غیر این صورت آن را «غیرفعال» کنید تا سوابق دست‌نخورده بماند.</p></div></div>
    <form action={addAction} className="management-form">
      <div className="form-grid">
        <label>افزودن تخصص جدید<input name="title" maxLength={100} required placeholder="مثلاً حفظ قرآن" /></label>
        <label>توضیح و راهنمای تخصص<input name="description" maxLength={500} placeholder="اختیاری" /></label>
      </div>
      {addState.error && <div className="form-error" role="alert">{addState.error}</div>}
      {addState.success && <div className="form-success" role="status">{addState.success}</div>}
      <button className="primary-button" disabled={addPending}>{addPending ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />} افزودن تخصص</button>
    </form>
    <div className="county-list specialties-manage-list">
      {list.map((item, index) => <div key={item.id} className={"specialties-manage-row" + (dragIndex === index ? " dragging" : "") + (item.id === selectedId ? " selected" : "")} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { dropOn(index); }}>
        <span className="builder-drag" title="جابه‌جایی با کشیدن"><GripVertical size={15} /></span>
        <div className="specialties-manage-info">
          <strong>{item.title}</strong>
          <small>{item.description || "—"} · {statusLabel(item)} · {item.active ? "فعال" : "غیرفعال"}</small>
        </div>
        <span className="builder-field-tools">
          <button type="button" title="بالا" onClick={() => move(index, -1)} disabled={index === 0}><ChevronUp size={14} /></button>
          <button type="button" title="پایین" onClick={() => move(index, 1)} disabled={index === list.length - 1}><ChevronDown size={14} /></button>
          <button type="button" title="ویرایش نام و توضیح" onClick={() => setEditing(editing === item.id ? null : item.id)}><Pencil size={14} /></button>
          <form action={deleteSpecialtyAction} className="inline-form">
            <input type="hidden" name="specialtyId" value={item.id} />
            <button type="submit" className="row-remove" title="حذف تخصص" onClick={(event) => { if (!window.confirm(`تخصص «${item.title}» از فهرست حذف شود؟\n\nحذف تنها زمانی انجام می‌شود که این تخصص در هیچ پروندهٔ فعالان، حساب کارشناسی، ارجاع کارشناسی، دورهٔ آموزشی یا فرم پویا استفاده نشده باشد؛ در غیر این صورت سامانه حذف را رد می‌کند و تعداد وابستگی‌ها را اعلام می‌کند. این عمل پس از تأیید برگشت‌ناپذیر است.`)) event.preventDefault(); }}><Trash2 size={14} /></button>
          </form>
          <form action={async (fd: FormData) => { await toggleSpecialtyAction(fd); }} className="inline-form">
            <input type="hidden" name="specialtyId" value={item.id} />
            <input type="hidden" name="active" value={item.active ? "0" : "1"} />
            <button type="submit" className={item.active ? "row-remove" : "secondary-button"}>{item.active ? "غیرفعال" : "فعال"}</button>
          </form>
          <Link className="secondary-button" href={`/forms?sp=${item.id}`}>فرم‌ساز</Link>
        </span>
        {editing === item.id && <form action={metaAction} className="specialties-edit-form">
          <input type="hidden" name="specialtyId" value={item.id} />
          <label>نام تخصص<input name="title" defaultValue={item.title} maxLength={100} required /></label>
          <label>توضیح<input name="description" defaultValue={item.description || ""} maxLength={500} /></label>
          <button className="primary-button" disabled={metaPending}>{metaPending ? <LoaderCircle className="spin" size={15} /> : "ذخیره"}</button>
          <button type="button" onClick={() => setEditing(null)} title="بستن"><X size={15} /></button>
        </form>}
      </div>)}
    </div>
    {/* ذخیرهٔ ترتیب: پس از هر جابه‌جایی اکشن سرور با ترتیب فعلی صدا زده می‌شود */}
    <button type="button" className="secondary-button" onClick={() => saveOrder(list)} disabled={orderPending}>{orderPending ? <LoaderCircle className="spin" size={16} /> : "ذخیرهٔ ترتیب فعلی"}</button>
    {metaState.error && <div className="form-error" role="alert">{metaState.error}</div>}
    {metaState.success && <div className="form-success" role="status">{metaState.success}</div>}
  </section>;
}
