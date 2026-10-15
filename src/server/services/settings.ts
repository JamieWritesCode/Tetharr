/**
 * The settings saved from the settings page: the Arr connections, and the options that control pinning.
 */

import type { Arr, Input } from "../../schemas/arr.ts";
import * as SettingsSchema from "../../schemas/settings.ts";
import type { Options } from "../../schemas/settings.ts";
import * as DbService from "./db.ts";

interface Row {
  id: number;
  type: Arr["type"];
  name: string;
  url: string;
  api_key: string;
  path_mappings: string;
  removing: number;
}

const parse = (row: Row): Arr => ({
  ...row,
  path_mappings: JSON.parse(row.path_mappings),
  removing: row.removing === 1,
});

/**
 * Every saved Arr connection, in name order.
 */
export const arrs = () =>
  (DbService.db.prepare("SELECT * FROM arrs ORDER BY name").all() as unknown as Row[]).map(parse);

/**
 * Adds a new Arr connection, or replaces an existing one when given its id. Returns the saved connection, or nothing if
 * there was no connection with that id.
 */
export function save({ type, name, url, api_key, path_mappings }: Input, id?: number): Arr | undefined {
  // Drop any trailing slash from the address, so request URLs never get a double slash
  const values = [type, name, url.replace(/\/+$/, ""), api_key, JSON.stringify(path_mappings)];

  // Insert or update, and read back what was stored
  const row =
    id === undefined
      ? DbService.db
          .prepare("INSERT INTO arrs (type, name, url, api_key, path_mappings) VALUES (?, ?, ?, ?, ?) RETURNING *")
          .get(...values)
      : DbService.db
          .prepare(
            "UPDATE arrs SET type = ?, name = ?, url = ?, api_key = ?, path_mappings = ? WHERE id = ? RETURNING *",
          )
          .get(...values, id);
  return row && parse(row as unknown as Row);
}

/**
 * Marks a connection as being removed. The worker undoes its copies, then removes it.
 */
export const retire = (id: number) => DbService.db.prepare("UPDATE arrs SET removing = 1 WHERE id = ?").run(id);

/**
 * Forgets an Arr connection. Returns whether there was one to forget.
 */
export const remove = (id: number) => DbService.db.prepare("DELETE FROM arrs WHERE id = ?").run(id).changes > 0;

/**
 * The pinning options, with the default filled in for any that have never been saved.
 */
export function options(): Options {
  const rows = DbService.db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  return { ...SettingsSchema.defaults, ...Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])) };
}

/**
 * Saves the options given, one row each, leaving the rest as they were. Returns every option as it now stands.
 */
export function update(changes: Partial<Options>): Options {
  const upsert = DbService.db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
  );
  for (const [key, value] of Object.entries(changes)) upsert.run(key, JSON.stringify(value));
  return options();
}
