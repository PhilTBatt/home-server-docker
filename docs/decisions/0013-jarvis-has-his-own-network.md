# 0013. Jarvis has his own Docker network, shared only with the API

- Date: 2026-11-18
- Status: accepted

## Context
Apart from `beszel-agent`, which uses the host's network, every service in `docker-compose.yaml` was on Compose's one default network, Jarvis included. So he could open a connection straight to any container by name: qBittorrent, Jellyfin, the *arr apps, and Byparr, which has no login. He only needs the API, for the hub's tools and for looking up a download (record 0012), plus the internet for Anthropic's API. Nothing he has today can make his own web requests, but he can now change things, and a web tool or another MCP server could come later. The fewer things he can reach, the less a mistake or an injected instruction can touch.

## Options considered
- A network of his own, `jarvis`, that the API also joins, with the API staying on the default network too: chosen. He reaches the API by the same name as before, and no other container directly. The network isn't marked internal, so he can still reach the internet.
- Leave him on the default network: not chosen. It's the reach problem above.
- An internal network with no internet, plus a proxy for Anthropic's API: not chosen for now. It adds a container and its RAM. It would also close the route through published ports described below.
- A firewall rule on the host (Docker's `DOCKER-USER` chain) to stop his network reaching the server's published ports: not chosen for now. It's a change to the host's firewall, which needs its own design and testing; it's left as a separate decision.
- Moving the MCP server into its own service on this network (record 0008's second option): not now. This network is where it would go if that's done later.

## Decision
`docker-compose.yaml` gets a top-level `networks:` with `jarvis`. The `jarvis` service is on `jarvis` only. The `api` service lists both `default` and `jarvis`, because a service that lists any networks joins only those, and Caddy and the API's own calls to qBittorrent and Jellyfin need the default network.

## Confidence and the case against
Fairly confident that it does what it says, which is less than full isolation (Claude's estimate). The case against:
- It only stops him reaching other containers directly. A test in Claude's workspace showed Jarvis couldn't reach qBittorrent or Byparr by name or by container address, while a container on the default network could. But a container's published port answered him through the server's own address. On the server, most services publish ports, and Caddy serves most of them by their `.home` names, so he can still reach those the way any device on the LAN can, through their own logins. Byparr, with no published port and no Caddy name, is the one service fully out of his reach.
- The API is still reachable from his network, and it can change things with the token. That's by design: the token and the yes or no in record 0011 guard it.
- He can still reach the internet. Through Docker's normal outbound access he can very likely reach the rest of the LAN too, such as the router (not tested here).

## Consequences
- `docker compose up -d` after this change recreates the API, so it joins the new network. `bash host/hub-update.sh` runs that itself when it pulls this change. Until then, Jarvis's hub tools still load, but every call says it couldn't reach the API, and download lookups say the name couldn't be looked up.
- Anything new Jarvis needs to reach directly has to join `jarvis`, which makes each one a visible change in the compose file.
- The MCP server Claude Code uses (the `mcp` service) stays on the default network, where it already reaches the API.
