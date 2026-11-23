import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseHeader } from "@/components/case-header.tsx";
import { staffWords } from "@/lib/agent.ts";
import { db } from "@/lib/db.ts";
import { withName } from "@/lib/pii.ts";
import type { Draft, Note, Patient } from "@/lib/ward.ts";
import Summary from "./summary.tsx";

export const metadata: Metadata = { title: "D/C Summary และ DRG" };

export default function DischargeSummaryPage(props: PageProps<"/charts/[an]/discharge-summary">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">กำลังโหลดชาร์ทและร่าง D/C Summary...</p>}>
      <Chart params={props.params} />
    </Suspense>
  );
}

async function Chart({ params }: Pick<PageProps<"/charts/[an]/discharge-summary">, "params">) {
  await connection();
  const { an } = await params;
  const row = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!row) notFound();
  const patient = withName(row) as Patient;
  const notes = (await db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [an])).rows;
  // Charts imported from the HIS have no draft until one is written for them.
  const saved = (await db.query<{ draft: Draft }>("select draft from ward_draft where an = $1", [an])).rows[0]?.draft;
  const draft: Draft = saved ? staffWords(saved) : {
    lines: [], summary: ["", "", "", "", ""], notCoded: [], variants: [],
    alerts: [{ level: "suggest", text: "ยังไม่มีร่าง D/C Summary ของเคสนี้ กด \"Sum with AI\" ที่ขั้นที่ 2 ด้านบน ใช้เวลาประมาณ 1–3 นาที" }],
  };

  // Official names for every code the screen shows, including codes a variant would add.
  const codes = [
    ...draft.lines.map((l) => l.code),
    ...draft.notCoded.map((n) => n.code),
    ...draft.variants.flatMap((v) => [...(v.change.add ?? []), ...Object.values(v.change.swap ?? {})]),
  ].map((c) => c.replace(/\./g, ""));
  const { rows } = await db.query<{ code: string; desc: string }>(
    `select code, "desc" from icd10_desc where code = any($1) union all select code, "desc" from icd9_desc where code = any($1)`,
    [codes],
  );
  const names = Object.fromEntries(rows.map((r) => [r.code, r.desc]));

  return <Summary patient={patient} notes={notes} draft={draft} names={names} header={<CaseHeader an={an} active="dcsum" />} />;
}
