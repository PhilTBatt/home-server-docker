# 0068. The hub keeps a mode, and bedtime holds phone alerts

- Date: 2026-11-27
- Status: accepted

## Context
I want the hub to know what I'm doing, so Jarvis and the phone can behave to fit: guest, bedtime, gaming, coding and away, switched by voice or at times I set. Bedtime is the one that changes the hub itself: Jarvis stays silent and the hub holds phone alerts until morning, while urgent ones still get through. Bedtime "can be any time after 12" and I can set it by voice. "I'm not here" (away) skips everything until I say I'm back. Guest mode is switched on by voice or by typing `/guest`, but off only by typing `/guest off` or from the phone page, until voice ID can tell my voice. The phone page gets a guest mode button. This record covers both the hub's part (where the mode lives, how it's switched, and holding alerts) and Jarvis's (how he follows it and what he says in each).

## Options considered
Chosen 27 Nov (mine): the five modes; bedtime holds phone alerts until morning with urgent ones let through; bedtime by voice any time, or from a set time after midnight; away skips everything; guest off only typed or from the phone page; a guest button on the phone page.

Where the mode lives (Claude's pick): in the hub, as one JSON file the API writes, rather than in Jarvis. Jarvis isn't always running, the phone page and Claude Code need to see it too, and the alerts that bedtime holds are sent by the hub. Lost: keeping it in Jarvis's memory, which would forget it every chat.

Where alerts are held (Claude's pick, from the batch's spec): in the one function every ntfy message already goes through, `sendToNtfy`, through a gate that only `server.ts` sets and only with `MODES=on`. Lost: giving each sender (the alerts, the daily summary, the deal watcher, train alerts, expiry, watchers) a held version of its own, which would be six places to get right and a seventh to forget.

Claude's picks, not discussed:
- A new switch, `MODES`, off by default and written out like the others. It needs no other setting, not even `NTFY_TOPIC`, since it sends only what others would have sent.
- A new folder, `api/data/`, mounted into the API at `/data` and git-ignored except a README (so `git pull` makes it, and the mount never fails), for the API's own small files. The mode is `api/data/mode.json` (readable only by the API's user), written through a temporary file and a rename like `expiry/sent.json`. With `MODES` off nothing reads or writes it.
- `GET /mode` and `POST /mode`, behind the hub's token. `by` is `voice`, `typed`, `phone` or `owner` (my own voice, as Jarvis tells it from ears's voice ID, record 0072); `schedule` and `start` are the hub's own and can't be sent. Only away (up to 30 days ahead) and bedtime (up to 24 hours ahead) can have `until`, as the spec says; it must be in the future. Unknown fields are refused, as with watchers.
- The hub refuses to switch guest mode off by voice (409), rather than leaving it to Jarvis, so the rule holds for anything that asks.
- `BEDTIME_FROM` (off, or 00:00 to 05:59) and `BEDTIME_UNTIL` (before midday, later than `BEDTIME_FROM`), both London time and optional; `BEDTIME_UNTIL` is needed with `BEDTIME_FROM`. Bedtime switched on with no `until` ends at the next `BEDTIME_UNTIL`; with neither, it lasts until switched. Bad values stop the API even while `MODES` is off, like the deal watcher's choices.
- `BEDTIME_FROM` starts bedtime from normal, gaming or coding, never from guest (which only typing or the phone page may end) or away (timed switches are skipped while away). It starts once a night, remembered in the file, so switching it off by hand at 1am sticks, and a restart inside the window starts it unless it already started that night. It's the modes module's own 30-second check, not the scheduler's, so it works without `REMINDERS`.
- Urgent means exactly the batch's three: finding the phone, a train alert with a cancellation in it, and a reminder marked urgent (record 0070). Each carries `urgent: true`, which never reaches ntfy as a header. Everything else is held, including the daily summary and the alerts' all-clear.
- Held alerts stay in memory, never on disk: the deal watcher's alerts hold eBay listings, which must never be written down (records 0016 to 0022). Only their count is saved, so after a restart the next message says how many were lost.
- When bedtime ends, everything held goes as one message per topic (in practice one), "Held during bedtime: N alerts", each with its London time, title and words, cut at 3,500 bytes like the expiry warnings, then "And N more.". At most 100 are kept; the rest are counted. Default priority and the `zzz` tag. A send ntfy doesn't take is tried again every 30 seconds.
- Away holds nothing, as the spec says. Gaming, coding and guest hold nothing either: they're for Jarvis.
- Logs give the mode at start, every switch and refusal (from, to, how, until, the held count), each held alert's tags and priority (never its words or the topic), each held message sent (counts, bytes, times), failures and losses.
- The phone page shows the mode with "Guest on" or "Guest off" and a button for each other mode, all sent with `"by": "phone"`.
- Claude Code gets `get_mode`, allowed without asking. No tool changes the mode: it's switched by voice, typing or the phone page. Jarvis may read `get_mode` too.

Jarvis's side (Claude's picks, not discussed):
- His setting is `JARVIS_MODES`, `off` or `on`, needing `JARVIS_HUB_TOOLS=on`. He asks `GET /mode` every 5 seconds and follows it; a change he didn't make, from the phone page or the hub's own times, is shown as a line and never said aloud, so bedtime starting at 00:30 doesn't wake me.
- Mode words are matched in his own code, like the code words, on all of what I said or its last sentence, politely if I like: bedtime (and "I'm going to bed", "time for bed"), gaming mode, coding mode, normal mode (and "back to normal"), "I'm back" outside normal, and "good morning" or "I'm up" during bedtime. They never reach Claude. With `JARVIS_MODES` off they aren't mode words.
- "I'm not here" sets away at once with no end, then asks "When will you be back?" and takes whatever I say or type next as when. "I'm away until Sunday evening" does both at once. If he can't tell when, away stays on until I'm back.
- When is worked out by one small question to the chat model on Jarvis's API key, like the turn check: the time now in London and my words in, a London time within 60 days or unknown out, 4 seconds at most. Its prompt says never to follow instructions in my words.
- "Bedtime at half twelve" schedules bedtime once, through the hub's reminders (record 0070).
- Typed `/mode` shows the mode, and `/mode normal`, `bedtime`, `gaming`, `coding` or `away` changes it.
- What he says without being asked, decided in one place, `speaksUnprompted` in `modes.ts`: normal says train changes and reminders; coding says those and the session notices (record 0074); gaming says only reminders; bedtime only urgent reminders; away and guest nothing. What isn't said is shown as a line instead.
- He still answers what I ask him in every mode, out loud if his voice is on. Bedtime keeps him from speaking unasked, not from answering.

## Decision
With `MODES=on`, the hub keeps one mode in `api/data/mode.json`, switched through `POST /mode` (never off guest by voice), ending by itself at `until`, with bedtime starting at `BEDTIME_FROM` and ending at `BEDTIME_UNTIL`; while it's bedtime, every ntfy message that isn't urgent is held in memory and sent as one message when bedtime ends. With `JARVIS_MODES=on`, Jarvis follows the mode, switches it from mode words, and says unasked only what the mode allows.

## Confidence and the case against
Fairly confident in the rules (Claude's estimate): each one is tested with a made-up clock and store, and the hold is tested through the real `sendToNtfy`. Less sure about holding the daily summary and the all-clear, which arrive in the morning anyway, and about the 100 limit, which is a guess. The case against: one gate in `sendToNtfy` is module-wide state, so a sender that someday bypasses it, or a test that forgets to clear it, behaves differently; a restart during bedtime loses what was held, and updates usually come with restarts; and a phone's own Do Not Disturb with ntfy's priority exceptions would do much of this with no code at all.

## Consequences
- `MODES` is a new switch in `api/.env`, so the API won't start without it.
- The API gets a new writable mount, `./api/data` at `/data`.
- Every new sender must go through `sendToNtfy` to be held; marking another kind of message urgent needs its own decision.
- A new route that changes something (`POST /mode`), used by Jarvis's code and the phone page, never by a Claude tool.
