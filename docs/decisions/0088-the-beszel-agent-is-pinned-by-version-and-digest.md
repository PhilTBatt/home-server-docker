# 0088. The Beszel agent is pinned by version and digest

- Date: 2026-11-28
- Status: accepted

## Context
`beszel-agent` mounts `/var/run/docker.sock` (read-only, but that still gives Docker's whole API, which is root on the server) and uses `network_mode: host`. It ran `henrygd/beszel-agent:latest`, so any new image pushed under that tag, including a bad or hijacked one, would be pulled and run with that power at the next `docker compose pull` (or the `pull-images` chore). The speech images (Kokoro, Piper, Whisper, openWakeWord) are already pinned by version and digest.

## Options considered
Chosen by Phil, 28 Nov: pin the Beszel agent to a version and digest, the way Kokoro is pinned. The other `:latest` images stay as they are for now.

Claude's picks, not discussed:
- Version 0.21.2, which was `latest` on 28 Nov (Docker Hub's tag list showed `latest`, `0`, `0.21` and `0.21.2` on the same digest, last pushed 12 Nov), so the running agent is probably already this version.
- The digest is the multi-architecture one Docker Hub lists for the tag, `sha256:3432542...ec6e1a`, read twice from Docker Hub's API through a web fetch, since this workspace can't reach Docker Hub directly. The steps have Phil check it with `docker pull`, which prints the digest it got, before anything restarts.
- The Beszel hub (`henrygd/beszel`) stays on `:latest` with the others: Phil's decision covered the agent. Beszel's docs don't say the two must match; if a hub update ever needs a newer agent, the agent is updated by hand with a new record line in the steps.
- `host/ports.test.sh` checks every image that needs it is pinned by version and digest.

## Decision
`beszel-agent` runs `henrygd/beszel-agent:0.21.2@sha256:343254226ae57a5cc6f8c23c755b1464730aba2abc7043116a2e222711ec6e1a`.

## Confidence and the case against
Fairly confident: two reads of Docker Hub agreed, and Docker refuses to run an image whose digest doesn't match, so a wrong digest fails safely. The case against: the agent no longer gets fixes by itself, so a security fix in a later Beszel agent waits for Phil to move the pin, and a hub update could stop matching an old agent.

## Consequences
Updating the agent means looking up the new version's digest and changing one line. `pull-images` and Dependabot don't move it.
