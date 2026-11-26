# 0063. Jarvis looks things up on the web through a separate helper on my Claude plan

- Date: 2026-11-26
- Status: accepted

## Context
Jarvis couldn't look anything up. Claude answers from what it already knows, my brain and the hub, so tomorrow's weather or a new release was beyond him, and I wanted him to be able to look things up the way Claude can in a chat.

It isn't just a switch. A web page is text written by a stranger, and it can be written to give an AI orders. Jarvis can read my whole brain. Give the same Jarvis the web and two things become possible: a page talks him into saying or doing something, or a page talks him into putting something from my brain into his next search, and a search is a message that leaves my server.

## Options considered
Chosen 26 Nov.

How he gets the web:
- Give Jarvis the built-in web tools: lost. The least work, and both risks in full.
- A separate helper that only ever sees the question: chosen. The Jarvis who reads my brain never touches the web, and the helper that does never sees my brain, the hub or the chat.
- Leave it, and ask Claude on my phone: lost. I want it in Jarvis.

When a look-up happens:
- I say look up and a question: chosen, and built here. Nothing of mine can leak, because Claude isn't asked at all.
- Jarvis decides for himself, through one narrow tool that hands a short question to the same helper: chosen as well, behind the same setting, as its own piece of work.

Who the helper is:
- Claude Code on my Claude plan: chosen. It's what I was hoping for. No charge for each search; look-ups come out of the plan I already pay for.
- A plain API call with Anthropic's web search tool: not the default, because it's about a cent a search. I tried one Claude Code look-up on the server and it took 12.7 seconds, so this is to be built too, behind a switch, to compare them.

Where the helper runs:
- Inside Jarvis's container, as a locked-down separate process: chosen. Claude's recommendation; I said I'd trust it.
- In its own container, where my brain and keys aren't present at all: lost for now. Stricter, but a new container and package, and it only adds protection against a bug in Claude Code itself.

What the helper may do:
- Search only: lost. Claude Code's search gives titles, addresses and a digest, and sometimes that isn't enough.
- Search and open pages: chosen. The helper knows nothing but the question, so the worst a bad page can do is spoil that answer.

Limits:
- A cap of 20 look-ups a day: lost. Annoying on the day I need it.
- He says he's looking it up every time, and I decide for myself: chosen.

What the log keeps:
- Numbers only, or numbers and sites: lost.
- Numbers, the sites and the question that was sent, in its own file: chosen. The question is the one thing that leaves the server, and I can delete the file. The answer isn't kept.

Claude's picks, not discussed:
- The setting names, and the token under its own name, `JARVIS_WEB_TOKEN`, removed from Jarvis's environment once it's read.
- The phrases that count, the typed `/lookup`, that a phrase only counts at the start of what I said and as the whole of it, and that "look up my…" goes to Claude.
- A look-up runs in the background, and what stops it.
- The limits: 300 characters for a question, 1,200 for an answer, 45 seconds, six steps for the helper.
- The helper's instructions, and that it runs on the fast model.
- Every rule in the address guard, and that it refuses when it can't tell. Opening a page is never allowed outright: only the guard can allow one, so a guard that's missing, broken or too slow means no page.
- A look-up that fails prints why under his line.
- The question reaches the program on its input, never on its command line, so no question can be read as an option.
- A look-up isn't part of the chat, so Claude never sees its question or answer, and there's no follow-up recording after one.
- The answer log gets each look-up's numbers when it's on, and the compare tool reports them.

## Decision
`JARVIS_WEB`, off by default, with `ask` for now. On, "look up" and a question, said or typed as `/lookup`, is handed by Jarvis's own code to the Claude Code program that comes with the Agent SDK, run once as a separate process with two web tools, an empty folder, my plan's token and nothing else. A guard checks every page address first, and a page opens only if the guard says yes. He says he's looking it up, then reads me the answer.

## Confidence and the case against
Medium. The case against: it's slow, 12.7 seconds the one time I measured it. Look-ups share the allowance I use for everything else. A year-long secret now sits on the server. The helper lives in the same container as my brain and my keys, and what keeps it from them is Claude Code honouring its tool list. And the guard checks where a name leads a moment before the page is fetched, so a name that changes in between could get past it.

## Consequences
- With the switch off nothing changes: the phrases go to Claude and `/lookup` isn't a command.
- The Jarvis who reads my brain still has no web tool, and mustn't be given one.
- My server now contacts whatever sites a search turns up, as a browser would.
- The token runs out after a year, and look-ups stop until I make a new one.
- A look-up isn't part of the chat, so he can't answer a follow-up about what he found.
- While a round of brain questions is open (record 0061), "look up" said out loud is filed as an answer, like anything else I say then except stop listening.
- The look-up log holds my questions, which no other log does.
