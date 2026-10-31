import { db } from "../db.ts";

// Thai DRG 6.3.3 vol 1, Appendix F: DCL per diagnosis in the DC -> recursive CC exclusion -> PCL.

export type Dcl = { code: string; dcl: number };

// Sort by DCL desc, ties by code desc; walk left to right and drop every code whose exclusion
// list contains a code already kept. excludes(a, b) = "b is in a's CC exclusion list".
export function computePcl(dcls: Dcl[], excludes: (code: string, by: string) => boolean): number {
  const sorted = dcls
    .filter((d) => d.dcl > 0)
    .sort((a, b) => b.dcl - a.dcl || (a.code < b.code ? 1 : a.code > b.code ? -1 : 0));
  const kept: Dcl[] = [];
  for (const d of sorted) if (!kept.some((k) => excludes(d.code, k.code))) kept.push(d);
  const sum = kept.reduce((s, d, i) => s + d.dcl * 0.82 ** i, 0);
  return Math.min(9, Math.floor(sum + 0.5 + 1e-9));
}

// PDx and SDx codes (already validated and de-duplicated) for a DC.
export async function pcl(dc: string, dx: string[]): Promise<number> {
  const codes = [...new Set(dx)];
  const { rows } = await db.query<Dcl>(
    `select x.code, coalesce(d.dcl, 0) as dcl
       from unnest($2::text[]) as x(code)
       left join dcl_alias a on a.code = x.code
       left join dcl d on d.code = coalesce(a.main, x.code) and d.dc = $1`,
    [dc, codes],
  );
  // c63ccex is keyed by the excluded code's MAINCC (from c63i10), e.g. S720 -> S72012
  const main = new Map(
    (await db.query<{ code: string; maincc: string }>(
      "select distinct code, maincc from i10 where code = any($1) and maincc is not null", [codes],
    )).rows.map((r) => [r.code, r.maincc]),
  );
  const ex = await db.query<{ cc10: string; notfor10: string }>(
    "select cc10, notfor10 from ccex where cc10 = any($1) and notfor10 = any($2)",
    [[...new Set(main.values())], codes],
  );
  const pairs = new Set(ex.rows.map((r) => `${r.cc10}|${r.notfor10}`));
  return computePcl(rows, (code, by) => pairs.has(`${main.get(code)}|${by}`));
}

export async function drgFor(dc: string, pclValue: number): Promise<string | undefined> {
  const { rows } = await db.query<{ drg: string }>(
    "select drg from drg_pcl where dc = $1 and $2 between pcl_min and pcl_max",
    [dc, pclValue],
  );
  return rows[0]?.drg;
}
