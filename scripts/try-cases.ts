// Group hand-written cases with both TGrp6305 and the TS grouper side by side.
// usage: node scripts/try-cases.ts <cases.json>   (a JSON array of lib/tdrg/group.ts Input)
import { readFileSync } from "node:fs";
import { db } from "../lib/db.ts";
import { group as tsGroup, type Input } from "../lib/tdrg/group.ts";
import { group as cliGroup } from "../lib/tgrp.ts";

const cases: Input[] = JSON.parse(readFileSync(process.argv[2], "utf8"));
const cli = await cliGroup(cases);
for (const [i, c] of cases.entries()) {
  const t = cli[i], m = await tsGroup(c, { explain: true });
  const same = t.drg === m.drg && t.err === m.err ? "  " : "!!";
  console.log(`${same} ${c.an ?? i}: tgrp ${t.drg} e${t.err} w${t.warn} ${t.adjrw} | ts ${m.drg} e${m.err} w${m.warn} ${m.adjrw} cand ${m.candidates?.join(",") ?? ""}`);
}
await db.close();
