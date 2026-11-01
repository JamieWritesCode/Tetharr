/**
 * The history of what the worker has done to the library: every file it copied, restored, or deleted so the Arr would
 * download it again, and what went wrong when that failed. It's a record for the user to read, never used to decide
 * anything.
 */

import * as DbService from "./db.ts";

/**
 * One thing the worker did, or tried to do, to one file. `error` holds the problem when it failed. `size` is the file's
 * size when known.
 */
export interface Entry {
  id: number;
  created: string;
  arr: number;
  media: number;
  season: number | null;
  title: string;
  path: string;
  action: "copy" | "restore" | "regrab";
  size: number | null;
  error: string | null;
}

// How long history is kept, and how many rows are read at a time
const DAYS = 90;
const PAGE = 50;

/**
 * Records one thing the worker did. A failure that repeats pass after pass, while a problem lasts, is recorded only
 * once, so it doesn't push everything else out of view.
 */
export function add({
  arr,
  media,
  season,
  title,
  path,
  action,
  size = null,
  error = null,
}: Partial<Entry> & Pick<Entry, "arr" | "media" | "season" | "title" | "path" | "action">): void {
  // Skip a failure identical to the last thing recorded for this file
  const last = DbService.db
    .prepare("SELECT action, error FROM history WHERE path = ? ORDER BY id DESC LIMIT 1")
    .get(path) as Pick<Entry, "action" | "error"> | undefined;
  if (error && last?.action === action && last.error === error) return;

  DbService.db
    .prepare(
      "INSERT INTO history (arr, media, season, title, path, action, size, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(arr, media, season, title, path, action, size, error);
}

/**
 * One page of history, newest first, starting after the row `before` (or from the newest). `next` is where the
 * following page starts, if there is one.
 */
export function list(before = Number.MAX_SAFE_INTEGER): { entries: Entry[]; next: number | undefined } {
  const rows = DbService.db
    .prepare(
      `SELECT id, strftime('%Y-%m-%dT%H:%M:%SZ', created) AS created, arr, media, season, title, path, action, size, error
       FROM history WHERE id < ? ORDER BY id DESC LIMIT ?`,
    )
    .all(before, PAGE + 1) as unknown as Entry[];
  const entries = rows.slice(0, PAGE);
  return { entries, next: rows.length > PAGE ? entries.at(-1)!.id : undefined };
}

/**
 * Clears out history older than three months, so it can't grow forever.
 */
export const prune = () =>
  DbService.db.prepare(`DELETE FROM history WHERE created < datetime('now', '-${DAYS} days')`).run();
