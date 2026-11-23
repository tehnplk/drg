// Import inpatients from the HIS into the ward tables, one AN at a time (lib/his.ts). The /discharges screen does the
// same per patient with its import button.
// usage: node scripts/import-his.ts <AN> [AN ...]
import { db } from "../lib/db.ts";
import { importAdmission } from "../lib/his.ts";

const ans = process.argv.slice(2);
if (!ans.length) throw new Error("usage: node scripts/import-his.ts <AN> [AN ...]");

for (const an of ans) {
  const r = await importAdmission(an);
  console.log(`${r.an}  ${r.ward}  ${r.changed ? "changed" : "unchanged"}  ${JSON.stringify(r.counts)}`);
}
await db.close();
