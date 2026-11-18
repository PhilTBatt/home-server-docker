# 0007. Jarvis runs in his own container, started when I want to talk to him

- Date: 2026-11-17
- Status: accepted, with `host/hub-update.sh` now updating his packages, his network narrowed by 0013, and his own image and devices for sound in 0014

## Context
Jarvis was started with a long `docker run` line typed by hand. He's meant to become the main way to talk to the server: by text first, later out loud in the room. A decision was needed on where his program lives and how it starts, and on whether the phone page needs a way to reach him yet.

## Options considered
- A systemd service on the host: not chosen. It would start at boot and restart after a crash, but it needs Node installed on the host, and Node stays in containers here.
- A compose service that's always running (`restart: unless-stopped`): not chosen yet. A text chat needs someone at the keyboard, so there's nothing for him to do between chats. It makes sense once he listens for his name.
- Inside the API's container: not chosen, for the reasons in 0004. It would put AI code and its SDK inside the API, next to the API's secrets.
- A box on hub.home that reaches him through the API: not now. I talk to him in a terminal, at the server or over Tailscale, and later out loud. The phone page can come later.
- A compose service in its own `jarvis` profile, started with `docker compose run --rm jarvis`: chosen.

## Decision
Jarvis is the `jarvis` service in `docker-compose.yaml`, in the `jarvis` profile. He runs on `node:26-alpine`, the same image his tests use, as the image's `node` user, with `jarvis/` mounted at `/app` and `~/hub-memory` mounted read-only at `/brain`. A chat starts with `docker compose run --rm jarvis`.

## Confidence and the case against
High (Claude's estimate). The case against: when he gets ears and a mouth, the container will need the sound device passed in explicitly (`/dev/snd` and the audio group), where a host service would only need the right group. And running on demand means every chat waits for a TypeScript build and the engine's start-up first.

## Consequences
- Nothing listens on the network and no port is published, so nothing new is exposed on the LAN or tailnet.
- `docker compose up` never starts him. There's no image to build, because he runs from the stock image with his packages in `jarvis/node_modules`. So `bash host/hub-update.sh` doesn't update those packages: after `jarvis/package-lock.json` changes, run `npm ci` for `jarvis/` by hand, then the engine check.
- He joins the compose network, so he can reach the API by name (`api:3000`) when he gets the hub's tools. He has no API token, so for now every route apart from the login refuses him.
- On that network he can also reach the other services by name, without going through Caddy, including ones with no login of their own, like Byparr. Neither engine has a network tool, so nothing can use that today. If he ever gets one, he should get his own network first.
- If `~/hub-memory` is missing, the chat won't start, rather than Docker making an empty folder in its place.
- `docker compose config jarvis` and `docker compose --profile jarvis config` would print the API key from `jarvis/.env`, like the other secrets.
- He uses memory only while a chat is open: about 200 MB on the Agent SDK engine (the speed test's highest reading), less on the plain engine, and nothing between chats.
