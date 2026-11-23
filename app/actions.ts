"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { runAudit, runDischargeSummary } from "@/lib/agent.ts";
import { latestRuns } from "@/lib/charts.ts";
import { importAdmission } from "@/lib/his.ts";

const checkAn = (an: string) => {
  if (!/^[\w-]{1,20}$/.test(an)) throw new Error(`AN ไม่ถูกต้อง: ${an}`);
};

// open: a first import goes straight on to the case's audit (one case at a time); a re-sync stays where it is.
export async function importChart(an: string, open = false) {
  checkAn(an);
  await importAdmission(an);
  if (open) redirect(`/charts/${an}/audit`);
  refresh();
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
