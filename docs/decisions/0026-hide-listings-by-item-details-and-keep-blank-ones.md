# 0026. Hide listings by their item details, and keep the ones left blank

- Date: 2026-11-19
- Status: proposed

## Context
Title words let laptop RAM, server RAM and a bare motherboard through the RAM and EliteDesk searches. Sellers also fill in item details (eBay calls them aspects), like Form Factor: SO-DIMM. eBay's search can ask for listings that have a detail, but has no way to ask for listings that don't.

## Options considered
- More title words only: done as well (260-pin, Impact, M393, 2Rx4, "-R" speed codes, mobo, system board), but it's never finished.
- `detailsMode: "only"` with Form Factor DIMM: drops every listing whose seller left Form Factor blank, and those are often the bargains.
- Ask eBay once more for each detail to hide, and hide what comes back: chosen.

## Decision
A search can have `hideDetails`, up to three names, each with values to hide. Each reads up to as many pages as the search itself did, so usually one more call per check. A name can't also be in the search's `details`, and in "only" mode the question includes those details. If the extra question returns as many listings as the search itself, the search fails with a message instead of hiding everything, because a misspelt name may be ignored by eBay. The category lookups (`/deals/categories`) show the exact names and values.

## Confidence and the case against
Medium. Whether eBay warns about, rejects or ignores a wrong name wasn't checked, and the "would hide every listing" check only catches the last of those when the counts are equal. Each hidden name also costs at least a call per check. If calls get tight, title words alone are cheaper.

## Consequences
Wrong RAM types are hidden even when their titles don't say so. Listings with blank details still come through, so the title words stay useful. Hidden listings count under `details`.
