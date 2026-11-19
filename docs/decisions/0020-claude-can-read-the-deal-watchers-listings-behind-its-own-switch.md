# 0020. Claude can read the deal watcher's listings, behind its own switch

- Date: 2026-11-19
- Status: proposed

## Context
Record 0019 kept listings away from AI until eBay answered in writing. I'd rather the AI on my own system could read each listing and compare them itself, because that's what makes the watcher useful for judging a buy, and it's the base for a PC-build skill. The risk hasn't changed: eBay's agreement may restrict it, and nobody at eBay has said either way.

## Options considered
- Keep waiting for eBay (record 0019): not chosen. There's no sign of an answer, and the wait blocks the most useful part.
- Build it always on: not chosen. Everything else here is built switched off, and this is the one part with an open question about eBay's terms.
- Build it behind its own switch, `DEALS_AI`, off unless I set it: chosen.

## Decision
- Two MCP tools, `get_deal_matches` and `get_deal_listing`, read through two routes that reply 403 while `DEALS_AI=off`. The other deal tools still never include listings.
- The tools only read. There is still no route or tool that buys, bids, makes an offer or messages a seller.
- Text a seller wrote (titles, summaries, descriptions, item specifics) is cleaned, capped and labelled in every reply as claims to check, never instructions.
- A listing in full is fetched from eBay only for a current match, at most once per listing every half hour, out of the watcher's own daily calls, and kept in memory only.
- This replaces the line about AI in record 0019. Its lines about price history and sold prices stand.

## Confidence and the case against
Fairly confident in the build, less so in the terms (Claude's estimate). The case against:
- If eBay does treat this as passing its data to a non-eBay AI tool, the keyset is what's at risk, and with it the whole watcher.
- The copy of the agreement that could be read when this was built (dated 26 June 2023) has no AI clause; a research pass read a later copy (3 September 2025) that it says does. Claude couldn't read that clause itself when it built this.
- A listing's text is written by a stranger, and an AI that reads it can be misled by it. In Claude Code that text sits beside a shell and file edits; what stops a misled session acting is Claude Code asking first, not these tools.
- The switch covers Claude's tools only. The hub page's own routes return the same listings to anything holding the API token.

## Consequences
- Switching `DEALS_AI` on is a decision about eBay's terms, made by me, and one line to undo.
- The question for eBay stays open in `docs/deals.md`.
- The PC-build skill can be built on these two tools.
- The watcher now calls a third eBay address, for one item at a time, which record 0016's "two addresses" came before. At most 150 listings are read in full a day.
