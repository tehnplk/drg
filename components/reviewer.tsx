"use client";

// Who is working at this computer: the name saved with every decision and approval. The app has no login, so the
// user types it once in the app bar and this browser remembers it (localStorage; a private window starts empty).
import { UserRound } from "lucide-react";
import { useSyncExternalStore } from "react";

const KEY = "plk-reviewer";
const CHANGED = "plk-reviewer-changed";

const read = () => {
  try { return localStorage.getItem(KEY) ?? ""; } catch { return ""; }
};
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => { window.removeEventListener("storage", onChange); window.removeEventListener(CHANGED, onChange); };
};

export const useReviewer = () => useSyncExternalStore(subscribe, read, () => "").trim();

function save(name: string) {
  try { localStorage.setItem(KEY, name); } catch { /* storage blocked: the name lasts until reload */ }
  window.dispatchEvent(new Event(CHANGED));
}

export function ReviewerField() {
  const name = useSyncExternalStore(subscribe, read, () => "");
  return (
    <label className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm ring-1 ${name.trim() ? "ring-slate-200 dark:ring-slate-700" : "ring-amber-400 bg-amber-50 dark:bg-amber-500/10"}`}>
      <UserRound className="size-4 shrink-0 text-slate-400" />
      <span className="sr-only">ชื่อผู้ใช้งาน (บันทึกกับทุกการตัดสินใจ)</span>
      <input
        value={name}
        onChange={(e) => save(e.target.value)}
        maxLength={100}
        placeholder="ใส่ชื่อผู้ใช้งาน"
        title="ชื่อนี้บันทึกไว้กับทุกการยืนยันรหัส คำตอบ และการอนุมัติ"
        className="w-36 bg-transparent outline-none placeholder:text-amber-700 dark:placeholder:text-amber-300"
      />
    </label>
  );
}
