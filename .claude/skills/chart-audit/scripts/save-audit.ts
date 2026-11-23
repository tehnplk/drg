// Save a finished chart audit so the /discharges screen shows its status. Run from the project root:
//   node .claude/skills/chart-audit/scripts/save-audit.ts <AN> <blocking|gaps|ready> <report.md>
// The AN must be imported (ward_patient). Saving again replaces the previous audit.
import { readFileSync } from "node:fs";
import { db } from "../../../../lib/db.ts";
import { AUDIT_STATUS, WARD_SCHEMA } from "../../../../lib/ward.ts";

const [an, status, file] = process.argv.slice(2);
if (!an || !(status in AUDIT_STATUS) || !file)
  throw new Error(`usage: save-audit.ts <AN> <${Object.keys(AUDIT_STATUS).join("|")}> <report.md>`);

const at = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
await db.exec(WARD_SCHEMA);
// The fingerprint of the chart this audit read, so a later sync that changes the HIS content marks it stale.
// version null: the schema below keeps this report as a new version in ward_history (no AI result or model with it).
await db.query(
  `insert into ward_audit (an, status, at, report, hash) values ($1, $2, $3, $4, (select hash from ward_sync where an = $1))
   on conflict (an) do update set status = excluded.status, at = excluded.at, report = excluded.report, hash = excluded.hash,
     result = null, model = null, version = null`,
  [an, status, at, readFileSync(file, "utf8")],
);
await db.exec(WARD_SCHEMA);
console.log(`saved audit ${an}: ${status} (${AUDIT_STATUS[status as keyof typeof AUDIT_STATUS]})`);
await db.close();
