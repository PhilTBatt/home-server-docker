# 0059. "Tell me when" watchers are fixed kinds that Claude fills in, with my yes

- Date: 2026-11-26
- Status: accepted

## Context
I want to be able to say "tell me when X" to Claude Code or Jarvis and get one notification on my phone when it happens: a download finishing, the disk filling up, a service coming back. The hub already reads most of these things. The question was how much freedom Claude should have in setting one up, since whatever it sets up keeps running on the server after the chat ends.

## Options considered
Chosen 26 Nov: fixed kinds, Claude fills in. The kinds of thing that can be watched are fixed in the hub's code; Claude only picks a kind and fills in its numbers; and nothing is saved until I've said yes.

Lost: Claude writing its own checks or conditions. It would cover more, but it would let an AI decide what code or command runs on the server, which is the thing I least want an AI to decide.

Claude's picks, not discussed:
- A new switch, `WATCHERS`, off by default and written out like the others, needing `NTFY_TOPIC` while it's on.
- Three kinds, each something the hub already reads, with no new secret and no new place on the network: `download-finished` (a torrent whose name holds a few words finishes in qBittorrent after the watcher was made), `disk-free-below` (free disk space, as `GET /system/status` reads it, below a whole percentage from 1 to 99) and `service-answering` (qBittorrent or Jellyfin answering the hub). Not a train running late: the morning train alerts already do that carefully, and a per-minute check would spend more calls on the rail key. Not memory, Wi-Fi or backups: the alerts already send those.
- A download counts only if qBittorrent says it finished after the watcher was made, using its own completion time, so an old download with a matching name never fires one. The disk and service kinds fire at the next check if they're already true, since "tell me when Jellyfin is back" is still worth hearing if it already is.
- The only free text is a download's name fragment: 2 to 40 characters of letters, digits, spaces and `' - . , ( ) & / + : _`, refused if a word could be a pasted key, by the expiry list's own rules. It's used only to match names and in the notification, never run. A refusal never repeats what was sent. Every other field is a kind, a service from a fixed list, or a whole number with a range, and any field a kind doesn't take is refused.
- Each watcher lasts 24 hours unless given 1 to 168. If it never happens, it sends one low-priority note saying it stopped watching and that it didn't happen (and that the last check couldn't read its source, if so), then goes. It's cheap, since the sending is already there, and it tells me a download that never finished rather than leaving me waiting. The note is sent once, never retried.
- At most 10 at once, and the same watch can't be added twice.
- The check runs once a minute while any watcher exists, and reads nothing when none do. Each source a watcher needs is read once per check, with 8 seconds at most, through the media module's and `readStatus`'s own reads. A source that can't be read never fires or removes a watcher: its last check says so, `GET /watchers` and the server doctor show it, and it keeps trying until its time. A notification ntfy doesn't take is tried again at the next check; if it still hasn't gone by the watcher's time, it's dropped and the API's log says so.
- Kept in memory only. A restart or rebuild of the API forgets them without a word. Keeping them in a git-ignored folder like `expiry/sent.json` would survive that, but it means a new writable mount for the API, and these last a day by default, so I'd rather re-ask after a rebuild.
- The notification names only what I asked about, never a torrent's full name, since it goes through ntfy.sh.
- One notification is the aim, not a promise: a cancel in the moment it's being sent still notifies, and a send that ntfy answers too late to count is sent again at the next check.
- Routes `GET /watchers`, `POST /watchers` and `DELETE /watchers/<id>`, behind the hub's token like every route, with bodies over 1 KB refused. Ids are 8 random hex characters.
- Claude Code gets a read-only `get_watchers`, allowed without asking, and two actions, `add_watcher` and `cancel_watcher`, which ask every time and are left out by `bash host/hub-mcp.sh read-only`. Their input schema has the kind as a fixed list and every number with its range. Jarvis gets the same three tools, with the two actions only under `JARVIS_HUB_ACTIONS`, where his own code asks me yes or no first, saying exactly what would be watched and for how long, or that the hub won't accept it when the details aren't valid.
- The phone page lists them under "Watching for", each with a Cancel button, since cancelling is me tapping. It can't add one: adding stays with Claude, where my yes is asked for.
- The server doctor gets a thirteenth check, "Watchers", off with the switch off, and something to look at when a watcher couldn't read its source or is waiting to send.
- Jarvis never says a fired watcher out loud. That would be something new he says unprompted, which needs its own decision.

## Decision
With `WATCHERS=on`, the hub keeps up to 10 one-off watchers in memory, of three kinds fixed in its code, checks them once a minute, and sends one ntfy notification when each happens or gives up; Claude Code and Jarvis add and cancel them only as actions that ask me first.

## Confidence and the case against
Fairly confident in the rules (Claude's estimate): each kind, refusal and timing is tested against made-up sources, and the real API was run against stand-ins for qBittorrent, Jellyfin and ntfy. Less sure three kinds are the right three; they're what the hub could already see. The case against: losing every watcher on a restart, silently, is exactly the moment I'd most want to know, because restarts come with updates. A phone alarm or qBittorrent's own notifications would cover the commonest case with no code. The disk check works in whole GB, so near a boundary it can be a percent out. And a fixed list will feel narrow quickly, and every new kind needs another decision.

## Consequences
- `WATCHERS` is a new switch in `api/.env`, so the API won't start without it.
- A new route that changes something on the hub, and two new actions for Claude Code and Jarvis that each ask first. `.claude/settings.json` allows `get_watchers` and asks for `add_watcher` and `cancel_watcher`.
- The MCP server can now send a JSON body and a DELETE to the API.
- A new kind means new code and a new decision; keeping watchers across restarts would be a later decision too.
