# Home Hub

Home Hub is my server, to do what I want with, and to have futuristic things built on it that can help me do what I want: a cool program that knows stuff and can help me out.

## Why I built it
I built it to learn, to help me do more coding stuff, and because it was cool as shit.

## How I built it
I built it using my own ideas, with AI helping me plan and learn what I needed to do to make it. I made all the decisions and made each commit myself.

## How the parts fit
- Everything runs on one Ubuntu server, from one compose file: `docker-compose.yaml`.
- Caddy is the front door. Each service has a `.home` name, and AdGuard Home answers DNS on the home network, which is how those names reach Caddy.
- `hub.home` and `api.home` also answer over HTTPS, using Caddy's own certificate authority. Only devices that have installed Caddy's root certificate trust it, so plain HTTP still works everywhere.
- Nothing is open to the internet. Away from home, everything goes through Tailscale.
- The API (`api/`) is the centre: one module per capability, and every route except logging in needs a token. It reads from qBittorrent and Jellyfin, watches the server's Wi-Fi reconnect log, and can count and add notes in the brain's inbox.
- Every 5 minutes the API checks for problems (low disk or memory, Wi-Fi reconnects, a failed backup) and sends any change to my phone through ntfy. It also pings Healthchecks.io, which tells me if the server goes quiet, and sends a daily summary at 08:00.
- The phone page (`hub/`, at `hub.home`) is plain JavaScript served by Caddy, which passes `/api/*` on to the API.
- Claude Code reaches the API through an MCP server (`mcp/`), a throwaway container started for each session. Its tools read from the API; the three that change things (start a library scan, stop or start a download) always ask first.
- The brain is a separate private repo of notes, `hub-memory`. Its `inbox/` folder is mounted into the API.
- Anything that runs outside Docker lives in `host/`. The main ones are the Wi-Fi watchdog, a systemd timer that reconnects the Wi-Fi when the router stops answering, and the backup.
- Backups use restic. `host/backup.sh` backs up this folder, the brain and Claude Code's settings, stopping the apps that keep databases while it copies them. A systemd timer runs it every night at 03:30, but it stays off until there's a backup drive. Each run's result shows on the phone page, in the daily summary and at `GET /system/backup`, and can ping its own Healthchecks.io check. `docs/restore.md` explains how to get files back.

## Services
| Address | Service | What it's for |
|---|---|---|
| `hub.home` | the phone page | alerts, downloads, library, Wi-Fi, brain, server, backups and switches |
| `api.home` | the API | everything the phone page and Claude Code use |
| `home.home` | Homepage | a dashboard of everything |
| `dns.home` | AdGuard Home | DNS and ad blocking |
| `uptime.home` | Uptime Kuma | uptime checks |
| `metrics.home` | Beszel | server metrics, with `beszel-agent` |
| `jellyfin.home` | Jellyfin | the media server |
| `requests.home` | Seerr | requests for films and shows |
| `sonarr.home`, `radarr.home` | Sonarr, Radarr | TV and films |
| `prowlarr.home` | Prowlarr | indexers, with Byparr |
| `qbit.home` | qBittorrent | downloads |

## Switches
New features are built switched off. Each switch is a line in `api/.env` set to exactly `on` or `off`. Anything else, or a missing switch, stops the API starting, so a typo can't quietly change what's on. `GET /system/features`, the phone page and the daily summary all show what's off. The MCP server has one switch of its own, `MCP_ACTIONS`, which `bash host/hub-mcp.sh read-only` turns off. Jobs that run on the server itself, like the nightly backup, are switched on and off by enabling or disabling their systemd timer.

## Folders
- `api/`: the API. Fastify and TypeScript on Node 26, one module per folder in `src/modules/`, with each module's tests beside its code.
- `hub/`: the phone page.
- `mcp/`: the MCP server for Claude Code. Same setup as `api/`.
- `host/`: files that run outside Docker (the Wi-Fi watchdog, and the backup script with its service and timer), plus helper scripts: `hub-update.sh` pulls and rebuilds only what changed, `hub-mcp.sh` starts the MCP server, and `hub-get.sh` and `hub-post.sh` try an API route.
- `caddy/`: the Caddyfile.
- `homepage/config/`: Homepage's settings. Logins and keys come from `homepage/.env`.
- `docs/`: `restore.md` (getting files back from a backup), `going-private.md` (what to do if this repo goes private) and `decisions/` (why things are the way they are, one record per decision).
- `.github/`: tests and safety checks on every push, and Dependabot.
- `CLAUDE.md`, `.mcp.json` and `.claude/settings.json`: how Claude Code works in this repo.

## Running it
Secrets live in `.env` files that git ignores (`api/.env`, `homepage/.env` and `beszel/.env`), so they're never in this repo. The API also expects the brain's inbox at `../hub-memory/inbox`, and won't start without it. The backup's settings and password live in `/etc/home-hub/`, outside this folder and readable only by root.
- Start everything: `docker compose up -d`
- Rebuild the API after a change: `docker compose up --build --wait api`
- Pull from GitHub and rebuild only what changed: `bash host/hub-update.sh`, or `bash host/hub-update.sh --dry-run` to see what it would do

## Tests
Node isn't installed on the server, so npm runs in a throwaway container. From this folder:
```
docker run --rm -u node -v "$PWD/api:/app" -w /app node:26-alpine npm ci
docker run --rm -u node -v "$PWD/api:/app" -w /app node:26-alpine npm test
```
For the MCP server, use `$PWD/mcp` instead. GitHub runs both test suites on every push, alongside a secret scan of the whole history.