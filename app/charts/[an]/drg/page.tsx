import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseHeader } from "@/components/case-header.tsx";
import { loadCase } from "../coding/load.ts";
import Summary from "../coding/summary.tsx";

export const metadata: Metadata = { title: "DRG / AdjRW" };

// Step 3: the DRG and AdjRW of the complete coding (grouped by the system, no AI), then the approval for the claim.
export default function DrgPage(props: PageProps<"/charts/[an]/drg">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">กำลังโหลดชาร์ทและ DRG...</p>}>
      <Chart params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Chart({ params, searchParams }: Pick<PageProps<"/charts/[an]/drg">, "params" | "searchParams">) {
  await connection();
  const { an } = await params;
  const data = await loadCase(an, "dcsum", (await searchParams).v);
  return <Summary {...data} sections={["drg", "approve"]} header={<CaseHeader an={an} active="drg" />} />;
}
