# 0018. The search list is a git-ignored file, read before every check

- Date: 2026-11-18
- Status: proposed

## Context
The watcher needs a list of searches, each with its own switch. This repo is public, and the list says what I'm shopping for and what I'll pay. The other switches live in `api/.env`, where a bad value stops the API starting.

## Options considered
- A JSON file in a git-ignored `deals/` folder, mounted into the API: chosen. It's structured, edited in VS Code like everything else, backed up with the rest of `~/docker`, and never reaches GitHub.
- Lines in `api/.env`: not chosen. A list of searches with a dozen settings each doesn't fit one line per value.
- A tracked file in the repo: not chosen, because the repo is public.
- Routes to add and change searches from the phone page: not built yet. It would mean the API writing a file I also edit by hand, and a form to build. A later step if editing the file gets tedious.

## Decision
`deals/searches.json`, with a tracked example at `api/src/modules/deals/searches.example.json`. Every search has a `switch` that must be written out as `on` or `off`. The file is read again before every check, so an edit needs no restart. Unknown setting names are refused, so a typo can't drop a price limit. Unlike `api/.env`, a broken list doesn't stop the API starting: the watcher checks nothing, and the problem goes out as an alert naming the search and the setting.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- It's a second place for switches, with a different rule from `api/.env` for what a mistake does.
- A broken list pauses every search, not just the broken one, until it's fixed.
- JSON has no comments, so a search can't carry a note about why it's there.

## Consequences
- A typo in the list can never take down the alerts, the heartbeat or the rest of the API.
- Changing what a search matches starts that search fresh, with one "now watching" message.
- The folder has to exist before the API starts, which the tracked `deals/README.md` takes care of.
