# 0083. The hub page over https only, and a login guard

- Date: 2026-11-27
- Status: accepted

## Context
A security review on 27 Nov found that `hub.home` still answered over plain http, and that the login cookie holds the hub's token itself for 60 days, marked https-only only when that login came over https. On plain http the token crosses the Wi-Fi in the clear, at login and in the cookie on every request, where anyone else on the network could catch it. Since record 0078 the token also lets whoever holds it talk to Jarvis as if from the phone, read his answers (which come from the brain) and answer his yes questions. There was also no limit on wrong tokens at login. The phone uses `https://hub.home` (record 0077), the laptops don't open the hub page, and the server's own scripts reach the API through `http://api.home` on the server itself. Since record 0081, the wall's page (`hub.home/wall.html`) is opened on the Xbox at `https://hub.home`, past a certificate warning, since an Xbox can't be told to trust Caddy's certificate; it logs in with its own token, `WALL_TOKEN`, which can only read what the wall shows.

## Options considered
Chosen 27 Nov (Phil):
- Caddy sends `http://hub.home` on to `https://hub.home`, except `/caddy-root.crt`, which stays on plain http because a device can't open the https page until it trusts that certificate. Not also dropping plain http on `api.home`: the server's scripts (`hub-get.sh`, `hub-post.sh`, `hub-session.sh`) use it from the server itself, and moving them to https would mean giving each one Caddy's certificate. Not leaving things as they were.
- `LOGIN_GUARD` in `api/.env`, off by default: with it on, the login cookie is always https-only, and logins pause after 10 wrong tokens in a minute. Not a login of its own for each device, which could be logged out alone without changing the token: more code and a new file of logins on the server, for a token that's 64 characters long and can't be guessed anyway. That's still open if a device is ever lost.

Chosen 28 Nov (Phil), once the wall's page had been built: the wall stays on https only, opened on the Xbox past the warning as it already was. Not also serving the wall's files and the three routes it calls on plain http, for a screen that can't click past a warning: built and tested on 28 Nov, and quick to add back if the projector needs it, but a plain-http door that nothing uses today, with the wall's token readable by anyone listening on the Wi-Fi. Not a name of its own for the wall on plain http (`wall.home`).

Claude's picks, not discussed:
- With the guard on, a login over plain http is refused (403, with a line saying to use `https://hub.home`), not let in without a cookie: a browser drops an https-only cookie that arrives over http, so the login would seem to work and then not. A refused login is never checked, so plain http can't be used for guessing either.
- One count for every device, not one per address: the API sees each device's address only as Caddy passes it on, and a count that a device could dodge by sending its own address header would be no count at all. The cost is that someone sending wrong tokens can pause logins for everyone, a minute at a time; a phone that's already logged in carries on, since only new logins pause.
- While logins are paused, every login is refused, the right token too, so the pause can't be used to test guesses; tries during the pause aren't counted, so they don't make it longer. Logins open again a minute after the oldest wrong token in the last ten.
- The count lives in the API's memory, so a restart clears it.
- Logs hold what was refused and the count in the last minute, never a token, right or wrong.
- The redirect is Caddy's default temporary one (302), not a permanent one, so browsers don't remember it if this is ever undone.
- The Caddy change has no switch: Caddy has no settings file of its own here, and the redirect is the change Phil chose. Undoing it is reverting this commit and restarting Caddy.
- The cookie still lasts 60 days, as it did: how long a login lasts wasn't part of this decision.

## Decision
`http://hub.home` sends everything but the certificate to `https://hub.home`. `LOGIN_GUARD=on` makes the login cookie always https-only, refuses logins over plain http, and pauses logins for everyone after 10 wrong tokens in a minute.

## Confidence and the case against
Fairly confident in the redirect: nothing that uses the hub page uses plain http. Less sure the login limit earns its place: with a 64-character token nobody can guess it, so the limit only matters if the token is ever shortened, and it hands anyone on the Wi-Fi a way to stop new logins for a minute at a time. The strongest case against the whole of it is that it leaves the bigger part alone: the token is still one key to everything, kept in a cookie for 60 days, and anyone who gets it from a device or a backup has it all; a login of its own per device would fix that, and this doesn't.

## Consequences
On the hub page, the token never crosses the network in the clear once the guard is on, and a stolen token can't be found by guessing. A laptop that opens `hub.home` before trusting Caddy's certificate gets a warning page. `api.home` still answers over plain http, for the server's own scripts: anything else that sends the token there sends it in the clear, so don't point a device at it. Logging one device out still means changing the token everywhere. A screen for the wall has to open `https://hub.home/wall.html` and get past the warning, or trust Caddy's certificate.
