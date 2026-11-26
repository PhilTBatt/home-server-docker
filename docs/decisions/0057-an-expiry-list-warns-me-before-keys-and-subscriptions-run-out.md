# 0057. An expiry list warns me before keys and subscriptions run out

- Date: 2026-11-26
- Status: accepted

## Context
Several things this server relies on run out on a date: the server's Tailscale key, tokens I make on GitHub, yearly subscriptions. When one runs out, something stops working quietly, and I find out when I need it. I want the hub to warn me first. It may grow into a bigger security service later, but I'm wary of doing my own security, so this starts as a reminder that never holds a key itself.

## Options considered
Chosen 26 Nov: a token-expiry checker, which warns before a key expires.

Claude's picks, not discussed:
- Where the list lives: `expiry/items.json`, git-ignored, mounted into the API at `/expiry`, with a tracked example in `api/src/modules/expiry/items.example.json` and a tracked `expiry/README.md`, the way the deal watcher keeps its search list (records 0018 and 0030). Not lines in `api/.env`: a list with a note each doesn't fit one value per line, and a mistake there stops the API. Not a tracked file: the repo is public, and the list says what I use.
- What an item is: a name, a date written `YYYY-MM-DD`, and an optional note. Never the key itself. A name (up to 40 characters) or note (up to 100) is refused if it has anything but letters, digits, spaces and `' - . , ( ) & / + : _`, a word over 20 characters, or a word of 12 or more mixing letters and digits, since that could be a key pasted in by mistake. The error names the entry by its number and never repeats what was refused. Two items with the same name, in any case, are refused. At most 50 items.
- A broken list is refused whole, as the deal watcher's is, rather than skipping the bad entry. It never stops the API starting: with the switch off it isn't read at all, and with it on the problem goes to the API's log and to the alerts, naming the file, and `GET /expiry` says what's wrong.
- When it warns: 30, 14, 7, 3 and 1 days before, on the day, and once when it's overdue. An item first seen part way through, or on a day the check couldn't run, gets one warning for where it is then, with its real days left, rather than waiting for the next mark. A new date, as after renewing, starts its warnings again.
- When in the day: the check runs with the other checks every 5 minutes, and sends nothing before 08:00 London time, the hour of the daily summary, so a restart before then sends nothing.
- Each check that finds anything due sends one notification listing all of it, high priority when something is a day away or less, overdue or due today. If the list would be longer than 3,500 bytes it's cut there and ends by saying how many more there are, because ntfy turns a message over 4,096 bytes into a file attachment.
- Remembering what was sent: in `expiry/sent.json` beside the list, written by the API, so a restart doesn't send a warning again. Not in memory only, as the train alerts do: the API restarts every time I rebuild it, and each restart would warn about everything within 30 days again. Not by sending only on the exact day at a fixed hour: a restart in that hour would send twice, and a day the server was down would be missed. If the file can't be saved, it says so in the alerts.
- The route is `GET /expiry`, behind `EXPIRY_ALERTS` like the other switched modules and behind the hub's token like every route. The daily summary gains an "Expiring:" line when something is within 30 days or overdue. Claude Code gets a read-only `get_expiries` tool. Jarvis doesn't get it yet. The phone page gets a short list.

## Decision
With `EXPIRY_ALERTS=on`, the hub reads my list of names and dates from `expiry/items.json` and sends one ntfy warning at each of 30, 14, 7, 3 and 1 days before, on the day and once overdue, remembering what it sent in `expiry/sent.json`.

## Confidence and the case against
Fairly confident in how it counts and remembers (Claude's estimate), since it's tested day by day against made-up lists, including restarts. Less sure the rule for refusing keys is right: it catches long tokens like GitHub's and Tailscale's, but a short password is just a word to it, so the real protection is that I never paste one in. The case against: it only knows what I type, so a date I copy wrongly gives a confident wrong warning, and the dates it most needs could be read from Tailscale and GitHub themselves. A calendar reminder on my phone would do the same job with no code. And the names and notes go through ntfy.sh, a public service, so they have to stay general.

## Consequences
- `EXPIRY_ALERTS` is a new switch in `api/.env`, so the API won't start without it, and with it on it needs `NTFY_TOPIC`.
- The API writes one more file on the server, `expiry/sent.json`, which holds names, dates and which warning went last.
- Reading dates straight from Tailscale, GitHub or a certificate would be a later step, each with its own decision, since each means a new key or a new place the hub reaches.
