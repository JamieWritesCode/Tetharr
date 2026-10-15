/**
 * What the user has pinned: the titles they want kept as local copies. Pinning and unpinning only change this list.
 * The worker then makes the files match it.
 */

import * as DbService from "./db.ts";

/**
 * Every title pinned in one Arr, by its id in that Arr.
 */
export const list = (arr: number) =>
  new Set(
    (
      DbService.db.prepare("SELECT media FROM pins WHERE arr = ? AND season IS NULL").all(arr) as { media: number }[]
    ).map((p) => p.media),
  );

/**
 * Pins a whole title. Pinning one that's already pinned changes nothing.
 */
export const add = (arr: number, media: number) =>
  DbService.db.prepare("INSERT OR IGNORE INTO pins (arr, media) VALUES (?, ?)").run(arr, media);

/**
 * Unpins a whole title.
 */
export const remove = (arr: number, media: number) =>
  DbService.db.prepare("DELETE FROM pins WHERE arr = ? AND media = ? AND season IS NULL").run(arr, media);

/**
 * Unpins every title in one Arr, for when its connection is being removed.
 */
export const clear = (arr: number) => DbService.db.prepare("DELETE FROM pins WHERE arr = ?").run(arr);
