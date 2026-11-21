# 0041. A microphone check records and plays back in two containers joined by a pipe

- Date: 2026-11-21
- Status: accepted

## Context
I checked the laptop's microphone by hand: a throwaway container with all of `/dev/snd`, `arecord` for a few seconds, then `aplay`. It was clear close up and too quiet from across the room. That check tells me how it sounds, but not whether ears can tell my voice from the room, which is what the wake word relies on to know I've finished (record 0039). I wanted a check I can run again from anywhere, for this microphone or any I buy later, that plays the recording back and prints the numbers ears works with. Three rules shape it: Jarvis never gets a microphone, ears never gets speakers (record 0035), and sound is never written to disk.

## Options considered
How to record and play back:
- Record in a throwaway container from ears's image with only the microphone's card's mixer and microphone, and play in a throwaway container from Jarvis's image with only the speakers' card's mixer and speakers, with the sound passed from one to the other through a pipe on the server: chosen. Neither container ever has both a microphone and speakers, and nothing is written to a file. Both images already have `alsa-utils`, so nothing new is added. The recorder only sends the sound once it has the whole 10 seconds, and the script only starts the player once that arrives, so the speakers aren't held open while I talk.
- One container with both the microphone and the speakers: not chosen. It breaks both device rules.
- A temporary file between two steps: not chosen. The sound would be on disk.
- Asking the running ears for a recording through its API: not chosen. Ears's API never hands out sound, and adding a way would let anything with its token take a recording's sound.
- Playing while recording: not chosen. The speakers would play me back into the microphone.

How Docker handles the sound:
- `--log-driver none` on both containers: chosen. Docker writes whatever a container prints to its log file on disk, even when it's shown on screen, and the recorder prints the sound for the pipe. `--network none` on both, since neither needs one. `--init`, so Ctrl+C reaches them. `--cap-drop ALL` and `no-new-privileges`, since neither needs any extra rights.

Who can run it:
- Only from a terminal someone is typing in: chosen. It's a command I run, so it has no on/off setting, but it records the room, so it refuses when there's no terminal, as when a script or an AI tool runs it. That's a speed bump, not a wall: anything that can run commands as me can fake a terminal, or record with Docker directly.
- Through ears's mute: not chosen. While ears is unmuted it may have the microphone open, and only one program can open it at a time, so the check stops and asks me to mute ears first. It never mutes ears itself.

What it measures:
- The room's level, from the first 2 seconds, which it asks me to stay quiet for, and what counts as speech, worked out the way ears does for the wake word (the level a fifth of the way up the frames, speech three times that and never below 300), how long I was above that, my typical and loudest level, the longest pause while I talked, and how many samples clipped: chosen. The first 0.3 seconds aren't measured, in case the microphone clicks as it opens. Speech typically under twice the line counts as quiet; that factor is a guess to adjust once I've used it.

Too quiet from across the room:
- Ears gains `EARS_MIC_BOOST` and `EARS_MIC_BOOST_CONTROL` (default `Internal Mic Boost`), set at start like `EARS_MIC_LEVEL`, and left alone unless set: chosen. The boost is the next knob after `EARS_MIC_LEVEL=100`, and like the level it goes back to how the driver starts it after a reboot, so it has to be set every time ears starts to stick. The check uses the same four settings, so it hears what Whisper and the wake word would.
- Setting the boost by hand: not chosen. It wouldn't survive a reboot.

## Decision
`bash host/ears.sh mic-test [seconds to wait]` records 10 seconds with ears's image and settings in a container that has only the microphone, prints the levels on ears's scale and what to change next, and plays the recording back in a container from Jarvis's image that has only the speakers, the sound passing through a pipe and never a file. Ears can also set the microphone's boost.

## Confidence and the case against
Medium. The script, the two containers' devices and flags, and the pipe were tested with a pretend Docker and in a rehearsal with real Docker and stand-in devices; the levels were tested with made-up sound and real speech. It hasn't recorded a real microphone yet. The case against: I could already do this by hand, and the numbers only matter for the wake word. It's more code to keep for a check I may only run a handful of times, and the boost adds two settings.

## Consequences
- `docker image ls` shows ears's image twice, as `home-hub-ears` and as the name Compose gives it. They share their layers.
- The check changes the card's microphone level and boost, as ears would at start, and sets the speakers' level, as Jarvis would.
- While a check runs, ears can't open the microphone, and Jarvis can't speak while it plays back.
- A microphone that's too quiet even at its highest boost is the point to look at buying one.
