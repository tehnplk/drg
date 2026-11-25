// HIS access through the read-only hm-api (docs/hm-api.md; HM_API_URL / HM_API_TOKEN in .env.local, VPN only).
// Server only: it reads the API token and writes the database.
import { db } from "./db.ts";
import { fingerprint, labFlag, scrubber, squash } from "./etl.ts";
import { encrypt } from "./pii.ts";
import { RAW_TABLES, WARD_SCHEMA, type DischargeType, type Note, type Patient } from "./ward.ts";

type Row = Record<string, string | null>;

// The API takes no bind parameters: each `?` becomes an escaped literal (an array becomes a list for `in (?)`).
const lit = (v: unknown): string =>
  Array.isArray(v) ? v.map(lit).join(", ") : typeof v === "number" ? String(v) : `'${String(v).replace(/[\\']/g, "\\$&")}'`;

// One response line -> cells. "|" separates; "\n", "\r" are line breaks, "\" + any other char is that char;
// a bare NULL is SQL NULL (the text 'NULL' comes as \NULL).
function cells(line: string) {
  const out: (string | null)[] = [];
  let cur = "", raw = "";
  for (let i = 0; i <= line.length; i++) {
    const c = line[i];
    if (c === "\\") { const e = line[++i]; cur += e === "n" ? "\n" : e === "r" ? "\r" : e; raw += c + e; }
    else if (c === "|" || c === undefined) out.push(raw === "NULL" ? null : cur), (cur = raw = "");
    else (cur += c), (raw += c);
  }
  return out;
}

async function q(sql: string, params: unknown[] = []): Promise<Row[]> {
  let p = 0;
  const res = await fetch(process.env.HM_API_URL!, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HM_API_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sql.replace(/\?/g, () => lit(params[p++])) }),
  });
  const body = (await res.json()) as { data?: string; error?: string };
  if (!res.ok) throw new Error(`hm-api ${res.status}: ${body.error}\n${sql}`);
  const [head, ...rows] = body.data!.split("\n").filter(Boolean);
  const cols = cells(head).map(String);
  return rows.map((r) => Object.fromEntries(cells(r).map((v, i) => [cols[i], v])));
}
const live = (t: string) => `ifnull(${t}.active, '') <> 'N'`;

const DISCHARGE_TYPE: Record<string, DischargeType> = {
  "With approveal": "1", "Against advice": "2", "By escape": "3", "By Transfer": "4", Other: "5",
  "Dead, autopsy": "8", "Dead, no autopsy": "9",
};

const min = (dt: string | null) => (dt ?? "").slice(0, 16); // "YYYY-MM-DD HH:MM"
const nowBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
const dotted = (icd10: string | null) => (icd10 && icd10.length > 3 ? `${icd10.slice(0, 3)}.${icd10.slice(3)}` : icd10 ?? "");
const num = (v: string | null) => (v == null || v.trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));

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

const PDX_TEXT = `(select d.doctordiagnosis from trvisitdiagnosis d
   where d.visitId = v.visitId and d.formType = 'DC Summary' and d.diagnosisType = 'Principal Diagnosis' and ${live("d")}
   order by d.visitDiagnosisId limit 1)`;

export type Discharged = Pick<Patient, "an" | "hn" | "sex" | "age" | "age_day" | "admit_at" | "discharge_at" | "leave_days"> & {
  name: string; // full name, shown on screen only; the ward tables keep it encrypted
  pdx_text: string | null; // the physician's principal diagnosis in the HIS D/C summary, null until written
};

export const MAX_DISCHARGED = 500; // ponytail: one page; add paging if a range ever needs more

// Inpatients discharged from one day to another, both inclusive ("YYYY-MM-DD", Asia/Bangkok as stored).
export async function dischargedBetween(from: string, to: string): Promise<Discharged[]> {
  const rows = await q(
    `select v.an, v.hn, v.admitDate, v.dischargeDatetime, v.totalLeaveDay, p.title, p.fname, p.lname, p.sex, p.birthday,
       ${PDX_TEXT} pdx_text
     from trvisit v join mspatient p on p.hn = v.hn
     where v.an <> '' and v.dischargeDatetime >= ? and v.dischargeDatetime < ? + interval 1 day
     order by v.dischargeDatetime, v.an
     limit ?`,
    [from, to, MAX_DISCHARGED],
  );
  return rows.map((v) => {
    const admit_at = min(v.admitDate);
    return {
      an: v.an!, hn: v.hn!, name: `${v.title ?? ""}${v.fname ?? ""}${v.lname ? " ***" : ""}`.trim(), // surname hidden on screen
      sex: v.sex === "ชาย" ? "1" : "2", ...ageAt(v.birthday, admit_at),
      admit_at, discharge_at: min(v.dischargeDatetime), leave_days: Number(v.totalLeaveDay) || 0, pdx_text: v.pdx_text,
    };
  });
}

export type SyncResult = { an: string; ward: string; hash: string; changed: boolean; counts: Record<string, number> };

// ETL for one inpatient: extract the chart from the HIS, de-identify it, and load it into the ward tables, where the
// audit, discharge-summary and DRG agents read it. Name, national ID and phone are kept only AES-encrypted, and the
// patient's own identifiers are scrubbed out of every free-text field. Running it again replaces every raw table
// for the AN in one transaction and keeps the draft and audit; `changed` says whether the HIS content differed.
export async function importAdmission(an: string): Promise<SyncResult> {
  // ── Extract ────────────────────────────────────────────────────────────────
  const [v] = await q(
    `select v.visitId, v.an, v.hn, v.admitDate, v.dischargeDatetime, v.totalLeaveDay, v.weight, v.diag_text,
       coalesce(nullif(v.roomno_dc, ''), v.cur_roomno, v.roomno) roomno, p.fname, p.lname, p.idcard, p.phone,
       p.sex, p.birthday, r.name insurance
     from trvisit v join mspatient p on p.hn = v.hn left join msrightstype r on r.rightsTypeId = v.rightsTypeId
     where v.an = ?`,
    [an],
  );
  if (!v) throw new Error(`ไม่พบ AN ${an} ใน HIS`);
  const id = v.visitId;
  const byVisit = (sql: string) => q(sql, [id]);

  const [users, [dc], [cs], beds, [room], admits, progress, nursing, labs, xrays, treatments, dx, meds, vs, io, follows, consults] =
    await Promise.all([
      q("select username, name from syuser"),
      byVisit(`select * from frmtrdcsummary d where visitId = ? and ${live("d")} order by updateDate desc limit 1`),
      byVisit(`select * from frmtrclinicalsummary c where visitId = ? and ${live("c")} order by updateDate desc limit 1`),
      byVisit(`select a.ward, coalesce(b.bedname, a.bedno) bed, a.indatetime, a.outdatetime from tradmit a
               left join msbedno b on b.bedno = a.bedno where a.visitId = ? and ${live("a")} order by a.seq`),
      q("select ward from msroom where roomno = ?", [v.roomno]),
      byVisit(`select * from tradmissionnote n where visitId = ? and ${live("n")} order by createDate`),
      byVisit(`select * from trprogressionnote n where visitId = ? and ${live("n")}`),
      byVisit(`select f.nurseFocusName, n.* from trnursenote n join trnursefocus f on f.nurseFocusId = n.nurseFocusId
               where f.visitId = ? and ${live("n")}`),
      // HM keeps lab results per order (lab_order_number), then per item (itemname), then per test (testname).
      byVisit(`select lab_order_number, itemname, reportDate, testname, result, units, ref, lab_note from trlaborderresult l
               where visitId = ? and ${live("l")} and ifnull(result, '') <> '' order by reportDate, lab_order_number, seq`),
      byVisit(`select x.*, o.reporter_name from trxrayorderresult x left join trxrayorder o on o.xrayOrderId = x.xrayOrderId
               where x.visitId = ? and ${live("x")}`),
      byVisit(`select t.* from trtreatmentorder t join trorder o on o.orderId = t.orderId where o.visitId = ? and ${live("t")}`),
      byVisit(`select formType, diagnosisType, doctordiagnosis, icd10, diagnosisname from trvisitdiagnosis d
               where visitId = ? and ${live("d")}
               order by formType, field(diagnosisType, 'Principal Diagnosis', 'Co - morbidity', 'Complication', 'Other', 'External injury'), visitDiagnosisId`),
      byVisit(`select d.createDate, d.orderType, d.status, d.itemtype, d.itemname, d.generic_name, d.dose, d.unit, d.route,
                 u.descname1, u.descname2, u.descname3
               from trdrugorder d join trorder o on o.orderId = d.orderId left join msdrugusage u on u.drugusagecode = d.drugUsage
               where o.visitId = ? and ${live("d")} and d.itemtype <> 'Supplies' and d.status <> 'Cancel'
               order by d.createDate, d.drugOrderId`),
      byVisit(`select CreateDate, TempC, PR, BPMax, BPMin, RR, map, O2Saturation, gcs from frmtrpnvs s
               where visitId = ? and ${live("s")} order by CreateDate`),
      byVisit(`select date(createDate) day, \`group\` g, sum(value) total from trintakeoutput i
               where visitId = ? and ${live("i")} group by date(createDate), \`group\` order by day`),
      byVisit(`select f.followdatetime, f.followRoomname, f.detail, f.noteFollow from trfolloworder f
               join trorder o on o.orderId = f.orderId where o.visitId = ? and ${live("f")} order by f.followdatetime`),
      byVisit(`select c.* from trconsultorder c join trorder o on o.orderId = c.orderId where o.visitId = ? and ${live("c")}
               order by c.consultdatetime`),
    ]);

  // ── Transform ──────────────────────────────────────────────────────────────
  const scrub = scrubber({ fname: v.fname, lname: v.lname, cid: v.idcard, phone: v.phone });
  const names = new Map(users.map((u) => [u.username, u.name ?? ""]));
  const author = (username: string | null) => (username && names.get(username)) || username || "";
  const last = beds.findLast((b) => b.ward);

  const admit_at = min(v.admitDate);
  const patient: Patient = {
    an: v.an!, hn: v.hn!, name: `HN ${v.hn}`, // the name itself is only in fname_enc / lname_enc
    sex: v.sex === "ชาย" ? "1" : "2",
    ...ageAt(v.birthday, admit_at),
    weight: Number(v.weight) || Number(admits[0]?.weight) || 0,
    ward: last?.ward || room?.ward || v.roomno || "", bed: last?.bed ?? "",
    insurance: v.insurance ?? "", attending: dc?.attendingPhysician ?? "", working_dx: scrub(v.diag_text ?? ""),
    admit_at,
    discharge_at: min(v.dischargeDatetime) || nowBkk(), // ponytail: still admitted -> LOS so far
    leave_days: Number(v.totalLeaveDay) || 0,
    discharge_status: dc?.dischargeStatus ?? "",
    discharge_type: DISCHARGE_TYPE[dc?.typeOfDischarge ?? ""] ?? ("" as DischargeType), // "" = not summarised yet
    transfer_to: dc?.typeOfDischarge_transfer ?? "",
  };

  const notes: Note[] = [];
  const add = (at: string | null, kind: Note["kind"], who: string, body: string) =>
    body && notes.push({ at: min(at), kind, author: who, body: scrub(body) });

  for (const n of admits)
    add(n.createDate, "admission", author(n.createdBy), lines([
      ["CC", n.chiefComplain], ["PI", n.presentIlness], ["PH", n.pastHistory], ["Drug allergy", n.drugAllergy],
      ["Previous operation", n.previousOperation], ["FH", n.familyHistory], ["PE", n.physicalExamination], ["VS", vitals(n)],
      ["Indication", n.indicationForAdmission], ["Plan", n.treatmentPlan], ["Comment", n.comment],
    ]));

  for (const n of progress)
    add(n.createDate, "progress", author(n.createdBy), lines([["", n.S], ["P", n.P], ["", n.Note]]));

  for (const n of nursing)
    add(n.createDate, "nursing", author(n.createdBy), lines([
      ["Focus", n.nurseFocusName], ["VS", vitals(n)], ["", n.symptom_when_receiving_duty], ["A", n.assessment],
      ["S", n.subject], ["O", n.object], ["I", n.implement], ["E", n.evaluation], ["", n.detail],
    ]).replace(/^Focus: [^\n]*(\nVS: [^\n]*)?$/, "")); // a focus header with no content is not a note

  for (const c of consults)
    add(c.consultdatetime ?? c.createDate, "consult", author(c.createdBy), lines([
      ["Consult", squash(c.itemname, c.spclty && `(${c.spclty})`)], ["ปัญหา", c.problemConsult], ["ประวัติ", c.history],
      ["รายละเอียด", c.detail ?? c.detailDoctor], ["ผลตรวจร่างกาย", c.reportPhysicalExam],
      ["ตอบโดย", c.consultUsernameAnswer && squash(author(c.consultUsernameAnswer), min(c.consultDatetimeAnswer))],
      ["สถานะ", c.statusConsult],
    ]));

  const labRows = labs.map((l) => ({
    at: min(l.reportDate), order_no: l.lab_order_number ?? "", item: l.itemname ?? "", test: l.testname ?? "",
    result: l.result ?? "", unit: l.units ?? "", ref: l.ref ?? "", flag: labFlag(l.result ?? "", l.ref), note: scrub(l.lab_note ?? ""),
  }));
  // One note per lab order as HM keeps it, one line per item: "Electrolytes: Sodium (Na) 129 mmol/L (L) · Potassium (K) 4.1 mmol/L".
  const FLAG_TEXT = { H: " (H)", L: " (L)", image: " [ผลเป็นภาพ ไม่มีค่าในระบบ]", "": "" };
  const value = (l: (typeof labRows)[number]) => `${l.test} ${l.result}${l.unit ? " " + l.unit : ""}${FLAG_TEXT[l.flag]}`;
  for (const rs of Map.groupBy(labRows, (l) => l.order_no || l.at).values())
    add(rs[0].at, "lab", "LAB", [
      ...[...Map.groupBy(rs, (l) => l.item).entries()].map(([item, ts]) =>
        ts.length === 1 && ts[0].test === item ? value(ts[0]) : `${item}: ${ts.map(value).join(" · ")}`),
      ...[...new Set(rs.map((l) => l.note).filter(Boolean))].map((n) => `หมายเหตุ: ${n}`),
    ].join("\n"));

  for (const x of xrays)
    add(x.reportDate ?? x.createDate, "lab", x.reporter_name ? `X-RAY · ${x.reporter_name}` : "X-RAY",
      lines([["", x.itemname], ["", x.result_text], ["Impression", x.impression]]));

  for (const t of treatments)
    add(t.startTreatmentdatetime ?? t.treatmentdatetime ?? t.createDate, "procedure", author(t.createdBy), lines([
      ["", `${t.itemname}${t.ICD9 ? ` (ICD-9-CM ${t.ICD9})` : ""}`], ["", t.detail], ["สิ้นสุด", t.endTreatmentdatetime],
    ]));

  // The physician's discharge summary as entered in the HIS, with the codes the HIS already holds.
  const dcDx = dx.filter((d) => d.formType === "DC Summary");
  add(v.dischargeDatetime ?? dc?.createDate ?? null, "progress", patient.attending, lines([
    ["", dcDx.length || dc || cs ? "สรุปจำหน่ายที่แพทย์บันทึกใน HIS (รหัสคือรหัสที่มีอยู่ใน HIS)" : ""],
    ...dcDx.map((d): [string, string] => [d.diagnosisType!, `${d.doctordiagnosis ?? ""}${d.icd10 ? ` → ${dotted(d.icd10)} ${d.diagnosisname ?? ""}` : ""}`]),
    ["Investigation", cs?.investigation], ["Operation", cs?.operation], ["Non-operation", cs?.nonoperation],
    ["Other treatment", cs?.other_treatment], ["Treatment summary", cs?.treatment_summary], ["Summary", cs?.summary],
    ["Result", cs?.result], ["Home medication", cs?.home_med], ["Follow up", cs?.follow_up], ["Advice", cs?.advice ?? dc?.advice],
    ["Refer", cs?.refer], ["Discharge status", dc?.dischargeStatus], ["Discharge type", dc?.typeOfDischarge],
    ["Transfer to", dc?.typeOfDischarge_transfer],
  ]));
  notes.sort((a, b) => a.at.localeCompare(b.at));

  const ioDays = Map.groupBy(io, (r) => r.day ?? "");
  const raw = {
    ward_note: notes,
    ward_lab: labRows,
    ward_med: meds.map((m) => ({
      at: min(m.createDate), order_type: m.orderType ?? "", status: m.status ?? "", item_type: m.itemtype ?? "",
      item: squash(m.itemname), generic: m.generic_name ?? "", dose: m.dose ?? "", unit: m.unit ?? "", route: m.route ?? "",
      usage: squash(m.descname1, m.descname2, m.descname3),
    })),
    ward_vital: vs.map((s) => ({
      at: min(s.CreateDate), temp: num(s.TempC), pr: num(s.PR), sbp: num(s.BPMax), dbp: num(s.BPMin), rr: num(s.RR),
      map: num(s.map), spo2: num(s.O2Saturation), gcs: s.gcs,
    })),
    ward_io: [...ioDays].map(([day, rs]) => ({
      day,
      intake: rs.filter((r) => r.g === "Intake").reduce((n, r) => n + (num(r.total) ?? 0), 0),
      output: rs.filter((r) => r.g === "Output").reduce((n, r) => n + (num(r.total) ?? 0), 0),
    })),
    ward_followup: follows
      .filter((f) => f.followdatetime || f.detail || f.followRoomname)
      .map((f) => ({ at: min(f.followdatetime), clinic: squash(f.followRoomname), detail: scrub(squash(f.detail, f.noteFollow)) })),
    ward_bed: beds.filter((b) => b.ward).map((b) => ({ ward: b.ward!, bed: b.bed ?? "", in_at: min(b.indatetime), out_at: min(b.outdatetime) })),
    ward_dx_his: dx.filter((d) => d.doctordiagnosis?.trim() || d.icd10?.trim()).map((d) => ({
      form: d.formType ?? "", type: d.diagnosisType ?? "", text: scrub(d.doctordiagnosis?.trim() ?? ""), icd10: d.icd10?.trim() ?? "",
    })),
  } satisfies Record<(typeof RAW_TABLES)[number], Record<string, unknown>[]>;

  // The fingerprint is of what HM returned, not of how it is shown here, so changing the display never marks an
  // audit or draft as stale; only a change in the HIS does. The identifying fields are left out: hashing them would leak them.
  const visit = Object.fromEntries(Object.entries(v).filter(([k]) => !["fname", "lname", "idcard", "phone"].includes(k)));
  const hash = fingerprint({ visit, dc, cs, beds, room, admits, progress, nursing, labs, xrays, treatments, dx, meds, vs, io, follows, consults });
  const counts = Object.fromEntries(Object.entries(raw).map(([t, rs]) => [t.replace("ward_", ""), rs.length]));

  // ── Load ───────────────────────────────────────────────────────────────────
  const changed = await db.transaction(async (tx) => {
    await tx.exec(WARD_SCHEMA);
    const put = async (table: string, row: Record<string, unknown>, conflict = "") => {
      const cols = Object.keys(row);
      await tx.query(`insert into ${table} (${cols}) values (${cols.map((_, i) => `$${i + 1}`)}) ${conflict}`, Object.values(row));
    };
    const before = (await tx.query<{ hash: string }>("select hash from ward_sync where an = $1", [an])).rows[0]?.hash;

    const row = {
      ...patient,
      fname_enc: encrypt(v.fname), lname_enc: encrypt(v.lname), cid_enc: encrypt(v.idcard), phone_enc: encrypt(v.phone),
    };
    await put("ward_patient", row, `on conflict (an) do update set ${Object.keys(row).map((c) => `${c} = excluded.${c}`)}`);
    for (const table of RAW_TABLES) {
      await tx.query(`delete from ${table} where an = $1`, [an]);
      for (const [seq, r] of raw[table].entries()) await put(table, table === "ward_io" ? { an, ...r } : { an, seq, ...r });
    }
    await put("ward_sync", { an, synced_at: nowBkk(), hash, counts: JSON.stringify(counts) },
      "on conflict (an) do update set synced_at = excluded.synced_at, hash = excluded.hash, counts = excluded.counts");
    return before !== hash;
  });
  return { an: patient.an, ward: patient.ward, hash, changed, counts };
}
