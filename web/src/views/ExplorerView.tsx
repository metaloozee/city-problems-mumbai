import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Filters, GroupBy, Metric, Problem, QuerySpec } from "../types";
import { GROUPS, METRICS, applyFilters, dateRangeError, download, effectiveMetric, runQuery, toCsv, toSql } from "../query";
import { CATEGORY_NAMES, STATUSES } from "../../shared/categories";
import { WARDS, wardLabel } from "../data";
import { fmt } from "../stats";

/** Validated categorical palette (dataviz reference slots 1 to 6); used only for split series, always with a legend and table. */
const SERIES_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const SERIES_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300"];
const EMPTY: Filters = { categories: [], wards: [], statuses: [], channels: [], from: "", to: "", search: "" };
const base: QuerySpec = { groupBy: "ward", splitBy: "none", metric: "count", topN: 10, minCount: 0, order: "desc", hotspot: false };
const PRESETS: { id: string; title: string; filters?: Partial<Filters>; spec: QuerySpec }[] = [
  { id: "pothole-wards", title: "Wards With Most Potholes", filters: { categories: ["Potholes"] }, spec: base },
  { id: "pothole-month", title: "Potholes by Month", filters: { categories: ["Potholes"] }, spec: { ...base, groupBy: "month", topN: 0, order: "key" } },
  { id: "slowest", title: "Slowest Categories To Fix", spec: { ...base, groupBy: "category", metric: "median_days", topN: 0, minCount: 100 } },
  { id: "fix-rate", title: "Wards With Lowest Fix Rate", spec: { ...base, metric: "fix_rate", order: "asc", minCount: 200 } },
  { id: "hotspots", title: "Hotspot Wards per 100k", spec: { ...base, metric: "per_100k", topN: 0, hotspot: true } },
  { id: "open-backlog", title: "Open Backlog by Category", spec: { ...base, groupBy: "category", metric: "open_now", topN: 0 } },
  { id: "hour", title: "Complaints by Hour of Day", spec: { ...base, groupBy: "hour", topN: 0, order: "key" } },
  { id: "channel-mix", title: "Filing Channel per Category", spec: { ...base, groupBy: "category", splitBy: "channel", topN: 0 } },
];
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function ExplorerView({ rows, dark }: { rows: Problem[]; dark: boolean }) {
  const [f, setF] = useState<Filters>(EMPTY);
  const [spec, setSpec] = useState<QuerySpec>(base);
  const [preset, setPreset] = useState<string | null>(null);
  const channels = useMemo(() => [...new Set(rows.map((r) => r.channel))].sort(), [rows]);
  const filtered = useMemo(() => applyFilters(rows, f), [rows, f]);
  const result = useMemo(() => runQuery(filtered, spec), [filtered, spec]);
  const sql = useMemo(() => toSql(f, spec), [f, spec]);
  const metric: Metric = effectiveMetric(spec);
  const m = METRICS.find((x) => x.value === metric)!;
  const dateErr = dateRangeError(f);
  const series = dark ? SERIES_DARK : SERIES_LIGHT;
  const stacked = spec.splitBy !== "none";
  const isTime = spec.groupBy === "month" || spec.groupBy === "hour" || spec.groupBy === "weekday";
  const chartData = result.rows.map((r) => ({ name: r.key, value: r.value, ...(r.split ?? {}) }));
  const ink = dark ? "#f5f5f5a3" : "#262626a3", grid = dark ? "#2a2a2a" : "#ededed", heat = "#fa5d19";
  const setFilters = (next: Filters) => { setF(next); setPreset(null); };
  const set = (p: Partial<QuerySpec>) => { setSpec({ ...spec, ...p }); setPreset(null); };
  const num = (v: string) => Math.max(0, Math.floor(Number(v)) || 0);
  const exportRows = () => download("query_result.csv", toCsv(result.rows.map((r) => ({
    [spec.groupBy]: r.key, [metric]: r.value, complaints: r.count,
    ...(r.split ? Object.fromEntries(Object.entries(r.split).map(([k, v]) => [`${spec.splitBy}:${k}`, v])) : {}),
  }))));
  const exportFiltered = () => download("filtered_problems.csv", toCsv(filtered.map(({ month, weekday, isOpen, ...r }) => ({ ...r }))));

  return (
    <div className="explorer">
      <aside className="panel filters" aria-label="Filters">
        <div className="row-between">
          <h2 className="label-large">Filters</h2>
          <button type="button" className="fc-btn fc-btn--tertiary fc-btn--sm label-small" onClick={() => setFilters(EMPTY)}>Reset Filters</button>
        </div>
        <p className="body-small muted">{fmt.int(filtered.length)} of {fmt.int(rows.length)} complaints match.</p>

        <fieldset className="field"><legend className="label-small">Category</legend>
          <div className="chips">{CATEGORY_NAMES.map((c) => (
            <button key={c} type="button" className="chip label-x-small" aria-pressed={f.categories.includes(c)} onClick={() => setFilters({ ...f, categories: toggle(f.categories, c) })}>{c}</button>
          ))}</div>
        </fieldset>
        <fieldset className="field"><legend className="label-small">Status</legend>
          <div className="chips">{STATUSES.filter((s) => s !== "Discarded").map((s) => (
            <button key={s} type="button" className="chip label-x-small" aria-pressed={f.statuses.includes(s)} onClick={() => setFilters({ ...f, statuses: toggle(f.statuses, s) })}>{s}</button>
          ))}</div>
        </fieldset>
        <fieldset className="field"><legend className="label-small">Ward</legend>
          <div className="chips">{WARDS.map((w) => (
            <button key={w.ward} type="button" className="chip label-x-small" aria-pressed={f.wards.includes(w.ward)} title={w.areas} onClick={() => setFilters({ ...f, wards: toggle(f.wards, w.ward) })}>{wardLabel(w.ward).replace("Ward ", "")}</button>
          ))}</div>
        </fieldset>
        <fieldset className="field"><legend className="label-small">Filing Channel</legend>
          <div className="chips">{channels.map((c) => (
            <button key={c} type="button" className="chip label-x-small" aria-pressed={f.channels.includes(c)} onClick={() => setFilters({ ...f, channels: toggle(f.channels, c) })}>{c}</button>
          ))}</div>
        </fieldset>
        <fieldset className="field"><legend className="label-small">Reported Between</legend>
          <div className="row2">
            <input aria-label="From date" className="fc-input fc-input--sm body-small" type="date" value={f.from} aria-invalid={!!dateErr} onChange={(e) => setFilters({ ...f, from: e.target.value })} />
            <input aria-label="To date" className="fc-input fc-input--sm body-small" type="date" value={f.to} aria-invalid={!!dateErr} onChange={(e) => setFilters({ ...f, to: e.target.value })} />
          </div>
          {dateErr && <p className="body-small error" role="alert">{dateErr} The date filter is ignored until then.</p>}
        </fieldset>
        <fieldset className="field"><legend className="label-small">Complaint Type Contains</legend>
          <input className="fc-input fc-input--sm body-small" placeholder="Example: manhole, leak, hawker" value={f.search} onChange={(e) => setFilters({ ...f, search: e.target.value })} />
        </fieldset>
        <button type="button" className="fc-btn fc-btn--secondary label-medium wide" onClick={exportFiltered} disabled={!filtered.length}>Download {fmt.int(filtered.length)} Rows as CSV</button>
      </aside>

      <section className="panel query" aria-label="Query builder">
        <h1 className="title-h5">Data explorer</h1>
        <p className="body-medium muted">Group and compare BMC complaints. Queries run in your browser; the SQL shows the same query against the Neon database.</p>
        <div className="chips presets">{PRESETS.map((p) => (
          <button key={p.id} type="button" className="chip label-small" aria-pressed={preset === p.id}
            onClick={() => { setF({ ...EMPTY, ...p.filters }); setSpec(p.spec); setPreset(p.id); }}>{p.title}</button>
        ))}</div>

        <div className="controls">
          <label className="label-small">Group By
            <select className="fc-input fc-input--sm body-small" value={spec.groupBy}
              onChange={(e) => { const g = e.target.value as GroupBy; set({ groupBy: g, splitBy: spec.splitBy === g ? "none" : spec.splitBy, order: ["month", "weekday", "hour"].includes(g) ? "key" : spec.order === "key" ? "desc" : spec.order, hotspot: false }); }}>
              {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
          <label className="label-small">Split By
            <select className="fc-input fc-input--sm body-small" value={spec.splitBy} onChange={(e) => set({ splitBy: e.target.value as GroupBy | "none" })}>
              <option value="none">No Split</option>
              {GROUPS.filter((g) => g.value !== spec.groupBy).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </label>
          <label className="label-small">Measure
            <select className="fc-input fc-input--sm body-small" value={metric} onChange={(e) => set({ metric: e.target.value as Metric })}>
              {METRICS.map((x) => <option key={x.value} value={x.value} disabled={x.value === "per_100k" && spec.groupBy !== "ward"}>{x.label}</option>)}
            </select>
          </label>
          <label className="label-small">Order
            <select className="fc-input fc-input--sm body-small" value={spec.order} onChange={(e) => set({ order: e.target.value as QuerySpec["order"] })}>
              <option value="desc">Highest First</option><option value="asc">Lowest First</option><option value="key">By Group Name or Time</option>
            </select>
          </label>
          <label className="label-small">Show Top
            <input className="fc-input fc-input--sm body-small" type="number" min={0} max={200} value={spec.topN} onChange={(e) => set({ topN: num(e.target.value) })} />
          </label>
          <label className="label-small">Min Complaints per Group
            <input className="fc-input fc-input--sm body-small" type="number" min={0} value={spec.minCount} onChange={(e) => set({ minCount: num(e.target.value) })} />
          </label>
          <label className="check label-small"><input type="checkbox" checked={spec.hotspot} onChange={(e) => set({ hotspot: e.target.checked })} /> Hotspots Only</label>
        </div>

        <details className="sql-box">
          <summary className="label-small">Equivalent SQL</summary>
          <pre className="sql mono-x-small"><code>{sql}</code></pre>
        </details>

        <div className="row-between">
          <p className="body-small muted"><b className="label-small">{result.rows.length} groups</b> · {m.label} over {fmt.int(result.total)} complaints{result.note ? ` · ${result.note}` : ""}</p>
          <button type="button" className="fc-btn fc-btn--secondary fc-btn--sm label-small" onClick={exportRows} disabled={!result.rows.length}>Download Result CSV</button>
        </div>

        {result.rows.length === 0 ? (
          <p className="body-medium muted empty">No groups match. Remove a filter or lower the minimum complaints per group.</p>
        ) : (
          <div className="result">
            <div className="chart" role="img" aria-label={`${m.label} by ${spec.groupBy}`}>
              <ResponsiveContainer width="100%" height={340}>
                {isTime && !stacked ? (
                  <LineChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: ink, fontSize: 12 }} axisLine={{ stroke: grid }} tickLine={false} />
                    <YAxis tick={{ fill: ink, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${grid}`, background: dark ? "#1f1f1f" : "#fff" }} />
                    <Line type="monotone" dataKey="value" name={m.label} stroke={heat} strokeWidth={2} dot={{ r: 4, fill: heat }} activeDot={{ r: 6 }} />
                  </LineChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }} barCategoryGap={4}>
                    <CartesianGrid stroke={grid} vertical={false} />
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={90} tick={{ fill: ink, fontSize: 11 }} axisLine={{ stroke: grid }} tickLine={false} />
                    <YAxis tick={{ fill: ink, fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip cursor={{ fill: dark ? "#ffffff0a" : "#0000000a" }} contentStyle={{ borderRadius: 8, border: `1px solid ${grid}`, background: dark ? "#1f1f1f" : "#fff" }} />
                    {stacked && <Legend verticalAlign="top" wrapperStyle={{ fontSize: 12 }} />}
                    {stacked
                      ? result.splitKeys.map((k, i) => <Bar key={k} dataKey={k} stackId="a" fill={series[i]} stroke={dark ? "#171717" : "#fff"} strokeWidth={1} />)
                      : <Bar dataKey="value" name={m.label} fill={heat} radius={[4, 4, 0, 0]} />}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
            <div className="tablewrap">
              <table className="body-small">
                <thead><tr><th>#</th><th>{GROUPS.find((g) => g.value === spec.groupBy)!.label}</th><th className="r">{m.label}</th>{metric !== "count" && <th className="r">Complaints</th>}{stacked && result.splitKeys.map((k) => <th key={k} className="r">{k}</th>)}</tr></thead>
                <tbody>
                  {result.rows.map((r, i) => (
                    <tr key={r.key}><td className="muted">{i + 1}</td><td>{r.key}</td><td className="r mono-x-small">{r.value ?? "No data"}</td>{metric !== "count" && <td className="r mono-x-small">{fmt.int(r.count)}</td>}{stacked && result.splitKeys.map((k) => <td key={k} className="r mono-x-small">{r.split?.[k] ?? 0}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
