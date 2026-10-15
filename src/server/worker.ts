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
import * as LogService from "./services/log.ts";
import * as PathsService from "./services/paths.ts";
import * as PinsService from "./services/pins.ts";
import * as SettingsService from "./services/settings.ts";
import * as TempsService from "./services/temps.ts";

/**
 * What the worker is doing right now: which title (and season, and file, when it's one file of a series), and whether
 * it's copying, putting a link back, or deleting a copy so the Arr can download the title again.
 */
export interface Activity {
  action: "copying" | "restoring" | "regrabbing";
  arr: number;
  media: number;
  season: number | null;
  path: string | null;
  title: string;
}

/**
 * The title a step works on: its id in the Arr, the season (for a series), and a name for the activity and the logs.
 */
interface Target {
  media: number;
  season: number | null;
  title: string;
}

// Run one step, recording its problem rather than stopping the whole pass
type Attempt = (fields: object, step: () => Promise<void>) => Promise<void>;

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
 * Goes through every Arr and brings its files in line with the pins. Returns the problems it hit.
 */
async function pass(): Promise<string[]> {
  const problems: string[] = [];
  const { reserve_gb, unpin } = SettingsService.options();
  const attempt: Attempt = async (fields, step) => {
    try {
      await step();
    } catch (err) {
      problems.push((err as Error).message);
      LogService.error((err as Error).message, fields);
    }
  };

  // Delete temporary files left by a step that was interrupted, such as by a crash or power cut
  for (const temp of TempsService.list()) {
    await attempt({ path: temp }, async () => {
      const removed = await FilesService.clear(temp);
      TempsService.remove(temp);
      LogService.info(
        removed
          ? "removed a temporary file left by an interrupted step"
          : "ignored a record that isn't a temporary file",
        { path: temp },
      );
    });
  }

  // Each Arr in turn. A problem with one is recorded and the rest carry on
  for (const arr of SettingsService.arrs()) {
    const flow = arr.type === "radarr" ? movies : shows;
    await attempt({ arr: arr.name }, () => flow(arr, reserve_gb * 1024 ** 3, unpin === "restore", attempt));
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
 * Brings one Radarr's files in line with its pins: copies pinned movies that are still streamed, and undoes copies of
 * movies that are no longer pinned.
 */
async function movies(arr: Arr, reserve: number, restore: boolean, attempt: Attempt): Promise<void> {
  // Safety: never act on a dead mount. Every library folder the Arr uses must be there before anything changes
  await PathsService.verify((await ArrService.roots(arr)).map((root) => PathsService.map(arr, root)));
  const movies = await LibraryService.entries(arr);

  // Tidy up first, then read the pins and copies as they now stand
  await tidy(arr, movies, (copy) => movies.find((m) => m.path === copy.path)?.id);
  const pins = PinsService.list(arr.id);
  const copies = CopiesService.list(arr.id);

  // Whether the mount looks up: some link in this library can be followed, or some copy's original link target still
  // can be, which proves the mount is there even when everything examined is local
  const mounted = movies.some((m) => m.state === "streamed" || m.restorable);

  for (const movie of movies) {
    const target = { media: movie.id, season: null, title: movie.title };
    const fields = { arr: arr.name, title: movie.title, path: movie.path };
    const owned = copies.filter((c) => c.media === movie.id && c.path === movie.path);

    // Copy a pinned movie that's still streamed, then have Radarr look at its file again
    if (pins.has(movie.id) && movie.state === "streamed") {
      await attempt(fields, async () => {
        await copy(arr, target, movie.path!, reserve);
        await ArrService.rescan(arr, movie.id);
      });
    }
    // Undo the copy of a movie that's no longer pinned
    else if (!pins.has(movie.id) && owned.length) {
      await attempt(fields, () => release(arr, target, owned, restore, mounted));
    }

    // Forget copies of files Radarr no longer has for this movie (deleted, or replaced by an upgrade) once they're gone
    for (const copy of copies.filter((c) => c.media === movie.id && c.path !== movie.path)) {
      if ((await FilesService.check(copy)) !== "copy") CopiesService.remove(copy.path);
    }
  }
}

/**
 * Brings one Sonarr's files in line with its pins: copies the streamed episodes of pinned series and seasons, and
 * undoes copies of seasons that are no longer pinned. A series pin is live, so episodes that arrive later are copied
 * too.
 */
async function shows(arr: Arr, reserve: number, restore: boolean, attempt: Attempt): Promise<void> {
  // Safety: never act on a dead mount. Every library folder the Arr uses must be there before anything changes
  await PathsService.verify((await ArrService.roots(arr)).map((root) => PathsService.map(arr, root)));
  const series = await ArrService.series(arr);

  // Tidy up first, matching a removed series' copies to a series added back by its folder, then read pins and copies
  const folders = series.map((s) => ({ id: s.id, folder: PathsService.map(arr, s.path) }));
  await tidy(arr, series, (copy) => folders.find((f) => PathsService.within(f.folder, copy.path))?.id);
  const pinned = PinsService.list(arr.id);
  const seasons = PinsService.seasons(arr.id);
  const copies = CopiesService.list(arr.id);

  // Only look at the files of series with something to do: pinned, or holding copies
  const busy = series.filter((s) => pinned.has(s.id) || seasons.has(s.id) || copies.some((c) => c.media === s.id));
  const files = new Map(
    await Promise.all(busy.map(async (s) => [s.id, await LibraryService.episodes(arr, s)] as const)),
  );

  // Whether the mount looks up: some link among those files can be followed, or some copy's original link target still
  // can be, which proves the mount is there even when every file examined is local
  const mounted = [...files.values()].flat().some((e) => e.state === "streamed" || e.restorable);

  for (const show of busy) {
    const wanted = (season: number) => pinned.has(show.id) || !!seasons.get(show.id)?.has(season);
    const episodes = files.get(show.id)!;

    // Copy each wanted episode that's still streamed, then have Sonarr look at the series' files once
    let copied = false;
    for (const episode of episodes.filter((e) => wanted(e.season) && e.state === "streamed")) {
      const target = { media: show.id, season: episode.season, title: episode.name.replace(/\.[^.]+$/, "") };
      await attempt({ arr: arr.name, title: target.title, path: episode.path }, async () => {
        await copy(arr, target, episode.path, reserve);
        copied = true;
      });
    }
    if (copied) await attempt({ arr: arr.name, title: show.title }, () => ArrService.rescan(arr, show.id));

    // Undo copies of seasons that are no longer pinned, one season at a time, so a re-grab only searches that season
    const paths = new Set(episodes.map((e) => e.path));
    const owned = copies.filter((c) => c.media === show.id && paths.has(c.path) && !wanted(c.season ?? -1));
    for (const season of new Set(owned.map((c) => c.season ?? -1))) {
      const target = { media: show.id, season, title: `${show.title} · ${season ? `Season ${season}` : "Specials"}` };
      const group = owned.filter((c) => (c.season ?? -1) === season);
      await attempt({ arr: arr.name, title: target.title }, () => release(arr, target, group, restore, mounted));
    }

    // Forget copies of episode files Sonarr no longer has (deleted, or replaced by an upgrade) once they're gone
    for (const copy of copies.filter((c) => c.media === show.id && !paths.has(c.path))) {
      if ((await FilesService.check(copy)) !== "copy") CopiesService.remove(copy.path);
    }
  }
}

/**
 * Tidies up after titles an Arr no longer lists. A title removed and added back gets a new id, so its copies and pins
 * follow it there (`readded` finds it from a copy's path). Copies whose files are already gone are forgotten, and so
 * are pins for gone titles with no copy left waiting for the user to keep or delete.
 */
async function tidy(arr: Arr, titles: { id: number }[], readded: (copy: Copy) => number | undefined): Promise<void> {
  // Safety: never act because data is missing. An empty list from the Arr is no proof anything's gone
  if (!titles.length) return;
  const listed = new Set(titles.map((t) => t.id));

  // Move each copy of a gone title to the title added back in its place, or forget it if its file has gone too
  for (const copy of CopiesService.list(arr.id).filter((c) => !listed.has(c.media))) {
    const id = readded(copy);
    if (id !== undefined) {
      CopiesService.add({ ...copy, media: id });
      PinsService.move(arr.id, copy.media, id);
    } else if ((await FilesService.check(copy)) !== "copy") CopiesService.remove(copy.path);
  }

  // Forget pins for gone titles, unless one of their copies is still waiting for the user
  const waiting = new Set(CopiesService.list(arr.id).map((c) => c.media));
  for (const media of new Set([...PinsService.list(arr.id), ...PinsService.seasons(arr.id).keys()])) {
    if (!listed.has(media) && !waiting.has(media)) PinsService.forget(arr.id, media);
  }
}

/**
 * Turns one streamed link into a local copy, and records the copy straight away: from then on, that record is the only
 * thing that lets Tetharr delete the file. The caller lets the Arr know.
 */
async function copy(arr: Arr, target: Target, path: string, reserve: number): Promise<void> {
  current = { action: "copying", arr: arr.id, ...target, path };
  LogService.info("copying", { arr: arr.name, title: target.title, path });
  const { size, target: link } = await writing(FilesService.partial(path), () => FilesService.copy(path, reserve));
  CopiesService.add({ path, arr: arr.id, media: target.media, season: target.season, target: link, size });
  LogService.info("copied", { arr: arr.name, title: target.title, path, size });
}

/**
 * Undoes Tetharr's copies of a title (or one season of a series) that's no longer pinned. Each copy's link is put back
 * if its streamed file can still be reached. Otherwise the copy is deleted and the Arr downloads it again, searching
 * just that season for a series.
 */
async function release(arr: Arr, target: Target, copies: Copy[], restore: boolean, mounted: boolean): Promise<void> {
  current = { action: "restoring", arr: arr.id, ...target, path: null };
  const restored: Copy[] = [];
  const removed: Copy[] = [];
  const forget: Copy[] = [];

  for (const copy of copies) {
    const check = await FilesService.check(copy);

    // Safety: never delete a file Tetharr didn't create. A copy that's a link again, or replaced by another file, is no
    // longer Tetharr's to touch, so it's left alone and simply forgotten
    if (check === "link" || check === "replaced") forget.push(copy);
    // Deleted on an earlier pass whose re-grab request failed, so ask again
    else if (check === "missing") removed.push(copy);
    // Put the link back, if its streamed file can still be reached
    else if (restore && (await FilesService.restorable(copy))) {
      current = { ...current, path: copy.path };
      await writing(FilesService.link(copy.path), () => FilesService.restore(copy));
      restored.push(copy);
      LogService.info("restored", { arr: arr.name, title: target.title, path: copy.path });
    } else {
      // Safety: never act on a dead mount. Only delete and re-grab when the mount is known to be up
      if (restore && !mounted) {
        throw new Error(`Can't unpin ${target.title} yet: its streamed file is unreachable and the mount looks down`);
      }
      current = { ...current, action: "regrabbing", path: copy.path };
      await FilesService.remove(copy);
      removed.push(copy);
      LogService.info("removed; missing until the Arr downloads it again", {
        arr: arr.name,
        title: target.title,
        path: copy.path,
      });
    }
  }

  // Tell the Arr: download it again if a copy was deleted, otherwise just look at the files again
  if (removed.length) await ArrService.regrab(arr, target.media, target.season ?? undefined);
  else if (restored.length) await ArrService.rescan(arr, target.media);

  // Forget the copies only once the Arr has been told, so a failed request is tried again on the next pass
  for (const copy of [...restored, ...removed, ...forget]) CopiesService.remove(copy.path);
}

/**
 * Runs a step that writes a temporary file, recording the file first. If the step is interrupted (a crash or power cut)
 * the record survives, and the next pass deletes the file.
 */
async function writing<T>(temp: string, step: () => Promise<T>): Promise<T> {
  TempsService.add(temp);
  try {
    return await step();
  } finally {
    TempsService.remove(temp);
  }
}
