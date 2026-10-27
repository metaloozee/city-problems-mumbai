import { CATEGORIES, LIMITS, MUMBAI_BBOX } from "../../shared/categories.js";
import { wardAt } from "../../shared/geo.js";
import wards from "../../shared/wards.geo.js";

/** Columns returned to the browser for a citizen report. Never includes reporter_hash. */
export const PUBLIC_COLUMNS = `id, reported_at, category, description, landmark, ward, lat, lon, status, supporters`;

export interface NewReport { category: string; description: string; landmark: string; lat: number; lon: number; ward: string }

const REPORTABLE = new Set(CATEGORIES.filter((c) => c.reportable).map((c) => c.name));
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Validates a report body. Returns the cleaned report or a message that tells the citizen what to fix. */
export function validateReport(body: Record<string, unknown>): NewReport | string {
  const category = clean(body.category, 60);
  if (!REPORTABLE.has(category)) return "Choose a problem type from the list.";
  const description = clean(body.description, LIMITS.description);
  if (description.length < 10) return "Describe the problem in at least 10 characters.";
  const landmark = clean(body.landmark, LIMITS.landmark);
  const lat = Number(body.lat), lon = Number(body.lon);
  const b = MUMBAI_BBOX;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < b.latMin || lat > b.latMax || lon < b.lonMin || lon > b.lonMax)
    return "The pin is outside Mumbai. Move the pin to the problem location.";
  const ward = wardAt(wards.features, lat, lon);
  if (!ward) return "The pin is outside BMC's 26 wards, for example in the sea. Move the pin onto land.";
  return { category, description, landmark, lat: +lat.toFixed(6), lon: +lon.toFixed(6), ward };
}

/** Human-friendly tracking ID, e.g. CR-261027-4F7Q. */
export function newReportId(now = new Date()): string {
  const d = now.toISOString().slice(2, 10).replace(/-/g, "");
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let tail = "";
  for (let i = 0; i < 4; i++) tail += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `CR-${d}-${tail}`;
}

export { LIMITS };
