# 0097. The switches page, and a chore that flips the hub's switches

- Date: 2026-11-28
- Status: accepted

## Context
The kept "Show me the switches" page, from the wall designs of 28 Nov: a board of every switch and whether it's on, with "Switch on reminders" flipping one. Switching one for real means changing a line in a `.env` file and restarting, which no container can do: only the chores runner (record 0073), outside Docker, with the docker group. Record 0073 says each new chore needs its own decision. Flipping a switch is security-sensitive: some switches open doors (sessions, the wall, talking from the phone), and the runner is as powerful as root.

## Options considered
Chosen by Phil, 28 Nov:
- **It shows every switch and flips them through a dev chore that asks him first.** A yes every time.

Claude's picks, not discussed:
- **What a flip does:** one chore per switch and way, `switch-on-<switch>` and `switch-off-<switch>`, named in lower case with dashes (`switch-on-reminders`, `switch-off-find-phone`). The runner changes exactly one line of `api/.env`, `NAME=on` to `NAME=off` or back, writing a copy beside it and renaming it over the old one so it's never half-written, with the same permissions. Then it restarts only the API, recreated so it reads the file again (`docker compose up -d --no-deps --force-recreate --wait api`, 2 minutes at most). If the API doesn't come back healthy, the runner puts the line back and starts the API again. The whole chore has 5 minutes.
- **Only the hub's feature switches,** the ones `GET /system/features` lists, from a fixed list in the runner that a test keeps the same as the API's. Never any other line of `api/.env`.
- **What it refuses:** a name that isn't on the list; an `api/.env` that's a link; and a switch that isn't written exactly once as `NAME=on` or `NAME=off` (quoted, with a comment, with `export` or spaces, or written twice). In each case nothing changes, and it says why. Nothing from the request but the switch's name is used, and only to compare with the list.
- **Its own switch, `SWITCHES`, off by default.** With it off, switch chores are a 400 like any job not on the list, and the page says flipping is off. It needs `CHORES` on too, but doesn't stop the API starting without it, so `CHORES` can still be switched off by a chore. The runner checks too: it refuses a switch chore unless `api/.env` says exactly `CHORES=on` and `SWITCHES=on`, so a request file written some other way (the API container can write that folder) can't flip anything while they're off. Added after the review.
- **Two hub switches are shown but never flipped:** `LOGIN_GUARD` (record 0083's guard on logging in: switching a security setting off should take an edit by hand, not a yes) and `DEALS_AI` (part of the deal watcher's settings). The page marks them by hand.
- **Jarvis's switches are shown but not flipped.** He tells the hub his switches, while `JARVIS_WALL` is on, when he starts and every 5 minutes: only the names of his on-or-off settings and each one's value, `on`, `off` or a choice word like `kokoro`, never a key, a token, a number or the persona's name. The hub keeps the last list for 15 minutes, in memory only, and only takes names starting `JARVIS_` with a lower-case word of up to 12 letters each. Flipping his would mean editing `jarvis/.env`, but he's started by hand in his own `tmux` (record 0079), which the runner can't restart, and some of his switches need others (the start would fail later, out of sight). So his change in `jarvis/.env` by hand, and the page says so.
- **The page:** the Switchboard board, the hub's switches on the left and Jarvis's on the right, each with its name in plain words, its setting's name and, for a choice, the choice. A switch that changed since the screen last read the page flips with a ping. Along the bottom, how a switch is flipped, or why nothing can be. It shows in guest mode unless it's put on `WALL_PRIVATE_PAGES`, as every page does: it shows which features are on, and nothing more.
- **How you ask:** "show me the switches" opens the page. "Switch on reminders" goes to Claude like any other question, and he asks for the chore through the hub's tools (`run_chore`), with `JARVIS_HUB_ACTIONS=on`, so his code asks yes or no first, typed or on the phone, saying which switch, which way, and that it restarts the API. A guest chat has no hub tools, so it can't. Claude Code asks first too.

## Decision
With `CHORES=on` and `SWITCHES=on`, `switch-on-<switch>` and `switch-off-<switch>` are chores the runner runs: one line of `api/.env` changed, the API restarted, and put back if it doesn't come back. The wall's switches page shows the hub's switches and Jarvis's, and how to flip them.

## Confidence and the case against
Fairly confident in the runner's part: it changes one known line or nothing, and puts it back if the API fails. The page is like the others.

The case against:
- **It widens what the hub's token can do.** Before, a chore could rebuild, test or pull; now it can switch on things that act by themselves or open doors: talking from the phone, sessions, find my phone. The yes is in Jarvis's own question and Claude Code's, not in the API: anything holding the hub's token (the phone's login, Jarvis's token, a script with `API_TOKEN`) can ask for a switch chore directly, as it already could for a rebuild or a session. With `SWITCHES` off, nothing can. And a yes given without reading the question now changes more.
- **A runner stopped part-way leaves the switch flipped.** Putting it back only happens while the runner is still running; if it's stopped mid-way (a shutdown, say), the line stays changed and the chore's result says it's running until it times out. The next look at the page shows how it was left.
- **A switch that needs settings it doesn't have stops the API starting.** The runner then puts it back, so the API comes back as it was, but it's down for up to two minutes while it tries, twice. The chore says why it failed.
- **Switching `CHORES` or `SWITCHES` off with a chore works, but switching them back on can't**: with either off, the chore is refused. That's on purpose: turning flipping on is for `api/.env` by hand.
- **Jarvis's list can be up to 15 minutes old,** and is empty after the API restarts until he next tells it, at most 5 minutes later.
- **Not chosen: flipping Jarvis's switches too.** It's what "every switch" would mean, but the runner can't restart him, and a change he'd only pick up at his next start could fail out of sight.
- **Not chosen: letting the wall or the phone flip a switch by a tap.** Every flip goes through a typed or phone yes from Jarvis or Claude Code's own question.

## Consequences
- `api/.env` is now written by something other than me: only by the runner, only those lines, only after a yes.
- A new feature switch goes in the API's list and the runner's together; the runner's test fails if they differ.
- Anything else that would change `api/.env`, `jarvis/.env` or another setting needs its own decision.
