# 0071. Finding my phone can ring for a while

- Date: 2026-11-27
- Status: accepted

## Context
"Find my phone" (record 0046) sends one ntfy message at top priority, which is a buzz and the default sound, easy to miss in another room. I want it to ring loudly for 30 seconds. ntfy can't make a sound on its own, but two of its features help: its Android app can keep alerting for highest-priority messages until they're dismissed ("insistent notifications that ring until dismissed", Android app v1.16.0), and since server v2.16.0 and Android app v1.22.2 a message can carry a sequence ID, so a later message with the same ID replaces it, and `PUT /<topic>/<sequence ID>/clear` dismisses it ([publishing docs](https://docs.ntfy.sh/publish/), [release notes](https://docs.ntfy.sh/releases/)). The same sequence ID also fixes the watchers sending one notification twice when ntfy answers slowly (review B4).

## Options considered
Chosen 27 Nov (mine): ring loudly for 30 seconds, not just a ping.

How (from the batch's spec, behind a setting so it can be compared on the phone):
- `clear`: one top-priority message with a sequence ID, cleared after the seconds. With the app set to keep alerting for highest priority, it rings until the clear dismisses it. Best if clearing stops the ringing, which isn't known.
- `repeat`: the same message with the same sequence ID every 5 seconds for the seconds. Each one is a fresh alert even if the phone doesn't keep alerting, and the sequence ID keeps it to one notification. Six messages instead of one, for the default 30 seconds.
- `once`: today's behaviour, and the default.

Lost (Claude's view): an app of my own on the phone, or a different push service, which would mean a new dependency; and ntfy's attachment of a sound file, which plays only when tapped.

Claude's picks, not discussed:
- `FIND_PHONE_RING` (`once`, `clear` or `repeat`, `once` if left out) and `FIND_PHONE_SECONDS` (10 to 120, 30 if left out), both checked even while `FIND_PHONE` is off.
- The sequence ID is `find-` and 8 random hex characters, new for each find. The notifier only sends one made of letters, digits, `-` and `_`, up to 64, and `clearOnNtfy` refuses anything else, so nothing from a request can reach ntfy's path.
- `repeat` leaves the last message showing when its time is up; `clear` clears it then. `POST /phone/found` stops either early and clears it. With `once` there's nothing to stop and found says so.
- A find while it's ringing is a 429 saying it's already ringing; the 10-second rule still applies after.
- Every ring message is marked urgent, so bedtime never holds it (record 0068).
- Jarvis's code word: "found it", "found my phone", "stop ringing" and a few more, only as all that was said (give or take a greeting, please and thanks), never as a last sentence, since "found it" is an everyday phrase. `phoneFoundIn` and `phoneFound` are in `jarvis/src/code-words.ts`, and the chat counts them only for 2 minutes after he rang the phone himself, so "found it" in ordinary talk still goes to Claude, and once it's stopped they're ordinary words again. Not in guest mode.
- Jarvis's reply to a find says how long it rings, and that it's already ringing on a second find.
- Watchers: a fired notification carries `watcher-<id>` as its sequence ID, so a retry after a send that seemed to fail replaces the first on a phone with Android app v1.22.2 or later.
- Logs: sent once or ringing (how, seconds, sequence ID), not taken by ntfy, stopped (why, after how long, sends that went and failed, cleared or not). Never the topic.

## Decision
`FIND_PHONE_RING=clear` or `repeat` makes "find my phone" ring for `FIND_PHONE_SECONDS` (30 by default) with one sequence ID, cleared at the end (`clear`) or when found, through `POST /phone/found`; `once` stays the default, and watchers reuse a sequence ID on a retry.

## Confidence and the case against
Confident the hub sends and clears as described (Claude's estimate): it's tested with stand-in timers and a stand-in ntfy. Not confident it rings the phone loudly: that's down to the ntfy app's settings and Android, and whether a clear stops an insistent alert hasn't been tried. The case against: a phone on silent with Do Not Disturb may stay quiet whatever the hub sends unless the channel overrides it; `repeat` sends six messages through ntfy.sh's free tier for one find; and a sequence ID on watchers changes nothing on an older app.

## Consequences
- Two optional settings; with neither set nothing changes.
- A new route that changes something, `POST /phone/found`, used by Jarvis's code.
- The notifier can send sequence IDs and clear by one, for any later feature that wants a notification replaced rather than added.
- The guide has the phone-side settings to make in the ntfy app, which can't be checked from the server.
