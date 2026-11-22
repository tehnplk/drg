// Ward demo: inpatients, their chart notes and the AI discharge-summary draft (seeded by scripts/seed-ward.ts).
// Types and pure helpers only, so client components can import this without pulling in PGlite.

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

// Tables behind the ward screens; filled by scripts/seed-ward.ts (demo) and scripts/import-his.ts (real HIS).
export const WARD_SCHEMA = `
  create table if not exists ward_patient (
    an text primary key, hn text not null, name text not null, sex text not null, age integer not null,
    age_day integer not null, weight double precision not null, ward text not null, bed text not null,
    insurance text not null, attending text not null, working_dx text not null, admit_at text not null,
    discharge_at text not null, leave_days integer not null, discharge_status text not null,
    discharge_type text not null, transfer_to text not null);
  create table if not exists ward_note (
    an text not null references ward_patient, seq integer not null, at text not null,
    kind text not null, author text not null, body text not null, primary key (an, seq));
  create table if not exists ward_draft (an text primary key references ward_patient, draft jsonb not null);`;

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

export type Note = { at: string; kind: "admission" | "progress" | "procedure" | "nursing" | "lab"; author: string; body: string };

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

// "2026-11-05 21:40" -> "5 พ.ย. 69 21:40"
export const fmtDate = (s: string) =>
  new Date(s.replace(" ", "T") + ":00+07:00").toLocaleString("th-TH", {
    day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok",
  });

export const ageText = (p: Patient) => (p.age ? `${p.age} ปี` : `${p.age_day} วัน`);

// TDRG LOS: calendar days between admission and discharge, minus leave days.
export function losDays(p: Patient) {
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
