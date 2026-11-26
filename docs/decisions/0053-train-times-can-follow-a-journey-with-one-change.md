# 0053. Train times can follow a journey with one change, and check the connection

- Date: 2026-11-25
- Status: accepted

## Context
My journey has a change. Record 0047 gives the trains from one station to another, and there are no through trains on my route, so asking for the end station gave an empty board, and asking for the change station said nothing about the second train. With delays, making the connection is hit and miss: the walk between platforms takes a few minutes, the first train is often slow into the station, and every minute counts. What decides it is the gap between when the first train gets in and when the connection leaves, and a departure board only gives times at the station it's asked about.

## Options considered
What to build, chosen 25 Nov:
- The first leg only, with the change station as `TRAINS_TO`: not chosen, since it says nothing about the connection.
- Both legs as departures only, working out the gap myself: not chosen, since it can't see when the first train gets in, which is the number that matters.
- A connection check: chosen.

How to follow the first train, chosen 25 Nov:
- The detailed departure board at the first station, whose calling points give the time at the change: not chosen, since a departure board drops a train soon after it leaves, so it goes quiet while I'm on it, when the slow approach happens.
- The change station's arrival board (a second free subscription with its own key): chosen. Its detailed version also lists the earlier stops, so one board covers the first train from before it leaves until it gets in, with its platform there.

What to watch, chosen 25 Nov:
- My usual pair of trains, fixed in settings: not chosen, since on any other day it watches the wrong ones and never offers a fallback.
- The next trains from the first station, each with its best connection, ranked by when it gets me in: chosen. The first connection to leave isn't always the soonest in.

Also chosen 25 Nov: `TRAINS_TO` stays where I end up, with `TRAINS_CHANGE_AT` and `TRAINS_CHANGE_MINUTES` added (not: `TRAINS_TO` as the change and a new setting for the end); the morning alerts follow the journey in the same change (not: a later one); and train times give three journeys, each with its best connection and a fallback, and a sooner connection under my walk shown as tight (not: only the single best and a fallback, or no fallback). I said 3.5 minutes for the walk if possible, else 3; the boards give whole minutes, so 3.5 would act as 4, and 3 is used.

Claude's picks, not discussed:
- The detailed departure board's address is worked out from `TRAINS_BOARD_URL` by changing its last part, rather than being another setting, since both come with the same subscription.
- Buses on either board are offered like trains, marked as buses.
- The fallback is the soonest in of the connections leaving no earlier than the best. A tight one must get me in sooner than the best and leave me at least a minute.
- A connection delayed with no time yet counts from when it was due, and one with no expected time in is taken to be as late in as it is leaving. A first train with no expected time in has no connections until it has one.
- The alerts say a connection is back only once the gap is a minute more than the walk, so a gap hovering at the walk doesn't flip back and forth. A lost connection, or none at all, is sent at high priority. A sooner one becoming possible but tight is sent once for each connection.
- The alerts' own words name no station or destination, as in record 0048, since they go through ntfy.sh. `GET /trains` and Jarvis's spoken train times do name them, since they stay on my network.
- "Ontime", which the boards sometimes write, is read as "On time" everywhere, the direct board included.
- `/trains` asks the arrival board for 5 and the departure board for 10; the alerts ask both for 10. Both boards are asked at once.

## Decision
With `TRAINS_CHANGE_AT` set, train times and the morning alerts follow a journey with one change, from the change station's arrival board and detailed departure board, and give each first train's best connection against my walk, with a fallback and any tight one.

## Confidence and the case against
Medium (Claude's estimate). The whole point is a minute or two, and the boards' expected times come from trains passing reporting points, so a slow approach into the change station may show up late or not at all: the hub can only be as early as the board. It needs a second subscription and key. More code now has two shapes, a direct board and journeys, in the hub and in Jarvis. The "best" rule ranks only by when I get in, so it may pick a train I wouldn't, a busier one say. The case against is that a journey planner app already shows connections, and option two, both legs as departures, would have been simpler.

## Consequences
- Before and during the first train, I can be told whether I'll make the change and what to aim for if I won't.
- `api/.env` holds a second rail key, `RAIL_ARRIVALS_KEY`, under the same rules as the first.
- `GET /trains` has a different shape with a change station set; Jarvis reads both.
- The detailed board is assumed to sit next to the plain one; if Rail Data ever moves it, `TRAINS_BOARD_URL` can name it directly.
