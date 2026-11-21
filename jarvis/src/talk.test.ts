import assert from "node:assert/strict";
import { test } from "node:test";
import type { EarsAnswer, EarsCall } from "./ears-client.js";
import { earsLine, heardFrom, startTalk, talkPollMs, talkWord, unmuteHint } from "./talk.js";

type Asked = { method: string; path: string; ms: number; signal: AbortSignal | undefined };

function answer(status: number, fields: Partial<EarsAnswer> = {}): EarsAnswer {
  return { status, state: "idle", reason: null, error: null, seconds: null, last: null, ...fields };
}

const heardLast = (text: string | null, textProblem: string | null = null, seconds = 2.5) => ({ seconds, reason: "asked to stop", text, textProblem });

function pretendEars(replies: Record<string, (EarsAnswer | Error)[]>) {
  const asked: Asked[] = [];
  const call: EarsCall = async (method, path, ms, signal) => {
    asked.push({ method, path, ms, signal });
    const next = replies[`${method} ${path}`]?.shift();
    if (next === undefined) throw new Error(`nothing set for ${method} ${path}`);
    if (next instanceof Error) throw next;
    return next;
  };
  return { asked, call };
}

function clock() {
  const time = { at: 1000 };
  return { time, now: () => time.at };
}

test("push-to-talk is started with /talk, and ears is asked every quarter of a second while Whisper works", () => {
  assert.equal(talkWord, "/talk");
  assert.equal(talkPollMs, 250);
  assert.equal(unmuteHint, "unmute it on the server with bash host/ears.sh unmute");
});

test("starting asks ears to record, and passes on the caller's signal", async () => {
  const ears = pretendEars({ "POST /recording/start": [answer(200, { state: "recording" })] });
  const signal = new AbortController().signal;
  assert.deepEqual(await startTalk({ call: ears.call }).start(signal), { ok: true, id: null });
  assert.deepEqual(ears.asked, [{ method: "POST", path: "/recording/start", ms: 4000, signal }]);
});

test("a start gives back the number ears gave the recording, so the chat can name it later", async () => {
  const ears = pretendEars({ "POST /recording/start": [answer(200, { state: "recording", id: 7 })] });
  assert.deepEqual(await startTalk({ call: ears.call }).start(), { ok: true, id: 7 });
});

test("send and drop name the recording when they're given its number, and don't when they aren't", async () => {
  const ears = pretendEars({
    "POST /recording/stop?id=7": [answer(200, { lastId: 7, last: heardLast("Hello.") })],
    "POST /recording/cancel?id=8": [answer(200)],
    "POST /recording/stop": [answer(200, { last: heardLast("Hi.") })],
    "POST /recording/cancel": [answer(200)],
  });
  const talk = startTalk({ call: ears.call });
  assert.equal((await talk.send(undefined, false, 7)).ok, true);
  assert.equal(await talk.drop(undefined, 8), null);
  assert.equal((await talk.send()).ok, true);
  assert.equal(await talk.drop(), null);
  assert.deepEqual(ears.asked.map((asked) => asked.path), ["/recording/stop?id=7", "/recording/cancel?id=8", "/recording/stop", "/recording/cancel"]);
});

test("a recording ears says is gone, because it has moved on to a newer one, isn't sent, says why, and dropping it is fine", async () => {
  const ears = pretendEars({ "POST /recording/stop?id=3": [answer(410, { state: "recording", error: "ears has moved on to a newer recording, so that one is gone", lastId: 4 })], "POST /recording/cancel?id=3": [answer(410, { state: "recording" })] });
  const talk = startTalk({ call: ears.call });
  assert.deepEqual(await talk.send(undefined, false, 3), { ok: false, why: "ears has moved on to a newer recording, so that one is gone" });
  assert.equal(await talk.drop(undefined, 3), null);
  assert.deepEqual(ears.asked.map((asked) => asked.path), ["/recording/stop?id=3", "/recording/cancel?id=3"]);
});

test("a named recording that ended by itself gives its own text at once, even while another chat's recording runs", async () => {
  const ears = pretendEars({ "POST /recording/stop?id=5": [answer(409, { state: "recording", error: "that recording has already ended" })], "GET /state": [answer(200, { state: "recording", lastId: 5, last: heardLast("Mine.") })] });
  const sent = await startTalk({ call: ears.call, wait: async () => assert.fail("it waited") }).send(undefined, false, 5);
  assert.deepEqual([sent.ok, sent.ok && sent.heard.text], [true, "Mine."]);
});

test("a named recording waits while Whisper works on it, then gives its text", async () => {
  const ears = pretendEars({ "POST /recording/stop?id=5": [answer(409, { state: "working" })], "GET /state": [answer(200, { state: "working", lastId: 5 }), answer(200, { state: "idle", lastId: 5, last: heardLast("Done now.") })] });
  const sent = await startTalk({ call: ears.call, wait: async () => {} }).send(undefined, false, 5);
  assert.deepEqual([sent.ok, sent.ok && sent.heard.text, ears.asked.length], [true, "Done now.", 3]);
});

test("a named recording whose text was replaced by a newer one's says so instead of asking the newer one's words, without waiting for a recording that isn't its own", async () => {
  const ears = pretendEars({ "POST /recording/stop?id=5": [answer(409, { state: "recording" })], "GET /state": [answer(200, { state: "recording", lastId: 6, last: heardLast("Someone else's.") })] });
  const sent = await startTalk({ call: ears.call, wait: async () => assert.fail("it waited") }).send(undefined, false, 5);
  assert.deepEqual(sent, { ok: false, why: "ears moved on to a newer recording, so this one's text is gone" });
  const idle = pretendEars({ "POST /recording/stop?id=5": [answer(409, { state: "idle" })], "GET /state": [answer(200, { state: "idle", lastId: 6, last: heardLast("Someone else's.") })] });
  assert.deepEqual(await startTalk({ call: idle.call }).send(undefined, false, 5), { ok: false, why: "ears moved on to a newer recording, so this one's text is gone" });
});

test("a stop that can't reach ears cancels the same recording it named", async () => {
  const ears = pretendEars({ "POST /recording/stop?id=9": [new Error("Ears didn't answer within 70 seconds")], "POST /recording/cancel?id=9": [answer(200)] });
  assert.deepEqual(await startTalk({ call: ears.call }).send(undefined, false, 9), { ok: false, why: "Ears didn't answer within 70 seconds" });
  assert.deepEqual(ears.asked.map((asked) => asked.path), ["/recording/stop?id=9", "/recording/cancel?id=9"]);
});

test("the text is only taken as the chat's own when ears says the last recording is that one, or doesn't say which it is", () => {
  const last = heardLast("Words.");
  assert.equal(heardFrom(answer(200, { last, lastId: 2 }), 10, false, 2).ok, true);
  assert.deepEqual(heardFrom(answer(200, { last, lastId: 3 }), 10, false, 2), { ok: false, why: "ears moved on to a newer recording, so this one's text is gone" });
  assert.deepEqual(heardFrom(answer(200, { last, lastId: null }), 10, false, 2), { ok: false, why: "ears moved on to a newer recording, so this one's text is gone" });
  assert.equal(heardFrom(answer(200, { last }), 10, false, 2).ok, true);
  assert.equal(heardFrom(answer(200, { last, lastId: 3 }), 10, false).ok, true);
  assert.equal(heardFrom(answer(200, { state: "recording", last, lastId: 2 }), 10, false, 2).ok, true);
  assert.equal(heardFrom(answer(200, { state: "recording", last }), 10, false, 2).ok, false);
  assert.equal(heardFrom(answer(200, { state: "working", last, lastId: 2 }), 10, false, 2).ok, false);
});

test("a refused start says why, and a muted ears says how to unmute it", async () => {
  const ears = pretendEars({ "POST /recording/start": [answer(409, { state: "muted", error: "ears is muted" }), answer(409, { state: "working", error: "ears is still turning the last recording into text" }), answer(503, { state: null }), new Error("Couldn't reach ears")] });
  const talk = startTalk({ call: ears.call });
  assert.deepEqual(await talk.start(), { ok: false, why: `ears is muted, so ${unmuteHint}` });
  assert.deepEqual(await talk.start(), { ok: false, why: "ears is still turning the last recording into text" });
  assert.deepEqual(await talk.start(), { ok: false, why: "ears answered 503" });
  assert.deepEqual(await talk.start(), { ok: false, why: "Couldn't reach ears" });
});

test("sending stops the recording, waits for the text, and gives back the text, how long was recorded, and how long the text took from Enter", async () => {
  const { time, now } = clock();
  const ears = pretendEars({ "POST /recording/stop": [answer(200, { seconds: 2.5, last: heardLast("  Turn the lights on.  ") })] });
  const call: EarsCall = async (...args) => {
    time.at += 1300;
    return ears.call(...args);
  };
  const signal = new AbortController().signal;
  assert.deepEqual(await startTalk({ call, now }).send(signal), { ok: true, heard: { text: "Turn the lights on.", recordedMs: 2500, textMs: 1300 } });
  assert.deepEqual(ears.asked, [{ method: "POST", path: "/recording/stop", ms: 70_000, signal }]);
});

test("a recording that ended by itself at its limit is still sent, once Whisper has finished with it", async () => {
  const { time, now } = clock();
  const ears = pretendEars({
    "POST /recording/stop": [answer(409, { error: "ears isn't recording", state: "working" })],
    "GET /state": [answer(200, { state: "working" }), answer(200, { state: "working" }), answer(200, { state: "idle", last: { seconds: 30, reason: "it reached the 30-second limit", text: "A long one.", textProblem: null } })],
  });
  const waited: number[] = [];
  const talk = startTalk({ call: ears.call, now, wait: async (ms) => {
    waited.push(ms);
    time.at += ms;
  } });
  assert.deepEqual(await talk.send(), { ok: true, heard: { text: "A long one.", recordedMs: 30_000, textMs: 500 } });
  assert.deepEqual(waited, [250, 250]);
  assert.deepEqual(ears.asked.map((asked) => `${asked.method} ${asked.path} ${asked.ms}`), ["POST /recording/stop 70000", "GET /state 4000", "GET /state 4000", "GET /state 4000"]);
});

test("waiting for a Whisper that's still working gives up after 70 seconds, saying so", async () => {
  const { time, now } = clock();
  const working = Array.from({ length: 400 }, () => answer(200, { state: "working" }));
  const ears = pretendEars({ "POST /recording/stop": [answer(409, { state: "working" })], "GET /state": working });
  const talk = startTalk({ call: ears.call, now, wait: async (ms) => void (time.at += ms) });
  assert.deepEqual(await talk.send(), { ok: false, why: "Whisper was still working on it after 70 seconds" });
  assert.equal(ears.asked.filter((asked) => asked.path === "/state").length, 281);
});

test("no text says why: Whisper's problem, a mute, a failed ears, no words, or nothing at all", async () => {
  const cases: [EarsAnswer, string][] = [
    [answer(200, { last: heardLast(null, "Whisper took longer than 60 seconds") }), "Whisper took longer than 60 seconds"],
    [answer(200, { state: "muted", last: heardLast(null) }), "ears was muted, so the recording was dropped"],
    [answer(200, { state: "failed", reason: "the recorder ended by itself with code 1", last: heardLast(null) }), "ears failed (the recorder ended by itself with code 1)"],
    [answer(200, { state: "failed", last: null }), "ears failed (no reason given)"],
    [answer(200, { last: heardLast("") }), "Whisper heard no words"],
    [answer(200, { last: heardLast("   ") }), "Whisper heard no words"],
    [answer(200, { last: { seconds: 1, reason: "the switch was flipped while it was recording", text: null, textProblem: null } }), "it wasn't turned into text: the switch was flipped while it was recording"],
    [answer(200, { last: null }), "ears sent back no text"],
  ];
  for (const [reply, why] of cases) {
    const ears = pretendEars({ "POST /recording/stop": [reply] });
    assert.deepEqual(await startTalk({ call: ears.call }).send(), { ok: false, why }, why);
  }
});

test("a recording muted before it could be sent says ears is muted, and a refusal or failure while sending says why", async () => {
  const cases: [Record<string, (EarsAnswer | Error)[]>, string][] = [
    [{ "POST /recording/stop": [answer(409, { state: "muted", error: "ears isn't recording" })], "GET /state": [answer(200, { state: "muted", last: heardLast(null, "it was muted before it was turned into text") })] }, "it was muted before it was turned into text"],
    [{ "POST /recording/stop": [answer(409, { state: "idle" })], "GET /state": [answer(409, { state: "muted", error: "x" })] }, `ears is muted, so ${unmuteHint}`],
    [{ "POST /recording/stop": [answer(500, { state: null, error: "boom" })] }, "boom"],
    [{ "POST /recording/stop": [new Error("Ears didn't answer within 70 seconds")] }, "Ears didn't answer within 70 seconds"],
    [{ "POST /recording/stop": [answer(409, { state: "idle" })], "GET /state": [new Error("Couldn't reach ears")] }, "Couldn't reach ears"],
  ];
  for (const [replies, why] of cases) assert.deepEqual(await startTalk({ call: pretendEars(replies).call }).send(), { ok: false, why }, why);
});

test("after a 409, a recording that's still ending is waited for too, so an earlier recording's text is never sent as this one's", async () => {
  const { time, now } = clock();
  const ears = pretendEars({
    "POST /recording/stop": [answer(409, { error: "ears isn't recording", state: "recording" })],
    "GET /state": [answer(200, { state: "recording", last: heardLast("Turn on the downloads.") }), answer(200, { state: "idle", last: { seconds: 3, reason: "the switch was flipped while it was recording, so a mute may have come and gone", text: null, textProblem: null } })],
  });
  const talk = startTalk({ call: ears.call, now, wait: async (ms) => void (time.at += ms) });
  assert.deepEqual(await talk.send(), { ok: false, why: "it wasn't turned into text: the switch was flipped while it was recording, so a mute may have come and gone" });
  const stillEnding = pretendEars({ "POST /recording/stop": [answer(409, { state: "recording" })], "GET /state": Array.from({ length: 400 }, () => answer(200, { state: "recording", last: heardLast("Turn on the downloads.") })) });
  assert.deepEqual(await startTalk({ call: stillEnding.call, now, wait: async (ms) => void (time.at += ms) }).send(), { ok: false, why: "ears was still ending the recording after 70 seconds" });
});

test("a start or a send that gets no answer cancels the recording in case it went through, without the call-off signal", async () => {
  const calls: string[] = [];
  const control = new AbortController();
  const call: EarsCall = async (method, path, _ms, signal) => {
    calls.push(`${method} ${path} ${signal === undefined ? "no signal" : "signal"}`);
    if (path === "/recording/cancel") return answer(200);
    throw new Error("Ears didn't answer within 4 seconds");
  };
  const talk = startTalk({ call });
  assert.deepEqual(await talk.start(control.signal), { ok: false, why: "Ears didn't answer within 4 seconds" });
  assert.deepEqual(await talk.send(control.signal), { ok: false, why: "Ears didn't answer within 4 seconds" });
  assert.deepEqual(calls, ["POST /recording/start signal", "POST /recording/cancel no signal", "POST /recording/stop signal", "POST /recording/cancel no signal"]);
  const quiet = startTalk({ call: async () => Promise.reject(new Error("Couldn't reach ears")) });
  assert.deepEqual(await quiet.start(), { ok: false, why: "Couldn't reach ears" }, "a cancel that fails too changes nothing");
  const refused = pretendEars({ "POST /recording/start": [answer(409, { state: "muted", error: "ears is muted" })] });
  await startTalk({ call: refused.call }).start();
  assert.deepEqual(refused.asked.map((asked) => asked.path), ["/recording/start"], "a refusal means nothing started, so nothing is cancelled");
});

test("dropping cancels the recording, quietly when it's already over, and says why when it can't", async () => {
  const ears = pretendEars({ "POST /recording/cancel": [answer(200), answer(409, { error: "ears isn't recording" }), answer(500, { state: null, error: "boom" }), new Error("Couldn't reach ears")] });
  const talk = startTalk({ call: ears.call });
  assert.equal(await talk.drop(), null);
  assert.equal(await talk.drop(), null);
  assert.equal(await talk.drop(), "boom");
  assert.equal(await talk.drop(), "Couldn't reach ears");
  assert.deepEqual(ears.asked.map((asked) => `${asked.method} ${asked.path} ${asked.ms}`), Array.from({ length: 4 }, () => "POST /recording/cancel 4000"));
});

test("the ears line says whether ears is ready, muted, failed or out of reach, and how to talk", async () => {
  assert.equal(earsLine(answer(200, { state: "idle" })), "Ears: ready. Type /talk to speak, then press Enter on an empty line to send it");
  assert.equal(earsLine(answer(200, { state: "recording" })), "Ears: ready. Type /talk to speak, then press Enter on an empty line to send it");
  assert.equal(earsLine(answer(200, { state: "muted" })), "Ears: ready but muted, so unmute it on the server with bash host/ears.sh unmute, then type /talk to speak");
  assert.equal(earsLine(answer(200, { state: "failed", reason: "no recorder" })), "Ears: failed (no recorder), so unmute it on the server with bash host/ears.sh unmute to start it again, then type /talk to speak");
  assert.equal(earsLine(answer(500, { state: null, error: "boom" })), "Ears: boom");
  const ears = pretendEars({ "GET /state": [answer(200, { state: "muted" }), new Error("Couldn't reach ears at http://ears:8090 (ENOTFOUND). Start it on the server with bash host/ears.sh start")] });
  const talk = startTalk({ call: ears.call });
  assert.equal(await talk.check(), earsLine(answer(200, { state: "muted" })));
  assert.equal(await talk.check(), "Ears: Couldn't reach ears at http://ears:8090 (ENOTFOUND). Start it on the server with bash host/ears.sh start");
});

test("a check that's called off passes the call-off on, rather than writing a line", async () => {
  const control = new AbortController();
  control.abort(new Error("Starting called off"));
  const talk = startTalk({ call: async (_method, _path, _ms, signal) => Promise.reject(signal?.reason) });
  await assert.rejects(talk.check(control.signal), { message: "Starting called off" });
});

test("with the wake word, the ears line says both ways to speak", async () => {
  assert.equal(earsLine(answer(200, { state: "idle" }), true), "Ears: ready. Type /talk to speak, or say Hey Jarvis while the wake word is on");
  assert.equal(earsLine(answer(200, { state: "muted" }), true), "Ears: ready but muted, so unmute it on the server with bash host/ears.sh unmute, then say Hey Jarvis or type /talk");
  assert.equal(earsLine(answer(200, { state: "failed", reason: "x" }), true), "Ears: failed (x), so unmute it on the server with bash host/ears.sh unmute to start it again, then say Hey Jarvis or type /talk");
  assert.equal(earsLine(answer(401, { state: null, error: "nope" }), true), "Ears: nope");
  const ears = pretendEars({ "GET /state": [answer(200, { state: "idle" })] });
  assert.equal(await startTalk({ call: ears.call, wake: true }).check(), "Ears: ready. Type /talk to speak, or say Hey Jarvis while the wake word is on");
});

test("a finished recording read on its own gives the text and times, marked as the wake word's when it was", () => {
  const done = answer(200, { state: "idle", last: heardLast("  Lights on.  ", null, 3.21) });
  assert.deepEqual(heardFrom(done, 900), { ok: true, heard: { text: "Lights on.", recordedMs: 3210, textMs: 900 } });
  assert.deepEqual(heardFrom(done, 900, true), { ok: true, heard: { text: "Lights on.", recordedMs: 3210, textMs: 900, wake: true } });
  assert.deepEqual(heardFrom(answer(200, { state: "working", last: heardLast(null) }), 1), { ok: false, why: "Whisper was still working on it after 70 seconds" });
  assert.deepEqual(heardFrom(answer(200, { state: "idle", last: heardLast(null, "no Jarvis chat took it within 2 seconds") }), 1, true), { ok: false, why: "no Jarvis chat took it within 2 seconds" });
  assert.deepEqual(heardFrom(answer(200, { state: "idle", last: { seconds: 5, reason: "nothing loud enough to be speech came within 5 seconds", text: "  ", textProblem: null } }), 1, true), { ok: false, why: "Whisper heard no words" });
  assert.deepEqual(heardFrom(answer(503, { state: null, error: "Couldn't reach ears at http://ears:8090" }), 1, true), { ok: false, why: "Couldn't reach ears at http://ears:8090" });
  assert.deepEqual(heardFrom(answer(200, { state: "muted", last: heardLast(null, "it was cleared by a mute") }), 1, true), { ok: false, why: "it was cleared by a mute" });
});

test("sending with the wake word marks what was heard as the wake word's", async () => {
  const ears = pretendEars({ "POST /recording/stop": [answer(200, { state: "idle", last: heardLast("Hello.") })] });
  const sent = await startTalk({ call: ears.call }).send(undefined, true);
  assert.equal(sent.ok && sent.heard.wake, true);
  const plain = pretendEars({ "POST /recording/stop": [answer(200, { state: "idle", last: heardLast("Hello.") })] });
  const pushed = await startTalk({ call: plain.call }).send();
  assert.equal(pushed.ok && "wake" in pushed.heard, false);
  const following = pretendEars({ "POST /recording/stop": [answer(200, { state: "idle", last: heardLast("Hello.") })] });
  const followed = await startTalk({ call: following.call }).send(undefined, "follow");
  assert.deepEqual(followed.ok && [followed.heard.follow, "wake" in followed.heard], [true, false]);
});

test("a wake question keeps what ended its recording, as ears said it, and a push one never has it", () => {
  for (const ender of ["loudness", "silero"] as const) {
    const sent = heardFrom(answer(200, { last: { ...heardLast("Hi."), ender } }), 10, true);
    assert.deepEqual(sent.ok && sent.heard, { text: "Hi.", recordedMs: 2500, textMs: 10, wake: true, ender });
  }
  const pushed = heardFrom(answer(200, { last: { ...heardLast("Hi."), ender: "silero" } }), 10, false);
  assert.deepEqual(pushed.ok && pushed.heard, { text: "Hi.", recordedMs: 2500, textMs: 10 });
  const plain = heardFrom(answer(200, { last: heardLast("Hi.") }), 10, true);
  assert.deepEqual(plain.ok && plain.heard, { text: "Hi.", recordedMs: 2500, textMs: 10, wake: true });
});

test("a wake or follow-up question keeps the pause its recording was set to end on, and a push one never has it", () => {
  const woken = heardFrom(answer(200, { last: { ...heardLast("Hi."), ender: "silero", pauseMs: 2500 } }), 10, true);
  assert.deepEqual(woken.ok && woken.heard, { text: "Hi.", recordedMs: 2500, textMs: 10, wake: true, ender: "silero", pauseMs: 2500 });
  const followed = heardFrom(answer(200, { last: { ...heardLast("Hi."), ender: "silero", pauseMs: 2500 } }), 10, "follow");
  assert.equal(followed.ok && followed.heard.pauseMs, 2500);
  const pushed = heardFrom(answer(200, { last: { ...heardLast("Hi."), pauseMs: 2500 } }), 10, false);
  assert.deepEqual(pushed.ok && pushed.heard, { text: "Hi.", recordedMs: 2500, textMs: 10 });
});

test("a follow-up is marked as one, not as the wake word's, and keeps what ended its recording too", () => {
  const sent = heardFrom(answer(200, { last: { ...heardLast("And tomorrow?"), ender: "silero" } }), 10, "follow");
  assert.deepEqual(sent.ok && sent.heard, { text: "And tomorrow?", recordedMs: 2500, textMs: 10, follow: true, ender: "silero" });
  const plain = heardFrom(answer(200, { last: heardLast("And tomorrow?") }), 10, "follow");
  assert.deepEqual(plain.ok && plain.heard, { text: "And tomorrow?", recordedMs: 2500, textMs: 10, follow: true });
});
