/**
 * The local copies Tetharr has made. This list is the only thing that allows Tetharr to delete a file: a file that
 * isn't on it was not made by Tetharr, and is never touched.
 */

import * as DbService from "./db.ts";

/**
 * One copy: where it is (as Tetharr sees it), which Arr title (and season, for an episode) it belongs to, where the
 * link it replaced used to point, and its size, which is how Tetharr later recognises the file as still being its own.
 */
export interface Copy {
  path: string;
  arr: number;
  media: number;
  season: number | null;
  target: string;
  size: number;
}

/**
 * Every copy Tetharr has made for one Arr.
 */
export const list = (arr: number) =>
  DbService.db
    .prepare("SELECT path, arr, media, season, target, size FROM copies WHERE arr = ?")
    .all(arr) as unknown as Copy[];

/**
 * Records a copy the moment it's in place.
 */
export const add = ({ path, arr, media, season, target, size }: Copy) =>
  DbService.db
    .prepare("INSERT OR REPLACE INTO copies (path, arr, media, season, target, size) VALUES (?, ?, ?, ?, ?, ?)")
    .run(path, arr, media, season, target, size);

/**
 * Forgets a copy, once it has been undone or is no longer Tetharr's.
 */
export const remove = (path: string) => DbService.db.prepare("DELETE FROM copies WHERE path = ?").run(path);

/**
 * Finds the copy recorded at a path, if there is one.
 */
export const find = (path: string) =>
  DbService.db
    .prepare("SELECT path, arr, media, season, target, size FROM copies WHERE path = ?")
    .get(path) as unknown as Copy | undefined;

/**
 * How many copies Tetharr has made for each Arr, and how much space they take, keyed by the Arr's id.
 */
export const totals = () =>
  new Map(
    (
      DbService.db.prepare("SELECT arr, count(*) AS count, sum(size) AS bytes FROM copies GROUP BY arr").all() as {
        arr: number;
        count: number;
        bytes: number;
      }[]
    ).map(({ arr, count, bytes }) => [arr, { count, bytes }]),
  );

/**
 * Forgets every copy made for one Arr. The files themselves are left exactly as they are.
 */
export const clear = (arr: number) => DbService.db.prepare("DELETE FROM copies WHERE arr = ?").run(arr);
