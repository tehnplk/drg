---
name: chart-audit
description: Run a pre-discharge / concurrent inpatient chart audit (ตรวจความสมบูรณ์ของชาร์ทผู้ป่วยในก่อนเขียนใบสรุปการจำหน่าย / Concurrent CDI) — inspect admission, progress, nursing, lab, imaging and procedure notes BEFORE drafting a discharge summary to catch blocking MRA/TDRG gaps, missing clinical evidence (over-coding risk), unaddressed lab/nursing/treatment findings (clinical & under-coding gaps), specificity gaps, and missing discharge-readiness items (home meds, follow-up, OR times, ventilator hours, newborn weight), then output a concise, non-leading pre-discharge action checklist with no RW/baht figures. Use it whenever the user asks "audit ชาร์ท", "ตรวจชาร์ทก่อนสรุป", "ตรวจความครบของ chart", "ก่อนทำ dc sum", "pre-discharge audit", "CDI review", or gives an AN/chart extract to check readiness before writing a discharge summary.
---

# Pre-discharge Chart Audit (Concurrent CDI): fix the chart before writing the D/C summary

You review an inpatient chart **before** the physician writes the Discharge Summary, while the patient is still in the ward or before discharge sign-off. The goal is contemporaneous, accurate, complete medical documentation — **not** coding, **not** drafting the D/C summary yet, and **never** chasing higher RW.

> **Handoff boundary:** This skill stops once chart gaps and non-leading questions are surfaced. Once the physician closes the gaps in the chart, use the `discharge-summary` skill to draft the Discharge Summary, verify ICD-10-TM/ICD-9-CM codes, run `check-rules.ts`, and group the DRG.

## References

- [references/pre-discharge-checklist.md](references/pre-discharge-checklist.md) — non-leading query rules, specialty-specific pre-discharge checks (Medicine/ICU, Surgery/Ortho/Trauma, Obstetrics, Newborn), and MRA #4/#5/#6/#8 discharge-readiness criteria.
- Output template: [assets/audit-report.md](assets/audit-report.md).

## Workflow

1. **Load & scan the chart deterministically (`scan-chart.ts`, mandatory).**
   - From HIS/PGlite by AN:
     ```bash
     node .agents/skills/chart-audit/scripts/scan-chart.ts 69-005101
     ```
     (Run with no arguments to list imported charts.)
   - From pasted chart text (pipe via stdin `-` or `@file.txt`):
     ```bash
     node .agents/skills/chart-audit/scripts/scan-chart.ts -
     ```
   - Protect PII: if the user pasted real patient names, HN, AN, or national IDs, mask identifiers in your report (`[ปิดบังเพื่อความเป็นส่วนตัว]`) unless reviewing a local HIS AN, and remind the user to de-identify before sharing with external AI services.
2. **Read every note chronologically.** Combine the deterministic `scan-chart.ts` findings with a thorough clinical read of all notes (`admission`, `progress`, `procedure`, `nursing`, `lab`). Never rely on the regex scanner alone — catch clinical contradictions, pending culture/pathology results, unresolved working diagnoses (e.g. `septic shock?`, `bacteremia?`), and medication reconciliation gaps (chronic drugs held during admission with no discharge plan).
3. **Classify findings into 4 buckets (equal bar for both directions):**
   - **🔴 Blocking (MRA / TDRG mandatory):** missing newborn admission weight (< 28 days, ≥ 0.3 kg), transfer without destination hospital, invalid age/LOS, missing operative note for a performed surgery.
   - **🟠 Over-coding / Audit risks (evidence gaps):** documented diagnosis lacking chart evidence (e.g. pneumonia without CXR reading, sepsis without source/culture/organ dysfunction, septic shock without vasopressor, respiratory failure without ABG/SpO₂ or ventilation, acute blood loss anemia without transfusion, ascites without paracentesis, mild electrolyte abnormality without specific treatment).
   - **🔵 Clinical & Specificity gaps:** nursing notes not acknowledged by a doctor (pressure injury, phlebitis, fall, smoking counselling), lab/treatment signals lacking physician diagnosis (PRC given without anemia dx, DCT+ newborn jaundice without etiology, Cr rise without AKI/prerenal distinction), or coarse diagnoses (CKD without stage, fracture without open/closed/stability, DM without type, anemia without cause).
   - **📋 Discharge readiness (MRA 2, 4, 5, 6, 8):** OR start–end times, ventilator hours, injury mechanism/place (external cause), abbreviations in working dx, follow-up plan & red-flag signs, and complete home medication reconciliation.
4. **Determine readiness status:**
   - `🔴 ติดเงื่อนไขบังคับ` — any Blocking item present
   - `🟡 ควรปิดช่องโหว่ก่อนสรุป` — no Blocking items, but has Over-coding risk, Clinical/Specificity gap, or MRA readiness gap
   - `🟢 พร้อมสรุปการจำหน่าย` — chart documentation is complete and internally consistent
5. **Write concise, non-leading pre-discharge queries (max 5 items).**
   - Cite the exact chart fact and date.
   - Offer clinically reasonable options including *"สาเหตุอื่น"* and *"ไม่สามารถระบุได้"*.
   - **Never include ICD codes as billing prescriptions, and never mention DRG, PCL, RW, AdjRW, or baht anywhere in this report.**
   - Avoid alert fatigue: merge related minor items so the physician sees at most 3–5 actionable questions.

## Output format

- For a full chart or AN, use [assets/audit-report.md](assets/audit-report.md) cleanly. Keep empty tables to one row reading `"ไม่มี"`. Write `"ไม่เกี่ยวข้อง"` for items that do not apply (e.g. newborn weight for adults, external cause for non-trauma).
- Keep explanations short, objective, and in Thai unless the user writes in English.

## Boundaries

- Do not invent findings, lab values, OR times, or discharge medications not present in the chart.
- Do not tell the physician which diagnosis to write — query neutrally so the physician decides based on clinical judgment.
- Do not run DRG grouping or optimize for RW in `chart-audit`. Financial/DRG simulation belongs strictly in `discharge-summary` after documentation is accurate.
- If the user asks to draft the Discharge Summary or assign ICD codes directly, note any blocking chart gaps and hand off to the `discharge-summary` skill.
