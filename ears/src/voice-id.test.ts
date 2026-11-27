import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { createFbank, subtractMean } from "./fbank.js";
import { blocksRecording, checkedStarts, cosine, describeVoice, embedSpeech, findSpeech, judgeVoice, loadVoiceId, loadVoiceModel, loadVoiceprint, loadVoiceprints, longestSpeechMs, mostVoiceprints, makeVoiceprint, marginFrames, mostClips, notVoiceprint, readVoiceprint, scoreVoice, shortestSpeechMs, strangeAnswer, unit, verdicts, voiceModelName, voiceModelPath, voiceprintPath, voiceprintText, voiceSize, type Embedder, type VoiceResult } from "./voice-id.js";

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

function pointing(index: number, size = voiceSize): Float32Array {
  const vector = new Float32Array(size);
  vector[index] = 1;
  return vector;
}

function fixed(vector: Float32Array) {
  const asked: { features: Float32Array; frames: number }[] = [];
  const embedder: Embedder = async (features, frames) => {
    asked.push({ features, frames });
    return vector;
  };
  return { embedder, asked };
}

const made = "2026-11-20T10:00:00.000Z";

test("the voice model is WeSpeaker's CAM++ for English, 512 numbers to a voice, inside ears's image, and the voiceprint is one file in its own folder", () => {
  assert.deepEqual([voiceModelName, voiceSize, voiceModelPath, voiceprintPath], ["wespeaker_en_voxceleb_CAM++", 512, "/app/models/voice-id.onnx", "/voice/voiceprint.json"]);
});

test("a voice needs at least a second of speech, at most 10 seconds of it are used, a tenth of a second is kept either side, and a voiceprint has at most 20 clips", () => {
  assert.deepEqual([shortestSpeechMs, longestSpeechMs, marginFrames, mostClips], [1_000, 10_000, 1, 20]);
});

function fakeRuntime(output: Record<string, { data: unknown }>, withDefault = false) {
  const made: { created: [string, Record<string, unknown>] | null; feeds: Record<string, { type: string; data: unknown; dims: number[] }>[] } = { created: null, feeds: [] };
  class Tensor {
    constructor(
      public type: string,
      public data: unknown,
      public dims: number[],
    ) {}
  }
  let busy = false;
  const ort = {
    Tensor,
    InferenceSession: {
      async create(path: string, options: Record<string, unknown>) {
        made.created = [path, options];
        return {
          async run(feeds: Record<string, { type: string; data: unknown; dims: number[] }>) {
            assert.equal(busy, false, "the model was asked twice at once");
            busy = true;
            await new Promise((resolve) => setTimeout(resolve, 2));
            busy = false;
            made.feeds.push(feeds);
            return output;
          },
        };
      },
    },
  };
  return { made, runtime: async () => (withDefault ? { default: ort } : ort) };
}

test("loading opens the model with one thread, and each voice sends the features as one batch of frames of 80, and gives back the model's 512 numbers", async () => {
  const numbers = pointing(3);
  const { made, runtime } = fakeRuntime({ embs: { data: numbers } });
  const embed = await loadVoiceModel("/models/v.onnx", runtime);
  assert.deepEqual(made.created, ["/models/v.onnx", { intraOpNumThreads: 1, interOpNumThreads: 1, executionMode: "sequential" }]);
  const features = new Float32Array(80 * 7);
  assert.equal(await embed(features, 7), numbers);
  assert.deepEqual([made.feeds[0].feats.type, made.feeds[0].feats.dims], ["float32", [1, 7, 80]]);
  assert.equal(made.feeds[0].feats.data, features);
});

test("voices asked for at once go to the model one at a time, and one that fails doesn't stop the next", async () => {
  let calls = 0;
  const { runtime } = fakeRuntime({ embs: { data: pointing(1) } });
  const embed = await loadVoiceModel("/m.onnx", async () => {
    const ort = (await runtime()) as { InferenceSession: { create: (path: string, options: Record<string, unknown>) => Promise<{ run: (feeds: unknown) => Promise<unknown> }> } };
    const create = ort.InferenceSession.create;
    ort.InferenceSession.create = async (path, options) => {
      const session = await create(path, options);
      return { run: async (feeds) => (++calls === 1 ? Promise.reject(new Error("model broke")) : session.run(feeds)) };
    };
    return ort;
  });
  const first = embed(new Float32Array(80), 1);
  const second = embed(new Float32Array(80), 1);
  const third = embed(new Float32Array(80), 1);
  await assert.rejects(first, { message: "model broke" });
  assert.equal((await second)[1], 1);
  assert.equal((await third)[1], 1);
});

test("onnxruntime's telemetry to Microsoft is switched off before the runtime is loaded, and a CommonJS default export works the same", async () => {
  const before = process.env.ORT_DISABLE_TELEMETRY;
  delete process.env.ORT_DISABLE_TELEMETRY;
  let seen: string | undefined = "not asked";
  const { runtime } = fakeRuntime({ embs: { data: pointing(0) } }, true);
  try {
    const embed = await loadVoiceModel("/m.onnx", async () => ((seen = process.env.ORT_DISABLE_TELEMETRY), runtime()));
    assert.equal(seen, "1");
    assert.equal((await embed(new Float32Array(80), 1))[0], 1);
  } finally {
    if (before === undefined) delete process.env.ORT_DISABLE_TELEMETRY;
    else process.env.ORT_DISABLE_TELEMETRY = before;
  }
});

test("a model that gives back anything but 512 finite numbers that aren't all zero is refused", async () => {
  const nan = pointing(0);
  nan[5] = Number.NaN;
  const outputs: Record<string, { data: unknown }>[] = [{}, { embs: { data: new Float32Array(256).fill(1) } }, { embs: { data: Array.from(pointing(0)) } }, { embs: { data: nan } }, { embs: { data: new Float32Array(voiceSize) } }, { output: { data: pointing(0) } }];
  for (const output of outputs) {
    const { runtime } = fakeRuntime(output);
    const embed = await loadVoiceModel("/m.onnx", runtime);
    await assert.rejects(embed(new Float32Array(80), 1), { message: strangeAnswer }, JSON.stringify(Object.keys(output)));
  }
});

test("a voice's numbers are scaled to a length of one, and all zeros can't be", () => {
  assert.deepEqual([...unit([3, 4])], [0.6000000238418579, 0.800000011920929]);
  assert.throws(() => unit([0, 0]), { message: "a voice's numbers can't all be zero" });
});

test("the similarity of two voices is the cosine of the angle between them, from -1 to 1, and 0 against all zeros", () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([2, 0], [0, 5]), 0);
  assert.equal(cosine([1, 1], [-3, -3]), -1);
  assert.ok(Math.abs(cosine([1, 1], [1, 0]) - Math.SQRT1_2) < 1e-12);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.throws(() => cosine([1], [1, 0]), { message: "two voices' numbers can only be compared when there are as many of each" });
});

test("speech is found from the first to the last tenth of a second above ears's floor for speech, with a tenth either side, and silence or a quiet room has none", () => {
  assert.equal(findSpeech(steady(0, 3_000)), null);
  assert.equal(findSpeech(new Uint8Array(0)), null);
  assert.equal(findSpeech(steady(300, 3_000)), null);
  assert.deepEqual(findSpeech(steady(1_000, 3_000)), { from: 0, to: 30 * 3200, spanMs: 3_000 });
  assert.deepEqual(findSpeech(joined(steady(2_000, 3_000), steady(0, 50))), { from: 0, to: 30 * 3200, spanMs: 3_000 });
  const sound = joined(steady(40, 1_000), steady(2_000, 500), steady(40, 300), steady(3_000, 400), steady(40, 1_000));
  assert.deepEqual(findSpeech(sound), { from: 9 * 3200, to: 23 * 3200, spanMs: 1_200 });
  assert.deepEqual(findSpeech(joined(steady(2_000, 500), steady(0, 2_000))), { from: 0, to: 6 * 3200, spanMs: 500 });
  assert.deepEqual(findSpeech(joined(steady(0, 2_000), steady(2_000, 500))), { from: 19 * 3200, to: 25 * 3200, spanMs: 500 });
  assert.deepEqual(findSpeech(joined(steady(0, 2_000), steady(301, 100))), { from: 19 * 3200, to: 21 * 3200, spanMs: 100 });
  assert.equal(findSpeech(joined(steady(0, 2_000), steady(300, 100))), null);
});

test("no speech, or speech that spans less than a second, isn't sent to the model, saying which and how long", async () => {
  const { embedder, asked } = fixed(pointing(0));
  assert.deepEqual(await embedSpeech(steady(0, 5_000), embedder), { problem: "no speech", speechMs: 0 });
  assert.deepEqual(await embedSpeech(joined(steady(40, 2_000), steady(2_000, 900), steady(40, 2_000)), embedder), { problem: "too short", speechMs: 900 });
  assert.equal(asked.length, 0);
  const heard = await embedSpeech(joined(steady(40, 2_000), steady(2_000, 1_000), steady(40, 2_000)), embedder);
  assert.deepEqual([heard.problem, heard.speechMs], [null, 1_000]);
  assert.equal(asked.length, 1);
  assert.equal(asked[0].frames, 118);
});

test("a shorter or longer least amount of speech can be asked for", async () => {
  const { embedder } = fixed(pointing(0));
  const sound = joined(steady(40, 2_000), steady(2_000, 1_200), steady(40, 2_000));
  assert.equal((await embedSpeech(sound, embedder, 1_500)).problem, "too short");
  assert.equal((await embedSpeech(sound, embedder, 1_200)).problem, null);
});

test("the model gets the speech's features with each bin's mean taken away, and what it gives back is scaled to a length of one", async () => {
  const { embedder, asked } = fixed(Float32Array.from({ length: voiceSize }, (_, index) => (index === 0 ? 3 : index === 1 ? 4 : 0)));
  const speech = steady(2_000, 1_500);
  const sound = joined(steady(40, 1_000), speech, steady(40, 1_000));
  const heard = await embedSpeech(sound, embedder);
  assert.ok(heard.problem === null);
  assert.deepEqual([heard.vector[0], heard.vector[1]], [0.6000000238418579, 0.800000011920929]);
  const expected = createFbank()(Float64Array.from({ length: (1_700 / 1000) * 16000 }, (_, index) => (index < 1_600 || index >= 25_600 ? (index % 2 === 0 ? 40 : -40) : index % 2 === 0 ? 2_000 : -2_000)));
  assert.equal(asked[0].frames, expected.length);
  assert.deepEqual([...asked[0].features], [...subtractMean(expected)]);
});

test("only the first 10 seconds of speech go to the model, however long it went on", async () => {
  const { embedder, asked } = fixed(pointing(0));
  const heard = await embedSpeech(joined(steady(40, 1_000), steady(2_000, 20_000), steady(40, 1_000)), embedder);
  assert.equal(heard.speechMs, 20_000);
  assert.equal(asked[0].frames, 998);
});

test("a voiceprint is the average of its clips' voices, each scaled to one first, scaled to one again, and says which model, how many clips and when", () => {
  const voiceprint = makeVoiceprint([Float32Array.from(pointing(0), (value) => value * 10), pointing(1)], new Date(made));
  assert.deepEqual([voiceprint.model, voiceprint.clips, voiceprint.made], [voiceModelName, 2, made]);
  assert.ok(Math.abs(voiceprint.vector[0] - Math.SQRT1_2) < 1e-6 && Math.abs(voiceprint.vector[1] - Math.SQRT1_2) < 1e-6);
  assert.equal(voiceprint.vector.length, voiceSize);
});

test("a voiceprint needs from 1 to 20 clips, each with 512 numbers", () => {
  assert.throws(() => makeVoiceprint([], new Date(made)), { message: "a voiceprint needs at least one clip" });
  assert.throws(() => makeVoiceprint(new Array(21).fill(pointing(0)), new Date(made)), { message: "a voiceprint is made from at most 20 clips" });
  assert.equal(makeVoiceprint(new Array(20).fill(pointing(0)), new Date(made)).clips, 20);
  assert.throws(() => makeVoiceprint([pointing(0), pointing(0, 256)], new Date(made)), { message: "each clip's voice must be 512 numbers" });
});

test("a voiceprint is saved as one line of JSON with its numbers to six places, and reads back the same", () => {
  const voiceprint = makeVoiceprint([Float32Array.from({ length: voiceSize }, (_, index) => Math.sin(index + 1))], new Date(made));
  const text = voiceprintText(voiceprint);
  assert.equal(text.includes("\n"), false);
  assert.match(text, /^\{"model":"wespeaker_en_voxceleb_CAM\+\+","clips":1,"made":"2026-11-20T10:00:00\.000Z","vector":\[-?0\.\d{1,6},/);
  const back = readVoiceprint(text);
  assert.deepEqual([back.model, back.clips, back.made], [voiceprint.model, 1, made]);
  assert.ok(cosine(back.vector, voiceprint.vector) > 0.999999);
});

test("a voiceprint file that isn't one ears made is refused without saying what's in it, and one from another model says to make it again", () => {
  const good = JSON.parse(voiceprintText(makeVoiceprint([pointing(4)], new Date(made)))) as Record<string, unknown>;
  const broken: unknown[] = [
    "not json",
    "[]",
    "null",
    "7",
    { ...good, model: 5 },
    { ...good, clips: 0 },
    { ...good, clips: 21 },
    { ...good, clips: 1.5 },
    { ...good, clips: "1" },
    { ...good, made: "yesterday" },
    { ...good, made: "2026-13-45T10:00:00Z" },
    { ...good, made: 5 },
    { ...good, vector: (good.vector as number[]).slice(1) },
    { ...good, vector: [...(good.vector as number[]).slice(1), "0"] },
    { ...good, vector: new Array(voiceSize).fill(0) },
    { ...good, vector: "secret" },
    { model: voiceModelName },
  ];
  for (const item of broken) {
    const text = typeof item === "string" ? item : JSON.stringify(item);
    assert.throws(() => readVoiceprint(text), { message: notVoiceprint }, text.slice(0, 60));
  }
  assert.equal(notVoiceprint, "The voiceprint file isn't one ears made, so make it again with bash host/ears.sh voice-enrol");
  assert.throws(() => readVoiceprint(JSON.stringify({ ...good, model: "wespeaker_en_voxceleb_resnet34" })), { message: "The voiceprint was made with a different voice model from the one ears has now, so make it again with bash host/ears.sh voice-enrol" });
  assert.equal(readVoiceprint(JSON.stringify({ ...good, made: "2026-11-20T10:00:00Z" })).made, "2026-11-20T10:00:00Z");
  assert.equal(readVoiceprint(JSON.stringify({ ...good, vector: new Array(voiceSize).fill(2) })).vector[0].toFixed(4), (1 / Math.sqrt(voiceSize)).toFixed(4));
});

test("the voiceprint is read from its own folder, and a missing or unreadable one says what to do, never what's in it", async () => {
  const asked: string[] = [];
  const text = voiceprintText(makeVoiceprint([pointing(2)], new Date(made)));
  assert.equal((await loadVoiceprint(undefined, async (path) => (asked.push(path), text))).vector[2], 1);
  assert.deepEqual(asked, ["/voice/voiceprint.json"]);
  const failing = (code: string | undefined) => async () => {
    throw Object.assign(new Error("open failed for /voice/voiceprint.json"), code === undefined ? {} : { code });
  };
  await assert.rejects(loadVoiceprint("/v.json", failing("ENOENT")), { message: "There's no voiceprint yet: make one with bash host/ears.sh voice-enrol" });
  await assert.rejects(loadVoiceprint("/v.json", failing("EACCES")), { message: "Ears isn't allowed to read the voiceprint file, so make it again with bash host/ears.sh voice-enrol, as the user that runs it" });
  await assert.rejects(loadVoiceprint("/v.json", failing("EISDIR")), { message: "Couldn't read the voiceprint file (EISDIR)" });
  await assert.rejects(loadVoiceprint("/v.json", failing(undefined)), { message: "Couldn't read the voiceprint file (an unexpected error)" });
  await assert.rejects(loadVoiceprint("/v.json", async () => "{}"), { message: notVoiceprint });
});

test("the best score at or over the threshold names its voiceprint, under it nobody, and no speech or too little has no score", () => {
  assert.deepEqual(verdicts, ["match", "different", "too short", "no speech"]);
  const one = (score: number) => [{ name: "voiceprint", score }];
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, one(0.5), 0.5), { verdict: "match", score: 0.5, speechMs: 2_000, who: "voiceprint", owner: true, against: 1 });
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, one(0.4999), 0.5), { verdict: "different", score: 0.4999, speechMs: 2_000, who: null, owner: false, against: 1 });
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, one(-0.2), 0.5), { verdict: "different", score: -0.2, speechMs: 2_000, who: null, owner: false, against: 1 });
  assert.deepEqual(judgeVoice({ problem: "too short", speechMs: 600 }, one(0.9), 0.5), { verdict: "too short", score: null, speechMs: 600, who: null, owner: false });
  assert.deepEqual(judgeVoice({ problem: "no speech", speechMs: 0 }, null, 0.5), { verdict: "no speech", score: null, speechMs: 0, who: null, owner: false });
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, null, 0.5), { verdict: "no speech", score: null, speechMs: 2_000, who: null, owner: false });
  const three = [{ name: "voiceprint", score: 0.55 }, { name: "guest-a", score: 0.81 }, { name: "guest-b", score: 0.6 }];
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, three, 0.5), { verdict: "match", score: 0.81, speechMs: 2_000, who: "guest-a", owner: false, against: 3 });
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, three, 0.5, "guest-a"), { verdict: "match", score: 0.81, speechMs: 2_000, who: "guest-a", owner: true, against: 3 });
  assert.deepEqual(judgeVoice({ problem: null, speechMs: 2_000 }, three, 0.9), { verdict: "different", score: 0.81, speechMs: 2_000, who: null, owner: false, against: 3 });
});

test("a recording is scored against every voiceprint, and the best one at the threshold is who it was", async () => {
  const owner = { ...makeVoiceprint([pointing(0)], new Date(made)), name: "voiceprint" };
  const other = { ...makeVoiceprint([pointing(1)], new Date(made)), name: "visitor" };
  const sound = joined(steady(40, 1_000), steady(2_000, 1_500), steady(40, 1_000));
  const close = Float32Array.from(pointing(0), (value, index) => (index === 1 ? 1 : value));
  assert.deepEqual(await scoreVoice(sound, [owner], fixed(close).embedder, 0.7), { verdict: "match", score: cosine(unit(close), owner.vector), speechMs: 1_500, who: "voiceprint", owner: true, against: 1 });
  assert.deepEqual(await scoreVoice(sound, [owner], fixed(close).embedder, 0.71), { verdict: "different", score: cosine(unit(close), owner.vector), speechMs: 1_500, who: null, owner: false, against: 1 });
  assert.deepEqual(await scoreVoice(steady(0, 3_000), [owner], fixed(close).embedder, 0.5), { verdict: "no speech", score: null, speechMs: 0, who: null, owner: false });
  const visitorLike = Float32Array.from(pointing(1), (value, index) => (index === 2 ? 0.5 : value));
  const judged = await scoreVoice(sound, [owner, other], fixed(visitorLike).embedder, 0.5);
  assert.deepEqual([judged.who, judged.owner, judged.against, judged.score], ["visitor", false, 2, cosine(unit(visitorLike), other.vector)]);
});

test("only require blocks a recording, only one started by the wake word or as a follow-up, and only when its voice counts as a different one, was too quiet to find or couldn't be checked", () => {
  const results: (VoiceResult | null)[] = [{ verdict: "match", score: 0.8, speechMs: 2_000 }, { verdict: "different", score: 0.1, speechMs: 2_000 }, { verdict: "too short", score: null, speechMs: 500 }, { verdict: "no speech", score: null, speechMs: 0 }, null];
  assert.deepEqual(checkedStarts, ["wake", "follow"]);
  for (const by of ["wake", "follow"] as const) {
    assert.deepEqual(results.map((result) => blocksRecording("require", result, by)), [false, true, false, true, true], by);
    for (const mode of ["off", "observe"] as const) assert.deepEqual(results.map((result) => blocksRecording(mode, result, by)), [false, false, false, false, false], `${mode} ${by}`);
  }
  for (const by of ["button", "push", null] as const) for (const mode of ["off", "observe", "require"] as const) assert.deepEqual(results.map((result) => blocksRecording(mode, result, by)), [false, false, false, false, false], `${mode} ${by}`);
  for (const by of ["wake", "follow"] as const) assert.deepEqual(results.map((result) => blocksRecording("require", result, by, true)), [false, false, false, false, false], `guests ${by}`);
  assert.deepEqual(results.map((result) => blocksRecording("require", result, "wake", false)), [false, true, false, true, true]);
});

test("with voice ID off nothing is loaded, and otherwise the voiceprint is read before the model, and the check scores each recording at the threshold set", async () => {
  const order: string[] = [];
  const deps = {
    loadPrints: async () => (order.push("print"), [{ ...makeVoiceprint([pointing(0)], new Date(made)), name: "voiceprint" }]),
    loadModel: async () => (order.push("model"), fixed(pointing(0)).embedder),
  };
  assert.equal(await loadVoiceId({ mode: "off", threshold: 0.5 }, deps), null);
  assert.deepEqual(order, []);
  const check = await loadVoiceId({ mode: "observe", threshold: 0.99 }, deps);
  assert.deepEqual(order, ["print", "model"]);
  assert.deepEqual(await check?.(joined(steady(40, 1_000), steady(2_000, 1_500), steady(40, 1_000))), { verdict: "match", score: 1, speechMs: 1_500, who: "voiceprint", owner: true, against: 1 });
  const strict = await loadVoiceId({ mode: "require", threshold: 0.5 }, { ...deps, loadModel: async () => fixed(pointing(1)).embedder });
  assert.equal((await strict?.(joined(steady(40, 1_000), steady(2_000, 1_500), steady(40, 1_000))))?.verdict, "different");
});

test("voice ID that can't read its voiceprint fails to load, before loading the model", async () => {
  let loaded = false;
  await assert.rejects(
    loadVoiceId({ mode: "require", threshold: 0.5 }, { loadPrints: async () => Promise.reject(new Error("There's no voiceprint yet: make one with bash host/ears.sh voice-enrol")), loadModel: async () => ((loaded = true), fixed(pointing(0)).embedder) }),
    { message: /^There's no voiceprint yet/ },
  );
  assert.equal(loaded, false);
});

test("a result is described in one line, with the best score to two places, whose it was and what it counts as", () => {
  assert.equal(describeVoice({ verdict: "match", score: 0.7349, speechMs: 2_000, who: "voiceprint", owner: true, against: 3 }, 0.5), "Best score of 3 voiceprints: 0.73, voiceprint's. At the threshold of 0.5, that counts as voiceprint, the owner.");
  assert.equal(describeVoice({ verdict: "match", score: 0.66, speechMs: 2_000, who: "visitor", owner: false, against: 1 }, 0.5), "Best score of 1 voiceprint: 0.66, visitor's. At the threshold of 0.5, that counts as visitor.");
  assert.equal(describeVoice({ verdict: "different", score: 0.12, speechMs: 2_000, who: null, owner: false, against: 2 }, 0.45), "Best score of 2 voiceprints: 0.12. At the threshold of 0.45, that counts as nobody's voiceprint.");
  assert.equal(describeVoice({ verdict: "too short", score: null, speechMs: 600 }, 0.5), "Speech was heard for only 0.6 seconds, under the 1 second a voice needs to be compared fairly.");
  assert.equal(describeVoice({ verdict: "no speech", score: null, speechMs: 0 }, 0.5), "No speech was heard, so there was nothing to compare.");
});

const realModel = process.env.EARS_VOICE_TEST_MODEL ?? "";

test("the real model, when one is given to test with, gives the same voice for a test sound as the reference code does", { skip: realModel === "" || !existsSync(realModel) ? "no model given in EARS_VOICE_TEST_MODEL" : false, timeout: 60_000 }, async () => {
  const samples = new Float64Array(32_000);
  let seed = 7;
  for (let index = 0; index < samples.length; index++) {
    seed = (seed * 48271) % 2147483647;
    samples[index] = Math.round(Math.sin((2 * Math.PI * 300 * index) / 16000) * 4000 + Math.sin((2 * Math.PI * 1250 * index) / 16000) * 1500 + ((seed / 2147483647) * 2 - 1) * 200);
  }
  const frames = createFbank()(samples);
  const vector = unit(await (await loadVoiceModel(realModel))(subtractMean(frames), frames.length));
  const expected = [0.02045, -0.01316, 0.05715, -0.07316, 0.05421, -0.01144, 0.00596, 0.03649];
  expected.forEach((value, index) => assert.ok(Math.abs(vector[index] - value) < 2e-4, `${index}: ${vector[index]} against ${value}`));
});

test("every voiceprint in the folder is read, the owner's first, by its file's name, and only plain names count", async () => {
  const files: Record<string, string> = {
    "/v/voiceprint.json": voiceprintText(makeVoiceprint([pointing(0)], new Date(made))),
    "/v/visitor.json": voiceprintText(makeVoiceprint([pointing(1)], new Date(made))),
    "/v/a-2.json": voiceprintText(makeVoiceprint([pointing(2)], new Date(made))),
  };
  const list = async () => ["visitor.json", "voiceprint.json", "a-2.json", ".voiceprint.abc123", "Bad Name.json", "notes.txt", `${"x".repeat(21)}.json`];
  const read = async (path: string) => {
    const text = files[path];
    if (text === undefined) throw Object.assign(new Error("gone"), { code: "ENOENT" });
    return text;
  };
  const prints = await loadVoiceprints("voiceprint", "/v", list, read);
  assert.deepEqual(prints.map((print) => print.name), ["voiceprint", "a-2", "visitor"]);
  assert.deepEqual((await loadVoiceprints("visitor", "/v", list, read)).map((print) => print.name), ["visitor", "a-2", "voiceprint"]);
  await assert.rejects(loadVoiceprints("voiceprint", "/v", async () => ["visitor.json"], read), { message: "There's no voiceprint yet: make one with bash host/ears.sh voice-enrol" });
  await assert.rejects(loadVoiceprints("someone", "/v", list, read), { message: "There's no voiceprint called someone (EARS_VOICE_OWNER) yet: make one with bash host/ears.sh voice-enrol" });
  await assert.rejects(loadVoiceprints("voiceprint", "/v", async () => ["voiceprint.json", "broken.json"], async (path) => (path.endsWith("broken.json") ? "{}" : read(path))), { message: "broken's voiceprint: The voiceprint file isn't one ears made, so make it again with bash host/ears.sh voice-enrol broken" });
  const many = Array.from({ length: mostVoiceprints }, (_, n) => `p${n}.json`);
  await assert.rejects(loadVoiceprints("voiceprint", "/v", async () => ["voiceprint.json", ...many], read), { message: `There are ${mostVoiceprints + 1} voiceprints in ears/voice, and ears scores at most ${mostVoiceprints}, so forget some with bash host/ears.sh voice-forget <name>` });
});
