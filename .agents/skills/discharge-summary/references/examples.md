# Golden Examples & Evaluation Cases

Use these examples to calibrate tone, mode selection, distinction between `"ไม่มี"` vs `"ไม่ระบุ"`, and rule-engine usage.

---

## Example 1 — Targeted Q&A / Audit Mode (DO NOT dump the full 86-line form)

**User prompt:**
> เคสผู้ป่วย COPD เดิม มาด้วยไข้ ไอมีเสมหะ CXR พบ RLL infiltration แพทย์เขียน CAP + COPD ควรให้ PDx อะไร แล้วถ้าเพิ่ม D62 แต่ไม่ได้ให้เลือด จะโดน audit ตัดไหม

**Expected response shape (concise, direct, verified):**
- **PDx ที่แนะนำ:** `J44.0` (*Chronic obstructive pulmonary disease with acute lower respiratory infection*) เป็น PDx และ `J18.1` (*Lobar pneumonia, unspecified* — หากแพทย์ยืนยัน lobar) หรือ `J18.9` (*Pneumonia, unspecified*) เป็น Comorbidity ตามแนวทาง coding ของไทยเมื่อ COPD เกิดร่วมกับ pneumonia
- **ประเด็น D62 ไม่ได้ให้เลือด:** 🟠 **เสี่ยงถูกตัดแน่นอน** — ตรงกับ **NHSO AI-Audit ข้อ 1** (`D62` โดยไม่มีรหัสการให้เลือด `99.03`–`99.07`) หากไม่ได้ให้เลือดให้ย้ายเป็น Other diagnosis หรือไม่ลงเป็นโรคร่วม (และห้ามระบุชนิด anemia จาก CBC เองถ้าแพทย์ไม่ได้วินิจฉัย)
- **ผลต่อ DRG (ตัวอย่างเทียบเมื่ออายุ 68 ปี ชาย นอน 4 วัน D/C approval):** รัน `group.ts` แสดงตารางเปรียบเทียบสั้นๆ `J44.0 + J18.9` vs `J18.9 + J44.9` vs `เพิ่ม D62 (เสี่ยงตัด)` พร้อม DRG / MDC / DC / PCL / AdjRW / บาท (ระบุอัตราฐาน 8,350 บาท/AdjRW)
- **สิ่งที่ต้องถามแพทย์:** ยืนยันว่า RLL infiltration เป็น lobar pneumonia หรือไม่ และยืนยันสาเหตุ/การรักษา anemia

---

## Example 2 — Full Draft Mode (Adult Medicine with Audit Trap + Under-coding)

**User input:**
> ชาย 72 ปี HN 1234567 นายสมชาย ใจดี สิทธิบัตรทอง Admit 10/01/2569 09:00 D/C 15/01/2569 14:00 (5 วัน) D/C improved, approval.
> Dx: UGIB, AKI, DM type 2, CKD.
> Hx/Exam: ถ่ายดำ 1 วัน BP 95/60 HR 110.
> Lab: Hb 7.2 → ให้ PRC 2 unit, Cr 1.1 → 2.4 ใน 24 ชม. (eGFR เดิม 40), FBS 180.
> EGD (11/01): Gastric ulcer with active bleeding (Forrest Ib), done adrenaline injection.
> Home med: Omeprazole 20 mg, Metformin (hold).

**Key behaviors expected in Full Draft Mode (`assets/form.md`):**
1. **Mask PII**: Redact `นายสมชาย ใจดี` / `HN 1234567` → `[ปิดบังเพื่อความเป็นส่วนตัว]` and note at the top of 2.5 (or alert) to avoid pasting real patient identifiers into external AI tools.
2. **Expand all abbreviations in Part 1**: Never write `UGIB`, `AKI`, `DM`, `CKD`, `EGD`, `PRC` in Part 1 diagnoses/procedures.
3. **Use `"ไม่ระบุ"` (not `"ไม่มี"`)** for missing administrative fields (โรงพยาบาล, แพทย์ผู้รักษา, หอผู้ป่วย) and `"ไม่มี"` for clinically absent fields (Complication, External cause, สถานพยาบาลที่ส่งต่อ, สาเหตุการตาย).
4. **Combined code + avoid NHSO AI-Audit #8**: Propose `K25.0` (*Gastric ulcer: acute with haemorrhage*) instead of `K92.1`/`K92.2` + `K25.9`; put `K92.2` in Table 2.2 ("ไม่เสนอให้ลงรหัส") citing NHSO AI-Audit #8.
5. **Under-coding suggestion (🔵)**: Hb 7.2 + PRC 2 units (`99.04`) → suggest querying physician whether to diagnose *Acute posthaemorrhagic anaemia* (`D62`), do NOT code `D62` autonomously.
6. **Specificity warning (🟠)**: `CKD` without stage (`N18.9`) despite baseline eGFR 40 → query physician for stage (likely Stage 3b `N18.3` if physician confirms). `AKI` → query acute renal failure (`N17.9`) vs prerenal azotemia (`R39.2`).
7. **Procedures verified via `lookup.ts`**: EGD with control of bleeding (`44.43`), packed red cell transfusion (`99.04`).
8. **Run `check-rules.ts` and `group.ts`** for Variant A (current confirmed) vs Variant B (+ `D62` + `N18.3` if physician confirms) with MDC / DC / DRG / PCL / AdjRW / Err-Warn / บาท.

---

## Example 3 — Trauma + External Cause + Extension Procedure

**Case snippet:**
> ชาย 28 ปี ขี่มอเตอร์ไซค์ล้มเองบนถนน แพทย์เขียน Open fracture right tibial shaft (Gustilo II), multiple abrasions. ทำ OR debridement 2 ตำแหน่ง (10/01 14:00–15:30) + ORIF tibia (11/01 09:00–11:00). นอน 6 วัน.

**Key behaviors expected:**
- Verify `S82.21` (open fracture shaft of tibia) via `lookup.ts` and check `dx_text ↔ dx_name` (open, shaft, tibia).
- Add External cause `V28.4` (or appropriate motorcycle noncollision code verified via `lookup.ts` — `is_external_cause: true`) in Part 1 **External cause** and Part 2.1 role `Ext`, and **do NOT pass `V28.4` in `sdx[]`** when calling `group.ts`.
- Verify debridement extension `86.22+21` via `lookup.ts` (base `8622` + extension `+21`), check OR start/end time present (MRA #4).
- Confirm `check-rules.ts` reports 0 hard stops and no missing external cause warning.

---

## Example 4 — Newborn (< 28 days)

**Case snippet:**
> ทารกชาย อายุ 2 วัน คลอดที่ GA 34 สัปดาห์ น้ำหนักแรกรับ (ไม่ระบุ) แพทย์เขียน RDS + neonatal respiratory failure, on CPAP 2 วัน.

**Key behaviors expected:**
- 🔴 **Hard stop (`TDRG-ERR-10`)** caught by `check-rules.ts`: ทารก < 28 วัน ไม่มีน้ำหนักแรกรับ — fill `น้ำหนักแรกรับ (ทารก < 28 วัน)` as `รอแพทย์ยืนยัน (บังคับ)` in Part 1 header.
- 🟠 **Warning (`NHSO-AUDIT-07`)** caught by `check-rules.ts`: `P28.5` paired with `P22.0` — put `P28.5` in Table 2.2 or raise warning to drop `P28.5`.
- Verify `P22.0`, `P07.3` (preterm) and `93.90` (non-invasive mechanical ventilation / CPAP) via `lookup.ts`.
- Group with `age: 0, age_day: 2` — show Error 10 (`DRG 26509`) without weight vs Variant B with assumed example weight (clearly labeled as illustrative pending chart weight).
