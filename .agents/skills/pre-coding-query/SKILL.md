---
name: pre-coding-query
description: Pre-coding and physician query for a Thai inpatient chart after discharge (ให้รหัสเบื้องต้น + Query แพทย์ / Retrospective CDI) — read the whole chart against the discharge summary the physician wrote in the HIS, code the physician's own diagnoses as a first pass (verified ICD-10-TM / ICD-9-CM), then find what the chart leaves unclear or unsupported (missing evidence, treated findings without a physician diagnosis, coarse diagnoses, missing MRA items such as OR times, follow-up and home medication) and write at most 5 non-leading queries to the physician, each with its effect on the coding. Use it whenever the user asks "pre-code", "ให้รหัสเบื้องต้น", "ควร query แพทย์อะไร", "ตรวจชาร์ทก่อนให้รหัส", "audit ชาร์ท", "CDI review", or gives an AN to prepare queries before the coding is completed.
---

# Pre-coding + Query: code what the physician wrote, ask about what the chart leaves open

The physician has written the discharge summary. You are the coder's first pass: code the physician's own words, then read the whole chart for what the summary leaves unclear, unsupported or missing, and turn each gap into one non-leading query. You suggest; the coder sends the queries and the physician answers. The coding is completed afterwards with the `complete-coding` skill, from the physician's answers.

## References

- [references/query-checklist.md](references/query-checklist.md): the query principles, specialty checks (Medicine/ICU, Surgery/Ortho/Trauma, Obstetrics, Newborn) and the MRA 4, 5, 6, 8 items.
- [../complete-coding/references/audit-and-coding-rules.md](../complete-coding/references/audit-and-coding-rules.md): the coding rules and the 18 NHSO AI-audit rules, shared with `complete-coding`.
- Output template when used directly: [assets/query-report.md](assets/query-report.md).

## Workflow

1. **Scan the chart (`scan-chart.ts`, mandatory), then read it all (`chart.ts`).**
   ```bash
   node .claude/skills/pre-coding-query/scripts/scan-chart.ts 690007722
   node .claude/skills/complete-coding/scripts/chart.ts 690007722
   ```
   `scan-chart.ts` flags gaps by rule; `chart.ts` prints every note, the medication orders, vital signs, intake/output, follow-up and the physician's HIS discharge summary. Never rely on the scanner alone: read every note in time order.
2. **Pre-code the physician's diagnoses.** Code only what the physician wrote, in their roles (PDx, comorbidity, complication, other, external cause, procedures). Verify every code with `lookup.ts` and its reverse-decode check, and run `check-rules.ts`, exactly as `complete-coding` describes. Point each code to its chart evidence, or say there is none.
3. **Find the gaps (equal bar in both directions).**
   - **🔴 Blocking:** newborn < 28 days without admission weight, transfer without destination, operation without an operative note, no PDx.
   - **🟠 Evidence risk:** a diagnosis the chart does not support (pneumonia without imaging, sepsis without source or organ dysfunction, respiratory failure without ABG/SpO₂ or ventilation, acute blood loss anaemia without transfusion).
   - **🔵 Clinical & specificity gaps:** a finding that was treated with no physician diagnosis (PRC given, Cr rise, electrolyte replaced, pressure injury in nursing notes), or a coarse diagnosis (CKD without stage, DM without type, fracture without open/closed).
   - **📋 MRA items:** OR start–end times, ventilator hours, external cause, abbreviations, follow-up and warning signs, home medication, discharge status/type.
4. **Write the queries (at most 5).** One topic per query. Cite the chart fact and its date, offer clinically reasonable options including "สาเหตุอื่น" and "ไม่สามารถระบุได้", and never mention RW, DRG or money in the question. Give each query its effect on the coding as codes (add, remove or swap), or none when it only completes the record (e.g. OR times).
5. **Group the DRG with `thai-drg`** to check the codes work; report no RW or baht in the queries.

## Boundaries

- Do not change the physician's diagnosis and do not code what they did not write: that is a query (coders query, they do not rewrite).
- Do not code from lab values alone; do not invent findings, times or medications.
- Merge minor items so the physician sees at most 5 questions.
- Mask real identifiers in output when the chart is pasted, unless it is a local HIS AN.
