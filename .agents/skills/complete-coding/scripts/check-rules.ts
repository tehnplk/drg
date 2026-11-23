// Deterministic rule engine for Thai inpatient discharge summary review.
// Checks hard stops, TDRG structural limits, CC exclusions (ccex), all 18 NHSO AI-Audit (2567) rules,
// MRA abbreviation / OR-time checks, and known TS grouper gaps. Run from the project root.
//
// usage:
//   node .claude/skills/complete-coding/scripts/check-rules.ts '<case JSON>' | @case.json
//
// Input JSON fields:
//   pdx?: string
//   sdx?: string[]                   // comorbidities, complications, other diagnoses (do NOT include V-Y here)
//   external_cause?: string[]        // V00-Y99 external cause codes
//   proc?: string[]                  // ICD-9-CM codes (optional +<units><setting>)
//   sex?: "1" | "2" | string
//   age?: number                     // years
//   age_day?: number                 // days (for newborns < 28 days when age === 0)
//   weight?: number                  // kg (mandatory for newborns < 28 days)
//   los_day?: number
//   leave_day?: number
//   discht?: string                  // 1 approval, 2 against advice, 3 escape, 4 transfer, 5 other, 8-9 dead
//   transfer_to?: string             // destination hospital when discht === "4"
//   hospital_level?: string          // e.g. "F" (community hospital level F)
//   payer?: string                   // e.g. "UC", "SSS", "CSMBS"
//   dx_texts?: string[]              // physician diagnosis / procedure texts to check MRA #5 abbreviations
//   or_procs_missing_time?: string[] // OR procedures lacking start/end datetime (MRA #4)
import { readFileSync } from "node:fs";
import { db } from "../../../../lib/db.ts";

type AlertLevel = "hard_stop" | "warning" | "suggestion";
type Alert = {
  level: AlertLevel;
  rule: string;
  message: string;
  codes?: string[];
};

type CaseInput = {
  pdx?: string;
  sdx?: string[];
  external_cause?: string[];
  proc?: string[];
  sex?: string;
  age?: number;
  age_day?: number;
  weight?: number;
  los_day?: number;
  leave_day?: number;
  discht?: string;
  transfer_to?: string;
  hospital_level?: string;
  payer?: string;
  dx_texts?: string[];
  or_procs_missing_time?: string[];
};

type I10Row = {
  code: string;
  mdc: string;
  pdc: string | null;
  cc: boolean;
  maincc: string | null;
  accpdx: string;
  sex: string;
  agemin: number;
  agemax: number;
  ageduse: string;
  agedmin: number;
  trauma: string;
};

type DescRow = { code: string; desc: string; valid: number };
type ProcRow = { code: string; orp: string; sex: string; procgr: number; mmdc: string };

const norm = (c: string) => c.trim().toUpperCase().replace(/\./g, "");
const procBase = (c: string) => norm(c).split("+")[0];
const isExtCause = (c: string) => /^[VWXY]/.test(c);
const isInjuryOrPoisoning = (c: string) => /^[ST]/.test(c);
const hasAnyPrefix = (codes: Set<string>, prefixes: string[]) =>
  [...codes].filter((c) => prefixes.some((p) => c.startsWith(p)));
const hasAnyExact = (codes: Set<string>, targets: string[]) => targets.filter((t) => codes.has(t));

// Common abbreviations prohibited in Thai discharge summary diagnoses/procedures (MRA #5)
const MRA_ABBREV_PATTERN =
  /\b(HT|HTN|DM|T2DM|T1DM|CKD|AKI|ARF|ESRD|UGIB|LGIB|COPD|AMI|STEMI|NSTEMI|CHF|CAP|HAP|VAP|UTI|CA|CVA|DLP|AF|BPH|AGE|DKA|HHS|CHF|IHD|CAD|TB|HBV|HCV|HIV|ARDS|SIRS|MODS|DIC|DVT|PE|OSA|GERD|PUD|BPPV|TIA|ICH|SAH|SDH|EDH|R\/O|S\/P|F\/U)\b/;

const AMBIGUOUS_CODES: Record<string, string> = {
  I64: "Stroke, not specified as haemorrhage or infarction — ควรระบุ infarction (I63.-) หรือ haemorrhage (I61.-) ตามผล CT",
  T07: "Unspecified multiple injuries — ควรลงรหัสการบาดเจ็บแยกแต่ละตำแหน่ง",
  T141: "Open wound of unspecified body region — ควรระบุตำแหน่งอวัยวะ",
  D649: "Anaemia, unspecified — ควรยืนยันชนิดของ anemia จากแพทย์ (ถ้าไม่ได้ระบุอาจถูก audit)",
  E149: "Unspecified diabetes mellitus — ควรระบุชนิด (E10 Type 1 / E11 Type 2)",
};

const UPPER_GI_WITH_BLEED = [
  "K250", "K252", "K254", "K256",
  "K260", "K262", "K264", "K266",
  "K270", "K272", "K274", "K276",
  "K280", "K282", "K284", "K286",
  "K290", "K221", "K226", "I850",
];

// Codes commonly paired as dagger/asterisk where TGrp Appendix A1 swap may apply
const DAGGER_ASTERISK_HINT_PREFIXES = ["A17", "A18", "B20", "E102", "E103", "E104", "E112", "E113", "E114", "G01", "G02", "G05", "G07", "G63", "H28", "H36", "M01", "N08", "N16"];

function parseInput(): CaseInput {
  const arg = process.argv[2];
  const rawText = (!arg || arg === "-"
    ? readFileSync(0, "utf8")
    : arg.startsWith("@")
      ? readFileSync(arg.slice(1), "utf8")
      : arg
  ).replace(/^\uFEFF/, "");
  if (!rawText.trim()) throw new Error("pass a case JSON, @file.json, or pipe JSON to stdin (-)");
  const raw: unknown = JSON.parse(rawText);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("input must be a single JSON object");
  }
  return raw as CaseInput;
}

const input = parseInput();
const alerts: Alert[] = [];
const add = (level: AlertLevel, rule: string, message: string, codes?: string[]) =>
  alerts.push({ level, rule, message, ...(codes?.length ? { codes } : {}) });

const pdx = input.pdx ? norm(input.pdx) : "";
const sdxList = (input.sdx ?? []).map(norm).filter(Boolean);
const extList = (input.external_cause ?? []).map(norm).filter(Boolean);
const procRawList = (input.proc ?? []).map(norm).filter(Boolean);
const procList = procRawList.map(procBase);

const allDx = [pdx, ...sdxList].filter(Boolean);
const allDxSet = new Set(allDx);
const allIcd10 = [...new Set([...allDx, ...extList])];
const procSet = new Set(procList);

// Load metadata from the database for all referenced codes
const i10DescRows = allIcd10.length
  ? (await db.query<DescRow>(`select code, "desc", valid from icd10_desc where code = any($1)`, [allIcd10])).rows
  : [];
const i10DescMap = new Map(i10DescRows.map((r) => [r.code, r]));

const i10Rows = allIcd10.length
  ? (await db.query<I10Row>(
      `select code, mdc, pdc, cc, maincc, accpdx, sex, agemin, agemax, ageduse, agedmin, trauma from i10 where code = any($1)`,
      [allIcd10],
    )).rows
  : [];
const i10Map = new Map<string, I10Row[]>();
for (const r of i10Rows) {
  const arr = i10Map.get(r.code) ?? [];
  arr.push(r);
  i10Map.set(r.code, arr);
}

const uniqueProcBases = [...new Set(procList)];
const i9DescRows = uniqueProcBases.length
  ? (await db.query<DescRow>(`select code, "desc", valid from icd9_desc where code = any($1)`, [uniqueProcBases])).rows
  : [];
const i9DescMap = new Map(i9DescRows.map((r) => [r.code, r]));

const procRows = uniqueProcBases.length
  ? (await db.query<ProcRow>(`select code, orp, sex, procgr, mmdc from proc where code = any($1)`, [uniqueProcBases])).rows
  : [];
const procMap = new Map(procRows.map((r) => [r.code, r]));

// ── 1. Hard Stops (TDRG Edits & Mandatory MRA Fields) ──────────────────────────
const age = input.age;
const ageDay = input.age_day;
const isNewborn = age === 0 && typeof ageDay === "number" && ageDay >= 0 && ageDay < 28;
const sexCode = input.sex === "1" ? "M" : input.sex === "2" ? "F" : null;

if (typeof age === "number" && (age < 0 || age > 124)) {
  add("hard_stop", "TDRG-ERR-6", `อายุ ${age} ปีอยู่นอกช่วง 0–124 ปี (ได้ Error 6 / DRG 26539)`);
}

if (isNewborn && (typeof input.weight !== "number" || input.weight < 0.3)) {
  add(
    "hard_stop",
    "TDRG-ERR-10",
    "ทารกอายุน้อยกว่า 28 วันต้องระบุน้ำหนักแรกรับ (≥ 0.3 กก.) มิฉะนั้นได้ Error 10 / DRG 26509",
  );
}

if (!pdx) {
  add("hard_stop", "TDRG-ERR-1", "ไม่มี Principal Diagnosis (PDx) (ได้ Error 1 / DRG 26509)");
} else {
  const d = i10DescMap.get(pdx);
  const tRows = i10Map.get(pdx) ?? [];
  if (isExtCause(pdx)) {
    add("hard_stop", "TDRG-ERR-2", `PDx ${pdx} เป็นรหัส External cause (V–Y) ห้ามใช้เป็นโรคหลัก`, [pdx]);
  } else if (!d) {
    add("hard_stop", "TDRG-ERR-2", `ไม่พบรหัส PDx ${pdx} ในตาราง ICD-10-TM`, [pdx]);
  } else if (d.valid !== 1) {
    add("hard_stop", "TDRG-ERR-2", `PDx ${pdx} (${d.desc}) เป็นรหัสหัวข้อที่มีข้อย่อย (valid=0) ใช้ลงรหัสไม่ได้`, [pdx]);
  } else if (tRows.length === 0) {
    add("hard_stop", "TDRG-ERR-2", `PDx ${pdx} ไม่อยู่ในตาราง TGrp (i10)`, [pdx]);
  } else {
    if (tRows.every((r) => r.accpdx === "N")) {
      add(
        "hard_stop",
        "TDRG-ERR-3",
        `PDx ${pdx} (${d.desc}) เป็นรหัสที่ห้ามใช้เป็นโรคหลัก (Appendix A2, ได้ DRG 26519)`,
        [pdx],
      );
    }
    if (sexCode && !tRows.some((r) => r.sex === "B" || r.sex === sexCode)) {
      add("hard_stop", "TDRG-ERR-5", `PDx ${pdx} (${d.desc}) ขัดกับเพศผู้ป่วย (${sexCode})`, [pdx]);
    }
    if (typeof age === "number" && age >= 0 && age <= 124) {
      const ageOk = tRows.some((r) => {
        if (age < r.agemin || age > r.agemax) return false;
        if (r.ageduse === "Y" && age === 0 && typeof ageDay === "number" && ageDay < r.agedmin) return false;
        return true;
      });
      if (!ageOk) {
        add("hard_stop", "TDRG-ERR-4", `PDx ${pdx} (${d.desc}) ขัดกับอายุผู้ป่วย`, [pdx]);
      }
    }
  }
}

if (input.discht === "4" && !input.transfer_to?.trim()) {
  add("hard_stop", "MRA-8", "Discharge type เป็น Transfer (4) แต่ไม่ได้ระบุชื่อสถานพยาบาลปลายทาง");
}

// ── 2. Structural & TDRG Capacity Checks ───────────────────────────────────────
const extInSdx = sdxList.filter(isExtCause);
if (extInSdx.length > 0) {
  add(
    "warning",
    "TDRG-EXT-IN-SDX",
    `รหัส External cause (${extInSdx.join(", ")}) ถูกใส่ไว้ใน SDx — ควรแยกไว้ในช่อง External cause และไม่ส่งเข้า sdx[] ของ TGrp (มิฉะนั้นได้ Warning 1)`,
    extInSdx,
  );
}

const injuries = allDx.filter(isInjuryOrPoisoning);
const validExt = [...extList, ...extInSdx].filter((c) => isExtCause(c) && i10DescMap.get(c)?.valid === 1);
if (injuries.length > 0 && validExt.length === 0) {
  add(
    "warning",
    "MRA-2-EXT",
    `มีรหัสการบาดเจ็บ/พิษ (${injuries.join(", ")}) แต่ไม่มี External cause (V–Y) ที่ถูกต้อง`,
    injuries,
  );
}

const nonExtSdx = sdxList.filter((c) => !isExtCause(c));
if (nonExtSdx.length > 12) {
  add(
    "warning",
    "TDRG-SDX-LIMIT",
    `มี SDx ${nonExtSdx.length} รหัส เกินขีดจำกัด 12 รหัสของ Thai DRG — ต้องจัดลำดับให้รหัสที่มีผลต่อ DCL/DRG อยู่ใน 12 อันดับแรก`,
    nonExtSdx.slice(12),
  );
}
if (procRawList.length > 20) {
  add(
    "warning",
    "TDRG-PROC-LIMIT",
    `มีหัตถการ ${procRawList.length} รหัส เกินขีดจำกัด 20 รหัสของ Thai DRG — ต้องจัดลำดับหัตถการ OR/ที่มีผลต่อ DC ขึ้นก่อน`,
    procRawList.slice(20),
  );
}

// Validate each SDx, External cause, and Proc
const seenSdx = new Set<string>();
for (const c of nonExtSdx) {
  const d = i10DescMap.get(c);
  const tRows = i10Map.get(c) ?? [];
  if (c === pdx || seenSdx.has(c)) {
    add("warning", "TDRG-WARN-1", `SDx ${c} ซ้ำกับ PDx หรือซ้ำกันเอง (TGrp จะตัดออก)`, [c]);
  }
  seenSdx.add(c);
  if (!d) {
    add("hard_stop", "CODE-INVALID-SDX", `ไม่พบรหัส SDx ${c} ในตาราง ICD-10-TM`, [c]);
  } else if (d.valid !== 1) {
    add("hard_stop", "CODE-HEADER-SDX", `SDx ${c} (${d.desc}) เป็นรหัสหัวข้อที่มีข้อย่อย (valid=0)`, [c]);
  } else if (tRows.length === 0) {
    add("warning", "TDRG-WARN-1", `SDx ${c} ไม่อยู่ในตาราง TGrp (i10)`, [c]);
  } else {
    if (sexCode && !tRows.some((r) => r.sex === "B" || r.sex === sexCode)) {
      add("warning", "TDRG-WARN-4", `SDx ${c} (${d.desc}) ขัดกับเพศผู้ป่วย (TGrp จะตัดออก)`, [c]);
    }
  }
}

for (const c of extList) {
  const d = i10DescMap.get(c);
  if (!isExtCause(c)) {
    add("warning", "EXT-INVALID", `รหัสในช่อง External cause (${c}) ไม่ใช่หมวด V–Y`, [c]);
  } else if (!d || d.valid !== 1) {
    add("hard_stop", "EXT-INVALID", `รหัส External cause ${c} ไม่ถูกต้องหรือเป็นรหัสหัวข้อ`, [c]);
  }
}

const orProcs: string[] = [];
const seenProc = new Set<string>();
for (let i = 0; i < procRawList.length; i++) {
  const raw = procRawList[i];
  const base = procList[i];
  const d = i9DescMap.get(base);
  const p = procMap.get(base);
  if (seenProc.has(raw)) {
    add("warning", "TDRG-WARN-8", `หัตถการ ${raw} ซ้ำกัน (หากทำหลายครั้ง/ตำแหน่งให้ใช้ extension code เช่น ${base}+21)`, [raw]);
  }
  seenProc.add(raw);
  if (!d && !p) {
    add("hard_stop", "CODE-INVALID-PROC", `ไม่พบรหัสหัตถการ ${raw} ในตาราง ICD-9-CM / TGrp`, [raw]);
  } else if (d && d.valid !== 1) {
    add("hard_stop", "CODE-HEADER-PROC", `รหัสหัตถการ ${raw} (${d.desc}) เป็นรหัสหัวข้อที่มีข้อย่อย (valid=0)`, [raw]);
  } else if (p) {
    if (sexCode && p.sex !== "B" && p.sex !== sexCode) {
      add("warning", "TDRG-WARN-16", `หัตถการ ${raw} ขัดกับเพศผู้ป่วย (TGrp จะตัดออก)`, [raw]);
    }
    if (p.orp === "Y") orProcs.push(raw);
  }
}

// ── 3. CC Exclusions (ccex) among PDx + SDx ────────────────────────────────────
const ccexDropped: { code: string; excluded_by: string[] }[] = [];
if (allDx.length > 1) {
  const mainMap = new Map<string, string>();
  for (const c of allDx) {
    const m = i10Map.get(c)?.find((r) => r.maincc)?.maincc;
    if (m) mainMap.set(c, m);
  }
  const mainVals = [...new Set(mainMap.values())];
  if (mainVals.length > 0) {
    const exRows = (
      await db.query<{ cc10: string; notfor10: string }>(
        "select cc10, notfor10 from ccex where cc10 = any($1) and notfor10 = any($2)",
        [mainVals, allDx],
      )
    ).rows;
    const byMain = new Map<string, Set<string>>();
    for (const r of exRows) {
      const s = byMain.get(r.cc10) ?? new Set<string>();
      s.add(r.notfor10);
      byMain.set(r.cc10, s);
    }
    for (const c of nonExtSdx) {
      const m = mainMap.get(c);
      if (!m) continue;
      const excluders = [...(byMain.get(m) ?? [])].filter((other) => other !== c);
      if (excluders.length > 0) {
        ccexDropped.push({ code: c, excluded_by: excluders });
      }
    }
  }
}

// ── 4. All 18 NHSO AI-Audit Rules (ปีงบ 2567) ──────────────────────────────────
const isDeadOrTransfer = input.discht === "4" || input.discht === "8" || input.discht === "9";

// #1 D62 without blood transfusion
if (allDxSet.has("D62") && hasAnyExact(procSet, ["9903", "9904", "9905", "9906", "9907"]).length === 0) {
  add("warning", "NHSO-AUDIT-01", "AI-Audit #1: Acute posthaemorrhagic anaemia (D62) แต่ไม่มีรหัสการให้เลือด (99.03–99.07)", ["D62"]);
}
// #2 Anemia/leukopenia/thrombocytopenia with pancytopenia cause
const cytopenias = hasAnyPrefix(allDxSet, ["D63", "D64", "D70", "D72", "D695", "D696"]);
const marrowCauses = hasAnyPrefix(allDxSet, ["D60", "D61", "D46", "C91", "C92", "C93", "C94", "C95"]);
if (cytopenias.length > 0 && marrowCauses.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-02",
    `AI-Audit #2: ภาวะเม็ดเลือดต่ำ (${cytopenias.join(", ")}) ร่วมกับโรคที่เป็นสาเหตุของ pancytopenia (${marrowCauses.join(", ")}) — ตรวจว่าไม่ลงรหัสซ้ำซ้อน`,
    [...cytopenias, ...marrowCauses],
  );
}
// #3 Hypoglycemia with cause (sepsis, hepatic failure, adrenal insufficiency)
const hypos = hasAnyExact(allDxSet, ["E160", "E161", "E162"]);
const hypoCauses = hasAnyPrefix(allDxSet, ["A40", "A41", "K72", "E271", "E272", "E273", "E274"]);
if (hypos.length > 0 && hypoCauses.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-03",
    `AI-Audit #3: Hypoglycaemia (${hypos.join(", ")}) ร่วมกับโรคที่เป็นสาเหตุ (${hypoCauses.join(", ")}) — เสี่ยงถูกตัดหากเป็นอาการของโรคหลัก`,
    [...hypos, ...hypoCauses],
  );
}
// #4 Metabolic acidosis (E87.2) with CKD, sepsis, or diarrhea
const acidosisCauses = hasAnyPrefix(allDxSet, ["N18", "A40", "A41", "A09", "A08", "K52"]);
if (allDxSet.has("E872") && acidosisCauses.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-04",
    `AI-Audit #4: Acidosis (E87.2) ร่วมกับ CKD/sepsis/diarrhea (${acidosisCauses.join(", ")}) — เป็นอาการของโรคหลัก เสี่ยงถูกตัด`,
    ["E872", ...acidosisCauses],
  );
}
// #5 Seizure (R56.8) with alcohol withdrawal
const alcWithdrawal = hasAnyExact(allDxSet, ["F103", "F104"]);
if (allDxSet.has("R568") && alcWithdrawal.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-05",
    `AI-Audit #5: Convulsion (R56.8) ร่วมกับ Alcohol withdrawal (${alcWithdrawal.join(", ")}) — ไม่ต้องลง R56.8 เพิ่ม`,
    ["R568", ...alcWithdrawal],
  );
}
// #6 Acute respiratory failure (J96.0*) without ventilator (unless dead or transfer)
const arf = hasAnyPrefix(allDxSet, ["J960"]);
const vents = hasAnyExact(procSet, ["9670", "9671", "9672", "9390", "9391"]);
if (arf.length > 0 && vents.length === 0 && !isDeadOrTransfer) {
  add(
    "warning",
    "NHSO-AUDIT-06",
    `AI-Audit #6: Acute respiratory failure (${arf.join(", ")}) แต่ไม่มีรหัสเครื่องช่วยหายใจ (96.7x / 93.90) และไม่ได้เสียชีวิต/ส่งต่อ`,
    arf,
  );
}
// #7 P28.5 with RDS of newborn (P22.0)
if (allDxSet.has("P285") && allDxSet.has("P220")) {
  add("warning", "NHSO-AUDIT-07", "AI-Audit #7: Respiratory failure of newborn (P28.5) ร่วมกับ RDS (P22.0) — เสี่ยงถูกตัด", ["P285", "P220"]);
}
// #8 K92.1/K92.2 with upper GI "with haemorrhage" code
const giSym = hasAnyExact(allDxSet, ["K921", "K922"]);
const ugiBleed = hasAnyExact(allDxSet, UPPER_GI_WITH_BLEED);
if (giSym.length > 0 && ugiBleed.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-08",
    `AI-Audit #8: ${giSym.join(", ")} ซ้ำซ้อนกับรหัสทางเดินอาหารส่วนต้นที่ระบุ with haemorrhage แล้ว (${ugiBleed.join(", ")})`,
    [...giSym, ...ugiBleed],
  );
}
// #9 K92.2/K62.5 with I84.1
const lgiSym = hasAnyExact(allDxSet, ["K922", "K625"]);
if (lgiSym.length > 0 && allDxSet.has("I841")) {
  add(
    "warning",
    "NHSO-AUDIT-09",
    `AI-Audit #9: ${lgiSym.join(", ")} ร่วมกับ Internal haemorrhoids with complications (I84.1) — ซ้ำซ้อน`,
    [...lgiSym, "I841"],
  );
}
// #10 N18.9 with diabetic nephropathy
const dmNephro = hasAnyExact(allDxSet, ["E102", "E112", "E122", "E132", "E142", "N083"]);
if (allDxSet.has("N189") && dmNephro.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-10",
    `AI-Audit #10: CKD unspecified (N18.9) ร่วมกับ Diabetic nephropathy (${dmNephro.join(", ")}) — ควรระบุ stage ของ CKD (N18.1–N18.5)`,
    ["N189", ...dmNephro],
  );
}
// #11 N17.- on top CKD stage 5 (N18.5)
const akis = hasAnyPrefix(allDxSet, ["N17"]);
if (akis.length > 0 && allDxSet.has("N185")) {
  add(
    "warning",
    "NHSO-AUDIT-11",
    `AI-Audit #11: AKI (${akis.join(", ")}) ร่วมกับ CKD stage 5 (N18.5) — ต้องมีหลักฐานสาเหตุ AKI ชัดเจน มิฉะนั้นเสี่ยงถูกตัด`,
    [...akis, "N185"],
  );
}
// #12 UTI (N10/N11/N39.0) with N20
const utis = hasAnyPrefix(allDxSet, ["N10", "N11", "N390"]);
const stones = hasAnyPrefix(allDxSet, ["N20"]);
if (utis.length > 0 && stones.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-12",
    `AI-Audit #12: UTI (${utis.join(", ")}) ร่วมกับนิ่วไต/ท่อไต (${stones.join(", ")}) — ตรวจการใช้รหัสให้ถูกต้องตามเกณฑ์ สปสช.`,
    [...utis, ...stones],
  );
}
// #13 N11/N20 with N13
const n11or20 = hasAnyPrefix(allDxSet, ["N11", "N20"]);
const n13 = hasAnyPrefix(allDxSet, ["N13"]);
if (n11or20.length > 0 && n13.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-13",
    `AI-Audit #13: ${n11or20.join(", ")} ร่วมกับ Obstructive uropathy (${n13.join(", ")}) — ตรวจรหัสผสม (เช่น N13.2/N13.6) เพื่อไม่ให้ลงซ้ำซ้อน`,
    [...n11or20, ...n13],
  );
}
// #14 R39.2 or I95.1 with AGE
const r392OrI951 = hasAnyExact(allDxSet, ["R392", "I951"]);
const ageDx = hasAnyPrefix(allDxSet, ["A09", "A08"]);
if (r392OrI951.length > 0 && ageDx.length > 0) {
  add(
    "warning",
    "NHSO-AUDIT-14",
    `AI-Audit #14: ${r392OrI951.join(", ")} ร่วมกับ AGE (${ageDx.join(", ")}) — เสี่ยงถูกตัดว่าเป็นอาการของภาวะขาดน้ำจาก AGE`,
    [...r392OrI951, ...ageDx],
  );
}
// #15 R18 without abdominocentesis (54.91)
if (allDxSet.has("R18") && !procSet.has("5491")) {
  add("warning", "NHSO-AUDIT-15", "AI-Audit #15: Ascites (R18) แต่ไม่มีรหัสเจาะท้อง (54.91)", ["R18"]);
}
// #16 SIRS without organ failure (R65.0/R65.2/R65.9)
const sirsNoOf = hasAnyExact(allDxSet, ["R650", "R652", "R659"]);
if (sirsNoOf.length > 0) {
  add("warning", "NHSO-AUDIT-16", `AI-Audit #16: SIRS without organ failure (${sirsNoOf.join(", ")}) — ไม่ควรลงรหัส`, sirsNoOf);
}
// #17 IVUS (00.2-) in community hospital level F
const ivus = hasAnyPrefix(procSet, ["002"]);
if (ivus.length > 0) {
  if (input.hospital_level?.toUpperCase() === "F") {
    add("warning", "NHSO-AUDIT-17", `AI-Audit #17: IVUS (${ivus.join(", ")}) ใน รพช. ระดับ F — เสี่ยงถูกตัด`, ivus);
  } else if (!input.hospital_level) {
    add("suggestion", "NHSO-AUDIT-17", `มีรหัส IVUS (${ivus.join(", ")}) — ตรวจสอบระดับ รพ. (AI-Audit #17 ตรวจเข้มใน รพช. ระดับ F)`, ivus);
  }
}
// #18 PCI/PTCA (00.66) without vessel count (00.40–00.43)
if (procSet.has("0066") && hasAnyExact(procSet, ["0040", "0041", "0042", "0043"]).length === 0) {
  add("warning", "NHSO-AUDIT-18", "AI-Audit #18: PCI/PTCA (00.66) แต่ไม่ระบุรหัสจำนวน vessel (00.40–00.43)", ["0066"]);
}

// ── 5. MRA & Under-coding / Specificity Suggestions ────────────────────────────
if (allDxSet.has("N189") && dmNephro.length === 0) {
  add("warning", "SPEC-CKD-STAGE", "CKD ไม่ระบุ stage (N18.9) — ควรถามแพทย์เพื่อระบุ N18.1–N18.5 ตาม eGFR", ["N189"]);
}

for (const c of allDx) {
  if (AMBIGUOUS_CODES[c]) {
    add("suggestion", "SPEC-AMBIGUOUS", `${c}: ${AMBIGUOUS_CODES[c]}`, [c]);
  }
}

if (procSet.has("9604") && hasAnyExact(procSet, ["9670", "9671", "9672"]).length === 0) {
  add("suggestion", "UNDER-VENT-HOURS", "มีรหัสใส่ท่อช่วยหายใจ (96.04) แต่ไม่มีรหัสชั่วโมงเครื่องช่วยหายใจ (96.71 < 96 ชม. / 96.72 ≥ 96 ชม.)", ["9604"]);
}

if (input.or_procs_missing_time?.length) {
  add(
    "warning",
    "MRA-4-OR-TIME",
    `หัตถการในห้องผ่าตัดขาดวันเวลาเริ่ม–สิ้นสุด: ${input.or_procs_missing_time.join(", ")} (เกณฑ์ MRA ข้อ 4)`,
    input.or_procs_missing_time,
  );
} else if (orProcs.length > 0) {
  add(
    "suggestion",
    "MRA-4-CHECK",
    `มีหัตถการ OR (${orProcs.join(", ")}) — ตรวจสอบว่าบันทึกวันเวลาเริ่ม–สิ้นสุดครบในแบบสรุป (MRA ข้อ 4)`,
    orProcs,
  );
}

for (const text of input.dx_texts ?? []) {
  const m = text.match(MRA_ABBREV_PATTERN);
  if (m) {
    add(
      "warning",
      "MRA-5-ABBREV",
      `ข้อความวินิจฉัย/หัตถการมีตัวย่อ "${m[0]}" ใน "${text}" — ต้องเขียนศัพท์เต็มในใบสรุป (MRA ข้อ 5)`,
    );
  }
}

// ── 6. Known TS Grouper Gaps Warning ───────────────────────────────────────────
const grouperGaps: string[] = [];
if (hasAnyPrefix(allDxSet, ["O98", "O99"]).length > 0) {
  grouperGaps.push("พบ O98/O99: TS grouper ยังไม่ได้ทำ O98/O99 PDx swap ของ DC 1452 — ควรเทียบผลกับ TGrp6305 CLI หากเป็นเคสสูติกรรม");
}
const daggerHits = hasAnyPrefix(allDxSet, DAGGER_ASTERISK_HINT_PREFIXES);
if (daggerHits.length >= 2) {
  grouperGaps.push(`พบกลุ่มรหัสที่อาจเป็นคู่ †/* (${daggerHits.join(", ")}): TS grouper ยังไม่ได้ทำ Appendix A1 swap — ควรเทียบผลกับ TGrp6305 CLI`);
}

console.log(
  JSON.stringify(
    {
      summary: {
        hard_stops: alerts.filter((a) => a.level === "hard_stop").length,
        warnings: alerts.filter((a) => a.level === "warning").length,
        suggestions: alerts.filter((a) => a.level === "suggestion").length,
        ccex_dropped_count: ccexDropped.length,
        payer: input.payer ?? "unspecified (default UC 8,350 baht/AdjRW for NHSO)",
      },
      hard_stops: alerts.filter((a) => a.level === "hard_stop"),
      warnings: alerts.filter((a) => a.level === "warning"),
      suggestions: alerts.filter((a) => a.level === "suggestion"),
      ccex_dropped: ccexDropped,
      grouper_gaps: grouperGaps,
    },
    null,
    2,
  ),
);

await db.close();
