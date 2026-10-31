// Thai DRG 6.3.3 vol 1, Appendix H: adjust RW by length of stay.

export type DrgWeight = { drg: string; rw: number; rw0d: number; wtlos: number; ot: number; of: number };

// b12/b23 by DRG type (medical: DRG digits 3-4 >= 50, else procedural) and RW band
function rates(drg: string, rw: number) {
  const medical = Number(drg.slice(2, 4)) >= 50;
  if (medical) return rw < 0.7 ? [0.077, 0.048] : [0.1212, 0.0743];
  return rw < 2 ? [0.0904, 0.0584] : [0.158, 0.1268];
}

// los in days; 0 means discharged within 24 hours
export function adjrw(w: DrgWeight, los: number): number {
  const { drg, rw, rw0d, wtlos, ot, of } = w;
  if (rw === 0) return 0; // error DRGs 26xxx
  let v = rw;
  if (rw0d > 0 && los === 0) v = rw0d;
  else if (rw0d > 0 && wtlos > 3 && los < wtlos / 3) v = rw0d + (los * (rw - rw0d)) / Math.ceil(wtlos / 3);
  else if (los > ot) {
    const [b12, b23] = rates(drg, rw);
    if (los <= 2 * ot) v = rw + of * b12 * (los - ot);
    else if (los <= 3 * ot) v = rw + of * b12 * ot + of * b23 * (los - 2 * ot);
    else v = rw + of * ot * (b12 + b23);
  }
  // half-up at 4 decimals like VFP; the epsilon absorbs binary error (0.53175 -> 0.531749999…)
  return Math.round(v * 10000 + 1e-7) / 10000;
}
