/**
 * The diagnostics bundle: one file describing how this Tetharr is set up and what it has been doing, for attaching to a
 * bug report so a problem can be looked into without a back-and-forth. API keys never leave in it.
 */

import { readFileSync } from "node:fs";
import os from "node:os";
import * as ChecksService from "./checks.ts";
import * as CopiesService from "./copies.ts";
import * as HistoryService from "./history.ts";
import * as LogService from "./log.ts";
import * as PinsService from "./pins.ts";
import * as SettingsService from "./settings.ts";
import * as TempsService from "./temps.ts";

const { version } = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"));

/**
 * Builds the bundle as readable JSON. `worker` is the worker's status, passed in so this file doesn't depend on the
 * worker. Each connection is checked the same way as testing it in Settings, so the bundle shows whether Tetharr can
 * see each library and follow its links right now.
 */
export async function build(worker: object): Promise<string> {
  const arrs = SettingsService.arrs();
  const copies = CopiesService.totals();
  const seasons = (id: number) => [...PinsService.seasons(id).values()].reduce((total, s) => total + s.size, 0);

  // Describe Tetharr itself, then each connection without its key, then what the worker has been doing
  const bundle = {
    created: new Date().toISOString(),
    tetharr: version,
    node: process.version,
    platform: `${os.platform()} ${os.release()} ${os.arch()}`,
    user: `${process.getuid?.()}:${process.getgid?.()}`,
    umask: process.umask().toString(8).padStart(3, "0"),
    uptime: Math.round(process.uptime()),
    options: SettingsService.options(),
    connections: await Promise.all(
      arrs.map(async ({ api_key, ...arr }) => ({
        ...arr,
        pins: PinsService.list(arr.id).size + seasons(arr.id),
        copies: copies.get(arr.id) ?? { count: 0, bytes: 0 },
        checks: await ChecksService.run({ ...arr, api_key }).catch((err: Error) => [
          { label: `Connected to ${arr.name}`, ok: false, detail: err.message },
        ]),
      })),
    ),
    worker,
    temps: TempsService.list(),
    history: HistoryService.list().entries,
    log: LogService.recent(),
  };

  // Blank out every API key wherever it appears, in case one turns up in an error message or a log entry
  let text = JSON.stringify(bundle, null, 2);
  for (const { api_key } of arrs) text = text.replaceAll(api_key, "[redacted]");
  return text;
}
