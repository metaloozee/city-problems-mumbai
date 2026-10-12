import { useCallback, useEffect, useMemo, useState } from "react";

/** True when the viewport matches the CSS media query (used to switch to the mobile map-first layout). */
function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h); h();
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}
import { loadData } from "./data";
import type { Complaint, Filters, QuerySpec, WardInfo } from "./types";
import { applyFilters, download, runQuery, toCsv, METRICS } from "./query";
import MapView, { type MapMode } from "./components/MapView";
import FiltersPanel from "./components/Filters";
import QueryPanel from "./components/QueryPanel";
import { PRESETS, type Preset } from "./presets";

const EMPTY: Filters = { categories: [], wards: [], statuses: [], from: "", to: "", minDelay: 0, search: "" };
const DEFAULT_SPEC: QuerySpec = PRESETS[0].spec;
type ChoroMetric = "count" | "per_100k" | "avg_res_days" | "pct_resolved" | "query";

export default function App() {
  const [data, setData] = useState<{ rows: Complaint[]; geo: any; wards: WardInfo[] } | null>(null);
  const [err, setErr] = useState("");
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [spec, setSpec] = useState<QuerySpec>(DEFAULT_SPEC);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [mode, setMode] = useState<MapMode>("clusters");
  const [choro, setChoro] = useState<ChoroMetric>("per_100k");
  const isMobile = useMedia("(max-width: 820px)");
  const [sheet, setSheet] = useState(false);
  const [tab, setTab] = useState<"filters" | "query" | "about">("filters");
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);

  useEffect(() => { loadData().then(setData).catch((e) => setErr(String(e))); }, []);

  const rows = data?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);
  const result = useMemo(() => (data ? runQuery(filtered, spec, data.wards) : { rows: [], splitKeys: [], total: 0 }), [filtered, spec, data]);

  const catList = useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.category, (m.get(r.category) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  }, [rows]);
  const statuses = useMemo(() => [...new Set(rows.map((r) => r.status))].sort(), [rows]);
  const wardCodes = useMemo(() => (data?.wards.map((w) => w.ward) ?? []).sort(), [data]);
  const [minDate, maxDate] = useMemo(() => {
    let a = "9999", b = "";
    for (const r of rows) { if (r.date < a) a = r.date; if (r.date > b) b = r.date; }
    return [a, b];
  }, [rows]);

  const stats = useMemo(() => {
    const n = filtered.length; let closed = 0, open = 0, s = 0, k = 0;
    const w = new Map<string, number>(), c = new Map<string, number>();
    for (const r of filtered) {
      if (r.status === "Closed") closed++;
      if (r.status === "In Progress" || r.status === "In Review" || r.status === "New") open++;
      if (r.resDays !== null) { s += r.resDays; k++; }
      w.set(r.ward, (w.get(r.ward) ?? 0) + 1); c.set(r.category, (c.get(r.category) ?? 0) + 1);
    }
    const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { n, pctClosed: n ? (100 * closed) / n : 0, open, avg: k ? s / k : 0, topWard: top(w), topCat: top(c) };
  }, [filtered]);

  const wardValues = useMemo(() => {
    const out = new Map<string, number | null>();
    if (!data) return out;
    if (choro === "query") {
      if (spec.groupBy === "ward") result.rows.forEach((r) => out.set(r.key, r.value));
    } else {
      runQuery(filtered, { groupBy: "ward", splitBy: "none", metric: choro, topN: 0, minCount: 20, order: "desc", hotspot: false }, data.wards).rows.forEach((r) => out.set(r.key, r.value));
    }
    return out;
  }, [filtered, choro, data, result, spec.groupBy]);
  const qMetric = METRICS.find((m) => m.value === (spec.metric === "per_100k" && spec.groupBy !== "ward" ? "count" : spec.metric))!;
  const wardLabel = choro === "query" ? `Query: ${qMetric.label}` : METRICS.find((m) => m.value === choro)!.label.replace(" (ward only)", "");

  const onWardClick = useCallback((w: string) => setFilters((f) => ({ ...f, wards: f.wards.includes(w) ? f.wards.filter((x) => x !== w) : [...f.wards, w] })), []);
  const applyPreset = (p: Preset) => {
    setFilters((f) => ({ ...f, categories: p.category ? [p.category] : [] }));
    setSpec(p.spec); setActivePreset(p.id);
    if (p.spec.groupBy === "ward") { setMode("choropleth"); setChoro("query"); }
  };
  const onSpec = (s: QuerySpec) => { setSpec(s); setActivePreset(null); };
  const showOnMap = () => { setMode("choropleth"); setChoro("query"); };
  const exportFiltered = () => download("filtered_complaints.csv", toCsv(filtered.map(({ month, weekday, ...r }) => ({ ...r }))));

  if (err) return <div className="boot">Failed to load data: {err}</div>;
  if (!data) return <div className="boot"><div className="spin" />Loading ~97k Mumbai civic complaints…</div>;

  const filtersEl = (
    <FiltersPanel f={filters} set={(f) => { setFilters(f); setActivePreset(null); }} categories={catList} wards={wardCodes} statuses={statuses}
      minDate={minDate} maxDate={maxDate} shown={filtered.length} total={rows.length} onReset={() => { setFilters(EMPTY); setActivePreset(null); }} />
  );
  const queryEl = <QueryPanel spec={spec} setSpec={onSpec} filters={filters} result={result} activePreset={activePreset} onPreset={applyPreset} showOnMap={showOnMap} />;
  const modeLabel = (m: MapMode) => (m === "clusters" ? "Markers" : m === "heatmap" ? "Heatmap" : "Ward map");
  const colourSelect = (
    <label className="inline">Colour by
      <select value={choro} onChange={(e) => setChoro(e.target.value as ChoroMetric)}>
        <option value="count">Complaint count</option>
        <option value="per_100k">Complaints per 100k residents</option>
        <option value="avg_res_days">Avg resolution days</option>
        <option value="pct_resolved">% resolved</option>
        <option value="query" disabled={spec.groupBy !== "ward"}>Current query result (ward)</option>
      </select>
    </label>
  );
  const cardsEl = (
    <>
      <Card label="Complaints" value={stats.n.toLocaleString()} sub="matching filters" />
      <Card label="Resolved" value={`${stats.pctClosed.toFixed(1)}%`} sub="status = Closed" />
      <Card label="Still open" value={stats.open.toLocaleString()} sub="new / in review / in progress" />
      <Card label="Avg days to close" value={stats.avg ? stats.avg.toFixed(1) : "–"} sub="closed complaints" />
      <Card label="Busiest ward" value={stats.topWard ? `Ward ${stats.topWard[0]}` : "–"} sub={stats.topWard ? `${stats.topWard[1].toLocaleString()} complaints` : ""} />
      <Card label="Top category" value={stats.topCat ? stats.topCat[0] : "–"} sub={stats.topCat ? `${stats.topCat[1].toLocaleString()} complaints` : ""} small />
    </>
  );
  const footerText = (
    <>Data: BMC / MCGM MARG public ArcGIS service (CCRS complaints + Pothole QuickFix), fetched Oct 2026 · Ward boundaries: same service · Map © OpenStreetMap contributors.
    Resolution time = complaint date → date of attended (“after”) image. Not an official BMC product.</>
  );

  if (isMobile) {
    return (
      <div className="m-root">
        <div className="m-map">
          <MapView rows={filtered} geo={data.geo} mode={mode} wardValues={wardValues} wardLabel={wardLabel} selectedWards={filters.wards} onWardClick={onWardClick} />
        </div>
        <div className="m-top">
          <div className="m-title"><h1>🏙️ City Problems <span>· Mumbai</span></h1><span className="muted small">{filtered.length.toLocaleString()} shown</span></div>
          <div className="m-modes">
            <div className="seg">
              {(["clusters", "heatmap", "choropleth"] as MapMode[]).map((m) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{modeLabel(m)}</button>
              ))}
            </div>
            {mode === "choropleth" && colourSelect}
          </div>
          <div className="strip">{cardsEl}</div>
        </div>
        {!sheet && <button className="fab" onClick={() => setSheet(true)} aria-label="Open filters and queries">☰ Filters &amp; Queries{filters.categories.length + filters.wards.length + filters.statuses.length > 0 ? " •" : ""}</button>}
        <div className={"sheet" + (sheet ? " open" : "")} role="dialog" aria-label="Filters and queries" aria-hidden={!sheet}>
          <div className="sheet-bar">
            <div className="tabs">
              {([["filters", "Filters"], ["query", "Queries"], ["about", "About"]] as const).map(([k, l]) => (
                <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>
              ))}
            </div>
            <button className="btn close" onClick={() => setSheet(false)} aria-label="Close panel">✕</button>
          </div>
          <div className="sheet-body">
            {sheet && tab === "filters" && filtersEl}
            {sheet && tab === "query" && queryEl}
            {sheet && tab === "about" && (
              <section className="panel">
                <button className="btn primary" onClick={exportFiltered}>Export filtered CSV ({filtered.length.toLocaleString()})</button>
                <p>Real BMC complaints (potholes, garbage, drainage, water…) · {minDate} → {maxDate} · MyBMC MARG open service</p>
                <footer>{footerText}</footer>
              </section>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>🏙️ City Problems <span>· Mumbai</span></h1>
          <p>Real BMC complaints (potholes, garbage, drainage, water…) · {minDate} → {maxDate} · MyBMC MARG open service</p>
        </div>
        <button className="btn primary" onClick={exportFiltered}>Export filtered CSV ({filtered.length.toLocaleString()})</button>
      </header>

      <section className="cards">{cardsEl}</section>

      <main className="grid">
        {filtersEl}
        <section className="panel mapbox">
          <div className="maptools">
            <div className="seg">
              {(["clusters", "heatmap", "choropleth"] as MapMode[]).map((m) => (
                <button key={m} className={mode === m ? "on" : ""} onClick={() => setMode(m)}>{modeLabel(m)}</button>
              ))}
            </div>
            {mode === "choropleth" && colourSelect}
            <span className="muted small">{mode === "choropleth" ? "Click a ward to filter by it" : `${filtered.length.toLocaleString()} points`}</span>
          </div>
          <MapView rows={filtered} geo={data.geo} mode={mode} wardValues={wardValues} wardLabel={wardLabel} selectedWards={filters.wards} onWardClick={onWardClick} />
        </section>
      </main>

      {queryEl}

      <footer>{footerText}</footer>
    </div>
  );
}

function Card({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return <div className="card"><div className="cl">{label}</div><div className={"cv" + (small ? " sm" : "")}>{value}</div><div className="cs">{sub}</div></div>;
}
