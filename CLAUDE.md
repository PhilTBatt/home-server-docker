# Home Hub

My home server and everything that plugs into it. This repo (`~/docker`) is the source of truth: one compose file runs everything, and edits happen here on the server.

## Setup
- Ubuntu Server 26.04 on a repurposed laptop: 8 GB RAM, 192.168.0.200, hostname `home-server`, user `phil`. Wi-Fi only.
- Caddy serves `.home` hostnames over plain HTTP. `hub.home` and `api.home` are also served over HTTPS by Caddy's own certificate authority (`tls internal`), trusted only on devices that installed its root certificate. AdGuard does DNS. Tailscale for remote access (no port forwarding possible).
- The server's own DNS goes through Tailscale: `/etc/resolv.conf` points at Tailscale's resolver (`100.100.100.100`), which forwards to AdGuard. Tailscale warns that it can't update that setup; ignore the warning. Never suggest `tailscale set --accept-dns=false`: on 15 Nov it broke every name lookup on the server and in the containers.
- `api/`: my Fastify + TypeScript API (Node 26, ESM, compiled with `tsc`). One module per folder in `api/src/modules/<name>/routes.ts`. Every route except `POST /auth/login` needs `API_TOKEN` as a Bearer header or the `hub_token` cookie. The cookie is HTTPS-only when the login came over HTTPS (`secure: "auto"`, with Fastify's `trustProxy` so it believes Caddy's `X-Forwarded-Proto`).
- `api/src/modules/notify/`: every 5 minutes the API checks for problems and sends any change to my phone through ntfy, pings Healthchecks.io so I hear when the server goes quiet, and at 08:00 London time sends a daily summary. `NTFY_TOPIC` and `HEALTHCHECK_URL` in `api/.env` are secrets: never print them.
- `api/src/modules/memory/`: hub-memory's `inbox/` is mounted at `/memory/inbox`. `GET /memory/inbox` counts the notes waiting, behind `MEMORY_INBOX`. `POST /memory/inbox` saves `{ title, text }` as a new note with a name the API makes, behind `MEMORY_UPLOAD`. It never reads, returns, overwrites or deletes a note.
- `hub/`: the phone page at `hub.home`. Plain JS with `// @ts-check` and JSDoc types, served by Caddy; `/api/*` is proxied to the API.
- `mcp/`: an MCP server that offers the API to Claude Code as tools: read-only ones for the GET routes, plus `scan_library`, `stop_download` and `start_download`, which must always ask before running. Same setup as `api/`. Runs as a throwaway container per session, started by `bash host/hub-mcp.sh`; `bash host/hub-mcp.sh read-only` leaves the three action tools out. It's in the compose `tools` profile, so `docker compose up` never starts or builds it. Registered for this repo in `.mcp.json` as `hub`.
- `jarvis/`: Jarvis, a text chat (voice later) that reads the brain, with two engines to compare: the Agent SDK and a plain API call. His settings and API key are in `jarvis/.env`. He runs on demand in the compose `jarvis` profile with `docker compose run --rm jarvis`, with `~/hub-memory` mounted read-only at `/brain`; it's an interactive chat that costs API credits, so only I start it. With `JARVIS_HUB_TOOLS=on` he's started by `bash host/jarvis.sh`, which passes in only `API_TOKEN` from `api/.env`, and he runs the MCP server from `mcp/dist` (mounted read-only at `/mcp`) in read-only mode for the hub's tools, unless `JARVIS_HUB_ACTIONS=on`, when his code asks me yes or no in the chat before each of the three actions. With `JARVIS_SESSION_NOTES=on` he also reads the `MEMORY.md` auto-memory notes of the docker and brain Claude Code sessions, which `host/jarvis.sh` mounts read-only at `/notes`, so what goes in those notes is shown to him.
- `host/`: files that run outside Docker (Wi-Fi watchdog, the backup script with its service and timer, Docker's daemon.json). These are sources; live copies are put in place with `sudo install`.
- `.github/workflows/safety.yaml`: on every push, Gitleaks scans the history for secrets, and while the repo is public `.github/scripts/personal-details.sh` checks the tracked files against the words in the `PERSONAL_WORDS` secret. It only ever prints file names, because the logs are public.

## Commands (from ~/docker)
- Rebuild the API: `docker compose up --build --wait api`
- Rebuild the MCP image: `docker compose build mcp`
- Update from GitHub: `bash host/hub-update.sh` pulls, then rebuilds only what changed, including Jarvis's copy of the MCP server, and his packages and engine check when `jarvis/package-lock.json` changes; `--dry-run` shows what it would do. `bash host/hub-update.test.sh` tests it. For a changed `host/` file it shows the change and asks before installing it with sudo; with no one there to answer, it installs nothing.
- Back up: `sudo home-hub-backup` (or `--dry-run`), installed from `host/backup.sh` with `sudo install host/backup.sh /usr/local/sbin/home-hub-backup`. It stops the apps that keep databases, backs up with restic, starts them again, then removes old backups, keeping 7 daily, 4 weekly and 6 monthly. Each real run writes its result to `/var/lib/home-hub/`, which the API shows at `GET /system/backup` and in the daily summary. If `HEALTHCHECK_URL` is set in the settings, each real run also pings that Healthchecks check with its exit code, so a missed or failed backup sends an alert. Its settings and password are in `/etc/home-hub/`, readable by root only. Never try to read them. The nightly timer, `home-hub-backup.timer`, is installed but stays off until there's somewhere to back up to.
- API logs: `docker compose logs --tail 20 api`
- npm (Node isn't installed on the host): `docker run --rm -u node -v "$PWD/api:/app" -w /app node:26-alpine npm <command>`. For the MCP server or Jarvis, mount `$PWD/mcp` or `$PWD/jarvis` instead.
- Read from the API: use the `hub` MCP tools (`get_status`, `get_alerts`, `get_features`, `get_downloads`, `get_library`, `get_wifi_reconnects`, `get_backup`). `scan_library`, `stop_download` and `start_download` change things, so they always ask first. `bash host/hub-get.sh <path>` is my own checking tool, and `bash host/hub-post.sh <path> [json]` its POST twin; that one changes things, so only run it when I ask.

## How to work with me
I'm building this to learn, and I want to be able to say truthfully that I built it.
- Explain the concept before the code or command, well enough that I could explain it to someone else.
- For Linux commands, explain each part, including flags and why sudo is or isn't needed.
- One decision or change at a time. End every step with "Done when": the exact command and what it should print.
- Give me individual changes (the file, where, the new code, and why), not whole-file replacements. Don't edit files yourself unless I ask; I make the changes.
- Match the conventions already in my files.
- Never add a container, package or dependency without asking first: why it's needed, whether it's maintained, roughly how much RAM it uses.
- Flag anything security-sensitive: exposing a service beyond the LAN or tailnet, the Docker socket, privileged containers, host networking.
- Tell me about gotchas when they come up, not after I hit them.
- I handle git. Don't commit. End each step with a one-line commit message.
- For decisions: give the options, why you discarded them, your confidence, and the strongest case against your answer.
- No comments in code files, ever. Keep only `#!/bin/bash`, `// @ts-check` and JSDoc type tags.
- You write the tests for any code change, thoroughly, and run them before you hand over.
- When I say "next", the previous step is done and committed.
- Build new things in place but switched off, with an easy way to turn them on and off.

## Accuracy
- Don't state an inference as fact; say when you're guessing. "I don't know" beats a confident wrong answer.
- When I paste output or an error, read what's actually there.
- For anything that changes over time (image tags, config options, docs), check the docs and give me links.

## Safety
- Secrets live in git-ignored `.env` files. Never read, print or copy them.
- Don't run `docker inspect`, `docker compose config` or `env`: they print secrets.
- You can't type sudo passwords, so give me sudo commands to run myself.
- Starboard and anything from work stays out of this repo.

## Ruled out for now
Self-hosted AI, Home Assistant, photo/file storage, replacing Spotify, a self-hosted PaaS. Don't suggest them unless I bring them up.

## Decision records
- When Phil makes a decision that would be costly to reverse, or that someone will later ask "why?" about, draft a record in `docs/decisions/` from `docs/decisions/template.md` with the next number. Phil reviews and commits it.