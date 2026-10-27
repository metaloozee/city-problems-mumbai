import type { Problem } from "./types";
import { WARDS } from "./data";

export interface AreaStats {
  total: number; open: number; resolved: number; rejected: number;
  fixRate: number | null;          // resolved ÷ (resolved + rejected), in %
  medianDays: number | null;       // median days to fix, resolved complaints only
  per100k: number | null;
  byCategory: { name: string; total: number; open: number }[];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function areaStats(rows: Problem[], population?: number): AreaStats {
  let open = 0, resolved = 0, rejected = 0;
  const days: number[] = [];
  const cats = new Map<string, { total: number; open: number }>();
  for (const r of rows) {
    if (r.isOpen) open++;
    if (r.status === "Resolved") { resolved++; if (r.daysToClose !== null) days.push(r.daysToClose); }
    if (r.status === "Rejected") rejected++;
    const c = cats.get(r.category) ?? { total: 0, open: 0 };
    c.total++; if (r.isOpen) c.open++;
    cats.set(r.category, c);
  }
  return {
    total: rows.length, open, resolved, rejected,
    fixRate: resolved + rejected ? (100 * resolved) / (resolved + rejected) : null,
    medianDays: median(days),
    per100k: population ? (rows.length * 100000) / population : null,
    byCategory: [...cats.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.total - a.total),
  };
}

export function statsByWard(rows: Problem[]): Map<string, AreaStats> {
  const groups = new Map<string, Problem[]>();
  for (const r of rows) {
    const g = groups.get(r.ward);
    if (g) g.push(r); else groups.set(r.ward, [r]);
  }
  return new Map(WARDS.map((w) => [w.ward, areaStats(groups.get(w.ward) ?? [], w.population)]));
}

/** Rank (1 = best) of a ward among all wards for a metric; null values rank last. */
export function rankOf(all: Map<string, AreaStats>, ward: string, pick: (s: AreaStats) => number | null, higherIsBetter: boolean) {
  const vals = [...all.entries()].map(([w, s]) => [w, pick(s)] as const).filter(([, v]) => v !== null) as [string, number][];
  vals.sort((a, b) => (higherIsBetter ? b[1] - a[1] : a[1] - b[1]));
  const i = vals.findIndex(([w]) => w === ward);
  return i < 0 ? null : { rank: i + 1, of: vals.length };
}

export const fmt = {
  int: (n: number) => n.toLocaleString("en-IN"),
  pct: (n: number | null) => (n === null ? "No data" : `${n.toFixed(0)}%`),
  days: (n: number | null) => (n === null ? "No data" : n < 10 ? `${n.toFixed(1)} days` : `${Math.round(n)} days`),
  date: (iso: string) => new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }),
  dist: (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`),
};
