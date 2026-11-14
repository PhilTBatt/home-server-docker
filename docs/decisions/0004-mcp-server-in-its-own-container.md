# 0004. The MCP server runs in its own throwaway container

- Date: 2026-11-14
- Status: accepted

## Context
Claude Code needed to use the API as named tools (MCP) rather than through `host/hub-get.sh`. The MCP program needs the API token, which Claude Code must never see, and Node isn't installed on the host. A decision was needed on where the MCP program lives and how it runs.

## Options considered
- MCP built into the API, reached over HTTP: not chosen. It's the only option that saves memory, because one process could serve every session. But it puts AI-specific code and its SDK inside the API, the tools go down whenever the API restarts, and Claude Code would connect over plain HTTP.
- `docker compose exec` into the running API container: not chosen. It still starts a second Node process, so it saves almost nothing, and that process would get every secret in the API's environment.
- Node installed on the host: not chosen. A new host package for one small program.
- A separate program in `mcp/`, run in a throwaway container built from the same Node base image and started by `host/hub-mcp.sh`: chosen.

## Decision
The MCP server is its own package in `mcp/`, built on the official SDK (`@modelcontextprotocol/server`). Claude Code runs `bash host/hub-mcp.sh`, which reads only `API_TOKEN` from `api/.env` and runs `docker compose run --rm` on the `mcp` service, which is in the `tools` profile. It talks to Claude Code over stdin and stdout, and calls the API like any other client.

## Confidence and the case against
About 75% (Claude's estimate at the time). The case against: one container per open Claude Code session (about 30 MiB each, measured), one more package and image to keep updated, and for reading alone `host/hub-get.sh` was nearly enough.

## Consequences
- The API stays a plain API with no AI code in it; the MCP server is just another client.
- The container gets the API token and nothing else, and the token never appears on a command line.
- The tools still answer when the API is down, with "Couldn't reach the API".
- Nothing new listens on the network, so nothing new is exposed on the LAN or tailnet.
- `docker compose up --build` skips the `mcp` service: after changing `mcp/`, run `docker compose build mcp`.