import * as HttpService from "../../services/http.ts";
import * as LibraryService from "../../services/library.ts";

/**
 * Lists every movie from every Radarr, with where each one's file lives right now.
 */
export const list = HttpService.handlers(async (c) => c.json(await LibraryService.movies()));
