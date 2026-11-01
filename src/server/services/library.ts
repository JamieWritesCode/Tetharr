/**
 * Builds the library, for movies and series: what each Arr reports, combined with what is actually on disk, what the
 * user has pinned, and which local files are Tetharr's own copies. The web interface shows it, and the worker acts on
 * it.
 */

import type { Arr } from "../../schemas/arr.ts";
import * as ArrService from "./arr.ts";
import type { Movie, Series } from "./arr.ts";
import * as CopiesService from "./copies.ts";
import * as FilesService from "./files.ts";
import type { State } from "./files.ts";
import * as LogService from "./log.ts";
import * as PathsService from "./paths.ts";
import * as PinsService from "./pins.ts";
import * as SettingsService from "./settings.ts";

// Compares names the way a person reads them, so "Episode 2" comes before "Episode 10"
const { compare } = new Intl.Collator(undefined, { numeric: true });

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
 * A copy Tetharr made of a title its Arr no longer lists, whose file is still there. Tetharr leaves these alone until
 * the user decides to keep or delete them.
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
 * One movie in one Radarr, with where its file lives, for its own page. Nothing is returned if the Radarr no longer has
 * it.
 */
export const movie = async (arr: Arr, id: number) => (await entries(arr)).find((m) => m.id === id);

/**
 * Tetharr's copies, for one Arr, of titles it no longer lists, whose files are still there. `claimed` says whether a
 * copy still belongs to a listed title, such as one removed and added again with a new id.
 */
async function orphans(arr: Arr, listed: number, claimed: (path: string) => boolean): Promise<Orphan[]> {
  // Safety: never act because data is missing. An empty list from the Arr says nothing about which titles are gone
  if (!listed) return [];
  const found: Orphan[] = [];
  for (const copy of CopiesService.list(arr.id).filter((c) => !claimed(c.path))) {
    if ((await FilesService.check(copy)) === "copy") found.push({ arr: arr.name, path: copy.path, size: copy.size });
  }
  return found;
}

/**
 * Every movie from every Radarr in title order, plus copies of movies that are no longer in Radarr. A Radarr that can't
 * be reached is listed in `errors` instead.
 */
export async function movies(): Promise<{ movies: Entry[]; orphans: Orphan[]; errors: string[] }> {
  const movies: Entry[] = [];
  const found: Orphan[] = [];
  const errors: string[] = [];

  // Go through each Radarr in turn. Safety: one that can't be reached is reported, never treated as empty
  for (const arr of SettingsService.arrs().filter((a) => a.type === "radarr")) {
    try {
      const listed = await entries(arr);
      const paths = new Set(listed.map((m) => m.path));
      movies.push(...listed);
      found.push(...(await orphans(arr, listed.length, (path) => paths.has(path))));
    } catch (err) {
      errors.push((err as Error).message);
      LogService.error((err as Error).message, { arr: arr.name });
    }
  }
  return { movies: movies.sort((a, b) => compare(a.sortTitle, b.sortTitle)), orphans: found, errors };
}

/**
 * A series: which Sonarr it came from, whether it's pinned as a whole, which seasons are pinned on their own, and how
 * many of its episode files are local copies Tetharr made.
 */
export interface Show extends Series {
  arr: number;
  pinned: boolean;
  seasonsPinned: number[];
  copies: number;
}

/**
 * A series in the grid, with where its files live.
 */
type Card = Show & { state: Awaited<ReturnType<typeof place>> };

/**
 * One episode file: where Tetharr sees it, what it is right now, and whether it's a copy Tetharr made (and if so,
 * whether unpinning can simply put its link back). `name` is the file's name, which Sonarr fills with the episode.
 */
export interface EpisodeFile {
  id: number;
  season: number;
  name: string;
  size: number;
  path: string;
  state: State;
  managed: boolean;
  restorable: boolean;
}

/**
 * Every series in one Sonarr, for the grid.
 */
export async function shows(arr: Arr): Promise<Show[]> {
  const pinned = PinsService.list(arr.id);
  const seasons = PinsService.seasons(arr.id);
  const copies = CopiesService.list(arr.id);
  return (await ArrService.series(arr)).map((series) => ({
    ...series,
    arr: arr.id,
    pinned: pinned.has(series.id),
    seasonsPinned: [...(seasons.get(series.id) ?? [])],
    copies: copies.filter((c) => c.media === series.id).length,
  }));
}

/**
 * Every episode file in one series, with where it lives right now, in episode order. Sonarr doesn't give episode
 * numbers with its files, but its file names always carry them, so sorting by name puts them in order and the worker
 * copies the first episode first.
 */
export async function episodes(arr: Arr, series: Series): Promise<EpisodeFile[]> {
  const copies = new Map(CopiesService.list(arr.id).map((c) => [c.path, c]));

  // Translate each file's path into Tetharr's view, then look at what's there
  return Promise.all(
    (await ArrService.episodes(arr, series.id)).map(async ({ id, season, file, size }) => {
      const path = PathsService.map(arr, file);
      const copy = copies.get(path);
      const restorable = !!copy && (await FilesService.restorable(copy));
      const name = file.split("/").at(-1)!;
      return { id, season, name, size, path, state: await FilesService.state(path), managed: !!copy, restorable };
    }),
  ).then((files) => files.sort((a, b) => a.season - b.season || compare(a.name, b.name)));
}

/**
 * Where a series' files live, for its card: all links, all real files (Tetharr's copies or not), a mix, or nothing
 * Tetharr can see. It's judged from the video files in the series' folder, because Sonarr only lists files one series
 * at a time. Links aren't followed, so whether they can be is left to the series' own page.
 */
async function place(arr: Arr, show: Show, copies: Set<string>) {
  if (!show.files) return "none" as const;
  const files = await FilesService.scan(PathsService.map(arr, show.path));
  const links = files.filter((f) => f.link).length;
  if (!files.length) return "unseen" as const;
  if (links === files.length) return "streamed" as const;
  if (links) return "partial" as const;
  return files.every((f) => copies.has(f.path)) ? ("local" as const) : ("unmanaged" as const);
}

/**
 * Every series from every Sonarr in title order, with where its files live, plus copies of series that are no longer
 * in Sonarr. A Sonarr that can't be reached is listed in `errors` instead.
 */
export async function series(): Promise<{ series: Card[]; orphans: Orphan[]; errors: string[] }> {
  const found: Card[] = [];
  const left: Orphan[] = [];
  const errors: string[] = [];

  // Go through each Sonarr in turn. Safety: one that can't be reached is reported, never treated as empty
  for (const arr of SettingsService.arrs().filter((a) => a.type === "sonarr")) {
    try {
      const listed = await shows(arr);
      const folders = listed.map((s) => PathsService.map(arr, s.path));
      const copies = new Set(CopiesService.list(arr.id).map((c) => c.path));
      found.push(...(await Promise.all(listed.map(async (s) => ({ ...s, state: await place(arr, s, copies) })))));
      left.push(...(await orphans(arr, listed.length, (path) => folders.some((f) => PathsService.within(f, path)))));
    } catch (err) {
      errors.push((err as Error).message);
      LogService.error((err as Error).message, { arr: arr.name });
    }
  }
  return { series: found.sort((a, b) => compare(a.sortTitle, b.sortTitle)), orphans: left, errors };
}

/**
 * One series with every episode file, for its own page. Nothing is returned if the Sonarr no longer has it.
 */
export async function show(arr: Arr, id: number): Promise<(Show & { entries: EpisodeFile[] }) | undefined> {
  const series = (await shows(arr)).find((s) => s.id === id);
  return series && { ...series, entries: await episodes(arr, series) };
}
