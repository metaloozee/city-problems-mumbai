import Papa from "papaparse";
import type { Complaint, WardInfo } from "./types";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function loadData() {
  const base = import.meta.env.BASE_URL;
  const [csv, geo] = await Promise.all([
    fetch(`${base}data/complaints.csv`).then((r) => r.text()),
    fetch(`${base}data/wards.geojson`).then((r) => r.json()),
  ]);
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows: Complaint[] = parsed.data.map((r) => {
    const d = new Date(r.date + "T00:00:00Z");
    return {
      id: r.id, date: r.date, month: r.date.slice(0, 7), weekday: d.getUTCDay(), category: r.category,
      subcategory: r.subcategory, ward: r.ward, zone: r.zone, status: r.status, lat: +r.lat, lon: +r.lon,
      resDays: r.res_days === "" ? null : +r.res_days, source: r.source, dataset: r.dataset,
    };
  });
  const wards: WardInfo[] = geo.features.map((f: any) => ({ ward: f.properties.ward, population: f.properties.population }));
  return { rows, geo, wards };
}
