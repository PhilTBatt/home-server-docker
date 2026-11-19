# 0029. Sessions in this repo may search the web and open listed spec sites without asking

- Date: 2026-11-19
- Status: proposed

## Context
`pc-build` asked before every web search and page, which made checking specs tedious. The same sessions read text written by eBay sellers, which could try to steer Claude, and can read files in this repo. A page fetch or search is a way for data to leave the server.

## Options considered
- Keep asking every time: safest, and tedious enough that checks get skipped.
- Allow WebSearch, and WebFetch only for named maker and spec sites, for every session in this repo: chosen.
- The same allow list in each skill's `allowed-tools`: it only lasts for the turn that ran the skill, so follow-up questions would ask again.
- That plus Claude Code's sandbox and a hook that checks addresses: worth doing if the list grows.
- Allow every site (`WebFetch(domain:*)`), or skip permissions: a planted instruction could send data anywhere.

## Decision
`.claude/settings.json` allows `WebSearch`, and `WebFetch` for about 20 sites: Dell, HP, Lenovo, Intel, AMD, Kingston, Crucial, Samsung, Micron, Corsair, Western Digital, Seagate, Mr Memory, Jellyfin, linux-hardware.org and ServeTheHome. No site where others can see the addresses requested, like GitHub (its traffic pages show paths) or paste sites. Any other site still asks, and eBay's own pages (`ebay.co.uk` and its subdomains, `ebay.com`, `www.ebay.com`, `m.ebay.com`) are denied, so "never open eBay's pages" is enforced rather than only asked for. Reading `~/hub-memory` is denied in this repo's sessions. Both skills say a search or address may hold only part names, model numbers and spec words.

## Confidence and the case against
Medium. A search query goes to Anthropic's search service, not to a server an attacker runs, so it's a weak way out, but that's my reasoning rather than anything documented. Search results are untrusted text too. If that matters more than the prompts, take `WebSearch` out of the allow list.

## Consequences
Spec checks run without stopping, in any session started in `~/docker`, not only the two skills. A new spec site asks once, and "don't ask again" saves it to `.claude/settings.local.json`, which is mine to review. Bash still asks, so `curl` can't get round the list unasked.
