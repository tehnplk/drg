"use client";

// Approve the reviewed draft for the claim: who summarised it (physician and licence number) and who coded it.
// The server rebuilds the coding from the saved decisions and groups it, so this card only collects the signatures.
import { BadgeCheck, LoaderCircle, TriangleAlert, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { approveDraft, unapproveDraft } from "@/app/actions.ts";
import { useReviewer } from "@/components/reviewer.tsx";
import type { Final } from "@/lib/charts.ts";
import { formatThaiDateTime } from "@/lib/thai-date.ts";
import { BAHT_PER_ADJRW } from "@/lib/ward.ts";

const input = "w-full rounded-lg px-3 py-2 text-sm ring-1 ring-slate-300 focus:ring-2 focus:ring-indigo-500 dark:bg-slate-900 dark:ring-slate-700";

export function Approve({ an, version, latest, missing, final, attending }: {
  an: string;
  version: number | null; // the draft version on screen
  latest: boolean; // false: an older version, opened from the history
  missing: string[]; // decisions still to make (lib/ward.ts finalCoding)
  final: Final | null;
  attending: string; // the attending physician, to prefill the signature
}) {
  const by = useReviewer();
  // the HIS writes the attending as "พญ.ชื่อ สกุล ว12345": split off the licence number; coder empty = the user
  const [form, setForm] = useState({ physician: attending.replace(/\s*ว\.?\s*\d+$/, ""), license: attending.match(/ว\.?\s*(\d+)$/)?.[1] ?? "", coder: "" });
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  if (final) return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-4 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30">
        <BadgeCheck className="size-8 shrink-0 text-emerald-600" />
        <div className="grid flex-1 gap-0.5 text-sm">
          <b className="text-emerald-900 dark:text-emerald-200">อนุมัติรหัสเพื่อส่งเบิกแล้ว · DRG {final.drg} · AdjRW {final.adjrw.toFixed(4)} · ประมาณ {Math.round(final.adjrw * BAHT_PER_ADJRW).toLocaleString("th-TH")} บาท</b>
          <span className="text-emerald-800 dark:text-emerald-300">
            รหัส {final.coded.map((c) => c.code).join(", ")} · แพทย์ผู้สรุป {final.physician} ว.{final.license} · ผู้ให้รหัส {final.coder}
          </span>
          <span className="text-xs text-emerald-700 dark:text-emerald-400">กดอนุมัติโดย {final.by} เมื่อ {formatThaiDateTime(final.at)}</span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(() => unapproveDraft(an))}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-300 hover:bg-white disabled:opacity-60 dark:text-slate-200 dark:ring-slate-600 dark:hover:bg-slate-800"
        >
          <Undo2 className="size-4" /> ยกเลิกการอนุมัติ
        </button>
      </div>
      {final.version !== version && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert className="size-4 shrink-0" />
          การอนุมัตินี้ทำจากร่างรุ่นอื่น (รุ่น {final.version}) ไม่ใช่ร่างที่แสดงอยู่ ถ้าจะใช้ร่างนี้ ให้ยกเลิกการอนุมัติแล้วอนุมัติใหม่
        </p>
      )}
    </div>
  );

  if (version == null) return <p className="text-sm text-slate-400">ยังไม่มีร่างให้อนุมัติ กด &ldquo;Complete with AI&rdquo; ก่อน</p>;
  if (!latest) return <p className="text-sm text-slate-500">นี่คือร่างรุ่นเก่าจากประวัติ ดูได้อย่างเดียว อนุมัติได้เฉพาะร่างรุ่นล่าสุด</p>;

  const ready = !missing.length && !!by;
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        start(async () => {
          const why = await approveDraft(an, version, { ...form, coder: form.coder.trim() || by, by });
          if (why) setError(why);
        });
      }}
    >
      {missing.length > 0 && (
        <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert className="size-4 shrink-0" />
          <span>ต้องตัดสินให้ครบก่อนอนุมัติ ยังเหลือ {missing.length} รายการ: {missing.join(" · ")}</span>
        </p>
      )}
      {!by && <p className="text-sm text-amber-700 dark:text-amber-300">ใส่ชื่อผู้ใช้งานที่แถบด้านบนก่อน ชื่อนี้จะบันทึกเป็นผู้กดอนุมัติ</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">แพทย์ผู้สรุป (ชื่อ–สกุล)</span><input required maxLength={100} value={form.physician} onChange={set("physician")} className={input} /></label>
        <label className="grid gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">เลขใบประกอบวิชาชีพ (ว.)</span><input required maxLength={100} value={form.license} onChange={set("license")} className={`${input} font-mono`} /></label>
        <label className="grid gap-1 text-sm"><span className="text-slate-600 dark:text-slate-300">ผู้ให้รหัสโรค / หัตถการ</span><input maxLength={100} value={form.coder} onChange={set("coder")} placeholder={by ? `${by} (ผู้ใช้งาน)` : ""} className={input} /></label>
      </div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      <div>
        <button
          disabled={!ready || pending}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <LoaderCircle className="size-4 animate-spin" /> : <BadgeCheck className="size-4" />}
          อนุมัติรหัสเพื่อส่งเบิก
        </button>
        <span className="ml-3 text-xs text-slate-500">ระบบจัดกลุ่ม DRG จากรหัสที่รับและคำตอบที่บันทึกไว้อีกครั้งตอนอนุมัติ</span>
      </div>
    </form>
  );
}
