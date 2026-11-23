"use client";

import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { importChart, importCharts } from "@/app/actions.ts";

// Ticking several cases on the HIS list: each row's checkbox belongs to this form through its form attribute.
export const BULK_FORM = "bulk-import";
const ticks = () => document.querySelectorAll<HTMLInputElement>(`input[name="an"][form="${BULK_FORM}"]`);

export function SelectAll() {
  return <input type="checkbox" aria-label="เลือกทุกรายที่ยังไม่นำเข้า" className="size-4 accent-violet-600"
    onChange={(e) => ticks().forEach((c) => { c.checked = e.target.checked; })} />;
}

export function BulkImport() {
  const [result, action, pending] = useActionState(importCharts, null);
  return (
    <form id={BULK_FORM} action={action} className="ml-auto flex flex-wrap items-center gap-3">
      {result && (
        <span className={`text-sm ${result.failed.length ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
          {result.ok + result.failed.length === 0 ? "ยังไม่ได้เลือกผู้ป่วย" : `นำเข้าแล้ว ${result.ok} ราย`}
          {result.failed.length > 0 && ` · ไม่สำเร็จ ${result.failed.length} ราย (AN ${result.failed.join(", ")}) ลองใหม่อีกครั้ง`}
        </span>
      )}
      <button disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-600 px-3.5 py-2 text-sm font-medium whitespace-nowrap text-white shadow-md shadow-violet-500/25 hover:from-violet-700 hover:to-fuchsia-700 disabled:opacity-60">
        {pending ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
        {pending ? "กำลังนำเข้า..." : "นำเข้ารายที่เลือก"}
      </button>
    </form>
  );
}

function Submit({ again, compact }: { again: boolean; compact: boolean }) {
  const { pending } = useFormStatus();
  const Icon = pending ? LoaderCircle : again ? RefreshCw : Download;
  return (
    <button
      disabled={pending}
      title={again ? "ดึงข้อมูลดิบจาก HIS มาแทนของเดิม ผล Pre-coding + Query และร่างรหัสยังอยู่" : "นำเข้าชาร์ทจาก HIS แล้วไปหน้า Pre-coding + Query ของเคสนี้"}
      className={
        again
          ? "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium whitespace-nowrap text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
          : "inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-600 px-3.5 py-2 font-medium whitespace-nowrap text-white shadow-md shadow-violet-500/25 transition hover:from-violet-700 hover:to-fuchsia-700 hover:shadow-lg active:translate-y-px disabled:opacity-60"
      }
    >
      <Icon className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? (again ? "กำลัง Re-Sync..." : "กำลังนำเข้า...") : again ? (compact ? "Re-Sync" : "Re-Sync จาก HIS") : "นำเข้า"}
    </button>
  );
}

// again: the chart is already imported, so this syncs it again from the HIS. compact: the short label, for tables.
export function ImportButton({ an, again = false, compact = false }: { an: string; again?: boolean; compact?: boolean }) {
  return (
    <form action={importChart.bind(null, an, !again)}>
      <Submit again={again} compact={compact} />
    </form>
  );
}
