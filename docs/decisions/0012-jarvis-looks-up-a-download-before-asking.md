# 0012. Jarvis's code looks up a download's name before asking

- Date: 2026-11-18
- Status: accepted

## Context
Record 0011's question showed only the first 8 characters of a download's hash, so I relied on what Jarvis said to know which download it was. Text he reads, such as a torrent name or a session's notes, could steer what he says. The API's downloads list uses qBittorrent's `downloading` filter, so a finished torrent that's been stopped isn't in it. Whether an unfinished, stopped one is wasn't confirmed: `mcp/src/tools.ts` says stopped torrents drop out, but a Python client for qBittorrent's API counts `stoppedDL` as downloading.

## Options considered
- Jarvis's code asks the API for that one torrent by its hash, through a new read-only route that finds it whatever its state, and shows its name: chosen. One route covers stopping and starting, and the name comes from qBittorrent, not from the model.
- Look the name up in the existing downloads list: not chosen. It depends on qBittorrent's `downloading` filter, which leaves finished torrents out and may leave stopped ones out too.
- Widen the existing list to include stopped torrents: not chosen. It would change what `get_downloads` and the phone page show, or need an option on the route. A route for one torrent is narrower.
- Show the whole hash: not chosen. 40 characters don't tell a person which download it is.
- Leave it as 0011 has it: not chosen. The actions can be undone, but a yes should know what it's saying yes to.

## Decision
- The API gets `GET /media/downloads/:hash`. It asks qBittorrent's `torrents/info` with `hashes=<hash>` and no state filter, and returns the same shape as the list. A hash qBittorrent doesn't have gets a 404 with `{ "error": "No torrent with that hash" }`. Anything other than 40 lower-case hex characters is refused with a 400 before qBittorrent is asked, as the stop and start routes already do.
- Before a stop or start question with a full hash, Jarvis's code calls that route with the API token, giving it at most 5 seconds and following no redirects. The question then shows the start of the hash, how far it got and, last, the name. That exact 404 says the hub doesn't have it. Any other reply, including the route not being there or a reply for a different hash, says the name couldn't be looked up. A hash that isn't full isn't looked up, and the question says so. Whatever happens, the question is still asked.
- The name is text from the internet, so it comes after the details the code controls, on one line, with hidden characters taken out, control characters shown as `�`, double quotes and look-alikes changed to `'`, and cut at 80 characters. This code never sends it to the model.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- The actions are low-stakes and can be undone, and I can already ask "what's downloading?" before saying yes. This adds code to the path that decides whether something runs.
- A torrent's name is chosen by whoever made it, so a misleading name is still possible. It's the same name qBittorrent shows me.
- One more API call before each stop or start question.

## Consequences
- One more read-only API route, behind the same token as the others. Applying it means rebuilding the API container.
- A stop or start question can take up to 5 seconds longer if the API is slow. That time doesn't count towards the question's limit.
- If the API hasn't been rebuilt with the route, Jarvis says he couldn't look up the name, not that the hub doesn't have the download.
- The route isn't an MCP tool, so the model can't look up a torrent by its hash. That's left for later.
