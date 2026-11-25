// AES-256-GCM for patient identifiers kept in the database (name, national ID, phone). Server only.
// Key: PII_KEY in .env.local, 32 random bytes as base64 (`openssl rand -base64 32`). Losing it makes the stored
// values unreadable; changing it needs the old key to re-encrypt.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const k = Buffer.from(process.env.PII_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("PII_KEY ต้องเป็นกุญแจ 32 ไบต์แบบ base64 ใน .env.local");
  return k;
}

// "v1:" + base64(iv 12 bytes | auth tag 16 bytes | ciphertext). A fresh IV per value, so equal inputs differ.
export function encrypt(plain: string | null): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${Buffer.concat([iv, c.getAuthTag(), body]).toString("base64")}`;
}

// Screens show a staff member's surname as ***: "พญ.นฤมล พงษ์สวัสดิ์ ว12345" -> "พญ.นฤมล *** ว12345".
// A single word (a username, "นพ.ก.") stays as it is.
export const maskSurname = (name: string) => name.trim().replace(/^((?:\S+\.\s*)?\S+)\s+.+?(\s+ว\.?\s*\d+)?$/, "$1 ***$2");

// A ward_patient row as screens should get it: the decrypted first name and *** for the surname in `name`, and no
// *_enc columns. Demo patients (no encrypted name) keep their `name`.
export function withName<T extends { name: string }>(row: T): Omit<T, `${string}_enc`> {
  const r = row as T & Record<string, string | null>;
  const full = [decrypt(r.fname_enc ?? null), r.lname_enc ? "***" : null].filter(Boolean).join(" ");
  return Object.fromEntries(Object.entries({ ...row, name: full || row.name }).filter(([k]) => !k.endsWith("_enc"))) as Omit<T, `${string}_enc`>;
}

export function decrypt(sealed: string | null): string | null {
  if (sealed == null) return null;
  if (!sealed.startsWith("v1:")) throw new Error("รูปแบบข้อมูลเข้ารหัสไม่รู้จัก");
  const buf = Buffer.from(sealed.slice(3), "base64");
  const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}
