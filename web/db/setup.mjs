// Creates the schema and loads the unified dataset into a PostgreSQL database (Neon in production).
// Shared by `npm run db:setup` (scripts/db-setup.mjs) and the Vite dev server's local database.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const ROOT = here("../../");

/** @param {(text: string, params?: unknown[]) => Promise<any[]>} sql */
export async function createSchema(sql) {
  const ddl = readFileSync(here("./schema.sql"), "utf8").replace(/--.*$/gm, "");
  for (const stmt of ddl.split(/;\s*$/m).map((s) => s.trim()).filter(Boolean)) await sql(stmt);
}

/** @param {(text: string, params?: unknown[]) => Promise<any[]>} sql */
export async function loadWards(sql) {
  const { data } = Papa.parse(readFileSync(`${ROOT}data/processed/wards.csv`, "utf8"), { header: true, skipEmptyLines: true });
  await sql(
    `INSERT INTO wards (ward, name, areas, zone, population)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::int[])
     ON CONFLICT (ward) DO UPDATE SET name = EXCLUDED.name, areas = EXCLUDED.areas, zone = EXCLUDED.zone, population = EXCLUDED.population`,
    [data.map((r) => r.ward), data.map((r) => r.name), data.map((r) => r.areas), data.map((r) => r.zone || null), data.map((r) => +r.population)]);
  return data.length;
}

const COLS = [
  ["id", "text"], ["reported_at", "timestamptz"], ["category", "text"], ["subcategory", "text"], ["department", "text"],
  ["ward", "text"], ["zone", "text"], ["division", "text"], ["lat", "float8"], ["lon", "float8"], ["has_location", "bool"],
  ["status", "text"], ["closed_at", "timestamptz"], ["days_to_close", "numeric"], ["channel", "text"], ["escalated", "bool"],
  ["escalation_level", "int2"], ["road_type", "text"],
];

/** Upserts every BMC row from data/processed/problems.csv.gz. Citizen reports are never touched. */
export async function loadBmcProblems(sql, { batch = 2000, log = console.log } = {}) {
  const csv = gunzipSync(readFileSync(`${ROOT}data/processed/problems.csv.gz`)).toString("utf8");
  const { data } = Papa.parse(csv, { header: true, skipEmptyLines: true });
  const val = (r, c, t) => {
    const v = r[c];
    if (v === "" || v === undefined) return null;
    if (t === "bool") return v === "True";
    return v;
  };
  const cols = COLS.map(([c]) => c).join(", ");
  const unnest = COLS.map(([, t], i) => `$${i + 1}::${t}[]`).join(", ");
  const updates = COLS.slice(1).map(([c]) => `${c} = EXCLUDED.${c}`).join(", ");
  for (let i = 0; i < data.length; i += batch) {
    const rows = data.slice(i, i + batch);
    await sql(
      `INSERT INTO problems (${cols}, source) SELECT *, 'bmc' FROM unnest(${unnest})
       ON CONFLICT (id) DO UPDATE SET ${updates} WHERE problems.source = 'bmc'`,
      COLS.map(([c, t]) => rows.map((r) => val(r, c, t))));
    log(`  problems ${Math.min(i + batch, data.length).toLocaleString()} / ${data.length.toLocaleString()}`);
  }
  return data.length;
}
