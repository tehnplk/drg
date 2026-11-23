// Look up ICD-10 / ICD-9-CM / Appendix C procedure codes or search ICD-10 & ICD-9-CM names in the PostgreSQL tables.
// Run from the project root.
// usage:
//   node .agents/skills/discharge-summary/scripts/lookup.ts J18.9 96.04 86.22+21 C4445 V09.9 "lobar pneumonia" "mech vent"
//   node .agents/skills/discharge-summary/scripts/lookup.ts dx:"acute kidney" proc:"transfus"
import { db } from "../../../../lib/db.ts";

type Row = Record<string, unknown>;
const q = async <T extends Row = Row>(sql: string, params: unknown[]) => (await db.query<T>(sql, params)).rows;
const fold = (s: string) => s.toLowerCase().replace(/ae|oe/g, "e");

// Expand common clinical terms to ICD-9-CM abbreviated stems when searching icd9_desc
const ICD9_SYNONYMS: Record<string, string> = {
  ventilator: "mech vent",
  ventilation: "mech vent",
  intubation: "endotrach",
  transfusion: "transfus",
  abdominocentesis: "abdominal drainage",
  paracentesis: "abdominal drainage",
  hemodialysis: "hemodial",
  chemotherapy: "chemother",
  radiotherapy: "radiother",
  debridement: "debrid",
};

async function lookupIcd10(code: string) {
  const name = await q<{ desc: string; valid: number }>(`select "desc", valid from icd10_desc where code = $1`, [code]);
  const tgrp = await q(
    `select mdc, pdc, cc, maincc, accpdx, sex, agemin, agemax, ageduse, agedmin, trauma from i10 where code = $1`,
    [code],
  );
  const isExternalCause = /^[VWXY]/.test(code);
  return {
    code,
    kind: "ICD-10" as const,
    dx_name: name[0]?.desc ?? null,
    valid: name[0] ? name[0].valid === 1 : false, // 0 = header with subdivisions
    is_external_cause: isExternalCause,
    in_tgrp: tgrp.length > 0,
    ...(isExternalCause && name[0]?.valid === 1
      ? { note: "Valid ICD-10 external cause; record in External cause, do NOT pass in TGrp pdx/sdx" }
      : {}),
    tgrp,
  };
}

async function lookupProc(rawCode: string) {
  const [base, ext] = rawCode.split("+");
  const name = await q<{ desc: string; valid: number }>(`select "desc", valid from icd9_desc where code = $1`, [base]);
  const tgrp = await q<{
    orp: string;
    orp_group: number;
    proclev: number;
    mmdc: string;
    omdcs: string | null;
    sex: string;
    site: string;
    desc: string | null;
  }>(
    `select orp, procgr as orp_group, proclev, mmdc, omdcs, sex, site, "desc" from proc where code = $1`,
    [base],
  );
  const isCombo = /^[A-Z]/.test(base) && tgrp.length > 0;
  return {
    code: rawCode,
    base_code: base,
    ...(ext ? { extension: `+${ext}` } : {}),
    kind: isCombo ? ("ICD-9-CM-COMBO" as const) : ("ICD-9-CM" as const),
    dx_name: name[0]?.desc ?? tgrp[0]?.desc ?? null,
    valid: name[0] ? name[0].valid === 1 : isCombo,
    in_tgrp: tgrp.length > 0,
    tgrp: tgrp.map(({ desc: _d, ...rest }) => rest),
  };
}

async function searchNames(query: string, scope: "both" | "dx" | "proc") {
  const rawWords = query.split(/\s+/).filter(Boolean);
  const dxWords = rawWords.map((w) => `%${fold(w)}%`);
  const procWords = rawWords.flatMap((w) => {
    const mapped = ICD9_SYNONYMS[w.toLowerCase()] ?? w;
    return mapped.split(/\s+/).map((p) => `%${fold(p)}%`);
  });

  const icd10 =
    scope === "proc"
      ? undefined
      : await q(
          `select code, "desc", valid from icd10_desc
            where regexp_replace(lower("desc"), 'ae|oe', 'e', 'g') like all($1)
            order by valid desc, code limit 15`,
          [dxWords],
        );
  const icd9 =
    scope === "dx"
      ? undefined
      : await q(
          `select code, "desc", valid from icd9_desc
            where regexp_replace(lower("desc"), 'ae|oe', 'e', 'g') like all($1)
            order by valid desc, code limit 15`,
          [procWords],
        );

  return {
    search: query,
    scope,
    ...(icd10 !== undefined ? { icd10 } : {}),
    ...(icd9 !== undefined ? { icd9 } : {}),
  };
}

for (const raw of process.argv.slice(2)) {
  const arg = raw.trim();
  if (!arg) continue;

  if (/^dx:/i.test(arg)) {
    console.log(JSON.stringify(await searchNames(arg.slice(3).trim(), "dx")));
    continue;
  }
  if (/^proc:/i.test(arg)) {
    const rest = arg.slice(5).trim();
    const cleaned = rest.toUpperCase().replace(/\./g, "");
    if (/^(\d{2,4}(\+\d{1,3})?|[A-Z][A-Z0-9]{3,5})$/.test(cleaned)) {
      console.log(JSON.stringify(await lookupProc(cleaned)));
    } else {
      console.log(JSON.stringify(await searchNames(rest, "proc")));
    }
    continue;
  }

  const code = arg.toUpperCase().replace(/\./g, "");
  if (/^\d{2,4}(\+\d{1,3})?$/.test(code)) {
    console.log(JSON.stringify(await lookupProc(code)));
  } else if (/^C[A-Z]\d{3}$/.test(code)) {
    // Appendix C combination code (e.g. CE002)
    console.log(JSON.stringify(await lookupProc(code)));
  } else if (/^[A-Z]\d{2,5}$/.test(code)) {
    // Check ICD-10 first; if absent from icd10_desc, fall back to Appendix C proc codes (e.g. C4445)
    const i10Res = await lookupIcd10(code);
    if (i10Res.dx_name === null && !i10Res.in_tgrp && code.startsWith("C")) {
      const procRes = await lookupProc(code);
      if (procRes.in_tgrp) {
        console.log(JSON.stringify(procRes));
        continue;
      }
    }
    console.log(JSON.stringify(i10Res));
  } else {
    console.log(JSON.stringify(await searchNames(arg, "both")));
  }
}

await db.close();
