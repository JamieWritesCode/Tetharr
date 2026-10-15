/**
 * The worker: it makes the files match what the user has pinned. Pinned titles that are still streamed get copied, and
 * Tetharr's copies of titles that are no longer pinned get undone. Every step is safe to repeat, so anything that fails
 * or is interrupted is simply tried again on the next pass. It handles one file at a time.
 */

import type { Arr } from "../schemas/arr.ts";
import * as ArrService from "./services/arr.ts";
import * as CopiesService from "./services/copies.ts";
import type { Copy } from "./services/copies.ts";
import * as FilesService from "./services/files.ts";
import * as LibraryService from "./services/library.ts";
import type { Entry } from "./services/library.ts";
import * as LogService from "./services/log.ts";
import * as PathsService from "./services/paths.ts";
import * as PinsService from "./services/pins.ts";
import * as SettingsService from "./services/settings.ts";

/**
 * What the worker is doing right now: which title, and whether it's copying, putting a link back, or deleting a copy so
 * the Arr can download the title again.
 */
export interface Activity {
  action: "copying" | "restoring" | "regrabbing";
  arr: number;
  media: number;
  title: string;
}

// How long the worker waits between passes when nothing asks it to run sooner
const INTERVAL = 5 * 60_000;

// How soon it tries again after a pass that hit problems, doubling each time up to the usual wait. The most common
// problem is an Arr that's still starting up, such as after a reboot, when Tetharr usually starts first
const RETRY = 30_000;
let delay = RETRY;

let current: Activity | undefined;
let errors: string[] = [];
let last: string | undefined;
let next: string | undefined;
let running = false;
let again = false;
let timer: NodeJS.Timeout | undefined;

/**
 * What the worker is doing now, the problems it hit on its last pass, when that pass finished, and when the next one is
 * due.
 */
export const status = () => ({ current, errors, last, next });

/**
 * Starts a pass straight away, for when the user has just pinned or unpinned something. If a pass is already running,
 * another follows as soon as it ends.
 */
export function kick(): void {
  if (running) again = true;
  else void run();
}

/**
 * Runs one pass, then schedules the next.
 */
async function run(): Promise<void> {
  running = true;
  clearTimeout(timer);
  try {
    errors = await pass();
    last = new Date().toISOString();
  } finally {
    running = false;
    current = undefined;

    // Schedule the next pass: sooner after problems, backing off while they last, otherwise at the usual interval
    const wait = errors.length ? delay : INTERVAL;
    timer = setTimeout(kick, wait);
    next = new Date(Date.now() + wait).toISOString();
    delay = errors.length ? Math.min(delay * 2, INTERVAL) : RETRY;
    if (again) {
      again = false;
      kick();
    }
  }
}

/**
 * Goes through every Radarr and brings its files in line with the pins. Returns the problems it hit.
 */
async function pass(): Promise<string[]> {
  const problems: string[] = [];
  const { reserve_gb, unpin } = SettingsService.options();

  // Run one step, recording its problem rather than stopping the whole pass
  const attempt = async (fields: object, step: () => Promise<void>) => {
    try {
      await step();
    } catch (err) {
      problems.push((err as Error).message);
      LogService.error((err as Error).message, fields);
    }
  };

  for (const arr of SettingsService.arrs().filter((a) => a.type === "radarr")) {
    await attempt({ arr: arr.name }, async () => {
      // Safety: never act on a dead mount. Every library folder the Arr uses must be there before anything changes
      await PathsService.verify((await ArrService.roots(arr)).map((root) => PathsService.map(arr, root)));
      const movies = await LibraryService.entries(arr);
      const copies = CopiesService.list(arr.id);

      // Whether the mount looks up: at least one streamed link in this library can be followed
      const mounted = movies.some((m) => m.state === "streamed");

      // Tidy up after movies Radarr no longer lists. Safety: an empty list from Radarr is no proof anything's gone
      if (movies.length) {
        const listed = new Set(movies.map((m) => m.id));
        const pins = PinsService.list(arr.id);
        for (const copy of copies.filter((c) => !listed.has(c.media))) {
          // A movie removed and added again gets a new id but keeps its path, so its copy and pin follow it
          const readded = movies.find((m) => m.path === copy.path);
          if (readded) {
            CopiesService.add({ ...copy, media: readded.id });
            if (pins.has(copy.media)) {
              PinsService.remove(arr.id, copy.media);
              PinsService.add(arr.id, readded.id);
            }
          }
          // Forget copies whose files are already gone. Copies still on disk wait for the user to keep or delete them
          else if ((await FilesService.check(copy)) !== "copy") CopiesService.remove(copy.path);
        }

        // Forget pins for movies that are gone, unless their copy is still waiting for the user
        const waiting = new Set(CopiesService.list(arr.id).map((c) => c.media));
        for (const media of PinsService.list(arr.id)) {
          if (!listed.has(media) && !waiting.has(media)) PinsService.remove(arr.id, media);
        }
      }

      // Copy what's pinned and still streamed, and undo Tetharr's copies of anything no longer pinned
      for (const movie of movies) {
        const owned = copies.filter((c) => c.media === movie.id);
        const fields = { arr: arr.name, title: movie.title, path: movie.path };
        if (movie.pinned && movie.state === "streamed") {
          await attempt(fields, () => copy(arr, movie, reserve_gb * 1024 ** 3));
        } else if (!movie.pinned && owned.length) {
          await attempt(fields, () => release(arr, movie, owned, unpin === "restore", mounted));
        }
      }
    });
  }

  // Finish removing connections whose copies have all been undone
  for (const arr of SettingsService.arrs().filter((a) => a.removing && !CopiesService.list(a.id).length)) {
    PinsService.clear(arr.id);
    SettingsService.remove(arr.id);
    LogService.info("connection removed", { arr: arr.name });
  }
  return problems;
}

/**
 * Turns a pinned movie's streamed link into a local copy, records the copy, and lets Radarr know.
 */
async function copy(arr: Arr, movie: Entry, reserve: number): Promise<void> {
  current = { action: "copying", arr: arr.id, media: movie.id, title: movie.title };
  LogService.info("copying", { arr: arr.name, title: movie.title, path: movie.path });
  const { size, target } = await FilesService.copy(movie.path!, reserve);

  // Record the copy straight away: from now on, this record is the only thing that lets Tetharr delete the file
  CopiesService.add({ path: movie.path!, arr: arr.id, media: movie.id, target, size });
  LogService.info("copied", { arr: arr.name, title: movie.title, path: movie.path, size });

  // Have Radarr look at the file again, so its records show a real file
  await ArrService.rescan(arr, movie.id);
}

/**
 * Undoes Tetharr's copies of a movie that's no longer pinned. Each copy's link is put back if its streamed file can
 * still be reached. Otherwise the copy is deleted and Radarr downloads the movie again.
 */
async function release(arr: Arr, movie: Entry, copies: Copy[], restore: boolean, mounted: boolean): Promise<void> {
  current = { action: "restoring", arr: arr.id, media: movie.id, title: movie.title };
  const restored: Copy[] = [];
  const removed: Copy[] = [];
  const forget: Copy[] = [];

  for (const copy of copies) {
    const check = await FilesService.check(copy);

    // Already a link again, or replaced by some other file: either way it's no longer Tetharr's to touch Safety: never
    // delete a file Tetharr didn't create. A replaced file is left alone and simply forgotten
    if (check === "link" || check === "replaced") forget.push(copy);
    // Deleted on an earlier pass whose re-grab request failed, so ask again
    else if (check === "missing") removed.push(copy);
    // Put the link back, if its streamed file can still be reached
    else if (restore && (await FilesService.restorable(copy))) {
      await FilesService.restore(copy);
      restored.push(copy);
      LogService.info("restored", { arr: arr.name, title: movie.title, path: copy.path });
    } else {
      // Safety: never act on a dead mount. Only delete and re-grab when other streamed links in the library still work
      if (restore && !mounted)
        throw new Error(`Can't unpin ${movie.title} yet: its streamed file is unreachable and the mount looks down`);
      current = { ...current, action: "regrabbing" };
      await FilesService.remove(copy);
      removed.push(copy);
      LogService.info("removed; missing until Radarr downloads it again", {
        arr: arr.name,
        title: movie.title,
        path: copy.path,
      });
    }
  }

  // Tell Radarr: download it again if a copy was deleted, otherwise just look at the files again
  if (removed.length) await ArrService.regrab(arr, movie.id);
  else if (restored.length) await ArrService.rescan(arr, movie.id);

  // Forget the copies only once Radarr has been told, so a failed request is tried again on the next pass
  for (const copy of [...restored, ...removed, ...forget]) CopiesService.remove(copy.path);
}
