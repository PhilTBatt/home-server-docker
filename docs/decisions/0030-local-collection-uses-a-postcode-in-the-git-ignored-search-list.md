# 0030. Local collection uses a postcode kept in the git-ignored search list

- Date: 2026-11-19
- Status: proposed

## Context
Big or heavy things (PCs, UPS units) are often cheaper collected. eBay's search can ask for local collection, but needs a postcode and a distance.

## Options considered
- A postcode in `api/.env`: a new required setting, and the API won't start if it's missing.
- A postcode at the top of `deals/searches.json`: git already ignores the file, and only searches that use it need it. Chosen.

## Decision
`"postcode"` at the top of `searches.json` (the full postcode, or just its first half) and `collectionMiles` on a search. The postcode is only sent to eBay, inside those searches' filters, and never shown by a route. `freePostage` asks for free postage only, and can't be combined with collection.

## Confidence and the case against
Medium. eBay documents the pickup filters, but whether it wants a UK postcode with or without its space wasn't checked; it's sent with the space. Against: a home postcode is personal, and it now sits in a second file. The first half alone is accepted, but whether eBay works with only half wasn't tested.

## Consequences
A collection search fails with a clear message if there's no postcode, and can't be combined with `freePostage` or `postageShown`. Changing the postcode or distance starts that search fresh.
