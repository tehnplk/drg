// Compare the TypeScript grouper (lib/tdrg/group.ts) with TGrp6305 on random cases.
// usage: node scripts/test-tdrg.ts [cases=5000] [seed=1] [--learn]
//   --learn: also derive the DC evaluation order per MDC from TGrp and write grouper/tdrg633/dc-order.json
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { db } from "../lib/db.ts";
import { loadData } from "../lib/tdrg/data.ts";
import { group as tsGroup, type Input } from "../lib/tdrg/group.ts";
import { group as cliGroup } from "../lib/tgrp.ts";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const learn = process.argv.includes("--learn");
const N = Number(args[0] ?? 5000);
let seed = Number(args[1] ?? 1);
const rand = () => { // mulberry32
  let t = (seed = (seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

const d = await loadData();
const allDx = [...d.dx.keys()];
const dxByMdc = new Map<string, string[]>();
for (const [code, rows] of d.dx) for (const r of rows) (dxByMdc.get(r.mdc) ?? dxByMdc.set(r.mdc, []).get(r.mdc)!).push(code);
const orProcs = [...d.proc.values()].filter((p) => p.procgr > 0).map((p) => p.code);
const allProcs = [...d.proc.keys()];

const cases: Input[] = Array.from({ length: N }, (_, i) => {
  const mdc = pick([...dxByMdc.keys()]);
  const pdx = rand() < 0.97 ? pick(dxByMdc.get(mdc)!) : pick(allDx);
  const newborn = rand() < 0.08;
  const mdcProcs = (d.procPdc.get(mdc) ?? []).map((e) => e.code.match(/^\d+/)?.[0]).filter((c): c is string => !!c && d.proc.has(c));
  const nProc = Math.floor(rand() * rand() * 5);
  return {
    an: String(i),
    sex: pick(["1", "2", "1", "2", ""]).slice(0, rand() < 0.98 ? 1 : 0) || pick(["1", "2"]),
    age: newborn ? 0 : Math.floor(rand() * 90),
    age_day: newborn ? Math.floor(rand() * 40) : 0,
    weight: newborn ? pick([0, 0.8, 1.2, 1.7, 2.2, 3.1]) : rand() < 0.5 ? 60 : 0,
    los_day: pick([0, 1, 2, 3, 4, 5, 7, 10, 15, 21, 25, 40]),
    discht: pick(["1", "1", "1", "2", "3", "4", "4", "5", "8", "9"]),
    pdx,
    sdx: Array.from({ length: Math.floor(rand() * rand() * 8) }, () => (rand() < 0.7 ? pick(allDx) : pick(dxByMdc.get(mdc)!))),
    proc: Array.from({ length: nProc }, () => (rand() < 0.6 && mdcProcs.length ? pick(mdcProcs) : rand() < 0.5 ? pick(orProcs) : pick(allProcs))),
  };
});

const cli = await cliGroup(cases.map((c) => ({ ...c, sdx: c.sdx, proc: c.proc })));
const stats = new Map<string, number>();
const samples = new Map<string, string[]>();
const beats = new Map<string, Map<string, number>>(); // mdc -> "winner|loser" -> times seen
const note = (k: string, s: string) => {
  stats.set(k, (stats.get(k) ?? 0) + 1);
  const l = samples.get(k) ?? samples.set(k, []).get(k)!;
  if (l.length < 6) l.push(s);
};

for (const [i, c] of cases.entries()) {
  const t = cli[i];
  const m = await tsGroup(c, { explain: true });
  const desc = `pdx ${c.pdx} sdx ${c.sdx?.join(",")} proc ${c.proc?.join(",")} sex ${c.sex} age ${c.age}/${c.age_day} wt ${c.weight} los ${c.los_day} dt ${c.discht} | tgrp ${t.mdc}/${t.drg} e${t.err} w${t.warn} | ts ${m.mdc}/${m.drg} e${m.err} w${m.warn} cand ${m.candidates?.join(",")}`;
  const tdc = t.drg.slice(0, 4);
  if (learn && t.mdc === m.mdc && m.candidates?.includes(tdc) && t.err === 0) {
    const b = beats.get(t.mdc) ?? beats.set(t.mdc, new Map()).get(t.mdc)!;
    for (const x of m.candidates) if (x !== tdc) b.set(`${tdc}|${x}`, (b.get(`${tdc}|${x}`) ?? 0) + 1);
  }
  if (t.drg === m.drg && t.err === m.err && Math.abs(t.adjrw - m.adjrw) < 0.00005) {
    note(t.warn === m.warn ? "ok" : "ok-but-warn", desc);
  } else if (t.err !== m.err) note(`err ${t.err} vs ${m.err}`, desc);
  else if (t.mdc !== m.mdc) note("mdc", desc);
  else if (tdc !== m.dc) note(m.candidates?.includes(tdc) ? "dc-order" : "dc-missing", desc);
  else if (t.drg !== m.drg) note("pcl", desc);
  else note("adjrw", desc);
}

const ok = (stats.get("ok") ?? 0) + (stats.get("ok-but-warn") ?? 0);
console.log(`DRG+err+adjrw match: ${ok}/${N} (${((100 * ok) / N).toFixed(2)}%)`);
for (const [k, n] of [...stats].sort((a, b) => b[1] - a[1])) {
  console.log(`${String(n).padStart(6)}  ${k}`);
  if (k !== "ok") for (const s of samples.get(k)!) console.log("          ", s);
}

if (learn) {
  const file = path.join(process.cwd(), "grouper", "tdrg633", "dc-order.json");
  let old: Record<string, string[]> = {};
  try { old = JSON.parse(readFileSync(file, "utf8")); } catch { /* first run */ }
  // Greedy feedback-arc ordering: repeatedly take the DC that is never beaten by a remaining DC
  // (or, if evidence conflicts, the one with the best net wins). Pairs never observed keep the old order.
  const out: Record<string, string[]> = {};
  for (const mdc of new Set([...d.dcs.map((x) => x.mdc)])) {
    const dcs = [...new Set(d.dcs.filter((x) => x.mdc === mdc).map((x) => x.dc))];
    const rank = new Map((old[mdc] ?? []).map((dc, i) => [dc, i]));
    const b = beats.get(mdc) ?? new Map<string, number>();
    const w = (x: string, y: string) => b.get(`${x}|${y}`) ?? 0;
    const order: string[] = [];
    const left = new Set(dcs);
    while (left.size) {
      const score = (x: string) => {
        let s = 0, beaten = 0;
        for (const y of left) if (y !== x) { s += w(x, y) - w(y, x); if (w(y, x) > w(x, y)) beaten++; }
        return { beaten, s };
      };
      const next = [...left].map((x) => ({ x, ...score(x) }))
        .sort((p, q) => p.beaten - q.beaten || q.s - p.s || (rank.get(p.x) ?? 1e6 + Number(p.x)) - (rank.get(q.x) ?? 1e6 + Number(q.x)))[0];
      if (next.beaten) console.log(`conflict in MDC ${mdc}: ${next.x} is beaten by ${next.beaten} remaining DCs`);
      order.push(next.x);
      left.delete(next.x);
    }
    out[mdc] = order;
  }
  writeFileSync(file, JSON.stringify(out, null, 1));
  console.log("wrote", file);
}
await db.close();
