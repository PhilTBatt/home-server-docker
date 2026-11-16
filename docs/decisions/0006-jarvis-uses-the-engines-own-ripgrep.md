# 0006. Jarvis searches with the Agent SDK engine's own ripgrep

- Date: 2026-11-16
- Status: accepted

## Context
Jarvis's Agent SDK engine searches the brain with Claude Code's Grep and Glob tools, which run ripgrep. Claude Code's setup docs say Alpine (musl) needs ripgrep installed at runtime, with `USE_BUILTIN_RIPGREP=0`, and Jarvis runs in `node:26-alpine`, which doesn't include it. A decision was needed on where ripgrep comes from. The plain API engine isn't affected: its `search_files` and `find_files` are Jarvis's own code.

## Options considered
- The engine's built-in copy: chosen. On Alpine the SDK installs a musl build of its engine, and the engine carries its own ripgrep (14.1.1 in the glibc build of SDK 0.3.325; the musl build's version wasn't checked). The engine check passed all 16 checks in `node:26-alpine` with no ripgrep installed, including both searches inside the brain.
- Install ripgrep as the docs say: not chosen for now, kept as the fallback. It adds a package and an image to build, for something that already works. How to switch to it:
  - Add `jarvis/Dockerfile` with three lines: `FROM node:26-alpine`, `RUN apk add --no-cache ripgrep` and `ENV USE_BUILTIN_RIPGREP=0`. The setting goes in the image, not in `settings.json` as the docs show, because Jarvis loads no settings files (`settingSources: []`).
  - Add `jarvis/.dockerignore` containing `*`, so no files (`.env` included) go into the build.
  - Build it with `docker build -t home-hub-jarvis jarvis`.
  - Run everything that starts the SDK engine (the chat, the speed test and the engine check) from `home-hub-jarvis` instead of `node:26-alpine`.
  - Check that `docker run --rm home-hub-jarvis rg --version` prints a version. If `rg` is missing, the engine quietly falls back to its built-in copy.
- Jarvis's own search tools for the SDK engine instead of Grep and Glob: not chosen. More code, and the SDK engine would stop being Claude Code as it ships, which is half of the comparison between the engines.

## Decision
The SDK engine uses its built-in ripgrep. Nothing is installed.

## Confidence and the case against
About 75% (Claude's estimate at the time). The case against: the docs are Anthropic's promise and the engine check isn't. An SDK update could change the built-in copy and break search on Alpine. CI runs the engine check on Ubuntu (glibc), so it can't see a musl-only break, and if the runner has its own `rg`, the engine may use that instead of the built-in copy. Following the docs would remove that risk.

## Consequences
- After any SDK update, run `docker run --rm -u node -v "$PWD/jarvis:/app" -w /app node:26-alpine npm run engine-check` from the repo folder on the server (with `home-hub-jarvis` in place of `node:26-alpine` if the fallback is in use). If the searches inside the brain fail, switch to the fallback above.
- Grep searches hidden files but skips files the brain's git ignore rules list (on this date, only `.claude/settings.local.json`). Glob and the plain engine's tools still see them.
- Grep takes regular expressions and matches case unless asked not to (`-i`); `search_files` takes plain words and ignores case. These differences are expected, and `compare` can show whether they matter.
- No new package or image, and no standing RAM: a search runs only while it's needed.
