# The deal watcher

The API checks eBay on a schedule for listings that match searches I set, and sends an ntfy alert when a new one appears. Each listing alerts once. It can also watch HotUKDeals' feed of new deals. It only ever reads: it has no way to buy, bid, make an offer or message anyone.

It's built switched off (`DEALS=off`), and every search has its own switch.

## What it does on each check
Every 5 minutes the API asks the watcher to run. The watcher:
1. Reads `deals/searches.json` again, so an edit needs no restart.
2. For each search that's switched on and due (its `everyMinutes` has passed), asks eBay's Browse API for the matching listings, newest first, or for a HotUKDeals search, reads that site's feed of new deals.
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
   - `DEALS_SEEN=disk` saves the ids of the listings each search has seen (every match from its first check on, not only the ones alerted). Whether that still fits the declaration is not something eBay has answered. Don't use it without asking eBay first, or setting up the notifications.
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
| `DEALS_AI` | `on` or `off`: whether Claude's tools may read the listings | while `DEALS=on` |

A missing switch, or a value that isn't one of those listed, stops the API starting and names the line.

To switch on: set `DEALS=on`, then `docker compose up --build --wait api`. To switch off: `DEALS=off` and the same command.

## The search list: `deals/searches.json`
Copy `api/src/modules/deals/searches.example.json` to `deals/searches.json` and edit it. Git ignores it, because this repo is public and the list says what I'm shopping for and how much I'll pay. A catalogue of 112 more searches, all switched off, is in `catalogue.example.json` beside it: see "The catalogue" below.

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

Every search needs `id`, `name`, `switch` and `query`. Everything else is optional. There can be 150 searches at most, counting every file.

| Setting | What it does |
|---|---|
| `id` | Lower-case letters, digits and hyphens. The watcher's memory of a search hangs on this, so changing it starts the search fresh. |
| `name` | Shown in the alert's title. Plain letters, digits, spaces and `. , : + & ( ) ' / _ -`, 40 at most. |
| `switch` | `on` or `off`, written out. Off searches are never sent to eBay. |
| `group` | Which kind of part it's for: `whole pc`, `server`, `cpu`, `motherboard`, `ram`, `storage`, `graphics`, `power supply`, `case`, `cooling`, `network`, `expansion`, `ups` or `other`. Claude's tools can ask for one group's matches. |
| `source` | `ebay` (the default) or `hotukdeals`. See "HotUKDeals" below. |
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
| `avoid` | Built-in lists of title words that rule a listing out, on top of `exclude`. Any of: `faulty`, `incomplete`, `parts only`, `lots`, `laptop ram`, `server ram`. The words in each are in `avoidLists` at the top of `searches.ts`. |
| `sellerType` | `business` or `private`. Leave it out for either. A seller eBay hasn't labelled is let through. |
| `postageShown` | `true` hides listings that show no postage price, which usually means collection only. |
| `returnsOnly` | `true` asks eBay for listings that accept returns. |
| `autoCorrect` | `true` lets eBay correct a misspelt query. |
| `details`, `detailsMode` | eBay's own item details, like `{ "Form Factor": ["SFF"] }`. Needs a `categoryId`. See "Item details" below. |
| `hideDetails` | Up to 3 item details whose listings are hidden, like `{ "Form Factor": ["SO-DIMM"] }`. Needs a `categoryId`, and a name can't also be in `details`. See "Item details" below. |
| `collectionMiles` | Only listings you can collect within this many miles (1 to 100) of the `postcode` at the top of the file. Can't be used with `freePostage` or `postageShown`. |
| `freePostage` | `true` asks eBay for listings with free postage only. Can't be used with `collectionMiles`. |
| `hideVariations` | `true` hides listings with several options (sizes, colours), because eBay shows only the cheapest option's price, which can make a 1 TB option look like a cheap 4 TB drive. They count under `options` in the search's hidden numbers. |
| `guidePrice`, `guideDate`, `greatPercent` | What you'd call a fair total price, in pounds, the day you set it, and how far under it counts as a great deal (default 20). See "Guide prices" below. |
| `unit` | `GB` or `TB`: adds a price per unit to each alert, with the size read from the title. Only sensible when the search is for one kind of thing, like RAM kits or drives. |
| `alertsPerDay` | This search's own daily limit on notifications, on top of the overall one. The rest wait until tomorrow. |
| `endingSoonMinutes` | For auctions: one more alert when an auction you've already been told about is this close to ending, 5 to 720 and at least `everyMinutes`. |

A mistyped setting name is refused, not ignored, so `"maxprice"` can't quietly remove a price limit. If the file has a problem, nothing is checked, and the problem (which search, which setting) shows in `/system/alerts`, and on the phone while `ALERTS=on`, until it's fixed.

`limits` is optional: `callsPerDay` (default 1000, eBay's own default limit for this API is 5,000 a day), `alertsPerDay` (60) and `alertsPerCheck` (5).

`postcode` is optional: your postcode for searches with `collectionMiles`. Its first half alone (`"LS1"`) is accepted too, but whether eBay works with only half wasn't tested, so check the first results. It's only ever sent to eBay inside those searches. Git ignores this file, so it stays on the server.

`more` is optional: up to 5 other files in the `deals` folder whose searches are read after this file's, like `"more": ["catalogue.json"]`. Each holds only a `searches` list; limits, quiet hours and the postcode come from `searches.json`. Ids can't repeat across files, and a problem in one names its file. Written as `{ "file": "catalogue.json", "switch": "on" }`, every search in that file is on whatever its own `switch` says (or all off, with `"off"`), so a fresh copy of the catalogue needs no editing. Each search still needs a valid `switch` of its own.

`quiet` is optional: `{ "from": "23:00", "to": "07:00", "allow": "great" }`. Between those times, by the clock in London, deal alerts are held and sent at the first check after. `"allow": "great"` lets great deals and ending-soon alerts through; leave it out and neither does. An ending-soon alert that was held is sent afterwards only if the auction is still inside its window. Two messages still arrive, silently: "now watching" (it only follows a change you just made) and the daily "alerts paused" notice. Check now doesn't override quiet hours.

## What's kept where
- **In memory only:** the listings from each search's last check (and HotUKDeals' feed, kept for five minutes): title, prices, link, condition, the seller's rating and whether they're a business, the town and postcode district eBay shows, and eBay's short summary. They're gone on restart and never shown once they're more than six hours old. A listing read in full (description, item specifics, returns) is kept for half an hour, also only in memory.
- **`deals/state.json`:** each search's fingerprint, when it started and was last checked, today's counts (overall and for each search), and which searches are snoozed. Nothing from eBay.
- **With `DEALS_SEEN=disk` only:** the ids of the listings each search has seen (every match from its first check on, not only the ones alerted), with times, their price if the search uses `dropPercent`, and a mark once an auction's ending-soon alert has gone. Never titles, links or anything about the seller.
- **Never, anywhere:** seller names or ids. The watcher reads a seller's feedback numbers for the `sellerMin…` checks and the alert, and nothing else about them.
- **Claude Code's transcripts, while `DEALS_AI=on`:** Claude Code saves every tool reply in its session files under `~/.claude/projects/` and keeps them for `cleanupPeriodDays` (30 days unless set, 1 at least). So listings Claude read are on disk there, outside this repo, until those files are cleaned up. That sits uneasily with "not persisting eBay data". Setting `cleanupPeriodDays` to 1 in `~/.claude/settings.json` shortens it; switching `DEALS_AI` off stops it.

With `DEALS_SEEN=memory`, a restart doesn't lose much: the watcher knows when each search was last checked with nothing held back, so its first check after a restart alerts only listings created since then. If the gap is more than a day, the search starts fresh with a "now watching" message. If alerts were being held back when it restarted (a failed send, or the daily limit), the ones already sent from that check can come again: repeating one is better than losing one.

Deleting `state.json` while the API is stopped is safe: every search starts fresh and the day's counts start again. While it's running, the watcher writes the file back at its next check.

## Item details
Sellers fill in structured details on a listing (eBay calls them aspects): form factor, RAM size, processor. Matching on those catches listings with poor titles, but a seller who left them blank won't match, and those are often the bargains. So there are two modes:
- `"detailsMode": "prefer"` (the default): every listing your other rules allow still alerts. One extra call asks eBay which of them also match the details, and the alert says so. Nothing is hidden.
- `"detailsMode": "only"`: eBay returns only listings whose details match.

The names and values have to be eBay's own, exactly. To see them for a query, on the server:
```
bash host/hub-get.sh "/deals/details?q=optiplex+7070"
```
The reply gives eBay's main category for those words (`categoryId`), other categories, and each detail name with its commonest values and how many listings have each. Add `&categoryId=179` to look inside one category. Then in the search: `"categoryId": 179, "details": { "Form Factor": ["SFF", "Small Form Factor"] }`. If eBay refuses a name or value, or warns about one, the search fails and the problem shows in the alerts with eBay's number. Whether eBay always warns about a wrong name couldn't be checked without real keys, so compare the first few alerts with the listings themselves.

Two more lookups use eBay's Taxonomy API, which says what sellers can fill in rather than what they did:
```
bash host/hub-get.sh "/deals/categories?q=ddr4+32gb"
bash host/hub-get.sh "/deals/categories/170083/details"
```
The first suggests categories for some words, each with its number and where it sits ("Computers, Tablets & Network Hardware > Computer Components & Parts > Memory (RAM)"). The second lists one category's details: each name, whether sellers must fill it in, whether they type it freely (so spellings vary) or pick from eBay's list, and up to 100 values. Only the last level of categories has details; asking for one higher up says so.

Each lookup is one eBay call (the first category lookup after a restart is two), they count towards the 150 full reads a day, and at most one lookup of any kind is allowed every ten seconds.

**Hiding by details.** eBay can only be asked for listings that *have* a detail, not ones that don't. So `hideDetails` asks again for each name, with the values to hide (and, in `"only"` mode, the search's own `details` too), and hides the listings that come back. Listings whose seller left that detail blank still show, which is the point: blank details are often the bargains, and the title words in `avoid` still catch many of them.

Each name reads up to as many pages as the search itself did, so usually it's one more call per check. The pages a check may use are shared out so the search always gets at least one; when the day's calls are nearly used up, a check can go up to three calls over.

If that extra question returns as many listings as the search itself, the name is probably wrong (eBay may ignore a name it doesn't know), so the search fails with a message rather than hiding everything. Hidden listings count under `details` in the search's hidden numbers.

## Guide prices
`guidePrice` is your own number: what you'd call a fair price for the thing, postage included. Each alert then says how far under or over it the listing is, and:
- at least `greatPercent` under (default 20): high priority, so the phone makes more of it, and it comes through quiet hours that allow great deals;
- over the guide price: low priority, so it arrives silently;
- anything else: as now.

An auction's current bid isn't judged like this: a 99p opening bid isn't a great deal. Its ending-soon alert says how the bid compares, worded as a bid.

Set `guideDate` to the day you chose the price. After 30 days the alert reminds you to check it's still right. The watcher never works a price out from eBay's listings: eBay's agreement doesn't allow using its data to suggest or model prices, so the judgement stays yours (record 0021).

## What an alert says about the seller
- **Business seller or private seller**, when eBay says which. The seller chooses this when they register, so treat it as a hint.
- **Check first**, when something deserves a second look: under 10 ratings, a price under half your guide price, or a listing with more than one option (the price shown may be for the cheapest).

Why the seller type matters, as the research for this read the sources (not legal advice):
- Buying from a business, the Consumer Rights Act 2015 applies, and a sale made at a distance usually comes with 14 days to cancel under the Consumer Contracts Regulations 2013. https://www.legislation.gov.uk/ukpga/2015/15/section/2 and https://www.legislation.gov.uk/uksi/2013/3134/regulation/30
- Buying from a private seller, the item only has to match its description. https://www.legislation.gov.uk/ukpga/1979/54/section/13
- eBay's Money Back Guarantee covers an item that doesn't arrive, is faulty or doesn't match the listing, when you pay at eBay's checkout. Paying any part outside eBay loses it. A collected item is covered when the seller scans your collection code. https://www.ebay.co.uk/help/policies/ebay-money-back-guarantee-policy/ebay-money-back-guarantee-policy?id=4210

## Snoozing a search
Each switched-on search has a Snooze button on the hub page, and Wake while it's snoozed. A snoozed search isn't sent to eBay at all, even by Check now, so it costs no calls. The button snoozes for a day. For another length, or until woken:
```
bash host/hub-post.sh /deals/searches/optiplex-7070-sff/snooze '{"hours":72}'
bash host/hub-post.sh /deals/searches/optiplex-7070-sff/snooze
bash host/hub-post.sh /deals/searches/optiplex-7070-sff/wake
```
When a snooze ends, listings that appeared meanwhile alert in the usual way, cheapest first. Snoozes are kept in `state.json`, so they survive a restart. With `DEALS_SEEN=memory`, a search that was snoozed for more than a day and restarted in between starts fresh with a "now watching" message instead. Snoozing a search also clears any problem it was showing.

## The catalogue
`api/src/modules/deals/catalogue.example.json` holds 112 searches, every one switched off, across all the groups: 27 whole PCs, workstations and small servers, 16 CPUs, 7 motherboards and 3 CPU-and-board bundles, 8 kinds of RAM, 9 kinds of storage, 8 graphics cards, 4 power supplies, 8 cases, 3 coolers and a fan pack, network cards, storage cards, a UPS, and 12 HotUKDeals searches. With your own searches that's 150 at most, so the catalogue leaves room for 38 of yours. To use it:
1. Copy it to `deals/catalogue.json`.
2. Add `"more": ["catalogue.json"]` to `deals/searches.json`, and switch on the searches you want in your copy. Or add `"more": [{ "file": "catalogue.json", "switch": "on" }]` to switch them all on without touching the copy; then a newer catalogue is just a fresh copy. That switches every one on at once, without step 3's checks, and with all of them on they need more eBay calls a day than the default `callsPerDay` of 1000 (the last point under "How much to trust it").
3. Before switching one on, check its words with `/deals/details?q=...` and its category with `/deals/categories?q=...`, and set your own guide price.

How much to trust it:
- Only the RAM searches have a category: 170083, Memory (RAM), seen on an ebay.co.uk page, and for `ddr4-rdimm-32gb` 11210, Server Memory (RAM), which is eBay's number on its US site and unconfirmed for eBay UK until `/deals/categories?q=32gb%20ddr4%20ecc%20rdimm` shows it. The others have none on purpose: a wrong category quietly finds nothing.
- Guide prices are used prices, and every one is an estimate made without sold prices. For RAM and hard drives they were set against UK new prices in November 2026 (ramprices.uk, disks.co.uk): roughly half of new for RAM, and £15 to £18 a terabyte for used or recertified drives. The rest have nothing firmer behind them.
- The desktop RAM searches hide `Form Factor: SO-DIMM` (the laptop RAM search hides `DIMM`, and the server RAM search hides nothing). The SO-DIMM value was seen on an eBay page; that it's spelt the same on eBay UK is a guess until `/deals/categories/170083/details` confirms it.
- The searches added for building a tower from parts (AM4 and 12th-gen Intel CPUs, their boards and bundles, 32GB sticks, Xeon workstations, two 12GB graphics cards, 500GB and 512GB NVMe drives, bigger power supplies, tower cases, coolers) have guide prices that are my own estimates, made on 19 November 2026 from UK shop prices, price trackers (PriceSpy, gpudojo) and second-hand prices that came up in web searches. The cases, coolers, the i7-12700, the X570 and B660 boards, the bundles and the workstations have less behind them.
- `ddr4-rdimm-32gb` is server RAM on purpose, for the ThinkStation P520, the HP Z440, and the Xeon W versions of the Precision 5820 and HP Z4 G4: it searches eBay's server memory category and doesn't hide registered RAM. The catalogue's Xeon E machines (Z2 G4, Precision 3630, P330, T140, MicroServer Gen10 Plus, C246 boards) take unbuffered RAM: that's `ddr4-ecc-udimm`. The MicroServer Gen8 takes DDR3.
- The three bundle searches need "bundle", "combo" or "kit" in the title. A CPU and board sold together can also turn up in a CPU or motherboard search, for example when its title doesn't say "bundle" or "combo"; the skills read titles, so they treat it as a bundle.
- The six server searches exclude spare-part words (motherboard, board only, psu only and so on) instead of using the `parts only` list, which would also hide whole servers whose titles mention a drive caddy, a bezel or a riser. They don't use the `incomplete` list either, because servers are often sold without drives ("No HDD"). The five SSD and NVMe searches use `hideVariations`. The four hard-drive searches don't: used drive sellers often put several sizes in one listing, and hiding those hid nearly every 4TB and 8TB match.
- If every search were on, they'd use roughly 850 eBay calls a day when each one's results fit in a page of 200, before your own searches. A search with more reads up to three pages, and each hidden detail as many again, so the most is about 2,500. `callsPerDay` defaults to 1000, so with everything on, raise it in `limits` (eBay's own default limit for this API is 5,000 a day). HotUKDeals' feed is read at most every five minutes and doesn't count towards eBay's calls.

## HotUKDeals
HotUKDeals publishes a feed of every new deal at `https://www.hotukdeals.com/rss/new` (the newest 30). Its robots.txt allows `/rss/`, and its terms say nothing about automated access; they do restrict passing its content to others, and nothing here does. A search with `"source": "hotukdeals"`:
- reads that one address, at most once every five minutes however many feed searches there are (a failed read is remembered for five minutes too), and never follows a redirect;
- keeps the deals whose titles have every word of its `query` and that pass its `exclude`, `mustInclude`, `avoid` and price rules (the price is the one the poster gave; deals with none are skipped);
- can't use eBay's own settings, like `conditions`, `categoryId` or the seller ones;
- links to the deal's page on HotUKDeals, and can't be read in full;
- doesn't count towards the day's eBay calls, and keeps being checked after they run out.

It's the newest 30 deals across the whole site, so a niche part will rarely turn up, and a deal posted between two reads can be missed on a busy day. The temperature (votes) is taken off the title. How the parser reads the feed was built from one copy of it, so look at the first alerts before trusting it.

## Letting Claude read the listings
With `DEALS_AI=on`, two more MCP tools work:
- `get_deal_matches`: the 15 cheapest current matches of every search, up to 50 for one search when asked for it by id, or only the ones asked for by `group`, `searches`, title `words` or listing `ids`, with `maxTotal` (pounds, with postage) and `limit` (per search) alongside, with everything the watcher holds about each one. With filters, each search's `count` is how many of its matches passed them, looked for among all its matches, not just the cheapest 50. One reply holds about 45,000 characters at most, shared round the searches cheapest first, because Claude Code saves any tool reply over 50,000 characters to a file; `cut: true` says some didn't fit.
- `get_deal_listing`: one of those in full, by its item number: the seller's description as plain text, the item specifics, the condition note, returns, postage options, collection and stock. This asks eBay, once per listing every half hour, out of the day's calls, and at most 150 listings (or item-detail lookups) a day, so a session that tries to read everything can't use up the calls the searches need.

With `DEALS_AI=off` both reply 403 and no listing leaves the API through them. The hub page isn't affected either way.

The switch covers Claude's tools, not the API as a whole. `/deals/matches` and `/deals/listing/<item number>` still answer anything that has the API token, because that's how the hub page works. A Claude Code session in this repo could run `host/hub-get.sh` against them, so `CLAUDE.md` tells it not to while the switch is off.

Two skills in `.claude/skills/` use them: `pc-build` puts together the best PC for a budget, and `deal-check` compares the matches for one kind of part, or listings you name. Every session in this repo may search the web and open the maker and spec sites listed in `.claude/settings.json` without asking (record 0029); any other site still asks, and eBay's own pages are refused.

Two things to know before switching it on:
- **Sellers write the text.** A title or description can say anything, including something written to steer an AI ("ignore your instructions and..."), and text hidden with styling in a description comes through as ordinary text. These two tools only read, and nothing on the hub can buy, bid or message a seller. But the text lands in a session that may have other tools: in Claude Code that's the shell, file edits and the hub's three actions. What stops a misled session acting is Claude Code asking you first, so don't run it with those prompts skipped while it's reading listings. Both tools and every reply say to treat seller text as claims to check, never as instructions.
- **eBay's agreement.** The copy at https://developer.ebay.com/join/api-license-agreement that could be read while building this is dated 26 June 2023 and says nothing about AI. A research pass read a copy dated 3 September 2025 which it says bans training AI on eBay's data and passing data from "Restricted APIs" to non-eBay AI tools, without saying whether the Browse API is one. Reading listings to answer your own questions isn't training, but eBay hasn't confirmed it's allowed. That's why this has its own switch, and why record 0020 is yours to accept or not.

## If the eBay keys leak
The repo is public, so this is the order that matters:
1. Make new keys first: on https://developer.ebay.com/my/keys rotate the Cert ID (the client secret). The old one stops working.
2. Put the new value in `api/.env` and run `docker compose up --build --wait api`.
3. Check eBay's usage page for calls you didn't make.
4. Only then tidy the history. Removing the secret from git doesn't un-leak it: forks and caches keep copies.

GitHub can stop most of this happening: turn on secret scanning and push protection in the repo's settings (Settings, then Code security). GitHub's own lists include eBay's key formats. https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning-for-partners

## What the API's log holds
Requests for one listing in full are left out of the API's request log, so item numbers don't reach Docker's log files. Other deal requests are logged like any other, and their addresses hold nothing from eBay.

## When something's wrong
Problems go through the same alerts as everything else on the server (`/system/alerts`, the daily summary, and the phone while `ALERTS=on`):
- The search list has a problem.
- eBay refused the keys, or says they can't search (straight away, and that source is left alone for an hour).
- eBay refused one search, for example a category number it doesn't know (straight away; editing the search tries it again at the next check).
- eBay couldn't be reached, sent something unreadable, or said too many requests (after three checks running, or straight away when eBay asks for a wait of more than an hour).
- The state file couldn't be saved.
- The day's call limit is used up.

## Routes and tools
All behind the API token, and all 404 with "The deal watcher is switched off" while `DEALS=off`.
- `GET /deals/status`: last run, today's counts, where seen listings are kept, problems.
- `GET /deals/searches`: each search and how its last check went.
- `GET /deals/matches`: the current listings for each search, cheapest first.
- `POST /deals/check`: check every switched-on search now, and say how many were checked, how many alerts went, and whether any couldn't be sent. Refused if asked twice within a minute.

- `GET /deals/listing/<item number>`: one current match in full. 404 if it isn't a current match, 410 if eBay says it's gone.
- `GET /deals/details?q=<words>&categoryId=<number>`: eBay's item details for a query.
- `GET /deals/categories?q=<words>`: eBay's suggested categories for some words.
- `GET /deals/categories/<number>/details`: one category's item details and their values.
- `POST /deals/searches/<id>/snooze` with `{"hours": 24}` (or nothing, for until woken), and `POST /deals/searches/<id>/wake`.
- `GET /deals/ai/matches` and `GET /deals/ai/listing/<item number>`: the same listings, for the MCP tools. 403 while `DEALS_AI=off`. The first takes `search=<id>` on its own, or any of `searches=<id>,<id>`, `group=<group>`, `words=<words>` and `ids=<id>,<id>`, with `maxTotal=<pounds>` and `limit=<1 to 50>` alongside one of those.

Nothing here changes `searches.json`, and there is still no route that buys, bids, makes an offer or messages anyone.

The MCP server offers `get_deal_status` and `get_deal_searches`, which never include listings, and `get_deal_matches` and `get_deal_listing`, which do and only work while `DEALS_AI=on`.

## Staying inside eBay's terms
Not legal advice, and the agreement changes, so read the live page: https://developer.ebay.com/join/api-license-agreement. What the watcher does about the parts that matter:
- **Only the official API**, with an application token that has no buying, bidding or account scope.
- **Reasonable volume**: its own daily cap, one page of 200 per search in the usual case, and it backs off for an hour when told too many requests (a check asked for by hand tries again at once).
- **No seller names or ids stored**, and nothing from eBay on disk at all with `DEALS_SEEN=memory`, apart from Claude Code's own transcripts while `DEALS_AI=on` (see "What's kept where").
- **Nothing stale shown**: matches older than six hours are dropped.
- **No price history and no price modelling.** The agreement has a clause against using eBay's data to suggest or model prices, and another about deriving average prices, so the watcher keeps no record of prices over time.
- **Listings go to an AI only when you switch that on.** `DEALS_AI` has to be written out as `on` or `off`, and listings reach Claude's tools only while it's `on`. The reasons are in "Letting Claude read the listings".
- **Only eBay's own API host is ever called**, checked again just before each request, and a wait eBay asks for is kept (at least ten minutes, at most a day). The category lookups use the same host and the same application token.
- **Guide prices stay mine.** Nothing works a price out from eBay's listings; the catalogue's guide prices came from shop price indexes or my own estimates.
- **The skills never open eBay's pages.** eBay's User Agreement from 20 February 2026 bans AI agents using its site without permission; the API is the permitted way in.

## Adding another source later
A source is one file that turns a search into a list of listings (`api/src/modules/deals/source.ts` has the shape; `ebay.ts` is the first and `feed.ts`, for HotUKDeals, the second). To add one: write the adapter, add it to the `sources` list in `setup.ts`, and give searches `"source": "its-name"`. Only add a source that has an official API or feed. Each search belongs to one source, and the phone page groups by search, so listings from different places are never mixed in one list.

## Not built, and why
- **Price history per search**: eBay's terms on price modelling, and it would mean keeping eBay's data.
- **Sold prices**: eBay's Marketplace Insights API isn't open to new developers.
- **Ranking by price inside the watcher, beyond "cheapest of N"**: close to modelling prices, so it waits for eBay's answer. The `deal-check` skill compares current listings for my own buying decision when I ask, and nothing it works out is kept.
- **A spec reference file for the skills**: only one model's specs were checked against its maker in November 2026, and a file of unchecked facts would be worse than looking them up.
- **A Snooze button on the notification itself**: it would put a link that changes something into a public ntfy topic and need a route with no token (record 0022).
- **Editing searches from the phone**: a route that rewrites `searches.json` is a lot of new surface for something VS Code already does.
- **Other marketplaces**: none passed the "official API or feed an individual can get" test in November 2026 apart from HotUKDeals' feed. Gumtree, CeX, Back Market and PCPartPicker have no public API for buyers; Amazon's Creators API needs 10 affiliate sales in the last 30 days, and AliExpress's an affiliate account; Reddit stopped taking new API apps, and its RSS feeds were reported ended in November 2026; Vinted's is for business sellers; Facebook Marketplace has none and forbids scraping.

Records 0016 to 0022 and 0026 to 0030 in `docs/decisions/` have the reasoning.

## Questions for eBay
One ticket to eBay Developer Support would settle what's still open:
1. For the Marketplace Account Deletion exemption: does saving only the item numbers of listings already notified, with no user data, count as persisting eBay data?
2. May current Browse API search results be passed to an AI assistant, not for training, to answer my own questions about them? Is the Browse API a "Restricted API" under the licence?
3. May I keep a record of the asking prices my own searches returned over time, to judge whether a new listing is good value for me?
4. Does showing a price per GB for one listing, or saying where a listing ranks among the current results, count as using eBay content to suggest or model prices?
5. Does a personal app with one user need a public privacy policy?

A yes to 1 makes `DEALS_SEEN=disk` safe to use, a yes to 2 settles the question behind `DEALS_AI`, and a yes to 3 opens price history.