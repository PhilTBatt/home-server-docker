# 0087. Only DNS, Caddy, torrents and Jellyfin publish ports

- Date: 2026-11-28
- Status: accepted

## Context
Most services published their own web page's port on the LAN as well as being served by Caddy under a `.home` name: AdGuard's admin (3000), Homepage (8080), Uptime Kuma (3001), qBittorrent's page (8081), Prowlarr (9696), Sonarr (8989), Radarr (7878), Seerr (5055) and Beszel (8090). A published port skips Caddy, and Docker's own docs say published ports skip the host firewall's rules too (https://docs.docker.com/network/packet-filtering-firewalls/), so every device on the Wi-Fi could reach each app directly. This was decision 3 in the 27 Nov security review.

## Options considered
Chosen by Phil, 28 Nov: close what Caddy covers. Keep DNS on 53 (TCP and UDP), Caddy's 80 and 443, the torrent port 6881 (TCP and UDP), and Jellyfin's 8096 for TV apps. Not leaving them as they were, and not adding firewall rules on top, which published ports would skip anyway.

Claude's picks, not discussed:
- Beszel's 8090 stays published on `127.0.0.1` only, not dropped. `beszel-agent` runs on the host's network and connects to its hub at `localhost:8090` (Beszel's own same-host example). Without it the hub would fall back to reaching the agent over the shared socket, which Beszel's docs say it does when the agent has no WebSocket, but the agent would keep trying and failing. On `127.0.0.1` it can't be reached from another device, with Docker Engine 28.3.3 or later: before 28.0, devices on the same network could route to a port published on `127.0.0.1`, and 28.2.0 to 28.3.2 let them again after a firewalld reload (CVE-2025-54388). The steps check the version.
- Beszel's `APP_URL`, used for its links, becomes `http://metrics.home`.
- Homepage's links go to the `.home` names, Jellyfin's included. Its widgets already used container names on Docker's network, so they don't change. Byparr's link, to a port that was never published, is left as it was.
- `host/ports.test.sh` checks the compose file publishes exactly these ports, whichever way a ports list is written, that only the Beszel agent uses the host's network, and that the add-on compose files publish nothing, so a new one fails a test.

## Decision
Only 53, 80, 443, 6881 and 8096 are published to the LAN, with Beszel's 8090 on the server itself. Every other page is reached through Caddy.

## Confidence and the case against
Confident it closes the direct routes. The case against: anything that used `192.168.0.200:<port>` breaks, and some of it isn't in the repo: Uptime Kuma's monitors (kept in Kuma's own database), bookmarks, and the apps' own settings for their external address. Some apps check the Host header and may refuse a name they weren't told about (Homepage's `HOMEPAGE_ALLOWED_HOSTS`, qBittorrent's host header check), which would show only once the port has gone. The steps check each `.home` page before the ports close.

## Consequences
A new web service needs a Caddy name, not a published port; publishing one needs its own decision. If Caddy is down, those pages can't be reached from another device until it's back.
