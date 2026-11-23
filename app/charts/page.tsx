import { BedDouble } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChartTable } from "@/components/chart-table.tsx";
import { IconTile, card } from "@/components/ui.tsx";
import { chartRows, draftStale, hasDraft, isPending, latestRuns, type ChartRow } from "@/lib/charts.ts";

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

// Every case still to do sits in exactly one step, by how far it got: a fresh AI draft waits for approval (3), else an
// audited chart waits for Sum with AI (2), else it waits for the audit (1). A draft older than the HIS data needs Sum
// again (2), and an approval the HIS data changed after needs review again (3). "todo" (all steps) is the default view.
const freshDraft = (r: ChartRow) => hasDraft(r) && !draftStale(r);
const VIEWS = {
  todo: { label: "รอทำทั้งหมด", step: 0, match: isPending, empty: "ไม่มีเคสรอทำ ทุกชาร์ทที่นำเข้าอนุมัติรหัสจากข้อมูลล่าสุดแล้ว" },
  noaudit: { label: "ยังไม่ audit", step: 1, match: (r: ChartRow) => isPending(r) && !freshDraft(r) && !r.audit, empty: "ไม่มีเคสที่รอ audit" },
  sum: { label: "รอ Sum with AI", step: 2, match: (r: ChartRow) => isPending(r) && !freshDraft(r) && !!r.audit, empty: "ไม่มีเคสที่ audit แล้วรอ Sum with AI" },
  review: { label: "รออนุมัติ", step: 3, match: (r: ChartRow) => isPending(r) && freshDraft(r), empty: "ไม่มีร่างที่รออนุมัติ" },
  done: { label: "อนุมัติแล้ว", step: 4, match: (r: ChartRow) => !isPending(r), empty: "ยังไม่มีเคสที่อนุมัติรหัส" },
  all: { label: "ทั้งหมด", step: 0, match: () => true, empty: "" },
} as const;
type View = keyof typeof VIEWS;
const STEP_MARK = ["", "①", "②", "③", "④"];

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
      <nav aria-label="กรองรายการ" className="flex flex-wrap items-center gap-1 border-b border-slate-100 p-2 dark:border-slate-800">
        {(Object.keys(VIEWS) as View[]).map((v) => {
          const { label, step, match } = VIEWS[v];
          const inView = rows.filter(match);
          const blocking = step ? inView.filter((r) => r.audit === "blocking").length : 0;
          const current = v === view;
          return (
            <span key={v} className="contents">
              {(v === "noaudit" || v === "all") && <span aria-hidden className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />}
              <Link
                href={v === "todo" ? "/charts" : `/charts?view=${v}`}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${current ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}
              >
                {step > 0 && <span aria-hidden>{STEP_MARK[step]}</span>}
                {label}
                <span className={`rounded-full px-1.5 text-xs tabular-nums ${current ? "bg-white/20" : "bg-slate-100 dark:bg-slate-800"}`}>{inView.length}</span>
                {blocking > 0 && (
                  <span className={`rounded-full px-1.5 text-xs ${current ? "bg-rose-500 text-white" : "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"}`}>ติดบังคับ {blocking}</span>
                )}
              </Link>
            </span>
          );
        })}
      </nav>
      {shown.length
        ? <ChartTable items={shown.map((r) => ({ ...r, local: r }))} runs={runs} />
        : <p className="p-6 text-slate-500">{VIEWS[view].empty}</p>}
    </div>
  );
}
