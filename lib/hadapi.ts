import type { Case, Grouped } from "./tgrp.ts";

const URL = process.env.HAD_API_URL ?? "https://had-api.moph.go.th/cmi/drg/calculate";

// Concurrent requests make had-api return records with an empty drg (its grouper runs
// collide server-side), so send them one at a time and retry a blank answer once.
export async function groupMany(cases: Case[]): Promise<PromiseSettledResult<Grouped>[]> {
  const out: PromiseSettledResult<Grouped>[] = [];
  for (const c of cases) {
    out.push(
      await groupOne(c)
        .catch(() => groupOne(c))
        .then(
          (value) => ({ status: "fulfilled" as const, value }),
          (reason) => ({ status: "rejected" as const, reason }),
        ),
    );
  }
  return out;
}

// had-api groups only data[0] of each request, so send one request per case.
export async function groupOne(c: Case): Promise<Grouped> {
  // had-api leaves the dates empty when los_day is 0 and answers err 9 (LOS error)
  if (c.los_day === 0) throw new Error("had-api ไม่รองรับ los_day 0");
  const r = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({
      version: "6",
      data: [{
        hcode: "", hn: "", an: c.an ?? "", sex: c.sex, age: c.age, age_day: c.age_day ?? 0,
        los_day: c.los_day, weight: c.weight ?? 0,
        dischs: "", discht: c.discht, pdx: c.pdx, sdx: c.sdx ?? [], proc: c.proc ?? [],
      }],
    }),
  });
  const text = await r.text();
  const d = r.ok ? JSON.parse(text).data?.[0] : undefined;
  if (!d?.drg) throw new Error(`had-api ${r.status}: ${text.slice(0, 200)}`);
  return {
    an: c.an ?? "",
    mdc: d.mdc,
    drg: d.drg,
    rw: Number(d.rw),
    adjrw: Number(d.adjrw),
    wtlos: Number(d.wtlos),
    ot: Number(d.ot),
    err: Number(d.err),
    warn: Number(d.warn),
    actlos: Number(d.actlos),
  };
}
