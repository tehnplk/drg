"use client";

import { useState } from "react";

const API = "/api";

const DC_STATUS: [string, string][] = [
  ["11", "Complete Recovery - With Approval"],
  ["13", "Complete Recovery - Escape"],
  ["15", "Complete Recovery - Other"],
  ["21", "Improved - With Approval"],
  ["22", "Improved - Against Advice"],
  ["23", "Improved - Escape"],
  ["24", "Improved - By Transfer"],
  ["25", "Improved - Other"],
  ["31", "Not Improved - With Approval"],
  ["32", "Not Improved - Against Advice"],
  ["33", "Not Improved - Escape"],
  ["34", "Not Improved - By Transfer"],
  ["35", "Not Improved - Other"],
  ["41", "Normal Delivery - With Approval"],
  ["42", "Normal Delivery - Against Advice"],
  ["43", "Normal Delivery - Escape"],
  ["44", "Normal Delivery - By Transfer"],
  ["45", "Normal Delivery - Other"],
  ["51", "Un-Delivery - With Approval"],
  ["53", "Un-Delivery - Escape"],
  ["54", "Un-Delivery - By Transfer"],
  ["61", "Normal Child D/C with mother - With Approval"],
  ["64", "Normal Child D/C with mother - By Transfer"],
  ["71", "Normal Child D/C seperately - With Approval"],
  ["74", "Normal Child D/C seperately - By Transfer"],
  ["88", "Still Birth - Dead autopsy"],
  ["89", "Still Birth - Dead no autopsy"],
  ["98", "Dead - Dead autopsy"],
  ["99", "Dead - Dead no autopsy"],
];

type Grouped = {
  mdc: string;
  drg: string;
  rw: number;
  adjrw: number;
  wtlos: number;
  ot: number;
  err: number;
  warn: number;
};

type Result = Grouped & {
  drgname: string;
  errName: string;
  warnName: string;
  codes: { code: string; kind: string; name: string }[];
};

// "J18.9, e11.9 N179" -> ["J189", "E119", "N179"]
const codes = (s: string) =>
  s.toUpperCase().replace(/\./g, "").split(/[\s,;]+/).filter(Boolean);

async function lookup(path: string): Promise<Record<string, string>[]> {
  const r = await fetch(`${API}/libs/${path}`);
  if (!r.ok) return [];
  return (await r.json()).rows ?? [];
}

const input =
  "w-full rounded border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900";

export default function Home() {
  const [f, setF] = useState({
    hcode: "",
    sex: "1",
    age: "15",
    ageDay: "0",
    weight: "0",
    los: "1",
    dc: "21",
    pdx: "",
    sdx: "",
    proc: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value });

  async function calculate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    const pdx = codes(f.pdx)[0] ?? "";
    const sdx = codes(f.sdx).slice(0, 10);
    const proc = codes(f.proc).slice(0, 20);
    try {
      const r = await fetch(`${API}/drg/calculate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "6",
          data: [
            {
              hcode: f.hcode,
              hn: "",
              an: "1",
              sex: Number(f.sex),
              age: Number(f.age),
              age_day: Number(f.ageDay),
              los_day: Number(f.los),
              weight: Number(f.weight),
              dischs: f.dc[0],
              discht: f.dc[1],
              pdx,
              sdx,
              proc,
            },
          ],
        }),
      });
      const json = await r.json();
      const g: Grouped | undefined = json.data?.[0];
      if (!r.ok || !g) throw new Error(json.message ?? `API ตอบกลับ ${r.status}`);

      const [drg, err, warn, ...names] = await Promise.all([
        lookup(`drg-name/${g.drg}`),
        g.err ? lookup(`drg-error/${g.err}`) : [],
        g.warn ? lookup(`drg-warning/${g.warn}`) : [],
        ...[pdx, ...sdx].map((c) => lookup(`icd10/${c}`)),
        ...proc.map((c) => lookup(`icd-cm/${c}`)),
      ]);
      const all = [
        ...[pdx, ...sdx].map((code, i) => ({ code, kind: i ? "SDx" : "PDx" })),
        ...proc.map((code) => ({ code, kind: "Proc" })),
      ];
      setResult({
        ...g,
        drgname: drg[0]?.drgname ?? "",
        errName: err.map((e) => e.name).join(", "),
        warnName: warn.map((w) => w.name).join(", "),
        // c63i10 has no ICD-10 descriptions; c63proc has a short DESC
        codes: all.map((c, i) => ({
          ...c,
          name: names[i][0] ? (names[i][0].desc ?? `MDC ${names[i].map((r) => r.mdc).join("/")}`) : "ไม่พบรหัส",
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <h1 className="text-2xl font-bold">DRG Seeker</h1>
      <p className="mb-6 text-sm text-zinc-500">
        คำนวณ DRG / RW ด้วย Thai DRG 6.3 (TGrp6305) ในเครื่อง
      </p>

      <form onSubmit={calculate} className="grid gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <label className="text-sm">
            HCode
            <input className={input} value={f.hcode} onChange={set("hcode")} />
          </label>
          <fieldset className="text-sm">
            <legend>เพศ</legend>
            <div className="flex gap-4 py-2">
              {[["1", "ชาย"], ["2", "หญิง"]].map(([v, l]) => (
                <label key={v} className="flex items-center gap-1">
                  <input type="radio" name="sex" value={v} checked={f.sex === v} onChange={set("sex")} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="text-sm">
            อายุ (ปี)
            <input type="number" min={0} required className={input} value={f.age} onChange={set("age")} />
          </label>
          <label className="text-sm">
            อายุ (วัน)
            <input type="number" min={0} className={input} value={f.ageDay} onChange={set("ageDay")} />
          </label>
          <label className="text-sm">
            น้ำหนัก (กก.)
            <input type="number" min={0} step="0.01" className={input} value={f.weight} onChange={set("weight")} />
          </label>
          <label className="text-sm">
            LOS (วัน)
            <input type="number" min={0} required className={input} value={f.los} onChange={set("los")} />
          </label>
          <label className="col-span-2 text-sm">
            D/C Status
            <select className={input} value={f.dc} onChange={set("dc")}>
              {DC_STATUS.map(([v, l]) => (
                <option key={v} value={v}>{v}. {l}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="text-sm">
          PDx (ICD-10)
          <input required placeholder="เช่น J18.9" className={input} value={f.pdx} onChange={set("pdx")} />
        </label>
        <label className="text-sm">
          SDx (ICD-10, คั่นด้วยเว้นวรรคหรือจุลภาค สูงสุด 10)
          <input placeholder="เช่น E11.9, N17.9" className={input} value={f.sdx} onChange={set("sdx")} />
        </label>
        <label className="text-sm">
          Procedure (ICD-9-CM, สูงสุด 20)
          <input placeholder="เช่น 96.04" className={input} value={f.proc} onChange={set("proc")} />
        </label>

        <button
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "กำลังคำนวณ..." : "คำนวณ DRG"}
        </button>
      </form>

      {error && <p className="mt-6 rounded bg-red-50 p-3 text-red-700">{error}</p>}

      {result && (
        <section className="mt-8 grid gap-4">
          <div className="rounded border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="text-sm text-zinc-500">MDC {result.mdc} · DRG</div>
            <div className="text-3xl font-bold">{result.drg}</div>
            <div>{result.drgname}</div>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["RW", result.rw],
              ["AdjRW", result.adjrw],
              ["WTLOS", result.wtlos],
              ["OT", result.ot],
            ].map(([k, v]) => (
              <div key={k} className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
                <dt className="text-sm text-zinc-500">{k}</dt>
                <dd className="text-xl font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {result.err > 0 && (
            <p className="rounded bg-red-50 p-3 text-red-700">Error {result.err}: {result.errName}</p>
          )}
          {result.warn > 0 && (
            <p className="rounded bg-amber-50 p-3 text-amber-800">Warning {result.warn}: {result.warnName}</p>
          )}
          <table className="w-full text-left text-sm">
            <tbody>
              {result.codes.map((c, i) => (
                <tr key={i} className="border-t border-zinc-200 dark:border-zinc-800">
                  <td className="py-2 pr-4 text-zinc-500">{c.kind}</td>
                  <td className="py-2 pr-4 font-mono">{c.code}</td>
                  <td className="py-2">{c.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
