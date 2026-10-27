import { createHash } from "node:crypto";

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}
export function error(status: number, message: string): Response {
  return json({ error: message }, status);
}
export const NO_DB = () =>
  error(503, "The reports database is not connected yet. Set DATABASE_URL to your Neon connection string and redeploy.");

/**
 * Salted hash that identifies a reporter's device for rate limits and "I face this too" de-duplication.
 * Combines the browser's random device ID with the client IP; neither is stored in clear text.
 */
export function reporterHash(request: Request, deviceId: unknown): string {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const device = typeof deviceId === "string" ? deviceId.slice(0, 64) : "";
  const salt = process.env.REPORTER_SALT ?? "city-problems-mumbai";
  return createHash("sha256").update(`${salt}|${ip}|${device}`).digest("hex").slice(0, 32);
}

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
