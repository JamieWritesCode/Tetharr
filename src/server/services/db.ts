/**
 * Tetharr's own database: one SQLite file holding everything Tetharr needs to remember. Its structure only ever changes
 * through the migrations below, which run in order when Tetharr starts.
 */

import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import * as LogService from "./log.ts";

/**
 * Each step changes the database's structure, and runs once. A step is never edited, because a database that has
 * already run it would never see the change: every change goes in a new step at the end. The row types in the services
 * that use each table change alongside them.
 */
const MIGRATIONS = [
  // 1: the initial structure. Connections to Radarr and Sonarr, where AUTOINCREMENT means a removed connection's id is
  // never given to a new one, so records that name a connection can never point at the wrong one, and a connection
  // being removed stays until the worker has undone all its copies. What the user has pinned, where a pin with no
  // season covers a whole title. The copies Tetharr has made, its settings, and the temporary files it's writing, so
  // ones left by an interrupted step can be cleaned up
  `CREATE TABLE arrs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    path_mappings TEXT NOT NULL,
    removing INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE pins (
    arr INTEGER NOT NULL,
    media INTEGER NOT NULL,
    season INTEGER,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX pins_title ON pins (arr, media, ifnull(season, -1));
  CREATE TABLE copies (
    path TEXT PRIMARY KEY,
    arr INTEGER NOT NULL,
    media INTEGER NOT NULL,
    season INTEGER,
    target TEXT NOT NULL,
    size INTEGER NOT NULL,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE temps (
    path TEXT PRIMARY KEY,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  // 2: the history of what the worker has done, one row per file it copied, restored or deleted for a re-grab, with the
  // problem when that failed. Kept by time, so old rows can be cleared out
  `CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    arr INTEGER NOT NULL,
    media INTEGER NOT NULL,
    season INTEGER,
    title TEXT NOT NULL,
    path TEXT NOT NULL,
    action TEXT NOT NULL,
    size INTEGER,
    error TEXT
  );
  CREATE INDEX history_created ON history (created)`,
];

// How many backups taken before migrating are kept
const BACKUPS = 3;

export let db: DatabaseSync;

/**
 * Opens the database file, creating it on the first run, and brings its structure up to date.
 */
export function open(file: string): void {
  // Create the folder the file lives in, in case this is the first run
  mkdirSync(path.dirname(file), { recursive: true });
  const existed = existsSync(file);
  db = new DatabaseSync(file);

  // Let the web interface read while the worker writes
  db.exec("PRAGMA journal_mode = WAL");
  migrate(file, existed);
}

/**
 * Runs the migrations this database hasn't had yet, each in its own transaction, after taking a backup. Refuses to
 * touch a database that a newer Tetharr has already changed.
 */
function migrate(file: string, existed: boolean): void {
  const { user_version: version } = db.prepare("PRAGMA user_version").get() as { user_version: number };

  // Safety: an older Tetharr must never change a database it doesn't understand, such as after rolling back an image
  if (version > MIGRATIONS.length) {
    throw new Error(`${file} was updated by a newer Tetharr (database version ${version}). Run that version or newer.`);
  }
  if (version === MIGRATIONS.length) return;

  // Back up an existing database first, replacing a backup of the same version left by a migration that failed, then
  // keep only the newest few backups
  if (existed) {
    const backup = `${file}.v${version}.bak`;
    rmSync(backup, { force: true });
    db.exec(`VACUUM INTO '${backup.replaceAll("'", "''")}'`);
    const prefix = `${path.basename(file)}.v`;
    const backups = readdirSync(path.dirname(file))
      .filter((f) => f.startsWith(prefix) && f.endsWith(".bak"))
      .sort((a, b) => parseInt(a.slice(prefix.length)) - parseInt(b.slice(prefix.length)));
    for (const old of backups.slice(0, -BACKUPS)) rmSync(path.join(path.dirname(file), old));
  }

  // Run each missing step, recording the new version in the same transaction so a failed step leaves nothing behind
  for (let step = version; step < MIGRATIONS.length; step++) {
    db.exec("BEGIN");
    try {
      db.exec(MIGRATIONS[step]!);
      db.exec(`PRAGMA user_version = ${step + 1}`);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
  LogService.info("database updated", { file, from: version, to: MIGRATIONS.length });
}

/**
 * Closes the database.
 */
export const close = () => db.close();
