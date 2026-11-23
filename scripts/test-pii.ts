// node scripts/test-pii.ts
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../lib/pii.ts";

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
