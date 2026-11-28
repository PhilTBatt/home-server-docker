import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, test } from "node:test";
import { projectorCodeWords, projectorPower, clockReply, dateWords, timeLine, timeWords, withTimeLine, codeWordIn, codeWordMs, lastSentenceOf, spokenJourneys, earsStoppedWhy, fillersAfter, fillersBefore, findPhone, foundWords, hubOffNote, phoneFound, phoneFoundIn, londonStamp, neverMindWords, noteTitle, phoneWords, saveVoiceNote, serverCheck, serverWords, spokenChecksMost, spokenDoctor, spokenTrains, spokenTrainsMost, stopMyselfReply, trainTimes, trainWords, voiceNoteText, type DoctorReport } from "./code-words.js";

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
  assert.deepEqual([phoneWords, neverMindWords], [["find my phone", "help me find my phone", "where's my phone", "where is my phone", "ring my phone", "ping my phone"], ["never mind", "nevermind", "that's all", "that is all"]]);
});

test("find my phone counts when asked politely or in a few other ways, and a question that's only about phones doesn't", () => {
  for (const said of ["Can you please find my phone?", "Can you find my phone?", "Could you find my phone for me?", "Hey Jarvis, would you find my phone, please?", "Will you just find my phone?", "Can u find my phone", "Where's my phone?", "Jarvis, where is my phone?", "Ring my phone.", "Ping my phone please.", "Can you help me find my phone?", "Please, please find my phone"]) assert.deepEqual(codeWordIn(said), { kind: "phone" }, said);
  for (const said of ["Can you find my phone number?", "Where's my phone charger?", "Could you find my phone's settings?", "Is my phone on silent?", "Can you find my phone case online?", "Why does my phone ring at night?", "Where's my phone bill from?", "Can you please never mind?", "Could you never mind."]) assert.equal(codeWordIn(said), null, said);
});

test("note this can be asked politely, and make a note or take a note start one too", () => {
  assert.deepEqual(codeWordIn("Can you note this: buy milk."), { kind: "note", text: "buy milk." });
  assert.deepEqual(codeWordIn("Hey Jarvis, could you please note this down, ring the garage"), { kind: "note", text: "ring the garage" });
  assert.deepEqual(codeWordIn("Please note this."), { kind: "note", text: "" });
  assert.deepEqual(codeWordIn("Make a note: the bins go out Thursday."), { kind: "note", text: "the bins go out Thursday." });
  assert.deepEqual(codeWordIn("Jarvis, take a note of this - fix the shelf"), { kind: "note", text: "fix the shelf" });
  assert.deepEqual(codeWordIn("Can you make a note of that?"), { kind: "note", text: "" });
  assert.deepEqual(codeWordIn("Just note this. Two things."), { kind: "note", text: "Two things." });
  assert.deepEqual(codeWordIn("Can you make a note of that for me?"), { kind: "note", text: "" });
  assert.deepEqual(codeWordIn("Make a note of it."), { kind: "note", text: "" });
  assert.deepEqual(codeWordIn("Note this down for me: buy milk"), { kind: "note", text: "buy milk" });
  assert.deepEqual(codeWordIn("Take a note for me, the bins go out Thursday."), { kind: "note", text: "the bins go out Thursday." });
  assert.deepEqual(codeWordIn("Note this downstairs light is broken."), { kind: "note", text: "downstairs light is broken." });
  for (const said of ["I said note this.", "Can you make a notebook for me?", "How do I make a note on my phone?", "Did you take a note of that?", "Should I note this down?", "Could you make a note-taking app?", "Note this-time list."]) assert.equal(codeWordIn(said), null, said);
});

test("anything more is a question like any other", () => {
  for (const said of ["Find my phone number.", "Never mind the weather, what's on tonight?", "That's all the downloads?", "What's a good note this time of year?", "I said note this.", "", "Jarvis.", "Find my phone 2."]) assert.equal(codeWordIn(said), null, said);
});

test("a code word also counts as the last sentence of what was said, as Whisper split it", () => {
  assert.deepEqual(codeWordIn("I love this. Find my phone."), { kind: "phone" });
  assert.deepEqual(codeWordIn("I just did say that out loud. This is me speaking out loud. Can you please find my phone?"), { kind: "phone" });
  assert.deepEqual(codeWordIn("I've had an idea. Note this: buy milk."), { kind: "note", text: "buy milk." });
  assert.deepEqual(codeWordIn("Okay then. Make a note of that for me."), { kind: "note", text: "" });
  assert.deepEqual(codeWordIn("Morning! Train times please."), { kind: "trains" });
  assert.deepEqual(codeWordIn("I'm running late\u2026 Is my train on time?"), { kind: "trains" });
  assert.deepEqual(codeWordIn("What's the weather tomorrow? Never mind."), { kind: "never mind" });
  assert.deepEqual(codeWordIn("That's enough for now. Stop listening."), { kind: "stop listening" });
  assert.deepEqual(codeWordIn("Hey Jarvis. Sorry. Find my phone."), { kind: "phone" });
  assert.deepEqual(codeWordIn("Sorry, one sec. Find my phone."), { kind: "phone" });
  assert.deepEqual(codeWordIn("That's enough. Stop listening."), { kind: "stop listening" });
  assert.deepEqual(codeWordIn("Right... Train times."), { kind: "trains" });
});

test("the whole of what was said wins, so a note keeps every sentence after note this", () => {
  assert.deepEqual(codeWordIn("Note this. Buy milk. And eggs."), { kind: "note", text: "Buy milk. And eggs." });
  assert.deepEqual(codeWordIn("Can you note this: the bins go out on Thursday. Don't forget."), { kind: "note", text: "the bins go out on Thursday. Don't forget." });
});

test("only the last sentence is tried, so a code word earlier on, or one inside a longer last sentence, still goes to Claude", () => {
  for (const said of [
    "Find my phone. What's the weather?",
    "I had an idea. Note this. Buy milk.",
    "What happens if I say find my phone?",
    "Earlier you said. Find my phone number?",
    "Is that it? That's all?",
    "Trains. Why are they always late?",
    "I asked. Find my phone and check the trains.",
    "Okay. Where's my phone charger?",
    "Right. Should I stop listening to podcasts?",
    "Wait, find my phone.",
    "Okay so, train times.",
  ]) assert.equal(codeWordIn(said), null, said);
});

test("the last sentence is the text after the last full stop, question mark, exclamation mark or ellipsis followed by a space, ignoring pieces with no letters", () => {
  assert.equal(lastSentenceOf("Find my phone."), null);
  assert.equal(lastSentenceOf("  One. Two.  "), "Two.");
  assert.equal(lastSentenceOf("One? Two! Three\u2026 Four"), "Four");
  assert.equal(lastSentenceOf("One. Two. ..."), "Two.");
  assert.equal(lastSentenceOf("v1.2 is out.Two"), null);
  assert.equal(lastSentenceOf(""), null);
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
  assert.equal(hubOffNote, "notes, finding your phone, train times and the server check go through the hub, so set JARVIS_HUB_TOOLS=on in jarvis/.env and start Jarvis again with bash host/jarvis.sh");
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

test("train times count on their own, in a few ways of asking", () => {
  for (const said of ["Train times.", "Hey Jarvis, train times please.", "Trains?", "Next train.", "When's my train?", "When\u2019s the next train, Jarvis?", "Train time"]) assert.deepEqual(codeWordIn(said), { kind: "trains" }, said);
  for (const said of ["Train times to London tomorrow?", "Are the trains running?", "Trains and buses."]) assert.equal(codeWordIn(said), null, said);
  assert.deepEqual(trainWords, ["train times", "train time", "trains", "next train", "next trains", "when's my train", "when is my train", "when's the next train", "when is the next train", "what time's my train", "what time is my train", "what time's the next train", "what time is the next train", "is my train on time", "are my trains on time", "are the trains on time", "how are the trains", "how are the trains looking"]);
});

test("train times count when asked politely or with tell me, check or what's", () => {
  for (const said of ["Can you tell me the train times?", "Could you check the trains, please?", "What are the train times?", "What's the next train?", "What time's my train?", "Is my train on time?", "Are the trains on time, Jarvis?", "Hey Jarvis, how are the trains looking?", "Check my trains.", "Give me the next trains.", "Show me the train times please", "Can you get the train times for me?", "What's my next train?", "Please, the train times."]) assert.deepEqual(codeWordIn(said), { kind: "trains" }, said);
  for (const said of ["What are trains?", "What's a train?", "Can you tell me about trains?", "What's the train like to Leeds?", "Check the trains to York tomorrow.", "Is my train ticket valid?", "What time is it?", "Could you check the train times in Japan?"]) assert.equal(codeWordIn(said), null, said);
});

test("the board is said as the next three trains, each on time, expected later, delayed or cancelled, with reasons and the board's messages as a note", () => {
  const board = {
    from: "Alpha",
    to: "Beta",
    departures: [
      { due: "08:14", expected: "On time", platform: "16", cancelled: false, reason: null },
      { due: "08:44", expected: "08:52", platform: null, cancelled: false, reason: "a fault" },
      { due: "09:14", expected: "Cancelled", platform: "2", cancelled: true, reason: "a shortage of staff" },
      { due: "09:44", expected: "Delayed", platform: null, cancelled: false, reason: null },
    ],
    buses: 2,
    messages: ["Disruption between Alpha and Gamma."],
  };
  assert.deepEqual(spokenTrains(board), { say: "Trains from Alpha to Beta: the 08:14 is on time, platform 16; the 08:44 is expected at 08:52; the 09:14 is cancelled.", note: "08:44: a fault; 09:14: a shortage of staff; the board also lists 2 buses; Disruption between Alpha and Gamma." });
  assert.deepEqual(spokenTrains({ ...board, departures: [], buses: 1, messages: ["No trains today."] }), { say: "There are no trains from Alpha to Beta on the board right now, but it lists a bus.", note: "No trains today." });
  assert.equal(spokenTrainsMost, 3);
  assert.deepEqual(spokenTrains({ ...board, departures: [{ ...board.departures[3], platform: "3" }], buses: 0, messages: [] }), { say: "Trains from Alpha to Beta: the 09:44 is delayed, with no time yet, platform 3." });
  assert.deepEqual(spokenTrains({ ...board, departures: [{ due: "10:00", expected: "Starts here", platform: null, cancelled: false, reason: null }], buses: 0, messages: [] }), { say: "Trains from Alpha to Beta: the 10:00 shows Starts here." });
  assert.deepEqual(spokenTrains({ ...board, departures: [], buses: 0, messages: [] }), { say: "There are no trains from Alpha to Beta on the board right now." });
});

const connection = (leaves: string, change: number, arrives: string, more: object = {}) => ({ leaves, expected: "On time", platform: "16", arrives, arrivesExpected: "On time", change, bus: false, ...more });

const journeys = {
  from: "Alpha",
  via: "Gamma",
  to: "Beta",
  walk: 3,
  messages: ["Engineering works near Gamma."],
  journeys: [
    { leaves: "08:33", expected: "On time", cancelled: false, bus: false, reason: null, arrives: "08:42", arrivesExpected: "On time", tight: null, best: connection("08:45", 3, "09:36"), fallback: connection("09:00", 18, "09:52") },
    { leaves: "08:44", expected: "08:47", cancelled: false, bus: true, reason: "a fault", arrives: "08:53", arrivesExpected: "08:57", tight: connection("08:59", 2, "09:50", { platform: null }), best: connection("09:00", 3, "09:52", { arrivesExpected: "09:55" }), fallback: null },
    { leaves: "09:00", expected: "Delayed", cancelled: false, bus: false, reason: "a signal fault", arrives: "09:09", arrivesExpected: "Delayed", tight: null, best: null, fallback: null },
    { leaves: "09:15", expected: "On time", cancelled: false, bus: false, reason: null, arrives: "09:24", arrivesExpected: "On time", tight: null, best: null, fallback: null },
  ],
};

test("journeys are said as the next three, each with its connection, any tight one and the fallback, with reasons and messages as a note", () => {
  assert.deepEqual(spokenJourneys(journeys), {
    say: "From Alpha: the 08:33 is on time, with 3 minutes at Gamma for the 08:45, platform 16, into Beta at 09:36, then the 09:00, in at 09:52; the 08:44 bus is expected at 08:47, with only 2 minutes at Gamma for the 08:59, else 3 minutes for the 09:00, platform 16, into Beta at 09:55; the 09:00 is delayed, with no time yet.",
    note: "08:44: a fault; 09:00: a signal fault; Engineering works near Gamma.",
  });
  assert.deepEqual(spokenJourneys({ ...journeys, messages: [], journeys: [{ ...journeys.journeys[3] }, { ...journeys.journeys[0], leaves: "09:30", cancelled: true, reason: "a strike" }, { ...journeys.journeys[0], expected: "Ontime" }] }), {
    say: "From Alpha: the 09:15 is on time, with no connection on the board yet; the 09:30 is cancelled; the 08:33 is on time, with 3 minutes at Gamma for the 08:45, platform 16, into Beta at 09:36, then the 09:00, in at 09:52.",
    note: "09:30: a strike",
  });
  assert.deepEqual(spokenJourneys({ ...journeys, messages: [], journeys: [] }), { say: "There are no trains from Alpha to Gamma on the board right now." });
});

test("a hub following a journey is read as journeys, and Ontime on a plain board is on time", async () => {
  const hub = await standInHub(() => ({ status: 200, body: journeys }));
  assert.equal((await trainTimes(token, signal, hub.url)).say.slice(0, 40), "From Alpha: the 08:33 is on time, with 3");
  const plain = await standInHub(() => ({ status: 200, body: { from: "Alpha", to: "Beta", departures: [{ due: "08:14", expected: "Ontime", platform: null, cancelled: false, reason: "not said" }], buses: 0, messages: [] } }));
  assert.deepEqual(await trainTimes(token, signal, plain.url), { say: "Trains from Alpha to Beta: the 08:14 is on time." });
  const odd = await standInHub(() => ({ status: 200, body: { ...journeys, walk: "3" } }));
  assert.deepEqual(await trainTimes(token, signal, odd.url), { say: "I couldn't get the train times.", note: "the hub's reply wasn't a train board" });
});

test("train times are asked of the hub with the token, and a hub that's off, failing or odd is said plainly", async () => {
  const hub = await standInHub(() => ({ status: 200, body: { from: "Alpha", to: "Beta", departures: [{ due: "08:14", expected: "On time", platform: "16", cancelled: false, reason: null, destination: "Beta" }, { due: 7 }], buses: 0, messages: [] } }));
  assert.deepEqual(await trainTimes(token, signal, hub.url), { say: "Trains from Alpha to Beta: the 08:14 is on time, platform 16." });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.authorization]), [["GET", "/trains", `Bearer ${token}`]]);
  const off = await standInHub(() => ({ status: 404, body: { error: "Train times are switched off" } }));
  assert.deepEqual(await trainTimes(token, signal, off.url), { say: "I couldn't get the train times.", note: "train times are off in the hub, so set TRAINS=on and its settings in api/.env and restart the hub" });
  const failing = await standInHub(() => ({ status: 502, body: { error: "Couldn't get the train times: the board refused the key (401)" } }));
  assert.deepEqual(await trainTimes(token, signal, failing.url), { say: "I couldn't get the train times.", note: "the hub said: Couldn't get the train times: the board refused the key (401)" });
  const old = await standInHub(() => ({ status: 404, body: { message: "Route GET:/trains not found", error: "Not Found", statusCode: 404 } }));
  assert.deepEqual(await trainTimes(token, signal, old.url), { say: "I couldn't get the train times.", note: "the hub said: Not Found" });
  const refused = await standInHub(() => ({ status: 401, body: { error: "Unauthorized" } }));
  assert.deepEqual(await trainTimes(token, signal, refused.url), { say: "I couldn't get the train times.", note: "the hub said: Unauthorized" });
  const odd = await standInHub(() => ({ status: 200, body: { from: "Alpha", departures: [] } }));
  assert.deepEqual(await trainTimes(token, signal, odd.url), { say: "I couldn't get the train times.", note: "the hub's reply wasn't a train board" });
  assert.deepEqual(await trainTimes(null, signal, hub.url), { say: "I couldn't get the train times.", note: hubOffNote });
  assert.equal(hub.asked.length, 1);
});

test("the server check is a short fixed list of phrasings, said on its own, politely, or as the last sentence", () => {
  assert.deepEqual(serverWords, ["server check", "check the server", "how's the server", "how is the server", "how's the server doing", "how is the server doing", "is the server ok", "is the server okay"]);
  for (const said of ["Server check.", "Hey Jarvis, server check.", "How's the server?", "How\u2019s the server doing?", "How is the server doing?", "Is the server OK?", "Is the server okay?", "Check the server.", "Can you check the server, please?", "Could you do a server check?", "Jarvis, run a server check.", "Give me a server check.", "Please check the server.", "Morning. How's the server?", "Right\u2026 Server check.", "Actually, is the server OK?", "Thanks, server check.", "OK, how's the server?", "Is the server OK, thanks?"]) assert.deepEqual(codeWordIn(said), { kind: "server" }, said);
});

test("asking whether everything is OK or all right is not a code word, alone or as the last sentence, so it goes to Claude as before", () => {
  for (const said of ["Is everything OK?", "Is everything okay, Jarvis?", "Is everything all right?", "Is everything alright?", "Hey Jarvis, is everything OK?", "Can you tell me, is everything ok?", "I had a rough day. Is everything all right?", "Morning. Is everything OK?", "Actually, is everything OK?", "Is everything OK, thanks?"]) assert.equal(codeWordIn(said), null, said);
});

test("near misses of the server check go to Claude as usual", () => {
  for (const said of ["Is everything OK with you?", "Is everything OK with the boiler?", "How's the server room?", "Check the server logs.", "Is the server down?", "What's a server check?", "Server checks are boring.", "How is the server set up?", "Is everything ok in the kitchen?", "Should I check the server?", "Is everything OK? Tell me about Docker.", "How's the server doing compared to yesterday?", "Do a server check tomorrow.", "Do a check the server.", "Run a how's the server.", "Give me a server."]) assert.equal(codeWordIn(said), null, said);
});

const report: DoctorReport = {
  summary: "1 problem: Heartbeat. 2 things to look at: Disk and Wi-Fi.",
  checks: [
    { name: "Disk", state: "warn", detail: "15 of 100 GB free, under a fifth.", next: "docker system df shows what Docker uses." },
    { name: "Memory", state: "ok", detail: "4.0 of 8.0 GB available.", next: null },
    { name: "Wi-Fi", state: "warn", detail: "Wi-Fi reconnected 1 time in the last 24 hours.", next: null },
    { name: "Heartbeat", state: "problem", detail: "The last ping to Healthchecks.io, 26 Nov at 11:55, failed.", next: "docker compose logs --tail 20 api shows why." },
    { name: "Train times", state: "off", detail: "Switched off (TRAINS).", next: null },
  ],
};

test("the server check says the summary, then problems before things to look at, and puts what to try on screen only", () => {
  assert.deepEqual(spokenDoctor(report), {
    say: "1 problem: Heartbeat. 2 things to look at: Disk and Wi-Fi. Heartbeat: The last ping to Healthchecks.io, 26 Nov at 11:55, failed. Disk: 15 of 100 GB free, under a fifth. Wi-Fi: Wi-Fi reconnected 1 time in the last 24 hours.",
    note: "Heartbeat: docker compose logs --tail 20 api shows why; Disk: docker system df shows what Docker uses",
  });
  assert.deepEqual(spokenDoctor({ summary: "Everything's OK: 3 checks fine, 1 switched off.", checks: [{ name: "Disk", state: "ok", detail: "40 of 100 GB free.", next: null }, { name: "Train times", state: "off", detail: "Switched off (TRAINS).", next: null }] }), { say: "Everything's OK: 3 checks fine, 1 switched off." });
});

test("the server check says at most three checks aloud and counts the rest for the hub page", () => {
  assert.equal(spokenChecksMost, 3);
  const many: DoctorReport = { summary: "4 problems: A, B, C and D.", checks: ["A", "B", "C", "D"].map((name) => ({ name, state: "problem" as const, detail: `${name} is broken.`, next: null })) };
  assert.deepEqual(spokenDoctor(many), { say: "4 problems: A, B, C and D. A: A is broken. B: B is broken. C: C is broken.", note: "1 more on the hub page" });
});

test("a long detail in the server check is cut at the last word that fits and ends with an ellipsis", async () => {
  const words = Array.from({ length: 60 }, (_, index) => `item${index}`).join(", ");
  const hub = await standInHub(() => ({ status: 200, body: { summary: "1 problem: Expiry list.", checks: [{ name: "Expiry list", state: "problem", detail: words, next: null }, { name: "Deals", state: "warn", detail: `${"x".repeat(320)} end`, next: null }] } }));
  const reply = await serverCheck(token, signal, hub.url);
  const expiry = reply.say.slice("1 problem: Expiry list. Expiry list: ".length, reply.say.indexOf(" Deals: "));
  assert.ok(words.startsWith(expiry.slice(0, -1)), expiry);
  assert.ok(expiry.endsWith("\u2026") && expiry.length <= 300 && expiry.length > 250, expiry);
  assert.match(expiry, /item\d+\u2026$/);
  assert.ok(words.split(", ").includes(expiry.slice(0, -1).split(", ").pop() as string), expiry);
  assert.equal(reply.say.slice(reply.say.indexOf(" Deals: ") + " Deals: ".length), `${"x".repeat(299)}\u2026`);
  const exact = await standInHub(() => ({ status: 200, body: { summary: "1 problem: Disk.", checks: [{ name: "Disk", state: "problem", detail: "y".repeat(300), next: null }] } }));
  assert.equal((await serverCheck(token, signal, exact.url)).say, `1 problem: Disk. Disk: ${"y".repeat(300)}`);
});

test("the server check asks the hub's doctor with the token, and a hub that's old, failing or odd is said plainly", async () => {
  const hub = await standInHub(() => ({ status: 200, body: { state: "warn", summary: "1 thing to look at: Disk.", checkedAt: "2026-11-26T12:00:00.000Z", checks: [{ name: "Disk", state: "warn", detail: "15 of 100 GB free, under a fifth.", next: "Free some space." }, { name: "Odd", state: "broken", detail: "x", next: null }, { name: 7 }, "x", null] } }));
  assert.deepEqual(await serverCheck(token, signal, hub.url), { say: "1 thing to look at: Disk. Disk: 15 of 100 GB free, under a fifth.", note: "Disk: Free some space" });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.authorization]), [["GET", "/system/doctor", `Bearer ${token}`]]);
  const old = await standInHub(() => ({ status: 404, body: { message: "Route GET:/system/doctor not found", error: "Not Found", statusCode: 404 } }));
  assert.deepEqual(await serverCheck(token, signal, old.url), { say: "I couldn't check the server.", note: "the hub has no server doctor yet, so update it and rebuild the API" });
  const refused = await standInHub(() => ({ status: 401, body: { error: "Unauthorized" } }));
  assert.deepEqual(await serverCheck(token, signal, refused.url), { say: "I couldn't check the server.", note: "the hub said: Unauthorized" });
  const failing = await standInHub(() => ({ status: 500, body: {} }));
  assert.deepEqual(await serverCheck(token, signal, failing.url), { say: "I couldn't check the server.", note: "the hub said: the hub replied 500" });
  for (const body of [{ checks: [] }, { summary: "Fine.", checks: "none" }, { summary: "  ", checks: [] }, []]) {
    const odd = await standInHub(() => ({ status: 200, body }));
    assert.deepEqual(await serverCheck(token, signal, odd.url), { say: "I couldn't check the server.", note: "the hub's reply wasn't a server check" }, JSON.stringify(body));
  }
  assert.deepEqual(await serverCheck(null, signal, hub.url), { say: "I couldn't check the server.", note: hubOffNote });
  assert.equal(hub.asked.length, 1);
  const gone = await serverCheck(token, signal, "http://127.0.0.1:1");
  assert.equal(gone.say, "I couldn't check the server.");
  assert.match(gone.note ?? "", /^couldn't reach the hub: /);
});

test("what the hub says about the server is cleaned of control characters and cut to length before it's said", async () => {
  const hub = await standInHub(() => ({ status: 200, body: { summary: `1 problem:\u0007 Disk.${"x".repeat(400)}`, checks: [{ name: `Disk${"y".repeat(60)}`, state: "problem", detail: `Full\n${"z".repeat(400)}`, next: `Clear\u001b it${"w".repeat(400)}` }] } }));
  const said = await serverCheck(token, signal, hub.url);
  assert.ok(!/[\u0000-\u001f]/.test(said.say + (said.note ?? "")));
  assert.equal(said.say, `1 problem:  Disk.${"x".repeat(283)} Disk${"y".repeat(36)}: Full ${"z".repeat(294)}\u2026`);
  assert.equal(said.note, `Disk${"y".repeat(36)}: Clear  it${"w".repeat(291)}`);
});

test("with the clock on, asking the time or the date is a code word of its own kind when it's all that's said, asked politely or not, and never as the last sentence of something longer", () => {
  assert.deepEqual(timeWords, ["what time is it", "what time's it", "what's the time", "what is the time", "tell me the time", "tell me what time it is", "do you know the time", "do you know what time it is"]);
  assert.deepEqual(dateWords, ["what's the date", "what is the date", "what's the date today", "what is the date today", "what's today's date", "what is today's date", "tell me the date", "tell me today's date", "what day is it", "what day is it today", "what day's it", "tell me what day it is", "do you know what day it is"]);
  for (const said of [...timeWords, "What time is it?", "Hey Jarvis, what\u2019s the time?", "Jarvis, can you tell me the time please?", "What time is it now?", "Okay, what is the time, Jarvis?"]) assert.deepEqual(codeWordIn(said, true), { kind: "time" }, said);
  for (const said of [...dateWords, "What's the date?", "Hey Jarvis, what day is it today?", "Could you tell me today's date?"]) assert.deepEqual(codeWordIn(said, true), { kind: "date" }, said);
  for (const said of ["I'm in New York. What time is it?", "I'm running late. What time is it?", "Tell me about the battle. What's the date?", "I've lost track. What day is it?", "What time is it? I need to leave by six."]) assert.equal(codeWordIn(said, true), null, said);
  for (const said of ["What time is it in New York?", "What time is the match?", "What's the time difference?", "Do you have the time?", "Have you got the time?", "Can you help me with something? Do you have the time?", "What's the date of the final?", "What day is it on?", "Time.", "The date."]) assert.equal(codeWordIn(said, true), null, said);
  assert.deepEqual(codeWordIn("What time's my train?", true), { kind: "trains" });
  assert.deepEqual(codeWordIn("One sec. Train times.", true), { kind: "trains" }, "the other code words still count as a last sentence");
  assert.deepEqual(codeWordIn("Note this: what time is it?", true), { kind: "note", text: "what time is it?" });
});

test("without the clock, asking the time or the date is no code word at all, however it's put, and every other code word is as it was", () => {
  for (const said of [...timeWords, ...dateWords, "What time is it?", "Hey Jarvis, what day is it today?"]) {
    assert.equal(codeWordIn(said), null, said);
    assert.equal(codeWordIn(said, false), null, said);
  }
  for (const said of ["Train times.", "Find my phone.", "Never mind.", "Server check.", "Stop listening.", "Brain questions.", "Note this: milk", "Sorry, one sec. Find my phone."]) assert.deepEqual(codeWordIn(said, true), codeWordIn(said), said);
});

test("the time line gives London's time and date in one bracketed line, through summer time and past midnight, and goes after the message", () => {
  assert.equal(timeLine(new Date("2026-11-26T13:52:40Z")), "[Time now: 13:52 on Thursday 26 November 2026, in London.]");
  assert.equal(timeLine(new Date("2026-07-01T23:30:00Z")), "[Time now: 00:30 on Thursday 2 July 2026, in London.]");
  assert.equal(timeLine(new Date("2026-01-01T00:05:00Z")), "[Time now: 00:05 on Thursday 1 January 2026, in London.]");
  assert.equal(withTimeLine("What's next?", "[Time now: 13:52 on Thursday 26 November 2026, in London.]"), "What's next?\n\n[Time now: 13:52 on Thursday 26 November 2026, in London.]");
  assert.equal(withTimeLine("What's next?", null), "What's next?");
});

test("the time and the date are said in London's, the date with its day of the week and the right ending on the number", () => {
  assert.deepEqual(clockReply("time", new Date("2026-11-26T13:52:40Z")), { say: "It's 13:52." });
  assert.deepEqual(clockReply("time", new Date("2026-07-01T23:30:00Z")), { say: "It's 00:30." });
  assert.deepEqual(clockReply("date", new Date("2026-11-26T13:52:40Z")), { say: "It's Thursday the 26th of November." });
  assert.deepEqual(clockReply("date", new Date("2026-07-01T23:30:00Z")), { say: "It's Thursday the 2nd of July." });
  const endings = (days: number[]) => days.map((day) => clockReply("date", new Date(Date.UTC(2026, 0, day, 12))).say.replace(/^It's \w+ the (\w+) of January\.$/, "$1"));
  assert.deepEqual(endings([1, 2, 3, 4, 10, 11, 12, 13, 14, 20, 21, 22, 23, 24, 30, 31]), ["1st", "2nd", "3rd", "4th", "10th", "11th", "12th", "13th", "14th", "20th", "21st", "22nd", "23rd", "24th", "30th", "31st"]);
});

test("with look-ups on, look up and its kin at the start of what he said are a code word carrying the rest as the question", () => {
  const asked = (said: string) => codeWordIn(said, false, true);
  assert.deepEqual(asked("Look up the latest Node version."), { kind: "look up", text: "the latest Node version." });
  assert.deepEqual(asked("Hey Jarvis, look up: when does the town market open?"), { kind: "look up", text: "when does the town market open?" });
  assert.deepEqual(asked("Can you look up, the weather in Paris tomorrow"), { kind: "look up", text: "the weather in Paris tomorrow" });
  assert.deepEqual(asked("Jarvis, please look up who wrote Dune"), { kind: "look up", text: "who wrote Dune" });
  assert.deepEqual(asked("Search the web for Fastify 6 release notes"), { kind: "look up", text: "Fastify 6 release notes" });
  assert.deepEqual(asked("search online for cheap SFF PCs"), { kind: "look up", text: "cheap SFF PCs" });
  assert.deepEqual(asked("Search the internet for restic docs"), { kind: "look up", text: "restic docs" });
  assert.deepEqual(asked("Google the height of Mont Blanc"), { kind: "look up", text: "the height of Mont Blanc" });
  assert.deepEqual(asked("Look up."), { kind: "look up", text: "" });
  assert.deepEqual(asked("look up"), { kind: "look up", text: "" });
});

test("with look-ups off none of those is a code word, so everything reaches Claude as before", () => {
  for (const said of ["Look up the latest Node version.", "Search the web for Fastify 6", "Google the height of Mont Blanc", "look up"]) {
    assert.equal(codeWordIn(said), null, said);
    assert.equal(codeWordIn(said, true), null, said);
    assert.equal(codeWordIn(said, true, false), null, said);
  }
});

test("a look-up phrase that isn't at the start, or is part of another word, isn't a code word", () => {
  const asked = (said: string) => codeWordIn(said, false, true);
  for (const said of ["Could I look up something later?", "I'll google it myself", "Lookup tables are fast", "Looking up the docs now", "Google's new phone looks good", "What does look up mean?", "Search for my keys", "Search the website for it", "I am going out. Look up the weather there.", "Hmm. Look up the weather."]) assert.equal(asked(said), null, said);
});

test("asking to look up his own things goes to Claude, not to the web", () => {
  const asked = (said: string) => codeWordIn(said, false, true);
  for (const said of ["Look up in my notes what I said about restic", "Look up in the brain what the plan is", "Look up from my memory the server plan", "Look up my train times", "Look up My notes on Jarvis", "Look up on the hub what's downloading", "Google my name"]) assert.equal(asked(said), null, said);
  assert.deepEqual(asked("Look up myths about sleep"), { kind: "look up", text: "myths about sleep" });
  assert.deepEqual(asked("Look up in the news what happened today"), { kind: "look up", text: "in the news what happened today" });
});

test("look up doesn't take anything away from the code words that were there before", () => {
  assert.deepEqual(codeWordIn("Note this: look up the bins rota", false, true), { kind: "note", text: "look up the bins rota" });
  assert.deepEqual(codeWordIn("What time is it?", true, true), { kind: "time" });
  assert.deepEqual(codeWordIn("Find my phone", false, true), { kind: "phone" });
  assert.deepEqual(codeWordIn("Never mind", false, true), { kind: "never mind" });
});

test("found it and the like count only on their own, with a greeting, please or thanks around them", () => {
  for (const said of ["Found it.", "found it", "Hey Jarvis, I found it!", "I've found my phone, thanks.", "Jarvis, found the phone.", "Okay, I’ve found it.", "Can you stop ringing my phone please?", "You can stop ringing."]) {
    assert.equal(phoneFoundIn(said), true, said);
  }
  for (const said of ["I found it on the table", "Have you found it?", "found it hard to sleep", "Find my phone", "I found my keys", "stop", "", "Did I find my phone?"]) {
    assert.equal(phoneFoundIn(said), false, said);
  }
  assert.ok(foundWords.every((words) => words === words.toLowerCase()));
});

test("found it isn't one of codeWordIn's code words, so it still reaches Claude until the chat asks for it", () => {
  for (const said of ["Found it.", "I've found my phone.", "stop ringing"]) assert.equal(codeWordIn(said), null, said);
});

test("found it asks the hub's POST /phone/found with the token, and says what came of it", async () => {
  const hub = await standInHub(() => ({ status: 200, body: { stopped: true, cleared: true } }));
  assert.deepEqual(await phoneFound(token, signal, hub.url), { say: "Good, I've stopped it ringing." });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.authorization]), [["POST", "/phone/found", `Bearer ${token}`]]);
  const notCleared = await standInHub(() => ({ status: 200, body: { stopped: true, cleared: false } }));
  assert.deepEqual(await phoneFound(token, signal, notCleared.url), { say: "Good. I've stopped sending, but I couldn't clear it from your phone.", note: "the hub couldn't clear the notification on ntfy, so dismiss it on the phone" });
  const quiet = await standInHub(() => ({ status: 200, body: { stopped: false } }));
  assert.deepEqual(await phoneFound(token, signal, quiet.url), { say: "Good. It wasn't ringing." });
  const off = await standInHub(() => ({ status: 404, body: { error: "Finding the phone is switched off" } }));
  assert.deepEqual(await phoneFound(token, signal, off.url), { say: "I couldn't reach your phone.", note: "finding your phone is off in the hub, so set FIND_PHONE=on in api/.env and restart the hub" });
  const old = await standInHub(() => ({ status: 404, body: { error: "Not Found" } }));
  assert.deepEqual(await phoneFound(token, signal, old.url), { say: "I couldn't reach the hub to stop it.", note: "the hub said: Not Found" });
  assert.deepEqual(await phoneFound(null, signal, hub.url), { say: "I couldn't reach the hub to stop it.", note: hubOffNote });
  const gone = await phoneFound(token, signal, "http://127.0.0.1:1");
  assert.match(gone.note ?? "", /^couldn't reach the hub: /);
});

test("finding the phone says how long it rings, and that it's already ringing, when the hub rings it", async () => {
  const ringing = await standInHub(() => ({ status: 200, body: { sent: true, ring: "repeat", seconds: 30 } }));
  assert.deepEqual(await findPhone(token, signal, ringing.url), { say: "Your phone's ringing for 30 seconds. Say found it when you have it." });
  const already = await standInHub(() => ({ status: 429, body: { error: "It's already ringing: say found it, or POST /phone/found, to stop it" } }));
  assert.deepEqual(await findPhone(token, signal, already.url), { say: "It's already ringing. Say found it when you have it." });
});

test("projector on and projector off are code words only when the projector's switch is on, said on their own or politely", () => {
  for (const said of ["Projector on.", "Turn the projector on, please.", "Hey Jarvis, switch on the projector", "Can you turn on the projector?", "wake the projector"]) {
    assert.deepEqual(codeWordIn(said, false, false, true), { kind: "projector", on: true }, said);
    assert.equal(codeWordIn(said), null, `${said} isn't a code word with JARVIS_PROJECTOR off`);
  }
  for (const said of ["Projector off.", "turn the projector off", "Could you switch off the projector please", "put the projector to sleep"]) {
    assert.deepEqual(codeWordIn(said, false, false, true), { kind: "projector", on: false }, said);
    assert.equal(codeWordIn(said), null, `${said} isn't a code word with JARVIS_PROJECTOR off`);
  }
  assert.deepEqual(codeWordIn("That film was great. Projector off.", false, false, true), { kind: "projector", on: false }, "as the last sentence");
  for (const said of ["Is the projector on?", "What projector should I buy?", "projector on the wall looks dim", "Projector on?", "projector off ?"]) assert.equal(codeWordIn(said, false, false, true), null, said);
});

test("switching the projector asks the hub, and says what came of it", async () => {
  const hub = await standInHub(() => ({ status: 200, body: { sent: true, was: null, on: null } }));
  assert.deepEqual(await projectorPower(token, true, signal, hub.url), { say: "I sent the projector the key, but it hasn't said it's on, so it may not have got it." });
  assert.deepEqual(await projectorPower(token, false, signal, hub.url), { say: "I sent the projector the key, but it hasn't said it's off, so it may not have got it." });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.authorization, one.body]), [["POST", "/projector/power", `Bearer ${token}`, JSON.stringify({ on: true })], ["POST", "/projector/power", `Bearer ${token}`, JSON.stringify({ on: false })]]);
  const already = await standInHub(() => ({ status: 200, body: { sent: false, on: true } }));
  assert.deepEqual(await projectorPower(token, true, signal, already.url), { say: "The projector's already on." });
  const off = await standInHub(() => ({ status: 404, body: { error: "The projector is switched off" } }));
  assert.deepEqual(await projectorPower(token, true, signal, off.url), { say: "I couldn't switch the projector on.", note: "the projector is off in the hub, so set PROJECTOR=on in api/.env and rebuild the hub" });
  const refused = await standInHub(() => ({ status: 409, body: { error: "The hub couldn't reach the projector, so nothing was sent" } }));
  assert.deepEqual(await projectorPower(token, false, signal, refused.url), { say: "I couldn't switch the projector off.", note: "the hub said: The hub couldn't reach the projector, so nothing was sent" });
  assert.deepEqual(await projectorPower(null, true, signal, hub.url), { say: "I couldn't switch the projector on.", note: hubOffNote });
  const came = await standInHub((_request, body) => ({ status: 200, body: { sent: true, was: !JSON.parse(body).on, on: JSON.parse(body).on } }));
  assert.deepEqual(await projectorPower(token, true, signal, came.url), { say: "The projector's on." });
  assert.deepEqual(await projectorPower(token, false, signal, came.url), { say: "The projector's off." });
  const stuck = await standInHub((_request, body) => ({ status: 200, body: { sent: true, was: null, on: !JSON.parse(body).on } }));
  assert.deepEqual(await projectorPower(token, true, signal, stuck.url), { say: "I've told the projector to switch on, but it says it's still off." });
  assert.deepEqual(await projectorPower(token, false, signal, stuck.url), { say: "I've told the projector to switch off, but it says it's still on." });
});

test("the projector's words and their action are wired together from JARVIS_PROJECTOR alone", async () => {
  assert.deepEqual(projectorCodeWords(false, token), { projectorWords: false });
  const hub = await standInHub(() => ({ status: 200, body: { sent: true, was: false, on: true } }));
  const wired = projectorCodeWords(true, token, hub.url);
  assert.equal(wired.projectorWords, true);
  assert.deepEqual(await wired.action?.(true, signal), { say: "The projector's on." });
  assert.deepEqual(hub.asked.map((one) => one.body), [JSON.stringify({ on: true })]);
  assert.deepEqual(await projectorCodeWords(true, null, hub.url).action?.(true, signal), { say: "I couldn't switch the projector on.", note: hubOffNote });
});
