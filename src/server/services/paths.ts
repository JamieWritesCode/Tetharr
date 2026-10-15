/**
 * Translates between the paths an Arr reports and the paths Tetharr sees. Every path that comes from an Arr goes
 * through here before Tetharr looks at the disk.
 */

import { stat } from "node:fs/promises";
import path from "node:path";
import type { Input } from "../../schemas/arr.ts";

/**
 * Whether a path is inside a folder. It compares whole folder names, so /data/lib does not count as containing
 * /data/library.
 */
export function within(root: string, p: string): boolean {
  const rel = path.relative(root, p);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Turns a path as the Arr reports it into the path Tetharr sees. The first matching mapping wins, and a path no mapping
 * covers is used as it is.
 */
export function map(arr: Input, p: string): string {
  const mapping = arr.path_mappings.find((m) => within(m.from, p));
  return mapping ? path.join(mapping.to, path.relative(mapping.from, p)) : p;
}

/**
 * Checks that every one of these folders exists. Safety: never act on a dead mount. An unmounted share looks exactly
 * like "everything was deleted", so nothing may change until every folder is there.
 */
export async function verify(roots: string[]): Promise<void> {
  for (const root of roots) {
    if (!(await stat(root).catch(() => undefined))?.isDirectory()) {
      throw new Error(`${root} is missing. Is the share mounted, and are the path mappings right?`);
    }
  }
}
