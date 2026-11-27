# 0073. Dev chores run from a fixed list by a runner on the host

- Date: 2026-11-27
- Status: accepted

## Context
I want to ask Jarvis or Claude Code to do the server's routine dev jobs: rebuild the API, run the tests, pull newer images. Each of those needs Docker, and anything that can use Docker can do anything on the server, so it can't be done from inside a container without giving that container the Docker socket, which is effectively root.

## Options considered
Chosen 27 Nov (mine): yes to dev chores, each needing my yes first. I'm unsure what "pull everything" should pull.

How (from the batch's spec): a runner on the host, outside Docker, started by a systemd path unit when the API leaves a request file in a folder they share. Lost: giving the API or the MCP server the Docker socket (root for whatever reaches it); an SSH key for the API to log into the host with (the same power, more to get wrong); a cron job polling (slower, and still the same runner).

What "pull everything" pulls (Claude's pick): `docker compose pull --ignore-buildable`, download only. Lost: `git pull` with `bash host/hub-update.sh` (it asks before installing host files, so it can't run unattended, and pulling code is a bigger change than pulling images); pulling and restarting (`up -d` after), which would restart every service with no one watching.

Claude's picks, not discussed:
- A new switch, `CHORES`, off by default and written out like the others, needing no other setting.
- Two mounts into the API: `./chores/requests` read-write and `./chores/results` read-only, so the API can ask but never write a result. Both folders come with the repo (git tracks an empty `.keep` in each), so the mounts never fail. With `CHORES` off the API never touches them.
- A request is `<16 hex>.job`, mode 600, holding only the job's name. The runner reads only a plain file (not a link) named that way, under 64 bytes, only its first line, compares it with its own fixed list, and removes it. The commands are written out in the script; the job's name is only ever compared, never run or passed on.
- The jobs and their time limits: `rebuild-api` (`up -d --build --wait api`, 15 minutes), `run-tests` (each package in a throwaway `node:26-alpine` container, with `--init` so the time limit reaches the container, with its folder mounted read-only and copied inside without `node_modules`, `dist`, `.env` and `data`, so no secret or saved data reaches npm's install scripts, 10 minutes each), `pull-images` (20 minutes). `run-tests` differs from the README's own way (`npm ci` in the folder) so that nothing on the server changes and a running Jarvis keeps his packages; `rebuild-api` adds `--wait` so the result says whether the API came back healthy.
- The result is `<id>.json` (state, exit code, timed out or not, seconds, times, limit) and `<id>.out` (the last 40 lines, at most 4,000 bytes, colour codes and control characters taken out), the last 20 kept.
- The runner is `/usr/local/bin/home-hub-runner`, installed from `host/runner.sh` like the backup script, run by `home-hub-runner@<user>.service` as that user with `NoNewPrivileges`, started by `home-hub-runner@<user>.path` watching `/home/<user>/docker/chores/requests/*.job`. They're systemd template units (`User=%i`), enabled with the user's name after the `@`, so the public repo names no user; `%h` can't be used, since in a system unit it's root's home whatever `User=` says ([systemd's specifiers](https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html)), so they assume the user's home is `/home/<user>`. `hub-update.sh` now knows where those three go, and restarts a template path unit for every user it's enabled for.
- One at a time: the API refuses while a request waits (up to 2 minutes, then it's removed as never picked up) or a result says running (until its limit plus 2 minutes), and the runner takes a lock and handles one request each time it starts. The API writes a request under a dot name and renames it into place, so the runner never reads one half-written. Anything else in `chores/requests` (a folder, a link, an odd name) is renamed to a `.set-aside-` name and never run, so it can't keep the path unit starting the runner. These are Claude's changes after the review.
- `POST /chores/<job>` and `GET /chores/<id>`, behind the hub's token. Claude Code: `get_chore` allowed, `run_chore` asks. Jarvis: both allowed, `run_chore` with his yes question saying which chore and what it does. The output is marked untrusted in the tool's description.
- Logs: the runner's lines in the journal (ids, jobs, limits, exit codes, seconds, bytes of output, refusals), the API's in its log (ids, jobs, refusals, dropped requests). Never the output.
- `host/runner.test.sh` tests the runner and its units with a pretend `docker`.

## Decision
With `CHORES=on`, the API writes a request naming one job into `chores/requests/`, a systemd path unit starts a runner on the host as my user, and the runner runs that job from its own fixed list (`rebuild-api`, `run-tests`, `pull-images`) with a time limit and writes a result the API reads back; nothing from a request is ever run.

## Confidence and the case against
Fairly confident in the shape (Claude's estimate): the runner, its refusals and its limits are tested with a pretend Docker, and the API's side with real files. Not checked on the server: systemd starting it, Docker's output, `--ignore-buildable` on the installed Compose. The case against: the runner is in the `docker` group, so it is root in all but name, and a bug in it is a bug with root's reach; the API can now cause a rebuild of itself and other jobs with a few minutes of heavy work on an 8 GB laptop; and a request file is a new way into the host, however narrow, where there was none.

## Consequences
- `CHORES` is a new switch, so the API won't start without it.
- Two new mounts for the API, and three host files to install by hand with sudo (or through `hub-update.sh`), with the path unit enabled for the server's user.
- A new MCP action, and a sixth hub action for Jarvis.
- Each new job is a change to `host/runner.sh` and needs its own decision. The session manager (record 0074) adds session jobs to this runner.
