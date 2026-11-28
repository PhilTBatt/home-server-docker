# 0079. Jarvis always on, in tmux from boot

- Date: 2026-11-27
- Status: accepted; the morning opens the room's microphone at wake-up time and puts it back after (0096)

## Context
Jarvis only runs while I've started him in a terminal, so he's gone when I close it, after a restart, and whenever I'm away. Talking to him from the phone (record 0078) needs him running all the time.

## Options considered
Chosen 27 Nov (Phil): Jarvis always on, in tmux from boot; the room's microphone muted until I unmute it.

Claude's picks, not discussed:
- A systemd unit that starts a `tmux` session, rather than a unit that runs him directly. He's an interactive chat that reads what I type, so he needs a terminal, and `tmux` gives him one that I can attach to and leave. The unit is a template (`home-hub-jarvis@<user>.service`) run as my user, with `NoNewPrivileges`, like the runner's and the digest's.
- His own `tmux` server, `tmux -L jarvis`, not the session manager's `tmux -L home-hub`: stopping him then can't touch the Claude Code sessions, and they can't touch him.
- A loop in the session that starts him again whenever he stops, after 5 seconds, or a minute if he ran for less than a minute, rather than systemd restarting him: a crash or `exit` then brings him back without systemd needing to know about the chat inside `tmux`.
- 50,000 lines of scrollback and the mouse on for his session only, because scrolling back in a terminal running him was hard, and inside `tmux` the terminal's own scrollback doesn't work without tmux's.
- Ears is started muted (it always starts muted) and never unmuted by the script.
- `hub-update.sh` refuses to reinstall his packages or rebuild `mcp/` while he runs, and says when he needs a restart to use what changed.

## Decision
`host/jarvis-always.sh`, installed as `home-hub-jarvis` and started at boot by its template unit, keeps Jarvis running in a `tmux` session of his own, starting him again whenever he stops.

## Confidence and the case against
Fairly confident it works, since it's built from pieces already in use. The case against is cost and memory. A chat that's open costs API credits only when he's asked something, so the cost is the memory. Kokoro, ears, Whisper and openWakeWord stay running, which is roughly 2 to 3 GB of the server's 8 GB, a guess from their limits rather than a measurement. Starting him only when the phone asks would save that, but would mean a slow first answer and a way for the hub to start containers, which no container has.

## Consequences
Jarvis is there from boot, for the phone and the room, and his chat can be watched at any time with `home-hub-jarvis attach`. The server has less memory free all the time. Updates to his code take effect when he's restarted, not when they're pulled.
