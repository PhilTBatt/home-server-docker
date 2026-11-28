# 0080. Jarvis tells the hub what he's doing, for the wall

- Date: 2026-11-27
- Status: accepted; how a screen logs in replaced by 0086

## Context
The plan is to show Jarvis on a wall, first on the TV through the Xbox's browser and maybe later with a projector, so a web page needs to know what he's doing right now: waiting, listening, thinking, speaking and the rest. Until now only Jarvis knew that, and only inside his chat. Ears knows when it's muted or recording, but nothing about thinking or speaking. The screen will be in a room that guests sit in, and probably on plain `http`, since nothing shows that an Xbox can install Caddy's root certificate.

## Options considered
Chosen 27 Nov (Phil):
- How the page hears it: a long poll for now, like `GET /talk/next`. Server-sent events can come later. Not the page asking every second: that's 86,400 requests a day for one screen, and up to a second late for "heard you".
- How a screen logs in: a token of its own that can only read the wall, not the hub's usual login cookie, which would give anyone at the TV the whole hub (modes, the phone, downloads, chores).
- Guest mode: words stay on the wall, his especially. Each voice can have its own colour, to show he's keeping track of who's talking.

Claude's picks, not discussed:
- Jarvis's code works out what he's doing from moments it already has (a question asked, a yes being waited for, a look-up running, a sentence playing, a recording open, "Hey Jarvis" heard), in a fixed order with the one that needs you first. Not ears's view alone, which can't see thinking or speaking.
- He posts a whole report on every change and every 20 seconds, so a missed post mends itself, and the hub tells running from gone by the last 45 seconds. A heartbeat with nothing new doesn't wake a waiting screen.
- A voice goes as `owner`, `unknown`, or a slot from 0 to 4 that Jarvis's code gives out in turn as voices are first heard, so a name never leaves him and up to five voices never share a colour; a sixth would. The slots start again when he restarts.
- Words are kept in memory only: Jarvis stops sending them after 45 seconds and the hub forgets them after a minute, and those routes log warnings only. Words only go to the wall for questions said out loud in the room: a typed or phone question's words, and his answer to it, never do, since typing at the server and the phone are the private ways to ask. His live facts tell him so.
- The wall's token is checked in the same hook as the hub's token, against a fixed list of read routes, so there's one place to look. Its login is its own route and cookie, so the hub's login can't be fooled into taking it.

## Decision
With `JARVIS_WALL=on` Jarvis posts what he's doing to `POST /wall/jarvis`; with `WALL=on` the hub keeps the latest and a screen reads it with the long poll `GET /wall/jarvis`, logged in with `WALL_TOKEN`, which reads nothing else.

## Confidence and the case against
Fairly confident in the shape. The order of the activities is a guess at what reads best and may want changing once it's seen on the wall. The case against the second token: it's more to set up than logging the TV in with the usual cookie, and the check that guards every route now has a second path through it; a mistake in `wallReads` would show something to a guest. The tests try the wall's token against every route the hub's own tests list, to catch that.

## Consequences
Anything that knows the wall's token can see what Jarvis is doing and what was said near him in the last minute, which is what the wall is for. A long poll holds one connection open per screen. Jarvis needs the hub's tools on for this, like modes and reminders. What he's doing is only as good as the moments his code sees: with his voice off he never shows as speaking.
