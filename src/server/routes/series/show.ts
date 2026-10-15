import { HTTPException } from "hono/http-exception";
import * as HttpService from "../../services/http.ts";
import * as LibraryService from "../../services/library.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * One series with every episode file and where each lives right now, for the series' own page.
 */
export const show = HttpService.handlers(HttpService.title, async (c) => {
  const { arr, id } = c.req.valid("param");
  const connection = SettingsService.arrs().find((a) => a.id === arr && a.type === "sonarr");
  if (!connection) throw new HTTPException(404, { message: "No such Sonarr connection" });
  const series = await LibraryService.show(connection, id);
  if (!series) throw new HTTPException(404, { message: `${connection.name} doesn't have that series` });
  return c.json(series);
});
