import { HTTPException } from "hono/http-exception";
import * as HttpService from "../../services/http.ts";
import * as PinsService from "../../services/pins.ts";
import * as SettingsService from "../../services/settings.ts";
import { kick } from "../../worker.ts";

/**
 * Pins a movie, so the worker makes a local copy of it. The worker starts straight away rather than at its next pass.
 */
export const pin = HttpService.handlers(HttpService.title, (c) => {
  const { arr, id } = c.req.valid("param");
  if (!SettingsService.arrs().some((a) => a.id === arr))
    throw new HTTPException(404, { message: "No such connection" });
  PinsService.add(arr, id);
  kick();
  return c.json({ pinned: true });
});
