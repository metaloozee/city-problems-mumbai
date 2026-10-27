// Usage:  DATABASE_URL=postgres://… npm run db:setup            schema + wards + all BMC problems
//         DATABASE_URL=postgres://… npm run db:setup -- --schema-only
// Reads DATABASE_URL from the environment or from web/.env.local.
import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { createSchema, loadBmcProblems, loadWards } from "../db/setup.mjs";

if (!process.env.DATABASE_URL && existsSync(new URL("../.env.local", import.meta.url))) {
  for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
    const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) process.env.DATABASE_URL = m[1];
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Put your Neon connection string in web/.env.local or the environment.");
  process.exit(1);
}
const client = neon(process.env.DATABASE_URL);
const sql = (text, params = []) => client.query(text, params);

console.log("Creating schema…");
await createSchema(sql);
console.log(`Loaded ${await loadWards(sql)} wards`);
if (!process.argv.includes("--schema-only")) {
  console.log("Loading BMC problems…");
  await loadBmcProblems(sql);
}
const counts = await sql(`SELECT source, count(*)::int AS n FROM problems GROUP BY source ORDER BY source`);
console.log("Done:", counts);
