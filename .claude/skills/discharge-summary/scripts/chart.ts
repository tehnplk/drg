// Print an inpatient chart from the ward tables (HIS import: lib/his.ts) as text to review. Run from the project root.
// usage: node .claude/skills/discharge-summary/scripts/chart.ts [AN]   (no AN: list the charts)
import { db } from "../../../../lib/db.ts";
import { DISCHARGE_TYPES, losDays, type Note, type Patient } from "../../../../lib/ward.ts";

type Row = Record<string, string | number | null>;
const an = process.argv[2];
if (!an) {
  const { rows } = await db.query<Patient>("select * from ward_patient order by admit_at desc");
  for (const p of rows) console.log(`${p.an}\t${p.ward}\t${p.admit_at} → ${p.discharge_at}\t${p.working_dx}`);
} else {
  const p = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!p) throw new Error(`AN ${an} not found; import it with the import button on /discharges or: node scripts/import-his.ts ${an}`);
  const all = async (table: string, order = "seq") => (await db.query<Row>(`select * from ${table} where an = $1 order by ${order}`, [an])).rows;
  const [notes, meds, vitals, io, follows, beds, dx] = await Promise.all([
    db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [an]).then((r) => r.rows),
    all("ward_med"), all("ward_vital"), all("ward_io", "day"), all("ward_followup"), all("ward_bed"), all("ward_dx_his"),
  ]);
  const type = DISCHARGE_TYPES[p.discharge_type as keyof typeof DISCHARGE_TYPES];
  console.log(`# AN ${p.an}  HN ${p.hn}
sex ${p.sex === "1" ? "male" : "female"} · age ${p.age} y ${p.age_day} d · weight ${p.weight} kg · ${p.insurance}
ward ${p.ward} bed ${p.bed} · attending ${p.attending}
admit ${p.admit_at} · discharge ${p.discharge_at} · leave ${p.leave_days} d · LOS ${losDays(p)} d
discharge status ${p.discharge_status || "-"} · type ${p.discharge_type ? `${p.discharge_type} ${type}` : "-"}${p.transfer_to ? ` → ${p.transfer_to}` : ""}
working dx: ${p.working_dx}
`);
  if (beds.length) console.log(`## Ward / bed history\n${beds.map((b) => `${b.in_at} → ${b.out_at}  ${b.ward} ${b.bed}`).join("\n")}\n`);
  if (dx.length) console.log(`## Diagnoses recorded in the HIS (form · type · text · code)\n${dx.map((d) => `${d.form || "-"} · ${d.type} · ${d.text}${d.icd10 ? ` · ${d.icd10}` : ""}`).join("\n")}\n`);
  for (const n of notes) console.log(`## ${n.at} ${n.kind} — ${n.author}\n${n.body}\n`);

  // One line per distinct order (item, order type, status, dose, usage) with the dates it was ordered.
  const orders = Map.groupBy(meds, (m) => [m.item, m.order_type, m.status, m.dose, m.usage, m.route].join("|"));
  if (meds.length) console.log(`## Medication orders (order type · status · item · dose · route · usage · ordered at)\n${
    [...orders.values()].map((ms) => {
      const m = ms[0];
      const at = ms.map((x) => String(x.at)).sort();
      return `${m.order_type} · ${m.status} · ${m.item}${m.dose ? ` · ${m.dose}` : ""}${m.route ? ` · ${m.route}` : ""}${m.usage ? ` · ${m.usage}` : ""} · ${at[0]}${at.length > 1 ? ` … ${at.at(-1)} (${at.length}×)` : ""}`;
    }).join("\n")}\n`);
  const v = (x: string | number | null, label: string) => (x == null ? "" : ` ${label}${x}`);
  if (vitals.length) console.log(`## Vital signs flowsheet\n${vitals.map((s) =>
    `${s.at}${v(s.temp, "T ")}${v(s.pr, "PR ")}${s.sbp != null ? ` BP ${s.sbp}/${s.dbp ?? ""}` : ""}${v(s.rr, "RR ")}${v(s.map, "MAP ")}${v(s.spo2, "SpO2 ")}${v(s.gcs, "GCS ")}`).join("\n")}\n`);
  if (io.length) console.log(`## Intake / output per day (ml)\n${io.map((r) => `${r.day} in ${r.intake} out ${r.output}`).join("\n")}\n`);
  if (follows.length) console.log(`## Follow-up appointments\n${follows.map((f) => `${f.at || "date not set"} · ${f.clinic || "-"} · ${f.detail}`).join("\n")}\n`);
}
await db.close();
