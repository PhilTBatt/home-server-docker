---
name: server-doctor
description: Checks whether everything on the home server is OK from the hub's server doctor, looks into anything that isn't with the hub's other read tools, and says in plain words what Phil could try. Use when asked if everything's OK, how the server is doing, for a server check or health check, or why something on the server seems wrong. Not for tuning the deal watcher's searches (deal-tune) or judging deals (deal-check).
---

# Is everything OK on the server?

This only reads and suggests. Never change anything: no restarts, no edits, no commits, no `docker compose up`, `down`, `stop`, `restart` or `prune`, unless Phil asks for that exact change, and even then give him the command to run rather than running it.

## 1. Ask the doctor
1. Call `get_doctor`. It gives `state` (`ok`, `warn` or `problem`), `summary`, `checkedAt` and `checks`, each with `name`, `state` (`ok`, `warn`, `problem` or `off`), `detail` and `next` (what to try, or null).
2. If it fails with a 404, the API is older than the server doctor: say the API needs rebuilding (`docker compose up --build --wait api`, which Phil runs) and stop. Any other failure: say what it said, and that `docker compose ps api` and `docker compose logs --tail 20 api` (for Phil to run) show whether the API is up, then stop.
3. If `state` is `ok`, say so with the summary and stop. Don't look further.

## 2. Look into what isn't fine
For each check that's `problem` or `warn`, problems first, call only the read tools that fit it. They're allowed in this repo without asking:
- Disk, Memory: `get_status`.
- Wi-Fi: `get_wifi_reconnects` (when, and how many).
- Backups: `get_backup`.
- Heartbeat, Phone alerts: `get_alerts`. The API keeps only whether the last try worked and when, never why: the reason is in the API's log.
- qBittorrent: `get_downloads`. Jellyfin: `get_library`. A second failure the same way means it's still down; one that works now means it was a blip.
- Deal watcher: `get_deal_status` and `get_deal_searches`. Never the tools that return listings (`get_deal_matches`, `get_deal_listing`, `get_deal_hidden`, `explain_deal_listing`): they're not needed here.
- Expiry list: `get_expiries`.
- Watchers: `get_watchers` (each one's last check, and whether a notification is waiting to be sent).
- Brain inbox, Train times: no tool says more. Don't ask the doctor again for trains just to retry: each ask is a call on Phil's Rail Data Marketplace key.

A check that's `off` is switched off on purpose. Don't treat it as a problem or suggest switching it on: that's Phil's decision. Name it under Switched off.

## 3. Commands
This repo's `.claude/settings.json` allows the hub's read tools and no shell commands, so don't run commands yourself. Suggest them for Phil to run on the server from `~/docker`, each with one line on what it shows. Use the check's `next`, and these, which only read:
- `docker compose ps` (or `docker compose ps <service>`): whether each container is running and healthy.
- `docker compose logs --tail 20 <service>`: its last 20 log lines. For the API, look for `heartbeat failed` or `notification check failed`.
- `docker system df`: what Docker's images, containers and build cache use.
- `docker stats --no-stream`: each container's memory and CPU, once.
- `df -h /` and `free -h`: disk and memory, as the server sees them.
- `systemctl status home-hub-backup.timer` and `journalctl -u home-hub-backup -n 30`: the backup timer and the last run's log.
- `ls -ld ~/hub-memory/inbox`: whether the brain inbox folder is there.

If Phil says yes to running one of those, you may run exactly that one. Never run, or suggest, `docker inspect`, `docker compose config` without `--quiet`, `env`, `printenv` or `set`, and never read a `.env` file: they print secrets. Never run anything with `sudo`; Phil types those himself.

## 4. Answer
Start with the doctor's summary, then:
- **Problems:** for each, its name, the detail, what the other tools added, and what to try (the commands above, for Phil to run).
- **To look at:** the same, for each warning.
- **Fine:** the names, on one line.
- **Switched off:** the names, on one line.

Say when the doctor checked (`checkedAt`, in UK time). If something can't be told from the tools, say so rather than guessing at a cause, and say which command would tell.
