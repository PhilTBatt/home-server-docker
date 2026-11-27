# 0074. A session manager for my Claude Code sessions

- Date: 2026-11-27
- Status: accepted

## Context
When I'm coding, I have Claude Code sessions open in the docker repo and the brain repo, and I lose track of which one is waiting on me. I'd like the hub to know, so Jarvis can say which session is waiting, and to be able to start and stop them. I'm unsure about it, so it's behind a switch and off.

## Options considered
Chosen 27 Nov (mine): a session manager that says which Claude Code session is waiting on me and can start and stop them, behind a switch, off.

How the hub hears (from the batch's spec): Claude Code's own hooks, which run a command when something happens in a session ([hooks reference](https://code.claude.com/docs/en/hooks)). Lost (Claude's view): watching the sessions' transcript files in `~/.claude/projects/`, which would mean reading what was said to know a state; and asking `tmux` what's on each screen, which would mean reading the screen.

Which hooks (Claude's pick, from that reference): `SessionStart` (waiting), `UserPromptSubmit` (working), `PostToolUse` (working), `Notification` with the matchers `permission_prompt` and `idle_prompt` (waiting), `Stop` ("when Claude finishes responding": waiting) and `SessionEnd` (stopped). `PostToolUse` is there because after I answer a permission prompt nothing else says it's working again until it stops. Lost: `PreToolUse` (it fires before a permission prompt too, so it would say working while it waits for me).

Starting and stopping (from the batch's spec): runner jobs `session-start-<name>` and `session-stop-<name>` (record 0073), for names in a git-ignored settings file on the host, never from the request.

Claude's picks, not discussed:
- A new switch, `SESSIONS`, off by default and written out like the others.
- The hook script is `host/hub-session.sh`, run in place (it's a `hub-` helper, so `hub-update.sh` doesn't offer to install it). It does nothing unless `api/.env` has `SESSIONS=on`, reads the token from `api/.env` (git-ignored), hands it to `curl` on its input rather than as an argument, waits 3 seconds at most, prints nothing (Claude Code adds a `UserPromptSubmit` or `SessionStart` hook's plain output to what Claude sees, per the reference) and always exits 0. It sends the same state again only after 5 minutes, remembering the last in `~/.cache/home-hub/`, so `PostToolUse` costs a file read most of the time, and a restarted hub hears again soon.
- Hooks run through `sh -c` with `$CLAUDE_PROJECT_DIR` (the reference's "project root where the session started"), as `bash "$CLAUDE_PROJECT_DIR/host/hub-session.sh" docker <state>`, with a 5-second timeout. The brain repo's hooks are a snippet in the guide that I add there myself, naming the script by its full path.
- `POST /sessions/<name>/state`, `GET /sessions` and `GET /sessions/changes?after=<seq>` (a plain poll, like the reminders' feed, logged at warnings), behind the hub's token. Names are 1 to 20 lowercase letters, digits and `-`; at most 10 are kept; kept in memory only.
- The runner's list is `host/hub-sessions.conf`: name, `tmux` session name and folder per line, at most 10. A folder must be a plain absolute path inside the user's home that exists. Starting runs `claude` in a detached `tmux` session in that folder (not if one with that name is already running); stopping kills that `tmux` session. 30 seconds each. The runner's service gets `KillMode=process`, so systemd doesn't end the `tmux` server with the chore. The sessions get a `tmux` server of their own (`tmux -L home-hub`), since one the runner starts carries its `NoNewPrivileges` and would otherwise become the server every later `tmux` of mine joins, with `sudo` failing in it (Claude's change after the review).
- Claude Code gets `get_sessions`, allowed without asking; starting and stopping go through `run_chore`, which asks. Jarvis gets the same, with his yes question naming the session.
- Logs: each change of state (name, from, to, seq, seconds in the old state), refusals; never anything from the session itself.

Jarvis's side (Claude's picks, not discussed):
- `JARVIS_SESSIONS`, `off` or `on`, needing `JARVIS_HUB_TOOLS=on`. He polls the feed every 10 seconds; changes from before he started are skipped.
- A session starting to wait on me, or stopping, is said ("The docker session is waiting on you.") only in coding mode, once he's quiet; in the other modes it's a line on screen, and in guest mode nothing at all.

## Decision
With `SESSIONS=on`, Claude Code's hooks tell the hub through `host/hub-session.sh` whether each session is waiting, working or stopped, the hub keeps that in memory with a feed for Jarvis, and with `CHORES=on` the runner starts and stops the sessions listed in `host/hub-sessions.conf` in `tmux`.

## Confidence and the case against
Moderately confident (Claude's estimate): the script, the routes and the runner's session jobs are tested with stand-ins, and the hook names and their behaviour are from the current reference. Not checked: the hooks firing in a real session on the server, `idle_prompt` coming when I expect, and `claude` starting cleanly in a `tmux` the runner made. The case against: every prompt and tool call now runs a script, a small cost and one more thing that could slow a session; the hub's idea of "waiting" can lag or be wrong after a restart; starting Claude Code from a systemd service gives it a different environment from my login (no `ssh-agent`, for one); and `KillMode=process` means a chore that leaves something running isn't cleaned up by systemd.

## Consequences
- `SESSIONS` is a new switch, so the API won't start without it.
- This repo's `.claude/settings.json` gains hooks that run in every session here; with the switch off they do nothing. Since they run `host/hub-session.sh` straight from the repo on every tool call, an edit to it would run without a prompt, so the same file denies Claude Code editing it (Claude's change after the review). Installing it under `/usr/local/bin`, like the runner and the digest, would go further; it isn't done, so the hooks work without an install step.
- The runner's service keeps what it starts (`KillMode=process`).
