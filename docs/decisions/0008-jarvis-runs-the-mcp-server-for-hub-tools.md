# 0008. Jarvis gets the hub's tools by running the MCP server inside his own container

- Date: 2026-11-18
- Status: accepted

## Context
Jarvis could only read the brain. The hub's abilities live in the API, and the MCP server in `mcp/` already offers them to Claude Code as tools. The plan's rule is one list of tools, so Jarvis should reuse that server rather than describe the tools a second time. A decision was needed on how Jarvis reaches it, and where the API token lives.

## Options considered
- The MCP server as a child process inside Jarvis's container, talking over a pipe (stdio): chosen. It's the same way Claude Code uses it, nothing new listens on the network, there's no extra always-on container, and the MCP server doesn't change.
- The MCP server as its own always-running compose service, reached over the internal network (HTTP): not chosen yet. It keeps the token out of Jarvis's container altogether. But anything on that network could use the tools unless the server gets its own login or a private network, it needs more code in `mcp/`, and it's a container running all day while Jarvis is only on during a chat. It may suit later, once Jarvis is always on with voice.
- Jarvis calling the API directly with his own tool list: not chosen. It means two descriptions of the same tools to keep in step, and the token would still be in Jarvis's container.
- Giving Jarvis the Docker socket so he can start MCP containers the way `host/hub-mcp.sh` does: not chosen. The socket is effectively root.

## Decision
With `JARVIS_HUB_TOOLS=on`, Jarvis is started by `bash host/jarvis.sh`, which passes in only `API_TOKEN` from `api/.env`. He runs the MCP server from `mcp/dist`, mounted read-only at `/mcp`, with `MCP_ACTIONS=off`, so only its read tools exist. On the Agent SDK engine, the token goes into the engine's environment, which the engine passes on to the MCP server. It's kept out of the MCP server's settings, because the engine puts those on its command line. The Agent SDK engine comes first; the plain API engine needs its own way to start the MCP server, and its own record.

## Confidence and the case against
Medium (Claude's estimate). The case against: the token now sits in Jarvis's container, close to him rather than well away. None of his tools can read his environment or anything outside the brain and the API today, but a tool added later could change that. The HTTP option keeps it out entirely, and may be where Jarvis ends up anyway.

## Consequences
- Nothing new listens on the network, and there's no new container. The MCP server is one more Node process while Jarvis runs: about 60 MB, measured on Node 22 in Claude's workspace.
- Jarvis's container holds the API token while he runs, so with the switch on, record 0007's point that he has no token no longer holds. On the Agent SDK, the engine has the token in its environment, as it already has the Anthropic key, and the MCP server gets the engine's whole environment, Anthropic key included. A command line would have been worse, since anyone logged in to the server can see every command line with `ps`. The engine check looks for the token on every command line.
- Jarvis can only read the hub. The three actions need their own decision, with a yes or no in the chat.
- Jarvis runs `mcp/dist` as built on the host, not the MCP image. After `mcp/` changes, `npm test` for it has to be run again, or he keeps the old build.
- `docker compose run --rm jarvis` still works with the switch off. With it on, Jarvis won't start without the token, and says to use `bash host/jarvis.sh`.
