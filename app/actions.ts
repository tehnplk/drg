"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { nowBkk, runAudit, runDischargeSummary } from "@/lib/agent.ts";
import { latestRuns, reviewsOf } from "@/lib/charts.ts";
import { db } from "@/lib/db.ts";
import { importAdmission } from "@/lib/his.ts";
import { group } from "@/lib/tdrg/group.ts";
import { DECISIONS, REVIEW_ITEM, finalCoding, toCase, type Draft, type Patient, type Review } from "@/lib/ward.ts";

const checkAn = (an: string) => {
  if (!/^[\w-]{1,20}$/.test(an)) throw new Error(`AN ไม่ถูกต้อง: ${an}`);
};
// A name a person typed (who did it, who signed): required, one line, short.
const named = (value: unknown, what: string) => {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v || v.length > 100 || /[\r\n]/.test(v)) throw new Error(`ต้องระบุ${what} (ไม่เกิน 100 ตัวอักษร)`);
  return v;
};

// open: a first import goes straight on to the case's audit (one case at a time); a re-sync stays where it is.
export async function importChart(an: string, open = false) {
  checkAn(an);
  await importAdmission(an);
  if (open) redirect(`/charts/${an}/audit`);
  refresh();
}

// The cases ticked on the HIS list, imported in one go; a case that fails does not stop the rest.
// ponytail: one at a time so the HIS gets one request at a time; a few in parallel if a long list is too slow.
export async function importCharts(_: unknown, form: FormData) {
  const ans = [...new Set(form.getAll("an").map(String))];
  const failed: string[] = [];
  for (const an of ans) {
    try {
      checkAn(an);
      await importAdmission(an);
    } catch {
      failed.push(an);
    }
  }
  refresh();
  return { ok: ans.length - failed.length, failed };
}

// Runs for a minute or two; the outcome (or the error) is kept in agent_run and shown on the list.
export async function runAgent(kind: "audit" | "dcsum", an: string) {
  checkAn(an);
  // One run per chart and kind: a second click (another tab, or after coming back to the page) only refreshes.
  if ((await latestRuns([an])).some((r) => r.kind === kind && r.status === "running")) {
    refresh();
    return;
  }
  try {
    await (kind === "audit" ? runAudit(an) : runDischargeSummary(an));
  } catch {
    // already recorded in agent_run; the list shows it
  }
  refresh();
}

// One person's decision on one item of one AI version (lib/ward.ts REVIEW_ITEM); null clears it. Returns what was saved.
export async function saveReview(version: number, item: string, decision: string | null, by: string, note: string | null = null): Promise<Review | null> {
  if (!Number.isInteger(version) || !REVIEW_ITEM.test(item)) throw new Error("รายการที่ตรวจไม่ถูกต้อง");
  const allowed: readonly string[] = DECISIONS[item.split(":")[0] as keyof typeof DECISIONS];
  if (decision !== null && !allowed.includes(decision)) throw new Error(`คำตอบไม่ถูกต้อง: ${decision}`);
  if (note && note.length > 2000) throw new Error("บันทึกยาวเกิน 2,000 ตัวอักษร");
  const who = named(by, "ชื่อผู้ใช้งานที่แถบด้านบน");
  // Changing a draft someone approved would leave the approval describing a coding nobody chose.
  if ((await db.query("select 1 from ward_final where version = $1", [version])).rows.length)
    throw new Error("ร่างนี้อนุมัติแล้ว กดยกเลิกการอนุมัติก่อนจึงแก้ได้");
  if (decision === null) {
    await db.query("delete from ward_review where version = $1 and item = $2", [version, item]);
    return null;
  }
  const at = nowBkk();
  await db.query(
    `insert into ward_review (version, item, decision, note, by, at) values ($1, $2, $3, $4, $5, $6)
     on conflict (version, item) do update set decision = excluded.decision, note = excluded.note, by = excluded.by, at = excluded.at`,
    [version, item, decision, note || null, who, at]);
  return { decision, note: note || null, by: who, at };
}

// Approve the latest draft for the claim: every code and question decided, then the coding is rebuilt from the saved
// reviews and grouped here (not taken from the screen). Returns the reason it cannot be approved, or null.
export async function approveDraft(an: string, version: number, form: { physician: string; license: string; coder: string; by: string }): Promise<string | null> {
  checkAn(an);
  let signed;
  try {
    signed = [named(form.physician, "ชื่อแพทย์ผู้สรุป"), named(form.license, "เลข ว. ของแพทย์"), named(form.coder, "ชื่อผู้ให้รหัส"), named(form.by, "ชื่อผู้ใช้งานที่แถบด้านบน")];
  } catch (e) {
    return (e as Error).message;
  }
  const cur = (await db.query<{ draft: Draft; version: number; hash: string | null }>(
    "select d.draft, d.version, s.hash from ward_draft d left join ward_sync s using (an) where d.an = $1", [an])).rows[0];
  if (!cur || cur.version !== version) return "ร่างบนหน้าจอไม่ใช่รุ่นล่าสุดแล้ว โหลดหน้าใหม่ก่อนอนุมัติ";
  const { coded, missing } = finalCoding(cur.draft, await reviewsOf(version));
  if (missing.length) return `ยังตัดสินไม่ครบ ${missing.length} รายการ: ${missing.join(", ")}`;
  if (!coded.some((c) => c.role === "pdx")) return "ไม่มีการวินิจฉัยหลัก (PDx) ในรหัสที่รับไว้";
  const patient = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  const g = await group(toCase(patient, coded, an));
  if (g.err) return `จัดกลุ่ม DRG ไม่ได้ (error ${g.err}) ต้องแก้รหัสก่อนอนุมัติ`;
  await db.query(
    `insert into ward_final (an, version, hash, coded, drg, rw, adjrw, physician, license, coder, by, at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (an) do update set version = excluded.version, hash = excluded.hash, coded = excluded.coded, drg = excluded.drg,
       rw = excluded.rw, adjrw = excluded.adjrw, physician = excluded.physician, license = excluded.license,
       coder = excluded.coder, by = excluded.by, at = excluded.at`,
    [an, version, cur.hash, JSON.stringify(coded), g.drg, g.rw, g.adjrw, ...signed, nowBkk()]);
  refresh();
  return null;
}

export async function unapproveDraft(an: string) {
  checkAn(an);
  await db.query("delete from ward_final where an = $1", [an]);
  refresh();
}
