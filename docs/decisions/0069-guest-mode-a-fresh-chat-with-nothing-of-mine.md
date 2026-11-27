# 0069. Guest mode: a fresh chat with nothing of mine in it

- Date: 2026-11-27
- Status: accepted

## Context
When someone else talks to Jarvis, he has everything of mine: the brain, the session notes, the hub, my saved chat. On 23 Nov I liked the idea of him chatting to visitors and explaining how he was built, without touching personal notes or taking actions.

## Options considered
Chosen 27 Nov:
- Switched on by voice ("guest mode") or typed `/guest`: chosen. I want voice because eventually he'll know my voice.
- Switched off only by typing `/guest off`, or from the phone page: Claude's suggestion, which I took. Turning it off by voice would let any guest say "guest mode off".
- Each switch starts a fresh chat, and my saved chat is left as it was: chosen.
- A guest gets his voice, the persona, the intro and the clock: chosen. Not the brain, session notes, the hub's tools or actions, the hub's code words, brain questions or saved chats: chosen, "for now".
- Look-ups for guests: on. "They might wanna try it out", and I'll interrupt him if they do it badly.
- Guest answers in the answer log, marked as guest: chosen.
- A guest mode button on the phone page: chosen.

Claude's picks, not discussed:
- The setting is `JARVIS_GUEST`, `off` or `on`. With `JARVIS_MODES` on as well, guest is the hub's mode (record 0068), so the phone page switches him; with it off, guest mode lives in Jarvis alone.
- The guest chat is made in Jarvis's own code, not by telling Claude to behave: on the Agent SDK it gets no tools at all and an empty working folder instead of the brain, and on the plain API it gets no tools but the look-up. The engine check proves both get no tools and can't read the brain.
- Guests get their own instructions, `guestChatSystem`, saying he's talking with a guest, has nothing of mine, and shares nothing about me beyond the intro.
- The spoken phrases: "guest mode", "turn on guest mode", "switch to guest mode" and a few more, matched in his code like the code words. "Guest mode off" said aloud gets "Only Phil can turn guest mode off", and any other mode word said while in it gets "Modes can't be changed in guest mode".
- The hub's code words and brain questions get "That isn't available in guest mode." without reaching the hub.
- Train changes aren't said or shown in guest mode; a line says one came in.
- `new` in guest mode starts another guest chat.
- Guest look-ups are marked `guest` in the look-up log and the answer log, and guest answers have `guest: true` in the answer log, so `npm run compare` keeps them in their own group.
- Switching into guest mode clears the last look-up, so a guest's look-up never carries mine to the web.
- Guest mode doesn't survive Jarvis restarting, unless the hub still says guest: then he starts in it.
- With `JARVIS_MODES` on and `JARVIS_GUEST` off, the hub can still go into guest mode (from the phone page, say), and there's no guest chat to switch to. Then he's held: he won't answer, look things up, use the hub's code words or start brain questions until the hub is out of guest mode, which typing `/mode normal` or the phone page does. Claude's choice, so the phone page saying guest never leaves my chat open to a visitor.

## Decision
With `JARVIS_GUEST=on`, `/guest` or "guest mode" gives Jarvis a fresh chat that has nothing of mine in it, and only `/guest off` or the phone page takes him out of it.

## Confidence and the case against
Medium-high (Claude's estimate). The limits are in his code, not his instructions, so a guest can't talk him into the brain or the hub. The case against: anyone at the keyboard can type `/guest off`, and the persona and intro are still about me. A guest can still see whatever's already on the screen above the guest chat. Voice ID (record 0072) is what would let my voice end it.

## Consequences
More modes can come with their own rules. A guest's look-ups still run on my Claude plan, and their questions land in my look-up log in their words.
