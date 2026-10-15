/**
 * Builds the library: what each Arr reports, combined with what is actually on disk, what the user has pinned, and
 * which local files are Tetharr's own copies. The web interface shows it, and the worker acts on it.
 */

import type { Arr } from "../../schemas/arr.ts";
import * as ArrService from "./arr.ts";
import type { Movie } from "./arr.ts";
import * as CopiesService from "./copies.ts";
import * as FilesService from "./files.ts";
import type { State } from "./files.ts";
import * as LogService from "./log.ts";
import * as PathsService from "./paths.ts";
import * as PinsService from "./pins.ts";
import * as SettingsService from "./settings.ts";

/**
 * A movie, which Radarr it came from, where Tetharr sees its file and what that file is right now, whether the user has
 * pinned it, and whether its local file is a copy Tetharr made. For a copy, `restorable` says whether unpinning can
 * simply put the link back. A movie without a file yet has the state "none".
 */
export interface Entry extends Movie {
  arr: number;
  path: string | undefined;
  state: State | "none";
  pinned: boolean;
  managed: boolean;
  restorable: boolean;
}

/**
 * A copy Tetharr made of a movie that Radarr no longer lists, whose file is still on disk. Tetharr leaves these alone
 * until the user decides to keep or delete them.
 */
export interface Orphan {
  arr: string;
  path: string;
  size: number;
}

/**
 * Every movie in one Radarr, with where its file lives.
 */
export async function entries(arr: Arr): Promise<Entry[]> {
  const pinned = PinsService.list(arr.id);
  const copies = new Map(CopiesService.list(arr.id).map((c) => [c.path, c]));

  // Translate each file's path into Tetharr's view, then look at what's there
  return Promise.all(
    (await ArrService.movies(arr)).map(async (movie) => {
      const path = movie.file && PathsService.map(arr, movie.file);
      const state = path ? await FilesService.state(path) : ("none" as const);
      const copy = path ? copies.get(path) : undefined;
      const restorable = !!copy && (await FilesService.restorable(copy));
      return { ...movie, arr: arr.id, path, state, pinned: pinned.has(movie.id), managed: !!copy, restorable };
    }),
  );
}

/**
 * Tetharr's copies of movies one Radarr no longer lists, whose files are still there.
 */
async function orphans(arr: Arr, movies: Entry[]): Promise<Orphan[]> {
  // Safety: never act because data is missing. An empty list from Radarr says nothing about which titles are gone
  if (!movies.length) return [];
  // A copy at a listed movie's path belongs to that movie, even if the movie was removed and added again with a new id
  const listed = new Set(movies.map((m) => m.id));
  const paths = new Set(movies.map((m) => m.path));
  const found: Orphan[] = [];
  for (const copy of CopiesService.list(arr.id).filter((c) => !listed.has(c.media) && !paths.has(c.path))) {
    if ((await FilesService.check(copy)) === "copy") found.push({ arr: arr.name, path: copy.path, size: copy.size });
  }
  return found;
}

/**
 * Every movie from every Radarr, plus copies of movies that are no longer in Radarr. A Radarr that can't be reached is
 * listed in `errors` instead.
 */
export async function movies(): Promise<{ movies: Entry[]; orphans: Orphan[]; errors: string[] }> {
  const movies: Entry[] = [];
  const found: Orphan[] = [];
  const errors: string[] = [];

  // Go through each Radarr in turn. Safety: one that can't be reached is reported, never treated as empty
  for (const arr of SettingsService.arrs().filter((a) => a.type === "radarr")) {
    try {
      const listed = await entries(arr);
      movies.push(...listed);
      found.push(...(await orphans(arr, listed)));
    } catch (err) {
      errors.push((err as Error).message);
      LogService.error((err as Error).message, { arr: arr.name });
    }
  }
  return { movies, orphans: found, errors };
}
