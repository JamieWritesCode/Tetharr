# Tetharr

Choose which Radarr and Sonarr titles live on local disk and which stream from usenet, from a web interface, without your media server noticing.

If your Arrs import symlinks into a usenet mount (NzbDav, AltMount and similar, mounted with rclone), you get an effectively unlimited library that takes almost no disk space. Sometimes you still want a title kept locally: the show you're watching right now, the kids' films, anything you'd hate to lose to a takedown. Tetharr swaps a title's symlinks for real copies at the same paths, and back again, so Plex/Jellyfin watch state and the Arrs' records never notice.

> **Status:** early, and so far used only by its author. Pinning and unpinning work for Radarr movies and Sonarr series and seasons. Try it on a few titles before trusting it with your whole library.
>
> **There is no login yet.** Anyone who can reach Tetharr can change what's pinned and read your Arrs' API keys. Only run it on a network you trust, and never expose it to the internet.

## Running

```yaml
services:
  tetharr:
    image: ghcr.io/jamiewritescode/tetharr:edge # the latest build of main, until the first release
    environment:
      - PUID=99 # the user and group your Arrs run as
      - PGID=100
    volumes:
      - ./config:/config
      - /mnt/user/media:/data:rw,rslave # rslave is required, see below
    ports:
      - 8787:8787
```

Tetharr runs as the user and group in `PUID` and `PGID` (default `99` and `100`, Unraid's `nobody:users`), so its copies are owned like the rest of your library and your Arrs and media server can manage them. Set them to whatever user your Arrs run as. `UMASK` (default `002`) sets the permissions of the files it creates. On start it takes ownership of `/config`, and never changes the ownership of your media.

Open `http://<host>:8787`, go to **Settings**, and add your Radarr. You'll find its API key in Radarr under Settings → General. **Test** checks the connection before you save.

### Path mappings

Radarr and Tetharr usually run in separate containers, so the same file can have a different path in each. If Radarr reports `/movies/Film (2020)/Film.mkv` and Tetharr sees that file at `/data/media/movies/Film (2020)/Film.mkv`, add a mapping from `/movies` to `/data/media/movies`. If the library shows files as **Missing**, a mapping is usually missing.

Your usenet mount must appear at the **same path** inside Tetharr as inside the Arrs (for example `/data/nzbdav` in both). The links the Arrs create point at that path, so Tetharr has to see the mount there to follow them and to copy from them.

### Mount propagation (read this)

The rclone mount usually appears _after_ containers start. Without `rslave` propagation (`slave` in Unraid's volume settings), Tetharr sees an empty folder where the mount should be, and every streamed file shows as **Unreachable**. Tetharr never acts on an unreachable file, but it can't do anything useful either.

## Development

Tetharr only ever sees symlinks, their targets, and the Arrs' APIs, so the whole thing runs on a laptop with no media stack. Keep it there. This tool is designed to delete files, and the machine it's developed on should hold nothing you'd miss.

You need Node 24.21 or later on the 24 line (`nvm use` reads `.nvmrc`) and Docker or Podman.

```sh
npm install
npm run dev
```

That one command starts real Radarr and Sonarr (on :7878 and :8989) and Tetharr's server in containers, fills in a fake library of five titles, connects everything, and opens the web interface on http://localhost:5173. The server restarts whenever you change the code. The first run needs internet, because the Arrs look up the fixture titles' details.

Your settings, including anything you change in the Arr or Tetharr UIs, stay between runs.

```sh
npm run dev:down             # stop the containers
npm run dev:outage           # take the fake mount away, like an rclone mount going down
npm run dev:restore          # bring it back
npm run dev:regrab Sintel    # put a title's symlinks back and have its Arr rescan, like a re-grab landing
npm run dev:reset            # wipe everything and start fresh next time
npm run typecheck
npm run format
```

Contributors: [AGENTS.md](AGENTS.md) has the architecture, safety rules and coding standards.

Windows is not supported.
