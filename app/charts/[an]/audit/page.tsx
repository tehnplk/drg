import { ClipboardCheck, MessageCircleQuestion, OctagonX, Sparkles, Stethoscope, TriangleAlert, Wrench } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { CaseHeader } from "@/components/case-header.tsx";
import { AUDIT_TONE as TONE } from "@/components/chart-table.tsx";
import { Chip, IconTile, card, type Tone } from "@/components/ui.tsx";
import type { AuditResult } from "@/lib/agent.ts";
import { db } from "@/lib/db.ts";
import { formatThaiDateTime } from "@/lib/thai-date.ts";
import { AUDIT_STATUS, type AuditStatus } from "@/lib/ward.ts";

export const metadata: Metadata = { title: "Audit ชาร์ท" };

export default function AuditPage(props: PageProps<"/charts/[an]/audit">) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto grid w-full max-w-[120rem] content-start gap-6 p-4 sm:p-8">
        <Suspense fallback={<p className="text-slate-500">กำลังโหลดรายงาน...</p>}>
          <Report params={props.params} />
        </Suspense>
      </main>
    </div>
  );
}

const READY = { ok: ["ครบ", "emerald"], gap: ["ยังขาด", "amber"], na: ["ไม่เกี่ยวข้อง", "slate"] } as const;

type Audit = { status: AuditStatus; at: string; model: string | null; hash: string | null; result: AuditResult | null; report: string };
type Run = { steps: number | null; usage: { inputTokens?: number; outputTokens?: number } | null; trace: { script: string; args: string[]; ok: boolean; ms: number }[] | null; started_at: string; finished_at: string | null };

function Section({ id, icon, tone, title, children }: { id: string; icon: typeof OctagonX; tone: Tone; title: string; children: ReactNode }) {
  return (
    <section id={id} className={`grid scroll-mt-20 gap-3 p-5 ${card}`}>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-50"><IconTile icon={icon} tone={tone} size="sm" />{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">ไม่มี</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500"><tr>{head.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 align-top dark:divide-slate-800">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="py-2 pr-4 text-slate-700 dark:text-slate-300">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

async function Report({ params }: Pick<PageProps<"/charts/[an]/audit">, "params">) {
  await connection();
  const { an } = await params;
  const audit = (await db.query<Audit>("select status, at, model, hash, result, report from ward_audit where an = $1", [an])).rows[0];
  const sync = (await db.query<{ hash: string }>("select hash from ward_sync where an = $1", [an])).rows[0];
  const run = (await db.query<Run>(
    "select steps, usage, trace, started_at, finished_at from agent_run where an = $1 and kind = 'audit' and status = 'done' order by id desc limit 1", [an])).rows[0];
  const a = audit?.result;

  const summary = a && [
    ["#blocking", "เงื่อนไขบังคับที่ขาด", a.blocking.length, "text-rose-700 dark:text-rose-300"],
    ["#evidence", "หลักฐานไม่พอ", a.evidence_risks.length, "text-orange-700 dark:text-orange-300"],
    ["#clinical", "ข้อมูลคลินิกที่ยังไม่รับรอง", a.clinical_gaps.length, "text-sky-700 dark:text-sky-300"],
    ["#readiness", "องค์ประกอบที่ยังขาด", a.readiness.filter((r) => r.status === "gap").length, "text-teal-700 dark:text-teal-300"],
    ["#queries", "คำถามถึงแพทย์", a.queries.length, "text-violet-700 dark:text-violet-300"],
  ] as const;

  return (
    <>
      <CaseHeader an={an} active="audit" />

      {!audit ? (
        <p className="rounded-xl bg-amber-50 p-4 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          ยังไม่มีผล audit ของเคสนี้ กด &ldquo;Audit with AI&rdquo; ที่ขั้นที่ 1 ด้านบน ใช้เวลาประมาณ 1–3 นาที
        </p>
      ) : !a ? (
        <pre className={`overflow-x-auto p-5 text-sm whitespace-pre-wrap ${card}`}>{audit.report}</pre>
      ) : (
        <>
          {audit.hash && sync && audit.hash !== sync.hash && (
            <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              ข้อมูลจาก HIS เปลี่ยนหลังจาก audit นี้ ผลด้านล่างอาจไม่ตรงกับชาร์ทปัจจุบัน ควรกด &ldquo;Audit with AI อีกครั้ง&rdquo;
            </p>
          )}
          <nav aria-label="สรุปผล audit" className={`flex flex-wrap items-center gap-2 p-4 ${card}`}>
            <Chip tone={TONE[audit.status]}>{AUDIT_STATUS[audit.status]}</Chip>
            {summary!.map(([href, label, n, color]) => (
              <a key={href} href={href} className={`rounded-lg px-2.5 py-1 text-sm ring-1 ring-inset hover:bg-slate-50 dark:hover:bg-slate-800 ${n ? "font-medium text-slate-800 ring-slate-300 dark:text-slate-100 dark:ring-slate-600" : "text-slate-400 ring-slate-200 dark:ring-slate-800"}`}>
                {label} <span className={`ml-1 font-semibold tabular-nums ${n ? color : ""}`}>{n}</span>
              </a>
            ))}
          </nav>
          <Section id="blocking" icon={OctagonX} tone="rose" title="1. เงื่อนไขบังคับที่ขาด (Blocking — MRA / TDRG)">
            <Table head={["ประเด็น", "สิ่งที่ต้องบันทึกเพิ่มก่อนจำหน่าย"]} rows={a.blocking.map((b) => [b.issue, b.action])} />
          </Section>
          <Section id="evidence" icon={TriangleAlert} tone="orange" title="2. ความเสี่ยงหลักฐานไม่พอ (Over-coding / Audit risk)">
            <Table head={["ข้อความ/ภาวะในชาร์ท", "หลักฐานที่ยังขาดหรือขัดแย้ง", "แนวทางตรวจสอบก่อนสรุป"]} rows={a.evidence_risks.map((e) => [e.statement, e.gap, e.check])} />
          </Section>
          <Section id="clinical" icon={Stethoscope} tone="sky" title="3. ข้อมูลคลินิกและความจำเพาะที่ยังไม่มีบันทึกแพทย์รับรอง">
            <Table head={["สิ่งที่พบในชาร์ท", "จุดที่ยังไม่ชัดเจนในบันทึกแพทย์"]} rows={a.clinical_gaps.map((c) => [c.finding, c.unclear])} />
          </Section>
          <Section id="readiness" icon={ClipboardCheck} tone="teal" title="4. ความพร้อมองค์ประกอบก่อนจำหน่าย (MRA 4, 5, 6, 8)">
            <Table head={["รายการ", "สถานะ", "หมายเหตุ"]} rows={a.readiness.map((r) => [r.item, <Chip key="s" tone={READY[r.status][1]}>{READY[r.status][0]}</Chip>, r.note])} />
          </Section>
          <Section id="queries" icon={MessageCircleQuestion} tone="violet" title="5. คำถามถึงแพทย์/ทีมก่อนเขียน Discharge Summary">
            <Table head={["#", "คำถาม", "ผู้รับผิดชอบ"]} rows={a.queries.map((q, i) => [i + 1, q.question, q.owner])} />
          </Section>
        </>
      )}

      {audit && (
        <section className={`grid gap-2 p-5 text-sm text-slate-600 dark:text-slate-300 ${card}`}>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-50"><IconTile icon={Sparkles} tone="slate" size="sm" />ที่มาของผลนี้</h2>
          <p>
            {audit.model ? <>AI ({audit.model}) ทำตาม skill <span className="font-mono">chart-audit</span> เมื่อ {formatThaiDateTime(audit.at)}</> : <>บันทึกด้วยมือเมื่อ {formatThaiDateTime(audit.at)}</>}
            {run?.steps != null && <> · {run.steps} รอบ · token เข้า {run.usage?.inputTokens?.toLocaleString() ?? "-"} / ออก {run.usage?.outputTokens?.toLocaleString() ?? "-"}</>}
          </p>
          {!!run?.trace?.length && (
            <ul className="grid gap-1">
              {run.trace.map((t, i) => (
                <li key={i} className="flex items-start gap-2 font-mono text-xs">
                  <Wrench className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                  <span className={t.ok ? "" : "text-rose-600"}>{t.script} {t.args.join(" ").slice(0, 100)} · {(t.ms / 1000).toFixed(1)} s</span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">ผลจาก AI เป็นข้อเสนอให้แพทย์และทีมพิจารณา ไม่ใช่การวินิจฉัย</p>
        </section>
      )}
    </>
  );
}
