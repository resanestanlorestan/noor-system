// بازنویسی بخش «داده‌های جامانده» در صفحهٔ کاربران به‌صورت چندخطی تمیز.
import fs from "node:fs";

const file = "src/app/(workspace)/users/page.tsx";
let src = fs.readFileSync(file, "utf8");
const lines = src.split("\n");
const i = 39; // خط ۴۰ — خط بازگشت صفحه
const line = lines[i];

const anchor = '{actor.effectiveRole === "super_admin" && (staleAccounts.length > 0';
const at = line.indexOf(anchor);
if (at < 0) throw new Error("anchor not found");
const head = line.slice(0, at); // تا قبل از بخش جامانده‌ها

const tail = `{staleSection}</>;`;
lines[i] = head + tail;

// بلوک چندخطی بخش جامانده‌ها — پیش از return
const block = `  // الحاقیهٔ ۲.۱۷.۱ — بخش «داده‌های جامانده» فقط برای مدیر ارشد: حساب‌های
  // حذف‌شدهٔ کد قدیمی با رکورد فعالِ جامانده + رکوردهای بدون مالکِ زنده.
  const staleSection = actor.effectiveRole === "super_admin" && (staleAccounts.length > 0 || orphanRows.length > 0)
    ? (<section className="ws-panel ws-list-panel">
        <div className="ws-panel-head">
          <div>
            <span>بازمانده‌های حذف‌های قدیمی</span>
            <h2>داده‌های جامانده</h2>
            <p>حساب‌ها و رکوردهایی که با کد پیش از الحاقیهٔ ۲.۱۷.۰ حذف شده‌اند ولی دادهٔ فعالشان باقی مانده و کد ملی را قفل کرده است.</p>
          </div>
          {orphanRows.length > 0 && <SweepStale />}
        </div>
        {staleAccounts.length > 0 && (
          <div className="ws-table-scroll">
            <table className="ws-table">
              <thead><tr><th>حساب حذف‌شده</th><th>نقش</th><th>زمان حذف</th><th /></tr></thead>
              <tbody>
                {staleAccounts.map((item) => (
                  <tr key={item.id}>
                    <td><div className="table-person"><span>{item.fullName.slice(0, 1)}</span><div><strong>{item.fullName}</strong><small>دادهٔ جامانده: {faNumber(item.leftovers)} رکورد فعال</small></div></div></td>
                    <td>{roleLabels[item.role]}</td>
                    <td>{item.deletedAt ? faDate(item.deletedAt, true) : "—"}</td>
                    <td><DeleteStaleUser id={item.id} name={item.fullName} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orphanRows.length > 0 && (
          <div className="ws-table-scroll">
            <table className="ws-table">
              <thead><tr><th>رکورد فعال بدون مالکِ زنده</th><th>کد ملی</th><th>وضعیت</th></tr></thead>
              <tbody>
                {orphanRows.map((item) => (
                  <tr key={item.id}>
                    <td><div className="table-person"><span>{(item.lastName || item.firstName || "؟").slice(0, 1)}</span><div><strong>{[item.firstName, item.lastName].filter(Boolean).join(" ") || "بدون نام"}</strong></div></div></td>
                    <td dir="ltr">{item.last4 ? \`••••\${item.last4}\` : "—"}</td>
                    <td>{item.ownerDeletedAt ? "مالک حذف‌شده" : "بدون حساب مالک"} — بدون پروندهٔ فعال</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>)
    : null;
  return <>`;

// پیدا کردن «return <>» و جایگذاری بلوک قبل از آن
const returnIdx = lines.findIndex((l) => l.includes("return <>"));
if (returnIdx < 0) throw new Error("return anchor not found");
lines.splice(returnIdx, 1, block + lines[returnIdx].replace("return <>", ""));

fs.writeFileSync(file, lines.join("\n"));
console.log("rewritten OK — return now at line", returnIdx + 1);
