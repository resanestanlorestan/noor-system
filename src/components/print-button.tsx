"use client";
import { Printer } from "lucide-react";

export function PrintButton({ label = "چاپ / ذخیره PDF" }: { label?: string }) {
  return <button className="primary-button no-print" onClick={() => window.print()}><Printer size={16} /> {label}</button>;
}
