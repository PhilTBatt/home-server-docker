# 0065. Jarvis can decide to look something up, through one narrow tool

- Date: 2026-11-26
- Status: accepted

## Context
Record 0063 lets me have something looked up by saying "look up" and a question. That isn't how I use Claude: Claude looks things up by itself when a question needs it, and mixes what it finds with what it knows. I wanted Jarvis to be able to do that too.

The risk record 0063 avoided comes back here. When Jarvis writes the question, the Jarvis who can read my brain is choosing words that leave my server. He could put something private in them by mistake, or because the answer to an earlier look-up told him to.

## Options considered
Chosen 26 Nov: build both ways behind the same setting.
- Only when I say look up: kept, as `ask`. Nothing of mine can leak, but I have to say the words and he can't combine what he finds with what he knows about me.
- Jarvis decides for himself, through one narrow tool that hands a short question to the same separate helper: chosen as well, as `auto`. It's the feel I asked for.
- Give Jarvis the built-in web tools: lost, as in record 0063.

Claude's picks, not discussed:
- The tool's name, `look_up`, and its wording, which carries the rules to Claude on every request.
- One look-up for each message of mine, and none while he's looking for brain questions.
- A question of at most 300 characters, refused if longer instead of being cut.
- The answer goes back to him marked as text written by strangers, with up to four site names.
- He says "Looking that up." in the middle of his answer, and the question he sent is shown on screen.
- A look-up he makes is logged the same way as one I ask for, with its mode.
- On the Agent SDK engine the tool is an in-process MCP server, which names zod as a dependency of Jarvis. The SDK already required it, so nothing new is installed. I was asked first.

## Decision
`JARVIS_WEB=auto`. Jarvis gets one tool, `look_up`, on both engines. It takes one short question, hands it to the helper from record 0063 or 0064, and returns a short answer marked as text from the web. He never gets a web tool of his own.

## Confidence and the case against
Medium. The case against: this is the mode where something from my brain could leave the server, in the one question he writes. The limits make that small and the look-up log lets me check, but they don't make it impossible. A look-up also adds its wait to the middle of an answer.

## Consequences
- With `off` or `ask` nothing here applies: he has no tool, and record 0063's promise holds that Claude never sees a look-up.
- With `auto`, text from the web reaches the Jarvis who reads my brain. It's marked, and hub actions still need my typed yes.
- The look-up log matters most in this mode: it's the record of what he sent.
- Saying "look up" still works in `auto`, without Claude, as in `ask`.
