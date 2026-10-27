import Papa from "papaparse";
import wardsGeo from "../shared/wards.geo";
import { OPEN_STATUSES } from "../shared/categories";
import type { Problem, WardInfo } from "./types";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function centroid(coords: number[][][] | number[][][][]): [number, number] {
  // Mean of the outer ring of the largest polygon: good enough to centre the map on a ward.
  const polys = (typeof coords[0][0][0] === "number" ? [coords] : coords) as number[][][][];
  const ring = polys.map((p) => p[0]).sort((a, b) => b.length - a.length)[0];
  const [x, y] = ring.reduce(([sx, sy], [lon, lat]) => [sx + lon, sy + lat], [0, 0]);
  return [y / ring.length, x / ring.length];
}

export const WARDS: WardInfo[] = wardsGeo.features
  .map((f) => ({ ...f.properties, centroid: centroid(f.geometry.coordinates as any) }))
  .sort((a, b) => a.name.localeCompare(b.name));
export const WARD_BY_CODE = new Map(WARDS.map((w) => [w.ward, w]));
export const wardLabel = (code: string) => {
  const w = WARD_BY_CODE.get(code);
  return w ? (w.name.length <= 2 ? `Ward ${w.name}` : w.name) : `Ward ${code}`;
};

export async function loadProblems(): Promise<Problem[]> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/problems.csv`);
  if (!res.ok) throw new Error(`problems.csv returned HTTP ${res.status}`);
  const parsed = Papa.parse<Record<string, string>>(await res.text(), { header: true, skipEmptyLines: true });
  return parsed.data.map((r) => {
    const d = new Date(r.d + "T00:00:00Z");
    return {
      id: r.id, date: r.d, month: r.d.slice(0, 7), weekday: d.getUTCDay(), hour: +r.h,
      category: r.c, subcategory: r.s, ward: r.w, status: r.st, isOpen: OPEN_STATUSES.has(r.st),
      lat: +r.lat, lon: +r.lon, daysToClose: r.dc === "" ? null : +r.dc, channel: r.ch, escalated: r.esc === "1",
    };
  });
}
