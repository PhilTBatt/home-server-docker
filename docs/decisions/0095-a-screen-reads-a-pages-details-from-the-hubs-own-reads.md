# 0095. A screen reads a page's details from the hub's own reads

- Date: 2026-11-28
- Status: accepted

## Context
Record 0094 made every page a card that shows what the orbit already shows. The kept pages need more: the trains card has a row per journey with its change of trains, and the health, server and other pages will each need their own details. A screen can only read with the wall's token, which reads nothing but the routes in `wallReads`, and anything a screen reads is shown to anyone in the room, guests included.

## Options considered
Claude's picks, not discussed:
- **One route for every page's details, `GET /wall/pages/<page>`, added to `wallReads`.** The screen asks only while that page is open, every 30 seconds, but the route answers whenever it's asked: the hub can't tell what a screen has open, since a card the remote opens never reaches it. Not chosen: putting every page's details into the wall's picture, which a screen reads every 30 seconds whether or not a page is open, so it would carry everything all the time and couldn't keep a private page's details back in guest mode; one route per page, which would grow `wallReads` with every page.
- **Each page's details are made in the hub, from its own reads, and trimmed to what the page shows** (`page-data.ts`), with the reader for each page set in `app.ts`. No outside text beyond names reaches a screen: the trains page counts the board's messages and leaves out why a train is late, since both are the rail company's words.
- **The privacy rules are the same as for opening a page:** a page that's private in guest mode is refused (403), and a page without details of its own, or whose part is switched off, is a 404, so the screen shows its plain card.
- **The first page with details is the trains**, made from the same kept board the wall already reads, so it adds no calls to the rail data service.

## Decision
A screen reads an open page's details from `GET /wall/pages/<page>`, made by the hub from its own reads, trimmed, and kept back for private pages in guest mode.

## Confidence and the case against
Moderate to high. It's small and follows the wall's existing rules.

The case against:
- It's one more route the wall's token reads, it answers at any time, not only while the page is open, and every page added later widens what it returns. For the trains that's the from, change and destination stations and the times, to any paired screen whenever it asks, and to guests in the room unless the page is on the private list. Each page's reader is the place to check that, and the tests pin the list of routes.
- The details are only as fresh as the hub's kept reads (the board's are a minute old at most).

## Consequences
- A new page with details is one reader in `app.ts` and one trimming function in `page-data.ts`, and it's security-sensitive in the same way as `wallReads`.
