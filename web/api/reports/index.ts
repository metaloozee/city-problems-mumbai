import { getDb } from "../_lib/db.js";
import { NO_DB, error, json, readJson, reporterHash } from "../_lib/http.js";
import { LIMITS, PUBLIC_COLUMNS, newReportId, validateReport } from "../_lib/reports.js";

/** GET /api/reports: every citizen report (newest first). Optional ?ward=KW. */
export async function GET(request: Request): Promise<Response> {
  const db = getDb();
  if (!db) return NO_DB();
  const ward = new URL(request.url).searchParams.get("ward");
  const rows = ward
    ? await db.sql(`SELECT ${PUBLIC_COLUMNS} FROM problems WHERE source = 'citizen' AND ward = $1 ORDER BY reported_at DESC LIMIT 2000`, [ward])
    : await db.sql(`SELECT ${PUBLIC_COLUMNS} FROM problems WHERE source = 'citizen' ORDER BY reported_at DESC LIMIT 5000`);
  return json({ reports: rows, database: db.kind });
}

/** POST /api/reports: file a new citizen report. Body: { category, description, landmark?, lat, lon, deviceId }. */
export async function POST(request: Request): Promise<Response> {
  const db = getDb();
  if (!db) return NO_DB();
  const body = await readJson(request);
  if (!body) return error(400, "The request body must be JSON.");
  const report = validateReport(body);
  if (typeof report === "string") return error(422, report);
  const hash = reporterHash(request, body.deviceId);
  const [{ n }] = await db.sql(
    `SELECT count(*)::int AS n FROM problems WHERE source = 'citizen' AND reporter_hash = $1 AND created_at > now() - interval '1 day'`, [hash]);
  if (n >= LIMITS.reportsPerDay) return error(429, `You have filed ${LIMITS.reportsPerDay} reports today. Try again tomorrow.`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newReportId();
    const rows = await db.sql(
      `INSERT INTO problems (id, source, reported_at, category, subcategory, description, landmark, ward, zone, division, lat, lon, has_location, status, channel, reporter_hash)
       SELECT $1, 'citizen', now(), $2, $2, $3, NULLIF($4, ''), $5, w.zone,
              (SELECT division FROM problems WHERE ward = $5 AND division IS NOT NULL LIMIT 1), $6, $7, true, 'Open', 'City Problems app', $8
       FROM wards w WHERE w.ward = $5
       ON CONFLICT (id) DO NOTHING
       RETURNING ${PUBLIC_COLUMNS}`,
      [id, report.category, report.description, report.landmark, report.ward, report.lat, report.lon, hash]);
    if (rows.length) return json({ report: rows[0] }, 201);
  }
  return error(500, "Could not create a tracking ID. Try again.");
}
