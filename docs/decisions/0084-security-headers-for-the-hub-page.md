# 0084. Security headers for the hub page

- Date: 2026-11-27
- Status: accepted

## Context
The 27 Nov security review found that Caddy sends the hub page with no security headers. The page shows text from outside, like deal titles, Spotify names and commit messages, and it's safe today because it only ever puts that text in as text: its one `innerHTML` is a fixed drawing of the mode icons, and listing links are checked against a short list of addresses. Headers would be a second layer, so that a mistake in the page later couldn't run someone else's code or show the page inside another site.

## Options considered
Chosen 27 Nov (Phil): a content security policy and the usual headers on `https://hub.home`, tried in a headless browser first. Not HSTS (telling browsers never to use plain http for the name again): a laptop that opens the hub page without Caddy's certificate installed would get an error it can't click past. Not leaving it as it was.

Claude's picks, not discussed:
- The policy lets the page load scripts, styles, images, sound, its manifest, its recorder (an AudioWorklet) and API calls only from `hub.home` itself, with no code or styles written inside the page, nothing from another site, no plugins, no `<base>`, forms posting only to itself, and no showing inside a frame. That's everything the page uses today: tried in headless Chromium against a pretend API, logged in and out, the mode icons, the login messages, the recorder's worklet, the manifest and the Spotify page, with no difference in what loaded or what the console said compared with no headers.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (for browsers older than `frame-ancestors`) and `Referrer-Policy: no-referrer`, so addresses on the hub never travel to a site it links to. `spotify.html` already asked for no referrer itself.
- Only on `https://hub.home`, since it's the one page that shows outside text and holds the token. Not on the other `.home` sites, which are other people's apps with their own needs.
- No switch: like record 0083's redirect, it lives in Caddy, which has no settings file of its own here; undoing it is reverting this commit and restarting Caddy.
- `host/caddyfile.test.sh` checks the headers are there and that the hub's pages and code stay within the policy (no script or style written inside a page, no handlers in attributes, nothing loaded from another site, no `javascript:` addresses, no code built from text), so a later change that the policy would block fails a test instead of breaking quietly on the phone.

## Decision
`https://hub.home` is sent with a strict content security policy allowing only its own files, plus nosniff, no frames and no referrer.

## Confidence and the case against
Fairly confident: the page already followed every rule the policy sets. The case against is that a policy breaks things quietly: a blocked script or style shows only in the browser's console, which isn't easy to open on a phone, and the headless check used a pretend API, not the real one with real data. The wall's page (record 0081), served from the same site, was tried the same way on 28 Nov, past the certificate warning as on the Xbox: logged in, following Jarvis, with markup in its text, and in set-up mode, with no difference in what loaded or what the console said compared with no headers. That still isn't Edge on the Xbox. The test catches the common ways a change could break it, not all of them.

## Consequences
If something ever got text onto the hub page that tried to act as code, the browser would refuse to run it, and no other site can put the page in a frame. Anything new on the page must come from `hub.home` itself, with no inline scripts or styles: adding something from another site, like a font or an image host, means changing the policy, which needs its own decision.
