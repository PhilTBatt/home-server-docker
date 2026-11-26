# 0064. A second look-up helper, the API's own web search, behind a switch

- Date: 2026-11-26
- Status: accepted

## Context
Record 0063 gave Jarvis look-ups through Claude Code on my Claude plan. I timed one on the server before it was built: 12.7 seconds. I'd said that if Claude Code turned out a decent bit slower, both ways should be built with a switch, so they can be compared with real numbers.

## Options considered
Chosen 26 Nov.
- Claude Code only: lost. It may be too slow to talk to, and without the other way there's nothing to compare it with.
- The API's web search only: lost. It's about a cent a search, which I think is expensive, where Claude Code comes out of the plan I already pay for.
- Both, behind a switch, with Claude Code the default: chosen. It's how I like things built: two ways, a switch, and logs to compare them.

Claude's picks, not discussed:
- The setting's name and values, `JARVIS_WEB_BY=claude|api`.
- The API helper only searches and never opens a page, makes at most three searches for a look-up, and uses the same fast model.
- It's one request with the question and nothing else, with one more if the API pauses part-way.
- Its cost in the logs is an estimate: list prices for the tokens plus a cent a search.
- With `api` the plan token isn't needed and isn't kept.

## Decision
`JARVIS_WEB_BY`, `claude` by default. With `api`, a look-up is one request from Jarvis's own code to Anthropic's API with its web search tool switched on, paid for from API credits. Everything else about a look-up is the same, and each one's line in the logs says which helper did it.

## Confidence and the case against
Medium. The case against: it's a second way to keep working, and if Claude Code is quick enough in practice this one may never be used. It also costs money for each search, which is why I didn't want it as the only way.

## Consequences
- With look-ups off, or with the switch left alone, nothing changes.
- The API helper can't open pages, so its answers come from the search results alone, and nothing is fetched from my server.
- `npm run compare` shows the two helpers side by side once both have been used with the log on.
- If the model doesn't accept web search, the API says so and the look-up fails with its message.
