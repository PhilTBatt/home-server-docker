# 0096. Good morning, and the room's microphone open for the morning

- Date: 2026-11-28
- Status: accepted

## Context
The kept "Good morning" page, from the projector designs of 28 Nov: the clock up big in the morning, the wall brightening like a sunrise from my wake-up time, then Jarvis saying morning a bit louder each time until I'm up. I want to stop it by tapping I'm up on the phone or by saying it. Saying it needs the room's microphone, and record 0079 keeps that muted until I unmute it by hand. The design builds on reminders, which may be switched off.

## Options considered
Chosen by Phil, 28 Nov:
- **I'm up on the phone or said out loud.**
- **The room's microphone unmutes itself at wake-up time, and afterwards goes back to how it was:** muted again, unless I'd unmuted it before the morning started. This changes record 0079's rule (muted until I unmute it by hand), but only for the morning.
- **Its own switch, off by default.**
- **The projector isn't switched on by it.** The page shows if the screen's on.

Claude's picks, not discussed:
- **Its own wake-up time and days, not a reminder.** `MORNING_AT` (04:00 to 11:00) and `MORNING_DAYS` (Monday to Friday unless set) in `api/.env`, so it works whether reminders are on or off.
- **The times are the design's:**
  - the wall starts to brighten 15 minutes before;
  - a soft sound 5 minutes before;
  - Jarvis at wake-up time, then again every 2 minutes, for an hour;
  - five more minutes holds him off for five minutes from when it's said, as often as asked, within that hour.
- **Away and guest modes skip it.** Bedtime, gaming and coding don't: bedtime is the mode it will usually find.
- **His level:**
  - 30 below `JARVIS_VOLUME` the first time, then 10 louder each time, up to 100;
  - back to his usual level after each line, and as soon as I answer.
- **What he says:**
  - the first time: good morning, the time, my first train and how to stop it;
  - after that: only the time.
- **I'm up also ends bedtime mode,** as it always has.
- **Any voice can say I'm up or five more minutes.** They only stop or put off the morning.
- **The microphone opens when Jarvis first speaks, the wake-up time itself,** not when the wall starts brightening, so it's open for as short a time as possible. Before then, I'm up is on the phone, and the wall says so.
- **Getting up early stops the day's morning.** From two hours before the wake-up time, I'm up (on the phone, or said out loud if I've unmuted the microphone) ends that day's morning, so the wall never brightens and the microphone never opens in an empty room. Added after the review: without it, being up and out early meant an hour of open microphone and Jarvis speaking to nobody. Away mode still skips a morning altogether.
- **A script on the server opens and closes it** (`host/morning-mic.sh`, run every minute from 03:00 to 12:59 by `home-hub-morning-mic@<user>.timer`, as my user). No container can write ears's mute switch (record 0035), so it can't be the API or Jarvis.
  - When the hub's clock says it's wake-up time (Jarvis saying morning, or put off), and ears says it's muted or failed, the script writes the switch with an unmute of its own and keeps a note of exactly what it wrote. It goes by the hub's clock alone: it can't tell whether Jarvis is running with `JARVIS_MORNING=on`, so the timer is only for when he is. Otherwise nothing can hear I'm up while it's open.
  - It does nothing if ears is already listening (I'd unmuted it), or if ears isn't running.
  - Once the morning's over (I'm up, the hour's gone, the morning was skipped or switched off), it mutes the switch again, but only if the switch still holds what it wrote. If I changed it by hand during the morning, it's mine: it's left alone, and the morning doesn't open it again that day.
  - When the hub can't be asked, it mutes the switch for now, to be on the safe side. It opens it again when the hub answers and it's still wake-up time, but only if ears was listening when it muted. If ears had muted itself ("stop listening") or wasn't running, the morning leaves it muted for the rest of the day. Added after the review: before, a short hub outage could reopen a microphone I'd muted.
  - If ears restarts during a morning, it starts muted and the script leaves it, so I'm up by voice stops working for that morning. The phone still works.
- **The hub keeps today's morning** (when I got up, any snooze) in `api/data/morning.json`, mode 600, so a restart doesn't start it again.
- **A new event kind, `morning.up`, audience home,** for "What happened today": when I got up, and whether from the phone or by voice. It's never shown to the room.
- **The wall's board as drawn,** without the weather card until the forecast is built (item 8). The train card shows the first train and, with the trains page, its change.

## Decision
With `MORNING=on` and `MORNING_AT` set, the hub works out the morning from the time; the wall brightens and shows the board; Jarvis (with `JARVIS_MORNING=on`) plays the soft sound and says morning, louder each time; I'm up on the phone or said out loud ends it. With the server's timer installed and enabled, the room's microphone opens at wake-up time and goes back to how it was when the morning ends.

## Confidence and the case against
Fairly confident in the hub, the wall and the phone, which are like what's there already. The microphone is the part to think about.

The case against:
- **On a wake-up day the microphone is open for up to an hour without my unmuting it by hand.** Anything that can make the hub say it's morning can open it, at most until that hour ends, once a day: the hub's token (holding off with five more minutes) or `MORNING_AT` in `api/.env`. The script reads nothing from the hub but the phase and the day.
- **The script uses the docker group to ask ears whether it's muted,** like `host/ears.sh` and Jarvis's own unit. That's root-equivalent. It never mounts or starts anything.
- **It can be slow by a minute.** The timer runs on the minute, and Jarvis checks every 10 seconds, so his first line usually comes after the microphone opens. If not, the one 2 minutes later does. Muting after I'm up can take up to a minute.
- **The wall can be up to about 50 seconds behind,** since its picture is kept 20 seconds and read every 30.
- **Not chosen: unmuting when the wall starts brightening,** so I'm up works earlier by voice. It would open the microphone 15 minutes longer every wake-up day.
- **Switching it off in the wrong order leaves the microphone open.** Disabling the timer during a morning leaves it as the script last set it, until ears restarts or `bash host/ears.sh mute`. So `MORNING=off` goes first, then the timer.

## Consequences
- Record 0079 still holds outside the morning: nothing else ever unmutes the room's microphone.
- Anything else that would open it needs its own decision.
- The timer has to be installed and enabled for the microphone part. Without it, I'm up works from the phone, and by voice only if I've unmuted it myself.
