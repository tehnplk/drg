import { readFileSync } from "node:fs";
import path from "node:path";
import { adjrw } from "./adjrw.ts";
import { compile, makeHelpers, type Ctx, type Pred, type Proc } from "./cond.ts";
import { loadData, type Data, type DxRow } from "./data.ts";
import { computePcl } from "./pcl.ts";

// Thai DRG 6.3 grouper (TDRG 6.3.3 manual + TGrp6305 library tables).

export type Input = {
  an?: string;
  sex: string;
  age: number;
  age_day?: number;
  los_day: number;
  weight?: number;
  discht: string;
  pdx: string;
  sdx?: string[];
  proc?: string[];
};
export type Output = {
  an: string; mdc: string; dc: string; drg: string; pcl: number;
  rw: number; adjrw: number; wtlos: number; ot: number; err: number; warn: number; actlos: number;
  candidates?: string[]; // every DC whose definition matched, for learning the DC hierarchy
};

type Engine = {
  d: Data;
  h: ReturnType<typeof makeHelpers>;
  dcs: Map<string, { dc: string; pred: Pred; surgical: boolean }[]>; // surgical: DC number 01-49
};

// DC evaluation order per MDC (vol 2 diagrams), learned from TGrp6305 by scripts/learn-order.ts
const ORDER_FILE = path.join(process.cwd(), "grouper", "tdrg633", "dc-order.json");

let engine: Promise<Engine> | undefined;
async function build(): Promise<Engine> {
  const d = await loadData();
  let order: Record<string, string[]> = {};
  try { order = JSON.parse(readFileSync(ORDER_FILE, "utf8")); } catch { /* no learned order yet: book order */ }
  const dcs: Engine["dcs"] = new Map();
  for (const def of d.dcs) {
    const preds = def.alts.flatMap((a) => {
      try { return [compile(a, d)]; } catch (e) { if (def.dc === "1452") return []; throw e; } // 1452: prose about MDC reassignment
    });
    const list = dcs.get(def.mdc) ?? dcs.set(def.mdc, []).get(def.mdc)!;
    list.push({ dc: def.dc, pred: (c) => preds.some((p) => p(c)), surgical: Number(def.dc.slice(2)) < 50 });
  }
  for (const [mdc, list] of dcs) {
    const rank = new Map((order[mdc] ?? []).map((dc, i) => [dc, i]));
    list.sort((a, b) => (rank.get(a.dc) ?? 1e6 + Number(a.dc)) - (rank.get(b.dc) ?? 1e6 + Number(b.dc)));
  }
  return { d, h: makeHelpers(d), dcs };
}

const ERR_DRG: Record<number, string> = { 1: "26509", 2: "26509", 3: "26519", 4: "26509", 5: "26509", 6: "26539", 7: "26509", 8: "26509", 9: "26509", 10: "26509" };
const norm = (s: string) => s.toUpperCase().replace(/\./g, "").trim();

export async function group(input: Input, opts: { explain?: boolean } = {}): Promise<Output> {
  const e = await (engine ??= build());
  const { d } = e;
  const age = Number(input.age), ageDay = Number(input.age_day ?? 0);
  const sex = input.sex === "1" || input.sex === "2" ? input.sex : "";
  const ageDays = age * 365 + ageDay;
  const los = input.los_day;
  const weight = Number(input.weight ?? 0) >= 0.3 ? Number(input.weight) : 0;
  let warn = 0;
  if (!sex) warn |= 32;
  if (!/^[1234589]$/.test(input.discht)) warn |= 64;

  const rowFor = (code: string): DxRow | undefined => {
    const rows = d.dx.get(code);
    if (!rows) return undefined;
    return rows.find((r) => r.mdc === (sex === "2" ? "13" : "12")) ?? rows[0];
  };
  // AGEDUSE=Y: the code needs an age of at least AGEDMIN days (i.e. not for neonates)
  const ageOk = (r: DxRow) => age >= r.agemin && age <= r.agemax && (r.ageduse !== "Y" || ageDays >= r.agedmin);
  const sexOk = (s: string) => s === "B" || (s === "M" && sex === "1") || (s === "F" && sex === "2");

  // ---- edits (manual ch. 5)
  const pdx = norm(input.pdx ?? "");
  const prow = rowFor(pdx);
  const errs: number[] = [];
  if (!pdx) errs.push(1);
  else if (!prow) errs.push(2);
  else {
    if (prow.accpdx === "N") errs.push(3);
    if (age >= 0 && age <= 124 && !ageOk(prow)) errs.push(4); // an invalid age is error 6 instead
    if (prow.sex !== "B" && !sex) errs.push(7);
    else if (!sexOk(prow.sex)) errs.push(5);
  }
  if (!Number.isFinite(age) || age < 0 || age > 124) errs.push(6);
  if (ageDays < 28 && !weight) errs.push(10);

  const sdx: string[] = [];
  for (const raw of input.sdx ?? []) {
    const code = norm(raw);
    if (!code || /^[VWXY]/.test(code)) continue;
    const r = rowFor(code);
    if (!r) { warn |= 1; continue; }
    // TGrp flags age (2) and sex (4) conflicts even on a duplicate code (1)
    const dup = code === pdx || sdx.includes(code);
    if (dup) warn |= 1;
    if (!ageOk(r)) warn |= 2;
    if (!sexOk(r.sex)) warn |= 4;
    if (!dup && ageOk(r) && sexOk(r.sex)) sdx.push(code);
  }
  const procs: Proc[] = [];
  const seen = new Set<string>();
  for (const raw of input.proc ?? []) {
    // ICD-9-CM with optional +<multiplicity><setting>, or an Appendix C combination code like CE002
    const m = norm(raw).match(/^(\d+|[A-Z]{1,2}\d{3,4})(?:\+(\d)(\d))?$/);
    const p = m && d.proc.get(m[1]);
    if (!m || !p) { warn |= 8; continue; }
    // a sex conflict (16) is checked before duplicates (8), so a repeated conflicting code adds only 16
    if (!sexOk(p.sex || "B")) { warn |= 16; continue; }
    if (seen.has(norm(raw)) || (!m[2] && procs.some((x) => x.code === m[1]))) { warn |= 8; continue; }
    seen.add(norm(raw));
    const units = Number(m[2] ?? 1), setting = Number(m[3] ?? 1);
    const ex = procs.find((x) => x.code === m[1]);
    if (ex) { ex.units += units; ex.settings = Math.max(ex.settings, setting); }
    else procs.push({ code: m[1], units, settings: setting });
  }

  const out = (mdc: string, dc: string, drg: string, pcl: number, err = 0, candidates?: string[]): Output => {
    const w = d.drg.get(drg);
    return {
      an: input.an ?? "", mdc, dc, drg, pcl, err, warn, actlos: los,
      rw: w?.rw ?? 0, wtlos: w?.wtlos ?? 0, ot: w?.ot ?? 0,
      adjrw: w ? adjrw({ drg, rw: w.rw, rw0d: w.rw0d, wtlos: w.wtlos, ot: w.ot, of: w.mdf }, los) : 0,
      ...(opts.explain ? { candidates } : {}),
    };
  };
  if (errs.length) {
    const err = Math.min(...errs);
    return out("26", ERR_DRG[err].slice(0, 4), ERR_DRG[err], 0, err);
  }

  const ctx: Ctx = { mdc: "", pdx, sdx, procs, sex, age, ageDays, los, discht: input.discht, weight };
  const finish = (mdc: string, dc: string, candidates?: string[]) => {
    const pcl = pclOf(d, dc, [ctx.pdx, ...ctx.sdx]);
    const drg = d.drgPcl.find((r) => r.dc === dc && pcl >= r.pcl_min && pcl <= r.pcl_max)?.drg ?? `${dc}9`;
    return out(mdc, dc, drg, pcl, 0, candidates);
  };
  const firstDc = (mdc: string) => {
    ctx.mdc = mdc;
    const list = e.dcs.get(mdc) ?? [];
    if (opts.explain) {
      const all = list.filter((x) => x.pred(ctx)).map((x) => x.dc);
      return { dc: all[0], all };
    }
    return { dc: list.find((x) => x.pred(ctx))?.dc, all: undefined };
  };

  // ---- Pre MDC
  const pre = firstDc("00");
  if (pre.dc) return finish("00", pre.dc, pre.all);

  // ---- MDC 24 / 25 / 15 / by PDx
  let mdc = mdcFor(d, ctx, rowFor(pdx)!);
  for (let hop = 0; hop < 3; hop++) {
    ctx.mdc = mdc;
    // MDC 14: an unacceptable obstetric combination wins before any procedure logic
    if (mdc === "14" && e.dcs.get("14")!.find((x) => x.dc === "2652")!.pred(ctx)) return finish("26", "2652");
    // MDC 18, 23, 25: an OR procedure may move the case to the MDC it shares with an SDx (manual ch. 6)
    if (ORPROC_MDCS.has(mdc)) {
      const moved = reassignByProcAndSdx(e, ctx);
      if (moved) { mdc = moved; continue; }
      const mos = mosProcDc(e, ctx);
      if (mos) return finish("26", mos);
    }
    const uorp = unrelatedOr(e, ctx, mdc);
    if (uorp?.mdc && uorp.mdc !== mdc) { mdc = uorp.mdc; continue; }
    if (uorp?.dc) return finish("26", uorp.dc);
    const r = firstDc(mdc);
    if (r.dc) return finish(mdc, r.dc, r.all);
    break;
  }
  return out(mdc, "", "", 0, 0, []);
}

function mdcFor(d: Data, c: Ctx, prow: DxRow): string {
  const trauma = (code: string) => (d.dx.get(code) ?? [])[0]?.trauma ?? "N";
  if (trauma(c.pdx) !== "N") {
    const dxSites = new Set([c.pdx, ...c.sdx].map(trauma).filter((t) => /^[1-8]$/.test(t)));
    const procSites = new Set(c.procs.map((p) => d.proc.get(p.code)).filter((p) => p && p.procgr > 0 && /^[A-J]$/.test(p.site)).map((p) => p!.site));
    if (dxSites.size >= 2 || procSites.size >= 2) return "24";
  }
  if ((d.dx.get(c.pdx) ?? []).some((r) => r.mdc === "25")) return "25";
  if (c.ageDays < 28) return "15";
  return prow.mdc;
}

// MDCs whose vol 2 diagram has a UORP box; the others group OR procedures with their own DCs
const UORP_MDCS = new Set(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "16", "17", "21"]);

// Appendix D: OR procedures unrelated to the MDC
function unrelatedOr(e: Engine, c: Ctx, mdc: string): { mdc?: string; dc?: string } | undefined {
  const { d, h } = e;
  if (!UORP_MDCS.has(mdc)) return undefined;
  // branches without a UORP box: MDC 14 PDC 14F-14L (abortion etc.), MDC 05 PDC 5A (AMI)
  if (mdc === "14" && h.dxPdc(c.pdx).some((p) => /^14[F-L]$/.test(p))) return undefined;
  if (mdc === "05" && h.dxPdc(c.pdx).includes("5A")) return undefined;
  const orProcs = c.procs.map((p) => ({ p, r: d.proc.get(p.code)! })).filter((x) => x.r.procgr > 0);
  if (!orProcs.length) return undefined;
  // related = an OR proc is in this MDC's PDC list, or makes one of its surgical DCs match
  // (MDC 14 has no PDC list, only procedure AX lists inside its DC definitions)
  const related = (d.procPdc.get(mdc) ?? []).some((en) => h.procEntry(en.code, c.procs))
    || (e.dcs.get(mdc) ?? []).some((x) => x.surgical && x.pred(c));
  if (related) return undefined;
  const top = Math.max(...orProcs.map((x) => x.r.procgr));
  // checked first in the Appendix D diagram: minor OR procs with a long stay go back to the MDC logic
  if ((top === 2 && c.los >= 5) || (top === 1 && c.los >= 4)) return undefined;
  const tops = orProcs.filter((x) => x.r.procgr === top)
    .sort((a, b) => b.r.proclev - a.r.proclev || (a.p.code < b.p.code ? 1 : -1));

  // 1. PDx is MosDx and a top proc has a main MDC
  if ((d.dx.get(c.pdx) ?? []).some((r) => r.mosdx > 0)) {
    const withMain = tops.find((x) => x.r.mmdc && x.r.mmdc !== "--");
    if (withMain && withMain.r.mmdc !== mdc) return { mdc: withMain.r.mmdc };
  }
  // 2. a top proc and an SDx share an MDC: swap that SDx in as PDx
  const moved = reassignByProcAndSdx(e, c);
  if (moved) return { mdc: moved };
  // 3. MosProc
  const mos = mosProcDc(e, c);
  if (mos) return { dc: mos };
  // 4. by ORP group
  if (top >= 5) return { dc: "2605" };
  if (top === 4) return { dc: "2604" };
  if (top === 3) return { dc: "2603" };
  if (top === 2 && c.los < 5) return { dc: "2602" };
  if (top === 1 && c.los < 4) return { dc: "2601" };
  return undefined;
}

const ORPROC_MDCS = new Set(["18", "23", "25"]);

// Appendix D step 3: a top-ORP-group proc in the MosProc list (Appendix D2) gives DC 2611-2614
function mosProcDc(e: Engine, c: Ctx): string | undefined {
  const or = c.procs.map((p) => e.d.proc.get(p.code)!).filter((r) => r.procgr > 0);
  if (!or.length) return undefined;
  const top = Math.max(...or.map((r) => r.procgr));
  return or.filter((r) => r.procgr === top && r.mosproc > 0 && r.mosdc)
    .sort((a, b) => Number(a.moshierar) - Number(b.moshierar))[0]?.mosdc;
}

// Appendix D step 2: among the procs of the top ORP group, find one sharing an MDC with an SDx;
// that SDx becomes the PDx. Returns the new MDC, or undefined.
function reassignByProcAndSdx(e: Engine, c: Ctx): string | undefined {
  const { d } = e;
  const orProcs = c.procs.map((p) => ({ p, r: d.proc.get(p.code)! })).filter((x) => x.r.procgr > 0);
  if (!orProcs.length) return undefined;
  const top = Math.max(...orProcs.map((x) => x.r.procgr));
  if ((top === 2 && c.los >= 5) || (top === 1 && c.los >= 4)) return undefined;
  const pairs: { lev: number; main: boolean; proc: string; sdx: string; mdc: string }[] = [];
  for (const x of orProcs.filter((x) => x.r.procgr === top)) {
    const mdcs = [x.r.mmdc, ...(x.r.omdcs?.match(/\d\d/g) ?? [])].filter((m) => m && m !== "--");
    for (const s of c.sdx) for (const r of d.dx.get(s) ?? []) {
      if (mdcs.includes(r.mdc)) pairs.push({ lev: x.r.proclev, main: r.mdc === x.r.mmdc, proc: x.p.code, sdx: s, mdc: r.mdc });
    }
  }
  if (!pairs.length) return undefined;
  pairs.sort((a, b) => b.lev - a.lev || Number(b.main) - Number(a.main) || (a.proc < b.proc ? 1 : a.proc > b.proc ? -1 : 0) || (a.sdx < b.sdx ? 1 : -1));
  const p = pairs[0];
  c.sdx = c.sdx.map((s) => (s === p.sdx ? c.pdx : s));
  c.pdx = p.sdx;
  return p.mdc;
}

function pclOf(d: Data, dc: string, dx: string[]): number {
  const codes = [...new Set(dx)];
  const dcls = codes.map((code) => ({ code, dcl: d.dcl.get(d.dclAlias.get(code) ?? code)?.get(dc) ?? 0 }));
  const main = (code: string) => (d.dx.get(code) ?? [])[0]?.maincc;
  return computePcl(dcls, (code, by) => !!d.ccex.get(main(code) ?? "")?.has(by));
}
