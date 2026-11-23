"use client";

// "AI : <what it is doing now>", typed out a character at a time, while an agent run is going. Asks the server for
// the run's latest step every 1.5 s. With reduced motion the line appears whole.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_MS = 1500;
const TYPE_MS = 28;

// When the run ends (done or failed), refreshes the page once so its result shows, then stops polling. Only after it
// has seen the run going: right after a click the latest row can still be the previous, finished run.
function useProgress(an: string, kind: "audit" | "dcsum") {
  const [text, setText] = useState("กำลังเริ่มงาน");
  const router = useRouter();
  useEffect(() => {
    let live = true;
    let seen = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/agent-progress?an=${encodeURIComponent(an)}&kind=${kind}`, { cache: "no-store" });
        const { status, progress } = (await r.json()) as { status?: string | null; progress?: string | null };
        if (!live) return;
        if (status === "running") {
          seen = true;
          if (progress) setText(progress);
        } else if (seen) {
          live = false;
          clearInterval(id);
          router.refresh();
        }
      } catch { /* keep the last line; the next poll tries again */ }
    };
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => { live = false; clearInterval(id); };
  }, [an, kind, router]);
  return text;
}

function useTyped(text: string) {
  const [state, setState] = useState({ text, shown: 0 });
  if (state.text !== text) setState({ text, shown: 0 }); // a new step starts typing from the beginning
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setState((s) => ({ ...s, shown: s.text.length })); // eslint-disable-line react-hooks/set-state-in-effect -- reduced motion shows the line at once
      return;
    }
    const id = setInterval(() => setState((s) => (s.shown >= s.text.length ? s : { ...s, shown: s.shown + 1 })), TYPE_MS);
    return () => clearInterval(id);
  }, [text]);
  return [...state.text].slice(0, state.shown).join("");
}

export function AgentProgress({ an, kind, className = "" }: { an: string; kind: "audit" | "dcsum"; className?: string }) {
  const text = useProgress(an, kind);
  const typed = useTyped(text);
  return (
    <span role="status" aria-live="polite" aria-label={`AI : ${text}`} className={`inline-flex items-baseline gap-1 text-xs text-violet-700 dark:text-violet-300 ${className}`}>
      <b className="font-semibold">AI :</b>
      <span aria-hidden="true">
        {typed}
        <span className="ml-px inline-block w-[0.5ch] animate-[caret_1s_steps(1)_infinite] border-r-2 border-current motion-reduce:animate-none">&nbsp;</span>
      </span>
    </span>
  );
}
