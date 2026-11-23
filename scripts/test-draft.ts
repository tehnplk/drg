// node scripts/test-draft.ts — draft A follows the physician's HIS discharge summary (lib/ward.ts followPhysician).
import assert from "node:assert/strict";
import { applyChange, finalCoding, followPhysician, LINE_ROLES, type Draft, type Line } from "../lib/ward.ts";

const line = (type: Line["type"], code: string, text = code): Line => ({ type, text, code, status: "exact", evidence: "ชาร์ท" });
const draft = (lines: Line[], variants: Draft["variants"] = []): Draft => ({ lines, summary: ["", "", "", "", ""], notCoded: [], alerts: [], variants });
const his = [
  { type: "Principal Diagnosis", text: "Diabetic mellitus type 2", icd10: "E119" },
  { type: "Co - morbidity", text: "Essential hypertension", icd10: "I10" },
];
const a = (d: Draft) => d.lines.map((l) => `${LINE_ROLES[l.type]}:${l.code}`);
const coded = (d: Draft) => d.lines.map((l) => ({ code: l.code, role: LINE_ROLES[l.type] }));

// The AI swapped PDx and added a diagnosis the physician did not enter (the real DeepSeek Flash result).
const ai = draft(
  [line("Principal diagnosis", "I10"), line("Comorbidity", "E11.9"), line("Comorbidity", "E78.2", "Dyslipidaemia"), line("Non-OR procedure", "99.17")],
  [
    { label: "สลับ PDx เป็นเบาหวาน", change: { swap: { "I10": "E11.9", "E11.9": "I10" } }, question: "ภาวะใดเป็นเหตุผลหลัก?" },
    { label: "E78.5 แทน E78.2", change: { swap: { "E78.2": "E78.5" } }, question: "ชนิดของ dyslipidaemia?" },
  ],
);
const fixed = followPhysician(ai, his);
assert.deepEqual(a(fixed), ["pdx:E11.9", "sdx:I10", "proc:99.17"], "A: the physician's PDx, only their diagnoses, procedures kept");
const pdxVariant = fixed.variants.find((v) => v.label.includes("PDx"))!;
assert.equal(pdxVariant.question, "ภาวะใดเป็นเหตุผลหลัก?", "the AI's own question is kept");
assert.equal(applyChange(coded(fixed), pdxVariant.change).find((c) => c.role === "pdx")?.code, "I10", "the variant gives the AI's PDx back");
assert.ok(fixed.variants.some((v) => v.change.add?.[0] === "E78.2" && v.question), "the added diagnosis becomes a query");
assert.deepEqual(fixed.variants.find((v) => v.label === "E78.5 แทน E78.2")?.change, { add: ["E78.5"] }, "a swap of a moved code now adds it");
assert.equal(fixed.alerts.filter((x) => x.level === "warn").length, 2, "both moves are flagged");

// A PDx the AI left out entirely comes back from the HIS, dotted and marked for checking.
const missing = followPhysician(draft([line("Principal diagnosis", "A41.9", "Sepsis"), line("Comorbidity", "I10")]), [{ type: "Principal Diagnosis", text: "Acute febrile illness", icd10: "R509" }, his[1]]);
assert.deepEqual(a(missing), ["pdx:R50.9", "sdx:I10"]);
assert.equal(missing.lines[0].status, "ambiguous");
assert.deepEqual(missing.variants[0].change, { swap: { "R50.9": "A41.9" } });

// finalCoding: draft A minus rejected codes, plus every variant the physician confirmed; open items block approval.
const r = (decision: string) => ({ decision, note: null, by: "coder", at: "2569-11-23 15:00" });
const open = finalCoding(fixed, { "line:0": r("accept") });
assert.ok(open.missing.length > 0 && open.missing.every((m) => !m.includes("E11.9")), "undecided codes and questions are listed");
const answers = Object.fromEntries([
  ...fixed.lines.map((_, i) => [`line:${i}`, r(i === 2 ? "reject" : "accept")]), // reject the procedure
  ...fixed.variants.map((v, i) => [`variant:${i}`, r(v.change.add?.[0] === "E78.2" ? "yes" : "no")]),
]);
const done = finalCoding(fixed, answers);
assert.deepEqual(done.missing, []);
assert.deepEqual(done.coded.map((c) => `${c.role}:${c.code}`), ["pdx:E11.9", "sdx:I10", "sdx:E78.2"], "rejected code out, confirmed variant in");

// Already following the physician, or no HIS summary yet: unchanged.
const good = draft([line("Principal diagnosis", "E11.9"), line("Comorbidity", "I10")]);
assert.deepEqual(followPhysician(good, his), good);
assert.deepEqual(followPhysician(ai, []), ai);
console.log("draft ok");
