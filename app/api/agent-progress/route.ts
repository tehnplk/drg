import { latestRuns } from "@/lib/charts.ts";

// GET /api/agent-progress?an=&kind=audit|dcsum — the latest agent run of one kind for one chart: its status and the
// short line saying what it is doing now. Polled by the screen while the run goes.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const an = url.searchParams.get("an") ?? "";
  const kind = url.searchParams.get("kind");
  if (!/^[\w-]{1,20}$/.test(an) || (kind !== "audit" && kind !== "dcsum"))
    return Response.json({ error: "an และ kind (audit | dcsum) ไม่ถูกต้อง" }, { status: 400 });
  const run = (await latestRuns([an])).find((r) => r.kind === kind);
  return Response.json(run ?? { status: null, progress: null }, { headers: { "cache-control": "no-store" } });
}
