import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseHeader } from "@/components/case-header.tsx";
import { loadCase } from "../coding/load.ts";
import Summary from "../coding/summary.tsx";

export const metadata: Metadata = { title: "Pre-coding + Query" };

// Step 1: the AI's first-pass codes from the physician's words and its queries; the coder records the answers.
export default function QueryPage(props: PageProps<"/charts/[an]/query">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">กำลังโหลดชาร์ทและ Pre-coding + Query...</p>}>
      <Chart params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Chart({ params, searchParams }: Pick<PageProps<"/charts/[an]/query">, "params" | "searchParams">) {
  await connection();
  const { an } = await params;
  const data = await loadCase(an, "precode", (await searchParams).v);
  return <Summary {...data} sections={["coding", "drg"]} decideLines={false} header={<CaseHeader an={an} active="precode" />} />;
}
