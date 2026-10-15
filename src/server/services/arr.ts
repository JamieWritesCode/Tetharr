/**
 * Talks to Radarr and Sonarr through their v3 API. This is the only file that knows what their answers look like.
 * Everything else uses the simpler shapes defined here.
 */

import { setTimeout as sleep } from "node:timers/promises";
import type { Input } from "../../schemas/arr.ts";

/**
 * A movie as Tetharr cares about it. `file` is the path exactly as Radarr reports it, which may need translating before
 * Tetharr can find it.
 */
export interface Movie {
  id: number;
  title: string;
  year: number;
  poster: string | undefined;
  size: number;
  file: string | undefined;
}

interface Status {
  appName: string;
  version: string;
}

interface Item {
  id: number;
  title: string;
  year: number;
  sizeOnDisk: number;
  images: { coverType: string; remoteUrl?: string }[];
  movieFile?: { path: string };
}

// The commands Tetharr sends each kind of Arr: rescan a title's files from disk, or search for it to download again
const COMMANDS = {
  radarr: {
    rescan: (id: number) => ({ name: "RescanMovie", movieId: id }),
    search: (id: number) => ({ name: "MoviesSearch", movieIds: [id] }),
  },
  sonarr: {
    rescan: (id: number) => ({ name: "RescanSeries", seriesId: id }),
    search: (id: number) => ({ name: "SeriesSearch", seriesId: id }),
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
  return (await request<Item[]>(arr, "movie")).map(({ id, title, year, sizeOnDisk, images, movieFile }) => ({
    id,
    title,
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
async function command(arr: Input, kind: "rescan" | "search", id: number): Promise<void> {
  // Send the command, then check on it every second until the Arr says it's done
  let { id: sent, status } = await request<{ id: number; status: string }>(
    arr,
    "command",
    COMMANDS[arr.type][kind](id),
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
 * Has an Arr download a title again: first a rescan so it notices the file is gone, then a search.
 */
export async function regrab(arr: Input, id: number): Promise<void> {
  await command(arr, "rescan", id);
  await command(arr, "search", id);
}
