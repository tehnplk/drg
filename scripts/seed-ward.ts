// Seed the ward demo: 10 fictional inpatients due for discharge, their chart notes and an AI discharge-summary draft each.
// usage: node scripts/seed-ward.ts   (run `npm run import-tgrp` once before; stop `next dev` first, PGlite locks its folder)
// Every code in a draft must exist in icd10_desc / icd9_desc, and every variant must point at a code the draft has.
import { db } from "../lib/db.ts";
import type { Draft, Note, Patient } from "../lib/ward.ts";

type Seed = { patient: Patient; notes: [Note["at"], Note["kind"], string, string][]; draft: Draft };

const UC = "UC (บัตรทอง)";
const ASK = "แพทย์ผู้รักษา";

const SEEDS: Seed[] = [
  {
    patient: {
      an: "69-005101", hn: "0123456", name: "นางสมใจ (นามสมมติ)", sex: "2", age: 72, age_day: 0, weight: 54,
      ward: "อายุรกรรมหญิง", bed: "12", insurance: UC, attending: "นพ.ก.",
      working_dx: "Pneumococcal pneumonia with bacteremia",
      admit_at: "2026-11-05 21:40", discharge_at: "2026-11-11 11:00", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-05 21:40", "admission", "นพ.ก.", "CC: ไข้ ไอมีเสมหะ หอบเหนื่อย 3 วัน\nPI: ไข้สูง หนาวสั่น เสมหะสีสนิมเหล็ก เจ็บหน้าอกขวาเวลาหายใจลึก ปัสสาวะออกน้อยลง\nPH: DM type 2 10 ปี (metformin, glipizide; HbA1c 8.6%), HT 8 ปี (amlodipine), Cr 0.9 เมื่อ 3 เดือนก่อน\nPE: T 39.2, PR 118, RR 28, BP 86/50, SpO₂ 88% RA → 95% O₂ 3 LPM; crepitation และ bronchial breath sound ที่ RLL\nImpression: Severe CAP with septic shock?, AKI, hypokalemia, DM type 2, HT"],
      ["2026-11-05 22:00", "lab", "ER", "WBC 18,900 (N 89%), Hb 11.2, Plt 210,000; BUN/Cr 38/2.1; Na 134, K 2.9, HCO₃ 18; lactate 3.8\nABG (O₂ 3 LPM): pH 7.33, PaCO₂ 30, PaO₂ 72\nSputum gram stain: GPDC numerous; CXR: RLL consolidation with air bronchogram; hemoculture ส่ง 2 ขวด"],
      ["2026-11-05 22:30", "progress", "นพ.ก.", "ER: NSS 1,500 mL load → BP 104/62; ceftriaxone 2 g IV, azithromycin 500 mg IV; KCl 20 mEq IV"],
      ["2026-11-06 09:00", "progress", "นพ.ก.", "BP 110/70 ไม่ได้ใช้ vasopressor; urine 0.6 mL/kg/h; Cr 1.8, K 3.1\nA: Lobar pneumonia RLL with sepsis; AKI (prerenal จาก sepsis และขาดน้ำ); hypokalemia; DM type 2 poorly controlled; HT\nP: ceftriaxone + azithromycin, KCl elixir, hold metformin/glipizide/amlodipine, RI sliding scale"],
      ["2026-11-07 09:00", "progress", "นพ.ก.", "Cr 1.3, K 3.6; hemoculture prelim: GPC in pairs 1/2 ขวด\nA: Pneumococcal bacteremia?, pneumonia ดีขึ้น, AKI improving"],
      ["2026-11-08 08:00", "nursing", "พยาบาล", "แขนซ้ายบริเวณที่แทงน้ำเกลือบวมแดง ปวด (phlebitis grade 2) ถอดเข็ม ย้ายตำแหน่ง ประคบอุ่น รายงานแพทย์รับทราบ"],
      ["2026-11-08 09:00", "progress", "นพ.ก.", "Hemoculture final: Streptococcus pneumoniae 1/2 ขวด sensitive penicillin, ceftriaxone\nA: Pneumococcal pneumonia with bacteremia, sepsis resolved\nP: off azithromycin, off O₂"],
      ["2026-11-09 09:00", "progress", "นพ.ก.", "Hb 10.4 (hemodilution ไม่มีเลือดออก ไม่ต้องให้เลือด), Cr 1.0, K 3.9, HbA1c 9.4%\nA: AKI resolved, DM uncontrolled\nP: restart metformin, เริ่ม NPH 10 unit hs, สอนฉีดอินซูลิน"],
      ["2026-11-10 09:00", "progress", "นพ.ก.", "afebrile ≥ 48 ชม. switch ceftriaxone → amoxicillin 1 g tid ครบ 7 วัน plan D/C พรุ่งนี้"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Pneumococcal pneumonia, right lower lobe", code: "J13", status: "exact", evidence: "CXR RLL consolidation; hemoculture S. pneumoniae; sputum GPDC" },
        { type: "Comorbidity", text: "Pneumococcal sepsis", code: "A40.3", status: "exact", evidence: "hemoculture S. pneumoniae 1/2; T 39.2, PR 118, RR 28, WBC 18,900" },
        { type: "Comorbidity", text: "Acute kidney injury, prerenal", code: "N17.9", status: "ambiguous", evidence: "Cr 0.9 (baseline) → 2.1 → 1.0; urine 0.6 mL/kg/h" },
        { type: "Comorbidity", text: "Hypokalemia", code: "E87.6", status: "exact", evidence: "K 2.9; KCl IV และ oral" },
        { type: "Comorbidity", text: "Type 2 diabetes mellitus, poorly controlled", code: "E11.9", status: "exact", evidence: "HbA1c 9.4%; RI sliding scale; เริ่ม NPH" },
        { type: "Comorbidity", text: "Hypertension", code: "I10", status: "exact", evidence: "amlodipine; hold แล้วให้ต่อ" },
      ],
      summary: [
        "ไข้ ไอเสมหะสีสนิม หอบ 3 วัน แรกรับความดันต่ำและออกซิเจนต่ำ วินิจฉัยเมื่อจำหน่ายเป็น pneumococcal pneumonia with bacteremia",
        "CXR พบ RLL consolidation; hemoculture ขึ้น Streptococcus pneumoniae 1/2 ขวด; Cr สูงสุด 2.1 แล้วลดเหลือ 1.0; K 2.9; HbA1c 9.4%",
        "ให้สารน้ำ ceftriaxone และ azithromycin ความดันกลับมาปกติโดยไม่ใช้ vasopressor ไข้ลงในวันที่ 3 ไตกลับมาปกติ ให้โพแทสเซียมทดแทน และเริ่มอินซูลิน NPH",
        "นัด OPD อายุรกรรม 1 สัปดาห์ ถ่ายภาพรังสีทรวงอกซ้ำ 6 สัปดาห์ ส่งคลินิก NCD ปรับยาเบาหวาน ผู้ป่วยและญาติฉีดอินซูลินได้ถูกต้อง",
        "amoxicillin 1 g tid 1 วัน; metformin 500 mg bid; NPH 10 unit hs; amlodipine 5 mg OD",
      ],
      notCoded: [
        { finding: "Septic shock", code: "R57.2", reason: "ความดันกลับมาปกติหลังให้สารน้ำ ไม่ได้ใช้ vasopressor" },
        { finding: "Respiratory failure", code: "J96.0", reason: "ไม่ได้ใส่เครื่องช่วยหายใจ (AI-Audit ข้อ 6)" },
        { finding: "Metabolic acidosis", code: "E87.2", reason: "เป็นอาการของ sepsis (AI-Audit ข้อ 4)" },
        { finding: "Anemia", code: "D64.9", reason: "แพทย์ระบุว่าเป็น hemodilution ไม่ได้ให้เลือด" },
      ],
      alerts: [
        { level: "warn", text: "แพทย์เขียนทั้ง AKI และ prerenal ต้องระบุว่าเป็น acute renal failure (N17.9) หรือ prerenal azotemia (R39.2) เพราะรหัสและน้ำหนักต่างกัน" },
        { level: "warn", text: "Phlebitis บริเวณที่ให้สารน้ำ (8 พ.ย.) มีเฉพาะบันทึกพยาบาล แพทย์ยังไม่ได้วินิจฉัย จึงลงรหัสไม่ได้จนกว่าแพทย์ยืนยัน" },
        { level: "suggest", text: "Sepsis มีหลักฐานอวัยวะทำงานผิดปกติ (lactate 3.8, BP 86/50 ก่อนให้สารน้ำ, AKI, SpO₂ 88%) แต่แพทย์ไม่ได้ระบุความรุนแรง" },
      ],
      variants: [
        { label: "ภาวะไตเป็น prerenal azotemia", change: { swap: { "N17.9": "R39.2" } }, to: ASK,
          question: "ภาวะไตครั้งนี้วินิจฉัยเป็นแบบใด (acute kidney injury / prerenal azotemia / อื่น ๆ / ระบุไม่ได้)" },
        { label: "Sepsis with organ failure", change: { add: ["R65.1"] }, to: ASK,
          question: "Sepsis ครั้งนี้มีอวัยวะทำงานล้มเหลวร่วมด้วยหรือไม่ ถ้ามี อวัยวะใด (ไม่มี / มี โปรดระบุ / ระบุไม่ได้)" },
        { label: "Phlebitis จากการให้สารน้ำ", change: { add: ["T80.1"] }, to: ASK,
          question: "บันทึกพยาบาล 8 พ.ย. พบแขนซ้ายบวมแดงบริเวณที่แทงน้ำเกลือ แพทย์วินิจฉัยว่าอย่างไร (phlebitis จากการให้สารน้ำ / อื่น ๆ / ไม่ใช่ภาวะที่ต้องสรุป)" },
      ],
    },
  },
  {
    patient: {
      an: "69-005102", hn: "0098765", name: "นายสมชาย (นามสมมติ)", sex: "1", age: 55, age_day: 0, weight: 62,
      ward: "ศัลยกรรมชาย", bed: "5", insurance: UC, attending: "นพ.ข.",
      working_dx: "Bleeding gastric ulcer s/p endoscopic hemostasis",
      admit_at: "2026-11-06 02:15", discharge_at: "2026-11-11 14:00", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-06 02:15", "admission", "พญ.ค.", "CC: อาเจียนเป็นเลือด 2 ครั้ง ถ่ายดำ 1 วัน\nPI: กิน ibuprofen 400 mg tid ที่ซื้อเองมา 2 สัปดาห์\nPH: alcoholic cirrhosis Child-Pugh B, small esophageal varices (EGD 2567), anti-HCV positive ยังไม่ได้รักษา, ดื่มสุราขาว 1 ขวด/วัน 20 ปี ดื่มล่าสุด 2 วันก่อน, สูบบุหรี่ 10 มวน/วัน\nPE: PR 112, BP 92/58, pale, mild jaundice, shifting dullness positive, spleen tip palpable, PR: melena\nImpression: UGIB suspected variceal bleeding, alcoholic cirrhosis Child B, anemia from blood loss"],
      ["2026-11-06 02:30", "lab", "ER", "Hb 6.8, MCV 101, Plt 98,000; INR 1.6; Alb 2.6, TB 2.8; BUN/Cr 48/1.1; Na 129"],
      ["2026-11-06 05:30", "nursing", "พยาบาล", "ให้ PRC unit ที่ 1 (03:00) และ unit ที่ 2 (05:30) ไม่มีปฏิกิริยา"],
      ["2026-11-06 10:30", "procedure", "นพ.ข.", "EGD (ห้องส่องกล้อง 10:30–11:05 น., IV sedation): small esophageal varices F1 no red color sign; gastric ulcer 1.5 cm lesser curvature antrum, non-bleeding visible vessel (Forrest IIa); mild portal hypertensive gastropathy\nIntervention: epinephrine injection 8 mL + hemoclip 2 clips, hemostasis achieved; CLO test positive\nPost-EGD diagnosis: bleeding gastric ulcer (Forrest IIa) s/p endoscopic hemostasis; small esophageal varices without bleeding"],
      ["2026-11-06 14:00", "progress", "นพ.ข.", "A: Non-variceal UGIB จาก gastric ulcer (NSAID + H. pylori), alcoholic cirrhosis\nP: off octreotide, pantoprazole 8 mg/h 72 ชม., ceftriaxone ครบ 5 วัน, off NSAID"],
      ["2026-11-07 09:00", "progress", "พญ.ค.", "มือสั่น เหงื่อออก นอนไม่หลับ CIWA-Ar 14; Hb 7.8 → PRC 1 unit → 8.9\nA: bleeding gastric ulcer no rebleeding; alcohol withdrawal (mild–moderate); anemia from acute blood loss\nP: lorazepam prn, thiamine, folic acid"],
      ["2026-11-07 15:00", "nursing", "พยาบาล", "ให้ PRC unit ที่ 3 ระหว่างให้มีผื่นลมพิษที่แขน คัน หยุดให้เลือดชั่วคราว รายงานแพทย์ ให้ CPM 10 mg IV ผื่นยุบ ให้เลือดต่อจนหมด"],
      ["2026-11-08 09:00", "progress", "พญ.ค.", "กลางคืนสับสน ไม่รู้วันเวลา, asterixis positive, ไม่ถ่าย 24 ชม.; Na 127\nA: hepatic encephalopathy grade 2 precipitated by GI bleeding และ constipation; hyponatremia จาก cirrhosis; alcohol withdrawal ดีขึ้น\nP: lactulose, fluid restriction 1,000 mL/วัน"],
      ["2026-11-09 09:00", "progress", "นพ.ข.", "รู้ตัวดี ถ่าย 3 ครั้ง; US: coarse liver, nodular surface, splenomegaly 14 cm, mild ascites\nA: HE resolved, gastric ulcer stable, cirrhosis with ascites\nP: H. pylori eradication 14 วัน, spironolactone + furosemide, ไม่ได้เจาะท้อง (ascites น้อย)"],
      ["2026-11-11 09:00", "progress", "นพ.ข.", "alert, no melena, Hb 9.4, Na 132\nP: D/C, F/U 2 สัปดาห์, EGD ซ้ำ 8 สัปดาห์, ส่งคลินิกเลิกสุรา, ส่งอายุรแพทย์ประเมิน HCV, งด NSAID"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Bleeding gastric ulcer (Forrest IIa)", code: "K25.4", status: "exact", evidence: "EGD: gastric ulcer with visible vessel; hematemesis, melena; Hb 6.8" },
        { type: "Comorbidity", text: "Alcoholic cirrhosis", code: "K70.3", status: "exact", evidence: "ประวัติ Child-Pugh B; US nodular liver, splenomegaly" },
        { type: "Comorbidity", text: "Esophageal varices without bleeding", code: "I98.2", status: "exact", evidence: "EGD: small varices F1, no stigmata of bleeding (คู่กับ K70.3)" },
        { type: "Comorbidity", text: "Anemia from acute blood loss", code: "D62", status: "exact", evidence: "Hb 6.8; PRC รวม 3 units" },
        { type: "Comorbidity", text: "Alcohol withdrawal", code: "F10.3", status: "exact", evidence: "CIWA-Ar 14; lorazepam" },
        { type: "Complication", text: "Hepatic encephalopathy grade 2", code: "K72.9", status: "less", evidence: "disoriented, asterixis positive; lactulose" },
        { type: "Comorbidity", text: "Hyponatremia", code: "E87.1", status: "exact", evidence: "Na 129 → 127; fluid restriction" },
        { type: "Other diagnosis", text: "Helicobacter pylori infection", code: "B98.0", status: "exact", evidence: "CLO test positive; eradication therapy" },
        { type: "External cause", text: "Adverse effect of ibuprofen", code: "Y45.2", status: "exact", evidence: "ibuprofen 400 mg tid 2 สัปดาห์; แพทย์ระบุ NSAID เป็นสาเหตุ" },
        { type: "Non-OR procedure", text: "Endoscopic control of gastric bleeding (epinephrine injection, hemoclip)", code: "44.43", status: "exact", evidence: "procedure note", when: "6 พ.ย. 10:30–11:05" },
        { type: "Non-OR procedure", text: "Transfusion of packed red cells 3 units", code: "99.04", status: "exact", evidence: "บันทึกการให้เลือด", when: "6–7 พ.ย." },
      ],
      summary: [
        "อาเจียนเป็นเลือดและถ่ายดำหลังกิน ibuprofen 2 สัปดาห์ ในผู้ป่วย alcoholic cirrhosis วินิจฉัยเมื่อจำหน่ายเป็น bleeding gastric ulcer จาก NSAID และ H. pylori",
        "Hb แรกรับ 6.8; EGD พบ gastric ulcer มี visible vessel และ varices ขนาดเล็กไม่มีเลือดออก; CLO test บวก; อัลตราซาวด์พบตับแข็ง ม้ามโต น้ำในท้องเล็กน้อย",
        "ห้ามเลือดทางกล้องด้วย epinephrine และ hemoclip ให้เลือด 3 units ไม่มีเลือดออกซ้ำ ระหว่างนอนมีอาการถอนสุราและ hepatic encephalopathy ซึ่งดีขึ้นด้วย lorazepam และ lactulose",
        "นัด 2 สัปดาห์ตรวจ CBC, electrolytes, LFT; ส่องกล้องซ้ำ 8 สัปดาห์; ส่งคลินิกเลิกสุรา; ส่งอายุรแพทย์ประเมิน HCV; งดยาแก้ปวดกลุ่ม NSAID",
        "amoxicillin; clarithromycin; pantoprazole; spironolactone 100 mg; furosemide 40 mg; lactulose 30 mL bid; propranolol 10 mg bid; folic acid; vitamin B1",
      ],
      notCoded: [
        { finding: "Ascites", code: "R18", reason: "ไม่ได้เจาะท้อง (AI-Audit ข้อ 15)" },
        { finding: "Thrombocytopenia", code: "D69.6", reason: "พบใน cirrhosis ที่ม้ามโต (AI-Audit ข้อ 2)" },
        { finding: "GI hemorrhage", code: "K92.2", reason: "ซ้ำกับ K25.4 ที่ระบุ with haemorrhage แล้ว (AI-Audit ข้อ 8)" },
        { finding: "Anti-HCV positive", code: "B18.2", reason: "ยังไม่มีการวินิจฉัย chronic hepatitis C และไม่ได้รักษาครั้งนี้" },
      ],
      alerts: [
        { level: "warn", text: "วันที่ 10 พ.ย. ไม่มี progress note มีเฉพาะ order ให้การรักษาเดิม (MRA progress note)" },
        { level: "warn", text: "ผื่นลมพิษระหว่างให้ PRC unit ที่ 3 มีเฉพาะบันทึกพยาบาล แพทย์ยังไม่ได้วินิจฉัย" },
        { level: "suggest", text: "Hepatic encephalopathy: แพทย์ไม่ได้ระบุสาเหตุ รหัส K72.9 จึงกว้างกว่าบริบทใน chart ที่เป็น alcoholic cirrhosis" },
      ],
      variants: [
        { label: "Alcoholic hepatic failure", change: { swap: { "K72.9": "K70.4" } }, to: ASK,
          question: "Hepatic encephalopathy ครั้งนี้มีสาเหตุจากอะไร (alcoholic liver disease / สาเหตุอื่น / ระบุไม่ได้)" },
        { label: "Transfusion reaction", change: { add: ["T80.8"] }, to: ASK,
          question: "บันทึกพยาบาล 7 พ.ย. 15:00 มีผื่นลมพิษระหว่างให้เลือด แพทย์วินิจฉัยว่าอย่างไร (transfusion reaction / อื่น ๆ / ไม่ใช่ภาวะที่ต้องสรุป)" },
      ],
    },
  },
  {
    patient: {
      an: "69-005103", hn: "0154321", name: "นางบุญมา (นามสมมติ)", sex: "2", age: 81, age_day: 0, weight: 45,
      ward: "ศัลยกรรมกระดูกหญิง", bed: "3", insurance: UC, attending: "นพ.ง.",
      working_dx: "Closed intertrochanteric fracture right femur s/p PFNA",
      admit_at: "2026-11-02 18:20", discharge_at: "2026-11-11 10:30", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-02 18:20", "admission", "นพ.ง.", "CC: ลื่นล้มในห้องน้ำที่บ้าน ปวดสะโพกขวา ลุกยืนไม่ได้ 4 ชม.\nPH: AF 5 ปี (warfarin 3 mg, digoxin), HT (enalapril), CKD stage 3b (eGFR 38), osteoporosis เคยข้อมือหัก\nPE: right leg shortening, external rotation; แผลถลอกข้อศอกขวา 2×3 cm; sacrum มีรอยแดงไม่จางเมื่อกด 3×4 cm\nLab: INR 3.1, Hb 10.9, Cr 1.5 (eGFR 32); film: right intertrochanteric fracture, comminuted (AO 31-A2)\nImpression: Closed fracture intertrochanteric right femur, AF on warfarin with INR 3.1, HT, CKD stage 3b, osteoporosis"],
      ["2026-11-02 19:00", "nursing", "พยาบาล", "Braden 13 พบรอยแดงที่ sacrum 3×4 cm ไม่จางเมื่อกด (pressure injury stage 1) จัดที่นอนลม พลิกตะแคงทุก 2 ชม.; skin traction ขวา 3 kg"],
      ["2026-11-03 09:00", "progress", "นพ.ง.", "INR 1.9 → vitamin K 1 mg IV ซ้ำ; consult อายุรกรรม: ผ่าตัดได้เมื่อ INR ≤ 1.5 แล้ว bridge enoxaparin กลับ warfarin; 16:00 INR 1.4 set OR"],
      ["2026-11-04 09:10", "procedure", "นพ.ง.", "Operative note 09:10–10:40 น. (spinal anesthesia): closed reduction and internal fixation with PFNA right femur under fluoroscopy; EBL 350 mL; ใส่ Foley catheter ในห้องผ่าตัด"],
      ["2026-11-04 18:00", "progress", "นพ.ง.", "Hb 8.6 → PRC 1 unit\nP: cefazolin 24 ชม., enoxaparin 30 mg sc OD เริ่มพรุ่งนี้"],
      ["2026-11-05 09:00", "progress", "นพ.ง.", "Hb 9.3, Cr 1.6\nA: post-op day 1, anemia จากการเสียเลือดหลังผ่าตัด\nP: เริ่ม warfarin, กายภาพบำบัด, calcium + vitamin D2"],
      ["2026-11-06 09:00", "progress", "นพ.ง.", "T 38.3, กลางคืนสับสน CAM positive, ปัสสาวะขุ่น; WBC 14,200; UA WBC > 50/HPF, nitrite pos\nA: catheter-associated UTI (CAUTI); post-op delirium จาก infection และ opioid\nP: off Foley, urine culture, ceftriaxone, off morphine, haloperidol prn"],
      ["2026-11-06 14:00", "nursing", "พยาบาล", "ส้นเท้าขวามีรอยแดงไม่จางเมื่อกด 2×2 cm ใช้หมอนรองน่องยกส้นเท้าลอย รายงานแพทย์"],
      ["2026-11-08 09:00", "progress", "นพ.ง.", "afebrile, CAM negative; urine culture E. coli > 10⁵ CFU/mL sensitive ceftriaxone, ciprofloxacin\nA: CAUTI ดีขึ้น, delirium resolved\nP: switch to ciprofloxacin 250 mg bid ครบ 7 วัน"],
      ["2026-11-10 09:00", "progress", "นพ.ง.", "เดินด้วย walker 10 เมตร, INR 2.3, Hb 9.8, Cr 1.4; แผลกดทับ sacrum ยังเป็นรอยแดง ผิวหนังไม่ฉีกขาด; off enoxaparin, plan D/C พรุ่งนี้"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Closed unstable intertrochanteric fracture, right femur", code: "S72.10", status: "exact", evidence: "film: comminuted intertrochanteric fracture" },
        { type: "External cause", text: "ลื่นล้มในห้องน้ำที่บ้าน", code: "W01.0", status: "exact", evidence: "ประวัติแรกรับ" },
        { type: "Comorbidity", text: "Atrial fibrillation", code: "I48.9", status: "exact", evidence: "EKG AF; warfarin, digoxin" },
        { type: "Other diagnosis", text: "Long-term use of warfarin", code: "Z92.1", status: "exact", evidence: "INR 3.1 แก้ด้วย vitamin K ก่อนผ่าตัด" },
        { type: "Comorbidity", text: "Hypertension", code: "I10", status: "exact", evidence: "enalapril" },
        { type: "Comorbidity", text: "Chronic kidney disease stage 3b", code: "N18.3", status: "exact", evidence: "eGFR 32–38; ปรับขนาดยาตามไต" },
        { type: "Comorbidity", text: "Osteoporosis", code: "M81.9", status: "exact", evidence: "เคยข้อมือหัก; เริ่ม calcium + vitamin D" },
        { type: "Other diagnosis", text: "Abrasion, right elbow", code: "S50.8", status: "partial", evidence: "ทำแผล; ชื่อรหัสระบุ forearm ซึ่งเป็นหมวดเดียวกับ elbow" },
        { type: "Complication", text: "Anemia from postoperative blood loss", code: "D62", status: "exact", evidence: "EBL 350 mL; Hb 8.6 → PRC 1 unit" },
        { type: "Complication", text: "Catheter-associated urinary tract infection", code: "T83.5", status: "exact", evidence: "Foley 4–6 พ.ย.; UA WBC > 50, nitrite pos" },
        { type: "Complication", text: "Urinary tract infection", code: "N39.0", status: "exact", evidence: "ไข้ 38.3; ceftriaxone → ciprofloxacin" },
        { type: "Complication", text: "Escherichia coli", code: "B96.2", status: "exact", evidence: "urine culture E. coli > 10⁵ CFU/mL" },
        { type: "External cause", text: "Complication of urinary catheterization", code: "Y84.6", status: "exact", evidence: "CAUTI ตามบันทึกแพทย์" },
        { type: "Complication", text: "Postoperative delirium", code: "F05.8", status: "exact", evidence: "CAM positive; haloperidol prn" },
        { type: "Comorbidity", text: "Pressure ulcer, sacrum", code: "L89.9", status: "exact", evidence: "รอยแดงไม่จางเมื่อกด 3×4 cm ตั้งแต่แรกรับ; ที่นอนลม" },
        { type: "OR procedure", text: "Closed reduction and internal fixation with PFNA, right femur", code: "79.15", status: "exact", evidence: "operative note", when: "4 พ.ย. 09:10–10:40" },
        { type: "Non-OR procedure", text: "Transfusion of packed red cells 1 unit", code: "99.04", status: "exact", evidence: "บันทึกการให้เลือด", when: "4 พ.ย." },
        { type: "Non-OR procedure", text: "Skin traction, right leg", code: "93.46", status: "exact", evidence: "order", when: "2–4 พ.ย." },
        { type: "Non-OR procedure", text: "Indwelling urinary catheter", code: "57.94", status: "exact", evidence: "operative note", when: "4 พ.ย." },
      ],
      summary: [
        "ลื่นล้มในห้องน้ำ ปวดสะโพกขวา ลุกยืนไม่ได้ วินิจฉัยเมื่อจำหน่ายเป็น closed unstable intertrochanteric fracture right femur",
        "ภาพรังสีพบ comminuted intertrochanteric fracture; INR แรกรับ 3.1; Hb ต่ำสุด 8.6 หลังผ่าตัด; urine culture ขึ้น E. coli",
        "แก้ INR ด้วย vitamin K แล้วผ่าตัด PFNA ให้เลือด 1 unit หลังผ่าตัดเกิด CAUTI และ delirium รักษาด้วยยาปฏิชีวนะและหยุด opioid จนหาย เดินด้วย walker ได้",
        "นัด OPD ออร์โธ 2 สัปดาห์ ตัดไหมและถ่ายภาพรังสี; ตรวจ INR ที่ รพ.สต. 1 สัปดาห์; กายภาพที่บ้าน; ส่งคลินิก osteoporosis",
        "ciprofloxacin 250 mg bid 3 วัน; warfarin 3 mg OD; digoxin 0.125 mg OD; enalapril 5 mg OD; paracetamol 500 mg prn; calcium carbonate 1,000 mg OD; vitamin D2 20,000 IU สัปดาห์ละครั้ง",
      ],
      notCoded: [
        { finding: "INR 3.1 จาก warfarin", code: "D68.3", reason: "ไม่มีเลือดออก รหัสนี้ใช้กับภาวะเลือดออกจากยาต้านการแข็งตัวของเลือด" },
        { finding: "ไข้ 38.3", code: "R50.9", reason: "เป็นอาการของ CAUTI" },
        { finding: "รอยแดงที่ส้นเท้าขวา", code: "L89.0", reason: "มีเฉพาะบันทึกพยาบาล แพทย์ไม่ได้บันทึก" },
      ],
      alerts: [
        { level: "warn", text: "วันที่ 9 พ.ย. ไม่มี progress note มีเฉพาะ order ให้การรักษาเดิม (MRA progress note)" },
        { level: "warn", text: "แผลกดทับที่ sacrum แพทย์ไม่ได้ระบุระยะ (พยาบาลประเมิน stage 1) และรอยแดงที่ส้นเท้าขวามีเฉพาะบันทึกพยาบาล" },
        { level: "suggest", text: "SDx ครบ 12 รหัส ซึ่งเป็นจำนวนสูงสุดที่ grouper รับ ถ้าต้องเพิ่มรหัสต้องจัดลำดับความสำคัญใหม่" },
      ],
      variants: [
        { label: "แผลกดทับ stage 1", change: { swap: { "L89.9": "L89.0" } }, to: ASK,
          question: "แผลกดทับที่ sacrum และรอยแดงที่ส้นเท้าขวา (บันทึกพยาบาล 6 พ.ย.) เป็นระยะใด (stage 1 / stage อื่น / ระบุไม่ได้)" },
      ],
    },
  },
  {
    patient: {
      an: "69-005104", hn: "0187234", name: "นายธนา (นามสมมติ)", sex: "1", age: 34, age_day: 0, weight: 68,
      ward: "อายุรกรรมชาย", bed: "8", insurance: UC, attending: "พญ.ฉ.",
      working_dx: "Dengue hemorrhagic fever grade II",
      admit_at: "2026-11-07 15:30", discharge_at: "2026-11-11 10:00", leave_days: 0,
      discharge_status: "Complete recovery", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-07 15:30", "admission", "พญ.ฉ.", "CC: ไข้สูง 3 วัน\nPI: ปวดศีรษะ ปวดกล้ามเนื้อ มีจุดเลือดออกที่แขน เลือดกำเดาไหล 1 ครั้ง\nPE: T 38.8, PR 96, BP 118/76, tourniquet test positive, liver 2 cm below RCM\nLab: NS1 Ag positive; Hct 44%, Plt 62,000, WBC 2,800\nImpression: Dengue infection, febrile phase"],
      ["2026-11-08 09:00", "progress", "พญ.ฉ.", "Hct 48%, Plt 28,000, ปวดท้อง เหนื่อยเล็กน้อย\nA: DHF grade II, critical phase\nP: IV fluid ตาม Hct, vital signs q1h"],
      ["2026-11-09 09:00", "progress", "พญ.ฉ.", "Hct 51% → ปรับ IV, Plt 18,000, AST 312, ALT 140, ไม่มีเลือดออกเพิ่ม; US: right pleural effusion เล็กน้อย, ascites เล็กน้อย\nA: DHF grade II with plasma leakage"],
      ["2026-11-10 09:00", "progress", "พญ.ฉ.", "convalescent phase, Hct 42%, Plt 46,000, ปัสสาวะออกดี, หยุด IV, มี convalescent rash"],
      ["2026-11-11 08:00", "progress", "พญ.ฉ.", "Plt 88,000, ไม่มีไข้ 48 ชม., กินได้ดี; D/C"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Dengue hemorrhagic fever grade II", code: "A91", status: "exact", evidence: "NS1 Ag positive; Hct 44 → 51%; Plt 18,000; pleural effusion; epistaxis" },
      ],
      summary: [
        "ไข้สูง 3 วัน มีจุดเลือดออกและเลือดกำเดา วินิจฉัยเมื่อจำหน่ายเป็น dengue hemorrhagic fever grade II",
        "NS1 Ag บวก; Hct สูงสุด 51% (เพิ่มจาก 44%); เกล็ดเลือดต่ำสุด 18,000; อัลตราซาวด์พบน้ำในช่องเยื่อหุ้มปอดขวาและช่องท้องเล็กน้อย",
        "ให้สารน้ำตามระดับ Hct ในระยะวิกฤต ไม่มีภาวะช็อกหรือเลือดออกรุนแรง เข้าสู่ระยะฟื้นตัวในวันที่ 4 หยุดสารน้ำได้",
        "งดยากลุ่ม NSAID และ aspirin; ดื่มน้ำมาก ๆ; สังเกตอาการเลือดออก; นัดตรวจ CBC ที่ OPD 3 วัน",
        "paracetamol 500 mg prn ไข้",
      ],
      notCoded: [
        { finding: "Thrombocytopenia", code: "D69.6", reason: "เป็นส่วนหนึ่งของ DHF" },
        { finding: "Transaminitis", code: "R74.0", reason: "เป็นส่วนหนึ่งของ DHF" },
        { finding: "Pleural effusion และ ascites", code: "J90", reason: "เป็นการรั่วของพลาสมาใน DHF ไม่ได้เจาะระบาย" },
      ],
      alerts: [],
      variants: [],
    },
  },
  {
    patient: {
      an: "69-005105", hn: "0076512", name: "นางประนอม (นามสมมติ)", sex: "2", age: 66, age_day: 0, weight: 71,
      ward: "อายุรกรรมหญิง", bed: "15", insurance: UC, attending: "นพ.ช.",
      working_dx: "Acute decompensated heart failure, CKD stage 4",
      admit_at: "2026-11-06 19:00", discharge_at: "2026-11-11 13:00", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-06 19:00", "admission", "นพ.ช.", "CC: หอบเหนื่อย นอนราบไม่ได้ 3 วัน ขาบวม\nPH: DM type 2 with diabetic nephropathy, CKD stage 4 (eGFR 22), HT\nPE: BP 168/94, PR 104, RR 28, SpO₂ 89% RA, JVP raised, crepitation both lungs, pitting edema 3+\nLab: Cr 2.1 (baseline 2.0), K 3.6, NT-proBNP 2,850, Hb 9.8; CXR: cardiomegaly, pulmonary congestion, bilateral pleural effusion; Echo: LVEF 35%\nImpression: Acute decompensated CHF, CKD stage 4, DM type 2, HT"],
      ["2026-11-07 09:00", "progress", "นพ.ช.", "furosemide 80 mg IV bid; Cr 2.4, K 3.1 → KCl oral\nA: CHF, hypokalemia จาก diuretic"],
      ["2026-11-08 09:00", "progress", "นพ.ช.", "Cr 2.6, urine 1,800 mL/วัน, น้ำหนักลด 2 kg\nA: CHF improving, Cr ขึ้นจากการให้ยาขับปัสสาวะ\nP: ลดขนาด furosemide"],
      ["2026-11-09 09:00", "progress", "นพ.ช.", "Cr 2.3, K 3.8, SpO₂ 96% RA, เดินได้"],
      ["2026-11-10 09:00", "progress", "นพ.ช.", "Cr 2.1; hold enalapril, เพิ่ม carvedilol; plan D/C พรุ่งนี้"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Congestive heart failure", code: "I50.0", status: "exact", evidence: "orthopnea, JVP raised, crepitation; NT-proBNP 2,850; CXR congestion; LVEF 35%" },
        { type: "Comorbidity", text: "Type 2 diabetes mellitus with diabetic nephropathy", code: "E11.2", status: "exact", evidence: "ประวัติ; คู่กับ N08.3" },
        { type: "Comorbidity", text: "Diabetic nephropathy", code: "N08.3", status: "exact", evidence: "ประวัติ CKD จากเบาหวาน" },
        { type: "Comorbidity", text: "Chronic kidney disease stage 4", code: "N18.4", status: "exact", evidence: "eGFR 22" },
        { type: "Complication", text: "Hypokalemia from diuretic", code: "E87.6", status: "exact", evidence: "K 3.1; KCl oral" },
        { type: "External cause", text: "Adverse effect of furosemide", code: "Y54.4", status: "exact", evidence: "แพทย์ระบุว่า hypokalemia จาก diuretic" },
        { type: "Comorbidity", text: "Hypertension", code: "I10", status: "exact", evidence: "BP 168/94; ปรับยาลดความดัน" },
      ],
      summary: [
        "หอบเหนื่อย นอนราบไม่ได้ ขาบวม 3 วัน วินิจฉัยเมื่อจำหน่ายเป็น congestive heart failure ในผู้ป่วย CKD stage 4",
        "CXR พบหัวใจโตและน้ำคั่งในปอด; LVEF 35%; NT-proBNP 2,850; Cr 2.1 → 2.6 → 2.1; K ต่ำสุด 3.1",
        "ให้ furosemide ทางหลอดเลือด ปัสสาวะออกดี น้ำหนักลด 2 kg ให้โพแทสเซียมทดแทน ปรับยาหัวใจและหยุด enalapril",
        "จำกัดน้ำและเกลือ ชั่งน้ำหนักทุกวัน นัด OPD อายุรกรรม 1 สัปดาห์ ตรวจ Cr และ K; นัดคลินิกโรคไต",
        "furosemide 40 mg OD; carvedilol 6.25 mg bid; amlodipine 10 mg OD; insulin glargine 12 unit hs; KCl elixir 15 mL OD",
      ],
      notCoded: [
        { finding: "Pulmonary congestion, pleural effusion", code: "J81", reason: "รวมอยู่ใน congestive heart failure แล้ว" },
        { finding: "Anemia Hb 9.8", code: "D64.9", reason: "แพทย์ไม่ได้วินิจฉัย ไม่ได้ให้เลือดหรือ EPO" },
      ],
      alerts: [
        { level: "suggest", text: "Cr เพิ่มจาก 2.1 เป็น 2.6 ภายใน 48 ชม. (≥ 0.3 mg/dL) แต่แพทย์ไม่ได้วินิจฉัย AKI" },
      ],
      variants: [
        { label: "AKI on CKD stage 4", change: { add: ["N17.9"] }, to: ASK,
          question: "Cr เพิ่มจาก 2.1 เป็น 2.6 ใน 48 ชม. ระหว่างให้ยาขับปัสสาวะ แพทย์ประเมินภาวะนี้ว่าอย่างไร (acute kidney injury / การเปลี่ยนแปลงจากยาที่ไม่ถึงเกณฑ์ AKI / อื่น ๆ / ระบุไม่ได้)" },
      ],
    },
  },
  {
    patient: {
      an: "69-005106", hn: "0045678", name: "นายสมบัติ (นามสมมติ)", sex: "1", age: 68, age_day: 0, weight: 52,
      ward: "ICU อายุรกรรม", bed: "ICU-2", insurance: UC, attending: "นพ.ซ.",
      working_dx: "COPD with acute exacerbation, acute hypercapnic respiratory failure",
      admit_at: "2026-11-05 08:30", discharge_at: "2026-11-11 11:00", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-05 08:30", "admission", "นพ.ซ.", "CC: หอบเหนื่อยมากขึ้น 2 วัน เสมหะเพิ่ม\nPH: COPD 8 ปี (spirometry FEV1/FVC 0.52), สูบบุหรี่ 40 pack-years ยังสูบอยู่\nPE: RR 34, SpO₂ 82% RA, use of accessory muscles, wheeze both lungs, drowsy\nABG: pH 7.24, PaCO₂ 72, PaO₂ 50; CXR: hyperinflation, no infiltration\nImpression: COPD with acute exacerbation, acute hypercapnic respiratory failure"],
      ["2026-11-05 08:50", "procedure", "นพ.ซ.", "Endotracheal intubation 08:50 น. เริ่ม continuous mechanical ventilation"],
      ["2026-11-06 09:00", "progress", "นพ.ซ.", "on ventilator, ABG pH 7.34, PaCO₂ 54; nebulized bronchodilator, methylprednisolone, ceftriaxone"],
      ["2026-11-07 13:00", "procedure", "นพ.ซ.", "Extubation 13:00 น. (ใช้เครื่องช่วยหายใจรวม 52 ชั่วโมง) ต่อ O₂ cannula 2 LPM"],
      ["2026-11-08 09:00", "progress", "นพ.ซ.", "SpO₂ 93% O₂ 2 LPM, wheeze ลดลง, ย้ายออกจาก ICU"],
      ["2026-11-09 10:00", "nursing", "พยาบาล", "แนะนำเลิกบุหรี่ ผู้ป่วยรับฟัง ยังไม่ได้ประเมิน Fagerström"],
      ["2026-11-10 09:00", "progress", "นพ.ซ.", "SpO₂ 92% RA, เดินในหอผู้ป่วยได้, สอนพ่นยา; plan D/C พรุ่งนี้"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "COPD with acute exacerbation", code: "J44.1", status: "exact", evidence: "dyspnea, sputum เพิ่ม, wheeze; spirometry FEV1/FVC 0.52" },
        { type: "Comorbidity", text: "Acute hypercapnic respiratory failure", code: "J96.0", status: "exact", evidence: "ABG PaCO₂ 72, PaO₂ 50; drowsy; intubated" },
        { type: "Non-OR procedure", text: "Endotracheal intubation", code: "96.04", status: "exact", evidence: "procedure note", when: "5 พ.ย. 08:50" },
        { type: "Non-OR procedure", text: "Continuous mechanical ventilation 52 hours", code: "96.71", status: "exact", evidence: "เวลาใส่และถอดท่อครบ", when: "5 พ.ย. 08:50 – 7 พ.ย. 13:00" },
      ],
      summary: [
        "หอบเหนื่อยและเสมหะเพิ่ม 2 วัน ซึม วินิจฉัยเมื่อจำหน่ายเป็น COPD with acute exacerbation และ acute hypercapnic respiratory failure",
        "ABG แรกรับ pH 7.24, PaCO₂ 72, PaO₂ 50; CXR ไม่พบ infiltration",
        "ใส่ท่อช่วยหายใจ 52 ชั่วโมง ให้ยาขยายหลอดลม steroid และยาปฏิชีวนะ ถอดท่อได้ในวันที่ 3 ย้ายออกจาก ICU",
        "สอนการพ่นยาและการหายใจ; แนะนำเลิกบุหรี่และส่งคลินิกเลิกบุหรี่; นัด OPD 2 สัปดาห์; ฉีดวัคซีนไข้หวัดใหญ่",
        "budesonide/formoterol inhaler 2 puffs bid; salbutamol MDI prn; prednisolone 30 mg OD 3 วัน",
      ],
      notCoded: [
        { finding: "Tobacco dependence", code: "F17.2", reason: "ยังไม่ได้ประเมินความรุนแรงการติดบุหรี่ (Fagerström)" },
      ],
      alerts: [],
      variants: [
        { label: "ถ้าไม่ได้สรุปหัตถการ ventilator (AI-Audit ข้อ 6 จะตัด J96.0)", change: { remove: ["96.71", "J96.0"] } },
      ],
    },
  },
  {
    patient: {
      an: "69-005107", hn: "0201987", name: "นายวิชัย (นามสมมติ)", sex: "1", age: 63, age_day: 0, weight: 70,
      ward: "อายุรกรรมชาย", bed: "2", insurance: UC, attending: "นพ.ฌ.",
      working_dx: "Acute ischemic stroke, left MCA territory, s/p rtPA",
      admit_at: "2026-11-10 09:40", discharge_at: "2026-11-11 08:30", leave_days: 0,
      discharge_status: "Improved", discharge_type: "4", transfer_to: "",
    },
    notes: [
      ["2026-11-10 09:40", "admission", "นพ.ฌ.", "CC: แขนขาขวาอ่อนแรง พูดไม่ชัด 1 ชม. (last seen normal 08:45)\nPH: HT, dyslipidemia (LDL 168)\nPE: BP 172/96, NIHSS 12, right hemiparesis, aphasia; DTX 132"],
      ["2026-11-10 09:55", "lab", "รังสี", "CT brain non-contrast: no hemorrhage, early ischemic change left MCA territory (ASPECTS 8)"],
      ["2026-11-10 10:20", "procedure", "นพ.ฌ.", "rtPA 0.9 mg/kg IV (door-to-needle 40 นาที)"],
      ["2026-11-10 11:30", "progress", "นพ.ฌ.", "NIHSS 10\nA: Acute ischemic stroke left MCA territory s/p rtPA, suspected large vessel occlusion\nP: ติดต่อส่งต่อเพื่อทำ mechanical thrombectomy"],
      ["2026-11-11 08:30", "nursing", "พยาบาล", "NIHSS 9, BP 150/88 ส่งต่อโดยรถพยาบาล 08:30 น. พร้อมพยาบาล 1 คน"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Acute ischemic stroke, left MCA territory", code: "I63.9", status: "exact", evidence: "CT early ischemic change left MCA; NIHSS 12" },
        { type: "Comorbidity", text: "Hypertension", code: "I10", status: "exact", evidence: "BP 172/96; ยาลดความดัน" },
        { type: "Comorbidity", text: "Dyslipidemia", code: "E78.5", status: "less", evidence: "LDL 168; statin" },
        { type: "Non-OR procedure", text: "CT brain", code: "87.03", status: "exact", evidence: "ผล CT", when: "10 พ.ย. 09:55" },
        { type: "Non-OR procedure", text: "Intravenous thrombolysis (rtPA)", code: "99.10", status: "exact", evidence: "procedure note", when: "10 พ.ย. 10:20" },
      ],
      summary: [
        "แขนขาขวาอ่อนแรงและพูดไม่ชัด 1 ชั่วโมง วินิจฉัยเป็น acute ischemic stroke, left MCA territory",
        "CT สมองไม่พบเลือดออก มี early ischemic change บริเวณ left MCA (ASPECTS 8); NIHSS 12",
        "ให้ rtPA ภายใน 40 นาทีหลังมาถึง NIHSS ลดลงเหลือ 9 สงสัย large vessel occlusion จึงส่งต่อเพื่อทำ mechanical thrombectomy",
        "ส่งต่อพร้อมพยาบาล ควบคุมความดันระหว่างทาง",
        "ไม่มี (ส่งต่อ)",
      ],
      notCoded: [],
      alerts: [
        { level: "stop", text: "Discharge type เป็น by transfer แต่ไม่ได้ระบุชื่อสถานพยาบาลที่ส่งต่อ (MRA ข้อ 8)" },
        { level: "suggest", text: "Dyslipidemia ไม่ได้ระบุชนิด (hypercholesterolemia, hypertriglyceridemia, mixed)" },
      ],
      variants: [
        { label: "Pure hypercholesterolemia", change: { swap: { "E78.5": "E78.0" } }, to: ASK,
          question: "Dyslipidemia ของผู้ป่วยเป็นชนิดใด (hypercholesterolemia / hypertriglyceridemia / mixed / อื่น ๆ)" },
      ],
    },
  },
  {
    patient: {
      an: "69-005108", hn: "0233451", name: "นายภูมิ (นามสมมติ)", sex: "1", age: 16, age_day: 0, weight: 55,
      ward: "กุมารเวชกรรม", bed: "6", insurance: UC, attending: "พญ.ญ.",
      working_dx: "Acute gastroenteritis with moderate dehydration",
      admit_at: "2026-11-09 20:10", discharge_at: "2026-11-11 12:00", leave_days: 0,
      discharge_status: "Complete recovery", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-09 20:10", "admission", "พญ.ญ.", "CC: ถ่ายเหลว 8 ครั้ง อาเจียน 5 ครั้ง 1 วัน หน้ามืดเวลาลุกยืน\nPE: BP 96/58 นอน → 82/50 ยืน, PR 112, dry mucosa, capillary refill 3 sec\nLab: BUN/Cr 32/1.3, K 3.2; stool exam WBC 0–1, no RBC\nImpression: AGE with moderate dehydration, prerenal azotemia, orthostatic hypotension"],
      ["2026-11-10 09:00", "progress", "พญ.ญ.", "NSS IV, ถ่าย 2 ครั้ง กินได้, BP ไม่ลดเวลายืน; BUN/Cr 14/0.8, K 3.6"],
      ["2026-11-11 09:00", "progress", "พญ.ญ.", "ไม่ถ่ายเหลว กินได้ดี; D/C\nDx เมื่อจำหน่าย (แพทย์เขียน): AGE with moderate dehydration; prerenal azotemia; orthostatic hypotension"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Acute gastroenteritis", code: "A09.9", status: "exact", evidence: "ถ่ายเหลว 8 ครั้ง อาเจียน; stool exam ไม่พบ RBC" },
        { type: "Comorbidity", text: "Moderate dehydration", code: "E86", status: "exact", evidence: "orthostatic BP drop, dry mucosa; NSS IV" },
      ],
      summary: [
        "ถ่ายเหลวและอาเจียน 1 วัน หน้ามืดเวลาลุกยืน วินิจฉัยเป็น acute gastroenteritis with moderate dehydration",
        "BUN/Cr 32/1.3 แล้วกลับเป็น 14/0.8; K 3.2; ตรวจอุจจาระไม่พบเม็ดเลือดแดง",
        "ให้สารน้ำทางหลอดเลือด อาการหน้ามืดหายไป ถ่ายลดลงและกินได้ภายใน 1 วัน",
        "ดื่ม ORS ทดแทน; กลับมาถ้าถ่ายเป็นเลือดหรืออาเจียนจนกินไม่ได้",
        "ORS; zinc 20 mg OD 10 วัน",
      ],
      notCoded: [
        { finding: "Prerenal azotemia", code: "R39.2", reason: "เป็นอาการของ AGE (AI-Audit ข้อ 14)" },
        { finding: "Orthostatic hypotension", code: "I95.1", reason: "เป็นอาการของ AGE (AI-Audit ข้อ 14)" },
        { finding: "Hypokalemia K 3.2", code: "E87.6", reason: "ไม่ได้รักษาจำเพาะ" },
      ],
      alerts: [
        { level: "warn", text: "แพทย์สรุป prerenal azotemia และ orthostatic hypotension ร่วมกับ AGE ซึ่ง AI-Audit ข้อ 14 จะตัด ร่างนี้จึงไม่ใส่ รอแพทย์ยืนยัน" },
      ],
      variants: [
        { label: "ตามที่แพทย์เขียนเดิม (AI-Audit ข้อ 14 จะตัด R39.2 และ I95.1)", change: { add: ["R39.2", "I95.1"] } },
      ],
    },
  },
  {
    patient: {
      an: "69-005109", hn: "0240012", name: "ด.ช. บุตรนางสายใจ (นามสมมติ)", sex: "1", age: 0, age_day: 4, weight: 2.9,
      ward: "ทารกแรกเกิด", bed: "N4", insurance: UC, attending: "พญ.ฎ.",
      working_dx: "Neonatal jaundice",
      admit_at: "2026-11-09 10:00", discharge_at: "2026-11-11 10:00", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-09 10:00", "admission", "พญ.ฎ.", "ทารกอายุ 4 วัน ตัวเหลืองมากขึ้น คลอดครบกำหนดที่ รพ.นี้ BW 3,050 g น้ำหนักวันนี้ 2,900 g กินนมแม่ดี\nPE: jaundice ถึงขา, active\nLab: MB 18.6 mg/dL; แม่ blood group O Rh+, ทารก B Rh+, DCT positive (1+); Hct 46%, reticulocyte 6%\nImpression: Neonatal jaundice"],
      ["2026-11-09 10:30", "procedure", "พญ.ฎ.", "เริ่ม phototherapy (double surface)"],
      ["2026-11-10 09:00", "progress", "พญ.ฎ.", "MB 12.4\nA: neonatal jaundice ดีขึ้น"],
      ["2026-11-11 08:00", "progress", "พญ.ฎ.", "MB 10.1 หยุด phototherapy ตั้งแต่ 10 พ.ย. 08:00, rebound MB 10.8; D/C"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Neonatal jaundice", code: "P59.9", status: "less", evidence: "MB 18.6; แม่ O ทารก B, DCT positive" },
        { type: "Non-OR procedure", text: "Phototherapy", code: "99.83", status: "exact", evidence: "order", when: "9–10 พ.ย." },
      ],
      summary: [
        "ทารกอายุ 4 วัน ตัวเหลืองมากขึ้น วินิจฉัยเป็น neonatal jaundice",
        "MB แรกรับ 18.6 mg/dL; แม่ O ทารก B; DCT positive; reticulocyte 6%",
        "ส่องไฟ 24 ชั่วโมง MB ลดเหลือ 10.1 และไม่เพิ่มขึ้นหลังหยุดส่องไฟ",
        "ให้นมแม่ต่อ สังเกตสีผิว นัดตรวจ MB 3 วัน",
        "ไม่มี",
      ],
      notCoded: [],
      alerts: [
        { level: "suggest", text: "ผล lab เข้าได้กับ ABO incompatibility (แม่ O ทารก B, DCT positive, reticulocyte 6%) แต่แพทย์วินิจฉัยเพียง neonatal jaundice ซึ่ง coder ให้รหัสจาก lab เองไม่ได้" },
      ],
      variants: [
        { label: "ABO isoimmunization", change: { swap: { "P59.9": "P55.1" } }, to: ASK,
          question: "ภาวะตัวเหลืองครั้งนี้มีสาเหตุจากอะไร (ABO incompatibility / physiologic หรือ breast milk jaundice / อื่น ๆ / ระบุไม่ได้)" },
      ],
    },
  },
  {
    patient: {
      an: "69-005110", hn: "0198876", name: "นางกัลยา (นามสมมติ)", sex: "2", age: 32, age_day: 0, weight: 68,
      ward: "สูติกรรม", bed: "9", insurance: UC, attending: "นพ.ฏ.",
      working_dx: "Previous cesarean section, s/p repeat low transverse cesarean section",
      admit_at: "2026-11-08 07:00", discharge_at: "2026-11-11 10:00", leave_days: 0,
      discharge_status: "Improved", discharge_type: "1", transfer_to: "",
    },
    notes: [
      ["2026-11-08 07:00", "admission", "นพ.ฏ.", "G2P1 GA 38+2 wk, previous C/S 3 ปีก่อน (fetal distress) นัดผ่าตัดคลอด elective; ANC 10 ครั้ง ปกติ; Hb 11.8"],
      ["2026-11-08 08:30", "procedure", "นพ.ฏ.", "Repeat low transverse cesarean section 08:30–09:25 น. (spinal anesthesia); male live birth 3,250 g, Apgar 9, 10; uterine atony เล็กน้อย ตอบสนองต่อ oxytocin; EBL 800 mL"],
      ["2026-11-08 11:00", "nursing", "พยาบาล", "หลังผ่าตัด เลือดออกทางช่องคลอดที่ห้องพักฟื้น ชั่งผ้าได้ 250 mL รวม EBL ประมาณ 1,050 mL รายงานแพทย์ ให้ oxytocin drip ต่อ"],
      ["2026-11-09 09:00", "progress", "นพ.ฏ.", "Hb 9.6, vital signs stable, uterus contract ดี\nP: ferrous fumarate"],
      ["2026-11-10 09:00", "progress", "นพ.ฏ.", "เดินได้ แผลแห้ง; plan D/C พรุ่งนี้"],
    ],
    draft: {
      lines: [
        { type: "Principal diagnosis", text: "Previous cesarean section (uterine scar)", code: "O34.2", status: "exact", evidence: "previous C/S 3 ปีก่อน; elective repeat C/S" },
        { type: "Other diagnosis", text: "Delivery by elective cesarean section", code: "O82.0", status: "exact", evidence: "operative note" },
        { type: "Other diagnosis", text: "Single live birth", code: "Z37.0", status: "exact", evidence: "male 3,250 g, Apgar 9, 10" },
        { type: "OR procedure", text: "Repeat low transverse cesarean section", code: "74.1", status: "exact", evidence: "operative note", when: "8 พ.ย. 08:30–09:25" },
      ],
      summary: [
        "ครรภ์ที่ 2 อายุครรภ์ 38 สัปดาห์ เคยผ่าตัดคลอด นัดผ่าตัดคลอดซ้ำ",
        "Hb ก่อนผ่าตัด 11.8 หลังผ่าตัด 9.6",
        "ผ่าตัดคลอดแบบ low transverse ได้ทารกชายมีชีวิต 3,250 g มดลูกหดตัวไม่ดีเล็กน้อยระหว่างผ่าตัด ตอบสนองต่อ oxytocin",
        "ดูแลแผล นัดตรวจหลังคลอด 6 สัปดาห์ แนะนำการคุมกำเนิด",
        "ferrous fumarate 200 mg OD; paracetamol 500 mg prn",
      ],
      notCoded: [],
      alerts: [
        { level: "warn", text: "EBL ตามบันทึกแพทย์ 800 mL แต่รวมกับบันทึกพยาบาลได้ประมาณ 1,050 mL ซึ่งถึงเกณฑ์ postpartum hemorrhage ของการผ่าตัดคลอด แพทย์ยังไม่ได้วินิจฉัย" },
      ],
      variants: [
        { label: "Postpartum hemorrhage", change: { add: ["O72.1"] }, to: "สูติแพทย์",
          question: "เสียเลือดรวมประมาณ 1,050 mL (operative note 800 mL และบันทึกพยาบาล 250 mL) แพทย์ประเมินว่ามี postpartum hemorrhage หรือไม่ (มี / ไม่มี / ระบุไม่ได้)" },
        { label: "ถ้าไม่ได้ใส่รหัสวิธีคลอด O82.0", change: { remove: ["O82.0"] } },
      ],
    },
  },
];

const plain = (c: string) => c.toUpperCase().replace(/\./g, "");

async function check() {
  const bad: string[] = [];
  for (const { patient, draft } of SEEDS) {
    const lineCodes = draft.lines.map((l) => l.code);
    for (const v of draft.variants)
      for (const c of [...(v.change.remove ?? []), ...Object.keys(v.change.swap ?? {})])
        if (!lineCodes.includes(c)) bad.push(`${patient.an}: variant "${v.label}" refers to ${c}, which is not in the draft`);
    const codes = [
      ...lineCodes,
      ...draft.notCoded.map((n) => n.code),
      ...draft.variants.flatMap((v) => [...(v.change.add ?? []), ...Object.values(v.change.swap ?? {})]),
    ];
    for (const c of codes) {
      const table = /^\d/.test(c) ? "icd9_desc" : "icd10_desc";
      const { rows } = await db.query<{ valid: number }>(`select valid from ${table} where code = $1`, [plain(c)]);
      if (rows[0]?.valid !== 1) bad.push(`${patient.an}: ${c} is ${rows.length ? "a header code" : "not in " + table}`);
    }
  }
  if (bad.length) throw new Error(bad.join("\n"));
}

await check();
await db.transaction(async (tx) => {
  await tx.exec(`drop table if exists ward_draft, ward_note, ward_patient;
    create table ward_patient (
      an text primary key, hn text not null, name text not null, sex text not null, age integer not null,
      age_day integer not null, weight double precision not null, ward text not null, bed text not null,
      insurance text not null, attending text not null, working_dx text not null, admit_at text not null,
      discharge_at text not null, leave_days integer not null, discharge_status text not null,
      discharge_type text not null, transfer_to text not null);
    create table ward_note (
      an text not null references ward_patient, seq integer not null, at text not null,
      kind text not null, author text not null, body text not null, primary key (an, seq));
    create table ward_draft (an text primary key references ward_patient, draft jsonb not null);`);
  for (const { patient, notes, draft } of SEEDS) {
    const cols = Object.keys(patient);
    await tx.query(`insert into ward_patient (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, Object.values(patient));
    for (const [i, [at, kind, author, body]] of notes.entries())
      await tx.query("insert into ward_note values ($1, $2, $3, $4, $5, $6)", [patient.an, i, at, kind, author, body]);
    await tx.query("insert into ward_draft values ($1, $2::jsonb)", [patient.an, JSON.stringify(draft)]);
  }
});
console.log(`ward: ${SEEDS.length} patients, ${SEEDS.reduce((n, s) => n + s.notes.length, 0)} notes`);
await db.close();
