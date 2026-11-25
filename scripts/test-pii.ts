// node scripts/test-pii.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt, maskSurname } from "../lib/pii.ts";

assert.equal(maskSurname("พญ.นฤมล พงษ์สวัสดิ์"), "พญ.นฤมล ***");
assert.equal(maskSurname("พญ.ชื่อ สกุล ว12345"), "พญ.ชื่อ *** ว12345", "keeps the licence number");
assert.equal(maskSurname("นพ. สมชาย ใจดี"), "นพ. สมชาย ***", "a space after the title keeps the first name");
assert.equal(maskSurname("นางสาวสมหญิง ใจดี มีสุข"), "นางสาวสมหญิง ***");
assert.equal(maskSurname("นพ.ก."), "นพ.ก.");
assert.equal(maskSurname("nurse01"), "nurse01");

process.env.PII_KEY = randomBytes(32).toString("base64");

const id = "1234567890123"; // made up
const a = encrypt(id)!, b = encrypt(id)!;
assert.equal(decrypt(a), id, "round-trips");
assert.equal(decrypt(encrypt("สมมติสกุล")), "สมมติสกุล", "round-trips Thai text");
assert.notEqual(a, b, "a fresh IV makes equal inputs encrypt differently");
assert.ok(!a.includes(id), "ciphertext does not contain the plaintext");
assert.equal(encrypt(""), null, "empty stays null");
assert.equal(decrypt(null), null, "null stays null");

const raw = Buffer.from(a.slice(3), "base64");
raw[raw.length - 1] ^= 1;
assert.throws(() => decrypt(`v1:${raw.toString("base64")}`), "a tampered value is rejected");

process.env.PII_KEY = randomBytes(32).toString("base64");
assert.throws(() => decrypt(a), "another key cannot read it");

console.log("pii ok");
