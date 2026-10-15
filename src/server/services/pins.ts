/**
 * What the user has pinned: the titles they want kept as local copies. Pinning and unpinning only change this list. The
 * worker then makes the files match it.
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
 * Every season pinned on its own in one Arr, as the seasons pinned for each series id. Seasons of a series that's
 * pinned as a whole are never listed here, because pinning the series clears them.
 */
export function seasons(arr: number): Map<number, Set<number>> {
  const rows = DbService.db.prepare("SELECT media, season FROM pins WHERE arr = ? AND season IS NOT NULL").all(arr) as {
    media: number;
    season: number;
  }[];
  const pinned = new Map<number, Set<number>>();
  for (const { media, season } of rows) pinned.set(media, (pinned.get(media) ?? new Set()).add(season));
  return pinned;
}

/**
 * Pins a whole title, or one season of a series. Pinning a whole series replaces any pins on its seasons, since it
 * covers them all. Pinning something already pinned changes nothing.
 */
export function add(arr: number, media: number, season?: number): void {
  // A whole-title pin covers every season, so it replaces any pins on single seasons
  if (season === undefined) {
    DbService.db.prepare("DELETE FROM pins WHERE arr = ? AND media = ? AND season IS NOT NULL").run(arr, media);
  }
  DbService.db
    .prepare("INSERT OR IGNORE INTO pins (arr, media, season) VALUES (?, ?, ?)")
    .run(arr, media, season ?? null);
}

/**
 * Unpins a whole title, or one season of a series.
 */
export const remove = (arr: number, media: number, season?: number) =>
  DbService.db.prepare("DELETE FROM pins WHERE arr = ? AND media = ? AND season IS ?").run(arr, media, season ?? null);

/**
 * Unpins a whole title and every season of it, for when the title has gone from the Arr.
 */
export const forget = (arr: number, media: number) =>
  DbService.db.prepare("DELETE FROM pins WHERE arr = ? AND media = ?").run(arr, media);

/**
 * Moves a title's pins (whole, and per season) to a new id, for a title removed from its Arr and added back.
 */
export const move = (arr: number, from: number, to: number) =>
  DbService.db.prepare("UPDATE OR IGNORE pins SET media = ? WHERE arr = ? AND media = ?").run(to, arr, from);

/**
 * Unpins every title in one Arr, for when its connection is being removed.
 */
export const clear = (arr: number) => DbService.db.prepare("DELETE FROM pins WHERE arr = ?").run(arr);
