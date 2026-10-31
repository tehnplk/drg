// usage: node scripts/try-group.ts — group one case with the local TGrp CLI and print the result
import { group } from "../lib/tgrp.ts";

try {
  console.log(await group([{ an: "T1", sex: "1", age: 58, los_day: 30, discht: "1", pdx: "J189", sdx: ["E119"], proc: ["9604", "9672"] }]));
} catch (e) {
  console.log("failed", { code: (e as { code?: unknown }).code, message: (e as Error).message });
}
