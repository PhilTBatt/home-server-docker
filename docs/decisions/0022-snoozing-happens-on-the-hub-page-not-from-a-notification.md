# 0022. Snoozing happens on the hub page, not from a notification

- Date: 2026-11-19
- Status: proposed

## Context
A noisy search should be quick to mute from the phone. ntfy can put a button on a notification that sends a request when tapped, which would make it one tap.

## Options considered
- A button on each notification that calls the API: not chosen. The link would sit in an ntfy topic that anyone who guesses the name can read, the route behind it would have to work without the API token, and it would name the server's address. Signing the link limits the damage, but it's a new way in for a small convenience.
- A Snooze button on the hub page, through a route behind the token like every other: chosen.
- Switching a search off by rewriting `searches.json` from the API: not chosen. That file is mine to edit, and a route that writes it is far more than snoozing needs.

## Decision
- `POST /deals/searches/<id>/snooze` (for a number of hours, or until woken) and `/wake`, behind the token.
- The hub page shows Snooze for a day, or Wake, beside each switched-on search.
- Snoozes are kept in the state file. They're the watcher's own notes, not eBay's data.
- A snoozed search isn't sent to eBay at all, even by Check now.

## Confidence and the case against
Confident (Claude's estimate). The case against:
- Two taps and a page load, where a notification button would be one.
- When a long snooze ends, everything that appeared meanwhile arrives at once, capped by the usual limits.

## Consequences
- Nothing in a notification can change anything on the server.
- No new route works without the token.
