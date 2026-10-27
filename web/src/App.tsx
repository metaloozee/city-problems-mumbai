import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { BarChart3Icon, InfoIcon, MapPinIcon, PlusIcon, TrophyIcon } from "lucide-react";

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

import { cn } from "@/lib/utils";

import { Button, buttonVariants } from "@/components/ui/button";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { Separator } from "@/components/ui/separator";

import { Spinner } from "@/components/ui/spinner";

import { TooltipProvider } from "@/components/ui/tooltip";

import { useMedia } from "@/hooks/use-media";



const ExplorerView = lazy(() => import("./views/ExplorerView"));



type Route = "area" | "report" | "wards" | "explore";

const ROUTES = [

  { id: "area", label: "My Area", short: "My Area", icon: MapPinIcon },

  { id: "wards", label: "Ward Rankings", short: "Wards", icon: TrophyIcon },

  { id: "explore", label: "Data Explorer", short: "Explore", icon: BarChart3Icon },

] as const;

const PLACE_KEY = "cpm.place";



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

  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);



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



  const boot = (children: React.ReactNode) => (

    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">{children}</div>

  );

  let body: React.ReactNode;

  if (err) body = boot(<p className="body-medium max-w-sm text-pretty">The complaint data did not load ({err}). Check your connection and reload the page.</p>);

  else if (!rows) body = boot(<><Spinner className="size-6 text-primary" /><p className="body-medium text-muted-foreground">Loading 97,000 BMC complaints…</p></>);

  else if (route === "report")

    body = <ReportView rows={rows} reports={reports} place={place} backend={backend} dark={dark}

      onCreated={(r) => setReports((l) => [r, ...l])}

      onViewOnMap={(r) => { setPlace({ ward: r.ward, lat: r.lat, lon: r.lon, label: "Your report" }); go("area"); }} />;

  else if (route === "wards")

    body = <OverviewView rows={rows} dataEnd={range.end} dark={dark} onOpenWard={(w) => { setPlace({ ward: w }); go("area"); }} />;

  else if (route === "explore")

    body = <Suspense fallback={boot(<Spinner className="size-6 text-primary" />)}><ExplorerView rows={rows} dark={dark} /></Suspense>;

  else

    body = <AreaView rows={rows} reports={reports} dataStart={range.start} dataEnd={range.end} dark={dark} place={place}

      choosePlace={choosePlace} clearPlace={() => setPlace(null)} onReportHere={() => go("report")} onSupport={onSupport} />;



  return (

    <TooltipProvider>

      <div className="flex h-dvh flex-col">

        <header className="z-30 flex h-14 shrink-0 items-center gap-6 border-b bg-card px-4 md:px-6">

          <a className="label-large flex gap-1.5 whitespace-nowrap text-foreground no-underline" href="#/area" aria-label="City Problems Mumbai, home">

            City Problems<span className="text-muted-foreground">Mumbai</span>

          </a>

          <nav className="hidden gap-1 md:flex" aria-label="Main">

            {ROUTES.map((r) => (

              <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? "page" : undefined}

                className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-muted-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground")}>

                {r.label}

              </a>

            ))}

          </nav>

          <div className="ml-auto flex items-center gap-2">

            {rows && (

              <Popover>

                <PopoverTrigger asChild>

                  <Button variant="ghost" size="icon" aria-label="About the data"><InfoIcon /></Button>

                </PopoverTrigger>

                <PopoverContent align="end" className="body-small flex w-80 flex-col gap-3 text-pretty">

                  <div className="flex flex-col gap-1">

                    <div className="label-medium">About the data</div>

                    <p className="text-muted-foreground">BMC complaints from {fmt.date(range.start)} to {fmt.date(range.end)}, from the MARG public service (CCRS complaints and Pothole QuickFix).</p>

                  </div>

                  <p className="text-muted-foreground">

                    {backend === "device"

                      ? "The reports database is not connected, so resident reports are saved on this device only."

                      : `${fmt.int(reports.length)} resident ${reports.length === 1 ? "report" : "reports"} on the map.`}

                    {place ? <> Your area is {wardLabel(place.ward)}.</> : null}

                  </p>

                  <Separator />

                  <p className="text-muted-foreground">An independent civic project, not an official BMC service. Reports filed here are not sent to BMC. Map © OpenStreetMap contributors, © CARTO.</p>

                </PopoverContent>

              </Popover>

            )}

            {route !== "report" && (

              <Button asChild size="sm" className="md:h-10 md:px-4">

                <a href="#/report"><PlusIcon data-icon="inline-start" /><span>Report<span className="max-md:hidden"> a Problem</span></span></a>

              </Button>

            )}

          </div>

        </header>

        <main className="relative min-h-0 flex-1 overflow-y-auto">{body}</main>

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-[60] grid grid-cols-3 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden">

          {ROUTES.map((r) => (

            <a key={r.id} href={`#/${r.id}`} aria-current={route === r.id ? "page" : undefined}

              className="label-x-small flex h-14 flex-col items-center justify-center gap-0.5 text-muted-foreground no-underline aria-[current=page]:text-foreground">

              <r.icon className="size-5" aria-hidden="true" />{r.short}

            </a>

          ))}

        </nav>

      </div>

    </TooltipProvider>

  );

}

