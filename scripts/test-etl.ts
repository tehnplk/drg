// node scripts/test-etl.ts
import assert from "node:assert/strict";
import { fingerprint, labFlag, scrubber, squash } from "../lib/etl.ts";

// Made-up identifiers only: never a real patient's.
const scrub = scrubber({ fname: "ทดสอบนาม", lname: "สมมติสกุล", cid: "1234567890123", phone: "081-234-5678" });
assert.equal(scrub("ผู้ป่วย ทดสอบนาม สมมติสกุล มาด้วยปวดศีรษะ"), "ผู้ป่วย [ผู้ป่วย] [ผู้ป่วย] มาด้วยปวดศีรษะ", "patient names");
assert.equal(scrub("เลขบัตร 1234567890123"), "เลขบัตร [เลขส่วนบุคคล]", "own national ID");
assert.equal(scrub("โทร 081-234-5678"), "โทร [เลขส่วนบุคคล]", "own phone as written");
assert.equal(scrub("ญาติ 3-1001-00234-56-7"), "ญาติ [เลขบัตร]", "any national ID with dashes");
assert.equal(scrub("ญาติโทร 0899998888 หรือ 02-123-4567"), "ญาติโทร [เบอร์โทร] หรือ [เบอร์โทร]", "any phone");
const clinical = "Na 129 Cr 0.99 BP 227/115 HbA1c 19.3 ให้ 0.9% NSS 1,000 ml 80 cc/hr เวลา 2026-11-19 23:30 ref 0.5-1.0";
assert.equal(scrub(clinical), clinical, "clinical numbers stay");
assert.equal(scrubber({ fname: "ก", lname: null })("กิน ก ได้"), "กิน ก ได้", "one-letter names are not scrubbed");

assert.equal(labFlag("129", "135-145 mmol/L"), "L");
assert.equal(labFlag("21", "7.8- 20.0 mg/dl"), "H");
assert.equal(labFlag("12.5", "(11.0 - 18.8) g/dl"), "");
assert.equal(labFlag("0.7", "(<0.6)"), "H");
assert.equal(labFlag("45", ">60"), "L");
assert.equal(labFlag("Negative", "Negative"), "");
assert.equal(labFlag("76.17", ""), "");
assert.equal(labFlag("See Image", null), "image");

assert.equal(fingerprint({ a: 1, b: [{ y: 2, x: 1 }] }), fingerprint({ b: [{ x: 1, y: 2 }], a: 1 }), "key order does not matter");
assert.notEqual(fingerprint({ a: 1 }), fingerprint({ a: 2 }), "content does");

assert.equal(squash("รับประทานครั้งละ   1  เม็ด", null, "วันละ 3  ครั้ง"), "รับประทานครั้งละ 1 เม็ด วันละ 3 ครั้ง");
console.log("etl ok");
