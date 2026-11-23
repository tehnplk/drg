// Pure transforms for the HIS -> PostgreSQL extract (lib/his.ts): de-identification, lab flags, fingerprints.
// No database or network here, so scripts/test-etl.ts can check them directly.
import { createHash } from "node:crypto";

// Replaces the patient's own identifiers in free text, plus anything shaped like a national ID or a Thai phone
// number. Names shorter than 2 characters are skipped so a one-letter name cannot erase clinical text.
export function scrubber(ids: { fname?: string | null; lname?: string | null; cid?: string | null; phone?: string | null }) {
  const names = [ids.fname, ids.lname].map((s) => s?.trim() ?? "").filter((s) => s.length >= 2).sort((a, b) => b.length - a.length);
  const exact = [ids.cid, ids.phone].map((s) => s?.trim() ?? "").filter((s) => s.length >= 6);
  return (text: string) => {
    let t = text;
    for (const n of names) t = t.replaceAll(n, "[ผู้ป่วย]");
    for (const x of exact) t = t.replaceAll(x, "[เลขส่วนบุคคล]");
    return t
      .replace(/(?<![\d.])\d[- ]?\d{4}[- ]?\d{5}[- ]?\d{2}[- ]?\d(?![\d.])/g, "[เลขบัตร]")
      .replace(/(?<![\d.])0\d{1,2}[- ]?\d{3}[- ]?\d{3,4}(?![\d.])/g, "[เบอร์โทร]");
  };
}

// "H" / "L" against a reference like "135-145 mmol/L", "(11.0 - 18.8) g/dl", "(<0.6)" or ">60";
// "image" when the result lives only in an attached picture; "" when it cannot be judged.
export function labFlag(result: string, ref: string | null): "" | "H" | "L" | "image" {
  if (/see image/i.test(result)) return "image";
  const v = Number(result.trim().replace(/,/g, ""));
  if (!ref || !Number.isFinite(v) || result.trim() === "") return "";
  const n = String.raw`(\d+(?:\.\d+)?)`;
  const range = ref.match(new RegExp(`${n}\\s*-\\s*${n}`));
  if (range) return v < Number(range[1]) ? "L" : v > Number(range[2]) ? "H" : "";
  const lt = ref.match(new RegExp(`<=?\\s*${n}`));
  if (lt) return v > Number(lt[1]) ? "H" : "";
  const gt = ref.match(new RegExp(`>=?\\s*${n}`));
  if (gt) return v < Number(gt[1]) ? "L" : "";
  return "";
}

// Stable fingerprint of an extract: the same HIS content always gives the same hash, whatever the key order.
export function fingerprint(value: unknown) {
  const canon = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
    : v;
  return createHash("sha256").update(JSON.stringify(canon(value))).digest("hex");
}

// Collapses the padding the HIS leaves in usage text ("รับประทานครั้งละ   1  เม็ด").
export const squash = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
