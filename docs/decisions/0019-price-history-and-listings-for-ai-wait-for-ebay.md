# 0019. Price history and listings for AI wait for eBay

- Date: 2026-11-18
- Status: proposed

## Context
Three things would make the watcher better at judging a deal: a record of each search's prices over time, sold prices, and letting Claude or Jarvis read the current listings ("any good RAM deals?", or putting listings together into a full PC build). Each one runs into eBay's API License Agreement or its access rules.

## Options considered
- Build all three now, switched off: not chosen. A switch that should never be flipped is clutter, and the code would need tests and upkeep while it waits.
- Build none, and record why: chosen.
- Price history from my own notes of prices, typed in by hand: possible later. It uses none of eBay's data.

## Decision
- No price history. The agreement has a clause against using eBay's data to suggest or model prices and another about deriving average prices, and a saved record of prices would also be eBay data on disk, which record 0017 avoids.
- No sold prices. eBay's Marketplace Insights API, the only official source, isn't open to new developers.
- The MCP tools give the watcher's status and my own search list, never listings. The agreement was updated in 2025 with clauses about AI. Listings reach an assistant only after eBay has said in writing that it's allowed.
- What the watcher does instead: each alert says where the listing stands among the current matches, worked out from one reply and never stored.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- These are the features that would make it more than a notifier, and plenty of personal tools do all three without eBay noticing.
- Reading the agreement cautiously costs real usefulness, and I'm not a lawyer: a clause about modelling prices may be aimed at sellers' repricing tools, not a buyer's own notes.
- Waiting for a written answer may mean waiting for good.

## Consequences
- The keyset is at less risk, and the declaration in record 0017 stays true.
- The PC-build skill and "any good deals?" need eBay's answer first. The questions to send are at the end of `docs/deals.md`.
- Adding listings to the MCP server later is a small step: one more read tool over `/deals/matches`.
