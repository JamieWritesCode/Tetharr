/**
 * Checks that a connection can do its job: that the Arr answers and is the right kind, that Tetharr can see every
 * library folder the Arr uses, and that links in the library can be followed. Testing a connection in Settings runs
 * them, so the two most common setup mistakes (a missing path mapping, and the usenet mount at a different path inside
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

// How many of the Arr's files to look at, at most, when looking for a link to follow
const SAMPLE = 25;

/**
 * Runs every check against a connection. If the Arr can't be reached at all, that error is thrown, since nothing else
 * can be checked; any other problem becomes a failed check in the list.
 */
export async function run(arr: Input): Promise<Check[]> {
  const version = await ArrService.status(arr);
  const checks: Check[] = [{ label: `Connected to ${arr.name}`, ok: true, detail: `Version ${version}` }];

  // Check the library folders, then a link. A problem asking the Arr for either is reported as that check failing
  const fail = (label: string) => (err: Error) => [{ label, ok: false, detail: err.message }];
  checks.push(...(await folders(arr).catch(fail("Library folders"))));
  checks.push(...(await links(arr).catch(fail("Links"))));
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
 * can't be followed usually means the usenet mount sits at a different path in Tetharr than in the Arr.
 */
async function links(arr: Input): Promise<Check[]> {
  const files = (await sample(arr)).map((file) => PathsService.map(arr, file));
  if (!files.length) return [{ label: "Links", ok: null, detail: `${arr.name} has no files to check yet` }];

  // Look for the first file that's a link, counting how many files Tetharr can see at all
  let seen = 0;
  for (const file of files) {
    const entry = await lstat(file).catch(() => undefined);
    if (entry) seen++;
    if (!entry?.isSymbolicLink()) continue;
    if (await stat(file).catch(() => undefined)) return [{ label: "Links", ok: true, detail: "Links can be followed" }];
    const target = path.resolve(path.dirname(file), await readlink(file));
    const fix = `${target} doesn't exist inside Tetharr. Mount your usenet store at the same path in Tetharr as in ${arr.name}.`;
    return [{ label: "Links", ok: false, detail: fix }];
  }

  // No link found: either Tetharr can't see the files at all, or they're all real files
  const detail = seen
    ? "None of the files checked are links, so there was nothing to follow"
    : "Tetharr can't see any of these files, so links couldn't be checked. Fix the library folders first.";
  return [{ label: "Links", ok: null, detail }];
}

/**
 * Up to a couple of dozen file paths from the Arr, as it reports them. For Sonarr this means asking for the episode
 * files of a few series, one series at a time, so it stays quick on a big library.
 */
async function sample(arr: Input): Promise<string[]> {
  if (arr.type === "radarr") {
    return (await ArrService.movies(arr)).flatMap((m) => (m.file ? [m.file] : [])).slice(0, SAMPLE);
  }
  const files: string[] = [];
  for (const series of (await ArrService.series(arr)).filter((s) => s.files).slice(0, 5)) {
    files.push(...(await ArrService.episodes(arr, series.id)).map((e) => e.file));
    if (files.length >= SAMPLE) break;
  }
  return files.slice(0, SAMPLE);
}
