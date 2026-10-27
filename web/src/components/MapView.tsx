import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import Supercluster from "supercluster";
import wardsGeo from "../../shared/wards.geo";
import type { CitizenReport, Problem } from "../types";
import { fmt } from "../stats";
import { wardLabel } from "../data";

export const STATUS_STYLE = {
  open: { color: "var(--status-open)", hex: "#d97706", label: "Open" },
  resolved: { color: "var(--status-resolved)", hex: "#16a34a", label: "Resolved" },
  closed: { color: "var(--status-closed)", hex: "#8f8f8f", label: "Rejected" },
  citizen: { color: "var(--status-citizen)", hex: "#2a6dfb", label: "Resident report" },
};
export const statusKind = (status: string) =>
  status === "Resolved" ? "resolved" : status === "Rejected" || status === "Discarded" ? "closed" : "open";

export const CHORO_RAMP = ["#fde3d6", "#fbb894", "#f98d55", "#e9601f", "#b33c0a"];

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
  view?: { center: [number, number]; zoom: number; key: string } | null;
  dark: boolean;
}

/** Leaflet popups are built from DOM nodes with textContent, never HTML strings, so user text cannot inject markup. */
function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function problemPopup(r: Problem): HTMLElement {
  const box = el("div", "pop");
  box.append(el("div", "pop-kicker label-x-small", r.category));
  box.append(el("div", "pop-title label-medium", r.subcategory));
  const kind = statusKind(r.status);
  const st = el("div", "pop-status label-small");
  const dot = el("span", `dot dot--${kind}`);
  st.append(dot, document.createTextNode(r.status + (r.status === "Resolved" && r.daysToClose !== null ? ` in ${fmt.days(r.daysToClose)}` : "")));
  box.append(st);
  box.append(el("div", "pop-meta body-small", `${wardLabel(r.ward)} · reported ${fmt.date(r.date)} via ${r.channel}`));
  box.append(el("div", "pop-id mono-x-small", r.id));
  return box;
}
function reportPopup(r: CitizenReport, onSupport?: MapViewProps["onSupport"]): HTMLElement {
  const box = el("div", "pop");
  box.append(el("div", "pop-kicker label-x-small", `${r.category} · reported by a resident`));
  box.append(el("div", "pop-desc body-medium", r.description));
  if (r.landmark) box.append(el("div", "pop-meta body-small", `Near ${r.landmark}`));
  box.append(el("div", "pop-meta body-small", `${wardLabel(r.ward)} · ${fmt.date(r.reported_at)}`));
  const row = el("div", "pop-row");
  const count = el("span", "label-small", `${r.supporters} ${r.supporters === 1 ? "person faces" : "people face"} this`);
  row.append(count);
  if (onSupport && !r.local) {
    const btn = el("button", "fc-btn fc-btn--secondary fc-btn--sm label-small", "I Face This Too") as HTMLButtonElement;
    btn.type = "button";
    btn.onclick = async () => {
      btn.disabled = true;
      const res = await onSupport(r.id);
      if (typeof res === "number") count.textContent = `${res} ${res === 1 ? "person faces" : "people face"} this`;
      else { btn.disabled = false; count.textContent = res; }
    };
    row.append(btn);
  }
  box.append(row);
  box.append(el("div", "pop-id mono-x-small", r.id));
  return box;
}

function ClusterLayer({ rows }: { rows: Problem[] }) {
  const map = useMap();
  const index = useMemo(() => {
    const sc = new Supercluster<{ i: number }>({ radius: 50, maxZoom: 17 });
    sc.load(rows.map((r, i) => ({ type: "Feature" as const, properties: { i }, geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] } })));
    return sc;
  }, [rows]);
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const canvas = L.canvas({ padding: 0.5 });
    const draw = () => {
      group.clearLayers();
      const b = map.getBounds();
      for (const it of index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.round(map.getZoom()))) {
        const [lon, lat] = it.geometry.coordinates;
        const p: any = it.properties;
        if (p.cluster) {
          const n: number = p.point_count;
          const size = n > 2000 ? 48 : n > 300 ? 40 : n > 50 ? 34 : 28;
          const icon = L.divIcon({ html: `<div class="cluster mono-x-small" style="width:${size}px;height:${size}px">${p.point_count_abbreviated}</div>`, className: "", iconSize: [size, size] });
          const m = L.marker([lat, lon], { icon, keyboard: false, title: `${n} problems here. Zoom in.` });
          m.on("click", () => map.flyTo([lat, lon], Math.min(index.getClusterExpansionZoom(p.cluster_id), 18)));
          group.addLayer(m);
        } else {
          const r = rows[p.i];
          const kind = statusKind(r.status);
          const m = L.circleMarker([lat, lon], {
            renderer: canvas, radius: kind === "open" ? 6 : 5, color: "#ffffff", weight: 1.5,
            fillColor: STATUS_STYLE[kind].hex, fillOpacity: kind === "closed" ? 0.7 : 0.95,
          });
          m.bindPopup(() => problemPopup(r));
          group.addLayer(m);
        }
      }
    };
    draw();
    map.on("moveend", draw);
    return () => { map.off("moveend", draw); group.remove(); };
  }, [map, index, rows]);
  return null;
}

function ReportsLayer({ reports, onSupport }: { reports: CitizenReport[]; onSupport?: MapViewProps["onSupport"] }) {
  const map = useMap();
  // Rebuild markers only when the set of reports changes, so a vote count update does not close an open popup.
  const latest = useRef(reports);
  latest.current = reports;
  const ids = reports.map((r) => r.id).join(",");
  useEffect(() => {
    const group = L.layerGroup(
      latest.current.map((r) => {
        const icon = L.divIcon({ html: `<div class="report-pin"></div>`, className: "", iconSize: [18, 18], iconAnchor: [9, 9] });
        return L.marker([r.lat, r.lon], { icon, title: `${r.category}, reported by a resident`, zIndexOffset: 500 })
          .bindPopup(() => reportPopup(latest.current.find((x) => x.id === r.id) ?? r, onSupport));
      }),
    ).addTo(map);
    return () => { group.remove(); };
  }, [map, ids, onSupport]);
  return null;
}

function WardLayer({ highlight, choropleth, onWardClick }: Pick<MapViewProps, "choropleth" | "onWardClick"> & { highlight?: string | null }) {
  const map = useMap();
  const range = useMemo(() => {
    if (!choropleth) return null;
    const v = [...choropleth.values.values()].filter((x): x is number => x !== null);
    return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
  }, [choropleth]);
  useEffect(() => {
    const colorOf = (v: number | null | undefined) => {
      if (v === null || v === undefined || !range) return "transparent";
      const t = range.max === range.min ? 0.5 : (v - range.min) / (range.max - range.min);
      const idx = Math.min(CHORO_RAMP.length - 1, Math.floor((choropleth!.higherIsWorse ? t : 1 - t) * CHORO_RAMP.length));
      return CHORO_RAMP[idx];
    };
    const layer = L.geoJSON(wardsGeo as any, {
      style: (f) => {
        const w = f!.properties.ward;
        const sel = w === highlight;
        return choropleth
          ? { fillColor: colorOf(choropleth.values.get(w)), fillOpacity: 0.8, color: sel ? "#262626" : "#ffffff", weight: sel ? 3 : 1 }
          : { fill: !!onWardClick, fillOpacity: 0, color: sel ? "#262626" : "#8f8f8f", weight: sel ? 3 : 1, dashArray: sel ? undefined : "3 4", opacity: sel ? 0.9 : 0.6 };
      },
      onEachFeature: (f, l) => {
        const w = f.properties.ward;
        const v = choropleth?.values.get(w);
        const tip = el("div", "body-small");
        tip.append(el("b", "", wardLabel(w)), document.createTextNode(` · ${f.properties.areas}`));
        if (choropleth) tip.append(el("div", "", `${choropleth.label}: ${v === null || v === undefined ? "No data" : choropleth.format(v)}`));
        if (onWardClick) {
          l.bindTooltip(tip, { sticky: true });
          l.on("click", () => onWardClick(w));
        }
      },
      interactive: !!onWardClick,
    }).addTo(map);
    layer.bringToBack();
    return () => { layer.remove(); };
  }, [map, highlight, choropleth, range, onWardClick]);
  return null;
}

function PointLayer({ point, radius }: { point?: { lat: number; lon: number } | null; radius?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!point) return;
    const g = L.layerGroup([
      ...(radius ? [L.circle([point.lat, point.lon], { radius, color: "#262626", weight: 1.5, dashArray: "4 4", fillOpacity: 0.04, interactive: false })] : []),
      L.marker([point.lat, point.lon], { icon: L.divIcon({ html: `<div class="you-pin"></div>`, className: "", iconSize: [16, 16], iconAnchor: [8, 8] }), interactive: false }),
    ]).addTo(map);
    return () => { g.remove(); };
  }, [map, point, radius]);
  return null;
}

function Controller({ view, pickMode, onPick, onMapClick }: Pick<MapViewProps, "view" | "pickMode" | "onPick" | "onMapClick">) {
  const map = useMap();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (view && view.key !== last.current) {
      last.current = view.key;
      map.flyTo(view.center, view.zoom, { duration: 0.6 });
    }
  }, [map, view]);
  useEffect(() => { setTimeout(() => map.invalidateSize(), 50); }, [map, pickMode]);
  useMapEvents({
    move: () => { if (pickMode && onPick) { const c = map.getCenter(); onPick(c.lat, c.lng); } },
    click: (e) => { if (!pickMode && onMapClick) onMapClick(e.latlng.lat, e.latlng.lng); },
  });
  useEffect(() => { if (pickMode && onPick) { const c = map.getCenter(); onPick(c.lat, c.lng); } }, [map, pickMode, onPick]);
  return null;
}

export default function MapView(p: MapViewProps) {
  const [zoomHint, setZoomHint] = useState(false);
  return (
    <div className="mapwrap">
      <MapContainer center={[19.08, 72.88]} zoom={11} minZoom={10} maxZoom={19} className="map" preferCanvas
        maxBounds={[[18.7, 72.55], [19.5, 73.25]]} whenReady={() => setZoomHint(true)}>
        <TileLayer
          key={p.dark ? "dark" : "light"}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={`https://{s}.basemaps.cartocdn.com/${p.dark ? "dark_all" : "rastertiles/voyager"}/{z}/{x}/{y}{r}.png`}
          subdomains="abcd" maxZoom={20} />
        <WardLayer highlight={p.highlightWard} choropleth={p.choropleth} onWardClick={p.onWardClick} />
        {!p.choropleth && <ClusterLayer rows={p.rows} />}
        {!p.choropleth && <ReportsLayer reports={p.reports} onSupport={p.onSupport} />}
        {!p.pickMode && <PointLayer point={p.point} radius={p.radius} />}
        <Controller view={p.view} pickMode={p.pickMode} onPick={p.onPick} onMapClick={p.onMapClick} />
      </MapContainer>
      {p.pickMode && <div className="center-pin" aria-hidden="true"><span /></div>}
      {!p.choropleth && !p.pickMode && zoomHint && (
        <div className="legend body-small" aria-label="Map legend">
          {(["open", "resolved", "closed", "citizen"] as const).map((k) => (
            <span key={k}><i className={`dot dot--${k}`} />{STATUS_STYLE[k].label}</span>
          ))}
        </div>
      )}
      {p.choropleth && <ChoroLegend {...p.choropleth} />}
    </div>
  );
}

function ChoroLegend({ values, label, format, higherIsWorse }: NonNullable<MapViewProps["choropleth"]>) {
  const v = [...values.values()].filter((x): x is number => x !== null);
  if (!v.length) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  return (
    <div className="legend legend--ramp body-small">
      <b className="label-small">{label}</b>
      <div className="ramp">{CHORO_RAMP.map((c) => <i key={c} style={{ background: c }} />)}</div>
      <div className="ramp-ends"><span>{higherIsWorse ? format(lo) : format(hi)}</span><span>{higherIsWorse ? format(hi) : format(lo)}</span></div>
      <div className="ramp-ends"><span>Better</span><span>Worse</span></div>
    </div>
  );
}
