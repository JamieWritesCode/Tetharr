/**
 * Runs the development environment: real Radarr and Sonarr and Tetharr's server in containers, with the web interface
 * on the host. Starting fills in anything missing (fake media, the Arrs' libraries, Tetharr's connections) and keeps
 * everything else, so your setup survives between runs. Only `reset` wipes it.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, rename, rm, symlink, truncate, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const DEV = import.meta.dirname;
const STATE = path.join(DEV, "state");
const MEDIA = path.join(DEV, "media");
const MOUNT = path.join(MEDIA, "fake-mount");
const TETHARR = "http://localhost:8787";

// Everything that differs between Radarr and Sonarr, so the steps below can treat them alike
const RADARR = {
  type: "radarr",
  name: "Radarr",
  port: 7878,
  key: "7e7ba77a7e7ba77a7e7ba77a00000001",
  root: "/data/library/movies",
  items: "movie",
  id: "tmdbId",
  lookup: (id: number) => `movie/lookup/tmdb?tmdbId=${id}`,
  options: { addOptions: { searchForMovie: false } },
  rescan: (id?: number) => ({ name: "RescanMovie", movieId: id }),
};
const SONARR = {
  type: "sonarr",
  name: "Sonarr",
  port: 8989,
  key: "7e7ba77a7e7ba77a7e7ba77a00000002",
  root: "/data/library/tv",
  items: "series",
  id: "tvdbId",
  lookup: (id: number) => `series/lookup?term=tvdb:${id}`,
  options: { seasonFolder: true, addOptions: { monitor: "none", searchForMissingEpisodes: false } },
  rescan: (id?: number) => ({ name: "RescanSeries", seriesId: id }),
};
const ARRS = [RADARR, SONARR];
type Arr = (typeof ARRS)[number];

// The fixture library. The ids are real, so the Arrs fetch real titles and posters for them
const TITLES = [
  { arr: RADARR, id: 10378, folder: "Big Buck Bunny (2008)", files: ["Big Buck Bunny (2008).mkv"] },
  { arr: RADARR, id: 45745, folder: "Sintel (2010)", files: ["Sintel (2010).mkv"] },
  { arr: RADARR, id: 133701, folder: "Tears of Steel (2012)", files: ["Tears of Steel (2012).mkv"] },
  {
    arr: SONARR,
    id: 78874,
    folder: "Firefly (2002)",
    files: ["Season 01/Firefly - S01E01 - Serenity.mkv", "Season 01/Firefly - S01E02 - The Train Job.mkv"],
  },
  {
    arr: SONARR,
    id: 73545,
    folder: "Battlestar Galactica (2003)",
    files: ["Season 01/Battlestar Galactica - S01E01 - 33.mkv", "Season 01/Battlestar Galactica - S01E02 - Water.mkv"],
  },
];
type Title = (typeof TITLES)[number];

// Prefer rootless Podman. Under Docker, the containers run as you, so the files they create are yours
const engine = spawnSync("podman", ["--version"]).status === 0 ? "podman" : "docker";
const env = {
  ...process.env,
  PUID: process.env.PUID ?? (engine === "podman" ? "0" : String(process.getuid!())),
  PGID: process.env.PGID ?? (engine === "podman" ? "0" : String(process.getgid!())),
  PODMAN_COMPOSE_WARNING_LOGS: "false",
};
const compose = (...args: string[]) => ["compose", "-f", path.join(DEV, "compose.yml"), ...args];

/**
 * Runs a container engine command in the foreground, stopping everything if it fails.
 */
function run(args: string[]): void {
  if (spawnSync(engine, args, { stdio: "inherit", env }).status !== 0) {
    throw new Error(`${engine} ${args.join(" ")} failed`);
  }
}

/**
 * Asks a dev Arr one question, from the host. Errors include the Arr's own explanation.
 */
async function api<T>(arr: Arr, endpoint: string, body?: object): Promise<T> {
  const res = await fetch(`http://localhost:${arr.port}/api/v3/${endpoint}`, {
    method: body ? "POST" : "GET",
    headers: { "X-Api-Key": arr.key, "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${arr.name}: ${endpoint} returned HTTP ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

/**
 * Waits for a service to answer, for up to two minutes.
 */
async function ready(name: string, url: string): Promise<void> {
  for (let i = 0; i < 120; i++) {
    if ((await fetch(url).catch(() => undefined))?.ok) return;
    await sleep(1000);
  }
  throw new Error(`${name} did not start within two minutes. See \`${engine} compose -f dev/compose.yml logs\``);
}

/**
 * Creates fake files on the mount and symlinks to them in the library, for the given titles. A link or real file
 * already in the library is left alone, so pinned copies survive.
 */
async function media(titles: Title[]): Promise<void> {
  for (const { arr, folder, files } of titles) {
    for (const file of files) {
      const rel = path.join(path.basename(arr.root), folder, file);
      const target = path.join(MOUNT, rel);
      const link = path.join(MEDIA, "library", rel);

      // Make a 64 MB sparse file on the mount: it reports its full size but takes no disk space
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, "", { flag: "a" });
      await truncate(target, 64 * 1024 ** 2);

      // Link to it from the library with a relative link, which resolves from the host and from every container
      await mkdir(path.dirname(link), { recursive: true });
      await symlink(path.relative(path.dirname(link), target), link).catch(() => {});
    }
  }
}

/**
 * Makes sure an Arr has the library's root folder and every fixture title, adding only what's missing, then has it
 * rescan so its records match what's on disk now.
 */
async function library(arr: Arr): Promise<void> {
  // Add the root folder, if it isn't there yet
  if (!(await api<{ path: string }[]>(arr, "rootfolder")).some((r) => r.path === arr.root)) {
    await api(arr, "rootfolder", { path: arr.root });
  }

  // Add each missing title, looking up its details by id. This needs internet
  const [profile] = await api<{ id: number }[]>(arr, "qualityprofile");
  const have = new Set((await api<Record<string, unknown>[]>(arr, arr.items)).map((i) => i[arr.id]));
  for (const title of TITLES.filter((t) => t.arr === arr && !have.has(t.id))) {
    const [found] = [await api<object | object[]>(arr, arr.lookup(title.id))].flat();
    await api(arr, arr.items, {
      ...found,
      ...arr.options,
      qualityProfileId: profile!.id,
      rootFolderPath: arr.root,
      path: `${arr.root}/${title.folder}`,
      monitored: false,
    });
    console.log(`Added ${title.folder} to ${arr.name}`);
  }

  // Rescan everything, so the Arr notices files that were added, removed or pinned since it last looked
  await api(arr, "command", arr.rescan());
}

/**
 * Connects Tetharr to the dev Arrs through its own API, unless it already has connections. The Arrs see the library at
 * /data and Tetharr sees it at /media, so the mapping is always used.
 */
async function connect(): Promise<void> {
  if (((await (await fetch(`${TETHARR}/api/arrs`)).json()) as unknown[]).length) return;
  for (const arr of ARRS) {
    const res = await fetch(`${TETHARR}/api/arrs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: arr.type,
        name: arr.name,
        url: `http://${arr.type}:${arr.port}`,
        api_key: arr.key,
        path_mappings: [{ from: "/data", to: "/media" }],
      }),
    });
    if (!res.ok) throw new Error(`Tetharr refused the ${arr.name} connection: ${await res.text()}`);
  }
}

/**
 * Brings the whole environment up, fills in whatever is missing, then runs the web interface with Tetharr's server log
 * alongside it.
 */
async function start(): Promise<void> {
  // Build the fake media on the first run only. After that, the library only changes when you or Tetharr change it
  if (!existsSync(MEDIA)) await media(TITLES);
  if (existsSync(`${MOUNT}.off`)) console.log("The fake mount is down. `npm run dev:restore` brings it back.");

  // Give each Arr a fixed API key and no login, unless it already has a config
  for (const arr of ARRS) {
    await mkdir(path.join(STATE, arr.type), { recursive: true });
    const xml = `<Config><ApiKey>${arr.key}</ApiKey><AuthenticationMethod>External</AuthenticationMethod></Config>\n`;
    await writeFile(path.join(STATE, arr.type, "config.xml"), xml, { flag: "wx" }).catch(() => {});
  }
  await mkdir(path.join(STATE, "tetharr"), { recursive: true });

  // Start the containers, rebuilding Tetharr's image if its dependencies changed
  run(compose("up", "-d", "--build"));

  // Fill in the Arrs' libraries and Tetharr's connections once each is answering
  for (const arr of ARRS) {
    await ready(arr.name, `http://localhost:${arr.port}/ping`);
    await library(arr);
  }
  await ready("Tetharr", `${TETHARR}/api/health`);
  await connect();

  // Run the web interface in front, with the server log alongside. The containers keep running afterwards
  console.log("\nArrs: http://localhost:7878, http://localhost:8989. Stop the containers with `npm run dev:down`.\n");
  const logs = spawn(engine, compose("logs", "-f", "--tail", "20", "tetharr"), { stdio: "inherit", env });
  const vite = spawn(path.join(DEV, "../node_modules/.bin/vite"), { stdio: "inherit" });
  vite.on("exit", (code) => {
    logs.kill();
    process.exit(code ?? 0);
  });
}

/**
 * Stops the containers, keeping all settings and media.
 */
const down = () => run(compose("down"));

/**
 * Stops the containers and wipes all settings and media, so the next start is a fresh one.
 */
async function reset(): Promise<void> {
  run(compose("down"));
  await rm(STATE, { recursive: true, force: true });
  await rm(MEDIA, { recursive: true, force: true });
  console.log("Wiped. `npm run dev` starts fresh.");
}

/**
 * Takes the fake mount away, the way an rclone mount disappears when it goes down. Streamed files then show as
 * unreachable.
 */
async function outage(): Promise<void> {
  await rename(MOUNT, `${MOUNT}.off`);
  console.log("The fake mount is down. `npm run dev:restore` brings it back.");
}

/**
 * Brings the fake mount back after an outage.
 */
async function restore(): Promise<void> {
  await rename(`${MOUNT}.off`, MOUNT);
  console.log("The fake mount is back.");
}

/**
 * Stands in for an Arr re-grabbing a title after an unpin: puts back any missing symlinks for it, then has its Arr
 * rescan it so the files are imported again. Real files are left alone.
 */
async function regrab(term = ""): Promise<void> {
  // Find the fixture title by part of its name
  const title = TITLES.find((t) => term && t.folder.toLowerCase().includes(term.toLowerCase()));
  if (!title) throw new Error(`Name a title to re-grab: ${TITLES.map((t) => t.folder).join(", ")}`);

  // Put back its symlinks, then rescan just that title
  await media([title]);
  const items = await api<Record<string, unknown>[]>(title.arr, title.arr.items);
  const item = items.find((i) => i[title.arr.id] === title.id);
  if (!item) throw new Error(`${title.arr.name} doesn't have ${title.folder}. Run \`npm run dev\` first`);
  await api(title.arr, "command", title.arr.rescan(item.id as number));
  console.log(`Re-grabbed ${title.folder}.`);
}

// Run the command named on the command line, starting the environment if none is given
const COMMANDS: Record<string, (arg?: string) => unknown> = { start, down, reset, outage, restore, regrab };
const [command = "start", arg] = process.argv.slice(2);
try {
  if (!COMMANDS[command]) throw new Error(`Unknown command "${command}". Use: ${Object.keys(COMMANDS).join(", ")}`);
  await COMMANDS[command](arg);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
