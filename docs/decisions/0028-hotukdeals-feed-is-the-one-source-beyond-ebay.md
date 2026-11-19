# 0028. HotUKDeals' feed is the one source added beyond eBay

- Date: 2026-11-19
- Status: proposed

## Context
I asked for more places than eBay, even if each adds only a little. The rule so far has been an official API or feed, outbound only, no scraping.

## Options considered
- HotUKDeals' RSS feed of new deals: published for feed readers, allowed by its robots.txt, and its terms say nothing about automated access. Chosen.
- CeX: no official API, and its terms couldn't be read. Not chosen.
- Facebook Marketplace and Gumtree: no API, and scraping is against their terms. Not chosen.
- Reddit: closed to new API apps from 31 October 2026, with RSS reported ended on 13 November 2026 (both from third-party reports that disagree). Not chosen for now.
- Amazon's Creators API: needs 10 affiliate sales in the last 30 days. Not chosen.
- Retailers' clearance emails read from a mailbox: needs a mailbox password on the server. Not now.
- Paid scraping services: the same terms problems, through someone else. Not chosen.

## Decision
A `hotukdeals` source reads one fixed address, `https://www.hotukdeals.com/rss/new`, at most every five minutes (a failed read is remembered for five minutes too), shares it between every feed search, and filters it by title words and price. The feed itself is kept in memory for five minutes; deals that match a search are kept like eBay's listings (in memory until the search's next good check, shown for six hours at most, and their ids in the state file only with `DEALS_SEEN=disk`). It never follows a redirect, and its reads don't count towards eBay's daily calls, so feed searches keep running after those run out.

## Confidence and the case against
Medium-low that it's worth having: the feed is the newest 30 deals across the whole site, so most PC parts will never appear in it. Against: it's one more outside address for little gain, which is why every feed search starts off.

## Consequences
CLAUDE.md lists HotUKDeals as an outside address. A future source still needs an official API or feed.
