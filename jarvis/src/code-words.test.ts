import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { codeWordIn, codeWordMs, earsStoppedWhy, fillersAfter, fillersBefore, findPhone, hubOffNote, londonStamp, neverMindWords, noteTitle, phoneWords, saveVoiceNote, stopMyselfReply, voiceNoteText } from "./code-words.js";

const stillOpen = new Set<() => unknown>();

afterEach(async () => {
  const closing = [...stillOpen];
  stillOpen.clear();
  for (const close of closing) await Promise.resolve().then(close).catch(() => {});
});

const token = "h".repeat(40);
const signal = new AbortController().signal;

async function standInHub(answer: (request: IncomingMessage, body: string) => { status: number; body: unknown }) {
  const asked: { method?: string; url?: string; authorization?: string; type?: string; body: string }[] = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (piece) => (body += String(piece)));
    request.on("end", () => {
      asked.push({ method: request.method, url: request.url, authorization: request.headers.authorization, type: request.headers["content-type"], body });
      const reply = answer(request, body);
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, asked };
}

test("note this takes what follows, as said, after any greeting, and its own words in any case", () => {
  assert.deepEqual(codeWordIn("Note this: buy more coffee."), { kind: "note", text: "buy more coffee." });
  assert.deepEqual(codeWordIn("Hey Jarvis, note this, the boiler man comes Tuesday."), { kind: "note", text: "the boiler man comes Tuesday." });
  assert.deepEqual(codeWordIn("jarvis note this down - ring the garage back"), { kind: "note", text: "ring the garage back" });
  assert.deepEqual(codeWordIn("NOTE THIS. Check the backup."), { kind: "note", text: "Check the backup." });
  assert.deepEqual(codeWordIn("Note this."), { kind: "note", text: "" });
  assert.deepEqual(codeWordIn("Note this \u2014 two things"), { kind: "note", text: "two things" });
  assert.deepEqual(codeWordIn("Note this: the bins go out Thursday.  "), { kind: "note", text: "the bins go out Thursday." });
  assert.deepEqual(codeWordIn("Note this\u2026 buy milk"), { kind: "note", text: "buy milk" });
  assert.deepEqual(codeWordIn("...vis. Note this: buy milk."), { kind: "note", text: "buy milk." }, "a clipped end of Hey Jarvis at the start is passed over");
});

test("find my phone and never mind count only on their own, with a greeting, please or thanks around them", () => {
  for (const said of ["Find my phone.", "find my phone", "Hey Jarvis, find my phone please.", "OK Jarvis, find my phone, thanks!", "Find my phone, Jarvis."]) assert.deepEqual(codeWordIn(said), { kind: "phone" }, said);
  for (const said of ["Thanks Jarvis, that's all.", "That's all, OK.", "Never mind.", "Nevermind", "That's all, thanks.", "That\u2019s all.", "That is all, thank you Jarvis.", "Jarvis, never mind.", "Oh, never mind.", "No, never mind.", "Actually, never mind.", "Never mind then.", "That's all, cheers.", "That's all for now.", "Thanks, that's all."]) assert.deepEqual(codeWordIn(said), { kind: "never mind" }, said);
  for (const said of ["Please find my phone.", "Jarvis, please find my phone.", "...vis. Find my phone."]) assert.deepEqual(codeWordIn(said), { kind: "phone" }, said);
  for (const said of ["That's all?", "Never mind?", "Hey Jarvis, that's all?"]) assert.equal(codeWordIn(said), null, `${said} is a question`);
  assert.deepEqual([phoneWords, neverMindWords], [["find my phone"], ["never mind", "nevermind", "that's all", "that is all"]]);
});

test("anything more is a question like any other", () => {
  for (const said of ["Can you find my phone?", "Find my phone number.", "Never mind the weather, what's on tonight?", "That's all the downloads?", "What's a good note this time of year?", "Please note this.", "I said note this.", "", "Jarvis.", "Find my phone 2."]) assert.equal(codeWordIn(said), null, said);
});

test("anything with stop listening in it that ears didn't take as its code word is caught, so Claude never answers it and nothing listens again", () => {
  for (const said of ["Stop listening for a minute.", "You can stop listening.", "Can you stop listening?", "Hey Jarvis, okay, stop listening, I'm going out.", "Could you just stop listening now?"]) assert.deepEqual(codeWordIn(said), { kind: "stop listening" }, said);
  for (const said of ["Should I stop listening to podcasts at night?", "Why won't my dog stop listening to me?", "Don't stop listening.", "I want to stop listening to that band."]) assert.equal(codeWordIn(said), null, `${said} is a question for Claude`);
  assert.deepEqual(stopMyselfReply, { say: "Say just stop listening, and ears will stop.", note: "ears only mutes itself when stop listening is all you say, or mute it on the server with bash host/ears.sh mute" });
  assert.equal(codeWordIn("Stop listing the downloads."), null);
});

test("a voice note says when it was said in London time, that Whisper wrote it, and what was said on one line", () => {
  const at = new Date("2026-07-01T23:30:00Z");
  assert.equal(londonStamp(at), "2026-07-02 00:30");
  assert.equal(londonStamp(new Date("2026-11-22T21:05:00Z")), "2026-11-22 21:05");
  assert.equal(voiceNoteText("buy more\ncoffee  ", at), "# Voice note, 2026-07-02 00:30\n\nSaid to Jarvis, and turned into text by Whisper, so a word may be wrong.\n\n> buy more coffee\n");
});

test("a note goes to the hub's brain inbox with the token, and the reply names the file but never the words", async () => {
  const hub = await standInHub(() => ({ status: 201, body: { saved: "2026-11-22-voice-note.md", waiting: 3 } }));
  const reply = await saveVoiceNote("buy more coffee", token, signal, new Date("2026-11-22T21:05:00Z"), hub.url);
  assert.deepEqual(reply, { say: "Noted.", note: "saved in the brain's inbox as 2026-11-22-voice-note.md" });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.authorization, one.type]), [["POST", "/memory/inbox", `Bearer ${token}`, "application/json"]]);
  assert.deepEqual(JSON.parse(hub.asked[0].body), { title: noteTitle, text: voiceNoteText("buy more coffee", new Date("2026-11-22T21:05:00Z")) });
  assert.equal(noteTitle, "voice note");
});

test("a note that can't be saved says so with why, and an empty one or one with no hub asks nothing", async () => {
  const off = await standInHub(() => ({ status: 404, body: { error: "Note uploads are switched off" } }));
  assert.deepEqual(await saveVoiceNote("x", token, signal, new Date(), off.url), { say: "I couldn't save that note.", note: "note uploads are off in the hub, so set MEMORY_UPLOAD=on in api/.env and restart the hub" });
  const refused = await standInHub(() => ({ status: 400, body: { error: "Notes must be\nplain text" } }));
  assert.deepEqual(await saveVoiceNote("x", token, signal, new Date(), refused.url), { say: "I couldn't save that note.", note: "the hub said: Notes must be plain text" });
  const odd = await standInHub(() => ({ status: 201, body: { saved: 7 } }));
  assert.deepEqual((await saveVoiceNote("x", token, signal, new Date(), odd.url)).say, "I couldn't save that note.");
  const asked = await standInHub(() => ({ status: 201, body: { saved: "x.md" } }));
  assert.deepEqual(await saveVoiceNote("  ", token, signal, new Date(), asked.url), { say: "Say note this, then what to note." });
  assert.deepEqual(await saveVoiceNote("x", null, signal, new Date(), asked.url), { say: "I couldn't save that note.", note: hubOffNote });
  assert.equal(asked.asked.length, 0);
  assert.equal(hubOffNote, "notes and finding your phone go through the hub, so set JARVIS_HUB_TOOLS=on in jarvis/.env and start Jarvis again with bash host/jarvis.sh");
  const gone = await saveVoiceNote("x", token, signal, new Date(), "http://127.0.0.1:1");
  assert.equal(gone.say, "I couldn't save that note.");
  assert.match(gone.note ?? "", /^couldn't reach the hub: /);
});

test("finding the phone asks the hub, and says what came of it", async () => {
  const hub = await standInHub(() => ({ status: 200, body: { sent: true } }));
  assert.deepEqual(await findPhone(token, signal, hub.url), { say: "I've sent your phone a notification." });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.authorization]), [["POST", "/phone/find", `Bearer ${token}`]]);
  const off = await standInHub(() => ({ status: 404, body: { error: "Finding the phone is switched off" } }));
  assert.deepEqual(await findPhone(token, signal, off.url), { say: "I couldn't reach your phone.", note: "finding your phone is off in the hub, so set FIND_PHONE=on in api/.env and restart the hub" });
  const soon = await standInHub(() => ({ status: 429, body: { error: "It was sent less than 10 seconds ago" } }));
  assert.deepEqual(await findPhone(token, signal, soon.url), { say: "I sent your phone one a moment ago, so I didn't send another." });
  const old = await standInHub(() => ({ status: 404, body: { message: "Route POST:/phone/find not found", error: "Not Found", statusCode: 404 } }));
  assert.deepEqual(await findPhone(token, signal, old.url), { say: "I couldn't reach your phone.", note: "the hub said: Not Found" }, "a hub too old for the route isn't taken for one with it switched off");
  assert.deepEqual(await findPhone(null, signal, hub.url), { say: "I couldn't reach your phone.", note: hubOffNote });
  assert.equal(hub.asked.length, 1);
});

test("a hub that never answers is given up on after 12 seconds, or as soon as the chat closes", async () => {
  assert.equal(codeWordMs, 12_000);
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  const closing = new AbortController();
  const asking = findPhone(token, closing.signal, `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  setTimeout(() => closing.abort(new Error("the chat closed")), 30);
  const reply = await asking;
  assert.deepEqual(reply, { say: "I couldn't reach your phone.", note: "couldn't reach the hub: the chat closed" });
});

test("the reason ears gives when it mutes itself is known word for word, and the filler words are ears's own", () => {
  assert.equal(earsStoppedWhy, "you said stop listening, so ears muted itself. Unmute it on the server with bash host/ears.sh unmute");
  assert.deepEqual([fillersBefore, fillersAfter], ["please|oh|no|actually|thanks|thank you|okay|ok|jarvis", "please|now|jarvis|thanks|thank you|cheers|then|ok|okay|for now|for a bit|for a while"]);
});

test("a saved note's name is shown with only plain file name characters, and a hub that redirects or is too old for note uploads is said plainly", async () => {
  const odd = await standInHub(() => ({ status: 201, body: { saved: "2026-11-22-voice\nnote <x>.md" } }));
  assert.deepEqual((await saveVoiceNote("x", token, signal, new Date(), odd.url)).note, "saved in the brain's inbox as 2026-11-22-voicenotex.md");
  const old = await standInHub(() => ({ status: 404, body: { message: "Route POST:/memory/inbox not found", error: "Not Found", statusCode: 404 } }));
  assert.deepEqual(await saveVoiceNote("x", token, signal, new Date(), old.url), { say: "I couldn't save that note.", note: "the hub said: Not Found" });
  const elsewhere = await standInHub(() => ({ status: 201, body: { saved: "elsewhere.md" } }));
  const redirecting = createServer((_request, response) => {
    response.writeHead(307, { location: `${elsewhere.url}/memory/inbox` });
    response.end();
  });
  await new Promise<void>((resolve) => redirecting.listen(0, "127.0.0.1", resolve));
  stillOpen.add(() => new Promise((resolve) => redirecting.close(resolve)));
  const sent = await saveVoiceNote("x", token, signal, new Date(), `http://127.0.0.1:${(redirecting.address() as AddressInfo).port}`);
  assert.equal(sent.say, "I couldn't save that note.");
  assert.equal(elsewhere.asked.length, 0, "the token is never sent on to another address");
});
