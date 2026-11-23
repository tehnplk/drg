// Thai dates with a Buddhist-era year. Dates are "YYYY-MM-DD" (Gregorian) in and out; only the display is Thai.
// Pure helpers, usable from server and client code (the picker is components/thai-date-picker.tsx).

export const TH_MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const TH_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
export const TH_WEEKDAYS_SHORT = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

const pad = (n: number) => String(n).padStart(2, "0");
export const parts = (d: string) => d.split("-").map(Number) as [number, number, number];
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();
export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
export function addMonths(d: string, n: number) {
  const [y, m, day] = parts(d);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, Math.min(day, daysIn(t.getUTCFullYear(), t.getUTCMonth() + 1)));
}

// Today, or `offsetDays` from it, in Asia/Bangkok.
export const bangkokDate = (offsetDays = 0) => new Date(Date.now() + 7 * 3600_000 + offsetDays * 86400_000).toISOString().slice(0, 10);

// "2026-11-23" -> "23 พ.ย. 2569"; long: "23 พฤศจิกายน 2569" (what screen readers hear)
export function formatThaiDate(d: string, { long = false } = {}) {
  const [y, m, day] = parts(d);
  return `${day} ${(long ? TH_MONTHS : TH_MONTHS_SHORT)[m - 1]} ${y + 543}`;
}

// "2026-11-23 12:38" (or with seconds / a T) -> "23 พ.ย. 2569 12:38"; a date alone stays a date; "" stays "".
// Plain string work, so server and client render the same text.
export function formatThaiDateTime(dt: string) {
  if (!dt) return "";
  const [d, t] = dt.split(/[ T]/);
  return t ? `${formatThaiDate(d)} ${t.slice(0, 5)}` : formatThaiDate(d);
}
