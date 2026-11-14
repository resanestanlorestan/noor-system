"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Bell, BellRing, BookOpenText, CalendarDays, FileClock, FileText, History, Inbox, LayoutDashboard, ListChecks, LogOut, MapPinned, Megaphone, Menu, Search, ShieldCheck, Trophy, UserRound, UsersRound, X } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { roleLabels, type UserRole } from "@/lib/constants";

export function WorkspaceShell({ name, role, customRoleLabel, permissions, today, unread, photoUrl, children }: { name: string; role: UserRole; customRoleLabel?: string | null; permissions: string[]; today: string; unread: number; photoUrl?: string | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false); const pathname = usePathname();
  // قفل اسکرول پشت منو + بستن با کلید Escape — منو باید روی موبایل «ثابت» و پاسخ‌گو بماند
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);
  const allowed = (key: string) => permissions.includes(key);
  const links = [
    { href: "/dashboard", label: "داشبورد", icon: LayoutDashboard, allowed: true },
    { href: "/cases", label: role === "activist" ? "پرونده من" : "بانک پرونده‌ها", icon: FileText, allowed: true },
    { href: "/case-status", label: "وضعیت پرونده‌ها", icon: ListChecks, allowed: true },
    { href: role === "specialist" ? "/cases?status=specialist_review" : "/cases?status=pending", label: role === "specialist" ? "کارتابل تخصصی" : "کارتابل بررسی", icon: FileClock, allowed: allowed("cases.view_all") && role !== "activist" },
    { href: "/notifications", label: "اعلان‌ها", icon: Bell, allowed: true },
    { href: "/account", label: "حساب کاربری", icon: UserRound, allowed: true },
    { href: "/reports", label: "گزارش‌ها و آمار", icon: BarChart3, allowed: allowed("reports.view") },
    { href: "/ranking", label: "رتبه‌بندی فعالان", icon: Trophy, allowed: allowed("reports.view") },
    { href: "/reminders", label: "یادآور معوق‌ها", icon: BellRing, allowed: allowed("reminders.send") },
    { href: "/broadcasts", label: "پیام گروهی", icon: Megaphone, allowed: allowed("messages.broadcast") },
    { href: "/events", label: "رویدادها", icon: CalendarDays, allowed: allowed("events.manage") },
    { href: "/users", label: "مدیریت کاربران", icon: UsersRound, allowed: allowed("users.manage") },
    { href: "/permissions", label: "نقش‌ها و مجوزها", icon: ShieldCheck, allowed: allowed("permissions.manage") },
    { href: "/settings", label: "تقسیمات جغرافیایی", icon: MapPinned, allowed: allowed("settings.geo") || allowed("settings.references") },
    { href: "/audit", label: "رویدادهای حساس", icon: History, allowed: allowed("audit.view") },
    { href: "/outbox", label: "صندوق پیام‌ها", icon: Inbox, allowed: allowed("outbox.view") },
  ];
  // پس‌زمینهٔ تیره همیشه در DOM می‌ماند و فقط با opacity/visibility محو می‌شود؛
  // حذف ناگهانی آن هنگام بستن منو باعث پدیدهٔ «لایهٔ منجمد» و نوار سفید چسبیده در برخی مرورگرهای موبایل می‌شد.
  return <div className="ws-app">
    <button type="button" className={`ws-backdrop ${open ? "is-open" : ""}`} aria-label="بستن منو" aria-hidden={!open} tabIndex={-1} onClick={() => setOpen(false)} />
    <aside id="ws-sidebar-nav" className={`ws-sidebar ${open ? "is-open" : ""}`}><div className="ws-sidebar-brand"><Link href="/dashboard" className="workspace-brand"><span><BookOpenText size={23} /></span><div><strong>سامانه نور</strong><small>جامع فعالان قرآنی</small></div></Link><button className="ws-close" aria-label="بستن منو" onClick={() => setOpen(false)}><X size={20} /></button></div>
      <div className="ws-sidebar-scroll"><div className="ws-nav-label">منوی اصلی</div><nav>{links.filter((link) => link.allowed).map((link) => { const Icon = link.icon; const active = !link.href.includes("?") && pathname === link.href; return <Link key={link.href} href={link.href} onClick={() => setOpen(false)} className={`ws-nav-link ${active ? "active" : ""}`}><Icon size={19} /><span>{link.label}</span>{link.href === "/notifications" && unread > 0 && <b className="ws-unread-count">{new Intl.NumberFormat("fa-IR").format(unread)}</b>}{active && <i />}</Link>; })}</nav>
        <div className="ws-side-note"><ShieldCheck size={19} /><strong>حریم خصوصی مهم است</strong><p>دسترسی به پرونده‌ها بر اساس نقش و محدوده کاربر کنترل می‌شود.</p></div>
      </div><div className="ws-sidebar-bottom"><span className="ws-avatar">{photoUrl ? <img src={photoUrl} alt={`تصویر پرسنلی ${name}`} width={36} height={36} /> : name.slice(0, 1)}</span><div><strong>{name}</strong><small>{customRoleLabel ? `${customRoleLabel} · ${roleLabels[role]}` : roleLabels[role]}</small></div><form action={logoutAction}><button title="خروج از حساب" aria-label="خروج از حساب"><LogOut size={18} /></button></form></div>
    </aside>
    <div className="ws-main"><header className="ws-topbar"><div className="ws-top-right"><button className="ws-menu" aria-label="باز کردن منو" aria-expanded={open} aria-controls="ws-sidebar-nav" onClick={() => setOpen(true)}><Menu size={20} /></button><div className="ws-top-title"><strong>سامانه جامع فعالان قرآنی</strong><small>پنل {roleLabels[role]}</small></div><div className="ws-top-date"><span>امروز</span><strong>{today}</strong></div></div><div className="ws-top-actions"><form action="/cases" className="ws-search"><Search size={17} /><input name="q" placeholder="جست‌وجو در پرونده‌ها..." aria-label="جست‌وجو در پرونده‌ها" /></form><ThemeToggle compact /><Link href="/notifications" className="ws-bell-link" aria-label={`اعلان‌ها؛ ${new Intl.NumberFormat("fa-IR").format(unread)} خوانده‌نشده`}><Bell size={18} />{unread > 0 && <i />}</Link><span className="ws-user-chip"><span className="ws-avatar small">{photoUrl ? <img src={photoUrl} alt="" width={31} height={31} /> : name.slice(0, 1)}</span><span>{name}</span></span><form action={logoutAction}><button className="ws-logout" title="خروج از سامانه" aria-label="خروج از سامانه"><LogOut size={16} /></button></form></div></header>
      <div className="ws-content">{children}<footer className="ws-footer"><span>سامانه جامع فعالان قرآنی</span></footer></div>
    </div>
  </div>;
}
