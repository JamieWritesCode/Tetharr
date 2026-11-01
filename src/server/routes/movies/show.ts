import { HTTPException } from "hono/http-exception";
import * as HttpService from "../../services/http.ts";
import * as LibraryService from "../../services/library.ts";
import * as SettingsService from "../../services/settings.ts";

/**
 * One movie and where its file lives right now, for the movie's own page.
 */
export const show = HttpService.handlers(HttpService.title, async (c) => {
  const { arr, id } = c.req.valid("param");
  const connection = SettingsService.arrs().find((a) => a.id === arr && a.type === "radarr");
  if (!connection) throw new HTTPException(404, { message: "No such Radarr connection" });
  const movie = await LibraryService.movie(connection, id);
  if (!movie) throw new HTTPException(404, { message: `${connection.name} doesn't have that movie` });
  return c.json(movie);
});
