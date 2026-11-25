# 0051. Jarvis says train changes aloud once he's quiet

- Date: 2026-11-25
- Status: accepted

## Context
Record 0048 sends my morning train changes to my phone. When Jarvis is open with his voice on, I'm usually near the server rather than looking at my phone, and until now Jarvis has only ever spoken in answer to something I said or typed. Saying train changes means letting him speak without being asked, which needs its own limits.

## Options considered
Chosen 25 Nov:
- What he says: changes only: chosen. The reminder stays on my phone.
- When: once he's quiet: he finishes what he's saying, then says the change, and never cuts himself off for it: chosen.

Claude's picks, not discussed:
- The hub keeps today's change lines in memory and gives them at `GET /trains/changes`, numbered, with a run that changes when the API starts, so a chat can ask for only what's new. Jarvis asks every 30 seconds, since the hub only checks the board every 2 minutes. A long wait that answers when something changes, as ears's `/wait` does, would be quicker but is more to build for something that changes every few minutes at most.
- A setting, `JARVIS_TRAIN_ALERTS`, off by default, which needs `JARVIS_HUB_TOOLS=on` because the changes come from the hub with its token.
- Changes found before the chat started aren't said, so starting Jarvis doesn't read out the morning's history.
- Quiet means: not answering, no speech still playing, no recording going on or waiting to be sent, and no follow-up on its way or open, since speaking then would make ears refuse the follow-up (record 0043). While it isn't quiet, the chat looks again every 2 seconds.
- His own code says the change, as with code words: it's never sent to Claude, never logged, and never followed by listening for a follow-up. His speech holds the wake word as always, so ears doesn't hear him (record 0039).
- With his voice off, the change is shown in the chat instead.
- The reminder's and the board's failure notices aren't said; only the hub's change lines are.
- At most 20 lines wait in Jarvis and 50 entries a day in the hub, so a stuck chat or a bad morning can't grow without end.
- An API older than the route gets a line saying to rebuild it.

## Decision
With `JARVIS_TRAIN_ALERTS=on`, Jarvis says the hub's train changes aloud once he's quiet, and train changes are the only thing he says without being asked.

## Confidence and the case against
Medium (Claude's estimate). Asking every 30 seconds means a change can be said up to about half a minute after the hub found it, and more while he's busy. A change said while I'm in the middle of a question, but before I've pressed the button or said Hey Jarvis, will be talked over by me, and I'll have to stop it. The case against is that any speech I didn't ask for is a step towards a speaker that talks at me: it's one more thing his code does by itself, and every later "just this once" (reminders, the deal watcher) would lean on this one. My phone already gets the same changes.

## Consequences
- With Jarvis open, I hear about a cancelled or late train without picking up my phone.
- Anything else he'd say unprompted needs a record of its own, rather than joining this one.
- The hub has a new read-only route, behind its token like the rest.
- A restart of the API forgets the day's changes, as the alerts already do. After a restart past the window's end, what's still wrong goes to my phone again but isn't said again.
- Asking for the changes isn't logged, wrong tokens included, so the API's log no longer shows every attempt on that one route, as for `/health`.
