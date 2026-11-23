// Run an agent on an imported chart from the command line, the same as the buttons on /discharges.
// usage: node scripts/run-agent.ts <audit|dcsum> <AN>
import { db } from "../lib/db.ts";
import { AGENT_MODEL, runAudit, runDischargeSummary } from "../lib/agent.ts";

const [kind, an] = process.argv.slice(2);
if (!an || (kind !== "audit" && kind !== "dcsum")) throw new Error("usage: node scripts/run-agent.ts <audit|dcsum> <AN>");

console.log(`${kind} ${an} with ${AGENT_MODEL} ...`);
const t0 = Date.now();
const result = kind === "audit" ? await runAudit(an) : await runDischargeSummary(an);
const run = (await db.query("select model, error, steps, usage, trace from agent_run where an = $1 and kind = $2 order by id desc limit 1", [an, kind])).rows[0];
console.log(JSON.stringify(result, null, 2));
if (run.error) console.log(`\nfell back after:\n${run.error}`);
console.log(`\n${run.model} · ${Math.round((Date.now() - t0) / 1000)} s · ${run.steps} steps · usage ${JSON.stringify(run.usage)}`);
console.log(`scripts run:\n${(run.trace as { script: string; args: string[]; ok: boolean }[]).map((s) => `  ${s.ok ? "ok " : "ERR"} ${s.script} ${s.args.join(" ").slice(0, 120)}`).join("\n")}`);
await db.close();
