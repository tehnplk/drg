import { BedDouble } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChartTable } from "@/components/chart-table.tsx";
import { IconTile, card } from "@/components/ui.tsx";
import { chartRows, isPending, latestRuns, type ChartRow } from "@/lib/charts.ts";

export const metadata: Metadata = { title: "รายการผู้ป่วยรอทำ D/C Sum" };

export default function ChartsPage(props: PageProps<"/charts">) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto grid w-full max-w-[96rem] content-start gap-6 p-4 sm:p-8">
        <header className="flex items-center gap-4">
          <IconTile icon={BedDouble} tone="indigo" size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">รายการผู้ป่วยรอทำ D/C Sum</h1>
            <p className="text-sm text-slate-500">
              ชาร์ทที่นำเข้าจาก HIS แล้ว เปิดทีละเคสเพื่อ Audit และทำ D/C Summary ด้วย AI แล้วตรวจรหัสและ DRG
            </p>
          </div>
        </header>
        <Suspense fallback={<p className="text-slate-500">กำลังโหลดรายชื่อผู้ป่วย...</p>}>
          <PatientList searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

// The filters, in the order the work goes. "todo" is the default view.
const VIEWS = {
  todo: { label: "รอทำ D/C Sum", match: isPending, empty: "ไม่มีเคสรอทำ ทุกชาร์ทที่นำเข้ามีร่างจากข้อมูลล่าสุดแล้ว" },
  noaudit: { label: "ยังไม่ audit", match: (r: ChartRow) => isPending(r) && !r.audit, empty: "ทุกเคสที่รอทำ audit แล้ว" },
  blocking: { label: "ติดเงื่อนไขบังคับ", match: (r: ChartRow) => isPending(r) && r.audit === "blocking", empty: "ไม่มีเคสที่ติดเงื่อนไขบังคับ" },
  done: { label: "ทำ D/C Sum แล้ว", match: (r: ChartRow) => !isPending(r), empty: "ยังไม่มีเคสที่ทำ D/C Sum เสร็จ" },
  all: { label: "ทั้งหมด", match: () => true, empty: "" },
} as const;
type View = keyof typeof VIEWS;

async function PatientList({ searchParams }: Pick<PageProps<"/charts">, "searchParams">) {
  await connection();
  const raw = (await searchParams).view;
  const view: View = typeof raw === "string" && raw in VIEWS ? (raw as View) : "todo";
  const rows = await chartRows();
  if (!rows.length)
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        ยังไม่มีชาร์ทที่นำเข้า ไปที่ <Link href="/discharges" className="font-medium underline">ขั้นที่ 1 รายการผู้ป่วยใน HIS</Link> แล้วกด &quot;นำเข้า AI Sum&quot;
      </p>
    );

  const shown = rows.filter(VIEWS[view].match);
  const runs = await latestRuns(shown.map((r) => r.an));

  return (
    <div className={`overflow-x-auto ${card}`}>
      <nav aria-label="กรองรายการ" className="flex flex-wrap gap-1 border-b border-slate-100 p-2 dark:border-slate-800">
        {(Object.keys(VIEWS) as View[]).map((v) => {
          const n = rows.filter(VIEWS[v].match).length;
          const current = v === view;
          return (
            <Link
              key={v}
              href={v === "todo" ? "/charts" : `/charts?view=${v}`}
              aria-current={current ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${current ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
            >
              {VIEWS[v].label}
              <span className={`rounded-full px-1.5 text-xs tabular-nums ${current ? "bg-white/20" : v === "blocking" && n ? "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" : "bg-slate-100 dark:bg-slate-800"}`}>{n}</span>
            </Link>
          );
        })}
      </nav>
      {shown.length
        ? <ChartTable items={shown.map((r) => ({ ...r, local: r }))} runs={runs} />
        : <p className="p-6 text-slate-500">{VIEWS[view].empty}</p>}
    </div>
  );
}
