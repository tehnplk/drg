"use client";

// The chart notes as a timeline with the date as its axis: one block per hospital day, times down the left of the
// line, a dot coloured by note type. Long notes open on demand; a filter shows one note type at a time.
import { FileText, FlaskConical, HeartPulse, MessageCircleQuestion, Stethoscope, Syringe, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Chip, IconTile, TONES, card, type Tone } from "@/components/ui.tsx";
import { formatThaiDate } from "@/lib/thai-date.ts";
import type { Note } from "@/lib/ward.ts";

const NOTE_KINDS: Record<Note["kind"], { label: string; icon: LucideIcon; tone: Tone }> = {
  admission: { label: "Admission note", icon: FileText, tone: "indigo" },
  progress: { label: "Progress note", icon: Stethoscope, tone: "sky" },
  consult: { label: "Consult", icon: MessageCircleQuestion, tone: "orange" },
  procedure: { label: "หัตถการ", icon: Syringe, tone: "violet" },
  nursing: { label: "บันทึกพยาบาล", icon: HeartPulse, tone: "pink" },
  lab: { label: "ผล LAB / X-RAY", icon: FlaskConical, tone: "teal" },
};

const SHORT_LINES = 4;

function NoteBody({ body }: { body: string }) {
  const [open, setOpen] = useState(false);
  const lines = body.split("\n");
  const long = lines.length > SHORT_LINES || body.length > 320;
  const shown = open || !long ? body : lines.slice(0, SHORT_LINES).join("\n").slice(0, 320);
  return (
    <>
      <p className="mt-1 whitespace-pre-line break-words text-slate-700 dark:text-slate-300">
        {shown}{!open && long && "…"}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">
          {open ? "ย่อ" : `แสดงทั้งหมด (${lines.length} บรรทัด)`}
        </button>
      )}
    </>
  );
}

// Hospital day: the admission date is day 1.
const dayNumber = (admitAt: string, day: string) =>
  Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${admitAt.slice(0, 10)}T00:00:00Z`)) / 86400_000) + 1;

export function NoteTimeline({ notes, admitAt }: { notes: Note[]; admitAt: string }) {
  const [kind, setKind] = useState<Note["kind"] | null>(null);
  const kinds = (Object.keys(NOTE_KINDS) as Note["kind"][]).filter((k) => notes.some((n) => n.kind === k));
  const days = Map.groupBy(notes.filter((n) => !kind || n.kind === kind), (n) => n.at.slice(0, 10));
  const pill = "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset";

  return (
    <div className={`p-5 ${card}`}>
      <h2 className="mb-3 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-50">
        <IconTile icon={FileText} tone="slate" size="sm" /> บันทึกในเวชระเบียน
      </h2>

      <div role="group" aria-label="กรองประเภทบันทึก" className="mb-4 flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!kind} onClick={() => setKind(null)}
          className={`${pill} ${!kind ? "bg-slate-900 text-white ring-slate-900 dark:bg-slate-100 dark:text-slate-900" : "text-slate-600 ring-slate-200 dark:text-slate-300 dark:ring-slate-700"}`}>
          ทั้งหมด {notes.length}
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(kind === k ? null : k)}
            className={`${pill} ${kind === k ? TONES[NOTE_KINDS[k].tone].chip : "text-slate-600 ring-slate-200 dark:text-slate-300 dark:ring-slate-700"}`}>
            {NOTE_KINDS[k].label} {notes.filter((n) => n.kind === k).length}
          </button>
        ))}
      </div>

      <div className="grid gap-5">
        {[...days].map(([day, items]) => (
          <section key={day} aria-label={`วันที่ ${dayNumber(admitAt, day)} ${formatThaiDate(day, { long: true })}`}>
            <h3 className="sticky top-0 z-10 -mx-1 mb-2 flex items-baseline gap-2 bg-white px-1 py-1.5 dark:bg-slate-900">
              <span className="rounded-md bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">วันที่ {dayNumber(admitAt, day)}</span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-50">{formatThaiDate(day)}</span>
              <span className="text-xs text-slate-400">{items.length} รายการ</span>
            </h3>
            <ol className="ml-12 border-l-2 border-slate-200 dark:border-slate-800">
              {items.map((n, i) => {
                const k = NOTE_KINDS[n.kind];
                return (
                  <li key={i} className="relative pb-4 pl-4 text-sm last:pb-1">
                    <time className="absolute top-0.5 -left-12 w-10 text-right font-mono text-xs text-slate-500">{n.at.slice(11, 16)}</time>
                    <span className={`absolute top-1.5 -left-[7px] size-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${TONES[k.tone].bar}`} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone={k.tone} icon={k.icon}>{k.label}</Chip>
                      {n.author && <span className="text-xs text-slate-500">{n.author}</span>}
                    </div>
                    <NoteBody body={n.body} />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}
