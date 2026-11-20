# 0035. "Ears" owns the microphone, starts muted, and is muted from the server

- Date: 2026-11-20
- Status: accepted

## Context
Jarvis is going to listen. The rule since the voice plans is that Jarvis never gets a microphone: a small separate service of my own code, "ears", owns it and holds the mute. Only my push-to-talk key and, later, a wake word may start a recording. Every recording has a hard time limit. After any restart or failure ears comes back muted. It reports one state, and it never keeps or logs the sound. There's no microphone to give it yet: one is still to be bought. So this step builds ears and proves its rules with a pretend microphone, and nothing uses it yet. Five things needed deciding: what it's built from, what it records with for now, how it's muted, who can reach it, and what it does with the sound.

## Options considered
What it's built from:
- A small Node and TypeScript package, `ears/`, beside `jarvis/` and `mcp/`, built into its own image like the API, with only Node's own modules at run time: chosen. Its tests run on GitHub with the others.
- Part of Jarvis: not chosen. The point is that the code holding the microphone isn't the code the AI drives.
- An off-the-shelf recorder service: not chosen. The rules are mine, and they're the reason it exists.

What it records with for now:
- A pretend microphone, `EARS_MICROPHONE=pretend`: a child process that sends a quiet tone at the pace of real sound, so stopping, muting and the time limit act on a real process, the way they will on `arecord`: chosen. Left out, ears records nothing.
- The laptop's own microphone: not chosen. I don't want to use it.
- Waiting for the microphone: not chosen. The rules can be built and proved now.

How it's muted:
- A file on the server, `ears/switch/mute`, written by `bash host/ears.sh mute` or `unmute` and mounted into ears read-only: chosen. No container can change it through its own mounts; something with root on the server, or with Docker's socket (which `beszel-agent` has), could. Ears reads it every 200 ms. A file that's missing, or says anything but `unmuted` and an id, counts as muted, and so does one that can't be read.
  - Each unmute writes a new id, and each id counts once. One that was already in the file when ears started never counts, so a restart comes back muted even when the file says unmuted. If the file can't be read when ears starts, whatever it first says once it can be read counts as already there.
  - A mute and an unmute between two reads aren't seen as a mute. So a new unmute while recording ends the recording, as a mute would, in case one came and went.
  - If a mute can't be written, as on a full disk, the script removes the file instead, which counts as muted. If it can't do that either, it says ears may still be unmuted and how to stop it.
- An API call: not chosen. Then whatever holds the token could unmute it.
- Watching the folder for changes instead of reading it: not chosen. Reading is simple, and a change it misses between two reads is covered above; that watching would work through a bind mount is Claude's understanding, not tested. 200 ms is quick enough for a mute.

Who can reach it:
- A token on its API, from `ears/.env`, at least 32 characters, on a network of its own, `ears`, internal and isolated like `speech`, with no published port: chosen. Nothing else is on `ears` yet; Jarvis joins it when he uses it.
- No token, since only Jarvis will be on the network: not chosen. A token costs little, and it means joining the network isn't enough.

What it does with the sound:
- Counts it and drops it as it arrives, for now: chosen. Nothing uses it yet. Keeping it in memory to hand to speech-to-text comes with the step that adds that.
- A limit on how much sound a recording can take, as well as its time: chosen. It's a quarter more than 30 seconds' worth, to allow for sound arriving in bursts, so a recorder sending sound much faster than real time is stopped too.

How a recording is ended:
- The recorder runs in a process group of its own, and ending a recording ends the whole group. The recorder is asked to end, then killed a second later if it hasn't, and whatever is left in its group is killed as soon as it ends. So a helper the recorder starts can't outlive it, unless the helper leaves the group (as `setsid` does), which nothing here stops; `arecord` starts no helpers. If the recorder ends but something it started keeps its output open, ears stops waiting for it after a second.
- How the recorder ended is noted the moment it ends, so one that ended by itself counts as failed even if a stop comes before its output closes.
- The recorder is given no settings but `PATH`, so it isn't handed the token. It runs as the same user as ears, though, so a recorder that went looking could read ears's settings, token included, from `/proc`, and up to 200 characters of what it prints when it fails go into ears's log and its API. `arecord` does neither, but it means the recorder has to be a program trusted with the token.
- Nothing new can start while a recording is still ending.

## Decision
`ears` is a new compose service in its own profile, built from `ears/`, running as the `node` user with no devices, no published port, `ears/switch` mounted read-only, and only the `ears` network. It reports `muted`, `idle`, `recording` or `failed`, starts muted, records only when asked through its API with its token while unmuted, and stops a recording when asked, when muted, at 30 seconds, or on too much sound, ending the recording process each time. It logs starts, stops (why and how long), mutes and unmutes, never the sound, and never the token unless a recorder prints it when it fails.

## Confidence and the case against
Medium (Claude's estimate). It was tested with its own tests and in Docker on this repo's compose file, with the real `host/ears.sh`. In fifteen tries, muting ended the recording process within 0.15 to 0.35 seconds, timed from outside the container; a mute and unmute back to back ended it each of three times; a restart came back muted; and from inside its container the internet and Kokoro couldn't be reached. It hasn't run on this server. The case against:
- Push-to-talk will travel from my key through Jarvis's code to ears, so this still trusts Jarvis's own code. What it stops is the AI starting a recording; the time limit, the mute and the log limit everything else.
- Muting takes up to 200 ms to notice, plus up to a second if the recorder has to be killed. Watching the folder would be quicker but less sure.
- The rule that the AI can't unmute holds for Jarvis and the containers. Claude Code on the server could write the switch or run the script; CLAUDE.md tells it not to, and nothing enforces that yet.
- The `failed` state behaves like muted, so one bad recording needs an unmute before the next. That's deliberate, but it's one more step.
- `working`, the state for while a recording is being turned into text, isn't there yet, because nothing does that yet.
- Node runs as the container's first process, with nothing to collect ended processes it didn't start itself. So a helper killed when its recorder ends stays listed as a zombie (ended, but never collected) until ears restarts. It uses no memory to speak of, and `arecord` starts no helpers. `init: true` in compose would collect them; it isn't added.
- A pretend microphone proves the rules, not the sound: a real one may have its own way of failing.

## Consequences
- Ears needs `ears/.env` and `ears/switch` before it starts, and says why if the token is missing or short. Compose refuses to start it without the folder.
- After a reboot or a restart, ears is muted until `bash host/ears.sh unmute`.
- `host/hub-update.sh` doesn't rebuild ears's image. Start it with `--build`.
- Ears's health check runs `node dist/ask.js state` inside its container, which reads the token from its own settings, so the token is never on a command line.
- A real microphone means passing ears one capture device, read and write, from a second compose file like Jarvis's sound file. That will be security-sensitive, and so is anything joining `ears`.
- Jarvis still has no microphone, and no way to reach ears yet.
