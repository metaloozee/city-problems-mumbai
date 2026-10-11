import { WEEKDAYS } from "./data";
import type { Complaint, Filters, GroupBy, Metric, QuerySpec, WardInfo } from "./types";

export const GROUPS: { value: GroupBy; label: string; sql: string }[] = [
  { value: "category", label: "Category", sql: "category" },
  { value: "subcategory", label: "Sub-category (complaint type)", sql: "subcategory" },
  { value: "ward", label: "Ward", sql: "ward" },
  { value: "zone", label: "Zone", sql: "zone" },
  { value: "month", label: "Month", sql: "SUBSTR(date, 1, 7)" },
  { value: "weekday", label: "Weekday", sql: "STRFTIME('%w', date)" },
  { value: "status", label: "Status", sql: "status" },
  { value: "source", label: "Filing channel", sql: "source" },
];
export const METRICS: { value: Metric; label: string; sql: string; unit: string }[] = [
  { value: "count", label: "Count of complaints", sql: "COUNT(*)", unit: "complaints" },
  { value: "avg_res_days", label: "Avg resolution days (closed)", sql: "ROUND(AVG(res_days), 1)", unit: "days" },
  { value: "pct_resolved", label: "% resolved (closed)", sql: "ROUND(100.0 * SUM(CASE WHEN status = 'Closed' THEN 1 ELSE 0 END) / COUNT(*), 1)", unit: "%" },
  { value: "per_100k", label: "Complaints per 100k residents (ward only)", sql: "ROUND(COUNT(*) * 100000.0 / w.population, 1)", unit: "per 100k" },
];

export function groupKey(r: Complaint, g: GroupBy): string {
  switch (g) {
    case "weekday": return WEEKDAYS[r.weekday];
    default: return String((r as any)[g] ?? "");
  }
}

export function applyFilters(rows: Complaint[], f: Filters): Complaint[] {
  const cats = f.categories.length ? new Set(f.categories) : null;
  const wards = f.wards.length ? new Set(f.wards) : null;
  const sts = f.statuses.length ? new Set(f.statuses) : null;
  const q = f.search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!cats || cats.has(r.category)) && (!wards || wards.has(r.ward)) && (!sts || sts.has(r.status)) &&
      (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to) &&
      (!f.minDelay || (r.resDays !== null && r.resDays >= f.minDelay)) &&
      (!q || r.subcategory.toLowerCase().includes(q)),
  );
}

interface Acc { n: number; closed: number; sum: number; k: number }
const newAcc = (): Acc => ({ n: 0, closed: 0, sum: 0, k: 0 });
function add(a: Acc, r: Complaint) {
  a.n++;
  if (r.status === "Closed") a.closed++;
  if (r.resDays !== null) { a.sum += r.resDays; a.k++; }
}
function value(a: Acc, m: Metric, pop?: number): number | null {
  switch (m) {
    case "count": return a.n;
    case "avg_res_days": return a.k ? +(a.sum / a.k).toFixed(1) : null;
    case "pct_resolved": return a.n ? +((100 * a.closed) / a.n).toFixed(1) : null;
    case "per_100k": return pop ? +((a.n * 100000) / pop).toFixed(1) : null;
  }
}

export interface QueryRow { key: string; value: number | null; count: number; split?: Record<string, number | null>; hot?: boolean }
export interface QueryResult { rows: QueryRow[]; splitKeys: string[]; total: number; note?: string }

function sortKeys(keys: string[], g: GroupBy) {
  if (g === "weekday") return keys.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  return keys.sort();
}

export function runQuery(rows: Complaint[], s: QuerySpec, wards: WardInfo[]): QueryResult {
  const pop = new Map(wards.map((w) => [w.ward, w.population]));
  const metric: Metric = s.metric === "per_100k" && s.groupBy !== "ward" ? "count" : s.metric;
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
    .filter(([, a]) => a.n >= s.minCount)
    .map(([key, a]) => ({ key, value: value(a, metric, pop.get(key)), count: a.n }));
  let note: string | undefined;
  if (s.hotspot) {
    const vals = out.map((o) => o.value).filter((v): v is number => v !== null);
    const mean = vals.reduce((x, y) => x + y, 0) / (vals.length || 1);
    const sd = Math.sqrt(vals.reduce((x, y) => x + (y - mean) ** 2, 0) / (vals.length || 1));
    const thr = mean + 0.5 * sd;
    out.forEach((o) => (o.hot = o.value !== null && o.value >= thr));
    out = out.filter((o) => o.hot);
    note = `Hotspot threshold: value ≥ mean + 0.5·σ = ${thr.toFixed(1)} (mean ${mean.toFixed(1)}, σ ${sd.toFixed(1)})`;
  }
  if (s.order === "key") {
    const order = sortKeys(out.map((o) => o.key), s.groupBy);
    out.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  } else {
    const dir = s.order === "desc" ? -1 : 1;
    out.sort((a, b) => dir * ((a.value ?? -Infinity) - (b.value ?? -Infinity)));
  }
  if (s.topN > 0 && s.order !== "key") out = out.slice(0, s.topN);
  if (s.topN > 0 && s.order === "key") out = out.slice(-s.topN);
  let splitKeys: string[] = [];
  if (s.splitBy !== "none") {
    splitKeys = sortKeys([...splitTotals.keys()], s.splitBy);
    if (splitKeys.length > 8 && s.splitBy !== "weekday") {
      splitKeys = [...splitTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map((e) => e[0]);
      note = (note ? note + " · " : "") + "Split limited to the 8 largest groups.";
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
export function toSql(f: Filters, s: QuerySpec): string {
  const g = GROUPS.find((x) => x.value === s.groupBy)!;
  const sp = s.splitBy === "none" ? null : GROUPS.find((x) => x.value === s.splitBy)!;
  const metric: Metric = s.metric === "per_100k" && s.groupBy !== "ward" ? "count" : s.metric;
  const m = METRICS.find((x) => x.value === metric)!;
  const where: string[] = [];
  if (f.categories.length) where.push(`category IN (${f.categories.map(q).join(", ")})`);
  if (f.wards.length) where.push(`ward IN (${f.wards.map(q).join(", ")})`);
  if (f.statuses.length) where.push(`status IN (${f.statuses.map(q).join(", ")})`);
  if (f.from) where.push(`date >= ${q(f.from)}`);
  if (f.to) where.push(`date <= ${q(f.to)}`);
  if (f.minDelay) where.push(`res_days >= ${f.minDelay}`);
  if (f.search.trim()) where.push(`LOWER(subcategory) LIKE ${q("%" + f.search.trim().toLowerCase() + "%")}`);
  const cols = [`${g.sql} AS ${s.groupBy}`, ...(sp ? [`${sp.sql} AS ${s.splitBy}`] : []), `${m.sql} AS ${metric}`, ...(metric !== "count" ? ["COUNT(*) AS complaints"] : [])];
  const having: string[] = [];
  if (s.minCount > 0) having.push(`COUNT(*) >= ${s.minCount}`);
  if (s.hotspot) having.push(`${metric} >= (SELECT AVG(${metric}) + 0.5 * STDDEV(${metric}) FROM per_group)  -- hotspot rule`);
  const lines = [
    `SELECT ${cols.join(",\n       ")}`,
    `FROM   complaints${metric === "per_100k" ? " c JOIN wards w ON w.ward = c.ward" : ""}`,
    ...(where.length ? [`WHERE  ${where.join("\n  AND  ")}`] : []),
    `GROUP BY ${[g.sql, ...(sp ? [sp.sql] : [])].join(", ")}`,
    ...(having.length ? [`HAVING ${having.join("\n   AND ")}`] : []),
    `ORDER BY ${s.order === "key" ? g.sql : `${metric} ${s.order.toUpperCase()}`}`,
    ...(s.topN > 0 ? [`LIMIT ${s.topN}`] : []),
  ];
  return lines.join("\n") + ";";
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
