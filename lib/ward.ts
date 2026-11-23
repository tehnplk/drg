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

// A diagnosis the physician entered on the HIS discharge summary (ward_dx_his, form "DC Summary").
export type HisDx = { type: string; text: string; icd10: string };

const bare = (c: string) => c.replace(/\+.*$/, "").replace(/\./g, "").toUpperCase(); // E11.9 -> E119
const dotted = (c: string) => (c.length > 3 ? `${c.slice(0, 3)}.${c.slice(3)}` : c); // E119 -> E11.9

// The coder's rule (Standard Coding Guidelines; coders query, they do not rewrite): draft A keeps the physician's PDx,
// and a diagnosis the physician did not enter is a query, not part of A. Where the AI broke this, A is put back and
// the AI's proposal becomes a variant with a question. Procedures and external causes are the coder's own work and stay.
// A diagnosis counts as the physician's when its ICD-10 category matches one they entered (the code may be more
// specific). No HIS discharge summary yet: the draft is the proposal for the physician, nothing to follow.
export function followPhysician(d: Draft, his: HisDx[]): Draft {
  const coded = his.filter((h) => h.icd10);
  const hisPdx = coded.find((h) => /principal/i.test(h.type));
  if (!hisPdx) return d;
  const pdxCode = bare(hisPdx.icd10);
  const theirs = new Set(coded.map((h) => bare(h.icd10).slice(0, 3)));
  const isTheirs = (l: Line) => theirs.has(bare(l.code).slice(0, 3));
  const role = (l: Line) => LINE_ROLES[l.type];

  let lines = d.lines.map((l) => ({ ...l }));
  let variants = d.variants.map((v) => ({ ...v, change: { ...v.change } }));
  const alerts = [...d.alerts];
  const added: Variant[] = [];
  // A question the AI already wrote for this change, taken over with its variant (the variant itself is replaced).
  const takeQuestion = (match: (v: Variant) => boolean) => {
    const v = variants.find(match);
    variants = variants.filter((x) => x !== v);
    return v?.question;
  };

  const aiPdx = lines.find((l) => role(l) === "pdx");
  if (!aiPdx || bare(aiPdx.code) !== pdxCode) {
    let mine = lines.find((l) => bare(l.code) === pdxCode);
    if (!mine) lines.unshift(mine = { type: "Principal diagnosis", text: hisPdx.text, code: dotted(pdxCode), status: "ambiguous",
      evidence: "แพทย์ลงเป็นการวินิจฉัยหลักในใบสรุปการจำหน่าย (HIS) — AI ไม่ได้ตรวจรหัสนี้กับชาร์ท ต้องตรวจก่อนยืนยัน" });
    mine.type = "Principal diagnosis";
    if (aiPdx) {
      const both = (v: Variant) => !!v.change.swap && [aiPdx.code, mine!.code].every((c) => Object.keys(v.change.swap!).includes(c));
      const question = takeQuestion(both) ?? `แพทย์ลงการวินิจฉัยหลักเป็น "${hisPdx.text}" ขณะที่ชาร์ทอาจสนับสนุน "${aiPdx.text}" เป็นเหตุผลหลักของการรับไว้ — ภาวะใดเป็นเหตุผลหลักของการนอนโรงพยาบาลครั้งนี้ (${hisPdx.text} / ${aiPdx.text} / อื่น ๆ / ตัดสินไม่ได้จากชาร์ท)`;
      if (isTheirs(aiPdx)) {
        aiPdx.type = "Comorbidity";
        added.push({ label: `PDx เป็น ${aiPdx.text} (${aiPdx.code}) ตามที่ AI เสนอ`, change: { swap: { [mine.code]: aiPdx.code, [aiPdx.code]: mine.code } }, question, to: "แพทย์ผู้รักษา" });
      } else {
        lines = lines.filter((l) => l !== aiPdx);
        added.push({ label: `PDx เป็น ${aiPdx.text} (${aiPdx.code}) ตามที่ AI เสนอ`, change: { swap: { [mine.code]: aiPdx.code } }, question, to: "แพทย์ผู้รักษา" });
      }
      alerts.push({ level: "warn", text: `AI เสนอการวินิจฉัยหลักเป็น ${aiPdx.code} ต่างจากที่แพทย์ลงไว้ (${mine.code}) — ร่าง A คงตามแพทย์ เพราะ coder ไม่แก้การวินิจฉัยของแพทย์ ข้อเสนอของ AI อยู่ในตัวเลือกพร้อมคำถามถึงแพทย์` });
    }
  }

  // Secondary diagnoses the physician did not enter leave A; variants that changed them now add them instead.
  const out = lines.filter((l) => role(l) === "sdx" && !isTheirs(l));
  lines = lines.filter((l) => !out.includes(l));
  const gone = new Set(out.map((l) => l.code));
  variants = variants.flatMap((v) => {
    const swap = Object.entries(v.change.swap ?? {});
    const add = [...(v.change.add ?? []), ...swap.filter(([from]) => gone.has(from)).map(([, to]) => to)];
    const remove = (v.change.remove ?? []).filter((c) => !gone.has(c));
    const kept = swap.filter(([from]) => !gone.has(from));
    const change = { ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}), ...(kept.length ? { swap: Object.fromEntries(kept) } : {}) };
    return Object.keys(change).length || v.question ? [{ ...v, change }] : [];
  });
  for (const l of out) {
    const question = takeQuestion((v) => !!v.change.add?.includes(l.code) && Object.keys(v.change).length === 1)
      ?? `ชาร์ทมีข้อมูลเรื่อง "${l.text}" (${l.evidence}) แต่ใบสรุปการจำหน่ายของแพทย์ไม่ได้ลงการวินิจฉัยนี้ — จะลงเป็นการวินิจฉัยหรือไม่ (ลง / ไม่ลง / เป็นภาวะอื่น / ตัดสินไม่ได้จากชาร์ท)`;
    added.push({ label: `เพิ่ม ${l.text} (${l.code})`, change: { add: [l.code] }, question, to: "แพทย์ผู้รักษา" });
  }
  if (out.length) alerts.push({ level: "warn", text: `AI พบการวินิจฉัยที่แพทย์ไม่ได้ลงในใบสรุป (${out.map((l) => l.code).join(", ")}) — ไม่ใส่ในร่าง A ย้ายไปเป็นตัวเลือกพร้อมคำถามถึงแพทย์` });

  lines = [...lines.filter((l) => role(l) === "pdx"), ...lines.filter((l) => role(l) !== "pdx")]; // PDx first
  return { ...d, lines, alerts, variants: [...added, ...variants] };
}

export const ageText =(p: Pick<Patient, "age" | "age_day">) => (p.age ? `${p.age} ปี` : `${p.age_day} วัน`);

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
