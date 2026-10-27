import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * Serves the Vercel functions in web/api/ during `pnpm dev`, so the app works locally exactly as deployed.
 * Without DATABASE_URL it starts a local PGlite database in web/.data/ (schema + wards only) for citizen reports.
 */
function devApi(): Plugin {
  const routes: [RegExp, string][] = [
    [/^\/api\/reports\/?$/, "/api/reports/index.ts"],
    [/^\/api\/reports\/[^/]+\/support\/?$/, "/api/reports/[id]/support.ts"],
    [/^\/api\/health\/?$/, "/api/health.ts"],
  ];
  async function localDb(server: ViteDevServer) {
    if (process.env.DATABASE_URL || globalThis.__cityProblemsDevDb) return;
    const { PGlite } = await import("@electric-sql/pglite");
    const { mkdirSync } = await import("node:fs");
    mkdirSync("./.data", { recursive: true });
    const pg = new PGlite("./.data/pglite");
    const sql = async (text: string, params: unknown[] = []) => (await pg.query(text, params)).rows as Record<string, any>[];
    const setup = await server.ssrLoadModule("/db/setup.mjs");
    await setup.createSchema(sql);
    await setup.loadWards(sql);
    globalThis.__cityProblemsDevDb = { kind: "local", sql };
    server.config.logger.info("  ➜  API:     local PGlite database in web/.data/pglite (set DATABASE_URL to use Neon)");
  }
  async function toRequest(req: IncomingMessage): Promise<Request> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
    return new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body });
  }
  return {
    name: "dev-api",
    apply: "serve",
    async configureServer(server) {
      const ready = localDb(server).catch((e) => server.config.logger.error(`Local database failed to start: ${e}`));
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        const path = (req.url ?? "").split("?")[0];
        const route = routes.find(([rx]) => rx.test(path));
        if (!route) return next();
        await ready;
        try {
          const mod = await server.ssrLoadModule(route[1]);
          const handler = mod[req.method ?? "GET"];
          const response: Response = handler
            ? await handler(await toRequest(req))
            : new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
          res.statusCode = response.status;
          response.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (e) {
          server.config.logger.error(String((e as Error).stack ?? e));
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "Server error. Check the dev server log." }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return {
    plugins: [react(), tailwindcss(), devApi()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  };
});
