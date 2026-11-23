"use client";

import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { useFormStatus } from "react-dom";
import { importChart } from "@/app/actions.ts";

function Submit({ again, compact }: { again: boolean; compact: boolean }) {
  const { pending } = useFormStatus();
  const Icon = pending ? LoaderCircle : again ? RefreshCw : Download;
  return (
    <button
      disabled={pending}
      title={again ? "ดึงข้อมูลดิบจาก HIS มาแทนของเดิม ร่าง D/C และผล audit ยังอยู่" : "นำเข้าชาร์ทจาก HIS แล้วไปหน้า Audit ของเคสนี้"}
      className={
        again
          ? "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 font-medium whitespace-nowrap text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
          : "inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-violet-600 to-fuchsia-600 px-3.5 py-2 font-medium whitespace-nowrap text-white shadow-md shadow-violet-500/25 transition hover:from-violet-700 hover:to-fuchsia-700 hover:shadow-lg active:translate-y-px disabled:opacity-60"
      }
    >
      <Icon className={`size-4 ${pending ? "animate-spin" : ""}`} />
      {pending ? (again ? "กำลัง Re-Sync..." : "กำลังนำเข้า...") : again ? (compact ? "Re-Sync" : "Re-Sync จาก HIS") : "นำเข้า AI Sum"}
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
