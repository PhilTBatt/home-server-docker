# 0009. The plain API engine reaches the hub's MCP server with the official MCP client package

- Date: 2026-11-18
- Status: accepted

## Context
Record 0008 gave the Agent SDK engine the hub's tools by running the MCP server inside Jarvis's container. The SDK starts and talks to the server itself. The plain API engine has nothing that does, so a decision was needed on how it starts the server, lists its tools and calls them.

## Options considered
- The official MCP client package, `@modelcontextprotocol/client`: chosen. It's from the same project and version line as `@modelcontextprotocol/server`, which `mcp/` already uses, so both ends speak the same protocol version. It starts the server as a child process, and Jarvis chooses exactly which settings the server gets.
- A small client written by hand (the messages are lines of JSON over a pipe): not chosen. No new package, but it means owning the protocol's start-up handshake, version changes and error cases, which the package already handles and tests.
- Leaving the plain engine without the hub's tools: not chosen. The two engines are there to be compared, and a comparison where only one has the tools says little.

## Decision
The plain API engine starts the MCP server from `mcp/dist` with the MCP client package, lists its tools when Jarvis starts and adds them after the brain's tools, calling the server for those names. If starting the server, or listing its tools, takes longer than 10 seconds or fails, or the server lists none, the server is stopped, Jarvis says so, and he carries on with the brain only.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against: it's a new package and its dependencies to keep updated, for something Claude estimates a hundred or so lines could do, and the package loads into Jarvis whichever engine is in use.

## Consequences
- `jarvis/` has one more package. After this change, or a Dependabot update to it, `npm ci` for `jarvis/` has to be run before Jarvis starts, on either engine.
- Loading it adds about 15 to 18 MB to Jarvis's own process, on either engine, depending on how it's measured (Node 22, in Claude's workspace). The MCP server itself is the same extra Node process as on the Agent SDK.
- The plain engine's MCP server gets only the token, `MCP_ACTIONS` and the basic settings HOME, LOGNAME, PATH, SHELL, TERM and USER, so not the Anthropic key, unlike on the Agent SDK. The token goes in its environment, never on a command line.
- The plain engine knows straight away if the server didn't start, so it says so as Jarvis starts. The Agent SDK only finds out with the first question.
- Jarvis waits up to 10 seconds at start-up for a server that hangs, or up to 20 if it hangs after starting, plus a few seconds to stop it. Ctrl+C during that wait stops him at once. The Agent SDK waited about 30 seconds in a test, during the first answer.
