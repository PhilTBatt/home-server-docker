# 0094. The wall's pages are cards, opened by code words, the remote, and Jarvis by himself with a list-only tool

- Date: 2026-11-28
- Status: accepted

## Context
The wall (records 0080 to 0082) shows one main page: Jarvis in the middle of an orbit of items. The designs for the projector (28 Nov) add pages: a train card with the change of trains on each row, a page for the server, and many more to come. Something has to say how a page opens, what it looks like while it's open, how it goes away, who can open one, and what a guest in the room sees. Jarvis opening a page on his own is a new thing he'd do unasked, which CLAUDE.md says needs its own decision: this is that decision.

## Options considered
Chosen by Phil, 28 Nov:
- **Everything is a card.** An item on the orbit is a card's small size, the pointer's bubble its middle size, and an open page its full size.
- **The tilt open.** The orbit tips back flat and the card rises in front, with Jarvis staying in view. Whether a second press also zooms isn't decided, so there's no zoom.
- **The pointer,** for now: a small dot with a faint glow and trail, whose ring swells into a wobbly bubble round what it reaches.
- **Jarvis opens pages with code words, and with a tool that can only open pages from the list.** He never writes wall code. In Phil's words, he opens pages "when he deems fit or through code words".
- **Back to the main page after 2 minutes, or sooner when he says back.**
- **Every page shows in guest mode, plus a list of private pages, empty for now, that are hidden in guest mode.**

Not chosen, from the designs: diving in (the camera zooming into the item) and slide and unfold (the system sliding aside).

Claude's picks, not discussed:
- **One list of pages, in the hub.** `wallPages` in `api/src/modules/wall/pages.ts` holds each page's short name, title and the words that open it. Jarvis reads it from `GET /wall/pages`, so a page and its words are added in one place. The first pages are the orbit's own items: the server, the next train, the backup, alerts, deals, reminders and what's playing. Their cards show what the orbit already shows, bigger; the pages of their own (the journey, the server's health and the rest) come later, one by one.
- **`JARVIS_WALL_PAGES`: `off`, `words` or `on`.** `words` is the code words only; `on` adds the tool. So the words can be tried before he's allowed to open pages himself.
- **The words:** show me and a page's words (show me the server, show me my train), with on the wall after them or not; back, go back, back to the main page, close the page. Said out loud only, like every code word. With the pages on, show me the next train opens its page rather than reading out the trains; the other train words are unchanged.
- **The tool is `open_wall_page`, in the hub's MCP server**, behind its own switch, `MCP_WALL_PAGES`, which Jarvis sets only with `JARVIS_WALL_PAGES=on`. It takes a page's short name, the hub refuses anything not on the list, and it changes nothing else, so it runs without a yes, on both engines. It's in neither Claude Code's settings nor `MCP_ACTIONS`.
- **Guest chats keep the page words, and only those.** A guest chat has none of the hub's other code words. The page words can only open and close pages, and private pages stay shut in guest mode, so they're allowed: otherwise the private list would mean nothing. Jarvis refuses a private page himself in a guest chat, so it stays shut even when the hub doesn't know he's in guest mode (with `JARVIS_MODES` off, when the hub didn't hear the switch, or with modes off at the hub); the hub's own refusal is the second guard. Guest chats don't get the tool.
- **Private pages:** `WALL_PRIVATE_PAGES` in `api/.env`, page names with commas between. In guest mode the hub refuses them (403), hides one already open, and tells a screen which they are, so a card the screen opens itself stays shut too. A screen waiting on the long poll hears within about a second when guest mode starts or ends, and it says which pages it was last told are private, so a change that came between two of its polls is answered at once.
- **The remote drives the pointer for now, behind its own setting, `WALL_REMOTE`,** off unless set, so with every setting off the wall is as it was. On the projector there's no mouse: the arrows move the pointer, OK opens what its bubble is on (or closes the open card), and back closes a card. A card opened this way is that screen's own: it never goes through the hub, since the wall's token stays read-only. The phone as a wand (item 7) will drive the same pointer later.
- **The remote also fits the wall** (with `WALL_REMOTE=on` too). Set-up mode was hard with a remote (record 0082 assumed a mouse): the pointer can now reach a "Fit to the wall" chip, OK picks each corner in turn and then Save, and a held arrow moves a corner 8 pixels at a time.
- **While a card is open, Jarvis sits where he does for anything in the middle** (to the left), so the card on the right never covers him; the opened item leaves the orbit, as drawn.
- **The card's four actions (to the phone, copy, pin, ask) and "leads to"** wait for the wand, since nothing on the wall could press them yet.
- **`?debug=1`** adds a frames-a-second counter, for the projector's first-week check of how smoothly it draws.

## Decision
With `WALL=on` and `JARVIS_WALL_PAGES` set, the wall opens pages from one list in the hub for two minutes, by Jarvis's code words, and with `on` by his own tool, which can open nothing but a listed page. The orbit tilts back and the page rises as a card. Pages on the private list are never shown in guest mode.

## Confidence and the case against
Moderate. The hub's side is small and checked; how the tilt and the pointer feel on the projector can't be known until it's tried there.

The case against:
- Jarvis opening pages unasked could be distracting, or show something at a bad moment to whoever's in the room. The tool is a separate setting (`on`, not `words`), his instructions say to use it only when it helps with what's being asked, and back closes it at once.
- Guests can open pages by voice. They see nothing the orbit doesn't already show, and the private list is the guard; it's empty until Phil fills it, so the brain board, when it's built, will show in guest mode unless it goes on the list.
- Cards opened with the remote never reach the hub, so Jarvis doesn't know what a screen is showing then.
- Whether the projector's kiosk sends the remote's arrows and OK to the page as keys isn't known; if it doesn't, the pointer waits for the wand.

## Consequences
- A new page is one entry in `wallPages`. A page that shows more than the orbit does, or one taken off the private list, is security-sensitive.
- Anything else Jarvis might do on the wall unasked needs its own decision.
- The wand (item 7) feeds the same pointer, and the card's actions come with it.
