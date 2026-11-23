// Imported charts with where each one stands in the work (pre-coding + query, complete coding, approval, latest
// agent runs). Server only.
import { db } from "./db.ts";
import { withName } from "./pii.ts";
import { group, type Output } from "./tdrg/group.ts";
import { LINE_ROLES, WARD_SCHEMA, toCase, type Draft, type Patient, type Reviews } from "./ward.ts";

export type ChartRow = Patient & {
  pdx_text: string | null; // the physician's principal diagnosis in the HIS D/C summary
  synced_at: string | null; sync_hash: string | null;
  draft: Draft | null; draft_at: string | null; draft_hash: string | null; draft_model: string | null; draft_version: number | null;
  // step 1, Pre-coding + Query: the latest result and the review items already decided on it
  precode: Draft | null; precode_at: string | null; precode_hash: string | null; precode_version: number | null;
  precode_decided: string[] | null;
  // the approved coding (ward_final), null until someone approves
  final_at: string | null; final_hash: string | null; final_version: number | null; final_drg: string | null; final_adjrw: number | null;
};

export type Final = { version: number; coded: { code: string; role: string }[]; drg: string; rw: number; adjrw: number;
  physician: string; license: string; coder: string; by: string; at: string };
export type Version = { id: number; at: string; model: string | null };

// The two AI steps: 1 Pre-coding + Query, 2 Complete coding.
export type AgentKind = "precode" | "dcsum";
export type AgentRun = { an: string; kind: AgentKind; status: "running" | "done" | "error"; started_at: string; error: string | null; progress: string | null };

// Every imported chart, or only the given ANs; the name decrypted, newest discharge first.
export async function chartRows(ans?: string[]): Promise<ChartRow[]> {
  await db.exec(WARD_SCHEMA);
  const { rows } = await db.query<ChartRow>(
    `select p.*, s.synced_at, s.hash sync_hash,
       (select x.text from ward_dx_his x where x.an = p.an and x.form = 'DC Summary' and x.type = 'Principal Diagnosis'
        order by x.seq limit 1) pdx_text,
       d.draft, d.at draft_at, d.hash draft_hash, d.model draft_model, d.version draft_version,
       q.result precode, q.at precode_at, q.hash precode_hash, q.version precode_version,
       (select array_agg(r.item) from ward_review r where r.version = q.version) precode_decided,
       f.at final_at, f.hash final_hash, f.version final_version, f.drg final_drg, f.adjrw final_adjrw
     from ward_patient p left join ward_sync s using (an) left join ward_draft d using (an) left join ward_precode q using (an)
       left join ward_final f using (an)
     where $1::text[] is null or p.an = any($1)
     order by p.discharge_at desc, p.an`,
    [ans ?? null],
  );
  return rows.map((r) => withName(r) as ChartRow);
}

export async function latestRuns(ans: string[]): Promise<AgentRun[]> {
  // A run still "running" after 10 minutes died with the server (a restart mid-run): fail it so the screen stops
  // waiting and the button works again. A run that does finish later overwrites this with its real outcome.
  await db.query(
    `update agent_run set status = 'error', error = 'AI หยุดกลางทาง (เซิร์ฟเวอร์ถูกรีสตาร์ทระหว่างทำงาน) กดสั่งใหม่ได้'
     where an = any($1) and status = 'running' and started_at::timestamp at time zone 'Asia/Bangkok' < now() - interval '10 minutes'`,
    [ans],
  );
  return (await db.query<AgentRun>(
    "select distinct on (an, kind) an, kind, status, started_at, error, progress from agent_run where an = any($1) order by an, kind, id desc",
    [ans],
  )).rows;
}

// A draft made from older HIS data than the chart now holds; seeded demo drafts carry no hash and never go stale.
export const draftStale = (r: ChartRow) => !!r.draft_hash && !!r.sync_hash && r.draft_hash !== r.sync_hash;
export const precodeStale = (r: ChartRow) => !!r.precode_hash && !!r.sync_hash && r.precode_hash !== r.sync_hash;
// Queries in the pre-coding still waiting for the physician's answer (a variant with a question and no decision).
export const openQueries = (r: Pick<ChartRow, "precode" | "precode_decided">) =>
  r.precode?.variants.filter((v, i) => v.question && !r.precode_decided?.includes(`variant:${i}`)).length ?? 0;
export const hasDraft = (r: ChartRow) => !!r.draft?.lines.length;
export const approved = (r: ChartRow) => !!r.final_at;
// Approved, but the HIS content changed after it: the approval may no longer match the chart.
export const finalStale = (r: ChartRow) => approved(r) && !!r.final_hash && !!r.sync_hash && r.final_hash !== r.sync_hash;
// Still work to do: nobody approved the coding yet, or the chart changed after the approval.
export const isPending = (r: ChartRow) => !approved(r) || finalStale(r);

// Saved decisions on one AI version, by item.
export async function reviewsOf(version: number | null): Promise<Reviews> {
  if (version == null) return {};
  const { rows } = await db.query<{ item: string; decision: string; note: string | null; by: string; at: string }>(
    "select item, decision, note, by, at from ward_review where version = $1", [version]);
  return Object.fromEntries(rows.map(({ item, ...r }) => [item, r]));
}

// Every AI version of one kind for one chart, newest first.
export async function versionsOf(an: string, kind: AgentKind): Promise<Version[]> {
  return (await db.query<Version>("select id, at, model from ward_history where an = $1 and kind = $2 order by id desc", [an, kind])).rows;
}

export async function finalOf(an: string): Promise<Final | null> {
  return (await db.query<Final>(
    "select version, coded, drg, rw, adjrw, physician, license, coder, by, at from ward_final where an = $1", [an])).rows[0] ?? null;
}

// The step a chart should open on: 1 query until it is pre-coded, 2 coding until there is a draft, then 3 drg.
export const chartHref = (r: Pick<ChartRow, "an" | "precode" | "draft">) =>
  `/charts/${r.an}/${!r.precode ? "query" : !r.draft?.lines.length ? "coding" : "drg"}`;

// The DRG a list shows: the approved one once there is one, else the AI draft's (TypeScript grouper, local and instant).
export async function draftDrg(r: ChartRow): Promise<Pick<Output, "drg" | "adjrw"> | null> {
  if (r.final_drg && r.final_adjrw != null) return { drg: r.final_drg, adjrw: r.final_adjrw };
  if (!r.draft?.lines.length) return null;
  return group(toCase(r, r.draft.lines.map((x) => ({ code: x.code, role: LINE_ROLES[x.type] })), r.an)).catch(() => null);
}
