# deals

The deal watcher's own folder, mounted into the API container at `/deals`. Git ignores everything in it except this file.

- `searches.json`: your list of searches. Copy `api/src/modules/deals/searches.example.json` here to start, and edit it in VS Code. The watcher reads it again before every check, so a change needs no restart.
- `state.json`: written by the watcher. It always holds each search's fingerprint, when it was last checked, the day's counts of calls and alerts, and which searches are snoozed. With `DEALS_SEEN=disk` it also holds the ids of listings already alerted; with `DEALS_SEEN=memory` nothing from eBay is ever written here. Deleting it while the API is stopped is safe: each search starts fresh, with one "now watching" message instead of an alert per listing, and the day's counts start again. While the API is running it writes the file back at its next check.