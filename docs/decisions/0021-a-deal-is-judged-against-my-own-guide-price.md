# 0021. A deal is judged against my own guide price

- Date: 2026-11-19
- Status: proposed

## Context
An alert that only says "this matches" leaves me to work out whether it's any good. The obvious fixes use eBay's own prices: an average, a history, a percentile. eBay's agreement doesn't allow using its data to suggest or model prices, and sold prices aren't open to new developers (record 0019).

## Options considered
- Compare with an average or percentile of the current results: not chosen. It's a price worked out from eBay's data.
- Keep a price history: not chosen (record 0019).
- A guide price I set myself for each search: chosen.
- A price per unit for one listing (per GB, per TB), from that listing's own price and title: chosen alongside it. It's arithmetic on one listing.

## Decision
- A search can carry `guidePrice`, with `guideDate` and `greatPercent`. Each alert says how far under or over the guide the total is.
- At least `greatPercent` under (default 20) is a great deal: high priority, and let through quiet hours that allow it. Over the guide is low priority.
- An alert warns when the guide price is over 30 days old, and when a price is under half of it.
- `unit` adds a price per GB or TB, and the alert says the size was read from the title.
- "Cheapest of N matches right now" from record 0019 stays as it was.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- A guide price is only as good as the day I set it, and I'll forget to update it.
- The size read from a title is sometimes wrong: a PC's title names both its RAM and its drive.
- eBay hasn't said whether a per-unit price or a place among the results counts as modelling prices.

## Consequences
- The judgement is mine and in my own file, so nothing about prices is derived from eBay or stored.
- Two more questions for eBay, in `docs/deals.md`.
