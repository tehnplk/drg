"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { runAgent } from "@/app/actions.ts";
import type { AgentKind } from "@/lib/charts.ts";
import { AgentProgress } from "./agent-progress.tsx";

const LABEL = {
  precode: ["Pre-coding with AI", "Pre-coding with AI อีกครั้ง"],
  dcsum: ["Complete with AI", "Complete with AI อีกครั้ง"],
} as const;

function Submit({ kind, an, again, running }: { kind: AgentKind; an: string; again: boolean; running: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || running;
  // Idle: the button alone, bottom right. Busy: the spinner bottom left, the typed progress bottom right.
  return (
    <div className={`flex items-end gap-3 ${busy ? "justify-between" : "justify-end"}`}>
      <button
        disabled={busy}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50 disabled:opacity-70 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/10"
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {busy ? "AI กำลังทำงาน (1–3 นาที)" : LABEL[kind][again ? 1 : 0]}
      </button>
      {busy && <AgentProgress an={an} kind={kind} className="min-w-0 justify-end text-right" />}
    </div>
  );
}

// again: a result already exists, so this replaces it. running: a run of this kind is already going on the server.
export function AgentButton({ kind, an, again = false, running = false }: { kind: AgentKind; an: string; again?: boolean; running?: boolean }) {
  return (
    <form action={runAgent.bind(null, kind, an)} className="w-full">
      <Submit kind={kind} an={an} again={again} running={running} />
    </form>
  );
}
