# 0070. A scheduler for timers, reminders and timed mode switches

- Date: 2026-11-27
- Status: accepted

## Context
I want timers and reminders I can set by voice or from Claude, that reach me both spoken (so I can answer Jarvis after) and on my phone, with repeats. The modes (record 0068) also need switching at times I set. Something has to keep them across restarts and send them at the right time, and it has to be the hub, since Jarvis isn't always running.

## Options considered
Chosen 27 Nov (mine): timers and reminders both spoken and on my phone, repeats allowed.

Where they live (Claude's pick): in the hub, one JSON file the API writes, checked by the API. Lost: the phone's own reminders app, which can't speak through Jarvis or switch the hub's mode; and systemd timers on the host, which would need a new way for the API to make host timers.

How Jarvis hears them (Claude's pick): a feed he polls, `GET /reminders/due?after=<seq>`, like the train changes feed. A plain poll, not a long poll: it answers at once, which is simpler to test and to reason about, and the feed's numbers are saved so they never go backwards after a restart. Lost: a long poll, which would wake him a few seconds sooner, at the cost of holding a request open on the API all the time.

Claude's picks, not discussed:
- A new switch, `REMINDERS`, off by default and written out like the others, needing `NTFY_TOPIC` while it's on.
- Kept in `api/data/reminders.json` (record 0068's folder), readable only by the API's user, through a temporary file and a rename. An unreadable file is moved aside to `reminders.json.bad` rather than overwritten, since it holds things I asked for.
- `POST /reminders` (`text` 1 to 200 characters of plain text, `at` in the future and at most a year ahead, `repeat` null, daily, weekdays or weekly, `urgent`, `kind` reminder or mode, `mode`), `GET /reminders`, `DELETE /reminders/<id>`, `POST /reminders/<id>/snooze` (1 to 240 minutes) and `POST /reminders/<id>/done`, behind the hub's token, at most 50 at once, bodies over 1 KB refused, unknown fields refused. Only `text` and `at` are needed; the rest default to once, not urgent, a reminder.
- Repeats follow London's clock, so a daily 08:00 stays at 08:00 when the clocks change. One missed several times while the API was down goes off once, marked late, then at its next time.
- Late means over 2 minutes after its time; the notification says when it was due and that the hub was down.
- A one-off stays in the list for a day after it goes off, so "snooze that" still works after it has gone off, then goes by itself. Done removes a one-off, or drops a repeating one's snooze.
- When one is due: ntfy titled "Reminder" with its text and the alarm clock tag; urgent ones are priority 4 and marked urgent, so bedtime lets them through (record 0068). The feed gets it whether or not ntfy took it; a send ntfy doesn't take is tried at every check for an hour, then dropped and logged.
- Timed mode switches call the modes module's own `scheduled`, so they're skipped while away or in guest mode (guest mode is only ended by typing or the phone page). One more than 30 minutes late is skipped, since a mode belongs to its time. They send nothing, aren't in the feed, can't be urgent or snoozed, and need `MODES=on`.
- The check runs every 5 seconds, so a timer is at most about 5 seconds late.
- The feed keeps a day, at most 50, and the route logs at warnings only, so polling doesn't fill the log.
- Logs hold ids, kinds, times and counts, never what a reminder says.
- Claude Code gets `get_reminders`, allowed without asking, and `set_reminder`, `cancel_reminder` and `snooze_reminder`, which ask every time like the other MCP actions and are left out by `bash host/hub-mcp.sh read-only`. `done` isn't a tool: it's for Jarvis's own code after he speaks one.
- Jarvis: setting or snoozing a reminder doesn't need my yes, as the batch spec says, since they can be undone. They're in a list of their own, `hubNoYesTools` in `jarvis/src/hub-tools.ts`, allowed only with `JARVIS_HUB_ACTIONS=on` (the MCP server only offers them then), and never asked about, on both engines (the Agent SDK engine allows them by name in `agent.ts`). Cancelling one through a tool asks for my yes like the other actions, because a cancelled reminder is gone; "cancel it" straight after one is said is his own code's and needs none. The MCP `set_reminder` can't set a timed mode switch: Jarvis's own code does that from what I say, so text Claude reads (a look-up, a song name, a commit message) can't schedule bedtime or away without me. Both are Claude's changes after the review.

Jarvis's side (Claude's picks, not discussed):
- His setting is `JARVIS_REMINDERS`, `off` or `on`, needing `JARVIS_HUB_TOOLS=on`. He polls the feed every 10 seconds, and nudges himself every 2 seconds while a reminder is waiting for him to be quiet.
- Reminders that were due before he started are skipped, except any from the last 2 minutes, so starting him doesn't read out a backlog. One the hub marks late says sorry for it.
- He says it as "Reminder: <text>." and then opens a follow-up window, as after a spoken answer, so I can answer him.
- For five minutes after, "snooze" (10 minutes), "snooze for 20 minutes", "remind me again in half an hour" (up to 4 hours), "done" and "cancel it", said or typed, go straight to the hub for that reminder, never to Claude. Anything else is asked as usual.
- Which modes he says them in is record 0068's table: not away, not in guest mode, and in bedtime only urgent ones. What isn't said is shown as a line; in guest mode, without its words.

## Decision
With `REMINDERS=on`, the hub keeps up to 50 reminders, timers and timed mode switches in `api/data/reminders.json`, checks them every 5 seconds, sends each due reminder to my phone and to a feed Jarvis polls, and switches the mode for timed mode switches unless I'm away or a guest is; Jarvis may set, snooze and cancel them without a yes.

## Confidence and the case against
Fairly confident in the rules (Claude's estimate): each is tested with a made-up clock and store, including the clocks changing and restarts. Less sure about the 30-minute cut-off for late mode switches and the day a fired reminder is kept, both guesses. The case against: a reminder's words are written to disk and sent through ntfy.sh, which a phone's own reminders app wouldn't do; letting Jarvis set reminders without asking means a misheard sentence can make one I didn't want (it's undoable, and the phone shows it); and two places now keep times (`BEDTIME_FROM` and timed mode switches), which could disagree.

## Consequences
- `REMINDERS` is a new switch in `api/.env`, so the API won't start without it.
- Three new MCP actions; `.claude/settings.json` allows `get_reminders` and asks for the three.
- Jarvis has a third kind of hub tool: allowed with the actions on, without a yes.
