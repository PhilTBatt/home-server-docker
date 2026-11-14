# Going private

The steps for the day this repo goes from public to private. Checked against GitHub's docs on 14 Nov 2026. Check them again on the day, because GitHub changes these often.

## What changes
- Stars and watchers are erased, and they can't be restored if the repo goes public again.
- Forks stay public and are split off from this repo. Going private doesn't take back anything that was ever public, old commits included.
- GitHub's own secret scanning and push protection are only free on public repos, so they stop. The Gitleaks job in `.github/workflows/safety.yaml` becomes the only secret scan.
- The personal-details job skips itself, because it only runs while the repo is public.
- Actions stops being free. The free plan includes 2,000 minutes a month for private repos, and with no payment method on file, jobs stop once that's used up. Each push runs the API tests, the MCP tests and the secret scan; my rough guess is under 5 minutes a push.
- Dependabot version updates keep working. GitHub lists them for all repositories.
- Every clone needs a login to pull, not just to push. Anything that read the repo without logging in, such as Claude in claude.ai cloning it to build patches, loses access.
- Some extras need a paid plan on a private repo, such as protected branches and the traffic graphs. This repo uses none of them.

## Before
- Check nothing that needs to keep working links here: the portfolio, a CV, anything I've shared.
- Push, and wait for the Actions run to go green, so the last public run is clean.
- On every clone, `git push` prints `Everything up-to-date`. That proves its login works before anything changes.

## The flip
On GitHub, in the repo's Settings: Danger Zone, Change visibility, Make private, then confirm.

## Straight after
- On the server, from `~/docker`: `git pull` prints `Already up to date.`, and `git push` prints `Everything up-to-date`.
- On the other clone, the same two commands print the same. If either fails (GitHub usually says `Repository not found`), that clone's login only covered public access, so it needs a new token that includes this repo.
- After the next push, the Actions tab shows `test (api)`, `test (mcp)` and `secrets` green, and `personal` skipped.
- A week later, Insights, Dependency graph, Dependabot shows a check from the last 7 days.
- The public-safe rules in `CLAUDE.md` stay. The old history is still out there, and the repo may go public again.

## If it goes public again
- The personal-details job switches itself back on, but nothing checked the words while the repo was private. Check first, from `~/docker`, with the word list kept outside the repo: `PERSONAL_WORDS="$(cat ~/personal-words.txt)" bash .github/scripts/personal-details.sh` prints `No personal details found in the tracked files.`
- Gitleaks kept scanning the whole history while private, so its last run should already be green.

## Sources
- Changing visibility: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility
- Plans and Actions minutes: https://docs.github.com/en/get-started/learning-about-github/githubs-plans
- Actions billing: https://docs.github.com/billing/managing-billing-for-your-products/managing-billing-for-github-actions
- Security features by repo type: https://docs.github.com/en/code-security/getting-started/github-security-features
- Dependabot version updates: https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-version-updates