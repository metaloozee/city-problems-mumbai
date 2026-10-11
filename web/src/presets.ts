import type { QuerySpec } from "./types";
export interface Preset { id: string; title: string; blurb: string; category: string | null; spec: QuerySpec }
const base: QuerySpec = { groupBy: "ward", splitBy: "none", metric: "count", topN: 10, minCount: 0, order: "desc", hotspot: false };
export const PRESETS: Preset[] = [
  { id: "top-wards-potholes", title: "Top 10 wards by potholes", blurb: "Which wards file the most pothole complaints?", category: "Potholes", spec: { ...base } },
  { id: "monthly-potholes", title: "Monthly trend of potholes", blurb: "Pothole complaints per month (monsoon effect).", category: "Potholes", spec: { ...base, groupBy: "month", topN: 0, order: "key" } },
  { id: "slowest-categories", title: "Slowest-resolved categories", blurb: "Average days to close, per category (min 100 complaints).", category: null, spec: { ...base, groupBy: "category", metric: "avg_res_days", topN: 0, minCount: 100 } },
  { id: "hotspots", title: "Hotspot wards (per 100k residents)", blurb: "Wards whose complaint rate is ≥ mean + 0.5σ.", category: null, spec: { ...base, metric: "per_100k", topN: 0, hotspot: true } },
  { id: "category-mix", title: "Category mix per ward", blurb: "Stacked complaint counts by category for the busiest wards.", category: null, spec: { ...base, splitBy: "category", topN: 12 } },
  { id: "worst-resolution-wards", title: "Wards with lowest % resolved", blurb: "Where complaints stay open the longest (min 200 complaints).", category: null, spec: { ...base, metric: "pct_resolved", order: "asc", minCount: 200 } },
  { id: "weekday-garbage", title: "Garbage complaints by weekday", blurb: "Which day do garbage complaints peak?", category: "Garbage & Sanitation", spec: { ...base, groupBy: "weekday", topN: 0, order: "key" } },
  { id: "water-leaks-wards", title: "Water supply complaints per 100k", blurb: "Wards with most water-supply complaints relative to population.", category: "Water Supply", spec: { ...base, metric: "per_100k" } },
];
