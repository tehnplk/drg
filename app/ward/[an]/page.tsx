import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { db } from "@/lib/db.ts";
import type { Draft, Note, Patient } from "@/lib/ward.ts";
import Summary from "./summary.tsx";

export const metadata: Metadata = { title: "Discharge Summary" };

export default function DischargePage(props: PageProps<"/ward/[an]">) {
  return (
    <Suspense fallback={<p className="p-8 text-zinc-500">AI กำลังเตรียมร่าง discharge summary...</p>}>
      <Chart params={props.params} />
    </Suspense>
  );
}

async function Chart({ params }: Pick<PageProps<"/ward/[an]">, "params">) {
  await connection();
  const { an } = await params;
  const patient = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!patient) notFound();
  const notes = (await db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [an])).rows;
  const { draft } = (await db.query<{ draft: Draft }>("select draft from ward_draft where an = $1", [an])).rows[0];

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

  return <Summary patient={patient} notes={notes} draft={draft} names={names} />;
}
