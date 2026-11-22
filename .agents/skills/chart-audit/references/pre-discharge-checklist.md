# Pre-discharge Chart Audit Checklist (Concurrent CDI)

Use this checklist alongside `scripts/scan-chart.ts` to verify chart completeness **before** the physician writes the Discharge Summary.

---

## 1. Core Principles (Non-negotiable)

1. **Documentation integrity, never RW chasing**: Check under-documentation (treated findings lacking physician diagnosis) and over-documentation (diagnoses lacking clinical evidence) with the **exact same evidence bar**. Never display RW, AdjRW, DRG, or baht estimates in pre-discharge chart audit queries.
2. **Fix the chart while the patient is still here**: The goal is accurate contemporaneous medical records (progress notes, operative notes, nursing/lab reconciliation) so the physician does not rely on memory or risky late entries after discharge.
3. **Prevent alert fatigue**: Prioritize only clinically, legally, or audit-material gaps. Keep physician queries to **at most 3–5 concise, non-leading questions**.
4. **Non-leading query standard**: State the exact chart facts (date, lab/imaging/nursing finding), offer clinically reasonable options including *"สาเหตุอื่น"* and *"ไม่สามารถระบุได้"*, and never tell the physician what diagnosis to choose.

---

## 2. Specialty-Specific Pre-discharge Checks

### Adult Medicine & ICU
- **Sepsis / Bacteremia**: Source of infection, hemoculture result (positive/negative/pending), organ dysfunction / SOFA, antibiotic regimen and planned duration. If septic shock is mentioned, confirm fluid responsiveness vs vasopressor requirement.
- **Pneumonia**: Chest X-ray / CT reading documented (not just "done"), organism if identified (true sputum / culture vs colonization), or anatomical type (lobar/broncho/aspiration).
- **Respiratory failure & Ventilator**: ABG or SpO₂, mode (NIV vs invasive ET tube), **exact intubation and extubation timestamps** (or total hours to distinguish `< 96 h` vs `≥ 96 h`).
- **AKI / CKD**: Baseline Cr/eGFR, CKD stage (1–5), and whether acute rise is AKI (`N17.-`) or prerenal azotemia (`R39.2`).
- **Anemia & Transfusion**: Physician-documented anemia type/cause whenever PRC/blood is transfused; confirm if acute posthemorrhagic anemia vs chronic/neoplastic anemia vs hemodilution.
- **Electrolytes**: Lab values + specific treatment (IV KCl, 3% NaCl, Kayexalate/RI) + physician diagnosis if treated independently of underlying cause.
- **Diabetes / Hypertension / Heart Failure**: DM type (1/2), acute/chronic complications, medication reconciliation (which home drugs were held vs restarted).

### Surgery, Orthopedics & Trauma
- **Fracture / Trauma**: Open vs closed, exact anatomical site and laterality, stability (e.g. intertrochanteric stable vs unstable), traumatic vs fragility/osteoporotic fracture, and **mechanism + place of injury** for external cause (`V–Y`).
- **OR procedures**: Operative note must include **start and end date/time** (MRA #4), exact procedure performed, number of sites/sessions for multi-site procedures (e.g. debridement), EBL, and post-op complications.
- **Nursing–Physician handoff**: Pressure injuries (present on admission vs hospital-acquired, site, stage), phlebitis, post-op delirium, CAUTI, or in-hospital falls noted by nursing must be acknowledged by a physician note.

### Obstetrics
- Gestational age, delivery mode (spontaneous, vacuum, forceps, CS — primary vs repeat), delivery complications (PPH, tear degree, preeclampsia, GDM), and **outcome of delivery** (livebirth/stillbirth, single/multiple).
- Maternal diseases complicating pregnancy (`O98`/`O99` context) linked clearly to obstetric care.

### Newborn (< 28 days)
- **Admission weight (kg/g)** recorded clearly (mandatory for TDRG; missing or `< 0.3 kg` blocks grouping).
- Birth weight, gestational age, Apgar if relevant.
- **Neonatal jaundice**: Bilirubin peak/trend/rebound, phototherapy start–stop timestamps, and **physician-documented etiology** when blood group/DCT/reticulocyte labs suggest hemolysis (e.g. ABO/Rh isoimmunization) vs physiological/breastfeeding jaundice.
- **RDS / Respiratory distress**: Distinguish RDS vs TTNB vs neonatal respiratory failure (avoid redundant `P28.5` with `P22.0`).

---

## 3. Discharge Readiness (MRA #4, #5, #6, #8)

- **MRA #4**: Every OR procedure has start and end date/time.
- **MRA #5**: Physician prepared to write full medical terms without abbreviations on the D/C summary.
- **MRA #6**: Clinical summary has all 5 elements ready in chart notes — (1) admission problem/final dx, (2) key investigations (including pending results follow-up), (3) treatment & outcome, (4) post-discharge care/rehab/red-flag signs & follow-up appointment, (5) complete **home medication reconciliation** (new meds + held/restarted chronic meds).
- **MRA #8**: Discharge status & type clear; if Transfer (`4`), destination hospital name recorded; if Dead (`8`/`9`), cause of death documented.
