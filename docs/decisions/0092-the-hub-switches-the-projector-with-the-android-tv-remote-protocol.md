# 0092. The hub switches the projector with the Android TV Remote protocol

- Date: 2026-11-28
- Status: accepted

## Context
The wall now has a Google TV projector (probably an Aurzen EAZZE D1G), and Phil wants Jarvis and the hub app to switch it on and off. A research report compared the Android TV Remote protocol v2 (what Google's TV remote app uses, no developer mode), adb (full control of the device), Google Cast and HDMI-CEC.

## Options considered
Chosen by Phil, 28 Nov:
- An Android TV Remote protocol library in the API, behind a new switch that's off by default. No adb.
- The pairing certificate kept in a git-ignored folder, since it's effectively a remote control.
- What switches it: Jarvis's code words ("projector on", "projector off", matched in his code like the others) and buttons in the hub app. Not bedtime turning it off, and not the morning page turning it on.

Claude's picks, not discussed:
- **The library: `@kud/androidtv-remote` 0.1.2, not `louis49/androidtv-remote`.** The research report named louis49's, but its last release was January 2022 and it depends on `node-forge` 0.10 (many high advisories), `crypto-js` (discontinued) and `systeminformation`. kud's is a TypeScript rewrite of it, first released in June 2026 and last in July (MIT, two dependencies, 46 KB). It's young: three versions, one maintainer. Its pinned `node-forge` 1.4.0 and `protobufjs` 7.6.4 have advisories, so the API's `overrides` raise them to 1.4.4 and 7.6.6, after which `npm audit` finds nothing. It's pinned exactly. Not chosen: the Python `androidtvremote2` (Home Assistant's, well maintained), which would mean a new container; and writing the protocol from scratch, with no projector here to test it against.
- **The library runs in a worker thread, one for each press or pairing,** stopped as soon as that's over, with a 64 MB heap limit. Reading the library, a malformed message from the network would throw inside its socket handler, which in the API's own thread would crash the whole API; in the worker it stops only the worker. It adds about 17 MB while a press is under way. (The heap limit doesn't cap the library's Buffer memory; a worker that only lives for a press is what keeps that small.)
- **A connection per press, not a link held open.** The fresh review found that once connected, the library reconnects on its own without saying so, and its reading of messages only works for one message under 128 bytes at a time, after which a connection can stay stuck. A held-open link could then look connected when it wasn't, and say a key was sent when nothing went. So for each press the hub connects, waits up to 6 seconds for the projector to say it's ready, listens up to 1.5 seconds for whether it's on, sends the key, and listens up to 2.5 seconds for it to switch, then lets go. A link that stops before the key goes means nothing was sent. "Sent" means the key was handed over on a connection the projector had just said it was ready on, and the hub reports what it said before and after; when it doesn't say it switched, the press is reported as possibly not received, since a connection the library silently re-made in that moment could lose the key. Not chosen: a fixed copy of the library in the repo, which would be code of our own to keep, and a new decision; the Python `androidtvremote2` in its own container.
- **On and off are the wake and sleep keys by default** (`PROJECTOR_POWER=wake-sleep`), since each only goes one way. `toggle` sends the power key instead, only when the projector has said it's the other way. Both are built because which one the projector honours isn't known (Phil's standing approach: where it isn't known which works, build both behind a setting); the first-week checks try them.
- `PROJECTOR_HOST` must be a private IPv4 address, so a typo can't send the hub's connections off the LAN.
- The hub app's card is on the Home tab, with On, Off, Pair and Forget (tapped twice). Pairing gives up after 2 minutes without a code, and a code gets 15 seconds for an answer, after which the pairing ends so Pair works again. A pairing is only saved once the projector has accepted a connection with it.
- Jarvis's words are only matched with `JARVIS_PROJECTOR=on`, so with it off his words go to Claude as before, and they're refused in guest mode like his other hub code words.
- The logs never hold the code, the certificate, its key or the projector's address.

## Decision
With `PROJECTOR=on` and `JARVIS_PROJECTOR=on`, the projector is paired once from the hub app, then switched on and off from the app or by saying "projector on" or "projector off", through a young, single-maintainer Android TV Remote library running in a short-lived worker thread for each press.

## Confidence and the case against
Moderate. It worked end to end against a stand-in TV here (pairing with a code, the wake and sleep keys, connecting again after a restart), but not against the real projector, and the library is young. The case against: a new connection from the API to a device on the LAN, with a certificate that controls it; the library doesn't check the projector's own certificate on the remote connection, so something pretending to be the projector on the LAN could hear the key presses (it can't use the pairing); the library's message reading is fragile (above), so a projector that sends its messages in a way the library can't read would just never count as ready, which shows as "couldn't reach it" (not checked against the real one); and whether the projector wakes from standby over the network at all is the first-week check that decides if this is worth keeping.

## Consequences
The hub can press the projector's power keys. Sending other keys, opening apps or showing which app is open (the library can) would each be a new decision. If the library goes unmaintained, the overrides need watching, and the Python library in its own container is the fallback.
