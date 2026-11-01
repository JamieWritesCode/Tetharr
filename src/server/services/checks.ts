/**
 * Checks that a connection can do its job: that the Arr answers and is the right kind, that Tetharr can see every
 * library folder the Arr uses, and that links in the library can be followed. Testing a connection in Settings runs
 * them, so the two most common setup mistakes (a missing path mapping, and the mount at a different path inside
 * Tetharr) show up straight away, with what to change.
 */

import { lstat, readlink, stat } from "node:fs/promises";
import path from "node:path";
import type { Input } from "../../schemas/arr.ts";
import * as ArrService from "./arr.ts";
import * as PathsService from "./paths.ts";

/**
 * One check's result: passed, failed, or couldn't be checked (`ok` is null), with what was found and, for a failure,
 * what to change.
 */
export interface Check {
  label: string;
  ok: boolean | null;
  detail: string;
}

// When looking for a link to follow, stop after this many files Tetharr can see, or this many series asked about
const SAMPLE = 25;
const SERIES = 25;

/**
 * Runs every check against a connection. If the Arr can't be reached at all, that error is thrown, since nothing else
 * can be checked; any other problem becomes a failed check in the list.
 */
export async function run(arr: Input): Promise<Check[]> {
  const version = await ArrService.status(arr);
  const checks: Check[] = [{ label: `Connected to ${arr.name}`, ok: true, detail: `Version ${version}` }];

  // Check the library folders, then a link. A problem asking the Arr for either is reported as that check failing
  const fail = (label: string) => (err: Error) => [{ label, ok: false, detail: err.message }];
  const roots = await folders(arr).catch(fail("Library folders"));
  const found = roots.every((c) => c.ok !== false);
  checks.push(...roots, ...(await links(arr, found).catch(fail("Links"))));
  return checks;
}

/**
 * Checks that each library folder the Arr reports exists inside Tetharr, once the path mappings are applied.
 */
async function folders(arr: Input): Promise<Check[]> {
  const roots = await ArrService.roots(arr);
  if (!roots.length) return [{ label: "Library folders", ok: null, detail: `${arr.name} has no library folders yet` }];

  return Promise.all(
    roots.map(async (root) => {
      const mapped = PathsService.map(arr, root);
      const found = !!(await stat(mapped).catch(() => undefined))?.isDirectory();
      const seen = mapped === root ? "Found" : `Found as ${mapped}`;
      const fix =
        mapped === root
          ? `Tetharr can't see ${root}. Mount it at the same path, or add a path mapping from ${root} to where Tetharr sees it.`
          : `Tetharr can't see ${mapped}. Check the path mapping for ${root}, and that the folder is mounted.`;
      return { label: `Library folder ${root}`, ok: found, detail: found ? seen : fix };
    }),
  );
}

/**
 * Finds one link among the Arr's files and checks that its target can be followed from inside Tetharr. A link that
 * can't be followed usually means the mount sits at a different path in Tetharr than in the Arr. `found` says whether
 * every library folder was found, so a file Tetharr can't see is only blamed on the folders when that check failed.
 */
async function links(arr: Input, found: boolean): Promise<Check[]> {
  // Look for the first file that's a link, counting the files checked and how many of them Tetharr can see
  let checked = 0;
  let seen = 0;
  for await (const file of files(arr)) {
    const mapped = PathsService.map(arr, file);
    const entry = await lstat(mapped).catch(() => undefined);
    checked++;
    if (entry) seen++;
    if (entry?.isSymbolicLink()) {
      const ok = !!(await stat(mapped).catch(() => undefined));
      if (ok) return [{ label: "Links", ok, detail: "Links can be followed" }];
      const target = path.resolve(path.dirname(mapped), await readlink(mapped));
      const fix = `${target} doesn't exist inside Tetharr. Mount your usenet or debrid store at the same path in Tetharr as in ${arr.name}.`;
      return [{ label: "Links", ok: false, detail: fix }];
    }
    if (seen >= SAMPLE) break;
  }

  // No link found: there are no files yet, they're all real files, or Tetharr can't see them where it looks
  const detail = !checked
    ? `${arr.name} has no files to check yet`
    : seen
      ? "None of the files checked are links, so there was nothing to follow"
      : found
        ? `None of the ${checked} files checked are where Tetharr looks for them, so there was no link to follow. Check the path mappings, unless those files live elsewhere (such as another mergerfs branch).`
        : "Tetharr can't see any of these files, so links couldn't be checked. Fix the library folders first.";
  return [{ label: "Links", ok: null, detail }];
}

/**
 * The Arr's file paths, as it reports them, fetched only as they're needed. For Sonarr this means asking for the
 * episode files of one series at a time, so the check stops asking as soon as it has found a link.
 */
async function* files(arr: Input): AsyncGenerator<string> {
  if (arr.type === "radarr") {
    for (const movie of await ArrService.movies(arr)) if (movie.file) yield movie.file;
    return;
  }
  for (const series of (await ArrService.series(arr)).filter((s) => s.files).slice(0, SERIES)) {
    for (const episode of await ArrService.episodes(arr, series.id)) yield episode.file;
  }
}
