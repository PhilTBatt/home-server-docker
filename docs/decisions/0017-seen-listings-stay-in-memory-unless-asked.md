# 0017. Seen listings stay in memory unless asked

- Date: 2026-11-18
- Status: proposed

## Context
To alert once per listing, the watcher has to remember which listings it has already alerted. eBay disables a new production keyset until the developer either receives account-deletion notifications at a public HTTPS address, or declares "Not persisting eBay data". This server can't receive anything from the internet, so the declaration is the route that fits, and it has to be true. eBay hasn't said whether a saved list of item ids counts as persisting its data.

## Options considered
- In memory only: chosen as the setting to run with. Nothing from eBay is written to disk, so the declaration is plainly true. The cost is what a restart forgets, which the state file below mostly covers.
- A small file of item ids: built, behind `DEALS_SEEN=disk`, and left off. A restart loses nothing, but whether it fits the declaration is unanswered.
- A database (SQLite through Node's built-in module, so no new package): not built. It has the same question as the file, Node still marks the module as a release candidate, and a list this small doesn't need queries.
- Receiving eBay's notifications on a hosted function outside the house: not chosen for now. It would make saving ids clearly fine, but it's a new service to keep running for a problem the memory setting avoids.

## Decision
`DEALS_SEEN` is `memory` or `disk`, required while `DEALS=on`. Either way the watcher keeps `deals/state.json` with each search's fingerprint, when it was last checked, and the day's counts, none of which comes from eBay. With `memory`, the first check after a restart alerts only listings eBay says were created since that search was last checked, and treats the rest as seen; if the gap is over a day, the search starts fresh with one "now watching" message. With `disk`, the file also holds seen item numbers, their times, and a price only for searches that use `dropPercent`. Seller names and ids are never read into the watcher at all.

## Confidence and the case against
Fairly confident in `memory` as the setting to run with (Claude's estimate). The case against:
- After a restart in memory mode, a listing that was created before the last check but only reached eBay's search after it is treated as seen and never alerted. It still shows on the hub page.
- A listing whose price fell into range while the API was down isn't alerted in memory mode either, because it wasn't newly created.
- If alerts were being held back (a failed send, or the daily limit) when the API restarts in memory mode, the ones already sent from that check can come again.
- Two ways of remembering is more code and one more setting than one way.

## Consequences
- The declaration to eBay matches what the code does, and the tests check that memory mode writes no id, title, price or link.
- Switching from `disk` to `memory` removes the saved ids at the next save, and a damaged state file is deleted in memory mode, not kept aside.
- `DEALS_SEEN=disk` shouldn't be used until eBay has answered, or the notifications are set up.
