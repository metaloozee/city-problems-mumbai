export interface Complaint {
  id: string; date: string; month: string; weekday: number; category: string; subcategory: string;
  ward: string; zone: string; status: string; lat: number; lon: number; resDays: number | null; source: string; dataset: string;
}
export interface Filters {
  categories: string[]; wards: string[]; statuses: string[];
  from: string; to: string; minDelay: number; search: string;
}
export type GroupBy = "category" | "subcategory" | "ward" | "zone" | "month" | "weekday" | "status" | "source";
export type Metric = "count" | "avg_res_days" | "pct_resolved" | "per_100k";
export interface QuerySpec {
  groupBy: GroupBy; splitBy: GroupBy | "none"; metric: Metric; topN: number; minCount: number;
  order: "desc" | "asc" | "key"; hotspot: boolean;
}
export interface WardInfo { ward: string; population: number }
