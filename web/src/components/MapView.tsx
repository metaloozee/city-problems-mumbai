import { useEffect, useMemo, useRef } from "react";
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "../leafletSetup";
import "leaflet.heat";
import Supercluster from "supercluster";
import type { Complaint } from "../types";
import { CAT_COLORS, RAMP, rampColor } from "../colors";

export type MapMode = "clusters" | "heatmap" | "choropleth";
interface Props {
  rows: Complaint[]; geo: any; mode: MapMode; wardValues: Map<string, number | null>; wardLabel: string;
  selectedWards: string[]; onWardClick: (w: string) => void;
}

function ClusterLayer({ rows }: { rows: Complaint[] }) {
  const map = useMap();
  const index = useMemo(() => {
    const sc = new Supercluster<{ i: number }>({ radius: 55, maxZoom: 17 });
    sc.load(rows.map((r, i) => ({ type: "Feature" as const, properties: { i }, geometry: { type: "Point" as const, coordinates: [r.lon, r.lat] } })));
    return sc;
  }, [rows]);
  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    const canvas = L.canvas({ padding: 0.5 });
    const draw = () => {
      group.clearLayers();
      const b = map.getBounds();
      const items = index.getClusters([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], Math.round(map.getZoom()));
      for (const it of items) {
        const [lon, lat] = it.geometry.coordinates;
        const p: any = it.properties;
        if (p.cluster) {
          const n: number = p.point_count;
          const size = n > 5000 ? 54 : n > 1000 ? 46 : n > 100 ? 38 : 30;
          const icon = L.divIcon({ html: `<div class="cluster" style="width:${size}px;height:${size}px;line-height:${size}px">${p.point_count_abbreviated}</div>`, className: "", iconSize: [size, size] });
          const m = L.marker([lat, lon], { icon });
          m.on("click", () => map.flyTo([lat, lon], Math.min(index.getClusterExpansionZoom(p.cluster_id), 18)));
          group.addLayer(m);
        } else {
          const r = rows[p.i];
          const m = L.circleMarker([lat, lon], { renderer: canvas, radius: 6, color: "#fff", weight: 1.5, fillColor: CAT_COLORS[r.category] ?? "#555", fillOpacity: 0.95 });
          m.bindPopup(`<b>${r.category}</b><br/>${r.subcategory}<br/>Ward <b>${r.ward}</b> · ${r.date}<br/>Status: ${r.status}${r.resDays !== null ? `<br/>Resolved in ${r.resDays} days` : ""}<br/><small>${r.id}</small>`);
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

function HeatLayer({ rows }: { rows: Complaint[] }) {
  const map = useMap();
  useEffect(() => {
    const pts = rows.map((r) => [r.lat, r.lon, 1] as [number, number, number]);
    const layer = (L as any).heatLayer(pts, { radius: 12, blur: 16, minOpacity: 0.2, max: Math.max(2, rows.length / 18000), gradient: { 0.2: "#2b83ba", 0.4: "#abdda4", 0.6: "#ffffbf", 0.8: "#fdae61", 1.0: "#d7191c" } });
    layer.addTo(map);
    return () => { layer.remove(); };
  }, [map, rows]);
  return null;
}

function Choropleth({ geo, values, label, selected, onClick }: { geo: any; values: Map<string, number | null>; label: string; selected: string[]; onClick: (w: string) => void }) {
  const map = useMap();
  const [min, max] = useMemo(() => {
    const v = [...values.values()].filter((x): x is number => x !== null);
    return [Math.min(...v, 0), Math.max(...v, 1)];
  }, [values]);
  useEffect(() => {
    const layer = L.geoJSON(geo, {
      style: (f) => {
        const w = f!.properties.ward; const v = values.get(w) ?? null;
        return { fillColor: rampColor(v, min, max), fillOpacity: 0.78, weight: selected.includes(w) ? 3 : 1, color: selected.includes(w) ? "#0b3d91" : "#666" };
      },
      onEachFeature: (f, l) => {
        const w = f.properties.ward; const v = values.get(w);
        l.bindTooltip(`<b>Ward ${w}</b><br/>${label}: <b>${v ?? "n/a"}</b>`, { sticky: true });
        l.on("click", () => onClick(w));
      },
    }).addTo(map);
    const legend = new L.Control({ position: "bottomright" });
    legend.onAdd = () => {
      const d = L.DomUtil.create("div", "legend");
      d.innerHTML = `<b class="lg-t">${label}</b><div class="ramp">${RAMP.map((c) => `<i style="background:${c}"></i>`).join("")}</div><div class="rl"><span>${min.toFixed(0)}</span><span>${max.toFixed(max < 20 ? 1 : 0)}</span></div>`;
      return d;
    };
    legend.addTo(map);
    return () => { layer.remove(); legend.remove(); };
  }, [map, geo, values, label, min, max, selected, onClick]);
  return null;
}


export default function MapView({ rows, geo, mode, wardValues, wardLabel, selectedWards, onWardClick }: Props) {
  const ref = useRef(null);
  return (
    <MapContainer ref={ref} center={[19.08, 72.88]} zoom={11} minZoom={9} className="map" preferCanvas>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {mode === "clusters" && <ClusterLayer rows={rows} />}
      {mode === "heatmap" && <HeatLayer rows={rows} />}
      {mode === "choropleth" && <Choropleth geo={geo} values={wardValues} label={wardLabel} selected={selectedWards} onClick={onWardClick} />}
    </MapContainer>
  );
}
