# Thai Inpatient Audit & Multi-Specialty Coding Reference

Self-contained reference for the `complete-coding` and `pre-coding-query` skills. For deeper MRA definitions and adult medicine criteria, see the repo's `docs/discharge-summary.md` and `docs/ai-discharge-summary-flow.md`.

---

## 1. NHSO AI-Audit 18 Conditions (ปีงบ 2567)

All 18 rules are checked deterministically by `scripts/check-rules.ts`. Clinical evidence in the chart must still be verified before accepting or dropping a code.

| # | Condition | Codes involved | Action / Exception |
|---|---|---|---|
| 1 | Acute posthaemorrhagic anaemia without transfusion | `D62` without `99.03`–`99.07` | If no transfusion, move to Other diagnosis or drop from comorbidity |
| 2 | Cytopenia with underlying pancytopenia/marrow cause | `D63*`, `D64*`, `D70`, `D72*`, `D69.5`, `D69.6` + `D60*`/`D61*`/`D46*`/`C91*`–`C95*` | Do not double-code cytopenia that is part of the marrow disorder unless separately treated/justified |
| 3 | Hypoglycaemia with causative disease | `E16.0`–`E16.2` + sepsis (`A40*`/`A41*`), hepatic failure (`K72*`), adrenal insufficiency (`E27.1`–`E27.4`) | Do not code as separate comorbidity when it is merely a manifestation |
| 4 | Metabolic acidosis with causative disease | `E87.2` + CKD (`N18*`), sepsis (`A40*`/`A41*`), diarrhea (`A08*`/`A09*`/`K52*`) | Manifestation of underlying disease; drop unless independently justified |
| 5 | Seizure with alcohol withdrawal | `R56.8` + `F10.3`/`F10.4` | Do not add `R56.8`; seizure is covered by withdrawal |
| 6 | Acute respiratory failure without ventilator | `J96.0*` without `96.70`/`96.71`/`96.72`/`93.90`/`93.91` | Exempt if patient died (`discht` 8–9) or was transferred (`discht` 4) |
| 7 | Newborn respiratory failure with RDS | `P28.5` + `P22.0` | Drop `P28.5` when RDS (`P22.0`) already explains it |
| 8 | Melaena / GI haemorrhage with upper GI "with haemorrhage" code | `K92.1`/`K92.2` + `K25.0`/`K25.2`/`K25.4`/`K25.6`/`K26.0`…/`K29.0`/`I85.0`/`K22.1`/`K22.6` | Use the combined "with haemorrhage" code only |
| 9 | GI/rectal bleeding with bleeding internal haemorrhoids | `K92.2`/`K62.5` + `I84.1` | Redundant; keep the specific haemorrhoid code |
| 10 | Unstaged CKD with diabetic nephropathy | `N18.9` + `E10.2`–`E14.2`/`N08.3` | Query physician for CKD stage (`N18.1`–`N18.5`) |
| 11 | AKI on top of CKD stage 5 | `N17.*` + `N18.5` | Requires clear acute precipitant; otherwise code ESRD (`N18.5`) alone |
| 12 | UTI with urinary stone | `N10`/`N11*`/`N39.0` + `N20*` | Verify distinct documentation and combined coding rules |
| 13 | Chronic pyelonephritis / stone with obstructive uropathy | `N11*`/`N20*` + `N13*` | Use combined codes (e.g. `N13.2`, `N13.6`) instead of redundant pairs |
| 14 | Extrarenal uraemia or orthostatic hypotension with AGE | `R39.2`/`I95.1` + `A08*`/`A09*` | Usually volume depletion symptom of AGE; risk of audit removal |
| 15 | Ascites without abdominocentesis | `R18` without `54.91` | Do not code as comorbidity unless specifically treated (paracentesis) |
| 16 | SIRS without organ failure | `R65.0`, `R65.2`, `R65.9` | Do not code |
| 17 | IVUS in community hospital level F | `00.2*` at hospital level F | High audit rejection risk |
| 18 | PCI/PTCA without vessel count | `00.66` without `00.40`–`00.43` | Must pair with vessel count code (`00.40` 1 vessel … `00.43` 4+ vessels) |

---

## 2. Multi-Specialty Coding Rules (Beyond Adult Medicine)

### Obstetrics (MDC 14)
- **PDx**: Use the obstetric complication or reason for admission (`O00`–`O99`), NOT `O80` when any delivery complication or intervention occurred.
- **Outcome of delivery (`Z37.-`)**: Always add as SDx on delivery admissions (single liveborn `Z37.0`, twins `Z37.2`, etc.).
- **Delivery / CS procedures**: Code mode of delivery (`73.59`, `74.0`–`74.99`, vacuum `72.7x`, forceps `72.0`–`72.4`) and episiotomy/repair (`73.6`, `75.69`) accurately; OR procedures require start/end datetime (MRA 4).
- **Maternal diseases complicating pregnancy (`O98`/`O99`)**: Pair with the specific disease code as SDx. **TS grouper gap**: `lib/tdrg` does not yet implement the `O98`/`O99` PDx swap of DC 1452 — note this and cross-check with `TGrp6305` CLI when applicable.

### Newborn / Neonatology (MDC 15, age < 28 days)
- **Admission weight is mandatory**: Missing or `< 0.3 kg` produces TDRG Error 10 (`DRG 26509`). Weight also directly partitions MDC 15 DCs.
- **Perinatal codes (`P00`–`P96`)**: Prefer P-codes for conditions originating in the perinatal period; check `agemin`/`agedmin` limits in `lookup.ts` (`ageduse = Y` codes fail for newborns).
- **Prematurity / Low birth weight (`P07.-`)**: Document gestational age and exact birth weight in grams.
- **RDS vs Respiratory failure**: Do not pair `P28.5` with `P22.0` (NHSO AI-Audit #7).
- **Neonatal jaundice (`P59.-`)**: Document bilirubin level and phototherapy (`99.83`) or exchange transfusion (`99.01`).

### Surgery, Orthopedics & Trauma (MDC 08, 21, 24)
- **Fracture specificity**: Always verify **open vs closed**, **exact bone & anatomical segment** (neck vs intertrochanteric vs shaft), **laterality**, and **Gustilo grade** (if open). Never guess open vs closed — query if unstated.
- **Multiple trauma (MDC 24)**: Requires trauma PDx + ≥ 2 distinct trauma body sites (by diagnosis or OR procedure). Do not collapse into `T07` ("Unspecified multiple injuries"); code each significant injury separately.
- **External cause (`V00`–`Y99`)**: Mandatory whenever PDx or SDx is `S00`–`T88`. Record in the **External cause** section of the summary, and **do NOT include `V`–`Y` in `sdx[]`** when calling the DRG grouper (TGrp rejects `V`–`Y` in `sdx[]` with Warning 1).
- **OR procedures & extensions**:
  - Record start and end date/time for every OR procedure (`orp = Y`, MRA 4).
  - For repeat or multi-site procedures (e.g. excisional debridement `86.22`), use the TDRG extension format `<code>+<units><setting>` such as `8622+21` (2 sites, 1st session) when documented.
- **Post-op respiratory insufficiency**: Distinguish `J95.1` (following **thoracic** surgery) vs `J95.2` (following **nonthoracic** surgery).

### Psychiatry & Substance Use
- **Alcohol**: Distinguish `Z72.1` (alcohol use), `Z71.4` (alcohol abuse counselling and surveillance — **not** `Z72.4`), and `F10.-` (harmful use / dependence / withdrawal).
- **Withdrawal seizure**: Do not add `R56.8` alongside `F10.3`/`F10.4` (NHSO AI-Audit #5).

---

## 3. Payer & Hospital-Level Context

| Payer | Typical Base Rate / Note | Audit Focus |
|---|---|---|
| **UC (บัตรทอง / สปสช.)** | ~8,350 บาท/AdjRW (in-zone IP, 2567–2569) | NHSO AI-Audit 18 rules, MRA 9+9 criteria, NHSO Regulation 2566 clause 12 |
| **SSS (ประกันสังคม)** | Varies by RW tier / SSO announcement | MRA & clinical evidence; state assumed rate explicitly |
| **CSMBS (ข้าราชการ / กรมบัญชีกลาง)** | Varies by hospital tier / CGD rate | Central Office for Healthcare Information (สกส.) audit rules & MRA; state assumed rate |
| **พรบ. / อื่นๆ** | Fee-for-service or contract rate | Clinical completeness & external cause documentation |

Always state which base rate is assumed in Part 2.4. If hospital level is known to be a community hospital level F, enforce NHSO AI-Audit #17 (`00.2*` IVUS) strictly.

---

## 4. Known TS Grouper Gaps (`lib/tdrg`)

`lib/tdrg` matches `TGrp6305` on ~99.9% of cases, with two coding-relevant gaps to flag in Part 2.4 when triggered:
1. **Dagger/asterisk (`†/*`) swap (Appendix A1)** is not implemented in `lib/tdrg`.
2. **`O98`/`O99` PDx swap in DC 1452** is not implemented in `lib/tdrg`.

When `check-rules.ts` reports `grouper_gaps`, keep the standard coding order (`†` as PDx, `*` as SDx) and note that exact reimbursement grouping should be verified against `TGrp6305` (`?source=compare-ts` or `node scripts/try-cases.ts`).
