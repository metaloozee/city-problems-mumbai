import { useMemo, useState } from "react";
import MapView from "../components/MapView";
import { PlaceSearch, Stat, StatusBadge, type FoundPlace } from "../components/common";
import type { CitizenReport, Place, Problem } from "../types";
import { WARDS, WARD_BY_CODE, wardLabel } from "../data";
import { areaStats, fmt, rankOf, statsByWard, type AreaStats } from "../stats";
import { distanceM } from "../../shared/geo";

export type Period = "30" | "90" | "all";
interface Props {
  rows: Problem[]; reports: CitizenReport[]; dataEnd: string; dataStart: string; dark: boolean;
  place: Place | null; choosePlace: (p: FoundPlace | { ward: string }) => string | null; clearPlace: () => void;
  onReportHere: () => void; onSupport: (id: string) => Promise<number | string>;
}
type Item = { kind: "bmc"; r: Problem; d: number | null } | { kind: "citizen"; r: CitizenReport; d: number | null };

export function periodStart(period: Period, dataEnd: string): string {
  if (period === "all") return "";
  const d = new Date(dataEnd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - +period + 1);
  return d.toISOString().slice(0, 10);
}

export default function AreaView({ rows, reports, dataEnd, dataStart, dark, place, choosePlace, clearPlace, onReportHere, onSupport }: Props) {
  const [period, setPeriod] = useState<Period>("90");
  const [radius, setRadius] = useState(500);
  const [show, setShow] = useState<"all" | "open" | "resolved">("open");
  const [cat, setCat] = useState<string | null>(null);
  const [limit, setLimit] = useState(25);
  const [msg, setMsg] = useState("");

  const since = periodStart(period, dataEnd);
  const inPeriod = useMemo(() => (since ? rows.filter((r) => r.date >= since) : rows), [rows, since]);
  const byWard = useMemo(() => statsByWard(inPeriod), [inPeriod]);
  const city = useMemo(() => areaStats(inPeriod, WARDS.reduce((s, w) => s + w.population, 0)), [inPeriod]);
  const openCity = useMemo(() => rows.reduce((n, r) => n + (r.isOpen ? 1 : 0), 0), [rows]);

  const ward = place ? WARD_BY_CODE.get(place.ward) ?? null : null;
  const wardRows = useMemo(() => (place ? rows.filter((r) => r.ward === place.ward) : []), [rows, place]);
  const ws: AreaStats | null = ward ? byWard.get(ward.ward) ?? null : null;
  const openWard = useMemo(() => wardRows.reduce((n, r) => n + (r.isOpen ? 1 : 0), 0), [wardRows]);
  const point = place?.lat !== undefined && place.lon !== undefined ? { lat: place.lat, lon: place.lon } : null;

  const items: Item[] = useMemo(() => {
    if (!place) return [];
    const keep = (status: string, category: string, date: string) =>
      (show === "all" || (show === "open" ? status !== "Resolved" && status !== "Rejected" && status !== "Discarded" : status === "Resolved")) &&
      (!cat || category === cat) && (!since || date >= since);
    const out: Item[] = [];
    const near = (lat: number, lon: number) => (point ? distanceM(point.lat, point.lon, lat, lon) : null);
    const dLat = radius / 111000, dLon = radius / 105000;
    const pool = point ? rows.filter((r) => Math.abs(r.lat - point.lat) < dLat && Math.abs(r.lon - point.lon) < dLon) : wardRows;
    for (const r of pool) {
      if (!keep(r.status, r.category, r.date)) continue;
      const d = near(r.lat, r.lon);
      if (d === null || d <= radius) out.push({ kind: "bmc", r, d });
    }
    for (const r of reports) {
      if (!keep(r.status, r.category, r.reported_at.slice(0, 10))) continue;
      const d = near(r.lat, r.lon);
      if (point ? d !== null && d <= radius : r.ward === place.ward) out.push({ kind: "citizen", r, d });
    }
    const dateOf = (i: Item) => (i.kind === "bmc" ? i.r.date : i.r.reported_at);
    return out.sort((a, b) => (a.kind === b.kind ? dateOf(b).localeCompare(dateOf(a)) : a.kind === "citizen" ? -1 : 1));
  }, [place, point, rows, wardRows, reports, radius, show, cat, since]);

  const mapRows = useMemo(() => {
    const base = place ? wardRows : rows;
    // The map follows the same Open / Fixed / All toggle as the list, so both show the same problems.
    return base.filter((r) => (!since || r.date >= since) && (!cat || r.category === cat) &&
      (show === "all" || (show === "open" ? r.isOpen : r.status === "Resolved")));
  }, [place, wardRows, rows, since, cat, show]);
  const mapReports = useMemo(() => reports.filter((r) => !cat || r.category === cat), [reports, cat]);

  const pick = (p: FoundPlace | { ward: string }) => {
    const err = choosePlace(p);
    setMsg(err ?? ""); setLimit(25);
    if (!err) window.scrollTo({ top: 0 }); // on phones the list sits below the map; start the new area at the top
  };
  const view = place
    ? { center: (point ? [point.lat, point.lon] : ward!.centroid) as [number, number], zoom: point ? 16 : 14, key: `${place.ward}:${place.lat}:${place.lon}` }
    : { center: [19.08, 72.88] as [number, number], zoom: 11, key: "city" };
  const fixRank = ward ? rankOf(byWard, ward.ward, (s) => s.fixRate, true) : null;
  const daysRank = ward ? rankOf(byWard, ward.ward, (s) => s.medianDays, false) : null;
  const periodLabel = period === "all" ? `${fmt.date(dataStart)} to ${fmt.date(dataEnd)}` : `the last ${period} days of data, to ${fmt.date(dataEnd)}`;

  return (
    <div className="split">
      <aside className="panel" aria-label="Your area">
        {!place ? (
          <>
            <h1 className="title-h5">See what needs fixing where you live</h1>
            <p className="body-medium muted">Search a place, use your location or tap the map. You will see open problems near you, how fast BMC fixes them in your ward, and what your neighbours have reported.</p>
            <PlaceSearch onFound={pick} />
            {msg && <p className="body-small error" role="alert">{msg}</p>}
            <section className="fc-card fc-card--compact">
              <h2 className="label-large">Mumbai Right Now</h2>
              <div className="stats">
                <Stat label="Open Problems" value={fmt.int(openCity)} note="Waiting for BMC" />
                <Stat label="Fix Rate" value={fmt.pct(city.fixRate)} note="Of closed complaints" />
                <Stat label="Median Time To Fix" value={fmt.days(city.medianDays)} />
              </div>
              <p className="body-small muted">Fix rate and time to fix use BMC complaints from {periodLabel}.</p>
            </section>
            <h2 className="label-large">Or Pick Your Ward</h2>
            <ul className="ward-list">
              {WARDS.map((w) => (
                <li key={w.ward}>
                  <button type="button" className="ward-btn" onClick={() => pick({ ward: w.ward })}>
                    <span className="label-medium">{wardLabel(w.ward)}</span>
                    <span className="body-small muted">{w.areas}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <div className="area-head">
              <div>
                <div className="label-small muted">{place.label ?? "Your area"}</div>
                <h1 className="title-h5">{wardLabel(place.ward)}</h1>
                <div className="body-small muted">{ward?.areas}</div>
              </div>
              <button type="button" className="fc-btn fc-btn--tertiary fc-btn--sm label-small" onClick={clearPlace}>Change Area</button>
            </div>
            <PlaceSearch onFound={pick} compact />
            {msg && <p className="body-small error" role="alert">{msg}</p>}

            <div className="seg" role="group" aria-label="Time period">
              {(["30", "90", "all"] as Period[]).map((p) => (
                <button key={p} type="button" aria-pressed={period === p} onClick={() => setPeriod(p)} className="label-small">
                  {p === "all" ? "All Data" : `Last ${p} Days`}
                </button>
              ))}
            </div>

            {ws && (
              <section className="fc-card fc-card--compact">
                <div className="stats">
                  <Stat label="Open Now" value={fmt.int(openWard)} note={`${fmt.int(ws.total)} reported in period`} />
                  <Stat label="Fix Rate" value={fmt.pct(ws.fixRate)} note={fixRank ? `#${fixRank.rank} of ${fixRank.of} wards · city ${fmt.pct(city.fixRate)}` : undefined} />
                  <Stat label="Median Time To Fix" value={fmt.days(ws.medianDays)} note={daysRank ? `#${daysRank.rank} of ${daysRank.of} · city ${fmt.days(city.medianDays)}` : undefined} />
                </div>
                <p className="body-small muted">Fix rate counts complaints BMC closed as fixed against those it closed as invalid. Period: {periodLabel}.</p>
              </section>
            )}

            <button type="button" className="fc-btn fc-btn--secondary fc-btn--lg label-large wide" onClick={onReportHere}>Report a Problem Here</button>

            {ws && ws.byCategory.length > 0 && (
              <section>
                <h2 className="label-large">Most Reported in {wardLabel(place.ward)}</h2>
                <ul className="bars" aria-label="Complaints by category">
                  {ws.byCategory.slice(0, 7).map((c) => (
                    <li key={c.name}>
                      <button type="button" className="bar-btn" aria-pressed={cat === c.name} onClick={() => { setCat(cat === c.name ? null : c.name); setLimit(25); }}>
                        <span className="bar-label body-small">{c.name}</span>
                        <span className="bar-track"><span className="bar-fill" style={{ width: `${(100 * c.total) / ws.byCategory[0].total}%` }} /></span>
                        <span className="bar-num mono-x-small">{fmt.int(c.total)}<span className="muted"> · {fmt.int(c.open)} open</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
                {cat && <button type="button" className="fc-btn fc-btn--tertiary fc-btn--sm label-small" onClick={() => setCat(null)}>Show All Categories</button>}
              </section>
            )}

            <section>
              <h2 className="label-large">{point ? "Near This Spot" : `Problems in ${wardLabel(place.ward)}`}{cat ? `: ${cat}` : ""}</h2>
              <div className="toolbar">
                <div className="seg" role="group" aria-label="Status">
                  {(["open", "resolved", "all"] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)} className="label-small">
                      {s === "open" ? "Open" : s === "resolved" ? "Fixed" : "All"}
                    </button>
                  ))}
                </div>
                {point && (
                  <div className="seg" role="group" aria-label="Distance">
                    {[250, 500, 1000].map((m) => (
                      <button key={m} type="button" aria-pressed={radius === m} onClick={() => setRadius(m)} className="label-small">{fmt.dist(m)}</button>
                    ))}
                  </div>
                )}
              </div>
              {items.length === 0 ? (
                <p className="body-medium muted empty">No {show === "open" ? "open " : show === "resolved" ? "fixed " : ""}problems {point ? `within ${fmt.dist(radius)}` : "in this ward"} for this period. Spotted one? Report it.</p>
              ) : (
                <>
                  <p className="body-small muted">{fmt.int(items.length)} {items.length === 1 ? "problem" : "problems"}, resident reports first, then newest.</p>
                  <ul className="items">
                    {items.slice(0, limit).map((i) => (
                      <li key={i.r.id} className="item">
                        <div className="item-top">
                          <StatusBadge status={i.r.status} citizen={i.kind === "citizen"} />
                          <span className="mono-x-small muted">{i.d !== null ? fmt.dist(i.d) : ""}</span>
                        </div>
                        <div className="label-medium">{i.kind === "bmc" ? i.r.subcategory : i.r.description}</div>
                        <div className="body-small muted">
                          {i.r.category} · {fmt.date(i.kind === "bmc" ? i.r.date : i.r.reported_at)}
                          {i.kind === "bmc" && i.r.status === "Resolved" && i.r.daysToClose !== null ? ` · fixed in ${fmt.days(i.r.daysToClose)}` : ""}
                          {i.kind === "citizen" ? ` · ${i.r.supporters} ${i.r.supporters === 1 ? "person faces" : "people face"} this` : ""}
                          {i.kind === "citizen" && i.r.local ? " · saved on this device only" : ""}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {items.length > limit && (
                    <button type="button" className="fc-btn fc-btn--secondary label-medium wide" onClick={() => setLimit(limit + 25)}>Show 25 More</button>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </aside>
      <MapView rows={mapRows} reports={mapReports} highlightWard={place?.ward} point={point} radius={point ? radius : undefined}
        view={view} dark={dark} onSupport={onSupport}
        onMapClick={(lat, lon) => pick({ lat, lon, label: "Point you tapped" })} />
    </div>
  );
}
