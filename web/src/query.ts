import { WEEKDAYS, WARDS, wardLabel } from "./data";
import { median } from "./stats";
import type { Filters, GroupBy, Metric, Problem, QuerySpec } from "./types";

export const GROUPS: { value: GroupBy; label: string; sql: string }[] = [
  { value: "category", label: "Category", sql: "category" },
  { value: "subcategory", label: "Complaint Type", sql: "subcategory" },
  { value: "ward", label: "Ward", sql: "ward" },
  { value: "month", label: "Month", sql: "to_char(reported_at, 'YYYY-MM')" },
  { value: "weekday", label: "Weekday", sql: "to_char(reported_at, 'Dy')" },
  { value: "hour", label: "Hour of Day (IST)", sql: "extract(hour FROM reported_at)" },
  { value: "status", label: "Status", sql: "status" },
  { value: "channel", label: "Filing Channel", sql: "channel" },
];
export const METRICS: { value: Metric; label: string; sql: string }[] = [
  { value: "count", label: "Complaints", sql: "count(*)" },
  { value: "open_now", label: "Open Now", sql: "count(*) FILTER (WHERE is_open)" },
  { value: "fix_rate", label: "Fix Rate %", sql: "round(100.0 * count(*) FILTER (WHERE status = 'Resolved') / nullif(count(*) FILTER (WHERE status IN ('Resolved', 'Rejected')), 0), 1)" },
  { value: "median_days", label: "Median Days To Fix", sql: "percentile_cont(0.5) WITHIN GROUP (ORDER BY days_to_close) FILTER (WHERE status = 'Resolved')" },
  { value: "per_100k", label: "Per 100k Residents (Ward Only)", sql: "round(count(*) * 100000.0 / w.population, 1)" },
];
export const effectiveMetric = (s: QuerySpec): Metric => (s.metric === "per_100k" && s.groupBy !== "ward" ? "count" : s.metric);

export function groupKey(r: Problem, g: GroupBy): string {
  switch (g) {
    case "weekday": return WEEKDAYS[r.weekday];
    case "hour": return String(r.hour).padStart(2, "0");
    case "ward": return wardLabel(r.ward);
    default: return String(r[g] ?? "");
  }
}

/** Returns a message when the date range is impossible, so the UI can say so instead of showing zero rows. */
export function dateRangeError(f: Filters): string {
  return f.from && f.to && f.from > f.to ? "The start date is after the end date. Change one of them." : "";
}

export function applyFilters(rows: Problem[], f: Filters): Problem[] {
  if (dateRangeError(f)) return rows.filter((r) => matches(r, { ...f, from: "", to: "" }));
  return rows.filter((r) => matches(r, f));
}
function matches(r: Problem, f: Filters): boolean {
  const q = f.search.trim().toLowerCase();
  return (!f.categories.length || f.categories.includes(r.category)) && (!f.wards.length || f.wards.includes(r.ward)) &&
    (!f.statuses.length || f.statuses.includes(r.status)) && (!f.channels.length || f.channels.includes(r.channel)) &&
    (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) && (!q || r.subcategory.toLowerCase().includes(q));
}

interface Acc { n: number; open: number; resolved: number; rejected: number; days: number[] }
const newAcc = (): Acc => ({ n: 0, open: 0, resolved: 0, rejected: 0, days: [] });
function add(a: Acc, r: Problem) {
  a.n++;
  if (r.isOpen) a.open++;
  if (r.status === "Resolved") { a.resolved++; if (r.daysToClose !== null) a.days.push(r.daysToClose); }
  if (r.status === "Rejected") a.rejected++;
}
function value(a: Acc, m: Metric, pop?: number): number | null {
  switch (m) {
    case "count": return a.n;
    case "open_now": return a.open;
    case "fix_rate": return a.resolved + a.rejected ? +((100 * a.resolved) / (a.resolved + a.rejected)).toFixed(1) : null;
    case "median_days": { const v = median(a.days); return v === null ? null : +v.toFixed(1); }
    case "per_100k": return pop ? +((a.n * 100000) / pop).toFixed(1) : null;
  }
}

export interface QueryRow { key: string; value: number | null; count: number; split?: Record<string, number | null> }
export interface QueryResult { rows: QueryRow[]; splitKeys: string[]; total: number; note?: string }

function sortKeys(keys: string[], g: GroupBy) {
  if (g === "weekday") return keys.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  return keys.sort();
}

export function runQuery(rows: Problem[], s: QuerySpec): QueryResult {
  const pop = new Map(WARDS.map((w) => [wardLabel(w.ward), w.population]));
  const metric = effectiveMetric(s);
  const topN = Math.max(0, Math.floor(s.topN) || 0), minCount = Math.max(0, Math.floor(s.minCount) || 0);
  const groups = new Map<string, Acc>();
  const splits = new Map<string, Map<string, Acc>>();
  const splitTotals = new Map<string, number>();
  for (const r of rows) {
    const k = groupKey(r, s.groupBy);
    let a = groups.get(k); if (!a) groups.set(k, (a = newAcc())); add(a, r);
    if (s.splitBy !== "none") {
      const sk = groupKey(r, s.splitBy);
      splitTotals.set(sk, (splitTotals.get(sk) ?? 0) + 1);
      let m = splits.get(k); if (!m) splits.set(k, (m = new Map()));
      let b = m.get(sk); if (!b) m.set(sk, (b = newAcc())); add(b, r);
    }
  }
  let out: QueryRow[] = [...groups.entries()]
    .filter(([, a]) => a.n >= minCount)
    .map(([key, a]) => ({ key, value: value(a, metric, pop.get(key)), count: a.n }));
  let note: string | undefined;
  if (s.hotspot) {
    const vals = out.map((o) => o.value).filter((v): v is number => v !== null);
    const mean = vals.reduce((x, y) => x + y, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / (vals.length || 1));
    const thr = mean + 0.5 * sd;
    out = out.filter((o) => o.value !== null && o.value >= thr);
    note = `Hotspot threshold: value ≥ mean + 0.5σ = ${thr.toFixed(1)} (mean ${mean.toFixed(1)}, σ ${sd.toFixed(1)})`;
  }
  if (s.order === "key") {
    const order = sortKeys(out.map((o) => o.key), s.groupBy);
    out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
    if (topN > 0) out = out.slice(-topN);
  } else {
    const dir = s.order === "desc" ? -1 : 1;
    out.sort((a, b) => (a.value === null ? 1 : b.value === null ? -1 : dir * (a.value - b.value)));
    if (topN > 0) out = out.slice(0, topN);
  }
  let splitKeys: string[] = [];
  if (s.splitBy !== "none") {
    splitKeys = sortKeys([...splitTotals.keys()], s.splitBy);
    if (splitKeys.length > 6) {
      splitKeys = [...splitTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map((e) => e[0]);
      note = (note ? note + " · " : "") + "Split shows the 6 largest groups.";
    }
    for (const o of out) {
      o.split = {};
      for (const sk of splitKeys) {
        const b = splits.get(o.key)?.get(sk);
        o.split[sk] = b ? value(b, metric, pop.get(o.key)) : 0;
      }
    }
  }
  return { rows: out, splitKeys, total: rows.length, note };
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
/** The equivalent PostgreSQL query against the Neon `problems` table. */
export function toSql(f: Filters, s: QuerySpec): string {
  const g = GROUPS.find((x) => x.value === s.groupBy)!;
  const sp = s.splitBy === "none" ? null : GROUPS.find((x) => x.value === s.splitBy)!;
  const metric = effectiveMetric(s);
  const m = METRICS.find((x) => x.value === metric)!;
  const where = ["has_location"];
  if (f.categories.length) where.push(`category IN (${f.categories.map(q).join(", ")})`);
  if (f.wards.length) where.push(`ward IN (${f.wards.map(q).join(", ")})`);
  if (f.statuses.length) where.push(`status IN (${f.statuses.map(q).join(", ")})`);
  if (f.channels.length) where.push(`channel IN (${f.channels.map(q).join(", ")})`);
  if (f.from && !dateRangeError(f)) where.push(`reported_at >= ${q(f.from)}`);
  if (f.to && !dateRangeError(f)) where.push(`reported_at < ${q(f.to)}::date + 1`);
  if (f.search.trim()) where.push(`subcategory ILIKE ${q("%" + f.search.trim() + "%")}`);
  const cols = [`${g.sql} AS ${s.groupBy}`, ...(sp ? [`${sp.sql} AS ${s.splitBy}`] : []), `${m.sql} AS ${metric}`, ...(metric !== "count" ? ["count(*) AS complaints"] : [])];
  const having: string[] = [];
  if (s.minCount > 0) having.push(`count(*) >= ${Math.floor(s.minCount)}`);
  const lines = [
    `SELECT ${cols.join(",\n       ")}`,
    `FROM   problems p${metric === "per_100k" ? " JOIN wards w USING (ward)" : ""}`,
    `WHERE  ${where.join("\n  AND  ")}`,
    `GROUP BY ${[g.sql, ...(sp ? [sp.sql] : []), ...(metric === "per_100k" ? ["w.population"] : [])].join(", ")}`,
    ...(having.length ? [`HAVING ${having.join(" AND ")}`] : []),
    `ORDER BY ${s.order === "key" ? "1" : `${metric} ${s.order.toUpperCase()} NULLS LAST`}`,
    ...(s.topN > 0 ? [`LIMIT ${Math.floor(s.topN)}`] : []),
  ];
  return lines.join("\n") + ";" + (s.hotspot ? "\n-- then keep groups whose value ≥ mean + 0.5 × standard deviation" : "");
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
