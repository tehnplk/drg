// AI agents for the chart: pre-discharge audit and discharge-summary draft. Each one runs the workspace skill
// (.claude/skills/*/SKILL.md and its references) as its instructions, and the skill's own scripts as its only tool.
// Those scripts read the de-identified chart from PostgreSQL; the agent never reaches the HIS. Server only.
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { extractJsonMiddleware, generateText, isStepCount, Output, tool, wrapLanguageModel, type LanguageModel } from "ai";
import { z } from "zod";
import { db, type Queryable } from "./db.ts";
import { followPhysician, LINE_ROLES, WARD_SCHEMA, type AuditStatus, type Draft, type HisDx, type LineType } from "./ward.ts";

try { process.loadEnvFile(".env"); } catch { /* Next loads .env itself */ }

export const AGENT_MODEL = process.env.AGENT_MODEL ?? "anthropic/claude-opus-5.5";
// deepseek-flash is DeepSeek's alias for its latest Flash, DeepSeek-V4.1-Flash-1017 since 17 Oct 2026; the API
// accepts no versioned id. deepseek-v4-pro is the other model the key can use.
const FALLBACK_MODEL = process.env.AGENT_FALLBACK_MODEL ?? "deepseek-flash";
const MAX_STEPS = 40;
const SKILLS = path.join(process.cwd(), ".claude", "skills");

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_KEY,
  // Only providers that do not keep or train on the prompts.
  extraBody: { provider: { data_collection: "deny" } },
});

// Tried in order: a run that fails on one model starts over on the next. maxOutputTokens is per step;
// OpenRouter reserves credit for it up front, DeepSeek counts its thinking in it (context 1M, output up to 393k).
// DeepSeek through its Responses API, which takes a JSON schema for the structured output (chat only gets json_object).
// With tools in the request it still answers "prose + ```json {...} ```", so keep only the outer {...}.
type Model = { id: string; model: LanguageModel; maxOutputTokens: number };
const outerObject = (t: string) => {
  const s = t.indexOf("{"), e = t.lastIndexOf("}");
  return s >= 0 && e > s ? t.slice(s, e + 1) : t;
};
const MODELS: Model[] = [
  { id: AGENT_MODEL, model: openrouter(AGENT_MODEL), maxOutputTokens: 16_000 },
  ...(process.env.DEEPSEEK_KEY ? [{
    id: `deepseek/${FALLBACK_MODEL}`, maxOutputTokens: 32_000,
    model: wrapLanguageModel({
      model: createDeepSeek({ apiKey: process.env.DEEPSEEK_KEY }).responses(FALLBACK_MODEL),
      middleware: extractJsonMiddleware({ transform: outerObject }),
    }),
  }] : []),
];

// ── Skill as instructions ────────────────────────────────────────────────────
const read = (rel: string) => readFileSync(path.join(SKILLS, rel), "utf8").replace(/^---[\s\S]*?---\s*/, "");
const skillText = (files: string[]) => files.map((f) => `\n\n<file path=".claude/skills/${f}">\n${read(f)}\n</file>`).join("");

// The skill text is resent on every step of the loop, so mark it for prompt caching (Anthropic via OpenRouter).
const cached = (content: string) => ({
  role: "system" as const, content, providerOptions: { openrouter: { cacheControl: { type: "ephemeral" } } },
});

const RUNTIME = (an: string) => `You are running inside PLK Chart AI, a hospital web app, on AN ${an}. Follow the workspace skill below exactly,
with these adjustments for this app (they override the skill where they differ):

- Run the skill's scripts with the run_skill_script tool. Where the skill says
  \`node .claude/skills/<script> <args>\`, call run_skill_script with script "<script>" and the args as separate strings.
  There is no shell, stdin or file system: pass a JSON case as one argument string, never \`-\` or \`@file\`.
- The chart is already imported and de-identified in the database. Read it only through the skill's scripts.
- Keep HN, AN and the patient's name as the chart shows them; do not mask them. The app shows the result only to staff.
- No human is in this conversation. Do not ask questions; put open questions for the physician in the result.
- The humanizer step is not available here: skip it.
- Return the result in the structured output format instead of a markdown reply. The app saves and displays it.
- Write the result in Thai, keeping codes, official code names and medical terms in English, as the skill says.
- Write dates as short Thai dates with the Buddhist-era year, and times as 24-hour HH:MM: "19 พ.ย. 2569 23:30",
  or "19 พ.ย." when the year is clear. The chart prints dates as YYYY-MM-DD (Gregorian): add 543 to the year.
- Staff read every word of the result. Never name a script, file, tool or skill (no "lookup.ts", "check-rules",
  "SKILL.md", "skill discharge-summary"). Say what was checked instead: "ตรวจกับฐานรหัส ICD-10-TM",
  "ตรวจกฎ audit และ MRA", "จัดกลุ่ม Thai DRG".`;

// The same rule after the fact, for results saved before it or a model that slips: script, file and skill names
// in the result's text become what they did. Applied where results are shown.
const STAFF_WORDS: [RegExp, string][] = [
  [/`?(?:[\w-]+\/scripts\/)?scan-chart(?:\.ts)?`?/gi, "การสแกนชาร์ท"],
  [/`?(?:[\w-]+\/scripts\/)?check-rules(?:\.ts)?`?/gi, "เกณฑ์ audit และ MRA"],
  [/`?(?:[\w-]+\/scripts\/)?lookup\.ts`?/gi, "ฐานรหัส ICD-10-TM / ICD-9-CM"],
  [/`?(?:[\w-]+\/scripts\/)?group\.ts`?/gi, "ตัวจัดกลุ่ม Thai DRG"],
  [/`?(?:[\w-]+\/scripts\/)?save-audit\.ts`?/gi, "การบันทึกผล"],
  [/`?(?:[\w-]+\/scripts\/)?chart\.ts`?/gi, "ข้อมูลชาร์ท"],
  [/(?:ด้วย |ตาม )?skill `?chart-audit`?/gi, "ตามเกณฑ์ Audit ชาร์ท"],
  [/(?:ด้วย |ตาม )?skill `?discharge-summary`?/gi, "ในขั้น D/C Summary"],
  [/(?:ด้วย |ตาม )?skill `?thai-drg`?/gi, "ตามเกณฑ์ Thai DRG"],
  [/`?[\w/-]+\.(?:ts|md)`?/g, "เกณฑ์ของระบบ"],
];
export const staffWords = <T>(value: T): T =>
  JSON.parse(STAFF_WORDS.reduce((s, [re, to]) => s.replace(re, to), JSON.stringify(value)));

// One agent step in staff words, for the record of what the AI did (no script names).
export const stepLabel = (script: string, args: string[]) =>
  (SCRIPTS[script as Script]?.progress(args) ?? "ใช้เครื่องมือของระบบ").replace(/^กำลัง/, "");

// ── The one tool: the skill's own scripts ───────────────────────────────────
// progress: the line the screen shows while the script runs (agent_run.progress). No patient data in it.
const SCRIPTS = {
  "chart-audit/scripts/scan-chart.ts": { chart: true, progress: () => "กำลังสแกนชาร์ทหาช่องโหว่" },
  "discharge-summary/scripts/chart.ts": { chart: true, progress: () => "กำลังอ่านชาร์ททั้งหมด" },
  "discharge-summary/scripts/lookup.ts": { chart: false, progress: (a) => `กำลังตรวจรหัส ${a.join(" ").slice(0, 40)}` },
  "discharge-summary/scripts/check-rules.ts": { chart: false, progress: () => "กำลังตรวจกฎ audit และ MRA" },
  "thai-drg/scripts/group.ts": { chart: false, progress: () => "กำลังจัดกลุ่ม DRG" },
} satisfies Record<string, { chart: boolean; progress: (args: string[]) => string }>;
type Script = keyof typeof SCRIPTS;
const run = promisify(execFile);

type Step = { script: string; args: string[]; ms: number; ok: boolean };
type Say = (progress: string) => Promise<void>;

function skillScriptTool(an: string, allowed: Script[], trace: Step[], say: Say) {
  return tool({
    description: `Run one of the skill's scripts from the project root, exactly like \`node .claude/skills/<script> <args>\`. Returns its stdout (JSON or text). Scripts: ${allowed.join(", ")}.`,
    inputSchema: z.object({
      script: z.enum(allowed as [Script, ...Script[]]),
      args: z.array(z.string().max(8000)).max(40).describe("Command-line arguments, one string each"),
    }),
    execute: async ({ script, args }) => {
      // Chart scripts only for this run's AN: no listing other patients' charts.
      if (SCRIPTS[script].chart && (args[0] !== an || args.slice(1).some((a) => a !== "--json-only")))
        return { error: `This run may read only AN ${an}: call ${script} with args ["${an}"]` };
      await say(SCRIPTS[script].progress(args));
      const t0 = Date.now();
      try {
        const { stdout } = await run(process.execPath, ["--no-warnings", path.join(SKILLS, script), ...args],
          { cwd: process.cwd(), timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
        trace.push({ script, args, ms: Date.now() - t0, ok: true });
        return { stdout: stdout.length > 200_000 ? `${stdout.slice(0, 200_000)}\n[truncated]` : stdout };
      } catch (e) {
        const err = e as { stderr?: string; message: string };
        trace.push({ script, args, ms: Date.now() - t0, ok: false });
        return { error: (err.stderr || err.message).slice(0, 4000) };
      }
    },
  });
}

// ── Result shapes ────────────────────────────────────────────────────────────
// Every field required (null instead of optional) so providers with strict structured output accept the schema.
const AuditSchema = z.object({
  status: z.enum(["blocking", "gaps", "ready"]).describe("blocking = 🔴 ติดเงื่อนไขบังคับ, gaps = 🟡 ควรปิดช่องโหว่ก่อนสรุป, ready = 🟢 พร้อมสรุปการจำหน่าย"),
  blocking: z.array(z.object({ issue: z.string(), action: z.string() })).describe("Section 1 🔴 Blocking"),
  evidence_risks: z.array(z.object({ statement: z.string(), gap: z.string(), check: z.string() })).describe("Section 2 🟠 Over-coding / audit risk"),
  clinical_gaps: z.array(z.object({ finding: z.string(), unclear: z.string() })).describe("Section 3 🔵 Clinical & specificity gaps"),
  readiness: z.array(z.object({ item: z.string(), status: z.enum(["ok", "gap", "na"]), note: z.string() })).describe("Section 4 MRA 4, 5, 6, 8"),
  queries: z.array(z.object({ question: z.string(), owner: z.string() })).describe("Section 5, at most 5 non-leading questions"),
  report_markdown: z.string().describe("The full report in the assets/audit-report.md template"),
});
export type AuditResult = z.infer<typeof AuditSchema>;

const LINE_TYPES = Object.keys(LINE_ROLES) as [LineType, ...LineType[]];
const DraftSchema = z.object({
  lines: z.array(z.object({
    type: z.enum(LINE_TYPES),
    text: z.string().describe("The physician's wording, full terms (MRA 5)"),
    code: z.string().describe("Verified ICD-10-TM or ICD-9-CM code with its dot, e.g. E11.9 or 96.04"),
    status: z.enum(["exact", "less", "more", "partial", "mismatch", "ambiguous"]).describe("Reverse-decode check of code name vs text"),
    evidence: z.string().describe("Where the chart supports it (date, note, lab), or that it does not"),
    when: z.string().nullable().describe("Procedures: date, or start–end for OR procedures; null otherwise"),
  })).describe("Part 1 diagnoses and procedures with Part 2.1 checks, PDx first"),
  clinical_summary: z.object({
    problem_and_final_dx: z.string(), investigations: z.string(), treatment_and_outcome: z.string(),
    post_discharge_plan: z.string(), home_medication: z.string(),
  }).describe("Clinical summary items 1–5 (MRA 6)"),
  not_coded: z.array(z.object({ finding: z.string(), code: z.string(), reason: z.string() })).describe("Part 2.2"),
  alerts: z.array(z.object({ level: z.enum(["stop", "warn", "suggest"]), text: z.string() })).describe("Part 2.3: stop 🔴, warn 🟠, suggest 🔵"),
  variants: z.array(z.object({
    label: z.string(),
    add: z.array(z.string()).describe("Bare codes only, one per string, e.g. E78.2"),
    remove: z.array(z.string()).describe("Bare codes only"),
    swap: z.array(z.object({ from: z.string(), to: z.string() })).describe("Bare codes only; to move a code into PDx, swap both ways"),
    question: z.string().nullable().describe("Part 2.5 non-leading question to the physician; null for a comparison only"),
  })).describe("Part 2.4 variants B, C, ...: each is ONE alternative coding; the proposed draft A is not a variant"),
});

// A code as the tables hold it: ICD-10 (E11.9), ICD-9-CM with optional extension (96.04, 86.22+21), Appendix C (CE002).
const CODE = /^([A-Z]\d{2}(\.\d{1,4})?|\d{2}(\.\d{1,2})?(\+\d{1,3})?|C[A-Z]?\d{3,4})$/;

// The codes the tables do not know: they cannot be grouped or named on screen.
async function unknownCodes(codes: string[]) {
  const plain = codes.map((c) => c.trim().replace(/\+.*$/, "").replace(/\./g, "").toUpperCase()); // 86.22+21 -> 8622
  const known = new Set((await db.query<{ code: string }>(
    `select code from icd10_desc where code = any($1) union select code from icd9_desc where code = any($1)
     union select code from proc where code = any($1)`, [plain])).rows.map((r) => r.code)); // proc: Appendix C combinations
  return codes.filter((_, i) => !known.has(plain[i]));
}

// What submit_draft sends back for the model to fix (Pydantic AI's ModelRetry); none = accepted.
async function draftProblems(d: z.infer<typeof DraftSchema>) {
  const changes = d.variants.flatMap((v) =>
    [...v.add, ...v.remove, ...v.swap.flatMap((s) => [s.from, s.to])].map((code) => ({ label: v.label, code })));
  const isCode = (c: string) => CODE.test(c.trim());
  const codes = [...new Set([...d.lines.map((l) => l.code), ...changes.map((c) => c.code)].filter(isCode))];
  return [
    ...d.lines.filter((l) => !isCode(l.code)).map((l) => `line "${l.text}": "${l.code}" is not one code`),
    ...changes.filter((c) => !isCode(c.code)).map((c) => `variant "${c.label}": "${c.code}" is not one bare code`),
    ...(await unknownCodes(codes)).map((c) => `${c} is not in the ICD-10-TM / ICD-9-CM tables: look it up and use a code they have`),
  ];
}

// The draft comes back as this tool's input, not as a structured-output reply, so a wrong code goes back to the
// model to fix. After MAX_SUBMITS tries it is accepted anyway and the checks in runDischargeSummary flag what is left.
const MAX_SUBMITS = 3;
type Submitted = { draft?: z.infer<typeof DraftSchema>; tries: number };
function submitDraftTool(out: Submitted, trace: Step[], say: Say) {
  return tool({
    description: "Submit the finished discharge-summary draft. It checks every code against the ICD-10-TM / ICD-9-CM tables. "
      + "If it answers accepted: false, fix the listed problems and submit the whole draft again.",
    inputSchema: DraftSchema,
    execute: async (d) => {
      await say("กำลังตรวจรหัสในร่าง");
      const t0 = Date.now();
      const problems = await draftProblems(d);
      trace.push({ script: "submit_draft", args: problems, ms: Date.now() - t0, ok: !problems.length });
      if (problems.length && ++out.tries < MAX_SUBMITS) return { accepted: false, problems };
      out.draft = d;
      return { accepted: true };
    },
  });
}

// Variants feed the grouper, so anything in add/remove/swap that is not a bare code is dropped and flagged,
// and a variant left with neither a change nor a question is dropped.
function toDraft(d: z.infer<typeof DraftSchema>): Draft {
  // "ไม่มี — no hard stop" is not an alert: shown as one it reads as a red stop with nothing in it.
  const alerts = d.alerts.filter((a) => !/^\s*(ไม่มี|ไม่พบ)/.test(a.text));
  const ok = (label: string) => (c: string) => CODE.test(c.trim()) || (alerts.push({ level: "warn", text: `ตัวเลือก "${label}" มีค่าที่ไม่ใช่รหัส ("${c}") จึงตัดออก` }), false);
  const variants = d.variants.flatMap((v) => {
    const add = v.add.filter(ok(v.label)), remove = v.remove.filter(ok(v.label));
    const swap = v.swap.filter((s) => ok(v.label)(s.from) && ok(v.label)(s.to));
    const change = {
      ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}),
      ...(swap.length ? { swap: Object.fromEntries(swap.map((s) => [s.from.trim(), s.to.trim()])) } : {}),
    };
    if (!Object.keys(change).length && !v.question) return [];
    const label = v.label.replace(/^[A-Z]\d?\s*[:.)]\s*/, ""); // the screen letters variants itself (B, C, ...)
    return [{ label, change, ...(v.question ? { question: v.question, to: "แพทย์ผู้รักษา" } : {}) }];
  });
  return {
    lines: d.lines.map(({ when, ...l }) => ({ ...l, ...(when ? { when } : {}) })),
    summary: [d.clinical_summary.problem_and_final_dx, d.clinical_summary.investigations, d.clinical_summary.treatment_and_outcome,
      d.clinical_summary.post_discharge_plan, d.clinical_summary.home_medication],
    notCoded: d.not_coded,
    alerts,
    variants,
  };
}

// ── Runs ─────────────────────────────────────────────────────────────────────
const THINKING = "กำลังวิเคราะห์และเขียนผล"; // a step after tool results: the model reads them and writes
export const nowBkk = () =>new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16).replace("T", " ");

// One agent_run row per run. model = the model that produced the result; on a fallback, error keeps why the
// earlier model failed (a done run's error is not shown as a failure).
async function agentRun<T>(an: string, kind: "audit" | "dcsum", go: (m: Model, trace: Step[], say: Say) => Promise<{ value: T; steps: number; usage: unknown }>) {
  await db.exec(WARD_SCHEMA);
  const { rows } = await db.query<{ id: number }>(
    "insert into agent_run (an, kind, status, model, started_at, progress) values ($1, $2, 'running', $3, $4, 'กำลังอ่านคำสั่งของ skill') returning id",
    [an, kind, MODELS[0].id, nowBkk()]);
  const id = rows[0].id;
  // A progress line is only for the screen: a failed write must not fail the run.
  const say: Say = (progress) => db.query("update agent_run set progress = $2 where id = $1", [id, progress]).then(() => {}, () => {});
  const failed: string[] = [];
  for (const [i, m] of MODELS.entries()) {
    const trace: Step[] = [];
    if (i) await say("Provider หลักไม่พร้อม เปลี่ยนเป็น Fallback provider");
    try {
      const { value, steps, usage } = await go(m, trace, say);
      await db.query("update agent_run set status = 'done', finished_at = $2, steps = $3, usage = $4, trace = $5, model = $6, error = $7 where id = $1",
        [id, nowBkk(), steps, JSON.stringify(usage), JSON.stringify(trace), m.id, failed.join("\n") || null]);
      return value;
    } catch (e) {
      // ponytail: any error falls back, even one the next model cannot fix (e.g. a DB error); it only costs a retry
      failed.push(`${m.id}: ${e instanceof Error ? e.message : String(e)}`);
      if (i < MODELS.length - 1) continue;
      await db.query("update agent_run set status = 'error', finished_at = $2, trace = $3, model = $4, error = $5 where id = $1",
        [id, nowBkk(), JSON.stringify(trace), m.id, failed.join("\n")]);
      throw e;
    }
  }
  throw new Error("no agent model configured"); // unreachable: MODELS always has the primary
}

// A result is kept as a new version in ward_history, then shown as the latest (ward_audit / ward_draft), together.
// Reviews belong to the version they were made on, so a re-run starts clean and the old decisions stay with the old one.
async function saveVersion(an: string, kind: "audit" | "dcsum", result: unknown, model: string, hash: string,
  latest: (tx: Queryable, version: number, at: string) => Promise<unknown>) {
  const at = nowBkk();
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      "insert into ward_history (an, kind, at, model, hash, result) values ($1, $2, $3, $4, $5, $6) returning id",
      [an, kind, at, model, hash, JSON.stringify(result)]);
    await latest(tx, rows[0].id, at);
  });
}

const syncHash = async (an: string) => {
  const r = (await db.query<{ hash: string }>("select hash from ward_sync where an = $1", [an])).rows[0];
  if (!r) throw new Error(`AN ${an} ยังไม่ได้นำเข้าจาก HIS`);
  return r.hash;
};

export async function runAudit(an: string): Promise<AuditResult> {
  const hash = await syncHash(an);
  return agentRun(an, "audit", async (m, trace, say) => {
    const r = await generateText({
      model: m.model,
      instructions: cached(RUNTIME(an) + skillText(["chart-audit/SKILL.md", "chart-audit/references/pre-discharge-checklist.md", "chart-audit/assets/audit-report.md"])
        + `\n\nAfter scan-chart.ts, also read discharge-summary/scripts/chart.ts ${an}: it adds the medication orders, vital-sign
flowsheet, intake/output, follow-up appointments and ward history that scan-chart.ts does not print.
Step 6 (save-audit.ts) is done by the app from your structured output: do not try to run it.`),
      maxOutputTokens: m.maxOutputTokens,
      prompt: `Run the pre-discharge chart audit for AN ${an}.`,
      tools: { run_skill_script: skillScriptTool(an, ["chart-audit/scripts/scan-chart.ts", "discharge-summary/scripts/chart.ts"], trace, say) },
      output: Output.object({ schema: AuditSchema }),
      stopWhen: isStepCount(MAX_STEPS),
      onStepStart: ({ stepNumber }) => (stepNumber ? say(THINKING) : undefined),
    });
    const a = r.output;
    await say("กำลังบันทึกผล");
    await saveVersion(an, "audit", a, m.id, hash, (tx, version, at) => tx.query(
      `insert into ward_audit (an, status, at, report, hash, result, model, version) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (an) do update set status = excluded.status, at = excluded.at, report = excluded.report,
         hash = excluded.hash, result = excluded.result, model = excluded.model, version = excluded.version`,
      [an, a.status satisfies AuditStatus, at, a.report_markdown, hash, JSON.stringify(a), m.id, version]));
    return { value: a, steps: r.steps.length, usage: r.totalUsage };
  });
}

export async function runDischargeSummary(an: string): Promise<Draft> {
  const hash = await syncHash(an);
  const audit = (await db.query<{ report: string }>("select report from ward_audit where an = $1", [an])).rows[0];
  return agentRun(an, "dcsum", async (m, trace, say) => {
    const out: Submitted = { tries: 0 };
    const r = await generateText({
      model: m.model,
      maxOutputTokens: m.maxOutputTokens,
      instructions: cached(RUNTIME(an) + skillText([
        "discharge-summary/SKILL.md", "discharge-summary/assets/form.md", "discharge-summary/references/audit-and-coding-rules.md",
        "discharge-summary/references/examples.md", "thai-drg/SKILL.md", "thai-drg/references/tdrg-rules.md",
      ]) + `\n\nUse Mode 1 (Full Draft Mode). The structured output carries the same content as assets/form.md:
lines = Part 1 diagnoses/procedures with the Part 2.1 check of each code, clinical_summary = Clinical summary 1–5,
not_coded = 2.2, alerts = 2.3, variants = 2.4 with their 2.5 questions. The app groups the DRG from these codes,
so run thai-drg to check your coding but do not put DRG numbers in the result.
Variants: the app shows your lines as draft A, so never repeat A as a variant. Each variant is one alternative answer
with bare codes only (one code per string, no "or", no prose): make a separate variant for each alternative code.
To make another code the PDx, swap both ways, e.g. swap [{from:"E11.9",to:"I10"},{from:"I10",to:"E11.9"}].
Draft A follows the physician (coders query, they do not rewrite): keep the PDx the physician entered on the HIS
discharge summary, and put in A only diagnoses the physician entered. A different PDx, or a diagnosis the chart supports
but the physician did not enter, is a variant with a non-leading question. The app enforces this when it saves.
Clinical summary: write only what the chart records. Never add advice, warning signs to come back for, targets, plans
or appointments that no note records; where the chart has none, write "ยังไม่ได้ระบุ — รอแพทย์ยืนยัน".
Leave out alerts that only say nothing was found (e.g. "ไม่มี hard stop").
Return the result by calling submit_draft: that is the structured output here, not a reply. It checks every code;
when it answers accepted: false, fix the problems it lists (look the codes up again) and submit the whole draft again.`),
      prompt: `Draft the discharge summary for AN ${an}.${audit ? `\n\nThe chart audit already done for this AN, for context:\n${audit.report}` : ""}`,
      tools: {
        run_skill_script: skillScriptTool(an, Object.keys(SCRIPTS) as Script[], trace, say),
        submit_draft: submitDraftTool(out, trace, say),
      },
      stopWhen: [isStepCount(MAX_STEPS), () => !!out.draft],
      onStepStart: ({ stepNumber }) => (stepNumber ? say(THINKING) : undefined),
    });
    if (!out.draft) throw new Error(`no draft submitted after ${r.steps.length} steps`);
    await say("กำลังบันทึกผล");
    const his = (await db.query<HisDx>("select type, text, icd10 from ward_dx_his where an = $1 and form = 'DC Summary' order by seq", [an])).rows;
    const draft = followPhysician(toDraft(out.draft), his);

    // Still checked after the fact: a draft accepted after MAX_SUBMITS, and codes followPhysician brought from the HIS.
    const codes = [...new Set([...draft.lines.map((l) => l.code), ...draft.variants.flatMap((v) => [...(v.change.add ?? []), ...Object.values(v.change.swap ?? {})])])];
    for (const c of await unknownCodes(codes))
      draft.alerts.unshift({ level: "stop", text: `รหัส ${c} ไม่พบในตาราง ICD-10-TM / ICD-9-CM ต้องตรวจก่อนใช้` });

    await saveVersion(an, "dcsum", draft, m.id, hash, (tx, version, at) => tx.query(
      `insert into ward_draft (an, draft, at, model, hash, version) values ($1, $2, $3, $4, $5, $6)
       on conflict (an) do update set draft = excluded.draft, at = excluded.at, model = excluded.model, hash = excluded.hash,
         version = excluded.version`,
      [an, JSON.stringify(draft), at, m.id, hash, version]));
    return { value: draft, steps: r.steps.length, usage: r.totalUsage };
  });
}
