import { HTTPException } from "hono/http-exception";
import * as HttpService from "../../services/http.ts";
import * as PinsService from "../../services/pins.ts";
import * as SettingsService from "../../services/settings.ts";
import { kick } from "../../worker.ts";

/**
 * Pins a whole series, or one season of it, so the worker makes local copies of its episodes. A series pin covers every
 * season, including episodes that arrive later. The worker starts straight away rather than at its next pass.
 */
export const pin = HttpService.handlers(HttpService.season, (c) => {
  const { arr, id, season } = c.req.valid("param");
  const connection = SettingsService.arrs().find((a) => a.id === arr && a.type === "sonarr");
  if (!connection) throw new HTTPException(404, { message: "No such Sonarr connection" });
  if (connection.removing) throw new HTTPException(409, { message: `${connection.name} is being removed` });
  if (season !== undefined && PinsService.list(arr).has(id)) {
    throw new HTTPException(409, { message: "The whole series is pinned, which already covers this season" });
  }
  PinsService.add(arr, id, season);
  kick();
  return c.json({ pinned: true });
});
