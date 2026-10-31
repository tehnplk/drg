// Check lib/tdrg/pcl.ts against TGrp6305: random cases are grouped by the CLI, then the CLI's DC
// plus our PCL must give the CLI's DRG.  usage: node scripts/test-pcl.ts [cases=2000] [seed=1]
import assert from "node:assert/strict";
import { db } from "../lib/db.ts";
import { adjrw, type DrgWeight } from "../lib/tdrg/adjrw.ts";
import { computePcl, drgFor, pcl } from "../lib/tdrg/pcl.ts";
import { group, type Case } from "../lib/tgrp.ts";

// Manual vol 1 p.156 example: DC 0553 -> PCL 7.66 -> 8
assert.equal(computePcl([
  { code: "K250", dcl: 3 }, { code: "I213", dcl: 2 }, { code: "A419", dcl: 2 }, { code: "I10", dcl: 1 },
  { code: "I092", dcl: 1 }, { code: "E876", dcl: 1 }, { code: "E875", dcl: 1 }, { code: "E119", dcl: 1 },
], (code, by) => code === "E875" && by === "E876"), 8);

const N = Number(process.argv[2] ?? 2000);
let seed = Number(process.argv[3] ?? 1);
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(a: T[]) => a[Math.floor(rand() * a.length)];

const pdxs = (await db.query<{ code: string }>(
  "select distinct code from i10 where accpdx = 'Y' and agemin <= 60 and agemax >= 20 and sex = 'B' and mdc not in ('14','15')")).rows.map((r) => r.code);
const ccs = (await db.query<{ code: string }>(
  "select distinct code from i10 where cc and agemin <= 20 and sex = 'B'")).rows.map((r) => r.code);

const cases: Case[] = Array.from({ length: N }, (_, i) => ({
  an: String(i),
  sex: pick(["1", "2"]),
  age: 20 + Math.floor(rand() * 40),
  los_day: pick([0, 1, 2, 3]) + Math.floor(rand() * 60 * rand()),
  discht: "1",
  pdx: pick(pdxs),
  sdx: [...new Set(Array.from({ length: Math.floor(rand() * 9) }, () => pick(ccs)))],
}));

const out = await group(cases);

const weights = new Map((await db.query<DrgWeight>(
  "select drg, rw, rw0d, wtlos, ot, mdf as of from drg")).rows.map((w) => [w.drg, w]));
let adjOk = 0;
const adjBad: string[] = [];
for (const [i, g] of out.entries()) {
  const mine = adjrw(weights.get(g.drg)!, cases[i].los_day);
  if (Math.abs(mine - g.adjrw) < 0.00005) adjOk++;
  else if (adjBad.length < 10) adjBad.push(`${g.drg} los ${cases[i].los_day}: ${g.adjrw} vs ${mine}`);
}
console.log(`AdjRW matches TGrp: ${adjOk}/${out.length}`);
for (const b of adjBad) console.log("  ", b);

let tried = 0, ok = 0;
const bad: string[] = [];
for (const [i, g] of out.entries()) {
  if (g.err || g.warn || g.drg.startsWith("26")) continue;
  tried++;
  const c = cases[i];
  const dc = g.drg.slice(0, 4);
  const p = await pcl(dc, [c.pdx, ...(c.sdx ?? [])]);
  const mine = await drgFor(dc, p);
  if (mine === g.drg) ok++;
  else if (bad.length < 15) bad.push(`${g.drg} vs ${mine} (pcl ${p}) pdx ${c.pdx} sdx ${c.sdx?.join(",")}`);
}
console.log(`PCL->DRG matches TGrp: ${ok}/${tried} (skipped ${N - tried} with err/warn)`);
for (const b of bad) console.log("  ", b);
await db.close();
