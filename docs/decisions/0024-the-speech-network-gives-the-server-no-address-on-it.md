# 0024. The speech network gives the server no address on it

- Date: 2026-11-19
- Status: accepted

## Context
Kokoro's record, 0020, put it on a Docker network of its own, `speech`, marked internal. Internal stops a container reaching the internet or the LAN. But Docker still gives the network's bridge an address on the server, so a container on the network can reach anything on the server itself that listens on that address or on every address, as SSH normally does. That record left it open, because the fix needs Docker Engine 28 or newer and the server's version hadn't been checked. It has now: 29.7.2.

## Options considered
- Docker's `isolated` gateway mode on the network, the bridge driver's `com.docker.network.bridge.gateway_mode_ipv4` option: chosen. Docker's documentation says no address is assigned to the bridge in this mode, and that the mode can only be used on an internal network. With no address for the server on the network, a container that's only on it, as Kokoro is, has nothing of the server's to connect to. Jarvis is also on his own network, `jarvis`, which isn't internal, and can still reach the server's own services through that one.
- Leaving it as it was: not chosen. Kokoro is a large image from someone else, and it's handed every answer Jarvis speaks. The less it can reach the better, and this costs two lines.
- A firewall rule on the server for the network's address: not chosen. It would have to be kept in step with Docker, which writes its own rules, and the address can change whenever the network is rebuilt.
- Making SSH and the server's other services listen on chosen addresses only: not chosen. It has to be done service by service, and it's forgotten for the next one.

## Decision
The `speech` network is internal and isolated. Only the IPv4 option is set, because the network has no IPv6.

## Confidence and the case against
High that it closes the gap. In a test with Docker 29.10, away from this server, a container on the internal network reached a listener on the host through the network's own address. With the option set, the host had no address on the network, nothing of the host's could be reached from it, and Jarvis still reached Kokoro by name and spoke. IPv6 wasn't tested, because the test machine had none: if the server gives the bridge an IPv6 link-local address, this change doesn't remove it. The strongest case against is that it ties this file to Docker 28 or newer. What an older Docker does with the option wasn't tested: it may refuse to make the network, which would stop a chat with the voice on from starting, or ignore it, which would quietly bring the gap back.

## Consequences
- A `speech` network made before this change has to be rebuilt to pick the option up: with no chat running, remove Kokoro's container (`docker compose rm -sf kokoro`) and the network (`docker network rm docker_speech`), and the next chat with the voice on makes both again. In the same test Docker Compose 5.7 rebuilt the network by itself the next time Kokoro was started, but it kept Kokoro's old container and plugged it back in, and `docker compose run` never rebuilt it. Started while another chat was on the old network, it stopped Kokoro, failed with `has active endpoints`, and left Kokoro on no network at all, so every later start failed until both were removed by hand.
- Docker no longer keeps the network's first address for the server, so a container can be given it.
- If IPv6 is ever switched on for this network, `com.docker.network.bridge.gateway_mode_ipv6` needs the same value.
- Jarvis's own network, `jarvis`, isn't changed: it isn't internal, because he needs the internet for Anthropic's API (record 0013), and this mode only works on an internal network.
- Whatever joins `speech` can still talk to Kokoro, and to Jarvis while he's on it, so joining it stays security-sensitive.
- `host/jarvis.test.sh` checks both settings, that the network has no others, and that the sound file names networks only where Jarvis joins `speech`. It reads the files line by line and isn't a YAML parser: it's strict about layout, so a reordered or quoted setting fails it even where Docker would read it the same, and a file disguised on purpose could still get past it.
