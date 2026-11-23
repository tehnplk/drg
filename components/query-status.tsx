"use client";

// One audit query to the physician: open / answered / closed, with the answer as noted, saved as a review of the
// audit version (item "query:<i>"; no review = still open).
import { useState } from "react";
import { saveReview } from "@/app/actions.ts";
import type { Review } from "@/lib/ward.ts";
import { formatThaiDateTime } from "@/lib/thai-date.ts";
import { useReviewer } from "./reviewer.tsx";

const STATES = [["", "เปิดอยู่"], ["answered", "แพทย์ตอบแล้ว"], ["closed", "ปิดแล้ว"]] as const;

export function QueryStatus({ version, index, saved, readOnly }: { version: number; index: number; saved?: Review; readOnly: boolean }) {
  const by = useReviewer();
  const [review, setReview] = useState(saved);
  const [note, setNote] = useState(saved?.note ?? "");
  const [error, setError] = useState("");

  const save = (decision: string, text: string) => {
    if (!by) return setError("ใส่ชื่อผู้ใช้งานที่แถบด้านบนก่อน");
    setError("");
    saveReview(version, `query:${index}`, decision || null, by, text.trim() || null)
      .then((r) => setReview(r ?? undefined))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };
  const state = review?.decision ?? "";

  return (
    <div className="grid min-w-48 gap-1.5">
      <select
        value={state}
        disabled={readOnly}
        onChange={(e) => save(e.target.value, note)}
        aria-label={`สถานะคำถามข้อ ${index + 1}`}
        className={`rounded-lg px-2 py-1 text-xs font-medium ring-1 ${state === "closed" ? "bg-emerald-50 text-emerald-800 ring-emerald-300" : state === "answered" ? "bg-sky-50 text-sky-800 ring-sky-300" : "bg-amber-50 text-amber-800 ring-amber-300"} dark:bg-slate-900 dark:text-slate-200`}
      >
        {STATES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      {(state || note) && (
        <textarea
          value={note}
          disabled={readOnly}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (review?.note ?? "") && state && save(state, note)}
          maxLength={2000}
          rows={2}
          placeholder="คำตอบของแพทย์ / สิ่งที่แก้ในชาร์ท"
          className="rounded-lg px-2 py-1 text-xs ring-1 ring-slate-300 dark:bg-slate-900 dark:ring-slate-700"
        />
      )}
      {review && <span className="text-[11px] text-slate-500">{review.by} · {formatThaiDateTime(review.at)}</span>}
      {error && <span role="alert" className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
