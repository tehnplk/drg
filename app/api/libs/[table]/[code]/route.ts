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

const SQL: Record<string, string> = {
  "drg-name": "select * from drg where drg = $1",
  icd10: `select i.*, d."desc" from i10 i left join icd10_desc d on d.code = i.code where i.code = $1`,
  "icd-cm": "select * from proc where code = $1",
};

const ok = (rows: object[]) => Response.json({ status: 200, rowcount: rows.length, rows });

export async function GET(_req: Request, ctx: RouteContext<"/api/libs/[table]/[code]">) {
  const { table, code } = await ctx.params;
  const c = code.toUpperCase().replace(/\./g, "");

  if (table === "drg-error") return ok(ERRORS[c] ? [{ code: Number(c), name: ERRORS[c] }] : []);
  if (table === "drg-warning") {
    // warn is a bit sum, e.g. 9 = 1 + 8
    const n = Number(c);
    return ok(Object.entries(WARNINGS).filter(([bit]) => n & Number(bit)).map(([bit, name]) => ({ code: Number(bit), name })));
  }
  if (!SQL[table]) return Response.json({ status: 404, message: `ไม่รู้จัก ${table}` }, { status: 404 });
  return ok((await db.query(SQL[table], [c])).rows as object[]);
}
