# 0047. Train times come from National Rail's live departure board, through the hub

- Date: 2026-11-22
- Status: accepted

## Context
I want to ask Jarvis for my train times, and later have the hub check them each morning and tell me when a train is delayed or cancelled. That needs live data, and both sources I'd consider need a free key.

## Options considered
Where the times come from:
- National Rail's live departure boards (Darwin), through the Rail Data Marketplace's "Live Departure Board" product: chosen on 22 Nov. It's the official source, free, and a third-party setup guide says the product has no usage limit. Its specification is behind the marketplace's login, so the hub is built from community examples of its JSON and checked against my first real reply.
- Realtime Trains' API: not chosen. It's free for personal use and its specification is public, but its limits for personal use weren't clear.

Where it lives:
- A hub module, `GET /trains`, with the key, the stations and the board's address in `api/.env`: Claude's pick, so the key stays with the hub, and the morning check can live beside it.
- Jarvis asking the board himself: not chosen, as it would put the key in his environment too.

How much now:
- The "train times" code word only: chosen on 22 Nov. The morning check, and alerts when a train changes, come later, as ntfy notifications (chosen on 22 Nov), so they reach me with no Jarvis chat open.

Claude's picks, not discussed:
- One pair of stations, from and to, and the next five trains; Jarvis says the next three, with reasons and the board's messages printed under them.
- `TRAINS_BOARD_URL` must be https on `raildata.org.uk`, so the key can't be sent anywhere else by a typo.

## Decision
The hub reads the next trains between two stations from the Rail Data Marketplace's live departure board, behind `TRAINS`, and Jarvis says them when I ask.

## Confidence and the case against
Low to medium (Claude's estimate). Everything is tested against examples, but nothing has asked the real board yet, so its address or the JSON's field names may differ. The case against: Realtime Trains' public specification would have removed that guess.

## Consequences
- `TRAINS` is a new switch in `api/.env`, so the API won't start without it, and with it on it needs the key, both stations and the board's address.
- A route home, or the other direction, would need a second pair of stations.
- The morning check gets its own patch and record.
