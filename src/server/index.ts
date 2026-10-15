/**
 * Starts Tetharr: opens the database, serves the API and the web interface on one port, and starts the worker.
 */

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { existsSync } from "node:fs";
import { app } from "./app.ts";
import * as DbService from "./services/db.ts";
import * as FilesService from "./services/files.ts";
import * as LogService from "./services/log.ts";
import { kick } from "./worker.ts";

const port = Number(process.env.PORT ?? 8787);

// Open the database before anything can ask for data
DbService.open(process.env.TETHARR_DB ?? "/config/tetharr.db");

// Serve the API, and turn away addresses under /api that don't exist
const root = new Hono().route("/", app).all("/api/*", (c) => c.json({ error: "There is no such API route" }, 404));

// Serve the built web interface, sending any other address to it so its own router handles it. In development, Vite
// serves it instead
if (existsSync("dist")) root.use(serveStatic({ root: "./dist" })).get("*", serveStatic({ path: "./dist/index.html" }));
serve({ fetch: root.fetch, port });

// Exit cleanly when Docker or the terminal asks us to stop, deleting any half-written copy
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    FilesService.abort();
    process.exit(0);
  });
}

LogService.info("started", { port });

// Start the worker's first pass. It schedules every pass after that itself
kick();
