"use client";
import Link from "next/link";
import { useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { statusLabels } from "@/lib/constants";

type Province = { id: number; name: string };
type County = { id: number; name: string; provinceId: number };
type Specialty = { id: number; title: string };

/** Audience picker for the group broadcast composer (GET form like reports). */
export function BroadcastFiltersForm({ provinces, counties, specialties, filters, workflowStatuses }: {
  provinces: Province[]; counties: County[]; specialties: Specialty[];
  filters: { provinceId?: number; countyId?: number; specialtyId?: number; status?: string; onlyWithPhone?: boolean };
  workflowStatuses: [string, string][];
}) {
  const [province, setProvince] = useState(String(filters.provinceId || ""));
  const [county, setCounty] = useState(String(filters.countyId || ""));
  return <form className="report-filters" action="/broadcasts">
    <label>استان<select name="provinceId" value={province} onChange={(event) => { setProvince(event.target.value); setCounty(""); }}><option value="">همه استان‌های مجاز</option>{provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>شهرستان<select name="countyId" value={county} onChange={(event) => setCounty(event.target.value)}><option value="">همه شهرستان‌های مجاز</option>{counties.filter((item) => !province || String(item.provinceId) === province).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <label>تخصص<select name="specialtyId" defaultValue={filters.specialtyId || ""}><option value="">همه تخصص‌ها</option>{specialties.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    <label>وضعیت پرونده<select name="status" defaultValue={filters.status || ""}><option value="">همه وضعیت‌ها</option>{workflowStatuses.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    <label className="broadcast-phone-check"><input type="checkbox" name="onlyWithPhone" value="1" defaultChecked={filters.onlyWithPhone} /> فقط فعالان دارای شماره همراه</label>
    <div className="report-filter-actions"><button className="primary-button"><Filter size={16} /> نمایش گیرندگان</button><Link className="secondary-button" href="/broadcasts"><RotateCcw size={15} /> پاک کردن</Link></div>
  </form>;
}
