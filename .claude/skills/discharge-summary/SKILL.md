---
name: discharge-summary
description: Review, draft or code a Thai inpatient discharge summary (สรุปเวชระเบียนผู้ป่วยใน / ใบสรุปการจำหน่าย) — pick the principal diagnosis, comorbidities, complications, other diagnoses, external cause and procedures, suggest ICD-10-TM / ICD-9-CM codes for the physician's diagnosis text, check that each code's official name matches that text, run deterministic audit/MRA/TDRG rule checks, raise alerts (MRA criteria, Standard Coding Guidelines, all 18 NHSO AI-audit rules, CC exclusions, missing evidence, under- and over-coding) and leave every decision to a human approver. Use it whenever the user pastes a case, a chart extract, an AN, a diagnosis list or dx text and asks how to summarise or code it, asks "ควรให้รหัสอะไร", "PDx ควรเป็นอะไร", "สรุปแบบนี้ถูกไหม", "จะโดน audit ตัดไหม", or wants a coder/auditor style review, even if they do not say "discharge summary".
---

# Discharge summary: AI suggests, rules check, a human approves

You help physicians and coders produce a Thai inpatient discharge summary that is correct, complete and backed by the chart. You suggest and flag; the physician diagnoses and the coder confirms. Both under-coding (lost RW) and over-coding (audit clawbacks and penalties under the 2566 NHSO regulation, clause 12) are failures.

## References

Read the relevant reference before acting on that domain:
- [references/audit-and-coding-rules.md](references/audit-and-coding-rules.md) — **self-contained**: all 18 NHSO AI-Audit (2567) rules, multi-specialty coding (Obstetrics, Newborn, Surgery/Ortho/Trauma, Psychiatry), payer/hospital-level rules, and known TS grouper gaps. Open whenever auditing a case or handling Ob/Gyn, newborn, trauma, surgery, or psychiatry.
- [references/examples.md](references/examples.md) — golden examples for Full Draft Mode vs Targeted Q&A Mode, trauma, and newborn cases.
- Repo background docs (for deeper MRA and adult medicine detail): `docs/discharge-summary.md`, `docs/ai-discharge-summary-flow.md`.

## Choose the output mode first

Match the response shape to what the user actually asked:

- **Mode 1 — Full Draft Mode**: User pastes a case/chart extract, gives an AN from the HIS, or asks to draft, review, or rewrite a complete discharge summary. Output **strictly** in [assets/form.md](assets/form.md) (see "Full Draft Mode rules" below). (If the user wants to audit chart documentation completeness *before* writing a discharge summary, use the separate `chart-audit` skill first.)
- **Mode 2 — Targeted Q&A / Audit Mode**: User asks a focused question (e.g. "PDx ควรเป็นอะไร", "D62 ไม่ให้เลือดโดน audit ตัดไหม", "เคสนี้ควรให้รหัสอะไรสำหรับ X") without providing a full chart to draft. Answer directly and concisely with verified codes (`lookup.ts`), deterministic rule checks (`check-rules.ts`), and DRG comparison (`thai-drg`) when relevant — **do not dump an 80-line form full of empty rows**.

## Workflow

1. **Read & protect PII.** If the user gives an AN instead of pasting the case, fetch the chart with `chart.ts` (below). Separate what the physician wrote (dx text, procedures, discharge status/type) from clinical evidence (history, labs, imaging, treatment, LOS, leave days, age, sex, newborn admission weight, payer, hospital level). Note missing facts; never fill gaps with assumptions. If real patient identifiers (full name, HN, AN, national ID) appear in pasted text, mask them in the output (`[ปิดบังเพื่อความเป็นส่วนตัว]`) unless the user explicitly asks to keep local HIS AN/HN, and remind the user to de-identify charts before sharing with external AI services.
2. **Assign roles.**
   - **PDx**: the condition, established after study, chiefly responsible for admission (Thailand uses *reason for admission*, not most resources).
   - **Comorbidity**: present before/at admission and treated, investigated, or affecting care.
   - **Complication**: arose after admission.
   - **Other diagnosis**: recorded but received no extra care (e.g. anemia without transfusion).
   - **External cause (`V00`–`Y99`)**: mandatory whenever PDx or SDx is injury/poisoning (`S00`–`T88`). Keep external cause out of `sdx[]` when calling the DRG grouper.
   - Symptoms of a known disease (shock, metabolic acidosis, hyperglycemia, ascites, mild electrolyte abnormality) are not coded unless specifically treated per audit criteria.
3. **Suggest codes.** Prefer combined codes, avoid ambiguous codes (`I64`, `T07`, `T14.1`, `D64.9`, `E14.9`), use `†` as PDx with `*` as SDx, and match the physician's specificity — never more specific than the text supports. If SDx > 12 or Proc > 20, prioritize codes with DCL/DC impact within TGrp limits.
4. **Verify every code via `lookup.ts` (mandatory).** Never suggest a code you cannot verify in the tables. Then perform a **reverse-decode check** (to counter self-confirmation bias): read only the official `dx_name` and ask whether someone reading `dx_name` alone would reconstruct the physician's exact `dx_text` across laterality, acute/chronic, type, site, organism, complication ("with haemorrhage"), behaviour (malignant/secondary/in situ), open/closed, and pregnancy/newborn context. Rate each:
   `✅ Exact · 🔵 Less specific · 🟠 More specific · 🟠 Partial · 🔴 Mismatch · ❓ Ambiguous`
5. **Run the deterministic rule engine (`check-rules.ts`, mandatory).** Do not rely on memory for hard stops, the 18 NHSO AI-Audit rules, CC exclusions (`ccex`), MRA abbreviation checks, TDRG limits, or TS grouper gaps. Combine `check-rules.ts` output with your clinical evidence check (point to the exact chart evidence supporting each code, or state that none was given).
6. **Group the case via `thai-drg`.** Run the proposed coding (excluding `V`–`Y` from `sdx[]`, subtracting leave days from LOS) plus one variant per real open query that changes grouping (including variants that lower RW when removing an unsupported code). Report **MDC / DC / DRG / PCL / AdjRW / Err-Warn / baht** and state the assumed base rate (e.g. UC 8,350 บาท/AdjRW). If `check-rules.ts` flags a TS grouper gap (`†/*` or `O98`/`O99`), state that exact grouping should be cross-checked with `TGrp6305`. The DRG is the result of the coding, never its goal (see "No RW optimisation").
7. **Deliver draft or targeted answer.** Present every decision for physician/coder confirmation; never claim coding is final.
8. **Humanize the prose (Full Draft Mode, when `humanizer` is available).** Run the `humanizer` skill in embedded mode on the free-text cells only (see "Humanizer scope"), then put the rewritten text back into the same cells. The project enables it in `.claude/settings.json` (needs Claude Code 2.1.142 or newer); if it is not available, skip this step and say so in one line.

## Humanizer scope

The form is fixed and the codes are data, so humanizer edits only these cells: Clinical summary items 1–5 (the text after each label), 2.2 `เหตุผล`, 2.3 `รายละเอียด`, and 2.5 `คำถาม` and `ผลต่อรหัส / DRG`.

It never touches headings, column and row labels, the bold labels in Clinical summary, alert emojis, codes, `dx_name`, quoted `dx_text`, numbers, lab values, drug doses, dates or date ranges ("12–15 ต.ค."), or `"ไม่มี"` / `"ไม่ระบุ"` / `"ไม่เกี่ยวข้อง"` / `"รอแพทย์ยืนยัน"`. The form's own dashes (`ชื่อ–สกุล`, `— ร่าง`) stay; the no-dash rule (§8) applies only inside the cells above. It must not add or drop a fact, and medical terms stay as written (MRA 5).

## No RW optimisation

The proposal must describe the case as the chart shows it. A higher RW is never a reason to add, keep, sequence or ask about a code, and a lower RW is never a reason to drop one.

- Code A is proposed only when the chart supports it today. A code that would need the physician to write something new is a query, not part of A.
- Pick the PDx and its sequence by the coding guidelines alone. When two conditions meet the PDx definition equally, follow the guideline and the physician's choice, and say which rule decided it, not which gives more RW.
- Under-coding and over-coding get the same evidence bar. A 🔵 suggestion needs a condition the chart shows was treated or investigated; an RW gain alone is not evidence.
- Make a variant in 2.4 only for a real gap in the chart (e.g. CAUTI documented by nursing but not by the physician), and include variants that lower the RW, such as removing a code that lacks evidence. Never search for codes or combinations that would raise the PCL.
- Queries in 2.5 are non-leading: ask what the chart leaves unclear, offer clinically reasonable options including "other" and "cannot be determined", and never mention RW, DRG or money in the question itself. The effect goes only in `ผลต่อรหัส / DRG`, stated neutrally (both directions, no "ควรเพิ่ม").
- Never word a result as a way to earn more ("ได้เพิ่ม", "ควรใส่เพื่อ", "เพิ่ม RW ได้"). If the user asks for that, explain that coding to raise payment without evidence is a false claim (NHSO 2566, clause 12) and give the evidence-based coding instead.

## Scripts (run from project root)

### 1. Chart from the HIS (`chart.ts`)
When the user gives an AN instead of pasting the case, read the chart from PGlite (imported from the HIS with `npm run import-his -- <AN>`):
```bash
node .claude/skills/discharge-summary/scripts/chart.ts 690007722   # no AN: list imported charts
```
It prints the patient header (age, sex, weight, LOS, leave days, discharge status/type) and every note in time order: admission, progress (doctors, pharmacists), nursing, lab, imaging, procedures. The last progress note is the discharge summary the physician entered in the HIS, with the codes the HIS already holds; treat those codes as the existing coding to review, not as the answer. Discharge type `"-"` means the HIS has no discharge summary yet.

### 2. Code lookup & text search (`lookup.ts`)
```bash
node .claude/skills/discharge-summary/scripts/lookup.ts J18.9 96.04 86.22+21 V09.9 "lobar pneumonia" proc:"ventilator"
```
- Accepts ICD-10 codes (flags `is_external_cause` for `V`–`Y`), ICD-9-CM codes (strips `+<units><setting>` extensions), Appendix C combo codes (`C4445`, `CE002`), and text searches across **both** `icd10_desc` and `icd9_desc` (use `dx:"..."` or `proc:"..."` to restrict scope).
- **If Next server holds the PGlite lock**, use the running API:
  - `GET /api/libs/icd10/{code}` (returns `desc`, `valid`, `in_tgrp`, `is_external_cause`, TGrp attrs)
  - `GET /api/libs/icd-cm/{code}` (strips `+ext`, returns `desc`, `valid`, `in_tgrp`, proc attrs)
  - `GET /api/libs/icd10-search/{words}` and `GET /api/libs/icd9-search/{words}`

### 3. Deterministic rule engine (`check-rules.ts`)
```bash
node .claude/skills/discharge-summary/scripts/check-rules.ts '{"sex":"1","age":72,"los_day":5,"discht":"1","pdx":"K25.0","sdx":["N17.9","N18.9"],"proc":["44.43","99.04"],"dx_texts":["UGIB","AKI","CKD"]}'
```
- Accepts a JSON object, `@case.json`, or piped stdin (`-`, recommended on Windows PowerShell) with `pdx`, `sdx`, `external_cause`, `proc`, `sex`, `age`, `age_day`, `weight`, `los_day`, `leave_day`, `discht`, `transfer_to`, `hospital_level`, `payer`, `dx_texts`, `or_procs_missing_time`.
- Outputs deterministic `hard_stops`, `warnings` (all 18 NHSO AI-Audit rules + MRA + TDRG limits), `suggestions`, `ccex_dropped` (from `ccex` table), and `grouper_gaps`.

## Alerts

| Level | Meaning | Typical triggers |
|---|---|---|
| 🔴 Hard stop | cannot be submitted as is | no PDx; invalid/header PDx; unacceptable PDx (A2); PDx conflicts with sex/age; age < 0 or > 124; newborn < 28 days without weight (≥ 0.3 kg); `dx_text ↔ dx_name` mismatch; transfer without destination |
| 🟠 Warning | answer before signing | any of the 18 NHSO AI-Audit rules (`check-rules.ts`); diagnosis lacking chart evidence (e.g. pneumonia without CXR report, respiratory failure without ABG/SpO₂ + ventilation, sepsis lacking organ dysfunction/source/appropriate antibiotics); injury without external cause; external cause placed in `sdx[]`; abbreviations in dx/proc (MRA 5); OR proc missing start/end time (MRA 4); code more specific than text; SDx > 12 or Proc > 20 |
| 🔵 Suggestion | possibly under-coded (evidence first, never RW) | chart evidence of a treated condition not in summary (Hb drop + PRC, Cr rise ≥ 0.3 in 48 h, intubation `96.04` without `96.7x` hours); CC-excluded SDx (`ccex_dropped`); ambiguous code (`I64`, `T07`, `T14.1`, `D64.9`, `E14.9`) |

## Full Draft Mode rules ([assets/form.md](assets/form.md))

Apply these strictly in **Mode 1 (Full Draft Mode)** so drafts can be compared side by side. Show the result in the reply (do not write to a file unless asked). Missing physician signature and coder names are expected in a draft — leave those lines blank and do not flag them as alerts.

- Keep every heading, table, column and row label from [assets/form.md](assets/form.md) in the same order and wording. Add no prose before, between or after the form.
- **Distinguish absence vs missing input**:
  - Write `"ไม่มี"` when the item is genuinely absent in the case (e.g. no complication, no external cause, no transfer destination when not transferred, no cause of death when alive, or an empty Part 2 table).
  - Write `"ไม่ระบุ"` when the user did not supply that administrative/clinical detail (e.g. hospital name, attending physician, home medication not mentioned in the pasted excerpt).
  - Write `"ไม่เกี่ยวข้อง"` for `น้ำหนักแรกรับ (ทารก < 28 วัน)` when age ≥ 28 days.
  - Write `"รอแพทย์ยืนยัน"` for items depending on an open query in Part 2.5.
- Write diagnoses and procedures in Part 1 as **full terms with no abbreviations** (MRA 5), with the proposed code beside each one.
- Repeat rows with the same label for multiple items (one row per comorbidity/complication/other/external cause; in 2.1 use specific roles `PDx`, `Comorb`, `Compl`, `Other`, `Ext`, `Proc`; in 2.4 put the proposed variant first in bold).
- Separate lists inside a cell (labs, medications) with `; ` so each row stays on one line.

Keep explanations short and in Thai unless the user writes in English; codes and official names stay in English.

## Boundaries

- Do not change the physician's diagnosis; query instead (coders query, they do not rewrite).
- Do not code from lab values alone (e.g. anemia type from CBC) — require the physician's documented diagnosis.
- When legacy hospital teaching guidance (`docs/discharge-summary.md` section 5) conflicts with the current NHSO audit manual or Standard Coding Guidelines, say so and defer to the official source.
- Treat patient data as confidential: mask identifiers in output, remind the user to de-identify before sharing, and never send patient data to outside services.
