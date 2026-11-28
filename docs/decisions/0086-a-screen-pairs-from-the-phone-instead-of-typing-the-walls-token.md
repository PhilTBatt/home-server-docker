# 0086. A screen pairs from the phone instead of typing the wall's token

- Date: 2026-11-28
- Status: accepted

## Context
The wall's page logged a screen in by typing `WALL_TOKEN`, 48 characters, once. On 27 Nov Edge on the Xbox wouldn't let Phil type into the box, so he typed the token in the address bar and pasted it across. The projector, a Google TV box driven by its remote, arrives on 28 Nov, and typing 48 characters with a remote would be worse. The cause in Edge wasn't found.

## Options considered
Chosen by Phil, 28 Nov: pair from the phone. The wall shows a 6-digit code, Phil types it into the hub app, and the app tells the hub to let that screen in. No token is typed on the TV. Not "both": the token box isn't kept on the page as a fallback.

Claude's picks, not discussed:
- A code lasts 5 minutes, then the page asks for a new one. At most 3 screens pair at once, and two live pairings never share a code.
- After 5 wrong codes within 5 minutes, every waiting pairing is dropped and each screen starts again with a new code. Older wrong codes don't count, so typos days apart never add up. Confirming needs the hub's token anyway, so this is a second layer: someone with the token wouldn't need to guess.
- Pairing grants exactly what `WALL_TOKEN` grants: the screen gets the same `wall_token` cookie (HttpOnly, SameSite Strict, a year), which holds `WALL_TOKEN` itself, so `wallReads` and the auth hook are unchanged. So whoever owns a paired device can read that cookie in their own browser and use the token as a Bearer header from anywhere on the LAN or tailnet, for the wall's two read routes only, and taking one screen's access away means a new `WALL_TOKEN` and pairing every screen again. A token per screen would let one go on its own; that would be its own decision.
- The screen proves it's the one that asked with a 128-bit `wall_pair` cookie (HttpOnly, SameSite Strict, 5 minutes), never shown on the page, so a device that only sees the code on the TV can't collect the login. A confirmed pairing is held a minute for its screen to collect, once.
- `POST /wall/pair` and `GET /wall/pair` need no token, like the old login. Only `POST /wall/pair/confirm` lets a screen in, and only with the hub's token: the wall's own token can't, so a paired screen can't pair others.
- `POST /wall/pair` only takes a JSON body (`application/json`). A page on another site can only send that by asking the browser first, which the hub never agrees to, so another site can't start pairings in a visitor's browser to hold the slots.
- With `LOGIN_GUARD=on` (record 0083), pairing over plain http is refused, as the hub's own login is, so both cookies are only ever given over https and marked https-only. Off, they're https-only when the page came over https.
- If a screen's look is cut off just as its code is confirmed, the login is kept for its next look (within the minute) rather than lost.
- The old `POST /wall/login` is removed, since nothing uses it and it was a route that took a secret without a token. `WALL_TOKEN` still works as a Bearer header for scripts.
- Logs say a screen started pairing, a code was wrong, a screen was paired and took its login, or pairings were dropped: never a code or a pairing's cookie.
- Pairings are kept in memory only: restarting the API drops them, and the screen shows a new code.

## Decision
A screen pairs with a 6-digit code typed into the hub app on the phone, which grants the wall's read-only cookie. The token box and its login route are gone.

## Confidence and the case against
Fairly confident. The case against: there's no fallback if pairing ever breaks on a screen, so a screen could be stuck until it's fixed (the token as a Bearer header doesn't help a browser). Anyone on the LAN or the tailnet can still hold the 3 pairing slots by asking again and again from their own device, which would keep Phil's screen from getting a code until they stop; it can't let them in. Restarting the API clears them. A guest who sees the code can't use it without the hub's token, but if Phil confirms a code that isn't the one on his screen, that other screen gets the wall's read-only access, which shows what the wall shows to anyone in the room.

## Consequences
Logging in a screen needs the phone, logged in to the hub. On 27 Nov the token was typed into Edge's address bar on the Xbox, where browsers keep what's typed in their history (and may send it for search suggestions, not checked), so the steps make a new `WALL_TOKEN` once pairing works. The projector and the Xbox log in the same way. Bringing the token box back would be a new decision.
