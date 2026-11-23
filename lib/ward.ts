// Ward demo: inpatients, their chart notes and the AI discharge-summary draft (seeded by scripts/seed-ward.ts).
// Types and pure helpers only, so client components can import this without pulling in the database driver.

export type Patient = {
  an: string;
  hn: string;
  name: string;
  sex: "1" | "2";
  age: number;
  age_day: number;
  weight: number; // kg at admission; required under 28 days old
  ward: string;
  bed: string;
  insurance: string;
  attending: string;
  working_dx: string;
  admit_at: string; // "YYYY-MM-DD HH:MM", Asia/Bangkok
  discharge_at: string; // planned discharge
  leave_days: number;
  discharge_status: string;
  discharge_type: DischargeType;
  transfer_to: string; // "" unless discharge_type is 4
};

// Tables behind the ward screens and the agents; filled by scripts/seed-ward.ts (demo) and lib/his.ts (real HIS).
// Raw tables (patient, note and the ward_* clinical tables) are replaced on every sync; draft and audit are the
// agents' work and survive it. Idempotent, so it also upgrades a database made by an older version.
export const WARD_SCHEMA = `
  create table if not exists ward_patient (
    an text primary key, hn text not null, name text not null, sex text not null, age integer not null,
    age_day integer not null, weight double precision not null, ward text not null, bed text not null,
    insurance text not null, attending text not null, working_dx text not null, admit_at text not null,
    discharge_at text not null, leave_days integer not null, discharge_status text not null,
    discharge_type text not null, transfer_to text not null);
  -- AES-256-GCM (lib/pii.ts), null for demo patients; ward_patient.name never holds the patient's name
  alter table ward_patient add column if not exists fname_enc text;
  alter table ward_patient add column if not exists lname_enc text;
  alter table ward_patient add column if not exists cid_enc text;
  alter table ward_patient add column if not exists phone_enc text;
  create table if not exists ward_note (
    an text not null references ward_patient on delete cascade, seq integer not null, at text not null,
    kind text not null, author text not null, body text not null, primary key (an, seq));
  create table if not exists ward_lab (
    an text not null references ward_patient on delete cascade, seq integer not null, at text not null,
    test text not null, result text not null, unit text not null, ref text not null,
    flag text not null, -- "H", "L", "image" (result only in a picture) or ""
    note text not null, primary key (an, seq));
  alter table ward_lab add column if not exists order_no text not null default ''; -- HM lab_order_number
  alter table ward_lab add column if not exists item text not null default ''; -- HM itemname, e.g. Electrolytes
  create table if not exists ward_med (
    an text not null references ward_patient on delete cascade, seq integer not null, at text not null,
    order_type text not null, -- "Continue" or "One day"
    status text not null, item_type text not null, item text not null, generic text not null,
    dose text not null, unit text not null, route text not null, usage text not null, primary key (an, seq));
  create table if not exists ward_vital (
    an text not null references ward_patient on delete cascade, seq integer not null, at text not null,
    temp real, pr real, sbp real, dbp real, rr real, map real, spo2 real, gcs text, primary key (an, seq));
  create table if not exists ward_io (
    an text not null references ward_patient on delete cascade, day text not null,
    intake real not null, output real not null, primary key (an, day));
  create table if not exists ward_followup (
    an text not null references ward_patient on delete cascade, seq integer not null, at text not null,
    clinic text not null, detail text not null, primary key (an, seq));
  create table if not exists ward_bed (
    an text not null references ward_patient on delete cascade, seq integer not null, ward text not null,
    bed text not null, in_at text not null, out_at text not null, primary key (an, seq));
  create table if not exists ward_dx_his (
    an text not null references ward_patient on delete cascade, seq integer not null, form text not null,
    type text not null, text text not null, icd10 text not null, primary key (an, seq));
  create table if not exists ward_sync (
    an text primary key references ward_patient on delete cascade,
    synced_at text not null, -- "YYYY-MM-DD HH:MM" Asia/Bangkok
    hash text not null, -- fingerprint of everything extracted; unchanged HIS content keeps it
    counts jsonb not null);
  create table if not exists ward_draft (an text primary key references ward_patient on delete cascade, draft jsonb not null);
  alter table ward_draft add column if not exists at text;
  alter table ward_draft add column if not exists model text; -- null: seeded demo draft
  alter table ward_draft add column if not exists hash text; -- ward_sync.hash the draft was made from
  create table if not exists ward_audit (
    an text primary key references ward_patient on delete cascade, status text not null, at text not null, report text not null);
  alter table ward_audit add column if not exists hash text; -- ward_sync.hash the audit was made from
  alter table ward_audit add column if not exists result jsonb; -- AuditResult (lib/agent.ts) when an agent made it
  alter table ward_audit add column if not exists model text;
  -- One row per agent run: what it did (each skill script it ran) and what it cost, shown next to its result.
  create table if not exists agent_run (
    id serial primary key, an text not null references ward_patient on delete cascade,
    kind text not null, -- "audit" | "dcsum"
    status text not null, -- "running" | "done" | "error"
    model text not null, started_at text not null, finished_at text, steps integer, usage jsonb, trace jsonb, error text);
  alter table agent_run add column if not exists progress text; -- what the run is doing now, shown while it runs
  create index if not exists agent_run_an on agent_run (an, kind, id desc);`;

// Raw tables a sync replaces, children of ward_patient.
export const RAW_TABLES = ["ward_note", "ward_lab", "ward_med", "ward_vital", "ward_io", "ward_followup", "ward_bed", "ward_dx_his"] as const;

// Pre-discharge chart audit readiness, as the chart-audit skill decides it (saved by its save-audit.ts).
export const AUDIT_STATUS = {
  blocking: "ติดเงื่อนไขบังคับ",
  gaps: "ควรปิดช่องโหว่ก่อนสรุป",
  ready: "พร้อมสรุปการจำหน่าย",
} as const;
export type AuditStatus = keyof typeof AUDIT_STATUS;

export const DISCHARGE_TYPES = {
  "1": "With approval",
  "2": "Against advice",
  "3": "Escape",
  "4": "By transfer",
  "5": "Other",
  "8": "Dead autopsy",
  "9": "Dead no autopsy",
} as const;
export type DischargeType = keyof typeof DISCHARGE_TYPES;

export type Note = { at: string; kind: "admission" | "progress" | "consult" | "procedure" | "nursing" | "lab"; author: string; body: string };

export type Role = "pdx" | "sdx" | "ext" | "proc";
export const LINE_ROLES = {
  "Principal diagnosis": "pdx",
  Comorbidity: "sdx",
  Complication: "sdx",
  "Other diagnosis": "sdx",
  "External cause": "ext",
  "OR procedure": "proc",
  "Non-OR procedure": "proc",
} as const satisfies Record<string, Role>;
export type LineType = keyof typeof LINE_ROLES;

export type Status = "exact" | "less" | "more" | "partial" | "mismatch" | "ambiguous";

export type Line = {
  type: LineType;
  text: string; // the physician's wording
  code: string;
  status: Status;
  evidence: string;
  when?: string; // procedures: date, or start–end for OR procedures
  name?: string; // official code name, filled from icd10_desc / icd9_desc when read
};

export type Change = { add?: string[]; remove?: string[]; swap?: Record<string, string> };

export type Variant = {
  label: string;
  change: Change;
  question?: string; // set: a query to the physician, answered on screen; unset: a comparison only
  to?: string;
};

export type Draft = {
  lines: Line[];
  summary: [string, string, string, string, string]; // MRA criterion 6, items 1–5
  notCoded: { finding: string; code: string; reason: string }[];
  alerts: { level: "stop" | "warn" | "suggest"; text: string }[];
  variants: Variant[];
};

export const BAHT_PER_ADJRW = 8350; // NHSO UC in-zone IP rate, fiscal 2569

export const MAX_SDX = 12; // the grouper takes no more; the API rejects the whole batch above it

export type Coded ={ code: string; role: Role };

// Codes a variant adds take their role from the code itself: ICD-9-CM is numeric, external causes are V–Y.
const roleOf = (code: string): Role => (/^\d/.test(code) ? "proc" : /^[V-Y]/.test(code) ? "ext" : "sdx");

export function applyChange(coded: Coded[], { add = [], remove = [], swap = {} }: Change): Coded[] {
  return [
    ...coded.filter((c) => !remove.includes(c.code)).map((c) => ({ ...c, code: swap[c.code] ?? c.code })),
    ...add.map((code) => ({ code, role: roleOf(code) })),
  ];
}

export const ageText = (p: Pick<Patient, "age" | "age_day">) => (p.age ? `${p.age} ปี` : `${p.age_day} วัน`);

// TDRG LOS: calendar days between admission and discharge, minus leave days.
export function losDays(p: Pick<Patient, "admit_at" | "discharge_at" | "leave_days">) {
  const day = (s: string) => Date.parse(s.slice(0, 10) + "T00:00:00Z") / 86400000;
  return day(p.discharge_at) - day(p.admit_at) - p.leave_days;
}

// Body of one /api/drg/calculate case. External causes never go to the grouper (TGrp drops V–Y codes).
export function toCase(p: Patient, coded: Coded[], an: string) {
  const of = (r: Role) => coded.filter((c) => c.role === r).map((c) => c.code);
  return {
    an,
    sex: p.sex,
    age: p.age,
    age_day: p.age_day,
    weight: p.weight,
    los_day: losDays(p),
    discht: p.discharge_type,
    pdx: of("pdx")[0] ?? "",
    sdx: of("sdx").slice(0, MAX_SDX),
    proc: of("proc"),
  };
}
