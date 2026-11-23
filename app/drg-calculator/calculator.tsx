"use client";

import { Calculator as CalculatorIcon, LoaderCircle, Plus, X } from "lucide-react";
import { useState } from "react";
import { MAX_SDX } from "@/lib/ward.ts";

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

// One code as typed -> as the grouper takes it: " j18.9 " -> "J189"
const norm = (s: string) => s.toUpperCase().replace(/[.\s]/g, "");
const MAX_PROC = 20;

// A list of codes side by side, wrapping: "+" at the end adds one (or Enter in the last box), × removes one.
function CodeList({ title, hint: note, placeholder, max, values, onChange }: {
  title: string; hint: string; placeholder: string; max: number; values: string[]; onChange: (v: string[]) => void;
}) {
  const [focus, setFocus] = useState(-1); // the row just added gets the cursor
  const add = () => {
    if (values.length >= max) return;
    onChange([...values, ""]);
    setFocus(values.length);
  };
  return (
    <fieldset className={label}>
      <legend>{title}</legend>
      <ol className="mt-1 flex flex-wrap items-center gap-2">
        {values.map((v, i) => (
          <li key={i} className="flex items-center rounded-xl border border-slate-300 bg-white pl-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900">
            <span className="text-xs text-slate-400 tabular-nums">{i + 1}.</span>
            <input
              aria-label={`${title} รายการที่ ${i + 1}`}
              placeholder={i ? "" : placeholder}
              size={8}
              className="w-24 bg-transparent px-1.5 py-2 font-mono text-sm text-slate-900 uppercase outline-none placeholder:font-sans placeholder:normal-case dark:text-slate-100"
              value={v}
              autoFocus={i === focus}
              onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && i === values.length - 1 && v.trim()) { e.preventDefault(); add(); }
              }}
            />
            <button
              type="button"
              aria-label={`ลบ${title}รายการที่ ${i + 1}`}
              onClick={() => onChange(values.length > 1 ? values.filter((_, j) => j !== i) : [""])}
              className="grid size-8 shrink-0 place-items-center rounded-r-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={add}
            disabled={values.length >= max}
            aria-label={`เพิ่ม${title}`}
            title="เพิ่มรายการ (หรือกด Enter ในช่องสุดท้าย)"
            className="grid size-9 place-items-center rounded-xl text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-300 dark:ring-indigo-500/30 dark:hover:bg-indigo-500/10"
          >
            <Plus className="size-4" />
          </button>
        </li>
      </ol>
      <span className={hint}>{note}</span>
    </fieldset>
  );
}

async function lookup(path: string): Promise<Record<string, string>[]> {
  const r = await fetch(`${API}/libs/${path}`);
  if (!r.ok) return [];
  return (await r.json()).rows ?? [];
}

const input =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";
const codeInput = `${input} font-mono uppercase placeholder:normal-case placeholder:font-sans`;
const label = "text-sm font-medium text-slate-700 dark:text-slate-200";
const hint = "mt-1 block text-xs font-normal text-slate-500";

export default function Calculator() {
  const [f, setF] = useState({
    sex: "1",
    age: "15",
    ageDay: "0",
    weight: "0",
    los: "1",
    dc: "21",
    pdx: "",
  });
  const [sdxList, setSdxList] = useState([""]);
  const [procList, setProcList] = useState([""]);
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
    const pdx = norm(f.pdx);
    const sdx = sdxList.map(norm).filter(Boolean).slice(0, MAX_SDX);
    const proc = procList.map(norm).filter(Boolean).slice(0, MAX_PROC);
    try {
      const r = await fetch(`${API}/drg/calculate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          version: "6",
          data: [
            {
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <main className="mx-auto grid w-full max-w-[96rem] content-start gap-6 p-4 sm:p-8">
        <header className="flex items-center gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">
            <CalculatorIcon className="size-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">คำนวณ DRG</h1>
            <p className="text-sm text-slate-500">ลองรหัสโดยไม่ต้องมีชาร์ท ใช้ Thai DRG 6.3 ในเครื่อง</p>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_28rem]">
          <form onSubmit={calculate} className="grid gap-6 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6 dark:bg-slate-900 dark:ring-slate-800">
            <fieldset className="grid gap-4 sm:grid-cols-3">
              <legend className="mb-3 font-semibold text-slate-900 dark:text-slate-50">ผู้ป่วยและการจำหน่าย</legend>
              <div className={label}>
                เพศ
                <div role="radiogroup" aria-label="เพศ" className="mt-1 grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                  {[["1", "ชาย"], ["2", "หญิง"]].map(([v, l]) => (
                    <label key={v} className="cursor-pointer rounded-lg py-1.5 text-center has-[:checked]:bg-white has-[:checked]:text-indigo-700 has-[:checked]:shadow-sm dark:has-[:checked]:bg-slate-900 dark:has-[:checked]:text-indigo-300">
                      <input type="radio" name="sex" value={v} checked={f.sex === v} onChange={set("sex")} className="sr-only" />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
              <label className={label}>
                อายุ (ปี)
                <input type="number" min={0} required className={input} value={f.age} onChange={set("age")} />
              </label>
              <label className={label}>
                อายุ (วัน)
                <input type="number" min={0} className={input} value={f.ageDay} onChange={set("ageDay")} />
                <span className={hint}>ใช้กับทารกอายุไม่ถึง 1 ปี</span>
              </label>
              <label className={label}>
                น้ำหนักแรกรับ (กก.)
                <input type="number" min={0} step="0.01" className={input} value={f.weight} onChange={set("weight")} />
                <span className={hint}>จำเป็นเมื่ออายุน้อยกว่า 28 วัน</span>
              </label>
              <label className={label}>
                LOS (วัน)
                <input type="number" min={0} required className={input} value={f.los} onChange={set("los")} />
                <span className={hint}>หักวันลากลับบ้านแล้ว</span>
              </label>
              <label className={`${label} sm:col-span-3`}>
                D/C Status
                <select className={input} value={f.dc} onChange={set("dc")}>
                  {DC_STATUS.map(([v, l]) => (
                    <option key={v} value={v}>{v}. {l}</option>
                  ))}
                </select>
              </label>
            </fieldset>

            <fieldset className="grid gap-4 border-t border-slate-100 pt-5 dark:border-slate-800">
              <legend className="sr-only">รหัส</legend>
              <label className={label}>
                PDx (ICD-10)
                <input required placeholder="เช่น J18.9" className={codeInput} value={f.pdx} onChange={set("pdx")} />
              </label>
              <CodeList
                title="SDx (ICD-10)" placeholder="เช่น E11.9" max={MAX_SDX} values={sdxList} onChange={setSdxList}
                hint={`รายการละ 1 รหัส สูงสุด ${MAX_SDX} รหัส จุดในรหัสใส่หรือไม่ใส่ก็ได้`}
              />
              <CodeList
                title="Procedure (ICD-9-CM)" placeholder="เช่น 96.04" max={MAX_PROC} values={procList} onChange={setProcList}
                hint={`รายการละ 1 รหัส สูงสุด ${MAX_PROC} รหัส`}
              />
            </fieldset>

            <button
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading && <LoaderCircle className="size-4 animate-spin" />}
              {loading ? "กำลังคำนวณ..." : "คำนวณ DRG"}
            </button>
          </form>

          <section aria-live="polite" aria-label="ผลการคำนวณ" className="grid gap-4 rounded-2xl bg-white p-5 ring-1 ring-slate-200 sm:p-6 lg:sticky lg:top-20 dark:bg-slate-900 dark:ring-slate-800">
            {error ? (
              <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>
            ) : !result ? (
              <p className="py-10 text-center text-sm text-slate-500">กรอกรหัสแล้วกด &quot;คำนวณ DRG&quot; ผลจะแสดงที่นี่</p>
            ) : (
              <>
                <div>
                  <div className="text-sm text-slate-500">MDC {result.mdc} · DRG</div>
                  <div className="font-mono text-4xl font-bold tracking-tight text-slate-900 tabular-nums dark:text-slate-50">{result.drg}</div>
                  <div className="mt-1 text-slate-700 dark:text-slate-300">{result.drgname}</div>
                </div>
                <dl className="grid grid-cols-2 gap-3">
                  {[["RW", result.rw], ["AdjRW", result.adjrw], ["WTLOS", result.wtlos], ["OT", result.ot]].map(([k, v]) => (
                    <div key={k} className={`rounded-xl p-3 ${k === "AdjRW" ? "bg-indigo-50 dark:bg-indigo-500/10" : "bg-slate-50 dark:bg-slate-800/60"}`}>
                      <dt className="text-xs text-slate-500">{k}</dt>
                      <dd className="font-mono text-xl font-semibold text-slate-900 tabular-nums dark:text-slate-50">{v}</dd>
                    </div>
                  ))}
                </dl>
                {result.err > 0 && (
                  <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-500/10 dark:text-rose-300">Error {result.err}: {result.errName}</p>
                )}
                {result.warn > 0 && (
                  <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">Warning {result.warn}: {result.warnName}</p>
                )}
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {result.codes.map((c, i) => (
                      <tr key={i} className="align-top">
                        <td className="py-2 pr-3 text-xs text-slate-500">{c.kind}</td>
                        <td className="py-2 pr-3 font-mono">{c.code}</td>
                        <td className="py-2 text-slate-700 dark:text-slate-300">{c.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
