# 0003. Every feature switch must be written out

- Date: 2026-11-14
- Status: accepted

## Context
Features are turned on and off with lines in `api/.env`: `ALERTS`, `HEARTBEAT` and `DAILY_SUMMARY` so far, with more to come, each arriving switched off. A decision was needed on what the API does when a switch line is missing, and on what counts as a valid value.

## Options considered
- A missing switch means off: not chosen. A new feature would arrive switched off with no edit, but a deleted line or a typo like `HEARTBAET=on` would quietly turn a feature off, and nothing would say so.
- Each feature has its own default, today's features on and new ones off: not chosen. Two kinds of default to remember.
- A missing switch stops the API from starting: chosen.

## Decision
Every switch must be in `api/.env` as exactly `on` or `off`. A missing switch, or any other value such as `yes`, `On` or `on ` with a space, stops start-up with one error naming it. The `.env` should always be complete anyway, and a loud failure at start-up beats a feature going quiet. A feature's own settings (`NTFY_TOPIC`, `HEALTHCHECK_URL`) are only required while that feature is on. The API token and service keys have no switch and are always required.

## Confidence and the case against
Fairly confident (Claude's estimate at the time: about 65%). The case against: every new feature's step has to include adding its line, and forgetting it leaves the API down after the next rebuild until the line is added. That failure is loud and immediate, though: the rebuild reports it straight away.

## Consequences
- `api/.env` is always a complete list of what's on and off.
- A typo or a deleted line is caught at start-up instead of silently turning a feature off.
- Adding a feature means adding its switch to `config.ts`, and its line (usually `=off`) to `api/.env` before rebuilding.
- The API logs its switches once at start-up.