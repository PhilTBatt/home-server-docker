# 0089. Caddy's certificate is copied to a device privately

- Date: 2026-11-28
- Status: accepted

## Context
Since record 0077 a phone got Caddy's root certificate by opening `http://hub.home/caddy-root.crt`, and record 0083 kept that one address on plain http while everything else moved to https. Over plain http, anyone else on the Wi-Fi could swap the file for their own certificate as it downloads, and a phone that installed theirs would trust anything they signed, for any site. Patch 23 added a fingerprint check afterwards; this removes the download itself.

## Options considered
Chosen by Phil, 28 Nov: stop serving the certificate on plain http, and copy it to new devices privately instead. Plain `http://hub.home` then sends everything to `https://hub.home`. The projector's kiosk skips certificate checks for the wall's page, so it doesn't need it.

Claude's picks, not discussed:
- The copy on the server lives at `caddy/root.crt`, git-ignored. The `caddy` folder itself isn't mounted into Caddy (only its `Caddyfile`, `data` and `config`), so Caddy can't serve it. The old copy in `hub/` is deleted in the steps, since the https site serves everything in `hub/`.
- The https site also answers `/caddy-root.crt` with a 404, and its file server hides any file of that name (Caddy's `hide`, which matches the file, not the request's path, so `//caddy-root.crt` and the like can't reach it), so a copy left in `hub/` by mistake still isn't served. Caddy's docs say `hide` isn't a security boundary; here it's only a backstop, since the copy belongs in `caddy/`.
- From the server to the laptop with `scp` (over SSH, which checks it's really the server), then to an Android phone by USB cable. The fingerprint check stays, as a final check that the right file was installed.
- `host/caddyfile.test.sh` checks the plain http site only redirects and serves no file, and that the https site refuses the certificate's address.

## Decision
`http://hub.home` only redirects to https. Caddy's root certificate reaches a new device by `scp` and a cable, never from the hub.

## Confidence and the case against
Confident it closes the swap. The case against: a new phone, or a laptop that wants the hub page, now needs a cable and a few steps instead of opening one address, and a device that can't take a file by cable (some TVs) has no way to trust the certificate at all, only to click past the warning.

## Consequences
Adding a device that trusts the hub takes the laptop and a cable. Serving the certificate from the hub again would be its own decision.
