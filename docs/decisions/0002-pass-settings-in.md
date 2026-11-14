# 0002. Read settings once and pass them in

- Date: 2026-11-14
- Status: accepted

## Context
The API's settings live in `api/.env`: the API token, two service keys, the ntfy topic and the Healthchecks ping address, with on/off switches coming next. Three files each read `process.env` when they loaded and checked their own settings, so missing settings were reported one at a time, one restart after another. Tests had to set `process.env` before loading a file, which fixed the settings for that whole test file. The coming switches need tests with a feature both on and off.

## Options considered
- Each file reads `process.env` itself: not chosen. The checks are spread around, problems are reported one at a time, and a test file can only try one set of settings.
- A shared `config` object that files import: not chosen. It's simpler to read and common in Node apps, and a test can still try both states of a switch by changing the shared object and putting it back afterwards. But every test file would have to fill in every setting before loading anything, and a forgotten reset would leak into later tests.
- Read once in `server.ts` and pass the settings in: chosen.

## Decision
`server.ts` calls `readConfig(process.env)` once. `buildApp` receives the result and gives each module only the settings it needs, through Fastify's plugin options.

## Confidence and the case against
Fairly confident (Claude's estimate at the time: about 70%). The case against: it was the bigger change, it touched most of the API's files, and nothing needed different settings per test yet, so it was paid for ahead of the switches.

## Consequences
- Tests pass settings in directly: no `process.env`, no `await import`, nothing to reset.
- Each module's type says which settings it uses.
- A missing setting stops start-up with one error naming everything that's missing, by name only.
- Adding a setting means adding it to `config.ts` and passing it through `buildApp` to the module that uses it.
- The config object holds every secret, so it must never be logged.
- `isAuthorized` takes the expected token as an argument and refuses everything if that token is empty, so the lock fails shut.