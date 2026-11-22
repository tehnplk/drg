// Import inpatients from the HIS (MySQL, credentials in .env.local) into the ward tables, so the ward screens and the
// discharge-summary skill read real charts. Names are not copied (title + HN only); free-text notes are copied as written.
// usage: node scripts/import-his.ts [AN ...] [--days=7]   (no AN: everyone discharged in the last N days)
// Stop `next dev` first, PGlite locks its folder. Re-importing an AN replaces its patient row and notes, and keeps its draft.
import mysql from "mysql2/promise";
import { db } from "../lib/db.ts";
import { WARD_SCHEMA, type DischargeType, type Note, type Patient } from "../lib/ward.ts";

process.loadEnvFile(".env.local");
const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE } = process.env;
const his = await mysql.createConnection({
  host: DB_HOST, port: Number(DB_PORT ?? 3306), user: DB_USERNAME, password: DB_PASSWORD, database: DB_DATABASE,
  dateStrings: true, // "YYYY-MM-DD HH:MM:SS" as stored (Asia/Bangkok), no timezone shift
});
type Row = Record<string, string | null>;
const q = async (sql: string, params: unknown[] = []) => (await his.query(sql, params))[0] as Row[];
const live = (t: string) => `ifnull(${t}.active, '') <> 'N'`;

const args = process.argv.slice(2);
const ans = args.filter((a) => !a.startsWith("--"));
const days = Number(args.find((a) => a.startsWith("--days="))?.slice(7) ?? 7);

const DISCHARGE_TYPE: Record<string, DischargeType> = {
  "With approveal": "1", "Against advice": "2", "By escape": "3", "By Transfer": "4", Other: "5",
  "Dead, autopsy": "8", "Dead, no autopsy": "9",
};

const users = new Map((await q("select username, name from syuser")).map((u) => [u.username, u.name ?? ""]));
const author = (username: string | null) => (username && users.get(username)) || username || "";
const min = (dt: string | null) => (dt ?? "").slice(0, 16); // "YYYY-MM-DD HH:MM"
const nowBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
const dotted = (icd10: string | null) => (icd10 && icd10.length > 3 ? `${icd10.slice(0, 3)}.${icd10.slice(3)}` : icd10 ?? "");

// Non-empty fields, one per line, as "label: value" (no label: the value alone).
const lines = (pairs: [string, string | null | undefined][]) =>
  pairs.filter(([, v]) => v?.trim()).map(([k, v]) => (k ? `${k}: ${v!.trim()}` : v!.trim())).join("\n");
const vitals = (r: Row) =>
  [r.temp && `T ${r.temp}`, r.bpmax && `BP ${r.bpmax}/${r.bpmin ?? ""}`, r.pr && `PR ${r.pr}`, r.rr && `RR ${r.rr}`, r.o2 && `SpO₂ ${r.o2}`]
    .filter(Boolean).join(", ");

function ageAt(birthday: string | null, at: string) {
  if (!birthday) return { age: 0, age_day: 0 };
  const b = new Date(birthday.slice(0, 10)), a = new Date(at.slice(0, 10));
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  if (a.getUTCMonth() * 31 + a.getUTCDate() < b.getUTCMonth() * 31 + b.getUTCDate()) age--;
  return { age, age_day: age ? 0 : Math.round((+a - +b) / 86400_000) };
}

const visits = await q(
  `select v.visitId, v.an, v.hn, v.admitDate, v.dischargeDatetime, v.totalLeaveDay, v.weight, v.diag_text,
     coalesce(nullif(v.roomno_dc, ''), v.cur_roomno, v.roomno) roomno, p.title, p.sex, p.birthday, r.name insurance
   from trvisit v join mspatient p on p.hn = v.hn left join msrightstype r on r.rightsTypeId = v.rightsTypeId
   where v.an <> '' and ${ans.length ? "v.an in (?)" : "v.dischargeDatetime >= now() - interval ? day"}
   order by v.an`,
  [ans.length ? ans : days],
);

for (const v of visits) {
  const id = v.visitId;
  const [dc] = await q(`select * from frmtrdcsummary d where visitId = ? and ${live("d")} order by updateDate desc limit 1`, [id]);
  const [cs] = await q(`select * from frmtrclinicalsummary c where visitId = ? and ${live("c")} order by updateDate desc limit 1`, [id]);
  const [bed] = await q(
    `select a.ward, coalesce(b.bedname, a.bedno) bed from tradmit a left join msbedno b on b.bedno = a.bedno
     where a.visitId = ? order by a.seq desc limit 1`, [id]);
  const [room] = await q("select ward from msroom where roomno = ?", [v.roomno]);
  const admits = await q(`select * from tradmissionnote n where visitId = ? and ${live("n")} order by createDate`, [id]);

  const admit_at = min(v.admitDate);
  const patient: Patient = {
    an: v.an!, hn: v.hn!, name: `${v.title ?? ""} HN ${v.hn}`.trim(),
    sex: v.sex === "ชาย" ? "1" : "2",
    ...ageAt(v.birthday, admit_at),
    weight: Number(v.weight) || Number(admits[0]?.weight) || 0,
    ward: bed?.ward || room?.ward || v.roomno || "", bed: bed?.bed ?? "",
    insurance: v.insurance ?? "", attending: dc?.attendingPhysician ?? "", working_dx: v.diag_text ?? "",
    admit_at,
    discharge_at: min(v.dischargeDatetime) || nowBkk(), // ponytail: still admitted -> LOS so far
    leave_days: Number(v.totalLeaveDay) || 0,
    discharge_status: dc?.dischargeStatus ?? "",
    discharge_type: DISCHARGE_TYPE[dc?.typeOfDischarge ?? ""] ?? ("" as DischargeType), // "" = not summarised yet
    transfer_to: dc?.typeOfDischarge_transfer ?? "",
  };

  const notes: Note[] = [];
  const add = (at: string | null, kind: Note["kind"], who: string, body: string) => body && notes.push({ at: min(at), kind, author: who, body });

  for (const n of admits)
    add(n.createDate, "admission", author(n.createdBy), lines([
      ["CC", n.chiefComplain], ["PI", n.presentIlness], ["PH", n.pastHistory], ["Drug allergy", n.drugAllergy],
      ["Previous operation", n.previousOperation], ["FH", n.familyHistory], ["PE", n.physicalExamination], ["VS", vitals(n)],
      ["Indication", n.indicationForAdmission], ["Plan", n.treatmentPlan], ["Comment", n.comment],
    ]));

  for (const n of await q(`select * from trprogressionnote n where visitId = ? and ${live("n")}`, [id]))
    add(n.createDate, "progress", author(n.createdBy), lines([["", n.S], ["P", n.P], ["", n.Note]]));

  for (const n of await q(
    `select f.nurseFocusName, n.* from trnursenote n join trnursefocus f on f.nurseFocusId = n.nurseFocusId
     where f.visitId = ? and ${live("n")}`, [id]))
    add(n.createDate, "nursing", author(n.createdBy), lines([
      ["Focus", n.nurseFocusName], ["VS", vitals(n)], ["", n.symptom_when_receiving_duty], ["A", n.assessment],
      ["S", n.subject], ["O", n.object], ["I", n.implement], ["E", n.evaluation], ["", n.detail],
    ]).replace(/^Focus: [^\n]*(\nVS: [^\n]*)?$/, "")); // a focus header with no content is not a note

  const labs = Map.groupBy(
    await q(`select reportDate, testname, result, units from trlaborderresult l
             where visitId = ? and ${live("l")} and ifnull(result, '') <> '' order by reportDate, seq`, [id]),
    (l) => min(l.reportDate));
  for (const [at, rs] of labs) add(at, "lab", "Lab", rs.map((l) => `${l.testname} ${l.result}${l.units ? " " + l.units : ""}`).join("; "));

  for (const x of await q(`select * from trxrayorderresult x where visitId = ? and ${live("x")}`, [id]))
    add(x.reportDate ?? x.createDate, "lab", "รังสี", lines([["", x.itemname], ["", x.result_text], ["Impression", x.impression]]));

  for (const t of await q(
    `select t.* from trtreatmentorder t join trorder o on o.orderId = t.orderId where o.visitId = ? and ${live("t")}`, [id]))
    add(t.startTreatmentdatetime ?? t.treatmentdatetime ?? t.createDate, "procedure", author(t.createdBy), lines([
      ["", `${t.itemname}${t.ICD9 ? ` (ICD-9-CM ${t.ICD9})` : ""}`], ["", t.detail], ["สิ้นสุด", t.endTreatmentdatetime],
    ]));

  // The physician's discharge summary as entered in the HIS, with the codes the HIS already holds.
  const dx = await q(
    `select diagnosisType, doctordiagnosis, icd10, diagnosisname from trvisitdiagnosis d
     where visitId = ? and formType = 'DC Summary' and ${live("d")}
     order by field(diagnosisType, 'Principal Diagnosis', 'Co - morbidity', 'Complication', 'Other', 'External injury'), visitDiagnosisId`,
    [id]);
  add(v.dischargeDatetime ?? dc?.createDate ?? null, "progress", patient.attending, lines([
    ["", dx.length || dc || cs ? "สรุปจำหน่ายที่แพทย์บันทึกใน HIS (รหัสคือรหัสที่มีอยู่ใน HIS)" : ""],
    ...dx.map((d): [string, string] => [d.diagnosisType!, `${d.doctordiagnosis ?? ""}${d.icd10 ? ` → ${dotted(d.icd10)} ${d.diagnosisname ?? ""}` : ""}`]),
    ["Investigation", cs?.investigation], ["Operation", cs?.operation], ["Non-operation", cs?.nonoperation],
    ["Other treatment", cs?.other_treatment], ["Treatment summary", cs?.treatment_summary], ["Summary", cs?.summary],
    ["Result", cs?.result], ["Home medication", cs?.home_med], ["Follow up", cs?.follow_up], ["Advice", cs?.advice ?? dc?.advice],
    ["Refer", cs?.refer], ["Discharge status", dc?.dischargeStatus], ["Discharge type", dc?.typeOfDischarge],
    ["Transfer to", dc?.typeOfDischarge_transfer],
  ]));

  notes.sort((a, b) => a.at.localeCompare(b.at));
  await db.transaction(async (tx) => {
    await tx.exec(WARD_SCHEMA);
    const cols = Object.keys(patient);
    await tx.query(
      `insert into ward_patient (${cols}) values (${cols.map((_, i) => `$${i + 1}`)})
       on conflict (an) do update set ${cols.map((c) => `${c} = excluded.${c}`)}`, Object.values(patient));
    await tx.query("delete from ward_note where an = $1", [patient.an]);
    for (const [i, n] of notes.entries())
      await tx.query("insert into ward_note values ($1, $2, $3, $4, $5, $6)", [patient.an, i, n.at, n.kind, n.author, n.body]);
  });
  console.log(`${patient.an}  ${patient.ward}  ${notes.length} notes`);
}
console.log(`imported ${visits.length} admissions`);
await his.end();
await db.close();
