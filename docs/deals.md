# The deal watcher

The API checks eBay on a schedule for listings that match searches I set, and sends an ntfy alert when a new one appears. Each listing alerts once. It only ever reads: it has no way to buy, bid, make an offer or message anyone.

It's built switched off (`DEALS=off`), and every search has its own switch.

## What it does on each check
Every 5 minutes the API asks the watcher to run. The watcher:
1. Reads `deals/searches.json` again, so an edit needs no restart.
2. For each search that's switched on and due (its `everyMinutes` has passed), asks eBay's Browse API for the matching listings, newest first.
3. Applies the search's own rules to what came back (prices with postage, words to exclude or require, seller feedback, auctions ending soon).
4. Alerts for listings it hasn't seen before, cheapest first, and remembers them.

What that means in practice:
- **The first check of a new search alerts nothing.** Everything already listed counts as seen, and one "now watching" message says how many match and the cheapest price. The same happens when a search's rules change, so loosening a price limit doesn't flood the phone.
- **Up to 5 alerts per search per check**, then one roll-up message for the rest. Up to 60 alerts a day, then one "paused" message; anything not sent is alerted the next day if it's still there. Both limits can be changed in the list.
- **An alert that fails to send is tried again** at the next check. A listing only counts as seen once its alert went out.
- **A tap on an alert opens the listing.** The link is always built from eBay's item number on `www.ebay.co.uk`; an address inside eBay's reply is never used or fetched.
- **Price drops** alert again only for searches with `dropPercent` set.
- **A listing is known by eBay's item number**, so its variations count as one listing.
- **A listing that's been gone for two days is forgotten**, so if it comes back it alerts again.
- **A search too wide to see in one go** (more than 600 results) only watches the newest 600. Older listings drifting into view don't alert; newly created ones do. `GET /deals/searches` shows `"complete": false` for a search like that.
- **Each alert says where the listing stands** among the current matches ("Cheapest of 14 matches right now; the next is £110.00"). That's worked out from the one reply and never stored.

## Before switching it on
1. **eBay developer account.** Free. Sign up at https://developer.ebay.com/ and read the API License Agreement before accepting it: https://developer.ebay.com/join/api-license-agreement
2. **A Production keyset**, at https://developer.ebay.com/my/keys. It starts disabled until the account-deletion step below is done.
3. **The account-deletion step.** eBay makes every developer either receive "marketplace account deletion" notifications at a public HTTPS address, or declare that the app doesn't keep eBay data: https://developer.ebay.com/develop/guides/sell/marketplace-user-account-deletion
   - This server exposes nothing to the internet, so it can't receive those notifications.
   - With `DEALS_SEEN=memory` the watcher writes nothing from eBay to disk, which is what the "Not persisting eBay data" declaration says. That's the setting this is built to run with.
   - `DEALS_SEEN=disk` saves the ids of listings already alerted. Whether that still fits the declaration is not something eBay has answered. Don't use it without asking eBay first, or setting up the notifications.
4. **Put the keys in `api/.env`** (never anywhere else):
   ```
   EBAY_CLIENT_ID=your-app-id-here
   EBAY_CLIENT_SECRET=your-cert-id-here
   ```
5. **Test the keys** before anything else: `bash host/ebay-check.sh`. It asks eBay for a token and runs one search for one listing, and prints eBay's status codes, a count, and eBay's own error message if it says no. It never prints the keys or the token. `bash host/ebay-check.sh sandbox` tests Sandbox keys instead.

### If eBay says no
`Search: eBay replied 403` means the keys can mint a token but aren't allowed to search. eBay's page on the Buy APIs says production use is for approved partners (https://developer.ebay.com/api-docs/buy/static/buy-requirements.html), though replies from eBay's developer support on its forum (2024 and 2025) say the search call needs nothing more than an application token (for example https://community.ebay.com/forum/search-api-57966/topic/ebay-buy-api-application-for-productive-usage-467027/). If it's refused:
- Check the keyset isn't still marked disabled or non-compliant at https://developer.ebay.com/my/keys.
- Use the Sandbox meanwhile: create Sandbox keys, set `EBAY_ENVIRONMENT=sandbox`, and every message is labelled "sandbox". Its listings are made up, so it proves the plumbing, not the deals.
- Ask eBay Developer Support. Leave `DEALS=off` until it's sorted.

## Settings in `api/.env`
| Line | Values | Needed |
|---|---|---|
| `DEALS` | `on` or `off` | always, like every switch |
| `DEALS_SEEN` | `memory` or `disk` | while `DEALS=on` |
| `EBAY_ENVIRONMENT` | `production` or `sandbox` | while `DEALS=on` |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | the keyset's App ID and Cert ID | while `DEALS=on` |
| `NTFY_TOPIC` | the topic the alerts already use | while `DEALS=on` |

A missing switch, or a value that isn't one of those listed, stops the API starting and names the line.

To switch on: set `DEALS=on`, then `docker compose up --build --wait api`. To switch off: `DEALS=off` and the same command.

## The search list: `deals/searches.json`
Copy `api/src/modules/deals/searches.example.json` to `deals/searches.json` and edit it. Git ignores it, because this repo is public and the list says what I'm shopping for and how much I'll pay.

```
{
  "limits": { "callsPerDay": 1000, "alertsPerDay": 60, "alertsPerCheck": 5 },
  "searches": [
    {
      "id": "optiplex-7070-sff",
      "name": "OptiPlex 7070 SFF",
      "switch": "on",
      "query": "optiplex 7070 sff",
      "maxPrice": 150
    }
  ]
}
```

Every search needs `id`, `name`, `switch` and `query`. Everything else is optional.

| Setting | What it does |
|---|---|
| `id` | Lower-case letters, digits and hyphens. The watcher's memory of a search hangs on this, so changing it starts the search fresh. |
| `name` | Shown in the alert's title. Plain letters, digits, spaces and `. , : + & ( ) ' / _ -`, 40 at most. |
| `switch` | `on` or `off`, written out. Off searches are never sent to eBay. |
| `query` | The keywords, as typed into eBay. All words must match. `(a, b)` means either. 100 characters at most, no `*`. |
| `minPrice`, `maxPrice` | Pounds, for the item itself. A `minPrice` keeps out accessories and too-good-to-be-true listings. |
| `maxWithPostage` | Pounds, for the item plus its cheapest postage. When eBay doesn't show postage, only the item price is compared. |
| `conditions` | Any of: `new`, `opened`, `certified refurbished`, `excellent refurbished`, `very good refurbished`, `good refurbished`, `seller refurbished`, `used`, `for parts`. Left out, any condition matches. |
| `buying` | `["buy it now"]` (the default), `["auction"]`, or both. |
| `endingWithinHours` | For auctions: only alert once the auction is this close to ending. |
| `ukOnly` | `true` (the default) means the item is in the UK. `false` means anything that delivers to the UK. |
| `exclude` | Words or phrases that rule a listing out, matched as whole words in the title, any case. `repair*` matches any word starting with `repair`. |
| `mustInclude` | Words or phrases the title must contain, matched the same way. |
| `categoryId` | One of eBay's category numbers. eBay's page for this call allows one per request. |
| `sellerMinPercent`, `sellerMinFeedback` | Minimum positive-feedback percentage and number of ratings. A seller whose numbers eBay doesn't give is ruled out. |
| `everyMinutes` | How often to check, 5 to 1440. Default 30. |
| `dropPercent` | Alert again when a seen listing's price falls by this much since its last alert. |

A mistyped setting name is refused, not ignored, so `"maxprice"` can't quietly remove a price limit. If the file has a problem, nothing is checked, and the problem (which search, which setting) shows in `/system/alerts`, and on the phone while `ALERTS=on`, until it's fixed.

`limits` is optional: `callsPerDay` (default 1000, eBay's own default limit for this API is 5,000 a day), `alertsPerDay` (60) and `alertsPerCheck` (5).

## What's kept where
- **In memory only:** the listings from each search's last check (titles, prices, links). They're gone on restart and never shown once they're more than six hours old.
- **`deals/state.json`:** each search's fingerprint, when it started and was last checked, and today's counts. Nothing from eBay.
- **With `DEALS_SEEN=disk` only:** the ids of listings already alerted, with times, and their price if the search uses `dropPercent`. Never titles, links or anything about the seller.
- **Never, anywhere:** seller names or ids. The watcher reads a seller's feedback numbers for the `sellerMin…` checks and the alert, and nothing else about them.

With `DEALS_SEEN=memory`, a restart doesn't lose much: the watcher knows when each search was last checked with nothing held back, so its first check after a restart alerts only listings created since then. If the gap is more than a day, the search starts fresh with a "now watching" message. If alerts were being held back when it restarted (a failed send, or the daily limit), the ones already sent from that check can come again: repeating one is better than losing one.

Deleting `state.json` while the API is stopped is safe: every search starts fresh and the day's counts start again. While it's running, the watcher writes the file back at its next check.

## When something's wrong
Problems go through the same alerts as everything else on the server (`/system/alerts`, the daily summary, and the phone while `ALERTS=on`):
- The search list has a problem.
- eBay refused the keys, or says they can't search (straight away, and that source is left alone for an hour).
- eBay refused one search, for example a category number it doesn't know (straight away; editing the search tries it again at the next check).
- eBay couldn't be reached, sent something unreadable, or said too many requests (after three checks running).
- The state file couldn't be saved.
- The day's call limit is used up.

## Routes and tools
All behind the API token, and all 404 with "The deal watcher is switched off" while `DEALS=off`.
- `GET /deals/status`: last run, today's counts, where seen listings are kept, problems.
- `GET /deals/searches`: each search and how its last check went.
- `GET /deals/matches`: the current listings for each search, cheapest first.
- `POST /deals/check`: check every switched-on search now, and say how many were checked, how many alerts went, and whether any couldn't be sent. Refused if asked twice within a minute.

The MCP server offers `get_deal_status` and `get_deal_searches`. Neither includes listings.

## Staying inside eBay's terms
Not legal advice, and the agreement changes, so read the live page: https://developer.ebay.com/join/api-license-agreement. What the watcher does about the parts that matter:
- **Only the official API**, with an application token that has no buying, bidding or account scope.
- **Reasonable volume**: its own daily cap, one page of 200 per search in the usual case, and it backs off for an hour when told too many requests (a check asked for by hand tries again at once).
- **No seller names or ids stored**, and nothing from eBay on disk at all with `DEALS_SEEN=memory`.
- **Nothing stale shown**: matches older than six hours are dropped.
- **No price history and no price modelling.** The agreement has a clause against using eBay's data to suggest or model prices, and another about deriving average prices, so the watcher keeps no record of prices over time.
- **Listings don't go to an AI.** The agreement was updated in 2025 with clauses about AI, so the MCP tools leave listings out until eBay has said in writing that passing them to an assistant is allowed.

## Adding another source later
A source is one file that turns a search into a list of listings (`api/src/modules/deals/source.ts` has the shape, and `ebay.ts` is the first). To add one: write the adapter, add it to the `sources` list in `setup.ts`, and give searches `"source": "its-name"`. Only add a source that has an official API or feed. Each search belongs to one source, and the phone page groups by search, so listings from different places are never mixed in one list.

## Not built, and why
- **Price history per search**: eBay's terms on price modelling, and it would mean keeping eBay's data.
- **Sold prices**: eBay's Marketplace Insights API isn't open to new developers.
- **Listings in the MCP tools, and a PC-build skill on top**: waiting on eBay's answer about AI.

Records 0016 to 0019 in `docs/decisions/` have the reasoning.

## Questions for eBay
One ticket to eBay Developer Support would settle the three things held back:
1. For the Marketplace Account Deletion exemption: does saving only the item numbers of listings already notified, with no user data, count as persisting eBay data?
2. May current Browse API search results be passed to an AI assistant, not for training, to answer my own questions about them? Is the Browse API a "Restricted API" under the licence?
3. May I keep a record of the asking prices my own searches returned over time, to judge whether a new listing is good value for me?

A yes to 1 makes `DEALS_SEEN=disk` safe to use, a yes to 2 opens listings to the MCP tools, and a yes to 3 opens price history.