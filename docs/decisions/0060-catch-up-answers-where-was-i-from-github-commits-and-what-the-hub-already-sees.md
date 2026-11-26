# 0060. Catch-up answers "where was I?" from GitHub commits and what the hub already sees

- Date: 2026-11-26
- Status: accepted

## Context
When I come back to my projects after time away, I lose time working out where I was: what I last did in each repo, what's waiting, what I left half done. I wanted one "where was I?" answer, from a catch-up route on the hub and a Claude skill, gathering recent commits across my repos, recent ideas and work tickets. On 26 Nov I said to build it now and add the work tickets later. I gave no more detail than that. The commits live on GitHub, which the hub has never reached before, and my private repos would need a token, which is a new secret.

## Options considered
Chosen 26 Nov: a catch-up API endpoint plus a Claude skill, gathering recent commits across my repos, recent ideas and work tickets, built now with the work tickets left for later.

Claude's picks, not discussed:
- A new switch, `CATCH_UP`, off by default and written out like the others. It needs no other setting, not even the ntfy topic, since it sends nothing.
- The repos are listed in `CATCH_UP_REPOS`, optional, up to 10, each `owner/repo` checked against GitHub's naming rules, with no spaces and no repeats. Left out, catch-up still answers with the hub's part and never reaches GitHub, so I can switch it on before deciding anything about GitHub. Not my whole GitHub account: listing a user's repos is another call, and a list I choose says what I care about.
- Commits come from GitHub's REST API (list commits, with `since` and `per_page`), not from git on the server: the hub can't see my other machines' repos, and it has no git. Only `https://api.github.com`, one page of 30 commits per repo, all repos at once, 4 seconds each, never following a redirect, with GitHub's recommended `Accept` header, API version `2026-03-10` and a `User-Agent`. A renamed repo gets a redirect from GitHub, so it says to check its name rather than being followed.
- The token is optional, `CATCH_UP_GITHUB_TOKEN` in `api/.env`, and must be a fine-grained token (`github_pat_`), which can be limited to chosen repos and read-only Contents; classic tokens are refused, since they can't be. It's sent only in GitHub's request header, and never appears in a reply, an error or a log. I start with no token and public repos only.
- Errors are GitHub's status in plain words (not found or private, token refused, the hourly limit used up and until when, rate-limited, an empty repo, no answer, a redirect), never GitHub's reply. One failing repo never stops the others.
- Each repo's answer is kept for 10 minutes for the same number of days, or 1 minute if that repo failed, and two asks at once share one. Without a token GitHub allows 60 calls an hour from my public address, so 10 repos asked every 10 minutes would use all of it, and so would 10 repos asked for 6 different numbers of days.
- When GitHub says the limit is used up, or says how long to wait, no repo is asked again before the time it gave: a minute at least and an hour at most. GitHub's rules say not to retry before then.
- Commit messages are cut to their first line and 120 characters, with control and hidden characters taken out, the way eBay text is cleaned, plus every other format character, which eBay's cleaning still lets through. They're other people's text: the tool's description says to treat them as untrusted, like the deal listings.
- Each commit gives only its short sha, its committer's time (or the author's if there's none) and that first line, grouped by London day, newest first. No authors, no links, no diffs.
- `days` is 1 to 30, 7 if left out.
- The hub's part reuses what's already read, each with 5 seconds at most: the brain inbox's count, the expiry list's next 7 days (the doctor's own "soon"), watchers, the alerts' problems, the last backup, and the server doctor's overall line, with its own checks cut to 4 seconds so the whole answer stays inside the 10 seconds Claude Code waits. A part whose feature is off says `off` with its setting; one that fails says `failed`; neither fails the answer. Asking it asks qBittorrent, Jellyfin and, while `TRAINS` is on, the departure board once, as the doctor does.
- Recent ideas aren't in it. They're in the brain, and the hub only counts its inbox; giving it more of the brain is a bigger decision than this one. If the brain is on GitHub it could be listed in `CATCH_UP_REPOS` with a token, but its commit messages would then go through the hub, so I've left that for later.
- Work tickets aren't in it: no code, no settings, nothing that reaches a work system. A work account's token on a home server is my employer's decision as well as mine.
- A read-only MCP tool, `get_catch_up`, allowed in `.claude/settings.json` like the other read tools, and a `catch-up` skill that only reads and suggests. The repo's settings don't allow git commands, so the skill suggests read-only ones (`git status --short`, `git log`, `git stash list`) for me to run rather than running them.
- A small "Where was I?" section on the phone page: the summary and each repo's latest commit, shown while it's on.
- Jarvis doesn't get it. His read tools are a fixed list his tests check, and commit messages would be someone else's text read out by a voice; that's a decision for later.

## Decision
With `CATCH_UP=on`, `GET /catch-up?days=7` gives recent commits in the GitHub repos I list, from GitHub's REST API with an optional fine-grained read-only token, alongside what the hub already knows is waiting; Claude Code reads it with `get_catch_up` and the `catch-up` skill. Recent ideas and work tickets are left for later decisions.

## Confidence and the case against
Fairly confident in the code (Claude's estimate): each rule, refusal and cache timing is tested against a stand-in GitHub, and the real API was run against one. I couldn't check a real reply from GitHub from where it was built, so the shape comes from GitHub's docs: list commits, rate limits, pagination and API versions. Less sure it's the right answer to "where was I?". The case against: git on my own machines already knows more than GitHub (uncommitted work, stashes, branches not pushed), and `git log` in each repo costs nothing and needs no token; the hub only sees what I pushed, and only for the repos I listed. A token on the server is one more secret to rotate, and a fine-grained one expires. The unauthenticated limit is per address, shared with everything else at home. And without ideas or tickets it's half of what I asked for.

## Consequences
- `CATCH_UP` is a new switch in `api/.env`, so the API won't start without it.
- The hub reaches a new place on the network, `api.github.com`, while repos are listed, and may hold a new secret, `CATCH_UP_GITHUB_TOKEN`.
- `.claude/settings.json` allows `get_catch_up` without asking.
- Adding recent ideas, work tickets, or giving it to Jarvis each needs its own decision.
