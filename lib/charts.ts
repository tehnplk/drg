// Imported charts with where each one stands in the work (audit, discharge summary, latest agent runs). Server only.
import { db } from "./db.ts";
import { withName } from "./pii.ts";
import { group, type Output } from "./tdrg/group.ts";
import { LINE_ROLES, WARD_SCHEMA, toCase, type AuditStatus, type Draft, type Patient } from "./ward.ts";

export type ChartRow = Patient & {
  pdx_text: string | null; // the physician's principal diagnosis in the HIS D/C summary
  synced_at: string | null; sync_hash: string | null;
  draft: Draft | null; draft_at: string | null; draft_hash: string | null; draft_model: string | null;
  audit: AuditStatus | null; audit_at: string | null; audit_hash: string | null;
};

export type AgentRun = { an: string; kind: "audit" | "dcsum"; status: "running" | "done" | "error"; started_at: string; error: string | null; progress: string | null };

// Every imported chart, or only the given ANs; the name decrypted, newest discharge first.
export async function chartRows(ans?: string[]): Promise<ChartRow[]> {
  await db.exec(WARD_SCHEMA);
  const { rows } = await db.query<ChartRow>(
    `select p.*, s.synced_at, s.hash sync_hash,
       (select x.text from ward_dx_his x where x.an = p.an and x.form = 'DC Summary' and x.type = 'Principal Diagnosis'
        order by x.seq limit 1) pdx_text,
       d.draft, d.at draft_at, d.hash draft_hash, d.model draft_model, a.status audit, a.at audit_at, a.hash audit_hash
     from ward_patient p left join ward_sync s using (an) left join ward_draft d using (an) left join ward_audit a using (an)
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
export const auditStale = (r: ChartRow) => !!r.audit_hash && !!r.sync_hash && r.audit_hash !== r.sync_hash;
export const hasDraft = (r: ChartRow) => !!r.draft?.lines.length;
// Waiting for a discharge summary: no draft yet, or the draft was made from older HIS data than the chart holds now.
export const isPending = (r: ChartRow) => !hasDraft(r) || draftStale(r);

// The step a chart should open on: the audit until there is one, then the discharge summary.
export const chartHref = (r: Pick<ChartRow, "an" | "audit">) => `/charts/${r.an}/${r.audit ? "discharge-summary" : "audit"}`;

// ponytail: the TypeScript grouper, local and instant; the discharge-summary screen groups through had-api, so a rare case may differ
export async function draftDrg(r: ChartRow): Promise<Output | null> {
  if (!r.draft?.lines.length) return null;
  return group(toCase(r, r.draft.lines.map((x) => ({ code: x.code, role: LINE_ROLES[x.type] })), r.an)).catch(() => null);
}
