/**
 * The API the web interface talks to. Every route is listed here in one chain, which is what lets the browser code know
 * the exact shape of every request and response.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import * as ActivityRoutes from "./routes/activity/index.ts";
import * as ArrRoutes from "./routes/arrs/index.ts";
import * as CopyRoutes from "./routes/copies/index.ts";
import * as MovieRoutes from "./routes/movies/index.ts";
import * as SeriesRoutes from "./routes/series/index.ts";
import * as SettingsRoutes from "./routes/settings/index.ts";
import * as LogService from "./services/log.ts";

export const app = new Hono()
  .basePath("/api")
  .onError((err, c) => {
    // Errors raised on purpose carry their own status and message. Anything else is unexpected, so log it
    const status = err instanceof HTTPException ? err.status : 500;
    if (status === 500) LogService.error(err.message, { path: c.req.path });
    return c.json({ error: err.message }, status);
  })
  .get("/health", (c) => c.json({ ok: true }))
  .get("/arrs", ...ArrRoutes.list)
  .post("/arrs", ...ArrRoutes.create)
  .post("/arrs/test", ...ArrRoutes.test)
  .put("/arrs/:id", ...ArrRoutes.update)
  .delete("/arrs/:id", ...ArrRoutes.remove)
  .get("/movies", ...MovieRoutes.list)
  .put("/movies/:arr/:id/pin", ...MovieRoutes.pin)
  .delete("/movies/:arr/:id/pin", ...MovieRoutes.unpin)
  .get("/series", ...SeriesRoutes.list)
  .get("/series/:arr/:id", ...SeriesRoutes.show)
  .put("/series/:arr/:id/pin", ...SeriesRoutes.pin)
  .delete("/series/:arr/:id/pin", ...SeriesRoutes.unpin)
  .put("/series/:arr/:id/seasons/:season/pin", ...SeriesRoutes.pin)
  .delete("/series/:arr/:id/seasons/:season/pin", ...SeriesRoutes.unpin)
  .post("/copies/resolve", ...CopyRoutes.resolve)
  .get("/activity", ...ActivityRoutes.status)
  .get("/settings", ...SettingsRoutes.options)
  .patch("/settings", ...SettingsRoutes.update);

export type App = typeof app;
