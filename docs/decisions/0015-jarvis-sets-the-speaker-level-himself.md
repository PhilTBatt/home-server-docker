# 0015. Jarvis sets the speaker level himself, and nothing on the host saves it

- Date: 2026-11-18
- Status: accepted

## Context
After a boot, the `Master` control on the laptop's sound card is muted at 0%, which is why the first test tone was silent. Unmuting it from a throwaway container worked, because the level lives in the kernel's sound driver, but nothing on the server saves it: `alsa-utils` isn't installed on the host, so after the next reboot it's muted again. Jarvis may also want to change the volume later.

## Options considered
- Jarvis sets `Master` himself before he plays anything, from `JARVIS_VOLUME` in `jarvis/.env`: chosen. The level is a known value every time, and he needs the mixer anyway to change the volume later.
- `alsa-utils` on the host, with `alsactl store` and its restore service: not chosen. A dry run showed 9 packages on a host with none of ALSA's libraries, and it brings back whatever the level was at the last shutdown.
- A boot-time unit that runs a throwaway container to set the level: not chosen. A hand-written host unit that needs Docker running and the image to hand at boot.
- `alsactl` in a container, with its state file kept on the host: not chosen. It still needs a host unit to run it at boot.
- Unmuting by hand after each reboot: not chosen. After a power cut Jarvis would be silent with no error.

## Decision
Before playing, Jarvis runs `amixer -q -c <card> sset Master <level>% unmute`, with the level from `JARVIS_VOLUME` (a whole number from 0 to 100, default 80), or `0% mute` at 0. For now the sound test does this; the chat will when it gets a voice.

## Confidence and the case against
Fairly confident (Claude's estimate). The case against: sound only works once Jarvis has set the level. Anything else that plays sound later, such as a chime from a separate listening service, is silent after a boot until it sets the level too. The host package would fix that once, for everything.

## Consequences
- The level goes back to `JARVIS_VOLUME` each time Jarvis sets it, so a level changed by hand lasts only until then.
- `Master` is this card's control name. Another card, such as a USB speaker, may need another name.
- `amixer` comes in the same Alpine package as `aplay`, and the mixer node is passed in anyway (record 0014), so this adds no package and no access.
- Nothing is installed on the host.
