"use client";

import { LoaderCircle, Sparkles } from "lucide-react";
import { useFormStatus } from "react-dom";
import { runAgent } from "@/app/actions.ts";
import { AgentProgress } from "./agent-progress.tsx";

const LABEL = { audit: ["Audit with AI", "Audit with AI อีกครั้ง"], dcsum: ["Sum with AI", "Sum with AI อีกครั้ง"] } as const;

function Submit({ kind, an, again, running }: { kind: "audit" | "dcsum"; an: string; again: boolean; running: boolean }) {
  const { pending } = useFormStatus();
  const busy = pending || running;
  return (
    <>
      <button
        disabled={busy}
        className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium whitespace-nowrap text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50 disabled:opacity-70 dark:text-violet-300 dark:ring-violet-500/30 dark:hover:bg-violet-500/10"
      >
        {busy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {busy ? "AI กำลังทำงาน (1–3 นาที)" : LABEL[kind][again ? 1 : 0]}
      </button>
      {/* a run started before this page loaded shows its progress in RunNote instead */}
      {pending && <AgentProgress an={an} kind={kind} className="mt-1 block max-w-64" />}
    </>
  );
}

// again: a result already exists, so this replaces it. running: a run of this kind is already going on the server.
export function AgentButton({ kind, an, again = false, running = false }: { kind: "audit" | "dcsum"; an: string; again?: boolean; running?: boolean }) {
  return (
    <form action={runAgent.bind(null, kind, an)}>
      <Submit kind={kind} an={an} again={again} running={running} />
    </form>
  );
}
