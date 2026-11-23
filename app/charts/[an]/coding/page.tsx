import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { CaseHeader } from "@/components/case-header.tsx";
import { loadCase } from "./load.ts";
import Summary from "./summary.tsx";

export const metadata: Metadata = { title: "Complete coding" };

// Step 2: the AI's complete coding in the D/C summary form, each code accepted or rejected.
export default function CodingPage(props: PageProps<"/charts/[an]/coding">) {
  return (
    <Suspense fallback={<p className="p-8 text-slate-500">กำลังโหลดชาร์ทและร่าง Complete coding...</p>}>
      <Chart params={props.params} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Chart({ params, searchParams }: Pick<PageProps<"/charts/[an]/coding">, "params" | "searchParams">) {
  await connection();
  const { an } = await params;
  const data = await loadCase(an, "dcsum", (await searchParams).v);
  return <Summary {...data} sections={["summary", "coding"]} header={<CaseHeader an={an} active="dcsum" />} />;
}
