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

### Jarvis's settings
Lines in `jarvis/.env`. Jarvis prints the `JARVIS_` ones in one line when he starts.
- `ANTHROPIC_API_KEY`: required.
- `JARVIS_LOG`: `on` or `off`, required, like the API's switches. Logs each answer's numbers, never its words, for `npm run compare`.
- `JARVIS_ENGINE`: `sdk` (default) or `api`.
- `JARVIS_THINKING_HISTORY`: `keep` (default) or `drop`. Only the plain API engine uses it.
- `JARVIS_LENGTH_HINTS`: `note` (default) prints the chat-length note below; `jarvis` gives Jarvis the chat's size with each question once it's long, and leaves the suggestion to him. The log records which, so `npm run compare` can show how big chats got before you typed `new`. The size lines stay in a saved chat, so type `new` before switching this setting on a saved chat, or its answers mix the two.
- `JARVIS_LENGTH_WARN`: the chat size, in tokens, where the length warning starts. Default `80000`, 80% of Haiku 5.5's long-prompt line. Set it lower to hear sooner, or to suit another model.
- `JARVIS_LENGTH_CAP`: `off` (default), or a number of tokens above the warning. Once a chat's last request passes it, Jarvis says so, won't send more questions in that chat, and says to type `new`. A guard against long chats quietly costing more. A saved chat's size is kept with it, so the cap still holds after a restart: in the chat file on the plain API engine, and on the Agent SDK in `jarvis/data/chats/agent-sdk-size.json`, which only counts while the transcript it names is still the newest.
- `JARVIS_CHATS`: `fresh` (default) saves nothing; `resume` saves the chat in `jarvis/data/chats/` and picks it up next time.
  - Saved chats hold everything said, brain text included. Only their owner can read them, and backups copy them.
  - Every question sends the whole saved chat. On Haiku 5.5, a request over 100,000 tokens costs five times as much. Jarvis doesn't trim saved chats yet. The Agent SDK only summarises a chat when it nears its context limit (about 990,000 tokens in a test), so it pays the higher rate long before that.
  - When a chat reaches `JARVIS_LENGTH_WARN` (80,000 tokens unless set), Jarvis says once that it's getting long (once per start of Jarvis). Past 100,000, where Haiku 5.5's long-prompt price starts, he says so after every answer, with how to start a new one (unless `JARVIS_LENGTH_WARN` is set higher, when he waits for that). It goes by each answer's last request, and works in fresh chats too. With `JARVIS_LENGTH_HINTS=jarvis`, Jarvis is told the size instead and suggests a new chat himself.
  - Type `new` to start a new chat without leaving Jarvis. In a saved chat, the old one is moved to `jarvis/data/chats/old/` (private, the newest 10 per engine kept), Jarvis says exactly where, and it isn't carried on. To get it back, move it back by hand. A plain API chat brings its size back with it (if it was saved since sizes were kept); an Agent SDK one usually has no size known until its first answer. A leftover `*.saving` file is a save that was cut off, and is safe to delete.
  - Lines shaped like a command (a `/` then one word, like `/clear`) aren't sent to Jarvis, on either engine. The Agent SDK would otherwise run them as its own commands; `new` does that job on both. Paths like `/etc/hosts` go through as normal.
  - Run one Jarvis at a time on a saved chat: with two, one of them's questions won't be carried on.
  - The engines save differently: the Agent SDK also keeps questions that failed or were stopped, and the plain API engine keeps only answered ones. On the plain API engine, thinking is left out of the saved chat for good with `JARVIS_THINKING_HISTORY=drop`, or after a thinking restart.

## Folders
- `api/`: the API. Fastify and TypeScript on Node 26, one module per folder in `src/modules/`, with each module's tests beside its code.
- `hub/`: the phone page.
- `mcp/`: the MCP server for Claude Code. Same setup as `api/`.
- `jarvis/`: Jarvis, a text chat (voice later) that reads the brain, with two engines to compare: the Agent SDK and a plain API call. Its settings live in `jarvis/.env` (below), and `jarvis/data/` (git-ignored) holds the answer log and any saved chats.
- `host/`: files that run outside Docker (the Wi-Fi watchdog, and the backup script with its service and timer), plus helper scripts: `hub-update.sh` pulls and rebuilds only what changed, `hub-mcp.sh` starts the MCP server, and `hub-get.sh` and `hub-post.sh` try an API route.
- `caddy/`: the Caddyfile.
- `homepage/config/`: Homepage's settings. Logins and keys come from `homepage/.env`.
- `docs/`: `restore.md` (getting files back from a backup), `going-private.md` (what to do if this repo goes private) and `decisions/` (why things are the way they are, one record per decision).
- `.github/`: tests and safety checks on every push, and Dependabot.
- `CLAUDE.md`, `.mcp.json` and `.claude/settings.json`: how Claude Code works in this repo.

## Running it
Secrets live in `.env` files that git ignores (`api/.env`, `homepage/.env`, `beszel/.env` and `jarvis/.env`), so they're never in this repo. The API also expects the brain's inbox at `../hub-memory/inbox`, and won't start without it. The backup's settings and password live in `/etc/home-hub/`, outside this folder and readable only by root.
- Start everything: `docker compose up -d`
- Rebuild the API after a change: `docker compose up --build --wait api`
- Pull from GitHub and rebuild only what changed: `bash host/hub-update.sh`, or `bash host/hub-update.sh --dry-run` to see what it would do
- Talk to Jarvis: `docker compose run --rm jarvis`. He's in the `jarvis` profile, so `docker compose up` never starts him. Type `exit` or press Ctrl+C to stop, and `--rm` removes the container. He needs `jarvis/.env` and the brain at `../hub-memory` (mounted read-only), and won't start without them.

## Tests
Node isn't installed on the server, so npm runs in a throwaway container. From this folder:
```
docker run --rm -u node -v "$PWD/api:/app" -w /app node:26-alpine npm ci
docker run --rm -u node -v "$PWD/api:/app" -w /app node:26-alpine npm test
```
For the MCP server, use `$PWD/mcp` instead. GitHub runs both test suites on every push, alongside a secret scan of the whole history.