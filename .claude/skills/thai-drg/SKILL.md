---
name: thai-drg
description: Compute, explain and compare Thai DRG 6.3 groupings (MDC, DC, PCL, DRG, RW, AdjRW, error/warning codes) with this repo's TypeScript grouper, TGrp6305 CLI or had-api. Use it whenever the user asks what DRG/RW/AdjRW a case gets, why a case grouped the way it did, how adding or removing a diagnosis, procedure, LOS, discharge type, age, sex or newborn weight changes the DRG or payment, how much a case is worth in baht, or about TDRG rules (PCL formula, CC exclusion, unrelated OR procedures, AdjRW short/long-stay formula), even when they only say things like "เคสนี้ได้กี่ RW", "ลอง group ให้หน่อย", "ทำไมได้ 26509", "ถ้าเพิ่มโรคร่วมจะได้เพิ่มไหม" or paste a list of ICD-10/ICD-9 codes.
---

# Thai DRG 6.3 grouping

This repo contains a TypeScript re-implementation of the Thai DRG 6.3 grouper that agrees with TGrp6305 on 99.9% of cases. Use it to give numbers, not guesses: run the case, then explain the result.

## Run a case

Run from the project root (the grouper reads `grouper/tdrg633/*.json` and `data/pglite` relative to the current directory):

```bash
node .claude/skills/thai-drg/scripts/group.ts '{"sex":"1","age":58,"los_day":3,"discht":"1","pdx":"J18.9","sdx":["E11.9","N17.9"],"proc":["96.04"]}'
```

- Pass one case object or an array of cases (compare variants side by side). `@file.json` reads the cases from a file.
- Output per case: `mdc, dc, drg, drgname, pcl, rw, adjrw, wtlos, ot, err, warn, candidates` and the warning meanings.
- PGlite allows one process at a time. If `next dev`/`next start` is running, the script fails with a lock error. Then call the running API instead: `POST /api/drg/calculate?source=ts` with body `{"data":[case, ...]}`.

**Input fields** (same shape as had-api): `sex` "1"/"2", `age` years, `age_day` (newborns), `los_day` (0 = stayed under 24 h), `weight` kg (required under 28 days old), `discht` 1 approval / 2 against advice / 3 escape / 4 transfer / 5 other / 8–9 dead, `pdx`, `sdx[]` (max 12), `proc[]` (max 20, ICD-9-CM, optional `+<units><setting>` extension such as `8622+21`; Appendix C combination codes like `CE002` are accepted). Dots in codes are optional.

**Other sources** through the API: `?source=api` (had-api.moph.go.th), `?source=cli` (TGrp6305.exe, Windows only), `?source=compare-ts` (TS vs CLI field by field). The default `auto` tries had-api and falls back to TS.

## Explain the result

Walk through the path that produced the DRG, in this order. Each step can change the outcome, so name the one that decided it.

1. **Edits.** Errors stop grouping: 1 no PDx, 2 invalid PDx, 3 unacceptable PDx (DRG 26519), 4/5 PDx vs age/sex, 6 age out of range (26539), 7 sex missing for a sex-specific PDx, 10 newborn without weight. Everything else gets 26509. Warnings drop codes but grouping continues: 1 invalid/duplicate SDx, 2 SDx vs age, 4 SDx vs sex, 8 invalid/duplicate proc, 16 proc vs sex, 32 no sex, 64 bad discharge type (bit sum, e.g. 6 = 2+4).
2. **MDC.** Pre-MDC (transplants, tracheostomy with LOS > 20 d) → MDC 24 (trauma PDx + 2 trauma body sites by diagnosis or OR procedure) → MDC 25 (HIV PDx) → MDC 15 (age < 28 days) → MDC of the PDx.
3. **Unrelated OR procedure.** If an OR procedure is not related to the MDC, it may move the case to another MDC (MosDx PDx, or a shared MDC with an SDx, which then becomes PDx), to MosProc DC 2611–2614, or to DC 2601–2605 by ORP group.
4. **DC.** The first matching DC definition of the MDC (surgical before medical, order learned from TGrp). `candidates` lists every DC whose definition matched.
5. **PCL 0–9.** DCL of every diagnosis in that DC, sorted, CC exclusions removed, `PCL = round(Σ DCLᵢ × 0.82^(i−1))`. The PCL picks the last digit of the DRG.
6. **AdjRW** from LOS: under 24 h → RW0d; LOS < WtLOS/3 → reduced; above OT → increased (formula in `references/tdrg-rules.md`).
7. **Money.** Payment ≈ AdjRW × base rate. NHSO used 8,350 baht per AdjRW for in-zone IP in 2567–2569; say which rate you assume.

For "what if" questions, run the original and each variant in one call and show a table of DRG / PCL / AdjRW / baht. Keep the clinical honesty point in view: an added code only counts if the chart supports it, and the NHSO AI-audit removes unsupported codes (see the `discharge-summary` skill).

## When the result looks wrong

- Compare with TGrp: `?source=compare-ts`, or `node scripts/try-cases.ts cases.json` (Windows, needs `grouper/TGrp6305`).
- Known gaps (≈0.1%): surgical DC hierarchy in a few MDCs (05, 06, 08, 09, 11, 13) where TGrp's choice depends on more than a fixed order, a few rare MDC reassignments, dagger/asterisk swap (Appendix A1) and the O98/O99 PDx swap of DC 1452 are not implemented.
- had-api quirks: it ignores `los_hour`, cannot group `los_day: 0` (answers err 9) or an empty PDx (HTTP 400), groups only `data[0]`, and returns blank DRGs under concurrent requests.

## Maintaining the grouper

Read `references/tdrg-rules.md` before changing `lib/tdrg/`. It lists where each table comes from and the TGrp behaviours that are not in the manual.
