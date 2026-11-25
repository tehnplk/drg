"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  TH_MONTHS, TH_MONTHS_SHORT, TH_WEEKDAYS_SHORT, addDays, addMonths, bangkokDate as todayBangkok, daysIn, formatThaiDate,
  parts, weekday, ymd,
} from "@/lib/thai-date.ts";

// Thai date picker: Buddhist-era display, "YYYY-MM-DD" (Gregorian) value.

type Props = {
  label: string; // accessible name of the field and its calendar
  name?: string; // set: submits the date with its form through a hidden input
  autoSubmit?: boolean; // submit the form as soon as a date is picked
  value?: string; // controlled
  defaultValue?: string; // uncontrolled
  onChange?: (date: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  className?: string;
};

const field = "rounded-xl border border-slate-300 bg-white text-sm dark:border-slate-700 dark:bg-slate-900";

export function ThaiDatePicker({ label, name, autoSubmit, value, defaultValue = "", onChange, min, max, placeholder = "เลือกวันที่", className = "" }: Props) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(current || todayBangkok()); // the highlighted day; its month is the one shown
  const root = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const inRange = (d: string) => (!min || d >= min) && (!max || d <= max);
  const clamp = (d: string) => (min && d < min ? min : max && d > max ? max : d);

  // Submitted after the render that puts the new date in the hidden input.
  const submit = useRef(false);
  useEffect(() => {
    if (!submit.current) return;
    submit.current = false;
    root.current?.closest("form")?.requestSubmit();
  }, [current]);

  const pick = (d: string) => {
    if (!inRange(d)) return;
    submit.current = !!autoSubmit && d !== current;
    if (value === undefined) setInner(d);
    onChange?.(d);
    setOpen(false);
    trigger.current?.focus();
  };

  const toggle = () => {
    if (!open) setFocus(clamp(current || todayBangkok()));
    setOpen(!open);
  };

  useEffect(() => {
    if (!open) return;
    grid.current?.querySelector<HTMLButtonElement>(`[data-date="${focus}"]`)?.focus();
  }, [open, focus]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focus, -1), ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7), ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1), PageDown: () => addMonths(focus, 1),
      Home: () => addDays(focus, -weekday(focus)),
      End: () => addDays(focus, 6 - weekday(focus)),
    };
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    } else if (moves[e.key]) {
      e.preventDefault();
      setFocus(clamp(moves[e.key]()));
    }
  };

  const [fy, fm] = parts(focus);
  const lead = weekday(ymd(fy, fm, 1));
  const today = open ? todayBangkok() : "";
  const thisYear = Number(todayBangkok().slice(0, 4));
  const yearFrom = min ? parts(min)[0] : Math.min(fy, thisYear) - 10;
  const yearTo = max ? parts(max)[0] : Math.max(fy, thisYear) + 1;
  const years = Array.from({ length: yearTo - yearFrom + 1 }, (_, i) => yearTo - i);

  return (
    <div ref={root} className={`relative inline-block ${className}`}>
      {name && <input type="hidden" name={name} value={current} />}
      <button
        ref={trigger}
        type="button"
        aria-label={`${label}${current ? ` ${formatThaiDate(current, { long: true })}` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className={`inline-flex min-w-40 items-center gap-2 px-3 py-2 text-left hover:border-slate-400 ${field}`}
      >
        <CalendarDays className="size-4 shrink-0 text-slate-400" />
        <span className={current ? "text-slate-900 dark:text-slate-100" : "text-slate-400"}>{current ? formatThaiDate(current) : placeholder}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          onKeyDown={onKey}
          className="absolute top-full left-0 z-30 mt-2 w-72 rounded-2xl bg-white p-3 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        >
          <div className="mb-2 flex items-center gap-1">
            <button type="button" aria-label="เดือนก่อน" onClick={() => setFocus(clamp(addMonths(focus, -1)))} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <ChevronLeft className="size-4" />
            </button>
            <select aria-label="เดือน" value={fm} onChange={(e) => setFocus(clamp(addMonths(focus, Number(e.target.value) - fm)))} className={`flex-1 px-1.5 py-1 ${field}`}>
              {TH_MONTHS_SHORT.map((m, i) => <option key={m} value={i + 1} aria-label={TH_MONTHS[i]}>{m}</option>)}
            </select>
            <select aria-label="ปี พ.ศ." value={fy} onChange={(e) => setFocus(clamp(addMonths(focus, (Number(e.target.value) - fy) * 12)))} className={`px-1.5 py-1 ${field}`}>
              {years.map((y) => <option key={y} value={y}>{y + 543}</option>)}
            </select>
            <button type="button" aria-label="เดือนถัดไป" onClick={() => setFocus(clamp(addMonths(focus, 1)))} className="grid size-8 place-items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 text-center text-xs text-slate-500">
            {TH_WEEKDAYS_SHORT.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div ref={grid} role="grid" aria-label={`${TH_MONTHS[fm - 1]} ${fy + 543}`} className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: lead }, (_, i) => <div key={`lead${i}`} />)}
            {Array.from({ length: daysIn(fy, fm) }, (_, i) => {
              const d = ymd(fy, fm, i + 1);
              const selected = d === current;
              return (
                <button
                  key={d}
                  type="button"
                  data-date={d}
                  tabIndex={d === focus ? 0 : -1}
                  disabled={!inRange(d)}
                  aria-label={formatThaiDate(d, { long: true })}
                  aria-pressed={selected}
                  aria-current={d === today ? "date" : undefined}
                  onClick={() => pick(d)}
                  className={`grid h-9 place-items-center rounded-lg text-sm disabled:cursor-not-allowed disabled:opacity-30 ${
                    selected
                      ? "bg-indigo-600 font-semibold text-white"
                      : `hover:bg-slate-100 dark:hover:bg-slate-800 ${d === today ? "font-semibold text-indigo-600 ring-1 ring-indigo-300 ring-inset dark:text-indigo-300" : "text-slate-700 dark:text-slate-200"}`
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
            <button type="button" onClick={() => pick(clamp(todayBangkok()))} className="rounded-lg px-2 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10">
              วันนี้
            </button>
            <button type="button" onClick={() => { setOpen(false); trigger.current?.focus(); }} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
              ปิด
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
