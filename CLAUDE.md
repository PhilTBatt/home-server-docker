# Home Hub

My home server and everything that plugs into it. This repo (`~/docker`) is the source of truth: one compose file runs everything, and edits happen here on the server.

## Setup
- Ubuntu Server 26.04 on a repurposed laptop: 8 GB RAM, 192.168.0.200, hostname `home-server`, user `phil`. Wi-Fi only.
- Caddy serves `.home` hostnames over plain HTTP. AdGuard does DNS. Tailscale for remote access (no port forwarding possible).
- `api/`: my Fastify + TypeScript API (Node 26, ESM, compiled with `tsc`). One module per folder in `api/src/modules/<name>/routes.ts`. Every route except `POST /auth/login` needs `API_TOKEN` as a Bearer header or the `hub_token` cookie.
- `hub/`: the phone page at `hub.home`. Plain JS with `// @ts-check` and JSDoc types, served by Caddy; `/api/*` is proxied to the API.
- `host/`: files that run outside Docker (Wi-Fi watchdog, Docker's daemon.json). These are sources; live copies are put in place with `sudo install`.

## Commands (from ~/docker)
- Rebuild the API: `docker compose up --build --wait api`
- API logs: `docker compose logs --tail 20 api`
- npm (Node isn't installed on the host): `docker run --rm -u node -v "$PWD/api:/app" -w /app node:26-alpine npm <command>`

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
Self-hosted AI, Home Assistant, photo/file storage, a password manager, replacing Spotify, a self-hosted PaaS. Don't suggest them unless I bring them up.