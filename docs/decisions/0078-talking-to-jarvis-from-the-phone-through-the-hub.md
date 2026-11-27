# 0078. Talking to Jarvis from the phone, through the hub

- Date: 2026-11-27
- Status: accepted

## Context
Jarvis only hears through the server's own microphone, so he's no use away from the room. The hub page is already on the phone, at home and over Tailscale, so it can be the way in: hold a button, talk, and get his answer back on the phone.

## Options considered
Chosen 27 Nov (Phil): a talk button on the hub page that you hold while you talk; the answer comes back on the phone as text and in his voice, played as soon as it arrives; in guest mode the phone is refused with a line; the page is reached over https with Caddy's own root certificate installed on the phone (record 0077).

Claude's picks, not discussed:
- The API is only a mailbox (`TALK`): the phone posts raw 16-bit mono sound at 16,000 samples a second, at most 30 seconds, and Jarvis asks for it. Not the API turning it into words or speech itself: that would put the API, which every device on the network and tailnet can reach, on the internal `ears` and `speech` networks, and make it depend on Whisper and Kokoro running. Jarvis is already on those networks when he runs with ears.
- Jarvis turns the sound into words with ears's Whisper, over Wyoming like ears does, so `JARVIS_PHONE` needs `JARVIS_EARS=push` or `wake` (which put him on the `ears` network). His voice is made with his own speech engine and sent back as a WAV. Not ears's own recording path, which is built around the server's microphone.
- Jarvis asks for work with a long poll (`GET /talk/next`, up to 20 seconds), so a recording reaches him within a second, and the hub knows he's running when he asked in the last 45 seconds. The phone is refused straight away when he isn't, rather than recording for nothing.
- Everything is kept in the API's memory only: a recording waits at most a minute for Jarvis, at most 3 wait at once, the sound is dropped as soon as he takes it, and everything about a recording is forgotten after 10 minutes, 20 kept at most. Logs hold ids and sizes, never words.
- The phone question goes into the same chat as the room, after anything he's in the middle of. A yes he needs is asked on the phone, not in the terminal, and no answer in a minute counts as no, as typed ones do. The room speaker stays quiet for a phone answer.
- What's said on the phone goes to Claude as it is, marked as coming from the phone, and none of his code words are matched on it: those answer out loud in the room, and the hub page already has buttons for the mode, finding the phone and notes. Not matching them is also the safer way round, since a code word acts without Claude or a yes.
- The page records with an AudioWorklet and turns the browser's rate into 16,000 itself, because not every browser will record straight into a 16,000 context. The microphone only works on a secure page, so on `http://hub.home` the button says to open the https address.

## Decision
The hub page records while the talk button is held and posts the sound to `POST /talk`; Jarvis takes it with `GET /talk/next`, turns it into words with ears's Whisper, answers in his usual chat, and posts what he heard, his answer and his voice back for the phone to show and play.

## Confidence and the case against
Fairly confident in the shape, less in the browser side: recording and playing sound on a phone browser has rules that differ between browsers and versions, and it was only tried in desktop Chrome with a pretend microphone. The case against the mailbox is latency: the sound goes phone to API to Jarvis to Whisper, and his voice back the same way, where the API calling Whisper and Kokoro itself would save a hop each way. On a home network that's milliseconds, against putting the most exposed container on the speech networks.

## Consequences
Jarvis can be asked anything from anywhere the hub page opens, with the same tools and the same yeses as at home. Anyone who has the hub's token can now talk to him, which was already true of everything else the token reaches. It needs Jarvis running, which record 0079 makes the normal state, and Whisper running for him. Phone questions can't be told apart from typed ones in his answer log yet.
