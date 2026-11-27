# 0082. Set-up mode solves the corner fit itself and keeps it in the browser

- Date: 2026-11-27
- Status: accepted

## Context
A projector throws a rectangle, but the space on the wall is rarely square-on to it, so the wall page needs bending to fit: drag four corners onto the wall and have the page follow. That's a perspective transform from the page's four corners to the four dragged ones. Someone had to write the maths, and the fit had to be kept somewhere.

## Options considered
- Who writes the maths: Phil asked Claude to do it all. Claude wrote it in `hub/wall-fit.js`, with tests that check each corner lands where it was dragged and the middle lands where the diagonals cross. Not a library: maptastic and perspective-transform both exist, but either means committing someone else's file to a page with no build step, for about forty lines of maths.
- Where the fit is kept: Phil agreed to the browser for now (`localStorage`). A TV doesn't need fitting and the projector isn't bought, and the wall's token can only read, so keeping it on the hub would need a route that writes, behind the full token. The case for the hub is that a browser can forget its storage; then the corners are dragged again.
- How it's drawn: one CSS `matrix3d` on the page, not a canvas or WebGL, so the page stays ordinary HTML and the browser does the bending.
- The fit is kept for one screen size, so a different screen, or the same browser at another size, starts from plain fill-the-screen instead of a fit made for something else.

## Decision
Set-up mode drags four corners; `wall-fit.js` solves the eight equations for the perspective map and the page is drawn through it as a `matrix3d`, kept in that browser's `localStorage` for that screen size.

## Confidence and the case against
Confident in the maths, which is standard and tested. Less in how drag and the arrow keys behave in the Xbox's browser with a controller, untried. Bending the page uses fewer of the projector's pixels, so text gets softer the more it's bent; that's the projector's limit, not the page's.

## Consequences
Fitting needs a pointer or arrow keys on the screen showing the wall. Moving the projector means fitting again. A fit can't be copied to another screen; moving it to the hub later would need a write route and its own decision.
