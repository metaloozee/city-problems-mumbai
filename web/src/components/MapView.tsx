import { useEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Point, Polygon } from "geojson";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import { Map as MapRoot, MapControls, MapGeoJSON, MapMarker, MapPopup, MarkerContent, MarkerPopup, useMap } from "@/components/ui/map";
import { cn } from "@/lib/utils";
import wardsGeo from "../../shared/wards.geo";
import type { CitizenReport, Problem } from "../types";
import { fmt } from "../stats";
import { wardLabel } from "../data";
import { STATUS_STYLE, StatusDot, statusKind } from "./common";
import { PANEL_LEFT, SHEET_PEEK } from "./MapLayout";
import { Button } from "@/components/ui/button";
import { useDesktop } from "@/hooks/use-media";

export const CHORO_RAMP = ["#fde3d6", "#fbb894", "#f98d55", "#e9601f", "#b33c0a"];

/** MapLibre paint needs literal colours, so the few the map draws with are mirrored from tokens.css here. */
const INK = { light: { fg: "#262626", surface: "#ffffff", muted: "#8f8f8f" }, dark: { fg: "#f5f5f5", surface: "#171717", muted: "#737373" } };

export interface MapViewProps {
  rows: Problem[];
  reports: CitizenReport[];
  highlightWard?: string | null;
  point?: { lat: number; lon: number } | null;
  radius?: number;
  choropleth?: { values: Map<string, number | null>; label: string; format: (v: number) => string; higherIsWorse: boolean } | null;
  pickMode?: boolean;
  onPick?: (lat: number, lon: number) => void;
  onMapClick?: (lat: number, lon: number) => void;
  onWardClick?: (ward: string) => void;
  onSupport?: (id: string) => Promise<number | string>;
  /** `center` is [lat, lon]. */
  view?: { center: [number, number]; zoom: number; key: string } | null;
  dark: boolean;
}

const BOUNDS: [[number, number], [number, number]] = [[72.55, 18.7], [73.25, 19.5]];

/** Classes for mapcn's popup container, which is the card itself. */
const POPUP = "w-72 max-w-[calc(100vw-2rem)] rounded-xl p-4 shadow-lg";

/** Popup body. The container comes from MapPopup / MarkerPopup, so this adds no surface of its own. */
function PopupCard({ kicker, children, id }: { kicker: string; children: React.ReactNode; id: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="label-x-small truncate pr-6 text-muted-foreground">{kicker}</div>
      {children}
      <div className="mono-x-small border-t pt-2 text-muted-foreground">{id}</div>
    </div>
  );
}

function ProblemPopup({ r }: { r: Problem }) {
  const kind = statusKind(r.status);
  return (
    <PopupCard kicker={r.category} id={r.id}>
      <div className="label-medium text-pretty">{r.subcategory}</div>
      <div className="label-small flex items-center gap-1.5">
        <StatusDot kind={kind} />
        {r.status}{r.status === "Resolved" && r.daysToClose !== null ? ` in ${fmt.days(r.daysToClose)}` : ""}
      </div>
      <div className="body-small text-muted-foreground">{wardLabel(r.ward)} · reported {fmt.date(r.date)} via {r.channel}</div>
    </PopupCard>
  );
}

function ReportPopup({ r, onSupport }: { r: CitizenReport; onSupport?: MapViewProps["onSupport"] }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const support = async () => {
    setBusy(true);
    const res = await onSupport!(r.id);
    setBusy(false);
    setNote(typeof res === "string" ? res : null);
  };
  return (
    <PopupCard kicker={`${r.category} · reported by a resident`} id={r.id}>
      <div className="body-medium text-pretty">{r.description}</div>
      {r.landmark && <div className="body-small text-muted-foreground">Near {r.landmark}</div>}
      <div className="body-small text-muted-foreground">{wardLabel(r.ward)} · {fmt.date(r.reported_at)}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="label-small tabular-nums">{note ?? `${r.supporters} ${r.supporters === 1 ? "person faces" : "people face"} this`}</span>
        {onSupport && !r.local && (
          <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={support}>I Face This Too</Button>
        )}
      </div>
    </PopupCard>
  );
}

/** Complaints as GPU-clustered circles coloured by status. Clicking a point opens its popup; clicking a cluster zooms in. */
function ProblemsLayer({ rows, dark }: { rows: Problem[]; dark: boolean }) {
  const { map, isLoaded } = useMap();
  const [selected, setSelected] = useState<Problem | null>(null);
  const data = useMemo<FeatureCollection<Point, { i: number; kind: string }>>(() => ({
    type: "FeatureCollection",
    features: rows.map((r, i) => ({ type: "Feature", properties: { i, kind: statusKind(r.status) }, geometry: { type: "Point", coordinates: [r.lon, r.lat] } })),
  }), [rows]);
  const ink = dark ? INK.dark : INK.light;

  useEffect(() => {
    if (!map || !isLoaded) return;
    const src = "problems", clusters = "problems-clusters", counts = "problems-counts", points = "problems-points";
    map.addSource(src, { type: "geojson", data, cluster: true, clusterRadius: 50, clusterMaxZoom: 16 });
    map.addLayer({
      id: clusters, type: "circle", source: src, filter: ["has", "point_count"],
      paint: {
        "circle-color": ink.surface, "circle-stroke-color": ink.fg, "circle-stroke-opacity": 0.16, "circle-stroke-width": 1,
        "circle-radius": ["step", ["get", "point_count"], 14, 50, 17, 300, 20, 2000, 24],
      },
    });
    map.addLayer({
      id: counts, type: "symbol", source: src, filter: ["has", "point_count"],
      layout: { "text-field": "{point_count_abbreviated}", "text-font": ["Montserrat SemiBold", "Open Sans Bold"], "text-size": 11, "text-allow-overlap": true },
      paint: { "text-color": ink.fg },
    });
    map.addLayer({
      id: points, type: "circle", source: src, filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": ["match", ["get", "kind"], "resolved", STATUS_STYLE.resolved.hex, "closed", STATUS_STYLE.closed.hex, STATUS_STYLE.open.hex],
        "circle-radius": ["match", ["get", "kind"], "open", 6, 5],
        "circle-opacity": ["match", ["get", "kind"], "closed", 0.7, 0.95],
        "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5,
      },
    });
    const onCluster = async (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (!f || f.geometry.type !== "Point") return;
      const zoom = await (map.getSource(src) as GeoJSONSource).getClusterExpansionZoom(f.properties.cluster_id);
      map.easeTo({ center: f.geometry.coordinates as [number, number], zoom: Math.min(zoom, 18) });
    };
    const onPoint = (e: MapLayerMouseEvent) => {
      const f = e.features?.[0];
      if (f) setSelected(rows[f.properties.i as number]);
    };
    const pointer = () => { map.getCanvas().style.cursor = "pointer"; };
    const reset = () => { map.getCanvas().style.cursor = ""; };
    map.on("click", clusters, onCluster);
    map.on("click", points, onPoint);
    for (const l of [clusters, points]) { map.on("mouseenter", l, pointer); map.on("mouseleave", l, reset); }
    return () => {
      map.off("click", clusters, onCluster);
      map.off("click", points, onPoint);
      for (const l of [clusters, points]) { map.off("mouseenter", l, pointer); map.off("mouseleave", l, reset); }
      try {
        for (const l of [points, counts, clusters]) if (map.getLayer(l)) map.removeLayer(l);
        if (map.getSource(src)) map.removeSource(src);
      } catch { /* style may be mid-reload */ }
    };
  }, [map, isLoaded, data, rows, ink]);

  useEffect(() => setSelected(null), [rows]);

  return selected ? (
    <MapPopup longitude={selected.lon} latitude={selected.lat} onClose={() => setSelected(null)} closeButton focusAfterOpen={false} offset={12} className={POPUP}>
      <ProblemPopup r={selected} />
    </MapPopup>
  ) : null;
}

function ReportsLayer({ reports, onSupport }: { reports: CitizenReport[]; onSupport?: MapViewProps["onSupport"] }) {
  return reports.map((r) => (
    <MapMarker key={r.id} longitude={r.lon} latitude={r.lat}>
      <MarkerContent>
        <div className="size-[18px] rounded-[5px] border-[2.5px] border-white shadow-md" style={{ background: STATUS_STYLE.citizen.color }}
          title={`${r.category}, reported by a resident`} />
      </MarkerContent>
      <MarkerPopup closeButton focusAfterOpen={false} offset={14} className={POPUP}>
        <ReportPopup r={r} onSupport={onSupport} />
      </MarkerPopup>
    </MapMarker>
  ));
}

type WardProps = { ward: string; areas: string; fill: string; value: number | null };

function WardLayer({ highlight, choropleth, onWardClick, dark, onHover }: Pick<MapViewProps, "choropleth" | "onWardClick" | "dark"> & {
  highlight?: string | null;
  onHover: (w: WardProps | null) => void;
}) {
  const ink = dark ? INK.dark : INK.light;
  const data = useMemo<FeatureCollection<Polygon, WardProps>>(() => {
    const v = choropleth ? [...choropleth.values.values()].filter((x): x is number => x !== null) : [];
    const min = Math.min(...v), max = Math.max(...v);
    const colorOf = (x: number | null | undefined) => {
      if (x === null || x === undefined || !v.length) return "rgba(0,0,0,0)";
      const t = max === min ? 0.5 : (x - min) / (max - min);
      return CHORO_RAMP[Math.min(CHORO_RAMP.length - 1, Math.floor((choropleth!.higherIsWorse ? t : 1 - t) * CHORO_RAMP.length))];
    };
    return {
      type: "FeatureCollection",
      features: wardsGeo.features.map((f) => {
        const value = choropleth?.values.get(f.properties.ward) ?? null;
        return { type: "Feature", geometry: f.geometry as Polygon, properties: { ward: f.properties.ward, areas: f.properties.areas, fill: colorOf(value), value } };
      }),
    };
  }, [choropleth]);
  const sel = ["==", ["get", "ward"], highlight ?? ""];
  const fillPaint = useMemo(() => (choropleth || onWardClick
    ? { "fill-color": ["get", "fill"], "fill-opacity": choropleth ? 0.8 : 0 }
    : false) as never, [choropleth, onWardClick]);
  const fillHoverPaint = useMemo(() => (choropleth ? { "fill-opacity": 0.95 } : undefined), [choropleth]);
  const linePaint = useMemo(() => ({
    "line-color": ["case", sel, ink.fg, choropleth ? ink.surface : ink.muted],
    "line-width": ["case", sel, 2.5, 1],
    "line-opacity": ["case", sel, 0.9, choropleth ? 1 : 0.5],
  }) as never, [highlight, choropleth, ink]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <MapGeoJSON<WardProps> id="wards" data={data} promoteId="ward" fillPaint={fillPaint} fillHoverPaint={fillHoverPaint} linePaint={linePaint}
      interactive={!!onWardClick} onClick={(e) => onWardClick?.(e.feature.properties.ward)} onHover={(e) => onHover(e?.feature.properties ?? null)} />
  );
}

function circle(lat: number, lon: number, radiusM: number): FeatureCollection<Polygon> {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180), ky = 110540;
  const ring = Array.from({ length: 65 }, (_, i) => {
    const a = (i / 64) * 2 * Math.PI;
    return [lon + (Math.cos(a) * radiusM) / kx, lat + (Math.sin(a) * radiusM) / ky];
  });
  return { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [ring] } }] };
}

function PointLayer({ point, radius, dark }: { point: { lat: number; lon: number }; radius?: number; dark: boolean }) {
  const ink = dark ? INK.dark : INK.light;
  const ring = useMemo(() => (radius ? circle(point.lat, point.lon, radius) : null), [point.lat, point.lon, radius]);
  const fillPaint = useMemo(() => ({ "fill-color": ink.fg, "fill-opacity": 0.04 }), [ink]);
  const linePaint = useMemo(() => ({ "line-color": ink.fg, "line-width": 1.5, "line-dasharray": [3, 3] }), [ink]);
  return (
    <>
      {ring && <MapGeoJSON id="radius" data={ring} fillPaint={fillPaint} linePaint={linePaint} />}
      <MapMarker longitude={point.lon} latitude={point.lat}>
        <MarkerContent className="pointer-events-none cursor-default">
          <div className="size-4 rounded-full border-[3px] border-white bg-foreground shadow-[0_0_0_6px_var(--black-alpha-12)]" />
        </MarkerContent>
      </MapMarker>
    </>
  );
}

function Controller({ view, pickMode, onPick, onMapClick }: Pick<MapViewProps, "view" | "pickMode" | "onPick" | "onMapClick">) {
  const { map, isLoaded } = useMap();
  const desktop = useDesktop();
  const last = useRef<string | null>(null);
  // Keep places centred in the part of the map the panel does not cover. getCenter() follows the padding too.
  useEffect(() => {
    map?.setPadding(desktop ? { left: PANEL_LEFT, top: 0, right: 0, bottom: 0 } : { left: 0, top: 0, right: 0, bottom: SHEET_PEEK });
  }, [map, desktop]);
  const cb = useRef({ onPick, onMapClick, pickMode });
  cb.current = { onPick, onMapClick, pickMode };
  useEffect(() => {
    if (!map || !view || view.key === last.current) return;
    last.current = view.key;
    map.flyTo({ center: [view.center[1], view.center[0]], zoom: view.zoom, duration: 600 });
  }, [map, view]);
  useEffect(() => {
    if (!map || !isLoaded) return;
    const report = () => { const { pickMode, onPick } = cb.current; if (pickMode && onPick) { const c = map.getCenter(); onPick(c.lat, c.lng); } };
    const click = (e: MapLayerMouseEvent) => {
      const { pickMode, onMapClick } = cb.current;
      if (pickMode || !onMapClick) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ["problems-clusters", "problems-points"].filter((l) => map.getLayer(l)) });
      if (!hit.length) onMapClick(e.lngLat.lat, e.lngLat.lng);
    };
    report();
    map.on("move", report);
    map.on("click", click);
    return () => { map.off("move", report); map.off("click", click); };
  }, [map, isLoaded, pickMode]);
  return null;
}

const overlay = "rounded-lg border bg-popover/95 px-3 py-2 text-popover-foreground shadow-sm";

export default function MapView(p: MapViewProps) {
  const [hover, setHover] = useState<WardProps | null>(null);
  return (
    <div className="absolute inset-0 bg-muted">
      <MapRoot theme={p.dark ? "dark" : "light"} center={[72.88, 19.08]} zoom={11} minZoom={10} maxZoom={19} maxBounds={BOUNDS}>
        <WardLayer highlight={p.highlightWard} choropleth={p.choropleth} onWardClick={p.onWardClick} dark={p.dark} onHover={setHover} />
        {!p.choropleth && <ProblemsLayer rows={p.rows} dark={p.dark} />}
        {!p.choropleth && <ReportsLayer reports={p.reports} onSupport={p.onSupport} />}
        {!p.pickMode && p.point && <PointLayer point={p.point} radius={p.radius} dark={p.dark} />}
        <Controller view={p.view} pickMode={p.pickMode} onPick={p.onPick} onMapClick={p.onMapClick} />
        <MapControls position="top-right" showZoom showLocate={!p.choropleth} />
      </MapRoot>
      {p.pickMode && (
        // A pin fixed to the padded map centre; the map moves under it.
        <div aria-hidden="true" className="pointer-events-none absolute top-[calc((100%-296px)/2)] left-1/2 z-10 md:top-1/2 md:left-[calc(50%+216px)]">
          <div className="absolute -top-10 -left-3.5 size-7 -rotate-45 rounded-[50%_50%_50%_0] border-[3px] border-white bg-primary shadow-md" />
          <div className="absolute -top-0.5 -left-[3px] size-1.5 rounded-full bg-black/35" />
        </div>
      )}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex flex-col items-start gap-2 md:top-auto md:right-3 md:bottom-12 md:left-auto md:items-end">
        {p.choropleth && hover && (
          <div className={cn(overlay, "max-w-64")}>
            <div className="label-small">{wardLabel(hover.ward)}</div>
            <div className="body-small text-muted-foreground">{hover.areas}</div>
            <div className="body-small tabular-nums">{p.choropleth.label}: {hover.value === null ? "No data" : p.choropleth.format(hover.value)}</div>
          </div>
        )}
        {!p.choropleth && !p.pickMode && (
          <div className={cn(overlay, "body-small flex flex-wrap gap-x-3 gap-y-1 max-md:label-x-small max-md:max-w-[calc(100vw-5rem)] max-md:px-2.5 max-md:py-1.5 md:flex-col")} aria-label="Map legend">
            {(["open", "resolved", "closed", "citizen"] as const).map((k) => (
              <span key={k} className="flex items-center gap-2"><StatusDot kind={k} />{STATUS_STYLE[k].label}</span>
            ))}
          </div>
        )}
        {p.choropleth && <ChoroLegend {...p.choropleth} />}
      </div>
    </div>
  );
}

function ChoroLegend({ values, label, format, higherIsWorse }: NonNullable<MapViewProps["choropleth"]>) {
  const v = [...values.values()].filter((x): x is number => x !== null);
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  return (
    <div className={cn(overlay, "body-small flex min-w-44 flex-col gap-1")}>
      <b className="label-small">{label}</b>
      <div className="flex gap-0.5">{CHORO_RAMP.map((c) => <i key={c} className="h-2.5 flex-1 rounded-sm" style={{ background: c }} />)}</div>
      <div className="flex justify-between tabular-nums text-muted-foreground"><span>{higherIsWorse ? format(lo) : format(hi)}</span><span>{higherIsWorse ? format(hi) : format(lo)}</span></div>
      <div className="flex justify-between text-muted-foreground"><span>Better</span><span>Worse</span></div>
    </div>
  );
}
