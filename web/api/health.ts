import { getDb } from "./_lib/db.js";
import { json } from "./_lib/http.js";

/** GET /api/health: whether the reports database is reachable. */
export async function GET(): Promise<Response> {
  const db = getDb();
  if (!db) return json({ database: "none" });
  try {
    const [{ n }] = await db.sql(`SELECT count(*)::int AS n FROM problems WHERE source = 'citizen'`);
    return json({ database: db.kind, citizenReports: n });
  } catch (e) {
    return json({ database: db.kind, error: "Database is configured but the query failed. Run pnpm db:setup." }, 500);
  }
}
