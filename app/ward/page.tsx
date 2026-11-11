import { ArrowRight, BedDouble, CalendarDays, Lightbulb, OctagonX, TriangleAlert, Users, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/lib/db.ts";
import { ageText, fmtDate, losDays, type Patient } from "@/lib/ward.ts";
import { Chip, IconTile, PatientAvatar, card, wardTone, type Tone } from "./ui.tsx";

export const metadata: Metadata = { title: "ผู้ป่วยในรอจำหน่าย" };

export default function WardPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-8">
        <header className="flex items-center gap-4">
          <IconTile icon={BedDouble} tone="indigo" size="lg" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">ผู้ป่วยในรอจำหน่าย</h1>
            <p className="text-sm text-slate-500">
              ข้อมูลสมมติสำหรับสาธิต กด Discharge เพื่อเปิดร่าง discharge summary ที่ AI เตรียมไว้ ตรวจรหัส และดูผลต่อ DRG / AdjRW
            </p>
          </div>
        </header>
        <Suspense fallback={<p className="text-slate-500">กำลังโหลดรายชื่อผู้ป่วย...</p>}>
          <PatientList />
        </Suspense>
      </main>
    </div>
  );
}

type Row = Patient & { stops: number; warns: number; suggests: number };

const ALERT_PILLS: { key: "stops" | "warns" | "suggests"; icon: LucideIcon; tone: Tone; label: string }[] = [
  { key: "stops", icon: OctagonX, tone: "rose", label: "Hard stop" },
  { key: "warns", icon: TriangleAlert, tone: "amber", label: "Warning" },
  { key: "suggests", icon: Lightbulb, tone: "sky", label: "Suggestion" },
];

async function PatientList() {
  await connection();
  const { rows } = await db.query<Row>(`
    select p.*,
      (select count(*)::int from jsonb_array_elements(d.draft->'alerts') a where a->>'level' = 'stop') as stops,
      (select count(*)::int from jsonb_array_elements(d.draft->'alerts') a where a->>'level' = 'warn') as warns,
      (select count(*)::int from jsonb_array_elements(d.draft->'alerts') a where a->>'level' = 'suggest') as suggests
    from ward_patient p left join ward_draft d using (an)
    order by p.ward, p.bed`);
  if (!rows.length) return <p className="rounded-xl bg-amber-50 p-4 text-amber-800">ยังไม่มีข้อมูล รัน <code>npm run seed-ward</code> ก่อน</p>;

  const stats: [string, number, LucideIcon, Tone][] = [
    ["ผู้ป่วยรอจำหน่าย", rows.length, Users, "indigo"],
    ...ALERT_PILLS.map(({ key, icon, tone, label }) => [`มี ${label}`, rows.filter((r) => r[key] > 0).length, icon, tone] as [string, number, LucideIcon, Tone]),
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, n, icon, tone]) => (
          <div key={label} className={`flex items-center gap-3 p-4 ${card}`}>
            <IconTile icon={icon} tone={tone} size="lg" />
            <div>
              <div className="text-2xl font-bold text-slate-900 dark:text-slate-50">{n}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={`overflow-x-auto ${card}`}>
        <table className="w-full min-w-[60rem] text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50">
            <tr>
              {["ผู้ป่วย", "หอผู้ป่วย", "รับไว้ / LOS", "การวินิจฉัยระหว่างรักษา", "ข้อแนะนำจาก AI", ""].map((h) => (
                <th key={h} className="px-4 py-3 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((p) => (
              <tr key={p.an} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <PatientAvatar p={p} />
                    <div>
                      <div className="font-medium whitespace-nowrap text-slate-900 dark:text-slate-100">{p.name}</div>
                      <div className="text-xs whitespace-nowrap text-slate-500">
                        {p.sex === "1" ? "ชาย" : "หญิง"} · {ageText(p)} · <span className="font-mono">AN {p.an}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <Chip tone={wardTone(p.ward)} icon={BedDouble}>{p.ward}</Chip>
                  <div className="mt-1 text-xs text-slate-500">เตียง {p.bed}</div>
                </td>
                <td className="px-4 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300">
                    <CalendarDays className="size-4 text-slate-400" />{fmtDate(p.admit_at)}
                  </div>
                  <div className="mt-1"><Chip tone="slate">{losDays(p)} วัน</Chip></div>
                </td>
                <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{p.working_dx}</td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-1">
                    {ALERT_PILLS.filter(({ key }) => p[key] > 0).map(({ key, icon, tone, label }) => (
                      <Chip key={key} tone={tone} icon={icon}>{p[key]} {label}</Chip>
                    ))}
                    {p.stops + p.warns + p.suggests === 0 && <Chip tone="emerald">ไม่มี</Chip>}
                  </div>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/ward/${p.an}`}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 font-medium whitespace-nowrap text-white hover:bg-indigo-700"
                  >
                    Discharge <ArrowRight className="size-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
