/**
 * Everything Tetharr does to media files: looking at what's at a library path, swapping a streamed link for a local
 * copy, and undoing that copy again. The path the media server sees never goes missing or holds a half-written file.
 */

import { rmSync } from "node:fs";
import { copyFile, lstat, readlink, rename, rm, stat, statfs, symlink } from "node:fs/promises";
import path from "node:path";
import type { Copy } from "./copies.ts";

/**
 * What is at a library path right now: streamed (a symlink that can be followed to its usenet copy), local (a real file
 * on disk), broken (a symlink that can't be followed, often because the mount is down), or unseen (nothing there,
 * usually a path mapping that needs fixing).
 */
export type State = "streamed" | "local" | "broken" | "unseen";

/**
 * Where a recorded copy stands now: still the copy Tetharr made, back to a link, gone, or replaced by some other file.
 */
export type Check = "copy" | "link" | "missing" | "replaced";

// The copy being written right now, so its progress can be shown and a shutdown can clean it up
let active: { partial: string; size: number } | undefined;

/**
 * Works out the state of one library path.
 */
export async function state(file: string): Promise<State> {
  // Look at the path itself, without following a symlink
  const entry = await lstat(file).catch(() => undefined);
  if (!entry) return "unseen";
  if (!entry.isSymbolicLink()) return "local";

  // Safety: never act on a dead mount. A link that can't be followed is reported as broken, never as gone
  return (await stat(file).catch(() => undefined)) ? "streamed" : "broken";
}

/**
 * Replaces a streamed link with a real copy of the file it points to, at the same path. Returns the copy's size and
 * where the link pointed, so it can be put back later. If anything goes wrong, the link is left exactly as it was.
 */
export async function copy(link: string, reserve: number): Promise<{ size: number; target: string }> {
  // Remember where the link points, so unpinning can put it back exactly as it was
  const target = await readlink(link);

  // Safety: never act on a dead mount. Following the link proves the streamed file is reachable
  const { size } = await stat(link).catch(() => {
    throw new Error(`${link} can't be followed. Is the mount down?`);
  });

  // Make sure the copy fits and still leaves the reserved free space
  const dir = path.dirname(link);
  const { bavail, bsize } = await statfs(dir);
  if (bavail * bsize < size + reserve)
    throw new Error(`Not enough free space in ${dir} to copy ${path.basename(link)}`);

  // Copy the file next to the link under a hidden name with no media extension, which media scanners ignore
  const partial = path.join(dir, `.${path.basename(link)}.partial`);
  active = { partial, size };
  try {
    await copyFile(link, partial);

    // Confirm the copy is complete, and that the Arr didn't replace the link while it was copying
    if ((await stat(partial)).size !== size) throw new Error(`The copy of ${link} came out short`);
    if ((await readlink(link).catch(() => undefined)) !== target) throw new Error(`${link} changed while copying`);

    // Swap the copy into the link's place in one step, so the path is never missing or half-written
    await rename(partial, link);
  } finally {
    await rm(partial, { force: true });
    active = undefined;
  }
  return { size, target };
}

/**
 * How far the copy in progress has got, in bytes, or nothing when no copy is running.
 */
export async function progress(): Promise<{ done: number; size: number } | undefined> {
  if (!active) return;
  const { partial, size } = active;
  return { done: (await stat(partial).catch(() => undefined))?.size ?? 0, size };
}

/**
 * Looks at a recorded copy's path to see whether it's still the copy Tetharr made. A real file of a different size is
 * some other file (an upgrade the Arr imported, or one the user put there), so it's reported as replaced.
 */
export async function check({ path: file, size }: Copy): Promise<Check> {
  const entry = await lstat(file).catch(() => undefined);
  if (!entry) return "missing";
  if (entry.isSymbolicLink()) return "link";
  return entry.isFile() && entry.size === size ? "copy" : "replaced";
}

/**
 * Whether the streamed file a copy's link used to point to can still be reached, so the link can be put back.
 */
export async function restorable({ path: file, target }: Copy): Promise<boolean> {
  return !!(await stat(path.resolve(path.dirname(file), target)).catch(() => undefined));
}

/**
 * Puts a copy's original link back in its place. The new link is made under a hidden name and then swapped over the
 * copy in one step, so the path never goes missing.
 */
export async function restore({ path: file, target }: Copy): Promise<void> {
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.link`);
  await rm(temp, { force: true });
  await symlink(target, temp);
  await rename(temp, file);
}

/**
 * Deletes a copy, so the Arr can download the title again. Callers check the file is still Tetharr's copy first.
 */
export async function remove({ path: file }: Copy): Promise<void> {
  await rm(file);
}

/**
 * Deletes a half-written copy when Tetharr is stopped mid-copy, so nothing is left behind.
 */
export function abort(): void {
  if (active) rmSync(active.partial, { force: true });
}
