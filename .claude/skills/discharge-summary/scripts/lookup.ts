// Look up ICD-10 / ICD-9-CM codes or search ICD-10 names in the repo's PGlite tables. Run from the project root.
// usage: node .claude/skills/discharge-summary/scripts/lookup.ts <code | "search words"> ...
import { db } from "../../../../lib/db.ts";

const q = async (sql: string, params: unknown[]) => (await db.query<Record<string, unknown>>(sql, params)).rows;

for (const raw of process.argv.slice(2)) {
  const arg = raw.trim();
  const code = arg.toUpperCase().replace(/\./g, "");
  if (/^[A-Z]\d{2,5}$/.test(code)) {
    const name = await q(`select "desc", valid from icd10_desc where code = $1`, [code]);
    const tgrp = await q(
      `select mdc, pdc, cc, accpdx, sex, agemin, agemax, ageduse, agedmin, trauma from i10 where code = $1`, [code]);
    console.log(JSON.stringify({
      code, kind: "ICD-10", dx_name: name[0]?.desc ?? null,
      valid: name[0] ? name[0].valid === 1 : false, // 0 = header with subdivisions
      in_tgrp: tgrp.length > 0, // false: TGrp rejects it (invalid PDx, SDx dropped)
      tgrp,
    }));
  } else if (/^\d{2,4}$/.test(code)) {
    const name = await q(`select "desc", valid from icd9_desc where code = $1`, [code]);
    const tgrp = await q(`select orp, procgr as orp_group, proclev, mmdc, omdcs, sex from proc where code = $1`, [code]);
    console.log(JSON.stringify({
      code, kind: "ICD-9-CM", dx_name: name[0]?.desc ?? null,
      valid: name[0] ? name[0].valid === 1 : false, in_tgrp: tgrp.length > 0, tgrp,
    }));
  } else {
    // ICD-10 names use British spelling (haemorrhage, anaemia, oesophagus): fold ae/oe -> e on both sides
    const fold = (s: string) => s.toLowerCase().replace(/ae|oe/g, "e");
    const words = arg.split(/\s+/).filter(Boolean).map((w) => `%${fold(w)}%`);
    const rows = await q(
      `select code, "desc", valid from icd10_desc
        where regexp_replace(lower("desc"), 'ae|oe', 'e', 'g') like all($1) order by valid desc, code limit 25`, [words]);
    console.log(JSON.stringify({ search: arg, results: rows }));
  }
}
await db.close();
