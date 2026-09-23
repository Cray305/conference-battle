import type { WL } from "./data.ts";

export const winPct = ({ w, l }: WL): number => (w + l === 0 ? 0 : w / (w + l));

/** Baseball-style percentage: ".625", "1.000", or "—" with no games. */
export function fmtPct(r: WL): string {
  if (r.w + r.l === 0) return "—";
  const p = winPct(r);
  return p === 1 ? "1.000" : p.toFixed(3).slice(1);
}

export const fmtWL = (r: WL): string => `${r.w}–${r.l}`;

/** Heat-map bin class for a win percentage. */
export function bin(p: number): string {
  return p >= 0.65 ? "b-w2" : p >= 0.55 ? "b-w1" : p > 0.45 ? "b-0" : p > 0.35 ? "b-l1" : "b-l2";
}

/** Matchups with fewer games than this are hatched as small samples. */
export const THIN = 4;
