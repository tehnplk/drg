"use client";

// A vertical divider the user drags (or moves with the arrow keys) to share the width between the content on its left
// and the panel on its right. The share is a fraction of the row (0.4 = the panel takes 40%), so it holds on any
// screen width. Double-click returns to the default. Kept per browser in localStorage.
import { useEffect, useRef, useState } from "react";

const STEP = 0.02;

export function useSplit(key: string, initial: number) {
  const [share, setShare] = useState(initial);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (saved > 0 && saved < 1) setShare(saved); // eslint-disable-line react-hooks/set-state-in-effect -- read once after mount; the server has no localStorage
    } catch { /* storage blocked: keep the default */ }
  }, [key]);
  const save = (s: number) => {
    setShare(s);
    try { localStorage.setItem(key, String(s)); } catch { /* storage blocked */ }
  };
  return [share, save, initial] as const;
}

// Grid columns for a row split by `share`: content | handle | panel. Use with lg:grid-cols-[var(--split-cols)].
export const splitColumns = (share: number) =>
  ({ "--split-cols": `minmax(0,${Math.round((1 - share) * 1000)}fr) 0.75rem minmax(0,${Math.round(share * 1000)}fr)` }) as React.CSSProperties;

export function SplitHandle({ share, onChange, initial, min = 0.2, max = 0.6, label }: {
  share: number; onChange: (s: number) => void; initial: number; min?: number; max?: number; label: string;
}) {
  const drag = useRef<{ x: number; share: number; width: number } | null>(null);
  const clamp = (s: number) => Math.min(max, Math.max(min, Math.round(s * 1000) / 1000));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(share * 100)}
      aria-valuemin={Math.round(min * 100)}
      aria-valuemax={Math.round(max * 100)}
      aria-valuetext={`แผงขวากว้าง ${Math.round(share * 100)}%`}
      tabIndex={0}
      title="ลากเพื่อปรับความกว้าง · ดับเบิลคลิกเพื่อคืนค่าเดิม"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, share, width: e.currentTarget.parentElement?.getBoundingClientRect().width ?? window.innerWidth };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => drag.current && onChange(clamp(drag.current.share - (e.clientX - drag.current.x) / drag.current.width))}
      onPointerUp={() => { drag.current = null; }}
      onDoubleClick={() => onChange(initial)}
      onKeyDown={(e) => {
        const delta = { ArrowLeft: STEP, ArrowRight: -STEP }[e.key];
        if (delta) { e.preventDefault(); onChange(clamp(share + delta)); }
        if (e.key === "Home") { e.preventDefault(); onChange(initial); }
      }}
      className="group hidden cursor-col-resize touch-none items-stretch justify-center self-stretch outline-none lg:flex"
    >
      <span className="w-0.5 rounded-full bg-slate-200 transition-colors group-hover:bg-indigo-400 group-focus-visible:bg-indigo-500 group-active:bg-indigo-500 dark:bg-slate-800" />
    </div>
  );
}
