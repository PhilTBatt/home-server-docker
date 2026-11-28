# 0093. An events feed, with today's history and an audience for each event

- Date: 2026-11-28
- Status: accepted

## Context
Each part of the hub keeps its own list of what happened: reminders have a due feed, sessions a change feed, train alerts a change feed, and Jarvis polls each one. The wall and the phone app each read their own. "What happened today?" (a kept wall page) needs one place that knows, and more readers are coming (the wall's pages, a Stream Deck). A shared feed also makes it easier to show something to the wrong reader, because every reader would have to filter for itself.

## Options considered
Chosen by Phil, 28 Nov:
- **A feed, plus today's history saved**, so "What happened today" survives a restart.
- **Built alongside what exists.** Nothing is removed. The hub's parts post to the feed too, and readers move over to it one at a time.
- **Each event says who may see it.**
- **Readers: Jarvis, the phone app and the wall.**

Not chosen: a feed in memory only; a plan only; a broker container (MQTT or Redis), which would mean a new container and its memory, on a server already using swap.

Claude's picks, not discussed:
- **Three audiences, set per kind in one table, not by each part:**
  - `room`: anyone at a screen, guests included.
  - `home`: the household's own screens, which the wall shows only while the hub's mode is known and isn't guest.
  - `owner`: only the hub's token.

  The hub decides what each reader gets (the hub's token gets everything; the wall's gets `room`, or `home` outside guest mode). So no reader filters for itself, which answers the case against from 27 Nov. `?for=` can narrow a reader and never widen it.
- **No one's words in an event.** Each kind's details are checked against a fixed shape: short lowercase words, small counts and yes or no only. Titles are the hub's own words, made from the details. A reminder's event is its id, never its text; trains are a count, never which. The file and the logs then hold nothing more than the logs already do.
- **The first kinds:**

  | Kind | Audience |
  |---|---|
  | the API starting | home |
  | a mode switch | room |
  | a reminder going off | home |
  | train changes | home |
  | the phone being rung | room |
  | a Claude Code session waiting | owner |
  | a screen pairing | owner |
  | the projector switched by a key the hub sent | room |

  Jarvis posting his own events (a look-up, an answer) is left for later.
- **History:** one file per London day, mode 600, in `api/data/events/`. Earlier days' files are removed with the first event or read after midnight (or at the next start). At most 5,000 events a day. Events posted while the API is starting, before today's file is read, are held and kept after the saved ones, so none is lost or numbered twice.
- **Numbering:** each event's number starts from its day's own (the day's number times a million). So a reader's number from another day, or from before a restart, is always told apart, with no state file.
- **Routes:**
  - `GET /events/today`;
  - the long poll `GET /events/feed?after=`, the same way the wall's `GET /wall/jarvis` works.

  Both are in `wallReads`.
- **Readers:**
  - the hub app gets a Today card on its Home tab;
  - Claude Code and Jarvis get a read-only `get_events` tool;
  - the wall reads it once the "What happened today" page is built.

## Decision
With `EVENTS=on`, the hub keeps one feed of what happened today, saved through restarts. Its own parts post to it alongside what they already do. Each event carries an audience the hub enforces for every reader.

## Confidence and the case against
Moderate to high. It's small, and nothing that existed changes behaviour.

The case against:
- Two records of the same thing now exist side by side until readers move over, and they could drift.
- A shared feed is one more place a careless new kind could leak something to the wall. The audience table and the fact shapes are the guard, and the tests pin both.
- The wall's `home` audience depends on modes being on; with `MODES=off` a screen only ever sees `room` events.

## Consequences
- A new kind, or a kind given a wider audience, is security-sensitive and needs its own look.
- Moving a reader over (Jarvis's reminder or session feeds, the wall's pictures) is a later, separate change.
- Another device (a Stream Deck) can be a reader without each part learning about it.
