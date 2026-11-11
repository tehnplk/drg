import { Baby, UserRound, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { Patient } from "@/lib/ward.ts";

// One entry per colour so Tailwind sees every class literally.
export const TONES = {
  indigo: { tile: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300", chip: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-500/30", bar: "bg-indigo-500" },
  violet: { tile: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300", chip: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-500/30", bar: "bg-violet-500" },
  emerald: { tile: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-500/30", bar: "bg-emerald-500" },
  sky: { tile: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300", chip: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-500/30", bar: "bg-sky-500" },
  teal: { tile: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300", chip: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/30", bar: "bg-teal-500" },
  rose: { tile: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300", chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-500/30", bar: "bg-rose-500" },
  amber: { tile: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300", chip: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/30", bar: "bg-amber-500" },
  orange: { tile: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300", chip: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/10 dark:text-orange-300 dark:ring-orange-500/30", bar: "bg-orange-500" },
  pink: { tile: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300", chip: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/10 dark:text-pink-300 dark:ring-pink-500/30", bar: "bg-pink-500" },
  fuchsia: { tile: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300", chip: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:ring-fuchsia-500/30", bar: "bg-fuchsia-500" },
  slate: { tile: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300", chip: "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:ring-slate-500/30", bar: "bg-slate-400" },
} as const;
export type Tone = keyof typeof TONES;

// First keyword that appears in the ward name wins, so the more specific ward comes first.
const WARD_TONES: [string, Tone][] = [
  ["ICU", "rose"],
  ["ศัลยกรรมกระดูก", "orange"],
  ["ศัลยกรรม", "violet"],
  ["อายุรกรรม", "sky"],
  ["กุมาร", "teal"],
  ["ทารก", "pink"],
  ["สูติ", "fuchsia"],
];
export const wardTone = (ward: string): Tone => WARD_TONES.find(([k]) => ward.includes(k))?.[1] ?? "slate";

export const card = "rounded-2xl bg-white ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800";

export function IconTile({ icon: Icon, tone, size = "md" }: { icon: LucideIcon; tone: Tone; size?: "sm" | "md" | "lg" }) {
  const box = { sm: "size-7 rounded-lg", md: "size-9 rounded-xl", lg: "size-11 rounded-xl" }[size];
  const glyph = { sm: "size-4", md: "size-5", lg: "size-6" }[size];
  return (
    <span className={`grid shrink-0 place-items-center ${box} ${TONES[tone].tile}`}>
      <Icon className={glyph} />
    </span>
  );
}

export function Chip({ tone, icon: Icon, children, mono }: { tone: Tone; icon?: LucideIcon; children: ReactNode; mono?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone].chip} ${mono ? "font-mono" : ""}`}>
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

export function SectionCard({ id, step, icon, tone, title, subtitle, children }: {
  id: string;
  step: number;
  icon: LucideIcon;
  tone: Tone;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`scroll-mt-20 overflow-hidden ${card}`}>
      <div className={`h-1.5 ${TONES[tone].bar}`} />
      <div className="grid gap-6 p-5 sm:p-6">
        <header className="flex items-start gap-3">
          <IconTile icon={icon} tone={tone} size="lg" />
          <div>
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">ขั้นที่ {step}</div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-50">{step}. {title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          </div>
        </header>
        {children}
      </div>
    </section>
  );
}

export function SubHeading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
      <Icon className="size-4 text-slate-400" />
      {children}
    </h3>
  );
}

export function PatientAvatar({ p, size = "md" }: { p: Pick<Patient, "sex" | "age">; size?: "md" | "lg" }) {
  const tone: Tone = p.age === 0 ? "pink" : p.sex === "1" ? "sky" : "fuchsia";
  const box = size === "lg" ? "size-14" : "size-10";
  const Icon = p.age === 0 ? Baby : UserRound;
  return (
    <span className={`grid shrink-0 place-items-center rounded-full ${box} ${TONES[tone].tile}`}>
      <Icon className={size === "lg" ? "size-7" : "size-5"} />
    </span>
  );
}
