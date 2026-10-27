import { useMemo, useState } from "react";
import { ArrowLeftIcon, MapPinIcon, XIcon } from "lucide-react";
import MapView from "../components/MapView";
import { MapLayout } from "../components/MapLayout";
import { PlaceSearch, Stat, StatusBadge, type FoundPlace } from "../components/common";
import type { CitizenReport, Place, Problem } from "../types";
import { WARDS, WARD_BY_CODE, wardLabel } from "../data";
import { areaStats, fmt, rankOf, statsByWard, type AreaStats } from "../stats";
import { distanceM } from "../../shared/geo";
import { EvilBarChart } from "@/components/evilcharts/charts/recharts-bar-chart";
import type { ChartConfig } from "@/components/evilcharts/ui/recharts-chart";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

export function PeriodToggle({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <ToggleGroup type="single" size="sm" spacing={0.5} value={value} onValueChange={(v) => v && onChange(v as Period)} aria-label="Time period">
      {(["30", "90", "all"] as Period[]).map((p) => (
        <ToggleGroupItem key={p} value={p}>{p === "all" ? "All Data" : `Last ${p} Days`}</ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

const categoryConfig = {
  open: { label: "Open", colors: { light: ["#d97706"], dark: ["#f59e0b"] } },
  closed: { label: "Closed", colors: { light: ["#d4d4d4"], dark: ["#525252"] } },
} satisfies ChartConfig;

/** Top categories as stacked open / closed bars. Selecting a bar filters the list and map. */
function CategoryChart({ ws, onSelect }: { ws: AreaStats; onSelect: (name: string) => void }) {
  const data = useMemo(() => ws.byCategory.slice(0, 7).map((c) => ({ name: c.name, open: c.open, closed: c.total - c.open })), [ws]);
  return (
    <EvilBarChart data={data} config={categoryConfig} layout="horizontal" stackType="stacked" barRadius={3}
      className="aspect-auto h-[300px] w-full flex-none" animationType="none"
      chartProps={{ onClick: (s) => { const i = Number(s?.activeIndex); if (data[i]) onSelect(data[i].name); }, margin: { left: 0, right: 8 } }}>
      <EvilBarChart.YAxis dataKey="name" width={112} tickFormatter={(v: string) => (v.length > 16 ? v.slice(0, 15) + "…" : v)} />
      <EvilBarChart.XAxis tickFormatter={(v: number) => fmt.int(v)} />
      <EvilBarChart.Grid />
      <EvilBarChart.Legend align="left" variant="rounded-square" />
      <EvilBarChart.Tooltip />
      <EvilBarChart.Bar dataKey="open" />
      <EvilBarChart.Bar dataKey="closed" />
    </EvilBarChart>
  );
}

export default function AreaView({ rows, reports, dataEnd, dataStart, dark, place, choosePlace, clearPlace, onReportHere, onSupport }: Props) {
  const [period, setPeriod] = useState<Period>("90");
  const [radius, setRadius] = useState(500);
  const [show, setShow] = useState<"all" | "open" | "resolved">("open");
  const [cat, setCat] = useState<string | null>(null);
  const [tab, setTab] = useState("problems");
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
  };
  const view = place
    ? { center: (point ? [point.lat, point.lon] : ward!.centroid) as [number, number], zoom: point ? 16 : 14, key: `${place.ward}:${place.lat}:${place.lon}` }
    : { center: [19.08, 72.88] as [number, number], zoom: 11, key: "city" };
  const fixRank = ward ? rankOf(byWard, ward.ward, (s) => s.fixRate, true) : null;
  const daysRank = ward ? rankOf(byWard, ward.ward, (s) => s.medianDays, false) : null;
  const periodLabel = period === "all" ? `${fmt.date(dataStart)} to ${fmt.date(dataEnd)}` : `Last ${period} days of data, to ${fmt.date(dataEnd)}`;
  const fixHint = "Complaints BMC closed as fixed, out of all it closed (fixed or rejected as invalid).";
  const error = msg && <Alert variant="destructive"><AlertDescription>{msg}</AlertDescription></Alert>;

  const panel = !place ? (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="title-h5 text-balance">See what needs fixing where you live</h1>
        <p className="body-medium text-pretty text-muted-foreground">Search a place, use your location or tap the map.</p>
      </div>
      <PlaceSearch onFound={pick} />
      <Select onValueChange={(w) => pick({ ward: w })}>
        <SelectTrigger className="w-full" aria-label="Pick your ward"><SelectValue placeholder="Or pick your ward" /></SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {WARDS.map((w) => (
              <SelectItem key={w.ward} value={w.ward}>{wardLabel(w.ward)}<span className="truncate text-muted-foreground">{w.areas}</span></SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {error}
      <Separator />
      <section className="flex flex-col gap-3" aria-labelledby="city-now">
        <h2 id="city-now" className="label-medium">Mumbai right now</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Open" value={fmt.int(openCity)} note="Waiting for BMC" />
          <Stat label="Fix Rate" value={fmt.pct(city.fixRate)} hint={fixHint} />
          <Stat label="Time To Fix" value={fmt.days(city.medianDays)} note="Median" />
        </div>
        <p className="body-small text-muted-foreground">{periodLabel}</p>
      </section>
    </>
  ) : (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <div className="label-small flex items-center gap-1 text-muted-foreground"><MapPinIcon className="size-3.5" aria-hidden="true" />{place.label ?? "Your area"}</div>
          <h1 className="title-h5">{wardLabel(place.ward)}</h1>
          <div className="body-small truncate text-muted-foreground">{ward?.areas}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { clearPlace(); setCat(null); setMsg(""); }}>
          <ArrowLeftIcon data-icon="inline-start" />Change
        </Button>
      </div>
      {error}

      <div className="flex flex-col gap-3">
        <PeriodToggle value={period} onChange={setPeriod} />
        {ws && (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Open Now" value={fmt.int(openWard)} note={`${fmt.int(ws.total)} in period`} />
            <Stat label="Fix Rate" value={fmt.pct(ws.fixRate)} hint={fixHint}
              note={fixRank ? `#${fixRank.rank} of ${fixRank.of} · city ${fmt.pct(city.fixRate)}` : undefined} />
            <Stat label="Time To Fix" value={fmt.days(ws.medianDays)}
              note={daysRank ? `#${daysRank.rank} of ${daysRank.of} · city ${fmt.days(city.medianDays)}` : undefined} />
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab} className="gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="problems">{point ? "Near This Spot" : "Problems"}</TabsTrigger>
          <TabsTrigger value="categories" disabled={!ws?.byCategory.length}>By Category</TabsTrigger>
        </TabsList>

        <TabsContent value="problems" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup type="single" size="sm" spacing={0.5} value={show} onValueChange={(v) => v && setShow(v as typeof show)} aria-label="Status">
              <ToggleGroupItem value="open">Open</ToggleGroupItem>
              <ToggleGroupItem value="resolved">Fixed</ToggleGroupItem>
              <ToggleGroupItem value="all">All</ToggleGroupItem>
            </ToggleGroup>
            {point && (
              <ToggleGroup type="single" size="sm" spacing={0.5} value={String(radius)} onValueChange={(v) => v && setRadius(+v)} aria-label="Distance">
                {[250, 500, 1000].map((m) => <ToggleGroupItem key={m} value={String(m)}>{fmt.dist(m)}</ToggleGroupItem>)}
              </ToggleGroup>
            )}
          </div>
          {cat && (
            <Badge variant="secondary" className="label-x-small h-7 gap-1 pr-1">
              {cat}
              <button type="button" className="rounded-sm p-0.5 hover:bg-accent" aria-label={`Clear ${cat} filter`} onClick={() => setCat(null)}><XIcon className="size-3" /></button>
            </Badge>
          )}
          {items.length === 0 ? (
            <Empty className="border border-dashed p-6">
              <EmptyHeader>
                <EmptyTitle className="label-large">Nothing {show === "open" ? "open" : show === "resolved" ? "fixed" : "reported"} here</EmptyTitle>
                <EmptyDescription className="body-small">No problems {point ? `within ${fmt.dist(radius)}` : "in this ward"} for this period.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent><Button variant="secondary" size="sm" onClick={onReportHere}>Report a Problem Here</Button></EmptyContent>
            </Empty>
          ) : (
            <>
              <p className="body-small text-muted-foreground">{fmt.int(items.length)} {items.length === 1 ? "problem" : "problems"}, resident reports first, then newest.</p>
              <ul className="divide-y rounded-xl border bg-card">
                {items.slice(0, limit).map((i) => (
                  <li key={i.r.id} className="flex flex-col gap-1 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge status={i.r.status} citizen={i.kind === "citizen"} />
                      {i.d !== null && <span className="mono-x-small text-muted-foreground tabular-nums">{fmt.dist(i.d)}</span>}
                    </div>
                    <div className="label-medium text-pretty">{i.kind === "bmc" ? i.r.subcategory : i.r.description}</div>
                    <div className="body-small text-muted-foreground">
                      {i.r.category} · {fmt.date(i.kind === "bmc" ? i.r.date : i.r.reported_at)}
                      {i.kind === "bmc" && i.r.status === "Resolved" && i.r.daysToClose !== null ? ` · fixed in ${fmt.days(i.r.daysToClose)}` : ""}
                      {i.kind === "citizen" ? ` · ${i.r.supporters} ${i.r.supporters === 1 ? "person faces" : "people face"} this` : ""}
                      {i.kind === "citizen" && i.r.local ? " · saved on this device only" : ""}
                    </div>
                  </li>
                ))}
              </ul>
              {items.length > limit && <Button variant="secondary" className="w-full" onClick={() => setLimit(limit + 25)}>Show 25 More</Button>}
            </>
          )}
        </TabsContent>

        <TabsContent value="categories" className="flex flex-col gap-2">
          {ws && <CategoryChart ws={ws} onSelect={(name) => { setCat(name); setLimit(25); setTab("problems"); }} />}
          <p className="body-small text-muted-foreground">Most reported in {wardLabel(place.ward)}. Select a bar to filter the list and map.</p>
        </TabsContent>
      </Tabs>
    </>
  );

  return (
    <MapLayout label="Your area" panel={panel} map={
      <MapView rows={mapRows} reports={mapReports} highlightWard={place?.ward} point={point} radius={point ? radius : undefined}
        view={view} dark={dark} onSupport={onSupport}
        onMapClick={(lat, lon) => pick({ lat, lon, label: "Point you tapped" })} />
    } />
  );
}
