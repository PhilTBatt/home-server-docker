# 0081. The wall page is B3 through the day, on hub.home

- Date: 2026-11-27
- Status: accepted

## Context
With Jarvis's state on the hub (record 0080), the wall needs a page: something to try on the TV through the Xbox's browser before buying a projector. The designs were drawn on a Design canvas, and Phil picked from them.

## Options considered
Chosen 27 Nov (Phil):
- Layout B3: Jarvis in the middle of an orbit, with what matters right now drifting to the middle beside him. Not B2 (the solar system) or B5 (the strip), for now.
- Through the day: the morning train drifts in; daytime is B's labelled items with big numbers and the inner ring with two slowly turning dots, with A's splashes of colour; something arriving bursts sparks off him and flies out to the orbit; bedtime fades to C's quiet line and he goes sleepy.
- The orbit's items spread evenly, and glide aside as things come and go.
- All twelve poses; the wobble for speaking, and the string behind a switch (`WALL_SPEAKING`); the sun ring while music plays; the countdown ring emptying clockwise; what he heard after Whisper; the mode's colour over the whole wall.

Claude's picks, agreed by Phil as a set:
- The page lives at `hub.home/wall.html`. Not its own name (`wall.home`), which needs an AdGuard entry, a Caddy block and its own login, since cookies are per name.
- One trimmed `GET /wall` built by the hub, not the page calling each module's route: the wall's token can then read one route with exactly what the screen shows, and nothing else. It keeps the server doctor's answer 5 minutes and the departure board's 1 minute, so an open screen adds at most a board call a minute and a qBittorrent and Jellyfin call every 5 minutes; Spotify is asked with each picture, about every 30 seconds.
- What drifts to the middle, first match wins: what needs you, a timer's last 3 minutes, something new (6 seconds), then the morning train. Morning is the train alert's reminder time to the end of its window, on its days.
- Deals are a count of today's alerts, never a listing, since guests see the wall.
- No fonts are loaded, like the phone page: the screen's own fonts, rather than calling Google from the TV or adding font files to the repo.
- The page's logic that can be tested is a module of its own, tested with `node --test` and no packages, and GitHub runs it.

## Decision
`hub/wall.html` shows B3 through the day from `GET /wall` and `GET /wall/jarvis`, scaled to fit any screen, on pure black.

## Confidence and the case against
Fairly confident in the layout, which follows boards Phil picked; less in how it runs on an Xbox One S, whose browser hasn't been tried. Many glowing, animated rings could be slow on it, and the poses may need simpler glows there. The case against one trimmed route: every new thing the wall shows means changing the API, not just the page.

## Consequences
The wall can be tried on any screen that can open `hub.home`, and a projector later only needs the corner fit (record 0082). Anything added to the picture is shown to guests. The page polls the picture every 30 seconds, so the orbit's items can be up to half a minute behind; Jarvis himself is live.
