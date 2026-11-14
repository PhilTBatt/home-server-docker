# 0005. Only this repo's Claude Code session can change things

- Date: 2026-11-14
- Status: accepted

## Context
Two Claude Code sessions use the MCP tools: the one in this repo, which edits the code, and one in a separate private notes repo that's used from a phone. Three tools change things: `scan_library`, `stop_download` and `start_download`. The notes session holds personal information, and some tool answers, such as torrent names, are text from the internet that could carry instructions aimed at Claude. A decision was needed on what the notes session may do.

## Options considered
- Both sessions get every tool, with the actions always asking first: not chosen. The actions are low-stakes, but every prompt would land on a phone, where it's easy to approve without reading, and any future action tool would turn up there automatically.
- Deny rules for the three actions in the notes session's settings: not chosen. They work today, but each new action tool would need its own deny line.
- A read-only mode in the MCP server, `bash host/hub-mcp.sh read-only`, that never offers the action tools: chosen.

## Decision
The notes session starts the server with `read-only` and gets only the six `get_` tools. This repo's session starts it normally and gets all nine, with the three actions behind ask rules so they always prompt. Reading is for the notes session; doing is for this one.

## Confidence and the case against
About 60% for the mechanism (Claude's estimate at the time). The case against: three deny lines would do the same job today with no code, and the mode was built before any riskier action tool exists. The case against the split itself is convenience: a scan from the phone means the hub page's Scan button, or Remote Control on this repo's session once that's set up.

## Consequences
- A tool that doesn't exist in a session can't be approved there by mistake.
- New action tools stay out of the notes session without anyone remembering to block them.
- It fails closed: the script refuses anything other than no argument or `read-only`, and the server won't start unless `MCP_ACTIONS` is exactly `on` or `off`.