# 0077. The hub page as an app, over https with Caddy's own certificate

- Date: 2026-11-27
- Status: accepted

## Context
The hub page is how I use the server from the phone, and I want it to feel like an app: its own icon, full screen, no browser bar. Talking to Jarvis from it (record 0078) also needs the microphone, which browsers only give a secure page. Caddy already serves `https://hub.home` with its own certificate authority, but the phone doesn't trust it.

## Options considered
Chosen 27 Nov (Phil): install Caddy's root certificate on the phone and use `https://hub.home`. Not Tailscale's https certificates, which come from Let's Encrypt and so put the machine's tailnet name in the public Certificate Transparency logs ([Tailscale's HTTPS page](https://tailscale.com/kb/1153/enabling-https)), and would only work over Tailscale's own names.

Claude's picks, not discussed:
- A web app manifest and icons, and no service worker. Chrome has let a page be installed from its menu without a service worker since version 108 on Android ([Chrome's post on the install criteria](https://developer.chrome.com/blog/update-install-criteria)); only its own install prompt still wants one. A service worker that caches the page would also keep showing an old page after an update until it noticed, which is worse for a page that changes often than having no offline page.
- The certificate is copied by hand into `hub/caddy-root.crt` (git-ignored) and downloaded from the hub page itself, rather than the API reading Caddy's data folder, which would mean mounting it into a container that doesn't need it.
- Icons drawn from design E's status ring, as PNGs in `hub/icons/`, one of them maskable so Android can crop it to its own shape.

## Decision
The hub page gets a manifest and icons so Chrome can install it, and is used over `https://hub.home`, with Caddy's root certificate installed on the phone by hand.

## Confidence and the case against
Confident it installs and works in Chrome on Android. Less sure about other browsers: Samsung Internet and Firefox have their own rules, and an iPhone would need the certificate trusted in a second place in its settings. The case against is the certificate itself: a phone that trusts my own certificate authority trusts anything signed with its key, for any site, so the server's safety becomes part of the phone's. Name constraints on the authority would limit it to `.home`, but I didn't find a setting for them in Caddy's own authority (not checked in depth), so that would probably mean running a certificate authority of my own.

## Consequences
The hub opens like an app and can use the microphone. Caddy's key matters more: it's in `caddy/data` and the backups, and losing either means removing the certificate from the phone and starting a new authority. A new phone needs the certificate installed again. The page always comes from the server, so it can't open with no connection.
