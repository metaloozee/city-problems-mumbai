import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Filters, GroupBy, Metric, QuerySpec } from "../types";
import { GROUPS, METRICS, download, toCsv, toSql, type QueryResult } from "../query";
import { PRESETS, type Preset } from "../presets";
import { CAT_COLORS } from "../colors";

const PALETTE = ["#e4572e", "#3a86ff", "#76b041", "#f3a712", "#9b5de5", "#00b4d8", "#f15bb5", "#2d936c", "#8d99ae"];

interface Props {
  spec: QuerySpec; setSpec: (s: QuerySpec) => void; filters: Filters; result: QueryResult; activePreset: string | null;
  onPreset: (p: Preset) => void; showOnMap: () => void;
}

export default function QueryPanel({ spec, setSpec, filters, result, activePreset, onPreset, showOnMap }: Props) {
  const metric: Metric = spec.metric === "per_100k" && spec.groupBy !== "ward" ? "count" : spec.metric;
  const m = METRICS.find((x) => x.value === metric)!;
  const sql = useMemo(() => toSql(filters, spec), [filters, spec]);
  const stacked = spec.splitBy !== "none";
  const chartData = result.rows.map((r) => ({ name: r.key, value: r.value, ...(r.split ?? {}) }));
  const isTime = spec.groupBy === "month" || spec.groupBy === "weekday";
  const set = (p: Partial<QuerySpec>) => setSpec({ ...spec, ...p });
  const exportCsv = () =>
    download("query_result.csv", toCsv(result.rows.map((r) => ({ [spec.groupBy]: r.key, [metric]: r.value, complaints: r.count, ...(r.split ? Object.fromEntries(Object.entries(r.split).map(([k, v]) => [`${spec.splitBy}:${k}`, v])) : {}) }))));
  const color = (k: string) => (spec.splitBy === "category" ? CAT_COLORS[k] : PALETTE[result.splitKeys.indexOf(k) % PALETTE.length]);

  return (
    <section className="panel query">
      <div className="panel-h">
        <h2>Query builder</h2>
        <span className="muted small">Runs in your browser over the filtered complaints · SQL shown is the equivalent query</span>
      </div>

      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={"preset" + (activePreset === p.id ? " on" : "")} onClick={() => onPreset(p)} title={p.blurb}>{p.title}</button>
        ))}
      </div>

      <div className="controls">
        <label>Group by
          <select value={spec.groupBy} onChange={(e) => set({ groupBy: e.target.value as GroupBy, order: e.target.value === "month" || e.target.value === "weekday" ? "key" : spec.order === "key" ? "desc" : spec.order, hotspot: false })}>
            {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </label>
        <label>Split by (stacked)
          <select value={spec.splitBy} onChange={(e) => set({ splitBy: e.target.value as GroupBy | "none" })}>
            <option value="none">— none —</option>
            {GROUPS.filter((g) => g.value !== spec.groupBy).map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
        </label>
        <label>Metric
          <select value={spec.metric} onChange={(e) => set({ metric: e.target.value as Metric })}>
            {METRICS.map((x) => <option key={x.value} value={x.value} disabled={x.value === "per_100k" && spec.groupBy !== "ward"}>{x.label}</option>)}
          </select>
        </label>
        <label>Top N <input type="number" min={0} max={200} value={spec.topN} onChange={(e) => set({ topN: +e.target.value })} /><span className="muted small"> 0 = all</span></label>
        <label>Min complaints / group <input type="number" min={0} value={spec.minCount} onChange={(e) => set({ minCount: +e.target.value })} /></label>
        <label>Order
          <select value={spec.order} onChange={(e) => set({ order: e.target.value as QuerySpec["order"] })}>
            <option value="desc">Highest first</option><option value="asc">Lowest first</option><option value="key">By group (time/alpha)</option>
          </select>
        </label>
        <label className="inline"><input type="checkbox" checked={spec.hotspot} onChange={(e) => set({ hotspot: e.target.checked })} /> Hotspots only (≥ mean + 0.5σ)</label>
      </div>

      <pre className="sql"><code>{sql}</code></pre>

      <div className="result-h">
        <b>{result.rows.length} rows</b> · {m.label} <span className="muted small">over {result.total.toLocaleString()} filtered complaints{result.note ? ` · ${result.note}` : ""}</span>
        <span className="spacer" />
        {spec.groupBy === "ward" && <button className="btn" onClick={showOnMap}>Highlight on map</button>}
        <button className="btn" onClick={exportCsv}>Export CSV</button>
      </div>

      <div className="result">
        <div className="chart">
          {result.rows.length === 0 ? <p className="muted pad">No rows — loosen the filters or threshold.</p> : (
            <ResponsiveContainer width="100%" height={340}>
              {isTime && !stacked ? (
                <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><Tooltip />
                  <Line type="monotone" dataKey="value" name={m.label} stroke="#e4572e" strokeWidth={3} dot />
                </LineChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" interval={0} angle={-30} textAnchor="end" height={70} tick={{ fontSize: 11 }} /><YAxis /><Tooltip />
                  {stacked ? <Legend verticalAlign="top" wrapperStyle={{ fontSize: 11 }} /> : null}
                  {stacked
                    ? result.splitKeys.map((k) => <Bar key={k} dataKey={k} stackId="a" fill={color(k)} />)
                    : <Bar dataKey="value" name={m.label} fill="#e4572e" radius={[4, 4, 0, 0]} />}
                </BarChart>
              )}
            </ResponsiveContainer>
          )}
        </div>
        <div className="tablewrap">
          <table>
            <thead><tr><th>#</th><th>{spec.groupBy}</th><th className="r">{metric}</th>{metric !== "count" && <th className="r">complaints</th>}{stacked && result.splitKeys.map((k) => <th key={k} className="r">{k}</th>)}</tr></thead>
            <tbody>
              {result.rows.map((r, i) => (
                <tr key={r.key}><td>{i + 1}</td><td>{r.key}</td><td className="r"><b>{r.value ?? "–"}</b></td>{metric !== "count" && <td className="r">{r.count.toLocaleString()}</td>}{stacked && result.splitKeys.map((k) => <td key={k} className="r">{r.split?.[k] ?? 0}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
