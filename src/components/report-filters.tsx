"use client";
import { useState } from "react";
import Link from "next/link";
import { Filter, RotateCcw } from "lucide-react";
import { statusLabels } from "@/lib/constants";
import type { ReportFilters } from "@/lib/report-data";
type Province = { id:number; name:string }; type County = { id:number; name:string; provinceId:number }; type Specialty = { id:number; title:string };
export function ReportFiltersForm({ provinces, counties, specialties, filters }: { provinces:Province[]; counties:County[]; specialties:Specialty[]; filters:ReportFilters }) {
  const [province, setProvince] = useState(String(filters.provinceId || "")); const [county, setCounty] = useState(String(filters.countyId || ""));
  return <form className="report-filters" action="/reports"><label>استان<select name="provinceId" value={province} onChange={(event) => {setProvince(event.target.value);setCounty("");}}><option value="">همه استان‌های مجاز</option>{provinces.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>شهرستان<select name="countyId" value={county} onChange={(event)=>setCounty(event.target.value)}><option value="">همه شهرستان‌های مجاز</option>{counties.filter((c)=>!province || String(c.provinceId)===province).map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>تخصص<select name="specialtyId" defaultValue={filters.specialtyId || ""}><option value="">همه تخصص‌ها</option>{specialties.map((s)=><option key={s.id} value={s.id}>{s.title}</option>)}</select></label><label>وضعیت<select name="status" defaultValue={filters.status || ""}><option value="">همه وضعیت‌ها</option>{Object.entries(statusLabels).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>از تاریخ شمسی<input name="from" defaultValue={filters.from || ""} placeholder="۱۴۰۳/۰۱/۰۱" /></label><label>تا تاریخ شمسی<input name="to" defaultValue={filters.to || ""} placeholder="۱۴۰۳/۱۲/۲۹" /></label><div className="report-filter-actions"><button className="primary-button"><Filter size={16} /> اعمال فیلتر</button><Link className="secondary-button" href="/reports"><RotateCcw size={15} /> پاک کردن</Link></div></form>;
}
