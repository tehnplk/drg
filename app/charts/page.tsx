import { BedDouble } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChartTable } from "@/components/chart-table.tsx";
import { IconTile, card } from "@/components/ui.tsx";
import { chartRows, draftStale, hasDraft, isPending, latestRuns, openQueries, type ChartRow } from "@/lib/charts.ts";

export const metadata: Metadata = { title: "รายการรอให้รหัส" };

export default function ChartsPage(props: PageProps<"/charts">) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="grid w-full content-start gap-6 p-4 sm:p-8">
        <header className="flex items-center gap-4">
          <IconTile icon={BedDouble} tone="indigo" size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">รายการรอให้รหัส</h1>
            <p className="text-sm text-slate-500">
              ชาร์ทที่นำเข้าจาก HIS แล้ว เปิดทีละเคส: Pre-coding + Query ถามแพทย์ → Complete coding → DRG / AdjRW และอนุมัติ
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

// Every case still to do sits in exactly one step, by how far it got: a fresh complete coding waits for approval (3),
// else a pre-coded chart waits for the physician's answers (1) or for Complete coding (2), else it waits for the
// pre-coding (1). A draft older than the HIS data needs Complete coding again (2), and an approval the HIS data changed
// after needs review again (3). "todo" (all steps) is the default view.
const freshDraft = (r: ChartRow) => hasDraft(r) && !draftStale(r);
const before = (r: ChartRow) => isPending(r) && !freshDraft(r);
const VIEWS = {
  todo: { label: "รอทำทั้งหมด", step: 0, match: isPending, empty: "ไม่มีเคสรอทำ ทุกชาร์ทที่นำเข้าอนุมัติรหัสจากข้อมูลล่าสุดแล้ว" },
  noprecode: { label: "ยังไม่ Pre-coding", step: 1, match: (r: ChartRow) => before(r) && !r.precode, empty: "ไม่มีเคสที่รอ Pre-coding" },
  query: { label: "รอคำตอบ Query", step: 1, match: (r: ChartRow) => before(r) && !!r.precode && openQueries(r) > 0, empty: "ไม่มีเคสที่รอแพทย์ตอบ Query" },
  sum: { label: "รอ Complete coding", step: 2, match: (r: ChartRow) => before(r) && !!r.precode && !openQueries(r), empty: "ไม่มีเคสที่รอ Complete coding" },
  review: { label: "รออนุมัติ", step: 3, match: (r: ChartRow) => isPending(r) && freshDraft(r), empty: "ไม่มีร่างที่รออนุมัติ" },
  done: { label: "อนุมัติแล้ว", step: 0, match: (r: ChartRow) => !isPending(r), empty: "ยังไม่มีเคสที่อนุมัติรหัส" },
  all: { label: "ทั้งหมด", step: 0, match: () => true, empty: "" },
} as const;
type View = keyof typeof VIEWS;
const STEP_MARK = ["", "①", "②", "③"];

async function PatientList({ searchParams }: Pick<PageProps<"/charts">, "searchParams">) {
  await connection();
  const raw = (await searchParams).view;
  const view: View = typeof raw === "string" && raw in VIEWS ? (raw as View) : "todo";
  const rows = await chartRows();
  if (!rows.length)
    return (
      <p className="rounded-xl bg-amber-50 p-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        ยังไม่มีชาร์ทที่นำเข้า ไปที่ <Link href="/discharges" className="font-medium underline">รายการผู้ป่วยใน HIS</Link> แล้วกด &quot;นำเข้า&quot;
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
          const blocking = step ? inView.filter((r) => r.precode?.alerts.some((a) => a.level === "stop")).length : 0;
          const current = v === view;
          return (
            <span key={v} className="contents">
              {(v === "noprecode" || v === "all") && <span aria-hidden className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" />}
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
