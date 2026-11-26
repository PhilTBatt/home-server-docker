# 0058. A server doctor answers "is everything OK?" from what the hub already sees

- Date: 2026-11-26
- Status: accepted

## Context
The hub already knows a lot about the server: disk and memory, Wi-Fi reconnects, backups, the heartbeat, qBittorrent and Jellyfin, and each switched-on feature's own problems. But it's spread over the alerts, the phone page's sections and a dozen tools, so "is everything OK?" means looking in several places. I want one answer, with what to try when something isn't fine, from the phone page, from Claude Code and from Jarvis.

## Options considered
Chosen 26 Nov: a "server doctor", one "is everything OK?" answer built from what the hub can already see.

Claude's picks, not discussed:
- One route, `GET /system/doctor`, in the system module beside the alerts, behind the hub's token like every route. It gives an overall state (`ok`, `warn` or `problem`), a summary in plain words, the time, and a list of checks, each with a name, a state (`ok`, `warn`, `problem` or `off`), a detail in plain words and what to try (null when it's ok or off). A feature that's switched off is `off`, never a problem.
- No switch of its own. It only reads what the other routes could already reach, so there's nothing new to switch off, and a new switch would be one more line the API refuses to start without.
- The twelve checks are what the API can really check: disk, memory, Wi-Fi, backups, the heartbeat, phone alerts, qBittorrent, Jellyfin, the brain inbox, the deal watcher, train times and the expiry list. Not the other containers (Caddy, AdGuard and the rest): the API can't see them without the Docker socket, which is never on the table. So "everything" means everything the hub can see, not every container.
- It reuses the alerts' own rules rather than copying them: low disk, low memory, Wi-Fi reconnects, a failed backup, and the deal watcher's and expiry list's problems come from the same `currentProblems` the alerts use, so the doctor and my phone never disagree. Its own additions are softer warnings: disk under a fifth free, the last good backup more than a week old, a deal watcher that has only used up the day's calls, and anything on the expiry list due within 7 days. Anything overdue on that list is a problem.
- Wi-Fi reconnects are something to look at, not a problem, since the server has already reconnected by the time I ask. The alerts still send them as before.
- Backups that have never run are `off`, since the timer stays off until there's somewhere to back up to.
- The heartbeat and the alert check now leave their last outcome in memory (worked or failed, and when), because the doctor can't otherwise know whether they work: before this they were only logged. It keeps no address and no error text, so nothing secret can leak through it, and a restart forgets it.
- qBittorrent, Jellyfin and the departure board are asked live, the way their own routes ask them, at the same time and with 6 seconds each at most, so the answer comes inside the 10 seconds Claude Code's hub tools wait for the API. So each check is one more call on my Rail Data Marketplace key while train times are on (three with a change station).
- Claude Code gets a read-only `get_doctor` tool, allowed without asking like the other read tools, and a `server-doctor` skill that calls it, looks into anything not fine with the other read tools, and suggests commands for me to run, since this repo's settings allow it no shell commands. It never runs `docker inspect`, `docker compose config` without `--quiet` or `env`, and never changes anything.
- Jarvis gets a code word, handled in his own code like "train times": "server check", "check the server", "how's the server (doing)" or "is the server OK", only phrases that name the server. "Is everything OK?" and "is everything all right?" aren't code words: they're everyday things to say to Jarvis, so with no switch for the code word they still go to Claude as before. He says the summary and the details of up to three checks that aren't fine, problems first; what to try goes on screen only. Jarvis's AI doesn't get `get_doctor` as a tool.
- The phone page gets an "Is everything OK?" section under the alerts: the summary, each problem and warning with what to try, then one line each for what's fine and what's off.

## Decision
`GET /system/doctor` gives one "is everything OK?" answer with twelve checks from what the hub can already see, reusing the alerts' rules, with no switch of its own; the phone page, Claude Code (`get_doctor` and the `server-doctor` skill) and Jarvis ("server check") all read it.

## Confidence and the case against
Fairly confident it can't tell me anything false about what it checks (Claude's estimate), since each check is tested against made-up states and the rules come from the alerts. Less sure about the warning levels (a fifth of the disk, a week for backups, 7 days for expiries): they're guesses at what's worth a look. The case against: it isn't really "everything". It can't see Caddy, AdGuard, Tailscale or any container the API doesn't talk to, so a broken DNS or proxy gets an "Everything's OK" as long as the API answers, and that confident answer may make me look less closely. The alerts and the phone page already show most of it, so this is mostly a new view of old facts. Asking qBittorrent, Jellyfin and the board on every ask makes it slower and spends rail calls. And the code word has no switch either: the server phrases no longer reach Claude once this is in, though no one says "how's the server?" to Jarvis meaning anything else, and "is everything OK?" still reaches him.

## Consequences
- No new switch, secret, package or container. A new route, a new read-only tool allowed in `.claude/settings.json`, a new skill and a new code word.
- The API keeps two more small things in memory: the heartbeat's and the alert check's last outcome and time.
- Adding a check later means adding it to `doctor.ts`, and it must stay something the API can already see.
