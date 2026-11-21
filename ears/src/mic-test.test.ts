import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { MicSettings } from "./config.js";
import { busyLine, describeDetector, describeMic, detectorView, longestPauseOf, longestWait, louder, markMs, measure, measuredFrames, micTestMs, quietTimes, readWait, roomAdvice, roomUntilMs, runMicTest, secondsOf, sendSound, skipMs, softer, soundFollows, strip, verdict, type MicReport, type MicTestDeps } from "./mic-test.js";
import type { SileroStep } from "./silero.js";

const here = dirname(fileURLToPath(import.meta.url));
const usual: MicSettings = { micLevel: 80, micControl: "Capture", micBoost: "keep", micBoostControl: "Internal Mic Boost" };

function steady(level: number, ms: number): Uint8Array {
  const count = (ms / 1000) * 16000;
  const sound = new Uint8Array(count * 2);
  const view = new DataView(sound.buffer);
  for (let index = 0; index < count; index++) view.setInt16(index * 2, index % 2 === 0 ? level : -level, true);
  return sound;
}

function joined(...pieces: Uint8Array[]): Uint8Array {
  const sound = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    sound.set(piece, at);
    at += piece.length;
  }
  return sound;
}

function samples(values: number[]): Uint8Array {
  const sound = new Uint8Array(values.length * 2);
  const view = new DataView(sound.buffer);
  values.forEach((value, index) => view.setInt16(index * 2, value, true));
  return sound;
}

const settle = steady(0, skipMs);

function report(changes: Partial<MicReport>): MicReport {
  return { ms: 10_000, room: 50, line: 300, speechMs: 3_000, typical: 2_000, loudest: 4_000, longestPauseMs: 400, clipped: 0, ...changes };
}

test("the check records 10 seconds after a wait of up to a minute, skips the first 0.3 seconds when measuring, takes the room from the first 2 seconds, calls under twice the speech line quiet, and marks where the sound starts", () => {
  assert.deepEqual([micTestMs, longestWait, skipMs, roomUntilMs, quietTimes, soundFollows], [10_000, 60, 300, 2_000, 2, "sound follows"]);
});

test("silence has no background, so speech is anything above ears's floor of 300, and nothing is heard", () => {
  assert.deepEqual(measure(steady(0, 10_000)), { ms: 10_000, room: 0, line: 300, speechMs: 0, typical: 0, loudest: 0, longestPauseMs: 0, clipped: 0 });
});

test("a steady sound sets the room's level on ears's scale, so it never counts as speech however loud", () => {
  assert.deepEqual(measure(steady(1_000, 5_000)), { ms: 5_000, room: 1_000, line: 3_000, speechMs: 0, typical: 0, loudest: 1_000, longestPauseMs: 0, clipped: 0 });
});

test("speech after a quiet room is measured: how long it was above the line, its typical and loudest level, and the longest pause between", () => {
  const sound = joined(settle, steady(50, 3_000), steady(2_000, 2_000), steady(40, 1_000), steady(3_000, 1_000), steady(60, 2_700));
  assert.deepEqual(measure(sound), { ms: 10_000, room: 50, line: 300, speechMs: 3_000, typical: 2_000, loudest: 3_000, longestPauseMs: 1_000, clipped: 0 });
});

test("the typical level is the middle one of the frames above the line, the lower of the two middles when there's an even number", () => {
  const sound = joined(settle, steady(10, 2_000), steady(400, 100), steady(700, 100), steady(500, 100), steady(600, 100));
  assert.equal(measure(sound).typical, 500);
  assert.equal(measure(joined(settle, steady(10, 2_000), steady(400, 100), steady(700, 100), steady(500, 100))).typical, 500);
});

test("a frame exactly at the speech line isn't speech, as in ears's own check, and one just above it is", () => {
  const at = measure(joined(settle, steady(100, 2_000), steady(300, 500)));
  assert.deepEqual([at.room, at.line, at.speechMs], [100, 300, 0]);
  const above = measure(joined(settle, steady(100, 2_000), steady(301, 500)));
  assert.deepEqual([above.line, above.speechMs, above.typical], [300, 500, 301]);
});

test("the room is the level a fifth of the way up, as ears measures it, and the line is three times that above a background of 100", () => {
  const sound = joined(settle, steady(200, 1_000), steady(150, 1_000), steady(2_400, 1_000));
  const measured = measure(sound);
  assert.equal(measured.room, 150);
  assert.equal(measured.line, 450);
  assert.equal(measured.speechMs, 1_000);
});

test("the room is measured only in the first two seconds, while you're asked to stay quiet, so someone who talks steadily straight after still gets a clear verdict", () => {
  const measured = measure(joined(settle, steady(35, 1_700), steady(1_768, 8_000)));
  assert.deepEqual([measured.room, measured.line, measured.speechMs, measured.typical], [35, 300, 8_000, 1_768]);
  assert.equal(verdict(measured, usual).startsWith("Clear"), true);
  assert.equal(measure(joined(settle, steady(1_768, 1_700), steady(35, 8_000))).room, 1_768);
  const rising = Array.from({ length: 17 }, (_, index) => steady(100 + index * 10, 100));
  assert.equal(measure(joined(settle, ...rising, steady(50, 300), steady(2_000, 1_000))).room, 130);
});

test("the first 0.3 seconds don't count at all, so a pop as the microphone opens isn't taken for speech or clipping", () => {
  const sound = joined(steady(32_767, skipMs), steady(20, 2_000));
  assert.deepEqual(measure(sound), { ms: 2_300, room: 20, line: 300, speechMs: 0, typical: 0, loudest: 20, longestPauseMs: 0, clipped: 0 });
  assert.equal(measure(joined(steady(0, skipMs - 100), steady(5_000, 100), steady(20, 2_000))).speechMs, 0);
  assert.equal(measure(joined(steady(0, skipMs), steady(5_000, 100), steady(20, 2_000))).speechMs, 100);
});

test("every sample at the 16-bit limit counts as clipped, either way, and nothing short of it does", () => {
  const sound = joined(settle, steady(20, 1_000), samples([32_767, -32_768, 32_766, -32_767, 32_767]));
  assert.equal(measure(sound).clipped, 3);
  assert.equal(measure(joined(settle, steady(32_767, 100))).clipped, 800);
  assert.equal(measure(joined(settle, steady(32_766, 100))).clipped, 0);
});

test("a part frame at the end isn't measured for level, but its samples are checked for clipping, and an odd last byte is left out", () => {
  const sound = joined(settle, steady(20, 1_000), samples([32_767, 32_767]), new Uint8Array([0x7f]));
  const measured = measure(sound);
  assert.equal(measured.loudest, 20);
  assert.equal(measured.clipped, 2);
  assert.equal(measured.ms, 1_300);
});

test("sound shorter than the part that's skipped has nothing to measure", () => {
  assert.deepEqual(measure(steady(3_000, 200)), { ms: 200, room: 0, line: 300, speechMs: 0, typical: 0, loudest: 0, longestPauseMs: 0, clipped: 0 });
  assert.deepEqual(measure(new Uint8Array(0)), { ms: 0, room: 0, line: 300, speechMs: 0, typical: 0, loudest: 0, longestPauseMs: 0, clipped: 0 });
});

test("sound that doesn't start at the beginning of its buffer is read from where it starts", () => {
  const sound = joined(settle, steady(50, 2_000), steady(2_000, 1_000));
  const padded = new Uint8Array(sound.length + 3);
  padded.set(sound, 3);
  assert.deepEqual(measure(padded.subarray(3)), measure(sound));
});

test("seconds are given to a tenth, and one second is singular", () => {
  assert.equal(secondsOf(1_000), "1 second");
  assert.equal(secondsOf(1_500), "1.5 seconds");
  assert.equal(secondsOf(0), "0 seconds");
  assert.equal(secondsOf(10_000), "10 seconds");
  assert.equal(secondsOf(2_349), "2.3 seconds");
  assert.equal(secondsOf(960), "1 second");
});

test("louder says the one next change: the level up to 100 first, then the boost a step at a time, then that the microphone is too quiet", () => {
  assert.equal(louder({ ...usual, micLevel: "keep" }), "EARS_MIC_LEVEL is keep, so ears leaves the card's level alone: set EARS_MIC_LEVEL=100 in ears/.env and run this again.");
  assert.equal(louder(usual), "Raise EARS_MIC_LEVEL in ears/.env from 80 to 100 and run this again. If that's still not enough, try EARS_MIC_BOOST=1 next.");
  assert.equal(louder({ ...usual, micLevel: 99, micBoost: 2 }), "Raise EARS_MIC_LEVEL in ears/.env from 99 to 100 and run this again. If that's still not enough, try EARS_MIC_BOOST=1 next.");
  assert.equal(louder({ ...usual, micLevel: 100 }), "EARS_MIC_LEVEL is already 100, so try the boost: set EARS_MIC_BOOST=1 in ears/.env and run this again.");
  assert.equal(louder({ ...usual, micLevel: 100, micBoost: 0 }), "EARS_MIC_LEVEL is already 100, so raise the boost a step: set EARS_MIC_BOOST=1 in ears/.env and run this again. If Internal Mic Boost is already at its top, this microphone is too quiet from there.");
  assert.equal(louder({ ...usual, micLevel: 100, micBoost: 9, micBoostControl: "Mic Boost" }), "EARS_MIC_LEVEL is already 100, so raise the boost a step: set EARS_MIC_BOOST=10 in ears/.env and run this again. If Mic Boost is already at its top, this microphone is too quiet from there.");
  assert.equal(louder({ ...usual, micLevel: 100, micBoost: 10 }), "EARS_MIC_LEVEL and EARS_MIC_BOOST are both as high as they go, so this microphone is too quiet from there.");
});

test("softer turns the boost down a step first, then the level by 10, never below 0", () => {
  const knock = "A single knock or cough can clip too, so if that's what it was, just run this again.";
  assert.equal(softer({ ...usual, micBoost: 2 }), `Lower EARS_MIC_BOOST in ears/.env from 2 to 1 and run this again. ${knock}`);
  assert.equal(softer({ ...usual, micBoost: 1, micLevel: "keep" }), `Lower EARS_MIC_BOOST in ears/.env from 1 to 0 and run this again. ${knock}`);
  assert.equal(softer({ ...usual, micBoost: 0 }), `Lower EARS_MIC_LEVEL in ears/.env from 80 to 70 and run this again. ${knock}`);
  assert.equal(softer(usual), `Lower EARS_MIC_LEVEL in ears/.env from 80 to 70 and run this again. ${knock}`);
  assert.equal(softer({ ...usual, micLevel: 5 }), `Lower EARS_MIC_LEVEL in ears/.env from 5 to 0 and run this again. ${knock}`);
  assert.equal(softer({ ...usual, micLevel: "keep" }), `EARS_MIC_LEVEL is keep, so ears leaves the card's level alone: set EARS_MIC_LEVEL=60 in ears/.env and run this again. ${knock}`);
});

test("the verdict: no speech is too quiet, then clipping is too loud, then speech under twice the line is quiet, else clear", () => {
  assert.equal(verdict(report({ speechMs: 0, typical: 0, clipped: 9 }), usual), `Too quiet: ears wouldn't count this as speech, so a wake-word recording from there would be dropped. ${louder(usual)}`);
  assert.equal(verdict(report({ clipped: 1, typical: 400 }), usual), `Too loud. ${softer(usual)}`);
  assert.equal(verdict(report({ typical: 599 }), usual), `Quiet: you're above the line, but not by much, so ears may stop a recording while you're still talking. ${louder(usual)}`);
  assert.equal(verdict(report({ typical: 600 }), usual), "Clear: your voice is well above the room, so ears can tell when you've finished.");
  assert.equal(verdict(report({ typical: 1_799, room: 300, line: 900 }), usual), `Quiet: you're above the line, but not by much, so ears may stop a recording while you're still talking. ${roomAdvice}`);
});

test("when turning the microphone up can't lift the voice clear of the room, because it lifts both together, the advice says what would instead", () => {
  assert.equal(roomAdvice, "Turning the microphone up won't help from there: the line rises with the room, so your voice and the room get louder together. Get closer to the microphone, make the room quieter, or try another microphone.");
  const maxed = { ...usual, micLevel: 100, micBoost: 0 } as const;
  assert.equal(verdict(report({ room: 349, line: 1_047, typical: 1_651 }), maxed), `Quiet: you're above the line, but not by much, so ears may stop a recording while you're still talking. ${roomAdvice}`);
  assert.equal(verdict(report({ room: 349, line: 1_047, speechMs: 0, typical: 0, loudest: 1_000 }), maxed), `Too quiet: ears wouldn't count this as speech, so a wake-word recording from there would be dropped. ${roomAdvice}`);
  assert.equal(verdict(report({ room: 100, line: 300, typical: 599 }), maxed).endsWith(roomAdvice), true, "under six times the room, gain lifts both and never reaches clear, even at the line's floor");
  assert.equal(verdict(report({ room: 50, line: 300, typical: 400 }), maxed), `Quiet: you're above the line, but not by much, so ears may stop a recording while you're still talking. ${louder(maxed)}`, "six times the room or more, so gain can lift the voice clear of the floor");
  assert.equal(verdict(report({ room: 50, line: 300, typical: 300 }), maxed).endsWith(louder(maxed)), true);
  assert.equal(verdict(report({ room: 50, line: 300, typical: 299 }), maxed).endsWith(roomAdvice), true);
  assert.equal(verdict(report({ room: 100, line: 300, speechMs: 0, typical: 0, loudest: 300 }), maxed).endsWith(roomAdvice), true, "nothing louder than three times the room can be lifted over the line");
  assert.equal(verdict(report({ room: 100, line: 300, speechMs: 0, typical: 0, loudest: 299 }), maxed).endsWith(roomAdvice), true);
  assert.equal(verdict(report({ room: 50, line: 300, speechMs: 0, typical: 0, loudest: 151 }), maxed).endsWith(louder(maxed)), true);
  assert.equal(verdict(report({ room: 50, line: 300, speechMs: 0, typical: 0, loudest: 150 }), maxed).endsWith(roomAdvice), true);
  assert.equal(verdict(report({ room: 0, line: 300, typical: 10 }), maxed).endsWith(louder(maxed)), true, "a silent room never blames the room");
  assert.equal(verdict(report({ room: 349, line: 1_047, typical: 1_651, clipped: 3 }), maxed).startsWith("Too loud."), true);
});

test("the report says the room's level in the same words as ears's log, then the speech, the longest pause, clipping and the verdict", () => {
  assert.deepEqual(describeMic(report({}), usual), [
    "The room's background is 50, so speech is anything above 300.",
    "You were above that for 3 seconds, typically at 2000 (6.7 times the line) and at most 4000.",
    "Your longest pause while talking was 0.4 seconds. Ears ends a wake-word recording after 1.5 seconds of quiet.",
    "Nothing clipped.",
    "Clear: your voice is well above the room, so ears can tell when you've finished.",
  ]);
});

test("a pause as long as ears waits for says it would have ended a wake-word recording there", () => {
  assert.equal(describeMic(report({ longestPauseMs: 1_500 }), usual)[2], "Your longest pause while talking was 1.5 seconds. Ears ends a wake-word recording after 1.5 seconds of quiet, so it would have ended one during that pause.");
  assert.equal(describeMic(report({ longestPauseMs: 1_400 }), usual)[2], "Your longest pause while talking was 1.4 seconds. Ears ends a wake-word recording after 1.5 seconds of quiet.");
});

test("with no speech the report gives the loudest moment instead, and says how many samples clipped", () => {
  assert.deepEqual(describeMic(report({ speechMs: 0, typical: 0, loudest: 250, longestPauseMs: 0 }), usual), [
    "The room's background is 50, so speech is anything above 300.",
    "Nothing was loud enough to count as speech: the loudest moment was 250.",
    "Nothing clipped.",
    verdict(report({ speechMs: 0 }), usual),
  ]);
  assert.equal(describeMic(report({ clipped: 1 }), usual)[3], "1 sample hit the 16-bit limit (clipped), which distorts what Whisper hears.");
  assert.equal(describeMic(report({ clipped: 1_234 }), usual)[3], "1234 samples hit the 16-bit limit (clipped), which distorts what Whisper hears.");
});

test("the times above the line are given to a tenth", () => {
  assert.match(describeMic(report({ typical: 1_000, line: 300 }), usual)[1], /\(3\.3 times the line\)/);
  assert.match(describeMic(report({ typical: 900, line: 300 }), usual)[1], /\(3 times the line\)/);
});

test("the wait is a whole number of seconds from 0 to 60, and none means no wait", () => {
  for (const [value, wait] of [[undefined, 0], ["", 0], ["  ", 0], ["0", 0], ["10", 10], [" 60 ", 60], ["07", 7]] as const) assert.equal(readWait(value), wait, String(value));
  for (const value of ["61", "-1", "1.5", "ten", "100", "060", "5s", "+5"]) assert.throws(() => readWait(value), { message: `the wait must be a whole number of seconds from 0 to 60, not "${value}"` }, value);
});

test("the sound is sent as one line saying it follows, then the sound itself, and the send ends once both are written", async () => {
  const out = new PassThrough();
  const pieces: Buffer[] = [];
  out.on("data", (piece: Buffer) => pieces.push(piece));
  await sendSound(out)(new Uint8Array([0, 1, 2, 10, 13, 255]));
  assert.deepEqual([...Buffer.concat(pieces)], [...Buffer.from("sound follows\n"), 0, 1, 2, 10, 13, 255]);
});

const card = { number: 3, device: "plughw:3,0", capture: "pcmC3D0c", mixer: "controlC3" };

function pretend(script: string) {
  return () => ({ command: process.execPath, args: ["-e", script] });
}

const speaking = `const sound = Buffer.alloc(32000); for (let i = 19200; i < 32000; i += 2) sound.writeInt16LE((i / 2) % 2 === 0 ? 2000 : -2000, i); process.stdout.write(sound); setInterval(() => {}, 1000);`;

function harness(changes: Partial<MicTestDeps> = {}) {
  const said: string[] = [];
  const sent: Uint8Array[] = [];
  const levels: unknown[] = [];
  const slept: number[] = [];
  const deps: MicTestDeps = {
    env: {},
    say: (line) => void said.push(line),
    send: async (sound) => void sent.push(sound),
    findCard: async () => card,
    setLevel: async (...args) => void levels.push(["level", ...args]),
    setBoost: async (...args) => void levels.push(["boost", ...args]),
    recorder: pretend(speaking),
    sleep: async (ms) => void slept.push(ms),
    limitMs: 1_000,
    ...changes,
  };
  return { deps, said, sent, levels, slept };
}

test("a check sets the microphone as ears would, records until its time is up, reports, and sends exactly what it heard", { timeout: 15_000 }, async () => {
  const run = harness();
  assert.equal(await runMicTest(run.deps), 0);
  assert.deepEqual(run.levels, [["level", 3, "Capture", 80]]);
  assert.deepEqual(run.slept, []);
  assert.equal(run.said[0], "Recording 1 second from sound card 3's microphone (Capture set to 80%). Stay quiet for the first 2 seconds, then talk as you would to Jarvis.");
  assert.deepEqual(run.said.slice(1), describeMic(measure(run.sent[0]), usual));
  assert.equal(run.sent.length, 1);
  assert.equal(run.sent[0].length, 32_000);
  assert.equal(measure(run.sent[0]).typical, 2_000);
  assert.equal(measure(run.sent[0]).room, 0);
});

test("a check uses the four microphone settings it's given, the same way ears does", { timeout: 15_000 }, async () => {
  const run = harness({ env: { EARS_MIC_LEVEL: "100", EARS_MIC_CONTROL: "Mic", EARS_MIC_BOOST: "2", EARS_MIC_BOOST_CONTROL: "Mic Boost" } });
  assert.equal(await runMicTest(run.deps), 0);
  assert.deepEqual(run.levels, [["level", 3, "Mic", 100], ["boost", 3, "Mic Boost", 2]]);
  assert.match(run.said[0], /^Recording 1 second from sound card 3's microphone \(Mic set to 100%, Mic Boost set to 2\)\./);
  assert.match(run.said.at(-1) ?? "", /^Clear:/);
});

test("with a wait, it says so and waits that long before it records", { timeout: 15_000 }, async () => {
  const order: string[] = [];
  const run = harness({ env: { EARS_MIC_TEST_WAIT: "12" } });
  run.deps.sleep = async (ms) => void order.push(`slept ${ms}`);
  const say = run.deps.say;
  run.deps.say = (line) => {
    order.push(line.split(" ")[0]);
    say(line);
  };
  assert.equal(await runMicTest(run.deps), 0);
  assert.deepEqual(order.slice(0, 3), ["Waiting", "slept 12000", "Recording"]);
  assert.equal(run.said[0], "Waiting 12 seconds so you can get to where you'll talk from.");
  const one = harness({ env: { EARS_MIC_TEST_WAIT: "1" } });
  assert.equal(await runMicTest(one.deps), 0);
  assert.deepEqual([one.slept, one.said[0]], [[1_000], "Waiting 1 second so you can get to where you'll talk from."]);
  const none = harness({ env: { EARS_MIC_TEST_WAIT: "0" } });
  assert.equal(await runMicTest(none.deps), 0);
  assert.deepEqual([none.slept, none.said[0].split(" ")[0]], [[], "Recording"]);
});

test("a bad setting, a bad wait, no card, or a level that can't be set stops it before anything records, saying why", { timeout: 15_000 }, async () => {
  const never = () => assert.fail("it recorded");
  const cases: [Partial<MicTestDeps>, string][] = [
    [{ env: { EARS_MIC_LEVEL: "loud" } }, `The check didn't start: EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "loud".`],
    [{ env: { EARS_MIC_BOOST: "max" } }, `The check didn't start: EARS_MIC_BOOST must be a whole number of steps from 0 to 10, or keep to leave the card's own boost, not "max".`],
    [{ env: { EARS_MIC_TEST_WAIT: "90" } }, `The check didn't start: the wait must be a whole number of seconds from 0 to 60, not "90".`],
    [{ findCard: async () => Promise.reject(new Error("No sound devices were passed in")) }, "The check didn't start: No sound devices were passed in."],
    [{ setLevel: async () => Promise.reject(new Error("Couldn't set Capture on sound card 3")) }, "The check didn't start: Couldn't set Capture on sound card 3."],
    [{ env: { EARS_MIC_BOOST: "1" }, setBoost: async () => Promise.reject(new Error("Couldn't set Internal Mic Boost on sound card 3")) }, "The check didn't start: Couldn't set Internal Mic Boost on sound card 3."],
  ];
  for (const [changes, line] of cases) {
    const run = harness({ ...changes, recorder: never, sleep: async () => assert.fail("it waited") });
    assert.equal(await runMicTest(run.deps), 1, line);
    assert.deepEqual(run.said, [line]);
    assert.deepEqual(run.sent, []);
  }
});

test("a microphone something else has open says ears is probably using it and how to free it, and sends nothing", { timeout: 15_000 }, async () => {
  const run = harness({ recorder: pretend(`process.stderr.write("arecord: main:850: audio open error: Device or resource busy\\n"); process.exit(1);`) });
  assert.equal(await runMicTest(run.deps), 1);
  assert.equal(run.said.at(-1), busyLine);
  assert.equal(busyLine, "The microphone is busy: something else has it open, most likely ears, recording or listening for Hey Jarvis. Mute ears with bash host/ears.sh mute, wait a second, run this again, and unmute it afterwards.");
  assert.deepEqual(run.sent, []);
});

test("a recorder that fails some other way says what it said, and one that can't start says so, and neither sends anything", { timeout: 15_000 }, async () => {
  const failing = harness({ recorder: pretend(`process.stderr.write("arecord: no such card\\n"); process.exit(3);`) });
  assert.equal(await runMicTest(failing.deps), 1);
  assert.equal(failing.said.at(-1), "The recording didn't work: the recorder ended by itself with code 3: arecord: no such card.");
  assert.deepEqual(failing.sent, []);
  const missing = harness({ recorder: () => ({ command: "/no/such/arecord", args: [] }) });
  assert.equal(await runMicTest(missing.deps), 1);
  assert.match(missing.said.at(-1) ?? "", /^The recording didn't work: the recorder couldn't start: spawn \/no\/such\/arecord ENOENT\.$/);
  assert.deepEqual(missing.sent, []);
});

test("a recorder that stops early by itself with no error is still a failed check, not a short report", { timeout: 15_000 }, async () => {
  const run = harness({ recorder: pretend(`process.stdout.write(Buffer.alloc(3200));`) });
  assert.equal(await runMicTest(run.deps), 1);
  assert.equal(run.said.at(-1), "The recording didn't work: the recorder ended by itself with code 0.");
  assert.deepEqual(run.sent, []);
});

test("run as a program, it reads its settings from the environment, writes what it says to stderr, nothing to stdout, and exits 1 when it can't start", { timeout: 15_000 }, async () => {
  const child = spawn(process.execPath, [join(here, "mic-test-run.js")], { env: { PATH: process.env.PATH, EARS_MIC_LEVEL: "loud" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (piece) => (out += piece));
  child.stderr.on("data", (piece) => (err += piece));
  const code = await new Promise((resolve) => child.on("close", resolve));
  assert.equal(code, 1);
  assert.equal(out, "");
  assert.equal(err, `The check didn't start: EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "loud".\n`);
});

test("the strip shows half a second a mark, # where any frame in it was speech", () => {
  assert.equal(markMs, 500);
  assert.equal(strip([]), "");
  assert.equal(strip([false, false, false, false, false]), ".");
  assert.equal(strip([false, false, true, false, false, false, false]), "#.");
  assert.equal(strip([...Array(10).fill(false), true]), "..#");
});

test("the longest pause is the longest run of non-speech between two frames of speech, never counting before the first or after the last", () => {
  assert.equal(longestPauseOf([]), 0);
  assert.equal(longestPauseOf([false, false, true, false, false]), 0);
  assert.equal(longestPauseOf([true, false, false, true, false, true, false, false, false]), 200);
});

test("the frames measured are whole tenths of a second after the first 0.3 seconds", () => {
  const frames = measuredFrames(new Uint8Array(3200 * 5 + 100));
  assert.deepEqual(frames.map((frame) => frame.length), [3200, 3200]);
});

const loudStep = (): SileroStep => async (input, state) => ({ probability: input.slice(64).some((value) => Math.abs(value) > 0.03) ? 0.9 : 0.05, state });

test("the detector's view judges the same frames, saying how long it heard speech and the longest pause", async () => {
  const sound = joined(settle, steady(0, 1_000), steady(2_000, 500), steady(0, 300), steady(2_000, 400), steady(0, 1_000));
  const view = await detectorView(sound, loudStep());
  assert.equal(view.speech.length, measuredFrames(sound).length);
  assert.equal(view.speechMs >= 900 && view.speechMs <= 1_100, true, String(view.speechMs));
  assert.equal(view.longestPauseMs >= 200 && view.longestPauseMs <= 300, true, String(view.longestPauseMs));
});

test("the detector's lines say how long it heard speech, or that it heard none and what that means, then both views side by side", () => {
  const view = { speechMs: 2_000, longestPauseMs: 400, speech: [false, true, true, true, true, true, false, false, false, false] };
  const loud = [false, true, true, false, false, false, false, false, false, false];
  assert.deepEqual(describeDetector(view, report({ line: 450 }), loud), [
    "The speech detector heard speech for 2 seconds, and your longest pause while talking was 0.4 seconds.",
    "Each mark is half a second, # where each heard you (loudness above 450):",
    "  loudness         #.",
    "  speech detector  ##",
  ]);
  assert.equal(describeDetector({ ...view, longestPauseMs: 1_500 }, report({}), loud)[0], "The speech detector heard speech for 2 seconds, and your longest pause while talking was 1.5 seconds, so it would have ended a wake-word recording during that pause.");
  assert.equal(describeDetector({ speechMs: 0, longestPauseMs: 0, speech: [false] }, report({}), [false])[0], "The speech detector heard no speech at all, so with EARS_WAKE_END=silero a wake-word recording from there would be dropped.");
});

test("with EARS_WAKE_END=silero the check loads the detector and adds its view after the report, and the sound is still sent", { timeout: 15_000 }, async () => {
  let loads = 0;
  const run = harness({ env: { EARS_WAKE_END: "silero" }, loadSilero: async () => (loads++, loudStep()) });
  assert.equal(await runMicTest(run.deps), 0);
  assert.equal(loads, 1);
  const report = describeMic(measure(run.sent[0]), usual);
  assert.deepEqual(run.said.slice(1, 1 + report.length), report);
  assert.match(run.said[1 + report.length], /^The speech detector heard speech for /);
  assert.equal(run.said.length, 1 + report.length + 4);
  assert.equal(run.said[1 + report.length + 2], "  loudness         ##");
  assert.equal(run.sent.length, 1);
  const atLine = harness({ env: { EARS_WAKE_END: "silero" }, loadSilero: async () => loudStep(), recorder: pretend(speaking.replace("? 2000 : -2000", "? 300 : -300")) });
  assert.equal(await runMicTest(atLine.deps), 0);
  assert.equal(atLine.said.find((line) => line.startsWith("  loudness")), "  loudness         ..", "a frame exactly at the line isn't loud, as in the report");
});

test("without the detector chosen nothing loads, and a detector that won't load or run is said after the report, the sound still sent", { timeout: 15_000 }, async () => {
  const off = harness({ env: { EARS_WAKE_END: "loudness" }, loadSilero: async () => assert.fail("it loaded") });
  assert.equal(await runMicTest(off.deps), 0);
  assert.equal(off.said.some((line) => line.includes("speech detector")), false);
  const broken = harness({ env: { EARS_WAKE_END: "silero" }, loadSilero: async () => Promise.reject(new Error("no model")) });
  assert.equal(await runMicTest(broken.deps), 0);
  assert.equal(broken.said.at(-1), "The speech detector couldn't run: no model.");
  assert.equal(broken.sent.length, 1);
  const failing = harness({ env: { EARS_WAKE_END: "silero" }, loadSilero: async () => async () => Promise.reject(new Error("model broke")) });
  assert.equal(await runMicTest(failing.deps), 0);
  assert.equal(failing.said.at(-1), "The speech detector couldn't run: model broke.");
});

test("an EARS_WAKE_END that isn't loudness or silero stops the check before it records", { timeout: 15_000 }, async () => {
  const run = harness({ env: { EARS_WAKE_END: "vad" }, recorder: () => assert.fail("it recorded") });
  assert.equal(await runMicTest(run.deps), 1);
  assert.deepEqual(run.said, [`The check didn't start: EARS_WAKE_END must be loudness or silero, not "vad".`]);
});
