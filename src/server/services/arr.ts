/**
 * Talks to Radarr and Sonarr through their v3 API. This is the only file that knows what their answers look like.
 * Everything else uses the simpler shapes defined here.
 */

import { setTimeout as sleep } from "node:timers/promises";
import type { Input } from "../../schemas/arr.ts";

/**
 * A movie as Tetharr cares about it. `file` is the path exactly as Radarr reports it, which may need translating before
 * Tetharr can find it. `sortTitle` is the title Radarr sorts by, without a leading "The".
 */
export interface Movie {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  poster: string | undefined;
  size: number;
  file: string | undefined;
}

/**
 * A series as Tetharr cares about it, with each season's file count, episode count and size. `path` is the series'
 * folder exactly as Sonarr reports it. `sortTitle` is the title Sonarr sorts by, without a leading "The".
 */
export interface Series {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  poster: string | undefined;
  overview: string;
  path: string;
  size: number;
  files: number;
  seasons: { number: number; files: number; episodes: number; size: number }[];
}

/**
 * One episode file in a series. `file` is its path exactly as Sonarr reports it.
 */
export interface Episode {
  id: number;
  season: number;
  file: string;
  size: number;
}

interface Status {
  appName: string;
  version: string;
}

interface Item {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  sizeOnDisk: number;
  images: { coverType: string; remoteUrl?: string }[];
  movieFile?: { path: string };
}

interface Show {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  overview?: string;
  path: string;
  images: { coverType: string; remoteUrl?: string }[];
  statistics: { episodeFileCount: number; sizeOnDisk: number };
  seasons: {
    seasonNumber: number;
    statistics?: { episodeFileCount: number; totalEpisodeCount: number; sizeOnDisk: number };
  }[];
}

// The commands Tetharr sends each kind of Arr: rescan a title's files from disk, or search for it to download again
const COMMANDS = {
  radarr: {
    rescan: (id: number) => ({ name: "RescanMovie", movieId: id }),
    search: (id: number) => ({ name: "MoviesSearch", movieIds: [id] }),
  },
  sonarr: {
    rescan: (id: number) => ({ name: "RescanSeries", seriesId: id }),
    search: (id: number, season?: number) =>
      season === undefined
        ? { name: "SeriesSearch", seriesId: id }
        : { name: "SeasonSearch", seriesId: id, seasonNumber: season },
  },
};

/**
 * Asks an Arr one question (or, with a body, gives it one instruction) and returns its answer. Anything that goes wrong
 * becomes an error naming the Arr and saying what happened, because these messages are shown to the user.
 */
async function request<T>(arr: Input, endpoint: string, body?: object): Promise<T> {
  // Send the request, giving up after 30 seconds
  const res = await fetch(`${arr.url.replace(/\/+$/, "")}/api/v3/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { "X-Api-Key": arr.api_key, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch((err: Error) => {
    throw new Error(
      `${arr.name}: could not reach ${arr.url} (${(err.cause as Error | undefined)?.message ?? err.message})`,
    );
  });

  // A wrong API key is the most common setup mistake, so say so plainly
  if (res.status === 401) throw new Error(`${arr.name}: the API key was rejected`);
  if (!res.ok) throw new Error(`${arr.name}: ${endpoint} returned HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Checks that Tetharr can reach the Arr with this key, and that it really is the kind of Arr it was saved as. Returns
 * its version. Catching a Sonarr saved as a Radarr here avoids confusing errors later.
 */
export async function status(arr: Input): Promise<string> {
  const { appName, version } = await request<Status>(arr, "system/status");
  if (appName.toLowerCase() !== arr.type) throw new Error(`${arr.name}: this is ${appName}, not ${arr.type}`);
  return version;
}

/**
 * Every movie in a Radarr, whether or not it has a file yet.
 */
export async function movies(arr: Input): Promise<Movie[]> {
  return (await request<Item[]>(arr, "movie")).map(({ id, title, sortTitle, year, sizeOnDisk, images, movieFile }) => ({
    id,
    title,
    sortTitle,
    year,
    // Ask TMDB for a card-sized poster rather than the full-resolution original
    poster: images.find((i) => i.coverType === "poster")?.remoteUrl?.replace("/t/p/original/", "/t/p/w342/"),
    size: sizeOnDisk,
    file: movieFile?.path,
  }));
}

/**
 * The library folders an Arr keeps its titles in, as the Arr sees them.
 */
export const roots = async (arr: Input) => (await request<{ path: string }[]>(arr, "rootfolder")).map((r) => r.path);

/**
 * Sends an Arr a command and waits for it to finish, for up to ten minutes. Waiting matters: a search only grabs a
 * title again once the rescan before it has noticed the file is gone.
 */
async function command(arr: Input, kind: "rescan" | "search", id: number, season?: number): Promise<void> {
  // Send the command, then check on it every second until the Arr says it's done
  let { id: sent, status } = await request<{ id: number; status: string }>(
    arr,
    "command",
    COMMANDS[arr.type][kind](id, season),
  );
  for (let i = 0; status === "queued" || status === "started"; i++) {
    if (i === 600) throw new Error(`${arr.name}: the ${kind} didn't finish within ten minutes`);
    await sleep(1000);
    ({ status } = await request<{ status: string }>(arr, `command/${sent}`));
  }
  if (status !== "completed") throw new Error(`${arr.name}: the ${kind} ended as ${status}`);
}

/**
 * Has an Arr look at a title's files again, so its records match what's on disk.
 */
export const rescan = (arr: Input, id: number) => command(arr, "rescan", id);

/**
 * Has an Arr download a title again: first a rescan so it notices the file is gone, then a search. Given a season,
 * Sonarr searches for just that season rather than the whole series.
 */
export async function regrab(arr: Input, id: number, season?: number): Promise<void> {
  await command(arr, "rescan", id);
  await command(arr, "search", id, season);
}

/**
 * Every series in a Sonarr, with its seasons.
 */
export async function series(arr: Input): Promise<Series[]> {
  return (await request<Show[]>(arr, "series")).map(
    ({ id, title, sortTitle, year, overview, path, images, statistics, seasons }) => ({
      id,
      title,
      sortTitle,
      year,
      // Ask TheTVDB for the poster at its normal size; Sonarr's own copy would need the API key
      poster: images.find((i) => i.coverType === "poster")?.remoteUrl,
      overview: overview ?? "",
      path,
      size: statistics.sizeOnDisk,
      files: statistics.episodeFileCount,
      seasons: seasons.map(({ seasonNumber, statistics: s }) => ({
        number: seasonNumber,
        files: s?.episodeFileCount ?? 0,
        episodes: s?.totalEpisodeCount ?? 0,
        size: s?.sizeOnDisk ?? 0,
      })),
    }),
  );
}

/**
 * Every episode file Sonarr has for one series.
 */
export async function episodes(arr: Input, id: number): Promise<Episode[]> {
  return (
    await request<{ id: number; seasonNumber: number; path: string; size: number }[]>(arr, `episodefile?seriesId=${id}`)
  ).map(({ id, seasonNumber, path, size }) => ({ id, season: seasonNumber, file: path, size }));
}
