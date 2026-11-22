import { db } from "@/lib/db.ts";

// Lookups shaped like had-api.moph.go.th/cmi/libs/*: { status, rowcount, rows }

// Thai DRG 6.3.3 manual, chapter 5
const ERRORS: Record<string, string> = {
  1: "No principal diagnosis",
  2: "Invalid principal diagnosis",
  3: "Unacceptable principal diagnosis",
  4: "Principal diagnosis not valid for age",
  5: "Principal diagnosis not valid for sex",
  6: "Age error",
  7: "Ungroupable due to sex error",
  8: "Ungroupable due to discharge type error",
  9: "Length of stay error",
  10: "Ungroupable due to admission weight error",
};
const WARNINGS: Record<number, string> = {
  1: "SDx ใช้ไม่ได้ หรือซ้ำกับ PDx หรือซ้ำกันเอง",
  2: "SDx ไม่เหมาะกับอายุ",
  4: "SDx ไม่เหมาะกับเพศ หรือเป็นรหัสสำหรับเพศใดเพศหนึ่งแต่ไม่มีข้อมูลเพศ",
  8: "Proc ใช้ไม่ได้ หรือซ้ำกันเอง",
  16: "Proc ไม่เหมาะกับเพศ หรือเป็นรหัสสำหรับเพศใดเพศหนึ่งแต่ไม่มีข้อมูลเพศ",
  32: "ไม่มีข้อมูลเพศ หรือใช้รหัสนอกเหนือจากที่กำหนด",
  64: "ไม่มีประเภทการจำหน่าย หรือใช้รหัสนอกเหนือจากที่กำหนด",
  128: "ไม่มีวันที่/เวลารับไว้ หรือไม่ถูกต้อง",
  256: "ไม่มีวันที่/เวลาจำหน่าย หรือไม่ถูกต้อง",
};

const fold = (s: string) => s.toLowerCase().replace(/ae|oe/g, "e");
const ok = (rows: object[]) => Response.json({ status: 200, rowcount: rows.length, rows });

export async function GET(_req: Request, ctx: RouteContext<"/api/libs/[table]/[code]">) {
  const { table, code: rawCode } = await ctx.params;
  const decoded = decodeURIComponent(rawCode).trim();
  const c = decoded.toUpperCase().replace(/\./g, "");

  if (table === "drg-error") return ok(ERRORS[c] ? [{ code: Number(c), name: ERRORS[c] }] : []);
  if (table === "drg-warning") {
    // warn is a bit sum, e.g. 9 = 1 + 8
    const n = Number(c);
    return ok(Object.entries(WARNINGS).filter(([bit]) => n & Number(bit)).map(([bit, name]) => ({ code: Number(bit), name })));
  }
  if (table === "drg-name") {
    return ok((await db.query("select * from drg where drg = $1", [c])).rows as object[]);
  }
  if (table === "icd10") {
    // Start from icd10_desc so external causes (V-Y) and header codes (valid=0) still return their official name and validity.
    const rows = (await db.query(
      `select d.code, d."desc", d.valid, (i.code is not null) as in_tgrp,
              (d.code ~ '^[VWXY]') as is_external_cause,
              i.mdc, i.pdc, i.cc, i.maincc, i.accpdx, i.sex, i.agemin, i.agemax, i.ageduse, i.agedmin, i.trauma
         from icd10_desc d
         left join i10 i on i.code = d.code
        where d.code = $1`,
      [c],
    )).rows as object[];
    return ok(rows);
  }
  if (table === "icd-cm") {
    // Strip optional +<units><setting> extension (e.g. 8622+21 -> 8622) and support Appendix C combination codes (e.g. C4445).
    const base = c.split("+")[0];
    const rows = (await db.query(
      `select coalesce(p.code, d.code) as code,
              coalesce(d."desc", p."desc") as "desc",
              coalesce(d.valid, case when p.code is not null then 1 else 0 end) as valid,
              (p.code is not null) as in_tgrp,
              p.orp, p.procgr, p.proclev, p.mmdc, p.omdcs, p.sex, p.site, p.drguse
         from proc p
         full outer join icd9_desc d on d.code = p.code
        where coalesce(p.code, d.code) = $1`,
      [base],
    )).rows as object[];
    return ok(rows);
  }
  if (table === "icd10-search" || table === "icd9-search") {
    const words = decoded.split(/\s+/).filter(Boolean).map((w) => `%${fold(w)}%`);
    if (words.length === 0) return ok([]);
    const tbl = table === "icd10-search" ? "icd10_desc" : "icd9_desc";
    const rows = (await db.query(
      `select code, "desc", valid from ${tbl}
        where regexp_replace(lower("desc"), 'ae|oe', 'e', 'g') like all($1)
        order by valid desc, code limit 25`,
      [words],
    )).rows as object[];
    return ok(rows);
  }

  return Response.json({ status: 404, message: `ไม่รู้จัก ${table}` }, { status: 404 });
}
