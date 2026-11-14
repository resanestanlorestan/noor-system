"use client";
// Interactive permission matrix (roles × capabilities) plus custom-role editor.
// State is seeded from server props and updated optimistically; the server
// action is the single source of truth and revalidates the page on success.
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, RotateCcw, ShieldCheck, Save, Trash2, X } from "lucide-react";
import { deleteCustomRoleAction, resetRoleDefaultsAction, saveCustomRoleAction, toggleRolePermissionAction } from "@/app/actions/permissions";
import { initialActionState } from "@/lib/action-state";
import { roleLabels, type UserRole } from "@/lib/constants";

type PermissionDef = { key: string; label: string; category: string; hint?: string };
type CustomRole = { id: string; label: string; baseRole: UserRole; description: string | null; userCount: number; permissions: string[] };
export type MatrixData = {
  catalogue: PermissionDef[];
  systemRoles: UserRole[];
  systemGrants: Record<string, string[]>;
  roleDefaults: Record<string, string[]>;
  customRoles: CustomRole[];
  viewerEffectiveRole: UserRole;
};

const PROTECTED_KEY = "permissions.manage";

export function PermissionMatrix({ data }: { data: MatrixData }) {
  const router = useRouter();
  const [grants, setGrants] = useState<Record<string, string[]>>(() => data.systemGrants);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(() => data.customRoles);
  const [notice, setNotice] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  // Re-sync local state when fresh server props arrive after router.refresh()
  // (adjust-state-during-render pattern — no effect needed).
  const [snapshot, setSnapshot] = useState(data);
  if (snapshot !== data) { setSnapshot(data); setGrants(data.systemGrants); setCustomRoles(data.customRoles); }

  const has = (roleKey: string, permissionKey: string) => (grants[roleKey] ?? []).includes(permissionKey);
  const isProtected = (roleKey: string, permissionKey: string) =>
    permissionKey === PROTECTED_KEY && (roleKey === "super_admin" || roleKey === data.viewerEffectiveRole);

  const toggle = (roleKey: UserRole, permissionKey: string, allow: boolean) => {
    if (isProtected(roleKey, permissionKey) && !allow) { setNotice({ kind: "error", text: "این مجوز برای حفظ دسترسی مدیریتی قابل حذف نیست." }); return; }
    const previous = grants;
    setGrants((current) => ({ ...current, [roleKey]: allow ? [...(current[roleKey] ?? []), permissionKey] : (current[roleKey] ?? []).filter((key) => key !== permissionKey) }));
    startTransition(async () => {
      const form = new FormData();
      form.set("roleKey", roleKey); form.set("permissionKey", permissionKey); form.set("allow", allow ? "1" : "0");
      const result = await toggleRolePermissionAction(initialActionState, form);
      if (result?.error) { setGrants(previous); setNotice({ kind: "error", text: result.error }); return; }
      setNotice({ kind: "success", text: result?.success || "ثبت شد." });
      router.refresh();
    });
  };

  const resetRole = (roleKey: UserRole) => {
    if (!window.confirm(`مجوزهای نقش «${roleLabels[roleKey]}» به پیش‌فرض بازگردد؟`)) return;
    startTransition(async () => {
      const form = new FormData(); form.set("roleKey", roleKey);
      const result = await resetRoleDefaultsAction(initialActionState, form);
      if (result?.error) { setNotice({ kind: "error", text: result.error }); return; }
      setNotice({ kind: "success", text: result?.success || "بازنشانی شد." });
      router.refresh();
    });
  };

  const categories = [...new Set(data.catalogue.map((item) => item.category))];
  const columns: { kind: "system"; key: UserRole; label: string }[] = data.systemRoles.map((role) => ({ kind: "system", key: role, label: roleLabels[role] }));

  return (
    <div className="perm-matrix-wrap">
      {notice && <div className={`ws-notice ${notice.kind === "error" ? "form-error" : ""}`} role="status">{notice.text}<button type="button" className="notice-close" aria-label="بستن" onClick={() => setNotice(null)}><X size={14} /></button></div>}
      <section className="ws-panel detail-section">
        <div className="detail-section-head"><div><span>ماتریس دسترسی</span><h2>مجوزهای نقش‌های سامانه‌ای</h2><p>با تغییر هر خانه، مجوز نقش بلافاصله برای همه نشست‌های بعدی اعمال می‌شود.</p></div><ShieldCheck size={19} /></div>
        <div className="ws-table-scroll perm-table-scroll">
          <table className="ws-table perm-matrix">
            <thead>
              <tr>
                <th className="perm-capability">مجوز</th>
                {columns.map((column) => (
                  <th key={column.key} className="perm-role-col">
                    <span>{column.label}</span>
                    <button type="button" className="perm-reset" title="بازنشانی به پیش‌فرض" aria-label={`بازنشانی مجوزهای ${column.label}`} disabled={pending} onClick={() => resetRole(column.key)}><RotateCcw size={13} /></button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <Fragment key={`cat-${category}`}>
                  <tr className="perm-category-row"><td colSpan={columns.length + 1}>{category}</td></tr>
                  {data.catalogue.filter((item) => item.category === category).map((item) => (
                    <tr key={item.key}>
                      <td className="perm-capability"><strong>{item.label}</strong>{item.hint && <small>{item.hint}</small>}<code dir="ltr">{item.key}</code></td>
                      {columns.map((column) => {
                        const allowed = has(column.key, item.key);
                        const locked = isProtected(column.key, item.key);
                        return (
                          <td key={column.key} className="perm-cell">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={allowed}
                              aria-label={`${item.label} برای ${column.label}`}
                              className={`perm-switch ${allowed ? "on" : ""} ${locked ? "locked" : ""}`}
                              disabled={pending}
                              title={locked ? "این مجوز برای حفظ دسترسی مدیریتی ثابت است" : allowed ? "حذف مجوز" : "افزودن مجوز"}
                              onClick={() => toggle(column.key, item.key, !allowed)}
                            ><i /></button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <CustomRolesPanel customRoles={customRoles} roleDefaults={data.roleDefaults} catalogue={data.catalogue} onChanged={(next) => { setCustomRoles(next); router.refresh(); }} onError={(text) => setNotice({ kind: "error", text })} onSuccess={(text) => setNotice({ kind: "success", text })} />
      {pending && <div className="perm-pending"><LoaderCircle className="spin" size={16} /> در حال ثبت…</div>}
    </div>
  );
}

function CustomRolesPanel({ customRoles, roleDefaults, catalogue, onChanged, onError, onSuccess }: {
  customRoles: CustomRole[];
  roleDefaults: Record<string, string[]>;
  catalogue: PermissionDef[];
  onChanged: (next: CustomRole[]) => void;
  onError: (text: string) => void;
  onSuccess: (text: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [label, setLabel] = useState(""); const [description, setDescription] = useState("");
  const [baseRole, setBaseRole] = useState<UserRole>("reviewer");
  const [selected, setSelected] = useState<Set<string>>(new Set(roleDefaults.reviewer ?? []));
  const [saving, setSaving] = useState(false);

  const startCreate = () => { setEditing(null); setLabel(""); setDescription(""); setBaseRole("reviewer"); setSelected(new Set(roleDefaults.reviewer ?? [])); };
  const startEdit = (role: CustomRole) => { setEditing(role); setLabel(role.label); setDescription(role.description ?? ""); setBaseRole(role.baseRole); setSelected(new Set(role.permissions)); window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); };
  const applyBaseDefaults = (role: UserRole) => { setBaseRole(role); setSelected(new Set(roleDefaults[role] ?? [])); };
  const toggleKey = (key: string) => setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const submit = async () => {
    setSaving(true);
    const form = new FormData();
    if (editing) form.set("customRoleId", editing.id);
    form.set("label", label); form.set("description", description); form.set("baseRole", baseRole);
    selected.forEach((key) => form.append("permissionKeys", key));
    const result = await saveCustomRoleAction(initialActionState, form);
    setSaving(false);
    if (result?.error) { onError(result.error); return; }
    onSuccess(result?.success || "نقش سفارشی ثبت شد.");
    startCreate();
    router.refresh();
  };

  const remove = async (role: CustomRole) => {
    if (!window.confirm(`نقش سفارشی «${role.label}» حذف شود؟`)) return;
    const form = new FormData(); form.set("customRoleId", role.id);
    const result = await deleteCustomRoleAction(initialActionState, form);
    if (result?.error) { onError(result.error); return; }
    onSuccess(result?.success || "حذف شد.");
    if (editing?.id === role.id) startCreate();
    onChanged(customRoles.filter((item) => item.id !== role.id));
  };

  const categories = [...new Set(catalogue.map((item) => item.category))];

  return (
    <section className="ws-panel detail-section">
      <div className="detail-section-head"><div><span>نقش‌های سفارشی</span><h2>{editing ? `ویرایش نقش «${editing.label}»` : "تعریف نقش سفارشی جدید"}</h2><p>نقش پایه فقط محدوده دسترسی جغرافیایی و گردش کار را تعیین می‌کند؛ تیک‌های زیر مجوزهای واقعی نقش سفارشی هستند.</p></div><Save size={19} /></div>
      {customRoles.length > 0 && (
        <div className="custom-role-list">
          {customRoles.map((role) => (
            <div key={role.id} className="custom-role-item">
              <div><strong>{role.label}</strong><small>مبنای محدوده: {roleLabels[role.baseRole]} · {role.permissions.length} مجوز · {role.userCount} کاربر</small></div>
              <div className="custom-role-actions">
                <button type="button" className="table-link" onClick={() => startEdit(role)}>ویرایش</button>
                <button type="button" className="table-link danger" onClick={() => remove(role)}><Trash2 size={14} /> حذف</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="management-form custom-role-form">
        <div className="form-grid">
          <label>عنوان نقش<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={100} placeholder="مانند: کارشناس رسانه دیجیتال" /></label>
          <label>نقش پایه (محدوده دسترسی)
            <select value={baseRole} onChange={(event) => applyBaseDefaults(event.target.value as UserRole)}>
              {(Object.keys(roleLabels) as UserRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
            </select>
            <small>با تغییر نقش پایه، تیک‌ها روی پیش‌فرض همان نقش قرار می‌گیرد.</small>
          </label>
          <label className="full-field">توضیح (اختیاری)<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="مانند: دسترسی به صندوق پیام‌ها برای تیم رسانه" /></label>
        </div>
        <div className="perm-pick-grid">
          {categories.map((category) => (
            <fieldset key={category}><legend>{category}</legend>
              {catalogue.filter((item) => item.category === category).map((item) => (
                <label key={item.key} className="perm-pick"><input type="checkbox" checked={selected.has(item.key)} onChange={() => toggleKey(item.key)} /><span>{item.label}</span></label>
              ))}
            </fieldset>
          ))}
        </div>
        <div className="custom-role-buttons">
          {editing && <button type="button" className="secondary-button" onClick={startCreate}><X size={15} /> انصراف از ویرایش</button>}
          <button type="button" className="primary-button" disabled={saving || label.trim().length < 3} onClick={submit}>{saving ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />} {editing ? "ذخیره تغییرات نقش" : "ایجاد نقش سفارشی"}</button>
        </div>
      </div>
    </section>
  );
}
