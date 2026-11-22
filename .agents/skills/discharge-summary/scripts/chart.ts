// Print an inpatient chart from the ward tables (HIS import: scripts/import-his.ts) as text to review. Run from the project root.
// usage: node .agents/skills/discharge-summary/scripts/chart.ts [AN]   (no AN: list the charts)
import { db } from "../../../../lib/db.ts";
import { DISCHARGE_TYPES, losDays, type Note, type Patient } from "../../../../lib/ward.ts";

const an = process.argv[2];
if (!an) {
  const { rows } = await db.query<Patient>("select * from ward_patient order by admit_at desc");
  for (const p of rows) console.log(`${p.an}\t${p.ward}\t${p.admit_at} → ${p.discharge_at}\t${p.working_dx}`);
} else {
  const p = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!p) throw new Error(`AN ${an} not found; import it with: node scripts/import-his.ts ${an}`);
  const notes = (await db.query<Note>("select at, kind, author, body from ward_note where an = $1 order by seq", [an])).rows;
  const type = DISCHARGE_TYPES[p.discharge_type as keyof typeof DISCHARGE_TYPES];
  console.log(`# AN ${p.an}  HN ${p.hn}
sex ${p.sex === "1" ? "male" : "female"} · age ${p.age} y ${p.age_day} d · weight ${p.weight} kg · ${p.insurance}
ward ${p.ward} bed ${p.bed} · attending ${p.attending}
admit ${p.admit_at} · discharge ${p.discharge_at} · leave ${p.leave_days} d · LOS ${losDays(p)} d
discharge status ${p.discharge_status || "-"} · type ${p.discharge_type ? `${p.discharge_type} ${type}` : "-"}${p.transfer_to ? ` → ${p.transfer_to}` : ""}
working dx: ${p.working_dx}
`);
  for (const n of notes) console.log(`## ${n.at} ${n.kind} — ${n.author}\n${n.body}\n`);
}
await db.close();
