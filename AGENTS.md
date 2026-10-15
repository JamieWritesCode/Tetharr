# Tetharr

Tetharr is a web app for Radarr/Sonarr users who stream their library from usenet (NzbDav or similar, mounted with rclone). It lets you choose, title by title, which movies and shows are kept as local copies and which stay as links to the usenet copy. Pinning a title swaps its links for real copies at the same paths. Unpinning it swaps them back.

**Status:** Pinning and unpinning work for Radarr movies and for Sonarr series and seasons. Preview mode and login are next. Read [Where this is going](#where-this-is-going) before building them.

## Glossary

Use these terms the same way in the UI, code, logs and docs.

| Term                                  | Means                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Arr**                               | A Radarr or Sonarr instance. Tetharr talks to them through their v3 API                                                              |
| **Title**                             | A movie, series or season that can be pinned                                                                                         |
| **Pin / Unpin**                       | The user's choice: keep a local copy of this title, or free up the space and stream it again. The only verbs a user performs         |
| **Pinned**                            | The user has asked for this title to be local. True from the moment they pin it, even while it's still copying                       |
| **Streamed**                          | The file is a link (symlink) into the usenet mount                                                                                   |
| **Local**                             | The file is a real file on local storage                                                                                             |
| **Copy**                              | A local file Tetharr created. The `copies` table records them, and they are the only files Tetharr may delete                        |
| **Partly local / Partly pinned**      | A series where only some files are local copies, or only some seasons are pinned. Short labels, never "6 of 10 local"                |
| **Unmanaged**                         | Local, but not created by Tetharr. Shown as "Local · unmanaged", and never changed or deleted                                        |
| **Copying / Restoring / Re-grabbing** | What the worker is doing: making a copy, putting a link back after an unpin, or deleting a copy so the Arr downloads the title again |
| **Re-grab**                           | Asking the Arr to download a title again, used when a link can't be restored                                                         |
| **Unreachable**                       | A link that can't be followed: the mount is down or the link is broken                                                               |
| **Missing**                           | Nothing at the path Tetharr expected. Usually a path mapping                                                                         |
| **Mount**                             | The rclone mount of the usenet store. Link targets live inside it                                                                    |
| **Path mapping**                      | A translation between the path an Arr reports and the path Tetharr sees, needed when they run in different containers                |

Avoid "offload", "on disk" (a link is on disk too) and "tier" in anything a user reads.

## The invariant

The path the media server sees never changes when a title is pinned or unpinned. Plex/Jellyfin watch state, the Arr's file records and playback all survive because nothing moved from their point of view. Every design choice serves this.

## Safety rules (inviolable)

Code that enforces one of these says so with a `// Safety:` comment, so they can be searched for.

- **Never delete a file Tetharr didn't create.** Only files in the `copies` table may be deleted, and only while they still match the recorded size. A file that has been replaced is forgotten, never touched. Unpinning files Tetharr didn't create is a planned feature, but it stays off until the system has earned trust, and then needs explicit confirmation.
- **Never act on a dead mount.** An unmounted share looks the same as "everything was deleted". Every library root must exist before the worker changes anything. A link that can't be followed is an error, never a reason to delete or re-grab: when unpinning, Tetharr only falls back to deleting and re-grabbing if other links in the library (or the original targets of other copies) can still be followed.
- **Never act because an API call failed.** An Arr that can't be reached is reported and skipped. Missing data is never a decision.
- **Temp files are `.<name>.partial` (copies) and `.<name>.link` (restored links).** The dot prefix and non-media extension mean scanners never pick up a half-made file, and both are swapped into place with a single rename. Each is recorded in the `temps` table before it's written and forgotten when its step ends, so one left by a crash is deleted at the start of the next pass, and only if it still has one of these names.
- **Record a copy the moment it's in place, and forget it only after the Arr has been told.** A crash in between then leaves a file Tetharr won't delete, or a request it retries, never a title that's missing for good.
- **Every path from an Arr goes through the path mappings.** Never assume the two views match.
- **Preview mode (when it lands) means zero filesystem or Arr writes.** Tetharr's own database is the only exception.

## Where this is going

These decisions are settled. Build to them.

- **The UI decides what is pinned.** Pins are stored in Tetharr's database (`pins`). Arr tags are not used.
- **Granularity is movie, series, and season.** A pin with no season covers the whole title. A series pin is live: it covers every season, including episodes that arrive later. While a series is pinned, its seasons can't be pinned separately, and pinning the series replaces any season pins. The series grid only knows pins and copy counts (checking every file would mean a request per series), so each series' own page is where file states are checked. A re-grab for a series searches just the affected season.
- **A background worker makes it so** ([src/server/worker.ts](src/server/worker.ts)). It is one idempotent pass: copy what's pinned and still streamed, undo Tetharr's copies of anything no longer pinned, one file at a time. It runs every five minutes, and straight away when the user pins or unpins. After a pass that hit problems it tries again after 30 seconds, doubling up to five minutes, so an Arr that started after Tetharr (common after a reboot) is picked up quickly. Because every step is safe to repeat, anything that fails or is interrupted is retried by the next pass. Its current activity and copy progress are held in memory for the UI, as a view onto the pass, not a second source of truth.
- **Unpinning restores the link.** Pinning records where the link pointed. Unpinning recreates it if that target still resolves, with no gap and no search. Otherwise it deletes the copy and asks the Arr to re-grab. "Always re-grab" is a setting.
- **Preview mode comes before release.** A switch in Settings, on by default for new installs, where the worker runs every check and shows what it would do, but changes nothing. Its interface (a banner, a plan of pending actions, confirmation when turning it off) is still to be designed.
- **Branch mode comes later:** links in one folder and copies in another, merged by mergerfs. In-place mode (both in the same folder) is the only mode for now.
- **Removing a connection is a choice.** Either restore everything first (the connection shows as removing while the worker undoes its copies, then disappears), or remove it straight away and leave its copies on disk as unmanaged files, with their records forgotten. Connection ids are never reused, so no record can end up pointing at the wrong connection.
- **Titles removed from an Arr are tidied, never acted on.** Their pins and records are forgotten once their copies are gone. A copy still on disk is listed for the user to keep (it becomes unmanaged) or delete, and its pin is kept meanwhile. If the title is added back, its copy and pin follow it to its new id, matched by path.
- **All configuration lives in the settings UI**, stored in the database. There is no config file.
- **No authentication yet.** Tetharr is for trusted networks only until login lands, which must happen before any public release.

## Stack

- **Server:** [Hono](https://hono.dev) on Node through `@hono/node-server`, with `node:sqlite` for storage. Node runs the TypeScript directly (native type stripping), so the server has no build step.
- **Client:** Vue 3 single-page app built by Vite, with Vue Router, [TanStack Vue Query](https://tanstack.com/query) for server data, Tailwind CSS 4 + daisyUI 5, [Phosphor](https://phosphoricons.com) icons, and Geist + Geist Mono (self-hosted through Fontsource, so nothing loads from the internet).
- **Typed API:** Hono RPC. The server exports the type of its route chain, and the client's `hc<App>` client gets every route's request and response types from it.
- **Validation:** Zod schemas in `src/schemas/`, used by the server's validators, the client's forms, and as the source of the database row types.
- In production, one Node process serves the API and the built client on one port. In development, the server runs in a container from the live source, and Vite serves the client on the host, passing `/api` through to it.

## Design

The aim is "the Arrs, but cleaner": calm, card-based, and modular, with dark mode getting the most polish. Phones are supported, but desktop comes first.

- **One set of design tokens.** [src/client/style.css](src/client/style.css) defines the fonts (as Tailwind's `font-sans` and `font-mono`) and two custom daisyUI themes, `tetharr-dark` and `tetharr-light`. daisyUI's built-in themes are switched off. Both Tailwind utilities and daisyUI components read these tokens, so use them (`bg-base-100`, `text-primary`, `rounded-box`) rather than raw colours or sizes. The theme follows the system unless the user picks one in Settings ([services/theme.ts](src/client/services/theme.ts)).
- **Colours.** Teal is the primary colour, because no Arr or media server uses it. Surfaces: `base-200` is the page, `base-100` is cards, and `base-300` is borders and sunken areas. Status colours have fixed meanings: `info` means streamed, `success` means local, `error` means broken or failed, and `warning` means something needs attention. The favicon repeats the primary colour by hand, so change both together. Radarr's gold and Sonarr's blue (`--color-radarr`, `--color-sonarr`) are only for showing which kind of Arr something is, through the tinted `arr-icon` tiles (`arr-radarr`, `arr-sonarr`), never for anything else. The icons are Phosphor's film strip and television, matching Movies and Series in the navigation.
- **Cards for everything.** Page content sits in `card card-border bg-base-100` blocks, which are flat (no shadows) with 1px `base-300` borders, the same as dividers and the sidebar edge. A settings section is one card with a header row (title, one line of description, actions) and a body.
- **Shared components:** `page-header` (title, detail line, actions), `section-card` (a titled card for one section of a page), `setting-row` (see Settings below), `poster-card` (a title in a library grid, with its pin button), `orphans` (copies of titles an Arr has removed), `problems` (a page's own problems) and `worker-problems` (the worker's, with a countdown to its next try), `empty-state` (icon, title, what to do next), `state-badge` (where a file lives, or what the worker is doing to it), `confirm-dialog`, and `arr-icon`. Use them rather than rebuilding them. Forms open in a daisyUI `modal` that becomes a bottom sheet on phones.
- **Actions with consequences ask first, through `ConfirmService.ask()`** ([services/confirm.ts](src/client/services/confirm.ts)), never the browser's `confirm()`. The dialog spells out what will happen, step by step, and what it means (each point marked as good news, information, a caution or a loss), then offers one or more ways to go ahead. Ask whenever an action deletes a copy, leaves a title missing, or stops Tetharr managing files. Don't ask for actions that are instant and fully reversible, like pinning or unpinning that just restores the link.
- **Flat throughout.** No shadows, glows or focus rings. A focused input, select or textarea (and an open select) just turns its border teal, through one rule in [style.css](src/client/style.css). Fields with an error keep their red border.
- **Corner radius.** Two sizes: `rounded-field` (8px) for anything button-sized, including inputs, icon tiles and the logo, and `rounded-box` for cards, dialogs and larger panels. The favicon's corners use the same proportion as the logo tile (8px of 36px, so `rx="57"` of 256).
- **Type.** Geist for the interface. Geist Mono (`font-mono`) for anything machine-shaped: paths, addresses, sizes, versions, keys and counts.
- **Icons.** Phosphor, imported by name from `@phosphor-icons/vue` and sized with `size-4`/`size-5`. Use the `regular` weight, `fill` for the active navigation item, and `bold` inside small badges and primary buttons.
- **Layout.** A sidebar on large screens and a bottom dock on phones, both built from the same page list in `app.vue`. What concerns the whole app rather than one page (what the worker is doing, and the problems it hit) sits at the bottom of the sidebar, or at the top of the page on phones. Content is capped at `max-w-7xl`. Poster grids use `auto-fill` columns rather than fixed breakpoints.

### Settings

Every setting looks and behaves the same way, whatever it controls.

- **Each section is a `section-card`, and each setting is a `setting-row`** inside it, with dividers between rows. Section titles are `text-lg`, a step above setting names (`text-sm`), so the two never look alike. The row shows the setting's name and a short description on the left, capped at the golden ratio (61.8%) of the row on larger screens, and its control on the right. On phones the control drops below the text at full width, so nothing can overflow.
- **One control per kind of setting:**

  | Kind of setting            | Control                                                                                                                  |
  | -------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | On or off                  | daisyUI `toggle`                                                                                                         |
  | One of several options     | `select`. The description explains every option in one fixed sentence or two, never text that changes with the selection |
  | A number with a unit       | A compact number field (`w-32` on larger screens) with the unit inside it                                                |
  | Short text or a path       | A text field, `font-mono` for paths and addresses                                                                        |
  | A collection (connections) | List rows with Edit, an Add button in the card's header, and a dialog for adding and editing                             |

- **Settings save as soon as they change**, through `SettingsService.useSetting(key)`, which checks the value with the server's rules and saves just that one setting (`PATCH /api/settings`). Toggles and selects save on click. Number and text fields save when the user leaves the field or presses Enter. The row shows a spinner while saving, a brief check mark when saved, and the problem if the value was refused. There are no Save buttons, except inside dialogs for collections, which edit several fields at once.
- **A change with consequences asks first**, through the confirmation dialog, before it's saved.
- **Settings stored only in the browser say so** in their description ("This browser only"). Theme is the only one.
- **New settings get a default** in [schemas/settings.ts](src/schemas/settings.ts), so they never need a database migration.

## Layout

```
src/
  schemas/            Zod schemas shared by server and client
  server/
    index.ts          boot: open (and migrate) the database, serve the API and the built client, start the worker
    app.ts            the API: error handling and the one chained route table; exports type App
    worker.ts         the flow: one idempotent pass that makes the files match the pins
    routes/<module>/  one handler per file, plus an index.ts barrel per module
    services/         one file per external system or domain boundary: arr (the Arr API), files (copy, restore,
                      delete), paths, library, checks (can a connection see its library?), db (migrations), settings,
                      pins, copies, temps (temporary files being written), http, log
  client/
    main.ts           boot: router, query cache, styles
    app.vue           the frame around every page
    router.ts         pages and their addresses
    services/         api.ts (typed client + unwrap), query.ts (cache), one file per resource
    views/            one file per page
    components/       pieces shared between pages
dev/
  compose.yml         the dev environment: real Radarr and Sonarr, and Tetharr's server from the live source
  run.ts              starts it and fills in what's missing; also down, reset, outage, restore, regrab
  state/              (gitignored) Arr configs and databases, Tetharr's database. Kept until `dev:reset`
  media/              (gitignored) fake mount + symlinked library. Built on the first run, then left alone
```

## Commands

```sh
npm run dev          # start everything, fill in what's missing, then Vite on http://localhost:5173 + server logs
npm run dev:down     # stop the containers, keeping all settings and media
npm run dev:reset    # stop the containers and wipe dev/state and dev/media, for a fresh start
npm run dev:outage   # take the fake mount away (dev:restore brings it back)
npm run dev:regrab <title>  # put back a title's symlinks and have its Arr rescan it, like a re-grab landing
npm run typecheck    # tsc for the server and dev tooling, vue-tsc for the client
npm run format       # prettier --write .
npm run build        # build the client into dist/
npm start            # production server, serving dist/
npm run image        # build + push the :dev image for testing on a real stack
npm run deps:check   # list updates that have passed the 14-day cooldown
```

## Development and testing

- **Local-first.** Tetharr only sees symlinks, their targets, and the Arr APIs, and all of that is faked under `dev/`. Never point a dev build at a real library. Testing on a real stack goes through a pushed image.
- **There is no automated test suite yet.** Verify every change by hand in the dev environment. For anything that touches pinning, offloading, ownership, or what happens when the mount is down, run through `dev:outage` and `dev:regrab` as well as the happy path.
- **How the dev environment fits together.** Radarr and Sonarr see the library at `/data`, and Tetharr's container sees it at `/media` on purpose, so path mappings are always exercised. The symlinks are relative, so they resolve from every container and from the host. Tetharr's server watches the mounted `src/` folder and restarts on any change. Its runtime packages are installed inside the image, so changing dependencies needs a rebuild, which `npm run dev` always asks for. The debugger listens on port 9229.
- **Your setup survives.** `npm run dev` only adds what's missing: the Arrs' root folders and fixture titles (looked up by their real TMDB/TVDB ids, which needs internet), and Tetharr's connections. Everything else, including changes you make in the Arr or Tetharr UIs, stays until `npm run dev:reset`.
- **Container engine.** `dev/run.ts` prefers rootless Podman, where containers run as you. Under Docker it runs them with your uid/gid, so files they create in `dev/` are yours. Set `PUID`/`PGID` to override.
- **Check API shapes against the real Arrs** in the dev environment, never from memory or docs alone.

## Dependencies and supply chain

- **Every version is pinned exactly.** `.npmrc` sets `save-exact`.
- **Nothing younger than 14 days gets installed.** `.npmrc` sets `min-release-age=14`, which covers indirect dependencies too. `npm outdated` (`deps:check`) and `npm install <pkg>@latest` both respect it, picking the newest release that has passed the cooldown.
- **Upgrade majors by hand, after checking what else has to move with them.** Currently held back: `@types/node` (tracks the Node major, 24), `typescript` (6.x until vue-tsc supports the TypeScript 7 native compiler), and `vite` with `@vitejs/plugin-vue` (always upgraded together). `npm outdated` lists these under "Latest". Upgrade within the major with `npm install <pkg>@^<major>`.
- **Node is pinned to the 24 LTS line.** `.nvmrc` and the Dockerfile name the exact release (including the Alpine version), and `engines` (enforced by `engine-strict`) refuses older Node and any npm too old to know `min-release-age`. Bump all three together.
- **Install scripts are opt-in.** `strict-allow-scripts` makes any unreviewed install script fail the install. Approve one with `npm install-scripts approve <pkg>`, which records it under `allowScripts` in `package.json`.
- **`dependencies` holds only what the server needs at runtime.** Everything Vite bundles into the client is a `devDependency`, which keeps the image small.
- Keep dependencies few, and prefer `node:` built-ins.

## Coding standards

**Aggressive minimalism.** Every line has to earn its place. Put brevity and simplicity first, and readability second. Before adding code, look for a line you can delete instead.

### Structure

- **Services hold the substance, routes stay thin, and flows read like pseudocode.** Each external system or domain boundary gets one file under `services/`, which owns its raw shapes and maps them to domain types, so callers never see raw API shapes. A route handler checks its input, calls services, and returns JSON. Anything that deletes files or calls an Arr's write API belongs in a service or the worker flow, never inline in a route.
- **Routes:** one handler per file in `routes/<module>/`, built with `HttpService.handlers(...)` and re-exported from the module's `index.ts`. Every route is added to the single chain in `app.ts`. Routes registered outside that chain lose their types in the client.
- **Errors:** throw `HTTPException` with a status and a message a user can read. `app.ts` turns every error into `{ error }` JSON, and the client's `ApiService.unwrap` throws that message. Input is checked with `HttpService.valid(target, schema)`, so a failed check gives the same shape.
- **Client data:** each resource's service exports `queryOptions` factories (the key lives inside them) and `use*` composables. Pages never call the API directly. Never cast an API response with `as`: if the type is wrong, fix it on the server.
- **Modules, not classes.** Services export plain functions. Process-wide state (the database) is a module-level `let` that one function sets (`DbService.open`).
- **An `index.ts` is always a barrel**, except `src/server/index.ts`, the entrypoint.

### Naming and imports

- **Relative imports everywhere, with the `.ts` extension.**
- **Namespace imports for modules in a role folder**, suffixed by the folder: `import * as ArrService from "./services/arr.ts"`, `* as ArrRoutes`, `* as ArrSchema`. Vue components are default imports with the same rule: `import ArrFormComponent from "../components/arr-form.vue"`. Wiring files at a folder root (`app.ts`, `router.ts`) use named imports. Third-party imports stay named and idiomatic. Type-only imports stay named.
- **Single-word identifiers where possible.** Nouns for values, verbs for functions. The namespace carries the context: `PathsService.map`, not `mapArrPath`; `MoviesService.useList`, not `useMovies`. Config keys, database columns and Arr fields keep their external names.
- **`use` is reserved for Vue composables**, whose result is destructured: `const { data, error } = MoviesService.useList()`.
- **kebab-case file names, without the role in the name.** Write `services/arr.ts`, not `arr.service.ts`. The folder carries the role.

### Comments

Comments are written for someone who can't code but knows the domain (see the [Glossary](#glossary)). The test: delete the code and keep only the comments, and a non-coder should still be able to say what the file does, step by step, and why.

**Where each kind of information lives:**

| Information                                 | Lives in                                          |
| ------------------------------------------- | ------------------------------------------------- |
| What a file is responsible for              | File header, 1–3 lines (see below)                |
| What a function does, and why it matters    | Docblock                                          |
| The steps inside a function                 | Inline `//` comments, one per step                |
| Which safety rule a line enforces           | `// Safety:` comment naming the rule              |
| Architecture, invariants, rules, glossary   | AGENTS.md (comments link to rules, never restate) |
| Installing, configuring, running            | README.md                                         |
| History ("we used to…", "changed because…") | Commits and PRs, never comments                   |
| Future work and known gaps                  | GitHub issues, never `TODO` comments              |

**File headers** go in every file, except barrels and files with a single export (a route handler, a Vue component), where the export's docblock does the job.

**Docblocks:**

1. Required on every exported function, route handler, composable, schema, and Vue component (at the top of `<script setup>`).
2. Private helpers need one only if a reader following the caller would get lost without it. Otherwise the name carries the meaning.
3. Say what it does in plain words, then why it matters or what it protects against. Say what happens to the user's files or library where relevant.
4. Never restate the signature, name types, describe syntax ("maps over", "returns a Promise"), or use `@param`/`@returns`.
5. Always multi-line, and at most about four lines. Needing more means the function does too much, or the extra belongs in AGENTS.md.

**Inline comments:**

1. Any function with more than one step gets one `//` per step, so the comments read like a recipe.
2. Required without exception in the worker flow, `files`, `paths`, and anything that deletes, writes to disk, or calls an Arr.
3. Plain language about intent: `// Copy the real file next to the link under a hidden name`, not `// copyFile to partial`.
4. In templates, comment only a section whose purpose isn't obvious, never every element.

**A comment that no longer matches its code is a bug.** Change them together.

### TypeScript and tooling

- Server code uses only erasable syntax (no `enum`, `namespace`, or parameter properties), which `erasableSyntaxOnly` enforces, because Node strips types rather than compiling them.
- **Prettier only** (with the Tailwind plugin for class order), no ESLint. Run `npm run format` before committing.
- **Wrap comments at 120 columns yourself**, filling each line, because Prettier never rewraps comments. This applies to docblocks, `//` and `#` comments, including in `dev/compose.yml` and the Dockerfile.

## House rules

- **The database only changes through migrations** in [services/db.ts](src/server/services/db.ts). They run in order at startup, each in a transaction, tracked by `PRAGMA user_version`, after a backup (`tetharr.db.v<N>.bak`, newest three kept). Tetharr refuses to open a database a newer version has migrated. Migrations only move forward. **Until the first tagged release, existing migrations may be edited (then `npm run dev:reset`). After it, they are frozen and changes go in a new migration.** Settings live in a key/value table with defaults in [schemas/settings.ts](src/schemas/settings.ts), so adding a setting never needs a migration.
- **A table and the row type in the service that queries it change together.** Zod schemas in `src/schemas/` validate what the API accepts.
- **Losing the database is safe by design.** It only means Tetharr forgets which copies it made, so it won't delete them. The worst case is files left behind, never files deleted. Keep it that way.
- **Log decisions with the fields needed to understand them** (arr, title, paths). Logs are JSON lines.
- Windows is unsupported.

## Commits

Use conventional commits of the form `type(#N): description`. The type is `wip` unless there's a reason otherwise, the scope is the issue number, and the description is short, lowercase, and unpunctuated.
