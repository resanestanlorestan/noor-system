import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { logoutAction } from "@/app/actions/auth";
import { roleLabels } from "@/lib/constants";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const navItems = [
    { href: "/dashboard", label: "داشبورد" },
    { href: "/cases", label: "پرونده‌ها" },
    { href: "/cases/new", label: "ثبت پرونده جدید" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-indigo-700">سامانه نور</span>
            <nav className="flex items-center gap-4 text-sm">
              {navItems.map((item) => (
                <a key={item.href} href={item.href} className="text-slate-600 hover:text-indigo-700">{item.label}</a>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-left text-sm">
              <div className="font-medium">{user.fullName}</div>
              <div className="text-xs text-slate-500">{roleLabels[user.effectiveRole] || user.effectiveRole}</div>
            </div>
            <form action={logoutAction}>
              <button type="submit" className="btn-ghost">خروج</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
