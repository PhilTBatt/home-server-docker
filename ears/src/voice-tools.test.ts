import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { busyLine } from "./mic-test.js";
import { makeVoiceprint, readVoiceprint, voiceSize, type Embedder } from "./voice-id.js";
import { agreement, checkMs, enrolClipMs, enrolReadyMs, enrolSentences, enrolShortestMs, enrolTries, runVoiceCheck, runVoiceEnrol, sendText, voiceprintFollows, whyNot, type CheckDeps, type EnrolDeps } from "./voice-tools.js";

const here = dirname(fileURLToPath(import.meta.url));
const card = { number: 3, device: "plughw:3,0", capture: "pcmC3D0c", mixer: "controlC3" };

function pretend(script: string) {
  return () => ({ command: process.execPath, args: ["-e", script] });
}

function speaking(ms: number): string {
  return `const sound = Buffer.alloc(320000); for (let i = 6400; i < ${6400 + (ms / 1000) * 32000}; i += 2) sound.writeInt16LE((i / 2) % 2 === 0 ? 2000 : -2000, i); process.stdout.write(sound); setInterval(() => {}, 1000);`;
}

const silent = `process.stdout.write(Buffer.alloc(320000)); setInterval(() => {}, 1000);`;

function pointing(index: number, plus = 0): Float32Array {
  const vector = new Float32Array(voiceSize);
  vector[index] = 1;
  vector[(index + 1) % voiceSize] = plus;
  return vector;
}

function voices(...list: Float32Array[]): { embedder: Embedder; asked: number[] } {
  const asked: number[] = [];
  let at = 0;
  return { asked, embedder: async (_features, frames) => (asked.push(frames), list[Math.min(at++, list.length - 1)]) };
}

const steadyVoices = () => voices(pointing(0, 0.1), pointing(0, 0.2), pointing(0, 0.3), pointing(0, 0.2), pointing(0, 0.1));

function enrolHarness(changes: Partial<EnrolDeps> = {}) {
  const said: string[] = [];
  const sent: string[] = [];
  const levels: unknown[] = [];
  const slept: number[] = [];
  const recorded: number[] = [];
  const deps: EnrolDeps = {
    env: {},
    say: (line) => void said.push(line),
    send: async (text) => void sent.push(text),
    loadModel: async () => steadyVoices().embedder,
    findCard: async () => card,
    setLevel: async (...args) => void levels.push(["level", ...args]),
    setBoost: async (...args) => void levels.push(["boost", ...args]),
    recorder: (found) => (recorded.push(found.number), pretend(speaking(1_600))()),
    sleep: async (ms) => void slept.push(ms),
    now: () => new Date("2026-11-20T10:00:00.000Z"),
    limitMs: 1_700,
    ...changes,
  };
  return { deps, said, sent, levels, slept, recorded };
}

test("enrolment reads five sentences, 6 seconds each after 2 seconds to get ready, needs a second and a half of speech in each with three tries, and marks where the voiceprint starts", () => {
  assert.equal(enrolSentences.length, 5);
  assert.ok(enrolSentences.every((sentence) => sentence.length > 30 && sentence.length < 70));
  assert.deepEqual([enrolClipMs, enrolReadyMs, enrolShortestMs, enrolTries, checkMs, voiceprintFollows], [6_000, 2_000, 1_500, 3, 5_000, "voiceprint follows"]);
});

test("enrolment sets the microphone as ears would, records each sentence, and sends a voiceprint of their average and nothing else", { timeout: 30_000 }, async () => {
  const run = enrolHarness({ env: { EARS_MIC_LEVEL: "90", EARS_MIC_BOOST: "2" } });
  assert.equal(await runVoiceEnrol(run.deps), 0);
  assert.deepEqual(run.levels, [
    ["level", 3, "Capture", 90],
    ["boost", 3, "Internal Mic Boost", 2],
  ]);
  assert.deepEqual(run.recorded, [3, 3, 3, 3, 3]);
  assert.deepEqual(run.slept, [2_000, 2_000, 2_000, 2_000, 2_000]);
  assert.equal(run.sent.length, 1);
  const voiceprint = readVoiceprint(run.sent[0]);
  assert.deepEqual([voiceprint.clips, voiceprint.made], [5, "2026-11-20T10:00:00.000Z"]);
  assert.ok(voiceprint.vector[0] > 0.97 && voiceprint.vector[1] > 0.15);
  assert.match(run.said[0], /^You'll read 5 short sentences, one at a time, into sound card 3's microphone \(.*\)\. Sit where you usually talk to Jarvis, with nobody else talking and the TV off\. Nothing you say is kept: only the voiceprint made from it\.$/);
  assert.deepEqual(run.said.slice(1, 4), ["Sentence 1 of 5. Read it at your normal speed when it says Go:", `  "${enrolSentences[0]}"`, "Go (1.7 seconds)."]);
  assert.equal(run.said.filter((line) => line.startsWith("Sentence ")).length, 5);
  assert.match(run.said.at(-2) ?? "", /^How much each clip sounds like the rest: ([01]\.\d\d, ){4}[01]\.\d\d\.$/);
  assert.equal(run.said.at(-1), "Made a voiceprint from 5 clips.");
  assert.equal(run.said.some((line) => /\d\.\d{3}/.test(line)), false);
});

test("each clip's speech, not the whole recording, goes to the model", { timeout: 30_000 }, async () => {
  const model = steadyVoices();
  const run = enrolHarness({ loadModel: async () => model.embedder });
  assert.equal(await runVoiceEnrol(run.deps), 0);
  assert.deepEqual(model.asked, [178, 178, 178, 178, 178]);
});

test("a clip with no speech or too little is tried again with the same sentence, saying why", { timeout: 30_000 }, async () => {
  const scripts = [silent, speaking(1_200), speaking(1_600)];
  let call = 0;
  const run = enrolHarness({ recorder: () => pretend(scripts[Math.min(call++, scripts.length - 1)])() });
  assert.equal(await runVoiceEnrol(run.deps), 0);
  assert.equal(call, 7);
  assert.ok(run.said.includes("No speech was heard in that one. Let's try that sentence again."));
  assert.ok(run.said.includes("Speech was heard for only 1.2 seconds, and a clip needs at least 1.5 seconds. Let's try that sentence again."));
  assert.equal(run.said.filter((line) => line === "Sentence 1 of 5. Read it at your normal speed when it says Go:").length, 3);
  assert.equal(run.said.filter((line) => line === "Sentence 2 of 5. Read it at your normal speed when it says Go:").length, 1);
});

test("a sentence that fails three times stops enrolment and saves nothing", { timeout: 30_000 }, async () => {
  const run = enrolHarness({ recorder: pretend(silent) });
  assert.equal(await runVoiceEnrol(run.deps), 1);
  assert.equal(run.said.filter((line) => line.startsWith("Sentence 1 of 5.")).length, 3);
  assert.equal(run.said.at(-1), "No speech was heard in that one. That was 3 tries at that sentence, so nothing was saved. Check the microphone with bash host/ears.sh mic-test, then run this again.");
  assert.deepEqual(run.sent, []);
});

test("a clip that sounds like someone else saves nothing, saying which", { timeout: 30_000 }, async () => {
  const model = voices(pointing(0, 0.1), pointing(0, 0.2), pointing(7), pointing(0, 0.2), pointing(0, 0.1));
  const run = enrolHarness({ loadModel: async () => model.embedder });
  assert.equal(await runVoiceEnrol(run.deps), 1);
  assert.equal(run.said.at(-1), "Clip 3 sounds like a different voice from the others (under the threshold of 0.5), so nothing was saved. Make sure only you are talking, somewhere quiet, and run this again.");
  assert.deepEqual(run.sent, []);
});

test("how alike the clips must be follows EARS_VOICE_ID_THRESHOLD", { timeout: 30_000 }, async () => {
  const model = voices(pointing(0), pointing(0, 1), pointing(0, 1), pointing(0, 1), pointing(0, 1));
  const strict = enrolHarness({ env: { EARS_VOICE_ID_THRESHOLD: "0.75" }, loadModel: async () => model.embedder });
  assert.equal(await runVoiceEnrol(strict.deps), 1);
  assert.match(strict.said.at(-1) ?? "", /^Clip 1 sounds like a different voice from the others \(under the threshold of 0\.75\)/);
  const loose = voices(pointing(0), pointing(0, 1), pointing(0, 1), pointing(0, 1), pointing(0, 1));
  const easy = enrolHarness({ env: { EARS_VOICE_ID_THRESHOLD: "0.7" }, loadModel: async () => loose.embedder });
  assert.equal(await runVoiceEnrol(easy.deps), 0);
});

test("each clip is compared with the average of the others", () => {
  const scores = agreement([pointing(0), pointing(0), pointing(1)]);
  assert.deepEqual(scores.map((score) => Number(score.toFixed(4))), [0.7071, 0.7071, 0]);
});

test("a bad setting, no model, no card, or a level that can't be set stops enrolment before anything records, saying why", { timeout: 15_000 }, async () => {
  const never = () => assert.fail("it recorded");
  const cases: [Partial<EnrolDeps>, string][] = [
    [{ env: { EARS_MIC_LEVEL: "loud" } }, `The enrolment didn't start: EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "loud".`],
    [{ env: { EARS_VOICE_ID_THRESHOLD: "1" } }, `The enrolment didn't start: EARS_VOICE_ID_THRESHOLD must be a number above 0 and below 1, with up to 2 decimal places, like 0.5 or 0.45, not "1".`],
    [{ loadModel: async () => Promise.reject(new Error("Load model from /app/models/voice-id.onnx failed")) }, "The enrolment didn't start: Load model from /app/models/voice-id.onnx failed."],
    [{ findCard: async () => Promise.reject(new Error("No sound devices were passed in")) }, "The enrolment didn't start: No sound devices were passed in."],
    [{ setLevel: async () => Promise.reject(new Error("Couldn't set Capture on sound card 3")) }, "The enrolment didn't start: Couldn't set Capture on sound card 3."],
  ];
  for (const [changes, line] of cases) {
    const run = enrolHarness({ ...changes, recorder: never, sleep: async () => assert.fail("it waited") });
    assert.equal(await runVoiceEnrol(run.deps), 1, line);
    assert.deepEqual(run.said, [line]);
    assert.deepEqual(run.sent, []);
  }
});

test("a busy or failing microphone, or a model that fails, stops enrolment and saves nothing", { timeout: 15_000 }, async () => {
  const busy = enrolHarness({ recorder: pretend(`process.stderr.write("arecord: main:850: audio open error: Device or resource busy\\n"); process.exit(1);`) });
  assert.equal(await runVoiceEnrol(busy.deps), 1);
  assert.equal(busy.said.at(-1), busyLine);
  const failing = enrolHarness({ recorder: pretend(`process.stderr.write("arecord: no such card\\n"); process.exit(3);`) });
  assert.equal(await runVoiceEnrol(failing.deps), 1);
  assert.equal(failing.said.at(-1), "The recording didn't work: the recorder ended by itself with code 3: arecord: no such card.");
  const broken = enrolHarness({ loadModel: async () => async () => Promise.reject(new Error("the voice model gave back something other than a voice's numbers")) });
  assert.equal(await runVoiceEnrol(broken.deps), 1);
  assert.equal(broken.said.at(-1), "The voice model couldn't run: the voice model gave back something other than a voice's numbers.");
  assert.deepEqual([busy.sent, failing.sent, broken.sent], [[], [], []]);
});

test("why a clip wasn't used says how much speech there was", () => {
  assert.equal(whyNot({ problem: "no speech", speechMs: 0 }), "No speech was heard in that one.");
  assert.equal(whyNot({ problem: "too short", speechMs: 1_000 }), "Speech was heard for only 1 second, and a clip needs at least 1.5 seconds.");
});

test("the voiceprint goes out after a line that says it follows, on one line of its own", async () => {
  const out = new PassThrough();
  let text = "";
  out.on("data", (piece: Buffer) => (text += piece.toString()));
  await sendText(out)('{"a":1}');
  assert.equal(text, 'voiceprint follows\n{"a":1}\n');
});

function checkHarness(changes: Partial<CheckDeps> = {}) {
  const said: string[] = [];
  const slept: number[] = [];
  const order: string[] = [];
  const deps: CheckDeps = {
    env: {},
    say: (line) => void said.push(line),
    loadPrint: async () => (order.push("print"), makeVoiceprint([pointing(0)], new Date("2026-11-20T10:00:00.000Z"))),
    loadModel: async () => (order.push("model"), voices(pointing(0, 1)).embedder),
    findCard: async () => (order.push("card"), card),
    setLevel: async () => void order.push("level"),
    recorder: () => (order.push("record"), pretend(speaking(1_600))()),
    sleep: async (ms) => void slept.push(ms),
    limitMs: 1_700,
    ...changes,
  };
  return { deps, said, slept, order };
}

test("a check reads the voiceprint, then the model, sets the microphone, records, and prints the score against the threshold", { timeout: 15_000 }, async () => {
  const run = checkHarness();
  assert.equal(await runVoiceCheck(run.deps), 0);
  assert.deepEqual(run.order, ["print", "model", "card", "level", "record"]);
  assert.deepEqual(run.slept, []);
  assert.equal(run.said[0], "The voiceprint was made from 1 clip on 2026-11-20.");
  assert.match(run.said[1], /^Recording 1\.7 seconds from sound card 3's microphone \(.*\)\. Talk as you would to Jarvis, or let whoever you're testing talk\.$/);
  assert.equal(run.said[2], "Score against the voiceprint: 0.71. At the threshold of 0.5, that counts as the voiceprint's voice.");
  assert.equal(run.said.length, 3);
});

test("a check uses EARS_VOICE_ID_THRESHOLD, and waits first when asked", { timeout: 15_000 }, async () => {
  const run = checkHarness({ env: { EARS_VOICE_ID_THRESHOLD: "0.75", EARS_VOICE_CHECK_WAIT: "7" } });
  assert.equal(await runVoiceCheck(run.deps), 0);
  assert.deepEqual(run.slept, [7_000]);
  assert.ok(run.said.includes("Waiting 7 seconds first."));
  assert.equal(run.said.at(-1), "Score against the voiceprint: 0.71. At the threshold of 0.75, that counts as a different voice.");
});

test("a check that hears no speech says so, and still succeeds", { timeout: 15_000 }, async () => {
  const run = checkHarness({ recorder: pretend(silent) });
  assert.equal(await runVoiceCheck(run.deps), 0);
  assert.equal(run.said.at(-1), "No speech was heard, so there was nothing to compare.");
});

test("a check with no voiceprint, a bad setting, or no model stops before anything records, saying why", { timeout: 15_000 }, async () => {
  const cases: [Partial<CheckDeps>, string][] = [
    [{ loadPrint: async () => Promise.reject(new Error("There's no voiceprint yet: make one with bash host/ears.sh voice-enrol")) }, "The check didn't start: There's no voiceprint yet: make one with bash host/ears.sh voice-enrol."],
    [{ env: { EARS_VOICE_CHECK_WAIT: "61" } }, `The check didn't start: the wait must be a whole number of seconds from 0 to 60, not "61".`],
    [{ env: { EARS_VOICE_ID_THRESHOLD: "high" } }, `The check didn't start: EARS_VOICE_ID_THRESHOLD must be a number above 0 and below 1, with up to 2 decimal places, like 0.5 or 0.45, not "high".`],
    [{ env: { EARS_MIC_BOOST: "max" } }, `The check didn't start: EARS_MIC_BOOST must be a whole number of steps from 0 to 10, or keep to leave the card's own boost, not "max".`],
    [{ loadModel: async () => Promise.reject(new Error("no model")) }, "The check didn't start: no model."],
  ];
  for (const [changes, line] of cases) {
    const run = checkHarness({ ...changes, recorder: () => assert.fail("it recorded"), sleep: async () => assert.fail("it waited") });
    assert.equal(await runVoiceCheck(run.deps), 1, line);
    assert.deepEqual(run.said, [line]);
  }
});

test("a check whose microphone is busy, or whose model fails, says so and fails", { timeout: 15_000 }, async () => {
  const busy = checkHarness({ recorder: pretend(`process.stderr.write("arecord: main:850: audio open error: Device or resource busy\\n"); process.exit(1);`) });
  assert.equal(await runVoiceCheck(busy.deps), 1);
  assert.equal(busy.said.at(-1), busyLine);
  const broken = checkHarness({ loadModel: async () => async () => Promise.reject(new Error("model broke")) });
  assert.equal(await runVoiceCheck(broken.deps), 1);
  assert.equal(broken.said.at(-1), "The voice model couldn't run: model broke.");
});

async function runProgram(file: string, env: Record<string, string>) {
  const child = spawn(process.execPath, [join(here, file)], { env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (piece) => (out += piece));
  child.stderr.on("data", (piece) => (err += piece));
  const code = await new Promise((resolve) => child.on("close", resolve));
  return { code, out, err };
}

test("run as a program, enrolment reads its settings from the environment, says what it's doing on stderr, keeps stdout for the voiceprint, and exits 1 when it can't start", { timeout: 15_000 }, async () => {
  assert.deepEqual(await runProgram("voice-enrol-run.js", { EARS_MIC_LEVEL: "loud" }), { code: 1, out: "", err: `The enrolment didn't start: EARS_MIC_LEVEL must be a whole number from 0 to 100, or keep to leave the card's own level, not "loud".\n` });
});

test("run as a program, the check reads its settings from the environment, prints on stdout, and exits 1 when it can't start", { timeout: 15_000 }, async () => {
  const result = await runProgram("voice-check-run.js", { EARS_VOICE_CHECK_WAIT: "x" });
  assert.deepEqual(result, { code: 1, out: `The check didn't start: the wait must be a whole number of seconds from 0 to 60, not "x".\n`, err: "" });
});
