import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { staffWords } from "@/lib/agent.ts";
import { reviewsOf } from "@/lib/charts.ts";
import { db } from "@/lib/db.ts";
import { withName } from "@/lib/pii.ts";
import { bangkokDate, formatThaiDate, formatThaiDateTime } from "@/lib/thai-date.ts";
import type { Draft, Patient } from "@/lib/ward.ts";
import { PrintButton } from "./print-button.tsx";

export const metadata: Metadata = { title: "ใบ Query ถึงแพทย์" };

// The queries of step 1 still waiting for an answer, as a letter to the attending physician to print or copy.
// ?by= the coder's name (the app has no login; the case page passes the name entered in the app bar).
export default function QueryLetterPage(props: PageProps<"/charts/[an]/query/letter">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">กำลังสร้างใบ Query...</p>}>
      <Letter params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Letter({ params, searchParams }: Pick<PageProps<"/charts/[an]/query/letter">, "params" | "searchParams">) {
  await connection();
  const { an } = await params;
  const by = (await searchParams).by;
  const row = (await db.query<Patient>("select * from ward_patient where an = $1", [an])).rows[0];
  if (!row) notFound();
  const p = withName(row) as Patient;
  const pre = (await db.query<{ result: Draft; version: number }>("select result, version from ward_precode where an = $1", [an])).rows[0];
  const reviews = await reviewsOf(pre?.version ?? null);
  const open = pre ? staffWords(pre.result).variants.filter((v, i) => v.question && !reviews[`variant:${i}`]).map((v) => v.question!) : [];

  return (
    <main className="mx-auto grid max-w-3xl gap-4 p-4 sm:p-8 print:max-w-none print:p-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-slate-500">ใบนี้รวมเฉพาะ Query ที่ยังไม่มีคำตอบ ({open.length} ข้อ) พิมพ์หรือคัดลอกส่งแพทย์ได้</p>
        <PrintButton />
      </div>
      <article id="letter" className="grid gap-5 rounded-2xl bg-white p-8 leading-relaxed text-slate-900 shadow-sm ring-1 ring-slate-200 print:rounded-none print:shadow-none print:ring-0">
        <p><b>เรียน</b> แพทย์ผู้รักษา{p.attending.trim() ? ` (${p.attending.trim()})` : ""}</p>
        <p><b>เรื่อง</b> ขอข้อมูลเพิ่มเติมเพื่อความถูกต้องและสมบูรณ์ของเวชระเบียนผู้ป่วยใน</p>
        <p>
          ผู้ป่วย {p.name} HN {p.hn} AN {p.an} หอผู้ป่วย {p.ward} รับไว้ {formatThaiDateTime(p.admit_at)} จำหน่าย {formatThaiDateTime(p.discharge_at)}
        </p>
        <p>
          จากการตรวจเวชระเบียนเพื่อให้รหัสโรคและหัตถการ มีประเด็นที่บันทึกยังไม่ชัดเจน จึงขอความกรุณาแพทย์พิจารณาตอบตามดุลยพินิจทางคลินิก
          และบันทึกเพิ่มเติมในเวชระเบียนหรือใบสรุปการจำหน่าย ดังนี้
        </p>
        {open.length ? (
          <ol className="grid gap-4">
            {open.map((q, i) => (
              <li key={i} className="grid grid-cols-[1.5rem_1fr] gap-x-1 gap-y-2">
                <span>{i + 1}.</span>
                <span>{q}</span>
                <span />
                <span className="text-slate-500">คำตอบ: ..........................................................................................................</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-slate-500">ไม่มี Query ที่รอคำตอบ</p>
        )}
        <p>จึงเรียนมาเพื่อโปรดพิจารณา</p>
        <div className="grid justify-end gap-1 text-right">
          <p>ขอบพระคุณ</p>
          <p className="pt-6">ผู้ให้รหัส {typeof by === "string" && by.trim() ? by.trim() : "........................................"}</p>
          <p>วันที่ {formatThaiDate(bangkokDate(0))}</p>
        </div>
      </article>
    </main>
  );
}
