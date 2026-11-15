"use client";
// الحاقیهٔ ۲.۱۳.۰ — پنجرهٔ بازشوی انتخاب اجزای حفظ قرآن: پس از اعلام تعداد
// جزءها، همهٔ ۳۰ جزء به‌صورت چندانتخابی نمایش داده می‌شود و کاربر فقط به
// تعداد اعلام‌شده اجازهٔ انتخاب دارد؛ تأیید تنها با انتخاب دقیق همان تعداد
// فعال می‌شود. برای «حفظ کل قرآن» هر ۳۰ جزء خودکار انتخاب شده است.
import { useState } from "react";

const ALL_JUZ = Array.from({ length: 30 }, (_, index) => index + 1);
const faDigits = (value: number | string) => String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);

export function JuzPickerModal({
  open, count, initial, onConfirm, onCancel,
}: {
  open: boolean;
  count: number; // تعداد اعلام‌شدهٔ اجزا (۱ تا ۳۰)
  initial: number[]; // انتخاب‌های قبلی برای ویرایش
  onConfirm: (parts: number[]) => void;
  onCancel: () => void;
}) {
  // انتخاب‌های داخلی از مقدار اولیهٔ همان بار باز شدن؛ والد با key متمایز
  // کامپوننت را برای هر باز شدن از نو می‌سازد تا انتخاب‌های قبلی بازنشانی شود.
  const [selected, setSelected] = useState<number[]>(() => [...initial].sort((a, b) => a - b));

  if (!open) return null;

  const toggle = (juz: number) => {
    setSelected((current) => {
      if (current.includes(juz)) return current.filter((item) => item !== juz);
      if (current.length >= count) return current; // سقف تعداد اعلام‌شده
      return [...current, juz].sort((a, b) => a - b);
    });
  };

  const complete = selected.length === count;
  const summaryFa = selected.length === 30 ? "۱ تا ۳۰" : selected.map((item) => faDigits(item)).join("، ");

  return (
    <div className="juz-modal-backdrop" role="presentation" onClick={onCancel}>
      <div className="juz-modal" role="dialog" aria-modal="true" aria-label="انتخاب اجزای حفظ‌شده قرآن" onClick={(event) => event.stopPropagation()}>
        <div className="juz-modal-head">
          <div>
            <strong>انتخاب اجزای حفظ‌شده قرآن</strong>
            <small>میزان اعلام‌شده: {faDigits(count)} جزء — انتخاب‌شده: {faDigits(selected.length)} جزء</small>
          </div>
          <button type="button" className="juz-modal-close" onClick={onCancel} aria-label="بستن">✕</button>
        </div>
        <div className="juz-modal-grid">
          {ALL_JUZ.map((juz) => {
            const checked = selected.includes(juz);
            const locked = !checked && selected.length >= count;
            return (
              <button
                key={juz}
                type="button"
                className={checked ? "juz-cell selected" : locked ? "juz-cell locked" : "juz-cell"}
                onClick={() => toggle(juz)}
                aria-pressed={checked}
                disabled={locked}
                title={locked ? "به تعداد اعلام‌شده فقط مجاز به انتخاب همان تعداد هستید" : `جزء ${faDigits(juz)}`}
              >
                <span className="juz-cell-num">{faDigits(juz)}</span>
                <small>جزء</small>
              </button>
            );
          })}
        </div>
        <div className="juz-modal-foot">
          <span className="juz-modal-summary">
            {selected.length ? `اجزای منتخب: ${summaryFa}` : "هنوز جزئی انتخاب نشده است."}
          </span>
          <div className="juz-modal-actions">
            <button type="button" className="juz-modal-cancel" onClick={onCancel}>انصراف</button>
            <button type="button" className="juz-modal-confirm" disabled={!complete} onClick={() => onConfirm([...selected].sort((a, b) => a - b))}>
              تأیید{complete ? "" : ` (${faDigits(selected.length)} از ${faDigits(count)})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** خلاصهٔ فارسی اجزای انتخاب‌شده؛ ۳۰ جزء به‌صورت «۱ تا ۳۰». */
export function juzPartsSummaryFa(parts: number[]): string {
  if (parts.length === 30) return "۱ تا ۳۰";
  return parts.map((item) => faDigits(item)).join("، ");
}
