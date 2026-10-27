import { neon } from "@neondatabase/serverless";

/** Runs one parameterised SQL statement and returns its rows. */
export type Sql = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;
export interface Db { sql: Sql; kind: "neon" | "local" }

declare global {
  // Set by the Vite dev server (vite.config.ts) when DATABASE_URL is missing: an in-process PGlite database.
  var __cityProblemsDevDb: Db | undefined;
}

let cached: Db | null = null;

/** Neon in production (DATABASE_URL), a local PGlite database in `npm run dev`, otherwise null. */
export function getDb(): Db | null {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;
  if (url) {
    const client = neon(url);
    cached = { kind: "neon", sql: (text, params = []) => client.query(text, params) as Promise<Record<string, any>[]> };
    return cached;
  }
  return globalThis.__cityProblemsDevDb ?? null;
}
