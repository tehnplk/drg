// The top of every page of one case: who the patient is, the three steps of the work as tabs with where each stands,
// the AI actions for the first two, and the way to the next case waiting. Server component.
import { ArrowLeft, ArrowRight, FileText, MessageCircleQuestion, Scale } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { approved, chartHref, chartRows, draftDrg, isPending, latestRuns, precodeStale, type AgentKind } from "@/lib/charts.ts";
import { formatThaiDateTime } from "@/lib/thai-date.ts";
import { ageText, losDays } from "@/lib/ward.ts";
import { AgentButton } from "./agent-button.tsx";
import { RunNote, dcStatus, queryStatus } from "./chart-table.tsx";
import { ImportButton } from "./import-button.tsx";
import { Chip, PatientAvatar, card } from "./ui.tsx";

export async function CaseHeader({ an, active }: { an: string; active: AgentKind | "drg" }) {
  const rows = await chartRows();
  const p = rows.find((r) => r.an === an);
  if (!p) notFound();
  const runs = await latestRuns([an]);
  const run = (kind: AgentKind) => runs.find((r) => r.kind === kind);
  const drg = await draftDrg(p);

  // Next case: the pending one listed after this one, wrapping to the top; none when this is the only one left.
  const queue = rows.filter(isPending);
  const at = queue.findIndex((r) => r.an === an);
  const next = at < 0 ? queue[0] : queue[at + 1] ?? queue.find((r) => r.an !== an);

  const dc = dcStatus({ pdx_text: p.pdx_text, local: p });
  const q = queryStatus(p);
  const tabs = [
    { key: "precode", href: `/charts/${an}/query`, n: 1, label: "Pre-coding + Query", icon: MessageCircleQuestion, done: !!p.precode,
      status: <>{precodeStale(p) && <Chip tone="amber">เก่ากว่าข้อมูล HIS</Chip>} <Chip tone={q.tone}>{q.label}</Chip></> },
    { key: "dcsum", href: `/charts/${an}/coding`, n: 2, label: "Complete coding", icon: FileText, done: !!p.draft_model,
      status: <Chip tone={dc.tone}>{dc.label}</Chip> },
    { key: "drg", href: `/charts/${an}/drg`, n: 3, label: "DRG / AdjRW", icon: Scale, done: approved(p),
      status: approved(p)
        ? <Chip tone="emerald">อนุมัติแล้ว · DRG {drg?.drg} · AdjRW {drg?.adjrw.toFixed(4)}</Chip>
        : drg ? <Chip tone="violet">DRG {drg.drg} · AdjRW {drg.adjrw.toFixed(4)}</Chip> : <Chip tone="slate">ยังไม่มีรหัส</Chip> },
  ] as const;

  return (
    <header className={`grid gap-4 p-5 ${card}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Link href="/charts" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400">
          <ArrowLeft className="size-4" /> รายการรอให้รหัส
        </Link>
        {next && (
          <Link href={chartHref(next)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-800">
            เคสถัดไป: {next.name} <span className="font-mono text-xs text-slate-500">AN {next.an}</span> <ArrowRight className="size-4" />
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <span className="hidden sm:block"><PatientAvatar p={p} size="lg" /></span>
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">{p.name}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            HN <span className="font-mono">{p.hn}</span> · AN <span className="font-mono">{p.an}</span> · {p.sex === "1" ? "ชาย" : "หญิง"} {ageText(p)}
            {" · "}{p.ward}{p.bed ? ` เตียง ${p.bed}` : ""} · LOS {losDays(p)} วัน · {p.insurance}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            รับไว้ {formatThaiDateTime(p.admit_at)} · จำหน่าย {formatThaiDateTime(p.discharge_at)}
            {p.synced_at && <> · ข้อมูลจาก HIS ล่าสุด {formatThaiDateTime(p.synced_at)}</>}
          </p>
        </div>
        <ImportButton an={an} again />
      </div>

      <div className="grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-3 dark:border-slate-800">
        {tabs.map((t) => {
          const current = t.key === active;
          return (
            <div key={t.key} className={`flex flex-wrap items-center gap-3 rounded-xl p-3 ring-1 ${current ? "bg-indigo-50 ring-indigo-300 dark:bg-indigo-500/10 dark:ring-indigo-500/40" : "ring-slate-200 dark:ring-slate-700"}`}>
              <Link href={t.href} aria-current={current ? "page" : undefined} className="group flex min-w-0 flex-1 items-center gap-3">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${current ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{t.n}</span>
                <span className="min-w-0">
                  <span className={`flex items-center gap-1.5 font-semibold ${current ? "text-indigo-800 dark:text-indigo-200" : "text-slate-800 group-hover:text-indigo-700 dark:text-slate-100"}`}>
                    <t.icon className="size-4" /> {t.label}
                  </span>
                  <span className="mt-1 block">{t.status}</span>
                </span>
              </Link>
              {t.key !== "drg" && (
                <div className="flex flex-col items-end">
                  <AgentButton kind={t.key} an={an} again={t.done} running={run(t.key)?.status === "running"} />
                  <RunNote run={run(t.key)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </header>
  );
}
