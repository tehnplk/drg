// The patient table both work lists show: identity, LOS, PDx and DRG, then where the chart stands in each step
// (import → audit → D/C summary) with the buttons for the next step. Server component.
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { auditStale, chartHref, draftDrg, draftStale, hasDraft, type AgentRun, type ChartRow } from "@/lib/charts.ts";
import { formatThaiDateTime as when } from "@/lib/thai-date.ts";
import { AUDIT_STATUS, ageText, LINE_ROLES, losDays, type AuditStatus, type Patient } from "@/lib/ward.ts";
import { AgentButton } from "./agent-button.tsx";
import { AgentProgress } from "./agent-progress.tsx";
import { ImportButton } from "./import-button.tsx";
import { Chip, type Tone } from "./ui.tsx";

export type ChartItem = Pick<Patient, "an" | "hn" | "sex" | "age" | "age_day" | "admit_at" | "discharge_at" | "leave_days"> & {
  name: string;
  pdx_text: string | null; // the physician's principal diagnosis in the HIS D/C summary
  local?: ChartRow; // set once the chart is imported
};

export const AUDIT_TONE: Record<AuditStatus, Tone> = { blocking: "rose", gaps: "amber", ready: "emerald" };

export function dcStatus(i: Pick<ChartItem, "pdx_text" | "local">): { label: string; tone: Tone } {
  if (i.local && hasDraft(i.local)) return draftStale(i.local)
    ? { label: "ร่างเก่ากว่าข้อมูล HIS", tone: "amber" }
    : { label: "AI ร่างและให้รหัสแล้ว", tone: "emerald" };
  return i.pdx_text ? { label: "แพทย์สรุปใน HIS", tone: "sky" } : { label: "แพทย์ยังไม่สรุป", tone: "slate" };
}

// The latest agent run of one kind, when it is still running or failed (a finished run shows as its result).
// The raw error stays in agent_run; the screen says what to do about the common ones.
export function RunNote({ run }: { run?: AgentRun }) {
  if (!run || run.status === "done") return null;
  if (run.status === "running") return <div className="mt-1 max-w-64"><AgentProgress an={run.an} kind={run.kind} /></div>;
  const e = run.error ?? "";
  const why = /requires more credits|insufficient credits/i.test(e) ? "เครดิต OpenRouter ไม่พอ ต้องเติมเครดิตก่อน"
    : /ECONNREFUSED|fetch failed|ETIMEDOUT/i.test(e) ? "ต่อ OpenRouter ไม่ได้ ตรวจอินเทอร์เน็ต"
    : e.slice(0, 160);
  return <div className="mt-1 max-w-56 text-xs break-words text-rose-700 dark:text-rose-300">AI ทำไม่สำเร็จ ({when(run.started_at)}): {why}</div>;
}

const StaleNote = () => <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">ข้อมูลจาก HIS เปลี่ยนหลังจากนี้ ควรทำใหม่</div>;
const linkCls = "text-indigo-600 hover:underline dark:text-indigo-300";
// imported: false for the HIS list (step 1), which shows only identity, the HIS summary state and import / Re-Sync;
// the DRG, audit and AI columns belong to the work list (step 2).
export async function ChartTable({ items, runs, imported = true }: { items: ChartItem[]; runs: AgentRun[]; imported?: boolean }) {
  const drgs = await Promise.all(items.map((i) => (i.local ? draftDrg(i.local) : null)));
  const runOf = (an: string, kind: AgentRun["kind"]) => runs.find((r) => r.an === an && r.kind === kind);
  const head = ["#", "วันที่จำหน่าย", "HN", "AN", "ชื่อ-นามสกุล", "LOS", "PDx", ...(imported ? ["DRG", "AdjRW", "Audit"] : []), "D/C summary", ""];

  return (
    <table className={`w-full text-left text-sm ${imported ? "min-w-[72rem]" : "min-w-[56rem]"}`}>
      <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50">
        <tr>{head.map((h, i) => <th key={i} className="px-3 py-3 font-medium whitespace-nowrap">{h}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((it, i) => {
          const l = it.local;
          const drg = drgs[i];
          const pdx = l?.draft?.lines.find((x) => LINE_ROLES[x.type] === "pdx")?.code;
          const dc = dcStatus(it);
          return (
            <tr key={it.an} className="align-top hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
              <td className="px-3 py-3 text-slate-400">{i + 1}</td>
              <td className="px-3 py-3 whitespace-nowrap">{when(it.discharge_at)}</td>
              <td className="px-3 py-3 font-mono">{it.hn}</td>
              <td className="px-3 py-3 font-mono">{it.an}</td>
              <td className="px-3 py-3 whitespace-nowrap">
                <div className="font-medium text-slate-900 dark:text-slate-100">{it.name}</div>
                <div className="text-xs text-slate-500">{it.sex === "1" ? "ชาย" : "หญิง"} · {ageText(it)}{l?.ward ? ` · ${l.ward}` : ""}</div>
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{losDays(it)} วัน</td>
              <td className="max-w-64 px-3 py-3">
                {pdx && <Chip tone="indigo" mono>{pdx}</Chip>}
                <div className="mt-0.5 text-xs text-slate-500">{it.pdx_text ?? l?.working_dx ?? "–"}</div>
              </td>
              {imported && <>
              <td className="px-3 py-3 font-mono">{drg?.drg ?? "–"}</td>
              <td className="px-3 py-3 font-mono">{drg ? drg.adjrw.toFixed(4) : "–"}</td>
              <td className="px-3 py-3">
                {l?.audit ? (
                  <>
                    <Link href={`/charts/${it.an}/audit`} className="hover:opacity-80">
                      <Chip tone={AUDIT_TONE[l.audit]}>{AUDIT_STATUS[l.audit]}</Chip>
                    </Link>
                    <div className="mt-0.5 text-xs text-slate-500">{when(l.audit_at ?? "")} · <Link href={`/charts/${it.an}/audit`} className={linkCls}>ดูรายงาน</Link></div>
                    {auditStale(l) && <StaleNote />}
                  </>
                ) : (
                  <Chip tone="slate">{l ? "ยังไม่ audit" : "ยังไม่นำเข้าชาร์ท"}</Chip>
                )}
                <RunNote run={runOf(it.an, "audit")} />
                {l && <AgentButton kind="audit" an={it.an} again={!!l.audit} running={runOf(it.an, "audit")?.status === "running"} />}
              </td>
              </>}
              <td className="px-3 py-3">
                <Chip tone={dc.tone}>{dc.label}</Chip>
                {l?.draft_at && (
                  <div className="mt-0.5 text-xs text-slate-500">{when(l.draft_at)} · <Link href={`/charts/${it.an}/discharge-summary`} className={linkCls}>ดูร่าง</Link></div>
                )}
                {imported && <RunNote run={runOf(it.an, "dcsum")} />}
                {l && imported && <AgentButton kind="dcsum" an={it.an} again={!!l.draft_model} running={runOf(it.an, "dcsum")?.status === "running"} />}
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-end gap-2">
                  {l ? (
                    <>
                      <ImportButton an={it.an} again compact />
                      {imported && (
                        <Link
                          href={chartHref(l)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 font-medium whitespace-nowrap text-white hover:bg-indigo-700"
                        >
                          เปิดชาร์ท <ArrowRight className="size-4" />
                        </Link>
                      )}
                    </>
                  ) : (
                    <ImportButton an={it.an} />
                  )}
                </div>
                {l?.synced_at && <div className="mt-1 text-right text-xs text-slate-500">sync ล่าสุด {when(l.synced_at)}</div>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
