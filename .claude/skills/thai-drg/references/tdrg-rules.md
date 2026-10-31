# TDRG 6.3 grouper: data and rules

## Contents
1. Code and data layout
2. Formulas
3. TGrp behaviours that are not in the manual
4. Testing and rebuilding

## 1. Code and data layout

| Path | What |
|---|---|
| `lib/tdrg/group.ts` | Main flow: edits → Pre-MDC → MDC 24/25/15 → MDC by PDx → UORP (Appendix D) → DC → PCL → DRG → AdjRW |
| `lib/tdrg/cond.ts` | Compiles vol 2 "DC and DRG Definition" lines into predicates |
| `lib/tdrg/pcl.ts`, `adjrw.ts` | Appendix F (PCL) and Appendix H (AdjRW) |
| `lib/tdrg/data.ts` | Loads every table below into memory once |
| `lib/tgrp.ts` | Wraps `TGrp6305.exe <file.dbf>` (writes a DBF, runs the exe, reads results back) |
| `lib/hadapi.ts` | had-api client (one request at a time, retry once) |
| `grouper/TGrp6305/c63*.dbf` | TGrp library: `c63drg` (RW, RW0d, WtLOS, OT, MDF=OF), `c63i10` (MDC, PDC, CC, MAINCC, DCLMAIN, SEX, ACCPDX, AGEMIN/AGEMAX/AGEDUSE/AGEDMIN, TRAUMA, HIV_AX, MOSDX), `c63proc` (PROCGR=ORP group, PROCLEV, MMDC, OMDCS, SITE, MOSPROC/MOSDC/MOSHIERAR, SEX), `c63ccex` |
| `grouper/tdrg633/*.tsv` | Extracted from the TDRG 6.3.3 manual: `dcl.tsv` (Appendix F1), `dcl-alias.tsv`, `drg-pcl.tsv` (vol 1 + 2), `proc-pdc.tsv`, `dx-pdc.tsv`, `ax.tsv` (vol 2), `icd10-desc.tsv` / `icd9-desc.tsv` (TDS6307) |
| `grouper/tdrg633/dc-def.json` | 594 DC definitions with condition lines (each line is an OR alternative) |
| `grouper/tdrg633/dc-order.json` | DC evaluation order per MDC, learned from TGrp |

`grouper/` is git-ignored (TGrp binaries and copyrighted manual tables). Sources: tcmc.or.th download page (S0091 vol 1, S0092 vol 2, S0063 Appendix F1/F2, S0178 TDS6307, S0021 TGrp6305).

## 2. Formulas

**PCL** (Appendix F): DCL of each code in the DC from `dcl` (via `dcl_alias`, 0 if absent) → keep DCL > 0 → sort by DCL desc, then code desc → walk left to right, drop a code if `c63ccex` has (MAINCC of that code, an already kept code) → `round(Σ DCLᵢ × 0.82^(i−1))`, half up, max 9.

**AdjRW** (Appendix H), `of` = MDF:
- RW = 0 (error DRGs) → 0
- LOS 0 (under 24 h) and RW0d > 0 → RW0d
- RW0d > 0, WtLOS > 3, LOS < WtLOS/3 → `RW0d + LOS × (RW − RW0d) / ceil(WtLOS/3)`
- LOS > OT: ≤ 2·OT → `RW + OF·b12·(LOS−OT)`; ≤ 3·OT → `RW + OF·b12·OT + OF·b23·(LOS−2·OT)`; else `RW + OF·OT·(b12+b23)`
- b12/b23: medical (DRG digits 3–4 ≥ 50) RW < 0.7 → 0.0770/0.0480, else 0.1212/0.0743; surgical RW < 2 → 0.0904/0.0584, else 0.1580/0.1268
- Round half up at 4 decimals with a small epsilon (VFP decimal rounding).

## 3. TGrp behaviours that are not in the manual

- CC exclusion is keyed by the excluded code's **MAINCC**, not the code.
- `AGEDUSE = Y` means the code needs an age of **at least** AGEDMIN days (not for neonates). An invalid age (error 6) suppresses the PDx-vs-age check.
- An SDx raises both age (2) and sex (4) flags, even when it is also a duplicate (1). A procedure's sex conflict (16) is checked before duplicates (8).
- Procedure body site for MDC 24 includes `J`.
- PDCs can be `nP?` or `nQ?` (e.g. `6QB`). MDC 14 has no ICD-9 PDC list; its procedures live only in AX lists.
- UORP applies only in MDC 01–14, 16, 17, 21, and not for MDC 14 PDC 14F–14L or MDC 05 PDC 5A (AMI).
- A procedure is "related" if it is in the MDC's PDC list or makes one of its surgical DCs (number 01–49) match.
- Appendix D starts with the LOS gate: top ORP group 2 with LOS ≥ 5, or group 1 with LOS ≥ 4 → back to MDC logic, before any reassignment.
- MDC 18, 23, 25 with OR procedures: reassignment by procedure + SDx, then MosProc, then the MDC's own DCs.
- DC 2652 (unacceptable obstetric combination) is checked before UORP in MDC 14.
- PCL ranges for DC 26xx are in vol 1 Appendix D, not vol 2.

## 4. Testing and rebuilding

- `npm run import-tgrp`: rebuild PGlite from `grouper/` (stop the Next server first).
- `npm run test-tdrg -- 20000 <seed>`: random cases, TS vs TGrp CLI; `--learn` re-derives `dc-order.json`.
- `node scripts/test-pcl.ts`: PCL and AdjRW only.
- `node scripts/try-cases.ts cases.json`: hand-written cases, TS vs CLI.
