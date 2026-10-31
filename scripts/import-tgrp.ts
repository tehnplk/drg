// Load TGrp6305 library tables (c63*.dbf) and TDRG 6.3.3 manual tables (grouper/tdrg633/*.tsv) into PGlite.
// usage: node scripts/import-tgrp.ts   (stop `next dev` first — PGlite locks its folder)
import { readFile } from "node:fs/promises";
import path from "node:path";
import { db } from "../lib/db.ts";
import { readDbf, type Field } from "../lib/dbf.ts";
import { TGRP_DIR } from "../lib/tgrp.ts";

const TDRG_DIR = path.join(process.cwd(), "grouper", "tdrg633");

const DBF_TABLES = [
  { table: "drg", file: "c63drg.dbf", key: "drg" },
  { table: "i10", file: "c63i10.dbf", key: "code, mdc" }, // sex-specific codes appear once per MDC (12 male / 13 female)
  { table: "proc", file: "c63proc.dbf", key: "code" },
  { table: "ccex", file: "c63ccex.dbf", key: "cc10, notfor10" },
];

// Extracted from the TDRG 6.3.3 manual / TDS6307 — columns are text unless listed in `ints`.
const TSV_TABLES = [
  { table: "dcl", file: "dcl.tsv", key: "code, dc", ints: ["dcl"] }, // Appendix F1
  { table: "dcl_alias", file: "dcl-alias.tsv", key: "code", ints: [] }, // F1 "= code" rows
  { table: "drg_pcl", file: "drg-pcl.tsv", key: "drg", ints: ["pcl_min", "pcl_max"] }, // Vol 2 DRG definitions
  { table: "proc_pdc", file: "proc-pdc.tsv", key: "mdc, code", ints: [] }, // Vol 2 "MDC n ASSIGNMENT OF ICD-9-CM CODES"
  { table: "dx_pdc", file: "dx-pdc.tsv", key: "mdc, code", ints: [] }, // Vol 2 "MDC n ASSIGNMENT OF ICD-10 CODES"
  { table: "ax", file: "ax.tsv", key: "ax, code", ints: [] }, // Vol 2 "AX ASSIGNMENT OF ..."
  { table: "icd10_desc", file: "icd10-desc.tsv", key: "code", ints: ["valid"] }, // TDS6307 C63i10vx.dbf
  { table: "icd9_desc", file: "icd9-desc.tsv", key: "code", ints: ["valid"] }, // TDS6307 C63i9vx.dbf
];

async function load(table: string, key: string, cols: string[], types: string[], rows: unknown[][]) {
  await db.transaction(async (tx) => {
    await tx.exec(`drop table if exists ${table};
      create table ${table} (${cols.map((c, i) => `"${c}" ${types[i]}`).join(", ")}, primary key (${key}));`);
    const chunk = Math.floor(30000 / cols.length);
    for (let i = 0; i < rows.length; i += chunk) {
      const part = rows.slice(i, i + chunk);
      const tuples = part.map((_, r) => `(${cols.map((_, c) => `$${r * cols.length + c + 1}`).join(",")})`);
      await tx.query(`insert into ${table} (${cols.map((c) => `"${c}"`).join(",")}) values ${tuples.join(",")}`, part.flat());
    }
  });
  console.log(`${table}: ${rows.length} rows`);
}

const sqlType = (f: Field) =>
  f.type === "N" ? (f.dec ? "double precision" : "integer") : f.type === "L" ? "boolean" : "text";

function value(f: Field, v: string) {
  if (v === "") return null;
  if (f.type === "N") return Number(v);
  if (f.type === "L") return /^[TY]$/i.test(v) ? true : /^[FN]$/i.test(v) ? false : null;
  return v;
}

for (const { table, file, key } of DBF_TABLES) {
  const { fields, rows } = readDbf(await readFile(path.join(TGRP_DIR, file)));
  await load(table, key, fields.map((f) => f.name.toLowerCase()), fields.map(sqlType),
    rows.map((r) => fields.map((f) => value(f, r[f.name]))));
}

for (const { table, file, key, ints } of TSV_TABLES) {
  const [head, ...lines] = (await readFile(path.join(TDRG_DIR, file), "utf8")).trimEnd().split(/\r?\n/);
  const cols = head.split("\t");
  await load(table, key, cols, cols.map((c) => (ints.includes(c) ? "integer" : "text")),
    lines.map((l) => l.split("\t").map((v, i) => (ints.includes(cols[i]) ? Number(v) : v))));
}
await db.close();
