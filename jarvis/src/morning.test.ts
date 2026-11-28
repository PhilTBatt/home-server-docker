import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import { test } from "node:test";
import { firstTrain, hubMorning, morningAnswerIn, morningBackNote, morningHint, morningLevel, morningOffNote, morningOldHubNote, morningSay, morningSound, morningUnreachableNote, readMorning, soundLevel, watchMorning, type MorningEvent, type MorningReply } from "./morning.js";

const view = { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 2, upAt: null, by: null, snoozedUntil: null };

async function standIn(answer: (request: IncomingMessage, body: string) => { status: number; body: unknown }) {
  const asked: { method: string; url: string; auth: string; body: string }[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      asked.push({ method: request.method ?? "", url: request.url ?? "", auth: request.headers.authorization ?? "", body });
      const reply = answer(request, body);
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { url: `http://127.0.0.1:${address.port}`, asked, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

test("the hub's morning is checked before Jarvis acts on it, and keeps only what he needs", () => {
  assert.deepEqual(readMorning(view), { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 2 });
  for (const bad of [{}, { ...view, phase: "ringing" }, { ...view, day: "30/11/2026" }, { ...view, at: "6:45" }, { ...view, speakSlot: -1 }, { ...view, speakSlot: 1.5 }, { ...view, speakSlot: "2" }, { ...view, speakSlot: null }, { ...view, speakSlot: 1000 }]) assert.equal(readMorning(bad), null, JSON.stringify(bad));
  assert.deepEqual(readMorning({ ...view, phase: "up", speakSlot: null }), { phase: "up", day: "2026-11-30", at: "06:45", speakSlot: null });
});

test("I'm up and five more minutes are heard on their own or politely, and nothing longer counts", () => {
  for (const said of ["I'm up.", "Hey Jarvis, I'm up", "OK, I'm awake", "I'm getting up.", "Good morning, Jarvis.", "Morning.", "I am up thanks"]) assert.equal(morningAnswerIn(said), "up", said);
  for (const said of ["Five more minutes.", "5 more minutes please", "Snooze.", "Just five more minutes", "Give me five minutes"]) assert.equal(morningAnswerIn(said), "snooze", said);
  for (const said of ["I'm up for a chat", "what's up", "ten more minutes", "good morning to you too, what's the weather", "snooze the reminder", "up"]) assert.equal(morningAnswerIn(said), null, said);
});

test("each time he speaks it's 10 louder, starting 30 under his usual level and never over 100 or under 10", () => {
  assert.deepEqual([0, 1, 2, 5, 9].map((slot) => morningLevel(80, slot)), [50, 60, 70, 100, 100]);
  assert.deepEqual([morningLevel(30, 0), morningLevel(30, 1), morningLevel(5, -3)], [10, 20, 10]);
  assert.deepEqual([soundLevel(80), soundLevel(20)], [50, 10]);
});

test("the first line says good morning, the time, the first train and how to stop it; later ones only the time", () => {
  const at = new Date("2026-11-30T06:45:00Z");
  assert.equal(morningSay(at, true, "From Northgate: the 07:14 is on time."), `Good morning. It's 06:45. From Northgate: the 07:14 is on time. ${morningHint}`);
  assert.equal(morningSay(at, true, null), `Good morning. It's 06:45. ${morningHint}`);
  assert.equal(morningSay(new Date("2026-11-30T06:47:00Z"), false, "unused"), "It's 06:47. Time to get up.");
});

test("the soft sound is three rising notes, about two seconds long", () => {
  const sound = morningSound(16_000);
  assert.equal(sound.length, Math.round(16_000 * (320 + 160 + 320 + 160 + 560) / 1000) * 2);
});

test("watching the morning tells the chat each new phase or slot once, and says when the hub can't be asked or has it off", async () => {
  const replies: Array<MorningReply | Error> = [
    { status: 200, fields: { ...view, phase: "before", speakSlot: null } },
    { status: 200, fields: { ...view, phase: "before", speakSlot: null } },
    { status: 200, fields: { ...view, speakSlot: 0 } },
    new Error("fetch failed"),
    new Error("fetch failed"),
    { status: 200, fields: { ...view, speakSlot: 0 } },
    { status: 200, fields: { ...view, speakSlot: 1 } },
    { status: 404, fields: { error: "The morning is switched off" } },
    { status: 404, fields: { error: "Not Found" } },
    { status: 200, fields: { phase: "nonsense" } },
  ];
  const stop = new AbortController();
  const news = watchMorning({ ask: async () => { const next = replies.shift(); if (next === undefined) { stop.abort(); throw new Error("done"); } if (next instanceof Error) throw next; return next; }, signal: stop.signal, wait: async () => {} });
  const seen: MorningEvent[] = [];
  for await (const event of news.events) seen.push(event);
  assert.deepEqual(seen, [
    { kind: "morning", view: { phase: "before", day: "2026-11-30", at: "06:45", speakSlot: null } },
    { kind: "morning", view: { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 0 } },
    { kind: "morning note", line: morningUnreachableNote("fetch failed") },
    { kind: "morning note", line: morningBackNote },
    { kind: "morning", view: { phase: "speaking", day: "2026-11-30", at: "06:45", speakSlot: 1 } },
    { kind: "morning note", line: morningOffNote },
    { kind: "morning note", line: morningOldHubNote },
    { kind: "morning note", line: morningUnreachableNote("its answer couldn't be read") },
  ]);
});

test("I'm up and five more minutes go to the hub with his token, by voice, and a refusal is an error that says why", async () => {
  const hub = await standIn((request) => (request.url === "/morning/snooze" ? { status: 409, body: { error: "Jarvis isn't saying morning yet, so there's nothing to put off" } } : { status: 200, body: { ...view, phase: "up", speakSlot: null } }));
  const morning = hubMorning("a-token", hub.url);
  assert.deepEqual(await morning.answer("up", new AbortController().signal), { phase: "up", day: "2026-11-30", at: "06:45", speakSlot: null });
  await assert.rejects(morning.answer("snooze", new AbortController().signal), { message: "the hub said: Jarvis isn't saying morning yet, so there's nothing to put off" });
  assert.deepEqual(hub.asked.map((one) => [one.method, one.url, one.auth, one.body]), [["POST", "/morning/up", "Bearer a-token", '{"by":"voice"}'], ["POST", "/morning/snooze", "Bearer a-token", '{"by":"voice"}']]);
  await hub.close();
});

test("the first train is the train words' answer for one train, and nothing when the train times can't be had", async () => {
  const journeys = { from: "Northgate", via: "Midtown", to: "Southfield", walk: 5, messages: [], journeys: [{ leaves: "07:14", expected: "On time", cancelled: false, bus: false, reason: null, arrives: "07:24", arrivesExpected: "On time", tight: null, best: null, fallback: null }, { leaves: "07:44", expected: "On time", cancelled: false, bus: false, reason: null, arrives: "07:54", arrivesExpected: "On time", tight: null, best: null, fallback: null }] };
  const hub = await standIn(() => ({ status: 200, body: journeys }));
  const said = await firstTrain("a-token", hub.url)(new AbortController().signal);
  assert.ok(said?.startsWith("From Northgate: the 07:14 is on time"), String(said));
  assert.ok(!said?.includes("07:44"), "only the first");
  await hub.close();
  const off = await standIn(() => ({ status: 404, body: { error: "Train times are switched off" } }));
  assert.equal(await firstTrain("a-token", off.url)(new AbortController().signal), null);
  await off.close();
});
