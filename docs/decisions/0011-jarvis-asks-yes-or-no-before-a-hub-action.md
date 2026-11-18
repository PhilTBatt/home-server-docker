# 0011. Jarvis's own code asks yes or no before each hub action

- Date: 2026-11-18
- Status: accepted

## Context
Records 0008 and 0009 gave Jarvis the hub's read tools only. The MCP server also offers three actions: scanning the library, and stopping or starting a download. They're the first things Jarvis could change on the server, so a decision was needed on how I say yes or no to each one, and what stops him going ahead without asking.

## Options considered
- A check in Jarvis's code, outside the model, that stops before each action, shows me what he wants to do, and refuses unless I type yes: chosen. The model can't talk itself past it.
- Telling him in his instructions to ask first: not chosen. Instructions guide the model; they don't stop it.
- The Agent SDK's own permission prompts (its `default` mode with a `canUseTool` callback): not chosen. It changes how every tool is decided on that engine, including the reads outside the brain that `dontAsk` refuses today. A hook on the hub's actions leaves everything else as it is.
- Asking on my phone through ntfy: not now. It may suit the voice step, when there's no keyboard.
- Leaving the actions to this repo's Claude Code session, as record 0005 does for the notes session: not chosen. 0005 kept them off the phone because a phone prompt is easy to approve without reading, and because tool answers such as torrent names are text from the internet that could carry instructions. Jarvis asks in the terminal I'm typing in, only when I've turned this on, and the actions are the same low-stakes ones. 0005 still holds for the notes session; the injection risk is in the case against below.

## Decision
With `JARVIS_HUB_ACTIONS=on` (which needs `JARVIS_HUB_TOOLS=on`), the MCP server is started with its actions, and each action asks me first:
- On the Agent SDK, a `PreToolUse` hook asks and then allows or refuses the call. The actions aren't in `allowedTools`, so if the hook fails or doesn't run, `dontAsk` refuses them. The hook is set to block on failure.
- On the plain engine, the tool loop asks before running any tool that the hub marks as needing a yes.
- Either way, only `yes` (any case, with spaces at either end ignored) typed after the question lets it run; in a terminal, anything half-typed before the question is cleared first. The question is drawn as part of readline's prompt, so redrawing the line can't wipe it. Anything else, no answer within 60 seconds, or the chat closing means no, and the model is told it wasn't done. Ctrl+C closes Jarvis, so nothing runs. Two actions are asked one after the other.
- Jarvis now allows the seven read tools by name rather than everything from the hub, with or without the actions.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against:
- A typed yes is fine at a keyboard, but a spoken yes could come from the TV. The voice step will need its own answer.
- A download is shown by the start of its hash (or as "a download" if what he gave isn't a hash), so I rely on what Jarvis said to know which download it is. That's the gap record 0005 worried about: text he reads, such as a torrent name or, with `JARVIS_SESSION_NOTES` on, a session's notes, could carry instructions that get him to ask for an action while describing it as something else. The actions can be undone (a stopped download can be started again), and nothing runs without my yes. Showing the download's name, looked up by the code rather than written by the model, would close the gap, and is left for later.
- The model can still ask for an action I didn't want. The check only means nothing happens without my yes.

## Consequences
- Nothing new listens on the network. The actions go through the same API routes, with the same token, as Claude Code's.
- A tool added to the MCP server later is left out on the plain engine until Jarvis's list is updated too. The Agent SDK still offers it to the model, but refuses it if he tries.
- A refused action counts as a refused tool on both engines, as other refusals do.
- The wait for my answer doesn't count towards the question's time limit, but it does show in the answer's time. The log records whether the actions were on, so `npm run compare` keeps those answers apart.
- The answer log doesn't record which actions ran. A short log of what Jarvis did is left for later.
