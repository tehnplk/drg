// Deterministic pre-discharge chart scanner (Concurrent CDI / Chart Audit).
// Scans an inpatient chart from the database (by AN) or pasted text (via stdin '-' or '@file.txt')
// to flag blocking MRA/TDRG gaps, over-coding evidence risks, unaddressed nursing/lab findings,
// specificity gaps, and discharge-readiness gaps BEFORE drafting a discharge summary.
//
// Run from the project root:
//   node .claude/skills/pre-coding-query/scripts/scan-chart.ts              # list available ANs
//   node .claude/skills/pre-coding-query/scripts/scan-chart.ts 69-005101    # scan chart by AN (includes chart text)
//   node .claude/skills/pre-coding-query/scripts/scan-chart.ts 69-005101 --json-only
//   node .claude/skills/pre-coding-query/scripts/scan-chart.ts -          # scan raw chart text from stdin
import { readFileSync } from "node:fs";
import { db } from "../../../../lib/db.ts";
import { DISCHARGE_TYPES, losDays, type Note, type Patient } from "../../../../lib/ward.ts";

type Severity = "blocking" | "evidence_risk" | "clinical_gap" | "mra_readiness";
type Finding = {
  severity: Severity;
  rule: string;
  message: string;
  source?: string;
};

const args = process.argv.slice(2);
const jsonOnly = args.includes("--json-only");
const target = args.find((a) => !a.startsWith("--"));

const findings: Finding[] = [];
const add = (severity: Severity, rule: string, message: string, source?: string) =>
  findings.push({ severity, rule, message, ...(source ? { source } : {}) });

const has = (text: string, re: RegExp) => re.test(text);

function scanChartText(opts: {
  allText: string;
  doctorText: string;
  nursingNotes: { at: string; body: string }[];
  workingDx: string;
  patient?: Patient;
}) {
  const { allText, doctorText, nursingNotes, workingDx, patient } = opts;

  // ── 1. Blocking MRA / TDRG Mandatory Fields ──────────────────────────────────
  if (patient) {
    const isNewborn = patient.age === 0 && patient.age_day >= 0 && patient.age_day < 28;
    const los = losDays(patient);
    if (patient.age < 0 || patient.age > 124) {
      add("blocking", "TDRG-AGE", `อายุ ${patient.age} ปีอยู่นอกช่วง 0–124 ปี`, "header");
    }
    if (isNewborn && (!patient.weight || patient.weight < 0.3)) {
      add("blocking", "TDRG-NEWBORN-WT", "ทารกอายุ < 28 วันขาดน้ำหนักแรกรับ (≥ 0.3 กก.) — ต้องบันทึกก่อนจำหน่าย", "header");
    }
    if (patient.discharge_type === "4" && !patient.transfer_to.trim()) {
      add("blocking", "MRA-8-TRANSFER", "ประเภทการจำหน่ายเป็น Transfer (4) แต่ยังไม่ระบุชื่อสถานพยาบาลปลายทาง", "header");
    }
    if (los < 0) {
      add("blocking", "TDRG-LOS", `วันนอนคำนวณได้ติดลบ (${los} วัน) — ตรวจวันเวลารับไว้/จำหน่าย/วันลากลับบ้าน`, "header");
    }
    if (!patient.discharge_type) {
      add("mra_readiness", "MRA-8-PENDING", "ยังไม่ได้ระบุ Discharge type ในระบบ HIS (ชาร์ทยังไม่สรุปจำหน่าย)", "header");
    }
  }

  // ── 2. Evidence Completeness (Prevent Over-coding / Audit Clawbacks) ─────────
  if (has(doctorText, /\b(pneumonia|cap|hap|vap)\b/i)) {
    const hasCxr = has(allText, /\b(cxr|chest\s*x-?ray|chest\s*film|film\s*chest|ct\s*chest)\b/i);
    const negatedCxr = has(allText, /(no\s+|without\s+|ไม่มี\s*|ไม่ได้ทำ\s*)(cxr|chest\s*x-?ray|chest\s*film)/i);
    if (!hasCxr || negatedCxr) {
      add("evidence_risk", "EVID-PNEUMONIA-CXR", "พบคำวินิจฉัย pneumonia แต่ไม่พบบันทึกผลอ่าน CXR/ภาพถ่ายทรวงอกในชาร์ท", "doctor_notes");
    }
  }

  if (has(doctorText, /\b(sepsis|septic\s*shock|bacteremia|septicaemia)\b/i)) {
    if (!has(allText, /\b(hemoculture|blood\s*culture|h\/c|hemoc)\b/i)) {
      add("evidence_risk", "EVID-SEPSIS-HC", "พบคำวินิจฉัย sepsis/bacteremia แต่ไม่พบการส่งหรือผล hemoculture ในชาร์ท", "doctor_notes");
    }
    const usedVaso =
      has(allText, /\b(levophed|norepinephrine|vasopressor|dopamine|epinephrine|adrenaline)\b/i) &&
      !has(allText, /(ไม่ได้ใช้|ไม่ใช้|no|without)\s*(vasopressor|levophed|norepinephrine)/i);
    if (has(doctorText, /\bseptic\s*shock\b/i) && !usedVaso) {
      add("evidence_risk", "EVID-SEPTIC-SHOCK-VASO", "มีคำว่า septic shock ในบันทึกแพทย์ แต่ไม่พบการใช้ vasopressor — ยืนยันว่าเข้าเกณฑ์ septic shock หรือเป็นเพียง hypotension ที่ตอบสนองต่อสารน้ำ", "doctor_notes");
    }
  }

  if (has(doctorText, /\brespiratory\s*failure\b/i)) {
    const hasGas =
      has(allText, /\b(abg|pao2|paco2|spo2|o2\s*sat|sat\s*\d)/i) &&
      !has(allText, /(no\s+|without\s+|ไม่มี\s*)(abg|spo2)/i);
    if (!hasGas) {
      add("evidence_risk", "EVID-RF-GAS", "พบคำวินิจฉัย respiratory failure แต่ไม่พบผล ABG หรือ SpO₂ ในชาร์ท", "doctor_notes");
    }
    if (!has(allText, /\b(ventilat\w*|intubat\w*|et\s*tube|niv|bipap|cpap|ambu)\b/i)) {
      add("evidence_risk", "EVID-RF-VENT", "พบคำวินิจฉัย respiratory failure แต่ไม่พบการใช้เครื่องช่วยหายใจ/NIV (เสี่ยง NHSO AI-Audit #6 เว้นแต่เสียชีวิต/ส่งต่อ)", "doctor_notes");
    }
  }

  if (has(allText, /\b(intubat\w*|endotracheal|et\s*tube|mechanical\s*vent\w*)\b/i)) {
    const hasHoursOrExtub = has(allText, /(ชั่วโมง|ชม\.|hrs?|hours?|extubat\w*|off\s*et|off\s*vent)/i);
    if (!hasHoursOrExtub) {
      add("mra_readiness", "MRA-VENT-HOURS", "พบการใส่ท่อ/ใช้เครื่องช่วยหายใจ แต่ยังไม่พบเวลาถอดท่อหรือจำนวนชั่วโมงรวม (จำเป็นสำหรับแยก 96.71 < 96 ชม. vs 96.72 ≥ 96 ชม.)", "procedure/progress");
    }
  }

  if (has(allText, /\b(operative\s*note|set\s*or|orif|crif|pfna|laparotom|cesarean|caesarean|appendectom|cholecystectom|debridement)\b/i)) {
    if (!has(allText, /\d{1,2}[:.]\d{2}\s*[–\-−ถึง]\s*\d{1,2}[:.]\d{2}/)) {
      add("mra_readiness", "MRA-4-OR-TIME", "พบหัตถการห้องผ่าตัดแต่ไม่พบรูปแบบเวลาเริ่มต้น–สิ้นสุด (เช่น 09:10–10:40 น.) — เกณฑ์ MRA ข้อ 4", "procedure");
    }
  }

  if (has(doctorText, /\b(fracture|dislocation|laceration|contusion|trauma|burn|poisoning|overdose)\b|กระดูกหัก/i)) {
    if (!has(allText, /(ลื่นล้ม|หกล้ม|ตกจาก|อุบัติเหตุ|รถชน|รถล้ม|ถูกตี|ถูกแทง|กินยา|สารเคมี|fall|accident|traffic|slip|trip|assault|burn|scald)/i)) {
      add("mra_readiness", "MRA-2-EXT-CAUSE", "พบการบาดเจ็บ/พิษแต่ไม่พบรายละเอียดกลไกและสถานที่เกิดเหตุสำหรับลง External cause (MRA ข้อ 2)", "admission");
    }
  }

  if (has(doctorText, /\b(posthemorrhagic|posthaemorrhagic|acute\s*blood\s*loss)\b|เสียเลือด/i)) {
    if (!has(allText, /\b(prc|lprc|packed\s*red|whole\s*blood|transfus)\b|ให้เลือด/i)) {
      add("evidence_risk", "AUDIT-01-ANEMIA-NO-PRC", "พบการบันทึกภาวะเสียเลือด/anemia จากการเสียเลือด แต่ไม่พบการให้เลือด (หากลง D62 เสี่ยง NHSO AI-Audit #1)", "doctor_notes");
    }
  }

  if (has(doctorText, /\bascites\b/i) && !has(allText, /\b(paracentesis|abdominocentesis|abdominal\s*tapping)\b|เจาะท้อง/i)) {
    add("evidence_risk", "AUDIT-15-ASCITES", "พบคำว่า ascites แต่ไม่พบหัตถการเจาะท้อง (หากลง R18 เสี่ยง NHSO AI-Audit #15)", "doctor_notes");
  }

  // ── 3. Unaddressed Clinical / Nursing / Lab Signals (Prevent Under-coding & Care Gaps) ─
  // 3a. Nursing findings not echoed in physician progress notes
  const nursingSignals: { label: string; nurseRe: RegExp; doctorAckRe: RegExp }[] = [
    {
      label: "แผลกดทับ / pressure injury",
      nurseRe: /(pressure\s*(injury|ulcer)|แผลกดทับ|รอยแดงไม่จาง)/i,
      doctorAckRe: /(pressure\s*(injury|ulcer)|decubitus|แผลกดทับ)/i,
    },
    {
      label: "หลอดเลือดดำอักเสบ (phlebitis)",
      nurseRe: /\bphlebitis\b|หลอดเลือดดำอักเสบ/i,
      doctorAckRe: /\bphlebitis\b|หลอดเลือดดำอักเสบ/i,
    },
    {
      label: "การประเมิน/ให้คำแนะนำเลิกบุหรี่ (Fagerström / tobacco)",
      nurseRe: /(เลิกบุหรี่|fagerstr[oö]m|สูบบุหรี่)/i,
      doctorAckRe: /(tobacco|smoking\s*cessation|nicotine\s*dependence|fagerstr[oö]m|เลิกบุหรี่)/i,
    },
    {
      label: "พลัดตกหกล้มระหว่างนอนโรงพยาบาล (in-hospital fall)",
      nurseRe: /(พลัดตก|หกล้มในหอผู้ป่วย|ตกเตียง|in-?hospital\s*fall)/i,
      doctorAckRe: /(พลัดตก|ตกเตียง|fall\s*in\s*ward)/i,
    },
  ];

  for (const sig of nursingSignals) {
    const matchedNotes = nursingNotes.filter((n) => sig.nurseRe.test(n.body));
    if (matchedNotes.length > 0) {
      const doctorMentioned = sig.doctorAckRe.test(doctorText);
      if (!doctorMentioned) {
        add(
          "clinical_gap",
          "GAP-NURSING-UNACK",
          `บันทึกพยาบาลพบ "${sig.label}" (${matchedNotes.map((n) => n.at).join(", ")}) แต่ยังไม่พบบันทึกประเมิน/วินิจฉัยของแพทย์ใน progress note`,
          "nursing",
        );
      } else if (sig.label.includes("pressure injury") && matchedNotes.length >= 2) {
        add(
          "clinical_gap",
          "GAP-NURSING-MULTI-SITE",
          `บันทึกพยาบาลพบ "${sig.label}" หลายครั้ง/หลายตำแหน่ง (${matchedNotes.map((n) => n.at).join(", ")}) — ตรวจว่าแพทย์บันทึกครบทุกตำแหน่งและระบุว่าเกิดก่อนหรือหลังรับไว้`,
          "nursing",
        );
      }
    }
  }

  // 3b. Lab/treatment signals lacking explicit physician diagnosis
  if (has(allText, /\b(prc|lprc|packed\s*red)\b/i) && !has(doctorText, /\b(anemia|anaemia)\b|ซีด/i)) {
    add("clinical_gap", "GAP-PRC-NO-ANEMIA", "มีการให้เลือด (PRC) แต่ไม่พบคำวินิจฉัยภาวะ anemia ของแพทย์ในบันทึก", "lab/progress");
  }

  if (has(allText, /\b(dct|direct\s*coombs)\s*(positive|pos|\+|1\+|2\+|3\+)/i) && !has(doctorText, /\b((abo|rh)\s*(isoimmun\w*|incompatib\w*|ha?emoly\w*)|isoimmun\w*|incompatib\w*|ha?emolytic)\b/i)) {
    add("clinical_gap", "GAP-DCT-NO-ETIOLOGY", "พบผล Direct Coombs Test (DCT) positive ในชาร์ท แต่แพทย์ยังไม่ได้ระบุสาเหตุ (เช่น ABO/Rh isoimmunization หรือสาเหตุอื่น) ในคำวินิจฉัย", "lab");
  }

  // 3c. Specificity gaps in physician notes
  if (has(doctorText, /\bckd\b/i) && !has(doctorText, /\bckd\s*(stage|st\.?)\s*[1-5]|esrd|stage\s*[1-5]/i)) {
    add("clinical_gap", "SPEC-CKD-STAGE", "บันทึกแพทย์ระบุ CKD โดยไม่ระบุ stage (1–5) — ควรระบุ stage ตาม eGFR ก่อนสรุป", "doctor_notes");
  }

  if (has(doctorText, /\baki\b/i) && has(doctorText, /\bprerenal\b/i)) {
    add("clinical_gap", "SPEC-AKI-PRERENAL", "บันทึกแพทย์มีทั้งคำว่า AKI และ prerenal — ควรยืนยันก่อนจำหน่ายว่าเป็น acute kidney injury (N17.-) หรือ prerenal azotemia (R39.2)", "doctor_notes");
  }

  if (has(doctorText, /\b(anemia|anaemia)\b/i) && !has(doctorText, /(posthemorrhagic|posthaemorrhagic|เสียเลือด|iron\s*defic|thalassem|chronic\s*disease|neoplastic|hemolytic|haemolytic|aplastic|megaloblastic)/i)) {
    add("clinical_gap", "SPEC-ANEMIA-TYPE", "บันทึกแพทย์ระบุ anemia โดยไม่ระบุชนิด/สาเหตุ — ควรยืนยันชนิดก่อนสรุป (coder ห้ามเดาจาก CBC เอง)", "doctor_notes");
  }

  if (has(doctorText, /\bintertrochanteric\b/i) && has(allText, /\b(comminuted|ao\s*31-a[23])\b/i) && !has(doctorText, /\b(stable|unstable)\b/i)) {
    add("clinical_gap", "SPEC-FRACTURE-STABILITY", "ภาพรังสีระบุ comminuted / AO 31-A2/A3 intertrochanteric fracture แต่แพทย์ยังไม่ระบุชนิด stable/unstable และ traumatic vs fragility fracture", "imaging/progress");
  }

  if (has(doctorText, /\b(dm|diabetes)\b/i) && !has(doctorText, /\btype\s*[12]\b|t1dm|t2dm|gestational/i)) {
    add("clinical_gap", "SPEC-DM-TYPE", "บันทึกแพทย์ระบุ DM โดยไม่ระบุชนิด (type 1 / type 2 / อื่นๆ)", "doctor_notes");
  }

  if (has(doctorText, /\b(hypokalemia|hypokalaemia|hyponatremia|hyponatraemia|hyperkalemia|hyperkalaemia)\b/i)) {
    if (!has(allText, /\b(kcl|3%\s*nacl|kayexalate|kalimate|calcium\s*gluconate|ri\s*\+|insulin)\b/i)) {
      add("evidence_risk", "EVID-ELECTROLYTE-TX", "พบคำวินิจฉัยภาวะ electrolyte ผิดปกติ แต่ไม่พบการรักษาจำเพาะในชาร์ท (เสี่ยงถูก audit ตัดหากเป็นเพียงอาการร่วม)", "doctor_notes");
    }
  }

  // ── 4. Discharge Readiness (MRA #5 Abbreviations & MRA #6 Discharge Plan/Home Med) ─
  const abbrevRe = /\b(HT|HTN|DM|T2DM|T1DM|CKD|AKI|ARF|ESRD|UGIB|LGIB|COPD|AMI|STEMI|NSTEMI|CHF|CAP|HAP|VAP|UTI|CAUTI|CA|CVA|DLP|AF|BPH|AGE|DKA|HHS|IHD|CAD|TB|PFNA|ORIF|CRIF|EBL|R\/O|S\/P)\b/g;
  const abbrevs = [...new Set(workingDx.match(abbrevRe) ?? [])];
  if (abbrevs.length > 0) {
    add("mra_readiness", "MRA-5-ABBREV", `Working diagnosis มีตัวย่อ (${abbrevs.join(", ")}) — เตรียมเขียนศัพท์เต็มทุกคำในใบสรุป (MRA ข้อ 5)`, "working_dx");
  }

  if (!has(allText, /(นัดตรวจ|นัด\s*f\/u|follow[\s-]*up|แผนหลังจำหน่าย|แนะนำอาการ.*กลับมา|discharge\s*plan)/i)) {
    add("mra_readiness", "MRA-6-FOLLOWUP", "ยังไม่พบบันทึกแผนการรักษา/วันนัดติดตาม/อาการผิดปกติที่ต้องกลับมาตรวจหลังจำหน่ายในชาร์ท (MRA ข้อ 6)", "progress");
  }

  if (!has(allText, /(home\s*med|ยากลับบ้าน|กลับบ้าน.*ยา|med\s*reconcil|switch\s*to|restart\s*metformin|amoxicillin|ciprofloxacin)/i)) {
    add("mra_readiness", "MRA-6-HOMEMED", "ยังไม่พบบันทึกรายการยากลับบ้าน (home medication) หรือการทบทวนยาประจำเดิมก่อนจำหน่าย (MRA ข้อ 6)", "progress");
  }
}

let patient: Patient | undefined;
let notes: Note[] = [];
let rawText = "";

if (!target) {
  const { rows } = await db.query<Patient>("select * from ward_patient order by admit_at desc");
  for (const p of rows) {
    console.log(`${p.an}\t${p.ward}\t${p.admit_at} → ${p.discharge_at}\tdischt:${p.discharge_type || "-"}\t${p.working_dx}`);
  }
  await db.close();
  process.exit(0);
}

if (target === "-" || target.startsWith("@")) {
  rawText = (target === "-" ? readFileSync(0, "utf8") : readFileSync(target.slice(1), "utf8")).replace(/^\uFEFF/, "");
  scanChartText({
    allText: rawText,
    doctorText: rawText,
    nursingNotes: [],
    workingDx: rawText.slice(0, 400),
  });
} else {
  patient = (await db.query<Patient>("select * from ward_patient where an = $1", [target])).rows[0];
  if (!patient) {
    await db.close();
    throw new Error(`AN ${target} not found in ward_patient; import it with: node scripts/import-his.ts ${target}`);
  }
  notes = (await db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [target])).rows;
  const doctorNotes = notes.filter((n) => n.kind === "admission" || n.kind === "progress" || n.kind === "procedure");
  const nursingNotes = notes.filter((n) => n.kind === "nursing").map((n) => ({ at: n.at, body: n.body }));
  const allText = [patient.working_dx, ...notes.map((n) => n.body)].join("\n");
  const doctorText = [patient.working_dx, ...doctorNotes.map((n) => n.body)].join("\n");

  scanChartText({
    allText,
    doctorText,
    nursingNotes,
    workingDx: patient.working_dx,
    patient,
  });
}

const bySeverity = (s: Severity) => findings.filter((f) => f.severity === s);
const blocking = bySeverity("blocking");
const evidenceRisks = bySeverity("evidence_risk");
const clinicalGaps = bySeverity("clinical_gap");
const mraReadiness = bySeverity("mra_readiness");

const readiness =
  blocking.length > 0
    ? "blocked"
    : evidenceRisks.length > 0 || clinicalGaps.length > 0 || mraReadiness.length > 0
      ? "needs_clarification"
      : "ready";

const output = {
  ...(patient
    ? {
        patient: {
          an: patient.an,
          hn: patient.hn,
          sex: patient.sex === "1" ? "male" : "female",
          age: patient.age,
          age_day: patient.age_day,
          weight_kg: patient.weight,
          insurance: patient.insurance,
          ward: patient.ward,
          bed: patient.bed,
          attending: patient.attending,
          admit_at: patient.admit_at,
          discharge_at: patient.discharge_at,
          leave_days: patient.leave_days,
          los_days: losDays(patient),
          discharge_status: patient.discharge_status || "-",
          discharge_type: patient.discharge_type
            ? `${patient.discharge_type} ${DISCHARGE_TYPES[patient.discharge_type]}`
            : "-",
          transfer_to: patient.transfer_to || "",
          working_dx: patient.working_dx,
        },
        note_counts: {
          total: notes.length,
          admission: notes.filter((n) => n.kind === "admission").length,
          progress: notes.filter((n) => n.kind === "progress").length,
          procedure: notes.filter((n) => n.kind === "procedure").length,
          nursing: notes.filter((n) => n.kind === "nursing").length,
          lab: notes.filter((n) => n.kind === "lab").length,
        },
      }
    : { source: target }),
  readiness,
  summary: {
    blocking: blocking.length,
    evidence_risks: evidenceRisks.length,
    clinical_gaps: clinicalGaps.length,
    mra_readiness: mraReadiness.length,
  },
  blocking,
  evidence_risks: evidenceRisks,
  clinical_gaps: clinicalGaps,
  mra_readiness: mraReadiness,
};

console.log(JSON.stringify(output, null, 2));

if (!jsonOnly && patient) {
  console.log("\n--- CHART NOTES ---");
  for (const n of notes) {
    console.log(`## ${n.at} ${n.kind} — ${n.author}\n${n.body}\n`);
  }
}

await db.close();
