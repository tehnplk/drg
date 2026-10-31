import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../db.ts";

// Everything the TDRG 6.3 grouper reads, loaded once from PGlite into memory.

export type DxRow = {
  code: string; mdc: string; pdc: string; cc: boolean; maincc: string | null; sex: string; accpdx: string;
  ageduse: string; agemin: number; agemax: number; agedmin: number; trauma: string; hiv_ax: string | null; mosdx: number;
};
export type ProcRow = {
  code: string; orp: string; sex: string; site: string; procgr: number; proclev: number; mmdc: string; omdcs: string;
  mosproc: number; mosdc: string; moshierar: string; drguse: boolean;
};
export type DrgRow = { drg: string; mdc: string; dc: string; rw0d: number; rw: number; wtlos: number; ot: number; mdf: number; drgname: string };
export type DcDef = { dc: string; mdc: string; name: string; alts: string[] };

export type Data = {
  dx: Map<string, DxRow[]>; // one row per MDC (sex-specific codes have two)
  proc: Map<string, ProcRow>;
  procPdc: Map<string, { code: string; pdc: string }[]>; // by MDC
  ax: Map<string, Set<string>>; // AX name -> codes (ICD-9 entries may carry >1 / *1 / CEnnn=a&b)
  dcs: DcDef[];
  drg: Map<string, DrgRow>;
  drgPcl: { drg: string; dc: string; pcl_min: number; pcl_max: number }[];
  dcl: Map<string, Map<string, number>>; // code -> dc -> DCL
  dclAlias: Map<string, string>;
  ccex: Map<string, Set<string>>; // MAINCC -> codes that exclude it
};

let loading: Promise<Data> | undefined;
export const loadData = () => (loading ??= load());

async function load(): Promise<Data> {
  const q = async <T,>(sql: string) => (await db.query<T>(sql)).rows;
  const group = <T, K>(rows: T[], key: (r: T) => K) => {
    const m = new Map<K, T[]>();
    for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r);
    return m;
  };

  const dcl = new Map<string, Map<string, number>>();
  for (const r of await q<{ code: string; dc: string; dcl: number }>("select code, dc, dcl from dcl")) {
    (dcl.get(r.code) ?? dcl.set(r.code, new Map()).get(r.code)!).set(r.dc, r.dcl);
  }
  const ccex = new Map<string, Set<string>>();
  for (const r of await q<{ cc10: string; notfor10: string }>("select cc10, notfor10 from ccex")) {
    (ccex.get(r.cc10) ?? ccex.set(r.cc10, new Set()).get(r.cc10)!).add(r.notfor10);
  }
  const ax = new Map<string, Set<string>>();
  for (const r of await q<{ ax: string; code: string }>("select ax, code from ax")) {
    (ax.get(r.ax) ?? ax.set(r.ax, new Set()).get(r.ax)!).add(r.code);
  }
  const dcs: DcDef[] = JSON.parse(await readFile(path.join(process.cwd(), "grouper", "tdrg633", "dc-def.json"), "utf8"));

  return {
    dx: group(await q<DxRow>("select * from i10"), (r) => r.code),
    proc: new Map((await q<ProcRow>("select * from proc")).map((r) => [r.code, r])),
    procPdc: group(await q<{ mdc: string; code: string; pdc: string }>("select * from proc_pdc"), (r) => r.mdc) as Data["procPdc"],
    ax,
    dcs,
    drg: new Map((await q<DrgRow>("select * from drg")).map((r) => [r.drg, r])),
    drgPcl: await q("select * from drg_pcl"),
    dcl,
    dclAlias: new Map((await q<{ code: string; main: string }>("select * from dcl_alias")).map((r) => [r.code, r.main])),
    ccex,
  };
}
