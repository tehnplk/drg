import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { readDbf, writeDbf, type Field } from "./dbf.ts";

// TGrp6305.exe (Visual FoxPro) usage: TGrp6305.exe <file.dbf>
// It groups every record and writes MDC/DRG/RW/ADJRW/... back into the same file.
// It must run with cwd = its own folder so it finds c63*.dbf.
export const TGRP_DIR = process.env.TGRP_DIR ?? path.join(process.cwd(), "grouper", "TGrp6305");
export const TGRP_EXE = process.env.TGRP_EXE ?? "TGrp6305.exe";

export type Case = {
  an?: string;
  sex: string; // 1 male, 2 female
  age: number;
  age_day?: number;
  los_day: number; // 0 = stay under 24 h
  weight?: number; // kg, required under 28 days old
  discht: string; // 1 approval, 2 against advice, 3 escape, 4 transfer, 5 other, 8/9 dead
  pdx: string;
  sdx?: string[]; // max 12
  proc?: string[]; // max 20, ICD-9-CM with optional +extension
};

export type Grouped = {
  an: string;
  mdc: string;
  drg: string;
  rw: number;
  adjrw: number;
  wtlos: number;
  ot: number;
  err: number;
  warn: number;
  actlos: number;
};

const f = (name: string, type: string, len: number, dec = 0): Field => ({ name, type, len, dec });

const FIELDS: Field[] = [
  // every field listed in TGrp62Use.txt is required — a missing one makes TGrp pop up a message box
  f("AN", "C", 15), f("DOB", "D", 8), f("SEX", "C", 1), f("DATEADM", "D", 8), f("DATEDSC", "D", 8),
  f("TIMEADM", "C", 4), f("TIMEDSC", "C", 4), f("DISCHT", "C", 1), f("ADMWT", "N", 7, 3),
  f("ACTLOS", "N", 3), f("AGE", "C", 3), f("AGEDAY", "C", 3), f("PDX", "C", 6),
  ...Array.from({ length: 12 }, (_, i) => f(`SDX${i + 1}`, "C", 6)),
  ...Array.from({ length: 20 }, (_, i) => f(`PROC${i + 1}`, "C", 7)),
  f("LEAVEDAY", "N", 3), f("DRG", "C", 5), f("MDC", "C", 2), f("ERR", "N", 2), f("WARN", "N", 4),
  f("RW", "N", 7, 4), f("OT", "N", 4), f("WTLOS", "N", 6, 2), f("ADJRW", "N", 8, 4),
];

// TGrp derives LOS from admit/discharge date+time, so encode los_day as a stay starting
// at a fixed date, both at 00:00 — the same way had-api does (it ignores los_hour).
const BASE = Date.UTC(2020, 0, 1);
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

function toRow(c: Case, i: number) {
  const row: Record<string, string> = {
    AN: c.an ?? String(i + 1),
    SEX: c.sex,
    DATEADM: ymd(BASE),
    TIMEADM: "0000",
    DATEDSC: ymd(BASE + c.los_day * 86400_000),
    TIMEDSC: "0000",
    DISCHT: c.discht,
    ADMWT: c.weight ? c.weight.toFixed(3) : "",
    AGE: String(c.age),
    AGEDAY: String(c.age_day ?? 0),
    PDX: c.pdx,
  };
  c.sdx?.forEach((s, j) => (row[`SDX${j + 1}`] = s));
  c.proc?.forEach((p, j) => (row[`PROC${j + 1}`] = p));
  return row;
}

const exec = promisify(execFile);

// ponytail: one grouper run at a time (it shares FOXUSER.DBF in its folder); batch cases per call if throughput matters.
let queue: Promise<unknown> = Promise.resolve();

export function group(cases: Case[]): Promise<Grouped[]> {
  const run = queue.then(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "tgrp-"));
    const file = path.join(dir, "in.dbf");
    try {
      await writeFile(file, writeDbf(FIELDS, cases.map(toRow)));
      await exec(path.join(/*turbopackIgnore: true*/ TGRP_DIR, TGRP_EXE), [file], { cwd: TGRP_DIR, timeout: 60_000, windowsHide: true });
      const { rows } = readDbf(await readFile(file));
      if (rows.some((r) => !r.DRG)) throw new Error("TGrp ไม่ได้เขียนผลลงไฟล์");
      return rows.map((r) => ({
        an: r.AN,
        mdc: r.MDC,
        drg: r.DRG,
        rw: Number(r.RW),
        adjrw: Number(r.ADJRW),
        wtlos: Number(r.WTLOS),
        ot: Number(r.OT),
        err: Number(r.ERR),
        warn: Number(r.WARN),
        actlos: Number(r.ACTLOS),
      }));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  queue = run.catch(() => {});
  return run;
}
