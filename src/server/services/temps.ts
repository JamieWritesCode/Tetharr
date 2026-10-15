/**
 * The temporary files the worker is writing right now. Each is recorded before writing starts and forgotten when its
 * step ends, so one still listed at the start of a pass was left by a step that was interrupted (a crash or power cut),
 * and is Tetharr's own file to clean up.
 */

import * as DbService from "./db.ts";

/**
 * Every temporary file recorded as being written.
 */
export const list = () =>
  (DbService.db.prepare("SELECT path FROM temps").all() as { path: string }[]).map((r) => r.path);

/**
 * Records a temporary file just before writing it.
 */
export const add = (path: string) => DbService.db.prepare("INSERT OR IGNORE INTO temps (path) VALUES (?)").run(path);

/**
 * Forgets a temporary file once its step has ended, or once it has been cleaned up.
 */
export const remove = (path: string) => DbService.db.prepare("DELETE FROM temps WHERE path = ?").run(path);
