import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseHeader } from "@/components/case-header.tsx";
import { staffWords } from "@/lib/agent.ts";
import { finalOf, reviewsOf, versionsOf } from "@/lib/charts.ts";
import { db } from "@/lib/db.ts";
import { withName } from "@/lib/pii.ts";
import { hisLines, type Draft, type HisDx, type Note, type Patient } from "@/lib/ward.ts";
import Summary from "./summary.tsx";

export const metadata: Metadata = { title: "D/C Summary และ DRG" };

export default function DischargeSummaryPage(props: PageProps<"/charts/[an]/discharge-summary">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">กำลังโหลดชาร์ทและร่าง D/C Summary...</p>}>
      <Chart params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Chart({ params, searchParams }: Pick<PageProps<"/charts/[an]/discharge-summary">, "params" | "searchParams">) {
  await connection();
  const { an } = await params;
  const row = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!row) notFound();
  const patient = withName(row) as Patient;
  const notes = (await db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [an])).rows;
  // The latest draft, or an older version from the history (?v=<id>, read only). None until one is written.
  const current = (await db.query<{ draft: Draft; version: number | null }>("select draft, version from ward_draft where an = $1", [an])).rows[0];
  const v = Number((await searchParams).v);
  const old = Number.isInteger(v) && v !== current?.version
    ? (await db.query<{ result: Draft }>("select result from ward_history where id = $1 and an = $2 and kind = 'dcsum'", [v, an])).rows[0]?.result
    : undefined;
  const version = old ? v : current?.version ?? null;
  const saved = old ?? current?.draft;
  const [reviews, final, versions] = await Promise.all([reviewsOf(version), finalOf(an), versionsOf(an, "dcsum")]);
  const his = saved ? [] : hisLines((await db.query<HisDx>(
    "select type, text, icd10 from ward_dx_his where an = $1 and form = 'DC Summary' order by seq", [an])).rows);
  const draft: Draft = saved ? staffWords(saved) : {
    lines: his, summary: ["", "", "", "", ""], notCoded: [], variants: [],
    alerts: [{ level: "suggest", text: his.length
      ? "ยังไม่มีร่าง D/C Summary จาก AI — ที่แสดงคือการวินิจฉัยที่แพทย์ลงใน HIS ยังไม่ได้ตรวจ กด \"Sum with AI\" ด้านบนเพื่อตรวจและร่างให้ครบ ใช้เวลาประมาณ 1–3 นาที"
      : "ยังไม่มีร่าง D/C Summary ของเคสนี้ กด \"Sum with AI\" ด้านบน ใช้เวลาประมาณ 1–3 นาที" }],
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

  return (
    <Summary
      patient={patient} notes={notes} draft={draft} names={names} header={<CaseHeader an={an} active="dcsum" />}
      version={version} latest={!old} reviews={reviews} final={final} versions={versions}
    />
  );
}
