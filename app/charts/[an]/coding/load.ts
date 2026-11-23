// What the three pages of one case (query, coding, drg) show: the patient, the chart notes and one AI result with its
// decisions. kind "precode" = step 1 (ward_precode), "dcsum" = step 2 (ward_draft). Server only.
import { notFound } from "next/navigation";
import { staffWords } from "@/lib/agent.ts";
import { finalOf, reviewsOf, versionsOf, type AgentKind } from "@/lib/charts.ts";
import { db } from "@/lib/db.ts";
import { withName } from "@/lib/pii.ts";
import { hisLines, type Draft, type HisDx, type Note, type Patient } from "@/lib/ward.ts";

const LATEST = {
  precode: "select result draft, version from ward_precode where an = $1",
  dcsum: "select draft, version from ward_draft where an = $1",
} satisfies Record<AgentKind, string>;

const EMPTY = {
  precode: ["ยังไม่มี Pre-coding + Query จาก AI", "Pre-coding with AI"],
  dcsum: ["ยังไม่มีร่าง Complete coding จาก AI", "Complete with AI"],
} satisfies Record<AgentKind, [string, string]>;

export async function loadCase(an: string, kind: AgentKind, v: unknown) {
  const row = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!row) notFound();
  const patient = withName(row) as Patient;
  const notes = (await db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [an])).rows;
  // The latest result, or an older version from the history (?v=<id>, read only). None until the AI made one.
  const current = (await db.query<{ draft: Draft; version: number | null }>(LATEST[kind], [an])).rows[0];
  const id = Number(v);
  const old = Number.isInteger(id) && id !== current?.version
    ? (await db.query<{ result: Draft }>("select result from ward_history where id = $1 and an = $2 and kind = $3", [id, an, kind])).rows[0]?.result
    : undefined;
  const version = old ? id : current?.version ?? null;
  const saved = old ?? current?.draft;
  const [reviews, final, versions] = await Promise.all([reviewsOf(version), finalOf(an), versionsOf(an, kind)]);
  // No AI result yet: what the physician entered on the HIS discharge summary, so the case does not look empty.
  const his = saved ? [] : hisLines((await db.query<HisDx>(
    "select type, text, icd10 from ward_dx_his where an = $1 and form = 'DC Summary' order by seq", [an])).rows);
  const [none, button] = EMPTY[kind];
  const draft: Draft = saved ? staffWords(saved) : {
    lines: his, summary: ["", "", "", "", ""], notCoded: [], variants: [],
    alerts: [{ level: "suggest", text: his.length
      ? `${none} — ที่แสดงคือการวินิจฉัยที่แพทย์ลงใน HIS ยังไม่ได้ตรวจ กด "${button}" ด้านบน ใช้เวลาประมาณ 1–3 นาที`
      : `${none} กด "${button}" ด้านบน ใช้เวลาประมาณ 1–3 นาที` }],
  };

  // Official names for every code the screen shows, including codes a variant would add.
  const codes = [
    ...draft.lines.map((l) => l.code),
    ...draft.notCoded.map((n) => n.code),
    ...draft.variants.flatMap((x) => [...(x.change.add ?? []), ...Object.values(x.change.swap ?? {})]),
  ].map((c) => c.replace(/\./g, ""));
  const { rows } = await db.query<{ code: string; desc: string }>(
    `select code, "desc" from icd10_desc where code = any($1) union all select code, "desc" from icd9_desc where code = any($1)`,
    [codes],
  );
  const names = Object.fromEntries(rows.map((r) => [r.code, r.desc]));

  return { patient, notes, draft, names, version, latest: !old, reviews, final, versions };
}
