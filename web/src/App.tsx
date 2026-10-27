import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { loadProblems, WARD_BY_CODE, wardLabel } from "./data";
import { fetchReports, supportReport, type Backend } from "./api";
import type { CitizenReport, Place, Problem } from "./types";
import { wardAt } from "../shared/geo";
import wardsGeo from "../shared/wards.geo";
import { fmt } from "./stats";
import AreaView from "./views/AreaView";
import ReportView from "./views/ReportView";
import OverviewView from "./views/OverviewView";
import type { FoundPlace } from "./components/common";

const ExplorerView = lazy(() => import("./views/ExplorerView"));

type Route = "area" | "report" | "wards" | "explore";
const ROUTES: { id: Route; label: string }[] = [
  { id: "area", label: "My Area" },
  { id: "wards", label: "Ward Rankings" },
  { id: "explore", label: "Data Explorer" },
];
const PLACE_KEY = "cpm.place";

function useMedia(q: string) {
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, [q]);
  return m;
}
function readRoute(): Route {
  const r = window.location.hash.replace(/^#\/?/, "").split("?")[0];
  return (["area", "report", "wards", "explore"] as Route[]).includes(r as Route) ? (r as Route) : "area";
}
function readPlace(): Place | null {
  try {
    const p = JSON.parse(localStorage.getItem(PLACE_KEY) ?? "null");
    return p && WARD_BY_CODE.has(p.ward) ? p : null;
  } catch { return null; }
}

export default function App() {
  const [rows, setRows] = useState<Problem[] | null>(null);
  const [err, setErr] = useState("");
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [backend, setBackend] = useState<Backend>("device");
  const [route, setRoute] = useState<Route>(readRoute);
  const [place, setPlaceState] = useState<Place | null>(readPlace);
  const dark = useMedia("(prefers-color-scheme: dark)");

  useEffect(() => { loadProblems().then(setRows).catch((e) => setErr(String(e.message ?? e))); }, []);
  useEffect(() => { fetchReports().then(({ reports, backend }) => { setReports(reports); setBackend(backend); }); }, []);
  useEffect(() => {
    const h = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const go = (r: Route) => { window.location.hash = `/${r}`; };

  const setPlace = (p: Place | null) => {
    setPlaceState(p);
    try { p ? localStorage.setItem(PLACE_KEY, JSON.stringify(p)) : localStorage.removeItem(PLACE_KEY); } catch { /* storage blocked */ }
  };
  /** Sets the area from a point or a ward. Returns an error message when the point is outside every ward. */
  const choosePlace = (p: FoundPlace | { ward: string }): string | null => {
    if ("ward" in p) { setPlace({ ward: p.ward }); return null; }
    const ward = wardAt(wardsGeo.features, p.lat, p.lon);
    if (!ward) return "That point is outside BMC's 26 wards. Pick a point on land inside Mumbai.";
    setPlace({ ward, lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6), label: p.label });
    return null;
  };

  const onSupport = useCallback(async (id: string): Promise<number | string> => {
    try {
      const { supporters, alreadySupported } = await supportReport(id);
      setReports((list) => list.map((r) => (r.id === id ? { ...r, supporters } : r)));
      return alreadySupported ? "You already added your voice" : supporters;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);

  const range = useMemo(() => {
    if (!rows?.length) return { start: "", end: "" };
    let a = rows[0].date, b = rows[0].date;
    for (const r of rows) { if (r.date < a) a = r.date; if (r.date > b) b = r.date; }
    return { start: a, end: b };
  }, [rows]);

  let body: React.ReactNode;
  if (err) body = <div className="boot"><p className="body-medium">The complaint data did not load ({err}). Check your connection and reload the page.</p></div>;
  else if (!rows) body = <div className="boot"><div className="spin" aria-hidden="true" /><p className="body-medium muted">Loading 97,000 BMC complaints…</p></div>;
  else if (route === "report")
    body = <ReportView rows={rows} reports={reports} place={place} backend={backend} dark={dark}
      onCreated={(r) => setReports((l) => [r, ...l])}
      onViewOnMap={(r) => { setPlace({ ward: r.ward, lat: r.lat, lon: r.lon, label: "Your report" }); go("area"); }} />;
  else if (route === "wards")
    body = <OverviewView rows={rows} dataEnd={range.end} dark={dark} onOpenWard={(w) => { setPlace({ ward: w }); go("area"); }} />;
  else if (route === "explore")
    body = <Suspense fallback={<div className="boot"><div className="spin" aria-hidden="true" /></div>}><ExplorerView rows={rows} dark={dark} /></Suspense>;
  else
    body = <AreaView rows={rows} reports={reports} dataStart={range.start} dataEnd={range.end} dark={dark} place={place}
      choosePlace={choosePlace} clearPlace={() => setPlace(null)} onReportHere={() => go("report")} onSupport={onSupport} />;

  return (
    <div className={`shell route-${route}`}>
      <header className="topbar">
        <a className="brand" href="#/area" aria-label="City Problems Mumbai, home">
          <span className="label-large">City Problems</span><span className="label-large muted">Mumbai</span>
        </a>
        <nav className="nav" aria-label="Main">
          {ROUTES.map((r) => (
            <a key={r.id} href={`#/${r.id}`} className="nav-link label-medium" aria-current={route === r.id ? "page" : undefined}>{r.label}</a>
          ))}
        </nav>
        {route !== "report" && (
          <a className="fc-btn fc-btn--primary label-medium report-cta" href="#/report">Report a Problem</a>
        )}
      </header>
      {rows && (
        <div className="databar body-small muted" role="note">
          BMC complaint data from {fmt.date(range.start)} to {fmt.date(range.end)}
          {place ? <> · Your area: <b className="label-small">{wardLabel(place.ward)}</b></> : null}
          {" · "}{backend === "device" ? "Resident reports are saved on this device until the database is connected" : `${fmt.int(reports.length)} resident ${reports.length === 1 ? "report" : "reports"}`}
        </div>
      )}
      <main className="main">{body}</main>
      <nav className="tabbar" aria-label="Main">
        {[ROUTES[0], { id: "report" as Route, label: "Report" }, ROUTES[1], ROUTES[2]].map((r) => (
          <a key={r.id} href={`#/${r.id}`} className={"tab label-x-small" + (r.id === "report" ? " tab--report" : "")} aria-current={route === r.id ? "page" : undefined}>
            {r.label.replace("Ward Rankings", "Wards").replace("Data Explorer", "Explore")}
          </a>
        ))}
      </nav>
      <footer className="foot body-small muted">
        Data: Brihanmumbai Municipal Corporation (BMC) MARG public service: CCRS complaints and Pothole QuickFix. Map © OpenStreetMap contributors, © CARTO.
        This is an independent civic project, not an official BMC service. Reports filed here are not sent to BMC.
      </footer>
    </div>
  );
}
