# 0085. Guest mode goes ahead without the hub, and unjudged voices aren't Phil's

- Date: 2026-11-28
- Status: accepted

## Context
Four gaps in guest mode were left from the 27 Nov batch and the talk build. Asking for guest mode while the hub was down left Jarvis in Phil's own chat, with his brain and hub. Ears's guest door (`POST /wake/guests`) was only opened with `JARVIS_VOICES=on`, so with ears's voice ID on `require` and `JARVIS_VOICES` off, guests could never be heard. A spoken recording too short for ears to judge carried no voice verdict, and with `JARVIS_VOICES=on` nothing said how to treat it. And with `JARVIS_MODES=off`, Jarvis didn't know the hub was in guest mode, so he answered the phone in it.

## Options considered
Chosen by Phil, 28 Nov:
- Guest mode with the hub down goes ahead anyway, privacy first: the guest gets a fresh guest chat, and Jarvis says the hub didn't hear, so the phone won't show guest mode until the hub's back. Not staying in Phil's chat with a line saying it failed, which is what happened before.
- Guest mode opens ears's guest door whenever Jarvis listens for the wake word (`JARVIS_EARS=wake`), whatever `JARVIS_VOICES` says. Not a separate switch for the door. With `push`, voice ID never holds a recording back, so there's nothing to open (and that ears may not have the route).
- A recording with no verdict counts as not Phil: it's answered, but it can't end guest mode, change modes or do anything only his voice can.

Claude's picks, not discussed:
- Jarvis tells the hub guest mode as soon as it answers: on its next mode answer, when the mode watcher says it's back, and every 15 seconds (`guestRetryMs`), one try at a time, until the hub's own mode says guest back. Until then, the hub's own mode never takes him out of guest mode, since the hub's "normal" may only mean it never heard, or be an answer from before he told it.
- Typing `/guest off` (or Phil's own voice) before the hub has heard leaves guest mode in Jarvis alone, so a down hub can't trap him in it, and puts back the mode from before (bedtime, say). A guest mode the hub did hear still needs the hub to end it, as before.
- With `MODES=off` in the hub, guest mode goes ahead too, says the phone won't show it, isn't retried, and `/guest off` leaves it in Jarvis.
- "Anything only his voice can" is read as mode words: every mode, guest mode off included, gets "I couldn't tell it was you, so I won't change the mode. Say it again, a bit longer." Guest mode on is let through, since it only takes things away, any voice could already ask for it, and "guest mode" on its own is usually under a second. An unjudged recording doesn't switch him into guest mode with `JARVIS_OTHER_VOICES=guest`, since Phil said it's answered, and doesn't get the "not Phil" line with `name`. With `JARVIS_VOICES=off` no recording has a verdict, so nothing changes there.
- Phone questions always ask the hub's `GET /mode` first, whatever `JARVIS_MODES` says, and are refused in guest mode. The check is a required part of the phone's wiring, so it can't be left out by mistake. If the mode can't be read they're refused too, in case it's guest mode; with `MODES=off` in the hub there's no guest mode, so they're answered.
- The answer log marks phone questions `phone: true`, which was the last known gap from the talk build.

## Decision
Guest mode starts in Jarvis even when the hub can't hear it, and he tells the hub later. Guest mode always opens ears's guest door when Jarvis listens for the wake word. A recording with no voice verdict can't change modes. Phone questions check the hub's mode every time.

## Confidence and the case against
Fairly confident. The case against going ahead without the hub: Jarvis and the hub disagree for a while, and the phone page shows the wrong mode until the hub hears; if Phil changes the mode on the phone page in that time, Jarvis puts guest mode back. Refusing phone questions when the mode can't be read means a question is lost on a hub hiccup, though the question itself came through the hub, so the hub was up a moment before. Treating a short "bedtime" as not Phil's means saying it again, a bit longer, when his voice ID is on.

## Consequences
A guest can't end up in Phil's chat because the hub was down. Guests can be heard with voice ID on `require`. Another voice Jarvis knows can still change modes outside guest mode; making modes owner-only by voice would be its own decision.
