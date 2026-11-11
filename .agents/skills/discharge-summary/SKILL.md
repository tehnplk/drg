---
name: discharge-summary
description: Review, draft or code a Thai inpatient discharge summary (สรุปเวชระเบียนผู้ป่วยใน / ใบสรุปการจำหน่าย) — pick the principal diagnosis, comorbidities, complications, other diagnoses, external cause and procedures, suggest ICD-10-TM / ICD-9-CM codes for the physician's diagnosis text, check that each code's official name matches that text, raise alerts (MRA criteria, Standard Coding Guidelines, NHSO AI-audit rules, missing evidence, under- and over-coding) and leave every decision to a human approver. Use it whenever the user pastes a case, a chart extract, a diagnosis list or dx text and asks how to summarise or code it, asks "ควรให้รหัสอะไร", "PDx ควรเป็นอะไร", "สรุปแบบนี้ถูกไหม", "จะโดน audit ตัดไหม", or wants a coder/auditor style review, even if they do not say "discharge summary".
---

# Discharge summary: AI suggests, rules check, a human approves

You help physicians and coders produce a discharge summary that is correct, complete and backed by the chart. You suggest and flag; the physician diagnoses and the coder confirms. Two reasons this matters: the summary drives the DRG and the hospital's payment, and NHSO audits remove unsupported codes and can claw money back (with penalties for false claims under the 2566 NHSO regulation, clause 12). So both missing and unsupported codes are failures.

Background reading in this repo, open only when you need the detail:
- `docs/discharge-summary.md` — definitions, the 9 MRA criteria, how the summary feeds Thai DRG, condition-by-condition documentation criteria (sepsis, pneumonia, respiratory failure, AKI/CKD, anemia, electrolytes, DM, cirrhosis, cancer, HIV, stroke, AMI).
- `docs/ai-discharge-summary-flow.md` — the full AI → rule engine → human flow, who does what, alert levels, the 18 NHSO AI-audit conditions.

## Workflow

1. **Read what you have.** Separate what the physician wrote (dx text, procedures, discharge status/type) from the evidence (history, labs, imaging, treatment, LOS, age, sex, newborn weight). Note what is missing; do not fill gaps with assumptions.
2. **Assign roles.** PDx = the condition, established after study, chiefly responsible for this admission (Thailand uses reason-for-admission, not most resources). Comorbidity = present before admission and treated/investigated. Complication = arose after admission. Other = recorded but no extra care. External cause = always for injury/poisoning. Symptoms of a known disease are not coded (shock, acidosis, hyperglycemia, ascites, hypoK in diarrhea...) unless specifically treated per the criteria in `docs/discharge-summary.md`.
3. **Suggest codes.** For each dx text propose a code. Prefer combined codes, avoid ambiguous ones (I64, T07, T14.1), use † as PDx with the * code as SDx, and keep the physician's specificity — never more specific than the text supports.
4. **Verify every code against its official name.** Run the lookup script (below) to get `dx_name`, validity, PDx acceptability and sex/age limits from the TGrp tables, then compare dx_text with dx_name on laterality, acute/chronic, type, site, organism, complication ("with hemorrhage"), behaviour (malignant/secondary/in situ), open/closed, pregnancy/newborn context. Rate each: ✅ Exact · 🔵 Less specific · 🟠 More specific · 🟠 Partial · 🔴 Mismatch · ❓ Ambiguous. A code you remember but cannot find in the table is not a suggestion — say so.
5. **Check rules and evidence.** Hard stops, warnings and suggestions (see "Alerts"). For each diagnosis, point to the evidence that supports it, or say none was given.
6. **Group the case.** Use the `thai-drg` skill to run the proposed coding, plus one variant for each open query that changes the grouping. Report DRG / PCL / AdjRW / baht for each. Present this as information, not as the reason to add a code.
7. **Fill the standard form, then the DRG proposal.** Write the result as the discharge summary form first (Part 1), then the coding and DRG proposal (Part 2). Do not present the result as final coding.

## Lookup script

Run from the project root (PGlite allows one process; if the Next server is running use `GET /api/libs/icd10/{code}` or `/api/libs/icd-cm/{code}` instead):

```bash
node .agents/skills/discharge-summary/scripts/lookup.ts J18.9 96.04 "lobar pneumonia"
```

A code argument returns its official name and TGrp attributes (MDC, PDC, CC, valid as PDx, sex, age limits; ORP group for procedures). A text argument searches ICD-10 names (all words must match) and lists candidates.

## Alerts

| Level | Meaning | Typical triggers |
|---|---|---|
| 🔴 Hard stop | cannot be submitted as is | no PDx; PDx not acceptable (A2) or invalid/header code; PDx conflicts with sex or age; newborn < 28 days without weight; dx_text ↔ dx_name mismatch; transfer without destination |
| 🟠 Warning | answer before signing | NHSO AI-audit conditions (D62 without transfusion, J96.0 without ventilator, R18 without paracentesis, N18.9 unstaged, N17 on CKD 5, symptom codes with their cause, duplicate GI-bleed codes, IVUS 00.2 in a community hospital, PCI without vessel count…); diagnosis without supporting evidence (sepsis with negative hemoculture, pneumonia without a CXR report, respiratory failure without ABG/SpO₂ and ventilation); injury without external cause; code more specific than the text |
| 🔵 Suggestion | possibly under-coded | evidence of a treated condition not in the summary (Hb drop + PRC, Cr rise ≥ 0.3 in 48 h, intubation without 96.7x hours, OR procedure without date/time) |

## Output format

Show the result in the reply, in the standard form ([assets/form.md](assets/form.md)). Do not write it to a file unless the user asks for one. The result is a draft for the physician and coder to review and confirm, so the missing signature and coder names are expected: leave those lines blank and do not raise them as an alert or a query. Two parts, always in this order.

**Part 1 is the standard discharge summary form** (fields from `docs/discharge-summary.md` section 2, clinical summary per MRA criterion 6). Fill it from the chart. Write diagnoses and procedures as full terms, with no abbreviations (MRA 5). Put the proposed code beside each one. Write "ไม่มี" for an empty field, and "รอแพทย์ยืนยัน" for an item that depends on a query in Part 2. Never invent a signature, a licence number, a coder's name or an OR time. Take leave days from the chart; they shorten the LOS the grouper uses (MRA Others 6).

**Part 2 is the coding and DRG proposal** for the approver. It is where every code is checked and every decision is raised.

**The form is fixed: [assets/form.md](assets/form.md).** Every case, from every user, comes out in exactly that form, so results can be compared side by side. Copy it and replace each `…` with the case data:

- Keep every heading, table, column and row label, in the same order and wording. Add no sections, notes or prose before, between or after them.
- Every row in the form stays, even when empty: write "ไม่มี" in its cells. A Part 2 table with nothing to report keeps one row reading "ไม่มี".
- More than one item of a kind → repeat the row with the same label (e.g. one `Comorbidity` row per comorbidity; one `SDx` row per secondary code in 2.1; one row per variant in 2.4, the proposed one first and in bold).
- `สถานพยาบาลที่ส่งต่อ` and `สาเหตุการตาย` are "ไม่มี" unless the case was transferred or died.
- Lists inside a cell (labs, medications) are separated with `; ` so the table stays one line per row.

Keep explanations short and in Thai unless the user writes in English; codes and official names stay in English.

## Boundaries

- Do not change the physician's diagnosis; ask instead (coding guideline: coders query, they do not rewrite).
- Do not code from lab values alone (e.g. anemia type from CBC) — that needs the physician's documented diagnosis.
- Guidance in `docs/discharge-summary.md` section 5 comes partly from a hospital teaching deck; when it conflicts with the current NHSO audit manual or Standard Coding Guidelines, say so and defer to the official source.
- Treat patient data as confidential: work with what the user provides, suggest removing identifiers before sharing, never send it to outside services.
