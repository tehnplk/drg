import type { Data } from "./data.ts";

// Compiles the condition lines of vol 2 "DC and DRG Definition" into predicates.

export type Proc = { code: string; units: number; settings: number };
export type Ctx = {
  mdc: string;
  pdx: string;
  sdx: string[];
  procs: Proc[];
  sex: string;
  age: number; // years
  ageDays: number; // total age in days, for newborns
  los: number;
  discht: string;
  weight: number; // kg, 0 = missing
};
export type Pred = (c: Ctx) => boolean;

const mdcOf = (pdc: string) => pdc.match(/^\d+/)![0].padStart(2, "0");

export function makeHelpers(d: Data) {
  const dxPdc = (code: string) => (d.dx.get(code) ?? []).map((r) => r.pdc);
  const inAx = (code: string, ax: string) => d.ax.get(ax)?.has(code) ?? false;

  // one ICD-9 assignment entry: "0139", "0139>1" (units > 1), "8622*1" (settings > 1), "CG001=0392&9925"
  const procEntry = (entry: string, procs: Proc[]): boolean => {
    const [name, combo] = entry.split("=");
    if (combo) return procs.some((x) => x.code === name) || combo.split("&").every((c) => procEntry(c, procs));
    const m = entry.match(/^(\d+)(?:([>*])(\d))?$/)!;
    const p = procs.find((x) => x.code === m[1]);
    if (!p) return false;
    if (m[2] === ">") return p.units > Number(m[3]);
    if (m[2] === "*") return p.settings > Number(m[3]);
    return true;
  };
  const procInPdc = (pdc: string, procs: Proc[]) =>
    (d.procPdc.get(mdcOf(pdc)) ?? []).some((e) => e.pdc === pdc && procEntry(e.code, procs));
  const procInAx = (ax: string, procs: Proc[]) => [...(d.ax.get(ax) ?? [])].some((e) => procEntry(e, procs));
  const topOrGroup = (procs: Proc[]) => Math.max(0, ...procs.map((p) => d.proc.get(p.code)?.procgr ?? 0));

  return { dxPdc, inAx, procEntry, procInPdc, procInAx, topOrGroup };
}

export function compile(alt: string, d: Data): Pred {
  const h = makeHelpers(d);
  const s = alt
    .replace(/AX (\d+) ([A-Z]+X)\b/g, "AX $1$2") // "AX 14 HX" typo
    .replace(/PDC \(([^)]+)\)/g, (_, l: string) => `(${l.split(/\s+or\s+/).map((x) => `PDC ${x}`).join(" or ")})`)
    .replace(/AdmWt\s*>\s*([\d.]+)\s*kg or Age\s*>\s*(\d+)\s*d(?:ays)?\s+wo AdmWt/, "BIGWT $1 $2")
    .replace(/trauma site ([A-J]) and ([A-J])$/, "trauma site $1+$2")
    .trim();

  // split on top-level and / w / wo (not inside parentheses)
  const parts: { neg: boolean; text: string }[] = [];
  let depth = 0, neg = false, buf = "";
  for (const w of s.split(/(\s+)/)) {
    depth += (w.match(/\(/g)?.length ?? 0) - (w.match(/\)/g)?.length ?? 0);
    if (depth === 0 && /^(and|w|wo)$/.test(w) && buf.trim()) {
      parts.push({ neg, text: buf.trim() });
      neg = w === "wo";
      buf = "";
      continue;
    }
    buf += w;
  }
  parts.push({ neg, text: buf.trim() });

  const preds = parts.map(({ neg, text }) => {
    const p = term(text, d, h);
    return neg ? (c: Ctx) => !p(c) : p;
  });
  return (c) => preds.every((p) => p(c));
}

function term(t: string, d: Data, h: ReturnType<typeof makeHelpers>): Pred {
  let m: RegExpMatchArray | null;
  // "Proc as PDC 1PF or Proc as PDC 1PG"
  if (/\s+or\s+(PDx|Proc|SDx)\s/.test(t) && !t.startsWith("(")) {
    const ors = t.split(/\s+or\s+(?=(?:PDx|Proc|SDx)\s)/).map((x) => term(x, d, h));
    return (c) => ors.some((p) => p(c));
  }
  if ((m = t.match(/^(PDx|SDx|Dx|\(PDx or SDx\)|Proc) as \(?(.+?)\)?$/))) {
    const subj = m[1];
    const items = m[2].split(/\s+or\s+/).map((x) => x.match(/^(PDC|AX) (\w+)$/));
    if (items.some((x) => !x)) throw new Error(`term: ${t}`);
    const its = items.map((x) => ({ kind: x![1], name: x![2] }));
    if (subj === "Proc")
      return (c) => its.some((i) => (i.kind === "PDC" ? h.procInPdc(i.name, c.procs) : h.procInAx(i.name, c.procs)));
    const codes = (c: Ctx) => (subj === "PDx" ? [c.pdx] : subj === "SDx" ? c.sdx : [c.pdx, ...c.sdx]);
    return (c) => codes(c).some((code) => its.some((i) => (i.kind === "PDC" ? h.dxPdc(code).includes(i.name) : h.inAx(code, i.name))));
  }
  if ((m = t.match(/^\(PDx or SDx\)\s+not in \((.+)\)$/))) {
    const axs = m[1].split(/\s+or\s+/).map((x) => x.replace(/^AX\s+/, ""));
    return (c) => ![c.pdx, ...c.sdx].some((code) => axs.some((a) => h.inAx(code, a)));
  }
  if ((m = t.match(/^No Dx in \((.+)\)$/))) {
    const pdcs = m[1].split(/\s+or\s+/).map((x) => x.replace(/^PDC\s+/, ""));
    return (c) => ![c.pdx, ...c.sdx].some((code) => h.dxPdc(code).some((p) => pdcs.includes(p)));
  }
  if (t === "SDx in this MDC") return (c) => c.sdx.some((code) => (d.dx.get(code) ?? []).some((r) => r.mdc === c.mdc));
  if ((m = t.match(/^Age\s*([<>])\s*(\d+)$/))) {
    const [op, n] = [m[1], Number(m[2])];
    return (c) => (op === "<" ? c.age < n : c.age > n);
  }
  if ((m = t.match(/^Disch[tT]\s*(=\s*)?(not\s+)?\(?([\d,\sor]+?)\)?$/))) {
    const set = m[3].split(/[\s,or]+/).filter(Boolean);
    const not = !!m[2];
    return (c) => set.includes(c.discht) !== not;
  }
  if ((m = t.match(/^LOS\s*([<>])\s*(\d+)\s*(d|days)?$/))) {
    const [op, n] = [m[1], Number(m[2])];
    return (c) => (op === "<" ? c.los < n : c.los > n);
  }
  if (t === "CaRT") return (c) => c.sdx.some((x) => h.inAx(x, "99BX")) && h.procInAx("99PEX", c.procs);
  if (t === "CaCRx") return (c) => c.sdx.some((x) => h.inAx(x, "99CX")) && h.procInAx("99PFX", c.procs);
  if ((m = t.match(/^AdmWt\s*([\d.]+)\s*-\s*([\d.]+)\s*kg$/))) {
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    return (c) => c.weight >= lo && c.weight <= hi;
  }
  if ((m = t.match(/^AdmWt\s*<\s*([\d.]+)\s*kg$/))) {
    const n = Number(m[1]);
    return (c) => c.weight > 0 && c.weight < n;
  }
  if ((m = t.match(/^BIGWT ([\d.]+) (\d+)$/))) {
    const [w, days] = [Number(m[1]), Number(m[2])];
    return (c) => c.weight > w || (c.weight === 0 && c.ageDays > days);
  }
  if ((m = t.match(/^OR (?:Proc|procedure) group (\d(?:\s+or\s+\d)*)$/i))) {
    const groups = m[1].split(/\s+or\s+/).map(Number);
    return (c) => groups.includes(h.topOrGroup(c.procs));
  }
  if (t === "Any diagnosis of multiple significant trauma") return () => true;
  // MDC 24: OR procedure body sites from c63proc.SITE
  if ((m = t.match(/^Proc for trauma site ([A-J])(?:\+([A-J]))?$/))) {
    const sites = [m[1], m[2]].filter(Boolean);
    return (c) => sites.every((s) => c.procs.some((p) => d.proc.get(p.code)?.site === s));
  }
  throw new Error(`term: ${t}`);
}
