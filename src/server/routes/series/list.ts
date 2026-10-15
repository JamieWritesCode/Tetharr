import * as HttpService from "../../services/http.ts";
import * as LibraryService from "../../services/library.ts";

/**
 * Lists every series from every Sonarr, plus copies of series that are no longer in Sonarr.
 */
export const list = HttpService.handlers(async (c) => c.json(await LibraryService.series()));
