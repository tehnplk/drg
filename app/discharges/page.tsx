import { CalendarCheck, Search, WifiOff } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { ChartTable } from "@/components/chart-table.tsx";
import { BulkImport } from "@/components/import-button.tsx";
import { ThaiDatePicker } from "@/components/thai-date-picker.tsx";
import { IconTile, card } from "@/components/ui.tsx";
import Link from "next/link";
import { chartRows } from "@/lib/charts.ts";
import { MAX_DISCHARGED, dischargedBetween, type Discharged } from "@/lib/his.ts";
import { bangkokDate, formatThaiDate } from "@/lib/thai-date.ts";

export const metadata: Metadata = { title: "รายการผู้ป่วยใน HIS" };

export default function DischargesPage(props: PageProps<"/discharges">) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto grid w-full max-w-[96rem] gap-6 p-4 sm:p-8">
        <header className="flex items-center gap-4">
          <IconTile icon={CalendarCheck} tone="indigo" size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">รายการผู้ป่วยใน HIS</h1>
            <p className="text-sm text-slate-500">
              ผู้ป่วยในที่จำหน่ายในช่วงวันที่ ดึงสดจาก HIS นำเข้าชาร์ททีละคน หรือติ๊กเลือกหลายรายแล้วนำเข้าพร้อมกัน แล้วทำ Audit และ D/C Summary ด้วย AI
            </p>
          </div>
        </header>
        <Suspense fallback={<p className="text-slate-500">กำลังดึงรายชื่อจาก HIS...</p>}>
          <DischargedList searchParams={props.searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

async function DischargedList({ searchParams }: Pick<PageProps<"/discharges">, "searchParams">) {
  await connection();
  const sp = await searchParams;
  const today = bangkokDate(0);
  const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : today);
  const [from, to] = [day(sp.from), day(sp.to)].sort();

  const picker = (
    <Form action="/discharges" key={`${from}|${to}`} className={`flex flex-wrap items-center gap-3 p-4 ${card}`}>
      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">วันที่จำหน่าย</span>
      <ThaiDatePicker name="from" label="ตั้งแต่วันที่จำหน่าย" defaultValue={from} max={today} />
      <span className="text-sm text-slate-500">ถึง</span>
      <ThaiDatePicker name="to" label="ถึงวันที่จำหน่าย" defaultValue={to} max={today} />
      <button className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-indigo-700">
        <Search className="size-4" /> แสดงรายชื่อ
      </button>
    </Form>
  );

  let his: Discharged[];
  try {
    his = await dischargedBetween(from, to);
  } catch (e) {
    return (
      <>
        {picker}
        <p className="flex items-start gap-2 rounded-xl bg-rose-50 p-4 text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">
          <WifiOff className="mt-0.5 size-5 shrink-0" />
          <span>ดึงข้อมูลจาก HIS ไม่ได้ ตรวจว่าต่อ VPN อยู่ ({e instanceof Error ? e.message.split("\n")[0] : String(e)})</span>
        </p>
      </>
    );
  }

  const local = new Map((await chartRows(his.map((h) => h.an))).map((r) => [r.an, r]));

  return (
    <>
      {picker}
      <div className={`overflow-x-auto ${card}`}>
        <div className="flex flex-wrap items-baseline gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold text-slate-900 dark:text-slate-50">
            จำหน่าย{from === to ? `วันที่ ${formatThaiDate(from)}` : `ตั้งแต่ ${formatThaiDate(from)} ถึง ${formatThaiDate(to)}`}
          </h2>
          <span className="text-sm text-slate-500">
            ทั้งหมด {his.length} ราย · ยังไม่นำเข้า {his.length - local.size} ราย · นำเข้าแล้ว {local.size} ราย
            {local.size > 0 && <> (ทำงานต่อที่ <Link href="/charts" className="text-indigo-600 hover:underline dark:text-indigo-300">รายการผู้ป่วยรอทำ D/C Sum</Link>)</>}
          </span>
          {his.length === MAX_DISCHARGED && (
            <span className="text-sm text-amber-700 dark:text-amber-300">แสดงแค่ {MAX_DISCHARGED} รายแรก ให้แคบช่วงวันที่ลง</span>
          )}
          {his.length > local.size && <BulkImport />}
        </div>
        {his.length === 0
          ? <p className="p-6 text-slate-500">ไม่มีผู้ป่วยจำหน่ายในช่วงวันที่นี้</p>
          : <ChartTable items={his.map((h) => ({ ...h, local: local.get(h.an) }))} runs={[]} imported={false} />}
      </div>
    </>
  );
}
