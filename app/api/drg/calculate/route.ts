import { groupMany } from "@/lib/hadapi.ts";
import { group as tsGroup } from "@/lib/tdrg/group.ts";
import { group, TGRP_EXE, type Case, type Grouped } from "@/lib/tgrp.ts";

// Body is compatible with had-api.moph.go.th/cmi/drg/calculate:
// { data: [{ an, sex, age, age_day, los_day, weight, discht, pdx, sdx[], proc[] }] }
// Unlike moph, every item in `data` is grouped, not just the first.
// ?source=
//   auto        had-api, falling back to the TypeScript grouper (default)
//   api | cli | ts   one grouper only (cli = TGrp6305.exe, Windows only)
//   compare     had-api vs TGrp CLI;  compare-ts: TypeScript grouper vs TGrp CLI

const code = (v: unknown) => String(v ?? "").toUpperCase().replace(/\./g, "").trim();
const num = (v: unknown, min: number, max: number) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`ค่าตัวเลขไม่ถูกต้อง: ${v}`);
  return n;
};

function parseCase(c: Record<string, unknown>): Case {
  const codes = (v: unknown, max: number, re: RegExp) => {
    if (v != null && !Array.isArray(v)) throw new Error("sdx/proc ต้องเป็น array");
    const list = ((v as unknown[]) ?? []).map(code).filter(Boolean);
    if (list.length > max) throw new Error(`ใส่ได้ไม่เกิน ${max} รหัส`);
    const bad = list.find((x) => !re.test(x));
    if (bad) throw new Error(`รหัสไม่ถูกต้อง: ${bad}`);
    return list;
  };
  const pdx = code(c.pdx);
  if (pdx && !/^[A-Z0-9]{3,6}$/.test(pdx)) throw new Error(`PDx ไม่ถูกต้อง: ${pdx}`);
  return {
    an: String(c.an ?? "").slice(0, 15).replace(/[^\x20-\x7e]/g, ""),
    sex: String(c.sex ?? "").slice(0, 1),
    age: num(c.age, 0, 999),
    age_day: num(c.age_day, 0, 999),
    los_day: num(c.los_day, 0, 999),
    weight: num(c.weight, 0, 999),
    discht: String(c.discht ?? "").slice(0, 1),
    pdx,
    sdx: codes(c.sdx, 12, /^[A-Z0-9]{3,6}$/),
    proc: codes(c.proc, 20, /^([0-9]{2,4}|[A-Z]{1,2}[0-9]{3,4})(\+[0-9]{2})?$/), // combination codes like CE002
  };
}

export async function POST(request: Request) {
  let cases: Case[];
  try {
    const body = await request.json();
    if (!Array.isArray(body?.data) || body.data.length === 0 || body.data.length > 1000)
      throw new Error("data ต้องเป็น array 1–1000 รายการ");
    cases = body.data.map(parseCase);
  } catch (e) {
    return Response.json({ status: 400, message: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  const source = new URL(request.url).searchParams.get("source") ?? "auto";
  try {
    if (source === "cli") return Response.json({ status: 200, data: (await group(cases)).map(tag("cli")) });
    if (source === "ts") return Response.json({ status: 200, data: (await groupTs(cases)).map(tag("ts")) });
    if (source === "compare-ts") {
      const [cli, ts] = [await group(cases), await groupTs(cases)];
      const data = cases.map((_, i) => {
        const diff = FIELDS.filter((k) => ts[i][k] !== cli[i][k]);
        return { an: cli[i].an, match: diff.length === 0, diff, ts: ts[i], cli: cli[i] };
      });
      return Response.json({ status: 200, matched: data.filter((d) => d.match).length, total: data.length, data });
    }
    const api = await groupMany(cases);
    if (source === "api") {
      const bad = api.find((r) => r.status === "rejected");
      if (bad) throw bad.reason;
      return Response.json({ status: 200, data: api.map((r) => tag("had-api")((r as PromiseFulfilledResult<Grouped>).value)) });
    }
    if (source === "compare") {
      const cli = await group(cases);
      const data = cases.map((_, i) => {
        const a = api[i].status === "fulfilled" ? api[i].value : null;
        const diff = a ? FIELDS.filter((k) => a[k] !== cli[i][k]) : null;
        const apiError = api[i].status === "rejected" ? String((api[i] as PromiseRejectedResult).reason) : undefined;
        return { an: cli[i].an, match: diff?.length === 0, diff, apiError, api: a, cli: cli[i] };
      });
      return Response.json({ status: 200, matched: data.filter((d) => d.match).length, total: data.length, data });
    }

    // auto: had-api first, the TypeScript grouper for whatever it could not group
    const failed = cases.filter((_, i) => api[i].status === "rejected");
    const ts = failed.length ? await groupTs(failed) : [];
    let k = 0;
    const data = api.map((r) => (r.status === "fulfilled" ? tag("had-api")(r.value) : tag("ts")(ts[k++])));
    return Response.json({ status: 200, data });
  } catch (e) {
    return Response.json({ status: 500, message: `grouper ทำงานไม่สำเร็จ: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
}

const FIELDS = ["mdc", "drg", "rw", "adjrw", "wtlos", "ot", "err", "warn", "actlos"] as const;
const GROUPER: Record<string, string> = { cli: TGRP_EXE, ts: "TDRG 6.3 (TypeScript)", "had-api": "had-api" };
const tag = (source: string) => (g: Grouped) => ({ ...g, source, grouper: GROUPER[source] });

const groupTs = (cases: Case[]): Promise<Grouped[]> =>
  Promise.all(cases.map(async (c) => {
    const { an, mdc, drg, rw, adjrw, wtlos, ot, err, warn, actlos } = await tsGroup(c);
    return { an, mdc, drg, rw, adjrw, wtlos, ot, err, warn, actlos };
  }));
