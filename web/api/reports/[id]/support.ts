import { getDb } from "../../_lib/db.js";
import { NO_DB, error, json, readJson, reporterHash } from "../../_lib/http.js";

/** POST /api/reports/:id/support: "I face this too". One vote per device; returns the new count. */
export async function POST(request: Request): Promise<Response> {
  const db = getDb();
  if (!db) return NO_DB();
  const id = decodeURIComponent(new URL(request.url).pathname.split("/").at(-2) ?? "");
  if (!/^CR-\d{6}-[A-Z0-9]{4}$/.test(id)) return error(404, "Report not found.");
  const body = (await readJson(request)) ?? {};
  const hash = reporterHash(request, body.deviceId);
  const rows = await db.sql(
    `WITH added AS (
       INSERT INTO problem_supporters (problem_id, reporter_hash)
       SELECT id, $2 FROM problems WHERE id = $1 AND source = 'citizen'
       ON CONFLICT DO NOTHING RETURNING problem_id)
     UPDATE problems SET supporters = supporters + (SELECT count(*) FROM added)::int
     WHERE id = $1 AND source = 'citizen'
     RETURNING supporters, (SELECT count(*) FROM added)::int AS added`, [id, hash]);
  if (!rows.length) return error(404, "Report not found.");
  return json({ supporters: rows[0].supporters, alreadySupported: rows[0].added === 0 });
}
