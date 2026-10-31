// Group cases with the repo's TypeScript Thai DRG 6.3 grouper. Run from the project root.
// usage: node .agents/skills/thai-drg/scripts/group.ts '<case JSON or array>' | @cases.json
import { readFileSync } from "node:fs";
import { db } from "../../../../lib/db.ts";
import { loadData } from "../../../../lib/tdrg/data.ts";
import { group, type Input } from "../../../../lib/tdrg/group.ts";

const WARN: Record<number, string> = {
  1: "SDx invalid or duplicate", 2: "SDx not valid for age", 4: "SDx not valid for sex",
  8: "proc invalid or duplicate", 16: "proc not valid for sex", 32: "no/invalid sex", 64: "no/invalid discharge type",
};

const arg = process.argv[2];
if (!arg) throw new Error("pass a case JSON, an array of cases, or @file.json");
const parsed = JSON.parse(arg.startsWith("@") ? readFileSync(arg.slice(1), "utf8") : arg);
const cases: Input[] = Array.isArray(parsed) ? parsed : [parsed];

const d = await loadData();
for (const c of cases) {
  const r = await group(c, { explain: true });
  const warnings = Object.entries(WARN).filter(([bit]) => r.warn & Number(bit)).map(([, s]) => s);
  console.log(JSON.stringify({ ...r, drgname: d.drg.get(r.drg)?.drgname ?? "", warnings }));
}
await db.close();
