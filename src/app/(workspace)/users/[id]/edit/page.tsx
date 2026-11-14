import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { db } from "@/db";
import { counties, customRoles, provinces, specialties, userSpecialties, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { ensureReferenceData } from "@/lib/data";
import { can } from "@/lib/permissions";
import { isUuid } from "@/lib/workflow-utils";
import { EditStaffForm } from "@/components/edit-staff-form";
export default async function EditUserPage({params}:{params:Promise<{id:string}>}) {
 const actor=await requireUser(); if(!(await can(actor, "users.manage"))) redirect("/dashboard"); const {id}=await params; if(!isUuid(id)||id===actor.id) notFound();
 const [target]=await db.select({id:users.id,fullName:users.fullName,firstName:users.firstName,lastName:users.lastName,email:users.email,phone:users.phone,role:users.role,customRoleId:users.customRoleId,provinceId:users.provinceId,countyId:users.countyId}).from(users).where(eq(users.id,id)).limit(1);
 if(!target||!["province_admin","county_admin","reviewer","specialist"].includes(target.role)||(actor.effectiveRole==="province_admin"&&(!actor.provinceId||target.provinceId!==actor.provinceId||target.role==="province_admin"))) notFound();
 await ensureReferenceData(); const [p,c,s,selected,roleOptions]=await Promise.all([db.select().from(provinces).orderBy(provinces.name),db.select().from(counties).orderBy(counties.name),db.select().from(specialties).orderBy(specialties.id),db.select({id:userSpecialties.specialtyId}).from(userSpecialties).where(eq(userSpecialties.userId,id)),db.select({id:customRoles.id,label:customRoles.label,baseRole:customRoles.baseRole}).from(customRoles).orderBy(customRoles.label)]);
 return <><div className="ws-breadcrumb"><Link href="/users">کاربران</Link><span> / </span><b>ویرایش کاربر</b></div><div className="ws-page-head"><div><div className="ws-eyebrow"><span /> مدیریت دسترسی</div><h1>ویرایش کاربر سازمانی</h1><p>نام، نقش و محدوده مجاز کاربر را بررسی کنید.</p></div><Link className="secondary-button" href="/users"><ArrowRight size={16}/> بازگشت</Link></div><section className="ws-panel detail-section"><EditStaffForm target={{...target,specialtyIds:selected.map(x=>x.id)}} actorRole={actor.effectiveRole} canAssignCustomRole={actor.effectiveRole==="super_admin"} customRoles={roleOptions} provinces={actor.effectiveRole==="province_admin"?p.filter(x=>x.id===actor.provinceId):p} counties={c} specialties={s}/></section></>;
}
