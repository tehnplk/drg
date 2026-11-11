"use client";

import {
  Activity, ArrowDownRight, ArrowLeft, ArrowUpRight, BadgeCheck, Ban, BedDouble, Building2, CalendarCheck, CalendarDays,
  Check, CircleArrowDown, CircleArrowUp, CircleCheck, CircleDashed, CircleHelp, CircleX, ClipboardList, Clock, DoorOpen,
  FileText, FlaskConical, Hash, HeartPulse, Info, Lightbulb, MessageCircleQuestion, Microscope, Minus, OctagonX, PenLine,
  Pill, Route, Scale, Scissors, ShieldCheck, Skull, Sparkles, Stethoscope, Syringe, Tags, TriangleAlert, UserCheck,
  UserRound, Wallet, X, type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  BAHT_PER_ADJRW, DISCHARGE_TYPES, LINE_ROLES, ageText, applyChange, fmtDate, losDays, toCase,
  type Change, type Coded, type Draft, type LineType, type Note, type Patient, type Status,
} from "@/lib/ward.ts";
import { Chip, IconTile, PatientAvatar, SectionCard, SubHeading, TONES, card, wardTone, type Tone } from "../ui.tsx";

const STATUS: Record<Status, { label: string; icon: LucideIcon; tone: Tone }> = {
  exact: { label: "Exact", icon: CircleCheck, tone: "emerald" },
  less: { label: "Less specific", icon: CircleArrowDown, tone: "sky" },
  more: { label: "More specific", icon: CircleArrowUp, tone: "amber" },
  partial: { label: "Partial", icon: CircleDashed, tone: "amber" },
  mismatch: { label: "Mismatch", icon: CircleX, tone: "rose" },
  ambiguous: { label: "Ambiguous", icon: CircleHelp, tone: "violet" },
};

const LEVELS: { level: Draft["alerts"][number]["level"]; label: string; icon: LucideIcon; tone: Tone }[] = [
  { level: "stop", label: "Hard stop", icon: OctagonX, tone: "rose" },
  { level: "warn", label: "Warning", icon: TriangleAlert, tone: "amber" },
  { level: "suggest", label: "Suggestion", icon: Lightbulb, tone: "sky" },
];

const NOTE_KINDS: Record<Note["kind"], { label: string; icon: LucideIcon; tone: Tone }> = {
  admission: { label: "Admission note", icon: FileText, tone: "indigo" },
  progress: { label: "Progress note", icon: Stethoscope, tone: "sky" },
  procedure: { label: "หัตถการ", icon: Syringe, tone: "violet" },
  nursing: { label: "บันทึกพยาบาล", icon: HeartPulse, tone: "pink" },
  lab: { label: "ผลตรวจ", icon: FlaskConical, tone: "teal" },
};

const LINE_TONES: Record<LineType, Tone> = {
  "Principal diagnosis": "indigo",
  Comorbidity: "sky",
  Complication: "rose",
  "Other diagnosis": "slate",
  "External cause": "amber",
  "OR procedure": "violet",
  "Non-OR procedure": "teal",
};

const DX_TYPES: LineType[] = ["Principal diagnosis", "Comorbidity", "Complication", "Other diagnosis", "External cause"];

const SUMMARY_ITEMS: [string, LucideIcon, Tone][] = [
  ["ปัญหาแรกรับ / การวินิจฉัยเมื่อสิ้นสุดการรักษา", ClipboardList, "indigo"],
  ["Investigation ที่สำคัญ", Microscope, "teal"],
  ["การรักษาและผลการรักษา", HeartPulse, "rose"],
  ["แผนการรักษา ฟื้นฟู และสร้างเสริมสุขภาพหลังจำหน่าย", Route, "amber"],
  ["Home medication", Pill, "violet"],
];

const STEPS: [string, string, LucideIcon, Tone][] = [
  ["#summary", "สรุปการรักษา", FileText, "indigo"],
  ["#coding", "ตรวจรหัส", Tags, "violet"],
  ["#drg", "DRG / AdjRW", Scale, "emerald"],
];

type Grouped = { drg: string; rw: number; adjrw: number; err: number; warn: number };

const plain = (c: string) => c.replace(/\./g, "");
const th = "px-3 py-2.5 text-xs font-medium text-slate-500";
const td = "px-3 py-3 align-top";
const tableBox = "overflow-x-auto rounded-xl ring-1 ring-slate-200 dark:ring-slate-800";
const thead = "bg-slate-50 dark:bg-slate-800/50";
const tbody = "divide-y divide-slate-100 dark:divide-slate-800";

function Field({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <Icon className="mt-0.5 size-4 shrink-0 text-slate-400" />
      <div className="min-w-0">
        <dt className="text-xs text-slate-500">{label}</dt>
        <dd className="text-sm font-medium text-slate-800 dark:text-slate-200">{children}</dd>
      </div>
    </div>
  );
}

export default function Summary({ patient: p, notes, draft, names }: {
  patient: Patient;
  notes: Note[];
  draft: Draft;
  names: Record<string, string>;
}) {
  const [decision, setDecision] = useState<Record<number, "accept" | "reject">>({});
  const [answers, setAnswers] = useState<Record<number, "yes" | "no" | undefined>>({});
  const rejected = (i: number) => decision[i] === "reject";

  const nameOf = (code: string) => names[plain(code)] ?? "ไม่พบรหัส";
  const describe = ({ add = [], remove = [], swap = {} }: Change) => [
    ...Object.entries(swap).map(([from, to]) => `${from} → ${to} ${nameOf(to)}`),
    ...add.map((c) => `+ ${c} ${nameOf(c)}`),
    ...remove.map((c) => `− ${c}`),
  ].join("; ");

  const active: Coded[] = draft.lines.flatMap((l, i) => (rejected(i) ? [] : [{ code: l.code, role: LINE_ROLES[l.type] }]));
  const confirmed = draft.variants.filter((v, i) => v.question && answers[i] === "yes");
  const rows = [
    { label: "A: ร่างปัจจุบัน", detail: "รหัสในร่างที่ยังไม่ถูกปฏิเสธ", coded: active, kind: "base" as const },
    ...draft.variants.map((v, i) => ({
      label: `${String.fromCharCode(66 + i)}: ${v.label}`,
      detail: describe(v.change),
      coded: applyChange(active, v.change),
      kind: "variant" as const,
    })),
    ...(confirmed.length
      ? [{
          label: "ผลตามคำตอบแพทย์",
          detail: confirmed.map((v) => v.label).join(" + "),
          coded: confirmed.reduce((c, v) => applyChange(c, v.change), active),
          kind: "final" as const,
        }]
      : []),
  ];
  const key = JSON.stringify(rows.map((r, i) => toCase(p, r.coded, String(i))));

  const [result, setResult] = useState<{ key: string; data: Grouped[] } | null>(null);
  const [error, setError] = useState("");
  const [drgNames, setDrgNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    fetch("/api/drg/calculate?source=ts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ data: JSON.parse(key) }),
    })
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.message ?? `API ตอบกลับ ${r.status}`);
        return json.data as Grouped[];
      })
      .then((data) => {
        if (!live) return;
        setResult({ key, data });
        setError("");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, [key]);

  useEffect(() => {
    const missing = [...new Set(result?.data.map((g) => g.drg))].filter((d) => !(d in drgNames));
    if (!missing.length) return;
    Promise.all(missing.map(async (d) => {
      const json = await (await fetch(`/api/libs/drg-name/${d}`)).json();
      return [d, json.rows?.[0]?.drgname ?? ""] as const;
    })).then((pairs) => setDrgNames((n) => ({ ...n, ...Object.fromEntries(pairs) })));
  }, [result, drgNames]);

  const decided = Object.values(decision);
  const counts = { accept: decided.filter((d) => d === "accept").length, reject: decided.filter((d) => d === "reject").length };
  const pending = draft.lines.length - decided.length;
  const stops = draft.alerts.filter((a) => a.level === "stop");
  const base = result?.data[0];
  const linesOf = (type: LineType) => draft.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.type === type);
  const pct = (n: number) => `${(100 * n) / draft.lines.length}%`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto grid w-full max-w-[96rem] gap-6 p-4 sm:p-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid min-w-0 content-start gap-6">
          <header className={`grid gap-4 p-5 sm:p-6 ${card}`}>
            <Link href="/ward" className="inline-flex w-fit items-center gap-1 text-sm text-indigo-600 hover:underline dark:text-indigo-400">
              <ArrowLeft className="size-4" /> รายการผู้ป่วย
            </Link>
            <div className="flex flex-wrap items-center gap-4">
              <PatientAvatar p={p} size="lg" />
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Discharge Summary: {p.name}</h1>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Chip tone="slate" icon={Hash} mono>AN {p.an}</Chip>
                  <Chip tone={wardTone(p.ward)} icon={BedDouble}>{p.ward} · เตียง {p.bed}</Chip>
                  <Chip tone="slate" icon={Clock}>LOS {losDays(p)} วัน</Chip>
                  <Chip tone="slate" icon={ShieldCheck}>{p.insurance}</Chip>
                  <Chip tone="violet" icon={Sparkles}>ร่างโดย AI จากบันทึก {notes.length} รายการ</Chip>
                </div>
              </div>
            </div>
            <nav className="grid grid-cols-3 gap-2">
              {STEPS.map(([href, label, Icon, tone], i) => (
                <a key={href} href={href} className="flex flex-col items-center gap-1 rounded-xl p-2 text-center ring-1 ring-slate-200 hover:bg-slate-50 sm:flex-row sm:gap-2 sm:text-left dark:ring-slate-800 dark:hover:bg-slate-800/50">
                  <IconTile icon={Icon} tone={tone} size="sm" />
                  <span className="text-xs sm:text-sm"><span className="text-slate-400">{i + 1}.</span> {label}</span>
                </a>
              ))}
            </nav>
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Info className="size-4" /> ทุกรหัสต้องมีแพทย์หรือ coder กดยืนยัน AI เสนอและเตือนเท่านั้น
            </p>
          </header>

          {stops.length > 0 && (
            <p role="alert" className="flex items-start gap-3 rounded-2xl bg-rose-600 p-4 text-white">
              <OctagonX className="mt-0.5 size-5 shrink-0" />
              <span><b>ส่งเบิกไม่ได้จนกว่าจะแก้:</b> {stops.map((s) => s.text).join(" · ")}</span>
            </p>
          )}

          <SectionCard id="summary" step={1} icon={FileText} tone="indigo" title="แบบสรุปการรักษาผู้ป่วยใน (ร่าง)" subtitle="ตามเกณฑ์ MRA ส่วน Discharge Summary">
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <Field icon={Hash} label="HN / AN"><span className="font-mono">{p.hn} / {p.an}</span></Field>
              <Field icon={UserRound} label="เพศ / อายุ">
                {p.sex === "1" ? "ชาย" : "หญิง"} / {ageText(p)}{p.age_day ? ` · น้ำหนักแรกรับ ${p.weight} kg` : ""}
              </Field>
              <Field icon={CalendarDays} label="วันเวลารับไว้">{fmtDate(p.admit_at)}</Field>
              <Field icon={CalendarCheck} label="วันเวลาจำหน่าย">{fmtDate(p.discharge_at)}</Field>
              <Field icon={Clock} label="วันนอน / วันลากลับบ้าน">{losDays(p)} วัน / {p.leave_days || "ไม่มี"}</Field>
              <Field icon={BedDouble} label="หอผู้ป่วย">{p.ward} เตียง {p.bed}</Field>
              <Field icon={ShieldCheck} label="สิทธิการรักษา">{p.insurance}</Field>
              <Field icon={Stethoscope} label="แพทย์ผู้รักษา">{p.attending}</Field>
            </dl>

            <div className="grid gap-2">
              <SubHeading icon={Stethoscope}>การวินิจฉัย</SubHeading>
              <div className={tableBox}>
                <table className="w-full text-left text-sm">
                  <thead className={thead}><tr><th className={th}>ประเภท</th><th className={th}>การวินิจฉัย (ศัพท์เต็ม)</th><th className={th}>ICD-10</th></tr></thead>
                  <tbody className={tbody}>
                    {DX_TYPES.flatMap((type) => {
                      const lines = linesOf(type);
                      if (!lines.length) return [<tr key={type}><td className={td}><Chip tone={LINE_TONES[type]}>{type}</Chip></td><td className={`${td} text-slate-400`}>ไม่มี</td><td className={td} /></tr>];
                      return lines.map(({ l, i }) => (
                        <tr key={i} className={rejected(i) ? "text-slate-400 line-through" : ""}>
                          <td className={td}><Chip tone={LINE_TONES[type]}>{type}</Chip></td>
                          <td className={td}>{l.text}</td>
                          <td className={`${td} font-mono font-semibold`}>{l.code}</td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {([["OR procedure", Scissors], ["Non-OR procedure", Syringe]] as const).map(([type, Icon]) => (
                <div key={type} className="grid content-start gap-2">
                  <SubHeading icon={Icon}>{type}</SubHeading>
                  <div className={tableBox}>
                    <table className="w-full text-left text-sm">
                      <thead className={thead}>
                        <tr><th className={th}>หัตถการ</th><th className={th}>{type === "OR procedure" ? "เริ่ม–สิ้นสุด" : "วันที่"}</th><th className={th}>ICD-9-CM</th></tr>
                      </thead>
                      <tbody className={tbody}>
                        {linesOf(type).length ? linesOf(type).map(({ l, i }) => (
                          <tr key={i} className={rejected(i) ? "text-slate-400 line-through" : ""}>
                            <td className={td}>{l.text}</td><td className={`${td} text-xs text-slate-500`}>{l.when}</td><td className={`${td} font-mono font-semibold`}>{l.code}</td>
                          </tr>
                        )) : <tr><td className={`${td} text-slate-400`}>ไม่มี</td><td className={td} /><td className={td} /></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid gap-2">
              <SubHeading icon={ClipboardList}>Clinical summary</SubHeading>
              <ol className="grid gap-2">
                {SUMMARY_ITEMS.map(([label, icon, tone], i) => (
                  <li key={label} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                    <IconTile icon={icon} tone={tone} size="sm" />
                    <div><div className="font-semibold text-slate-800 dark:text-slate-200">{i + 1}. {label}</div><p className="text-slate-600 dark:text-slate-400">{draft.summary[i]}</p></div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="grid gap-2">
              <SubHeading icon={DoorOpen}>การจำหน่าย</SubHeading>
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Field icon={Activity} label="Discharge status">{p.discharge_status}</Field>
                <Field icon={DoorOpen} label="Discharge type">{p.discharge_type}. {DISCHARGE_TYPES[p.discharge_type]}</Field>
                <Field icon={Building2} label="สถานพยาบาลที่ส่งต่อ">
                  {p.transfer_to || (p.discharge_type === "4" ? <span className="text-rose-600">ไม่ได้ระบุ</span> : "ไม่มี")}
                </Field>
                <Field icon={Skull} label="สาเหตุการตาย">ไม่มี</Field>
                <Field icon={PenLine} label="แพทย์ผู้สรุป"><span className="font-normal text-slate-400">ลงนาม ……… ชื่อ–สกุล ……… ว. ……… วันที่ ………</span></Field>
                <Field icon={UserCheck} label="ผู้ให้รหัสโรค / หัตถการ"><span className="font-normal text-slate-400">ชื่อ–สกุล ……… / ชื่อ–สกุล ………</span></Field>
              </dl>
            </div>
          </SectionCard>

          <SectionCard id="coding" step={2} icon={Tags} tone="violet" title="ข้อแนะนำการให้รหัส" subtitle="ถอดรหัสแล้วต้องได้ความหมายเดิมของแพทย์ กดรับหรือปฏิเสธทีละรหัส">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-slate-700 dark:text-slate-300">รอยืนยัน {pending} จาก {draft.lines.length} รหัส</span>
                <span className="flex gap-1.5">
                  <Chip tone="emerald" icon={Check}>รับ {counts.accept}</Chip>
                  <Chip tone="rose" icon={X}>ปฏิเสธ {counts.reject}</Chip>
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="bg-emerald-500" style={{ width: pct(counts.accept) }} />
                <div className="bg-rose-500" style={{ width: pct(counts.reject) }} />
              </div>
            </div>

            <div className={tableBox}>
              <table className="w-full min-w-[56rem] text-left text-sm">
                <thead className={thead}>
                  <tr>{["บทบาท", "dx_text (แพทย์)", "รหัส", "dx_name (ชื่อทางการ)", "สอดคล้อง", "หลักฐาน", "ยืนยัน"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                </thead>
                <tbody className={tbody}>
                  {draft.lines.map((l, i) => {
                    const s = STATUS[l.status];
                    return (
                      <tr key={i} className={decision[i] === "reject" ? "bg-rose-50/60 text-slate-400 dark:bg-rose-500/5" : decision[i] === "accept" ? "bg-emerald-50/60 dark:bg-emerald-500/5" : ""}>
                        <td className={td}><Chip tone={LINE_TONES[l.type]}>{l.type}</Chip></td>
                        <td className={td}>{l.text}</td>
                        <td className={`${td} font-mono font-semibold`}>{l.code}</td>
                        <td className={td}>{nameOf(l.code)}</td>
                        <td className={td}><Chip tone={s.tone} icon={s.icon}>{s.label}</Chip></td>
                        <td className={`${td} text-xs text-slate-500`}>{l.evidence}</td>
                        <td className={td}>
                          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 dark:bg-slate-800">
                            {([["accept", "รับ", Check, "aria-pressed:bg-emerald-600"], ["reject", "ปฏิเสธ", X, "aria-pressed:bg-rose-600"]] as const).map(([value, label, Icon, on]) => (
                              <button
                                key={value}
                                type="button"
                                aria-pressed={decision[i] === value}
                                onClick={() => setDecision((d) => ({ ...d, [i]: value }))}
                                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap text-slate-600 hover:text-slate-900 aria-pressed:text-white dark:text-slate-300 ${on}`}
                              >
                                <Icon className="size-3.5" />{label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2">
              <SubHeading icon={Ban}>ไม่เสนอให้ลงรหัส</SubHeading>
              {draft.notCoded.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {draft.notCoded.map((n) => (
                    <li key={n.code} className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
                      <Ban className="mt-0.5 size-4 shrink-0 text-slate-400" />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{n.finding}</span>
                          <span className="font-mono text-xs text-slate-400 line-through" title={nameOf(n.code)}>{n.code}</span>
                        </div>
                        <p className="text-slate-500">{n.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-sm text-slate-400">ไม่มี</p>}
            </div>

            <div className="grid gap-2">
              <SubHeading icon={TriangleAlert}>Alerts</SubHeading>
              <ul className="grid gap-2 md:grid-cols-3">
                {LEVELS.map(({ level, label, icon, tone }) => {
                  const items = draft.alerts.filter((a) => a.level === level);
                  return (
                    <li key={level} className={`rounded-xl p-3 text-sm ring-1 ring-inset ${items.length ? TONES[tone].chip : "bg-slate-50 text-slate-400 ring-slate-200 dark:bg-slate-800/50 dark:ring-slate-800"}`}>
                      <div className="mb-1 flex items-center gap-2 font-semibold">
                        <IconTile icon={icon} tone={items.length ? tone : "slate"} size="sm" /> {label}
                        <span className="ml-auto text-xs">{items.length}</span>
                      </div>
                      {items.length ? <ul className="grid list-disc gap-1 pl-5">{items.map((a) => <li key={a.text}>{a.text}</li>)}</ul> : "ไม่มี"}
                    </li>
                  );
                })}
              </ul>
            </div>
          </SectionCard>

          <SectionCard
            id="drg"
            step={3}
            icon={Scale}
            tone="emerald"
            title="เปรียบเทียบ DRG / AdjRW ที่เป็นไปได้"
            subtitle={`LOS ${losDays(p)} วัน · Discharge type ${p.discharge_type} · Thai DRG 6.3 ในเครื่อง · ${BAHT_PER_ADJRW.toLocaleString("th-TH")} บาท/AdjRW (UC ในเขต ปีงบ 2569)`}
          >
            <p className="flex gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/50">
              <Info className="size-4 shrink-0" />
              ตารางนี้แสดงผลของแต่ละคำตอบให้ผู้อนุมัติเห็น ไม่ใช่เหตุผลในการเลือกคำตอบ รหัสที่ไม่มีหลักฐานในเวชระเบียนจะถูกตัดตอน audit และเรียกเงินคืน (ระเบียบ สปสช. 2566 ข้อ 12)
            </p>
            {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}

            <div className={`${tableBox} transition-opacity ${result?.key !== key ? "opacity-50" : ""}`}>
              <table className="w-full min-w-[50rem] text-left text-sm">
                <thead className={thead}>
                  <tr>{["แบบ", "การเปลี่ยนแปลง", "DRG", "RW", "AdjRW", "ต่างจาก A", "ประมาณการ (บาท)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
                </thead>
                <tbody className={tbody}>
                  {rows.map((r, i) => {
                    const g = result?.data[i];
                    const delta = g && base ? g.adjrw - base.adjrw : 0;
                    const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
                    const bg = { base: "bg-emerald-50/70 dark:bg-emerald-500/5", final: "bg-violet-50/70 dark:bg-violet-500/5", variant: "" }[r.kind];
                    return (
                      <tr key={r.label} className={bg}>
                        <td className={`${td} font-semibold text-slate-800 dark:text-slate-200`}>
                          <span className="inline-flex items-center gap-1.5">
                            {r.kind === "final" && <BadgeCheck className="size-4 text-violet-600" />}
                            {r.label}
                          </span>
                        </td>
                        <td className={`${td} text-xs text-slate-500`}>{r.detail}</td>
                        <td className={td}>
                          <span className={`inline-flex rounded-lg px-2.5 py-1 font-mono text-lg font-bold ${g?.err ? "bg-rose-600 text-white" : "bg-yellow-400 text-yellow-950"}`}>
                            {g?.drg ?? "…"}
                          </span>
                          {g?.err ? <span className="ml-1"><Chip tone="rose">error {g.err}</Chip></span> : null}
                          <div className="mt-1 text-xs text-slate-500">{g && drgNames[g.drg]}</div>
                        </td>
                        <td className={`${td} font-mono`}>{g?.rw.toFixed(4) ?? "…"}</td>
                        <td className={td}>
                          <span className="inline-flex rounded-lg bg-emerald-600 px-2.5 py-1 font-mono text-lg font-bold text-white">
                            {g?.adjrw.toFixed(4) ?? "…"}
                          </span>
                        </td>
                        <td className={td}>
                          {i > 0 && g && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              <DeltaIcon className="size-3.5" />
                              {delta === 0 ? "ไม่เปลี่ยน" : `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(4)}`}
                            </span>
                          )}
                        </td>
                        <td className={td}>
                          <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-100 px-2.5 py-1 font-mono text-lg font-bold whitespace-nowrap text-indigo-900 ring-1 ring-indigo-300 ring-inset dark:bg-indigo-500/15 dark:text-indigo-200 dark:ring-indigo-500/30">
                            <Wallet className="size-4" />
                            {g ? Math.round(g.adjrw * BAHT_PER_ADJRW).toLocaleString("th-TH") : "…"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid gap-2">
              <SubHeading icon={MessageCircleQuestion}>คำถามถึงแพทย์ / สิ่งที่ต้องอนุมัติ</SubHeading>
              {draft.variants.some((v) => v.question) ? (
                <ol className="grid gap-3">
                  {draft.variants.map((v, i) => v.question && (
                    <li key={i} className="flex gap-3 rounded-xl p-4 text-sm ring-1 ring-slate-200 dark:ring-slate-800">
                      <IconTile icon={MessageCircleQuestion} tone="amber" />
                      <div className="grid gap-2">
                        <p className="text-slate-800 dark:text-slate-200">{v.question}</p>
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          <UserRound className="size-3.5" /> ผู้ตอบ: {v.to} · ถ้ายืนยัน จะเป็นแบบ {String.fromCharCode(66 + i)}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {([[undefined, "ยังไม่ตอบ"], ["yes", "แพทย์ยืนยันตามแบบนี้"], ["no", "คงตามร่าง A"]] as const).map(([value, label]) => (
                            <label key={label} className="flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1 text-xs ring-1 ring-slate-200 has-checked:bg-violet-600 has-checked:text-white has-checked:ring-violet-600 dark:ring-slate-700">
                              <input
                                type="radio"
                                name={`q${i}`}
                                className="accent-white"
                                checked={answers[i] === value}
                                onChange={() => setAnswers((s) => ({ ...s, [i]: value }))}
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-slate-400">ไม่มี</p>}
            </div>
          </SectionCard>
        </div>

        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <div className={`p-5 ${card}`}>
            <h2 className="mb-4 flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-50">
              <IconTile icon={FileText} tone="slate" size="sm" /> บันทึกในเวชระเบียน
            </h2>
            <ol className="relative grid gap-4 before:absolute before:top-2 before:bottom-2 before:left-3.5 before:w-px before:bg-slate-200 dark:before:bg-slate-800">
              {notes.map((n, i) => {
                const k = NOTE_KINDS[n.kind];
                return (
                  <li key={i} className="relative flex gap-3 text-sm">
                    <IconTile icon={k.icon} tone={k.tone} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs text-slate-500"><b className="text-slate-700 dark:text-slate-300">{k.label}</b> · {fmtDate(n.at)} · {n.author}</div>
                      <p className="mt-1 whitespace-pre-line text-slate-700 dark:text-slate-300">{n.body}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        </aside>
      </main>
    </div>
  );
}
