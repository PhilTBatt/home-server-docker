# 0048. Morning train alerts watch a window of trains and send changes to my phone

- Date: 2026-11-23
- Status: accepted

## Context
Record 0047 brought the departure board into the hub and left the morning check for later. I want the hub to remind me about my trains on the mornings I travel, and to tell me if they're delayed or cancelled, without a Jarvis chat open.

## Options considered
Which trains it watches:
- Every train due in a window of time I set, like 07:00 to 08:30: chosen on 23 Nov.
- One train, by the time I catch it: not chosen. It was Claude's suggestion, but a window covers the train before and after if I'm early or late.
- The first train after a time I set: not chosen.

Which days:
- Days I list in `api/.env`, like Monday and Wednesday: chosen on 23 Nov, so it follows the days I travel.
- Every weekday, or every day: not chosen.

What it sends:
- A reminder at a set time with the window's trains, then a notification whenever one changes: chosen on 23 Nov.
- Only changes, or only the reminder: not chosen.

How it reaches me:
- ntfy notifications, as chosen for alerts on 22 Nov (record 0047), so they reach me with no chat open.
- Jarvis saying them out loud: not now. He'd have to speak without being asked, which needs its own decision.

Claude's picks, not discussed:
- It lives in the hub beside `GET /trains` and uses the same key, stations and board.
- It asks the board every 2 minutes from the reminder until the window's trains have left, at most an hour after the window ends, which must be by 22:59 so that hour stays in the same day.
- A delay is sent from 5 minutes late, and again when it moves by 5 minutes or more. A recovery is sent at 2 minutes late or less, or when the delay drops by 5 minutes or more. That gap means a train hovering around 5 minutes late, or flipping between a time and none, doesn't send a notification at each flip. Running again after a cancellation and a move from one platform to another are sent too; a platform appearing for the first time isn't.
- A train is known by the time it's due, and by its destination too only when two share a time, so a train that ends its journey early is still the same train.
- A train that leaves the board more than a minute before it's due, while the board lists later trains and isn't full, is sent as maybe cancelled or replaced by a bus. Nothing has shown how the real board shows those, so this covers a train vanishing rather than being marked. It's off on a full board, since a train could have been cut off.
- It asks the board for 10 trains and picks the window's out of them, rather than using the board's `timeOffset` and `timeWindow`. Community clients send those, but their notes disagree on the limits and on whether the window counts from now or from the offset, and nothing here has asked the real board yet. The reminder says how far the board reaches when that's short of the window's end.
- The reminder must be no more than 2 hours before the window ends, since community clients say the board looks about that far ahead.
- If the board fails for 5 minutes it says so, then says when it's back or when it has stopped checking for the day; each outage is sent once. A notification ntfy didn't take is sent with the next check.
- The hub adds no station or destination names to the notifications, since they pass through ntfy.sh. The board's own reasons and messages are passed on as they are, and those can name stations.
- Nothing is kept on disk, so a restart before the window ends sends the reminder again, and one after it only sends what's wrong with the window's trains still on the board.

## Decision
With `TRAIN_ALERTS=on`, on the days in `TRAIN_ALERT_DAYS` the hub sends a reminder at `TRAIN_ALERT_REMINDER` listing the trains due in `TRAIN_ALERT_WINDOW`, then checks every 2 minutes and sends any cancellation, delay, recovery, platform change or train leaving the board early through ntfy.

## Confidence and the case against
Medium (Claude's estimate) for how it decides what to send, which is tested against made-up boards. Low for how it reads the real board, for the reasons in record 0047: nothing has asked it yet. The case against: one train, as Claude first suggested, would send fewer notifications on a bad morning, since every train in the window can send its own changes.

## Consequences
- `TRAIN_ALERTS` is a new switch in `api/.env`, so the API won't start without it, and with it on it needs `TRAINS=on`, the three settings above and `NTFY_TOPIC`.
- About 30 requests to the board an hour while it's checking (Claude's estimate). A third-party setup guide says the product has no usage limit (record 0047).
- A second window, like the way home, would need its own settings.
