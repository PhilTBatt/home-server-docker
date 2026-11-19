# 0016. The deal watcher reads eBay through its official API only

- Date: 2026-11-18
- Status: proposed

## Context
I want an alert when a listing I'd buy appears on eBay: a refurbished small PC for the next server, RAM, and later parts for a PC build. The watcher has to find listings by keywords, price, condition and location, on a schedule, from a server that exposes nothing to the internet. It must never buy or bid.

## Options considered
- eBay's Browse API, `item_summary/search`, with an application token from the client credentials grant: chosen. It's the official search API, the token needs no eBay login and carries no buying, bidding or account scope, and the default limit is 5,000 calls a day.
- Scraping eBay's pages or its saved-search emails: not chosen. Against eBay's terms, and it breaks whenever the page changes.
- The older Finding API: not chosen. eBay shut it down in February 2025.
- eBay's own saved searches with email alerts: not chosen as the answer, though it stays a fallback. It can't exclude words, check a seller's feedback, cap price with postage, or feed the hub.
- An npm package for eBay's API: not chosen. The watcher needs two calls, which is less code than learning a package, and it would be the API's third dependency.

## Decision
The watcher is a module in the API, `api/src/modules/deals/`, that calls two eBay addresses and nothing else: the token address, and the Browse search. Each request refuses redirects, gives up after 15 seconds, and builds its own address, so an address inside eBay's reply is never fetched. The link in an alert is built from the item number on `www.ebay.co.uk`. Alerts go out through the ntfy sender the API already has. Sources are adapters behind one small shape, so another marketplace with an official API can be added without touching the watcher.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- eBay's page on the Buy APIs says production use is for approved partners, while its support staff's forum replies say search needs only an application token. If a new keyset is refused, the module can't run against production until eBay approves it, and a personal tool may not be approved. `host/ebay-check.sh` finds that out before anything else is switched on.
- eBay's saved searches already send alerts for free, with no keys, no terms to follow and no code to keep working.
- The API License Agreement can change, and eBay can withdraw a keyset at any time.

## Consequences
- New secrets in `api/.env`: `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`.
- The module depends on eBay's developer terms. `docs/deals.md` lists what it does to stay inside them.
- Nothing is exposed: every connection is outbound.
- Adding a source means writing one adapter. Only sources with an official API or feed qualify.
