/** One BMC complaint from web/public/data/problems.csv (mapped rows only). */
export interface Problem {
  id: string; date: string; month: string; weekday: number; hour: number;
  category: string; subcategory: string; ward: string; status: string; isOpen: boolean;
  lat: number; lon: number; daysToClose: number | null; channel: string; escalated: boolean;
}
/** A report filed by a resident in this app (from /api/reports, or saved on this device when no database is connected). */
export interface CitizenReport {
  id: string; reported_at: string; category: string; description: string; landmark: string | null;
  ward: string; lat: number; lon: number; status: string; supporters: number; local?: boolean;
}
export interface WardInfo { ward: string; name: string; areas: string; population: number; centroid: [number, number] }
/** The area the citizen is looking at: always a ward, optionally an exact point inside it. */
export interface Place { ward: string; lat?: number; lon?: number; label?: string }

export interface Filters {
  categories: string[]; wards: string[]; statuses: string[]; channels: string[];
  from: string; to: string; search: string;
}
export type GroupBy = "category" | "subcategory" | "ward" | "month" | "weekday" | "hour" | "status" | "channel";
export type Metric = "count" | "open_now" | "median_days" | "fix_rate" | "per_100k";
export interface QuerySpec {
  groupBy: GroupBy; splitBy: GroupBy | "none"; metric: Metric; topN: number; minCount: number;
  order: "desc" | "asc" | "key"; hotspot: boolean;
}
